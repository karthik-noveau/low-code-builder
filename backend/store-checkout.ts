/**
 * Store checkout through the owner's Stripe or Razorpay (backend/payments.ts).
 *
 * Starting checkout takes the stock off at once and holds it for
 * HOLD_MINUTES; the provider's checkout is made for the order's exact total.
 * The order is paid only when the provider says so, asked directly: when the
 * shopper comes back, when a webhook says which checkout to look at, or when
 * the owner checks. A hold that runs out unpaid is cancelled at the provider
 * and its stock returned, lazily, whenever the store is used. A payment that
 * still lands after that takes the stock again if it's there; otherwise the
 * order is paid but flagged short, for the owner to refund.
 */
import { config, HttpError, insist } from "./config";
import {
  audit,
  event,
  list,
  message,
  now,
  put,
  read,
  transact,
  key,
  type Write,
} from "./commerce-data";
import {
  cancelCheckout,
  checkoutPaid,
  createCheckout,
  type Checkout,
  type PaymentNotice,
  type ProviderId,
} from "./payments";
import type { Cart, PrivateOrder } from "./commerce";
import { digest, publicOrder } from "./commerce";
import type { Customer, Discount, Product } from "../src/commerce/types";

export const HOLD_MINUTES = 15;
interface Hold {
  orderId: string;
  until: string;
}
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);
const ref = (id: string) => id.slice(0, 8).toUpperCase();
const remove = (siteId: string, kind: string, id: string): Write => ({
  Delete: { TableName: config.table, Key: key(siteId, kind, id) },
});

/** Each line's quantity, per product and variant. */
function taken(order: PrivateOrder) {
  const out = new Map<string, Map<string, number>>();
  for (const l of order.lines) {
    const p = out.get(l.productId) ?? new Map<string, number>();
    p.set(l.variantId, (p.get(l.variantId) ?? 0) + l.quantity);
    out.set(l.productId, p);
  }
  return out;
}
/**
 * Writes that move an order's stock: `sign` -1 takes it, +1 gives it back.
 * Taking fails (null) when a variant no longer has enough.
 */
async function stockWrites(
  siteId: string,
  order: PrivateOrder,
  sign: -1 | 1,
): Promise<Write[] | null> {
  const writes: Write[] = [];
  for (const [productId, variants] of taken(order)) {
    const product = await read<Product>(siteId, "PRODUCT", productId);
    // Gone since: nothing to return it to; taking can't succeed.
    if (!product) {
      if (sign < 0) return null;
      continue;
    }
    let short = false;
    const next = product.variants.map((v) => {
      const q = variants.get(v.id);
      if (!q) return v;
      const stock = v.stock + sign * q;
      if (stock < 0) short = true;
      return { ...v, stock };
    });
    if (short) return null;
    writes.push(
      put(
        siteId,
        "PRODUCT",
        productId,
        { ...product, variants: next, revision: product.revision + 1, updatedAt: now() },
        product.revision,
      ),
    );
  }
  return writes;
}
async function discountWrite(
  siteId: string,
  code: string,
  change: 1 | -1,
): Promise<Write[]> {
  if (!code) return [];
  const d = await read<Discount>(siteId, "DISCOUNT", code);
  if (!d) return [];
  return [
    put(
      siteId,
      "DISCOUNT",
      code,
      { ...d, uses: Math.max(0, d.uses + change), revision: d.revision + 1 },
      d.revision,
    ),
  ];
}

/**
 * The provider half of checkout: `order` is new and pending (commerce.ts
 * checked the cart, prices and address). Holds its stock, then makes the
 * provider's checkout; if the provider fails, the stock goes straight back.
 */
export async function startPaidCheckout(
  siteId: string,
  provider: ProviderId,
  order: PrivateOrder,
  receipt: string,
  checkoutKey: string,
  storeName: string,
) {
  const until = minutesFromNow(HOLD_MINUTES);
  const held: PrivateOrder = {
    ...order,
    payment: provider,
    held: true,
    holdUntil: until.toISOString(),
  };
  const stock = await stockWrites(siteId, held, -1);
  insist(stock, 409, "Some items just sold out. Update your cart.");
  await transact([
    put(siteId, "ORDER", held.id, held),
    put(siteId, "CHECKOUT", checkoutKey, { orderId: held.id, receipt }),
    put(siteId, "HOLD", held.id, { orderId: held.id, until: held.holdUntil }),
    ...stock,
    ...(await discountWrite(siteId, held.discountCode, 1)),
    event(siteId, "checkout.started"),
  ]);
  let made: Checkout | null = null;
  try {
    made = await createCheckout(siteId, {
      requestId: held.id,
      reference: ref(held.id),
      amount: held.total,
      currency: held.currency,
      description: `Order ${ref(held.id)} · ${storeName}`.slice(0, 120),
      name: held.address.name,
      email: held.email,
      returnUrl: `${config.editorOrigin}/store?site=${siteId}&order=${held.id}`,
      // Stripe keeps a checkout open 30 minutes at least, Razorpay 15; the
      // hold's end cancels it either way.
      expiresAt: Math.floor(
        minutesFromNow(provider === "stripe" ? 31 : HOLD_MINUTES + 1).getTime() / 1000,
      ),
      kind: "order",
    });
  } catch (error) {
    await release(siteId, held.id, { force: true, unpaid: true }).catch(() => undefined);
    throw error;
  }
  if (!made) {
    await release(siteId, held.id, { force: true, unpaid: true }).catch(() => undefined);
    throw new HttpError(503, "This store can’t take payments right now.");
  }
  const withCheckout: PrivateOrder = {
    ...held,
    checkout: made,
    revision: held.revision + 1,
    updatedAt: now(),
  };
  await transact([put(siteId, "ORDER", held.id, withCheckout, held.revision)]);
  return { orderId: held.id, receipt, url: made.url };
}

/**
 * Lets go of an order's hold. Unless `force`, only once it has run out; and
 * unless `unpaid` (the checkout was never made), the provider is asked first,
 * so a payment that just landed is kept instead of cancelled.
 */
export async function release(
  siteId: string,
  orderId: string,
  o: { force?: boolean; unpaid?: boolean; actor?: string } = {},
): Promise<PrivateOrder | undefined> {
  const order = await read<PrivateOrder>(siteId, "ORDER", orderId);
  if (!order || order.status !== "pending" || !order.held) {
    await transact([remove(siteId, "HOLD", orderId)]).catch(() => undefined);
    return order;
  }
  if (!o.force && Date.parse(order.holdUntil ?? "") > Date.now()) return order;
  if (!o.unpaid && order.checkout) {
    if (await checkoutPaid(siteId, order.checkout, order.total))
      return markPaid(siteId, order);
    // Refused usually means it was paid a moment ago.
    if (!(await cancelCheckout(siteId, order.checkout))) {
      if (await checkoutPaid(siteId, order.checkout, order.total))
        return markPaid(siteId, order);
    }
  }
  const next: PrivateOrder = {
    ...order,
    status: "cancelled",
    held: false,
    expired: !o.actor,
    revision: order.revision + 1,
    updatedAt: now(),
  };
  const back = (await stockWrites(siteId, order, 1)) ?? [];
  await transact([
    put(siteId, "ORDER", orderId, next, order.revision),
    ...back,
    ...(await discountWrite(siteId, order.discountCode, -1)),
    remove(siteId, "HOLD", orderId),
    // The same cart can check out again.
    remove(siteId, "CHECKOUT", `${order.cartHash}-${order.cartRevision}`),
    o.actor
      ? audit(siteId, o.actor, "order.cancelled", orderId)
      : event(siteId, "checkout.expired"),
  ]);
  return next;
}

/** Returns the stock of holds that have run out (a few at a time). */
export async function sweepHolds(siteId: string) {
  const holds = await list<Hold>(siteId, "HOLD").catch(() => [] as Hold[]);
  const due = holds
    .filter((h) => Date.parse(h.until) <= Date.now())
    .slice(0, 5);
  for (const h of due)
    await release(siteId, h.orderId).catch((error) =>
      console.error("hold_release_failed", siteId, h.orderId, String(error)),
    );
}

/** Asks the provider about a pending order and records it paid if it is. */
export async function confirmOrder(siteId: string, order: PrivateOrder) {
  if (order.status !== "pending" || !order.checkout) return order;
  if (await checkoutPaid(siteId, order.checkout, order.total))
    return markPaid(siteId, order);
  // Unpaid and out of time: let the stock go now rather than on a sweep.
  if (order.held && Date.parse(order.holdUntil ?? "") <= Date.now())
    return (await release(siteId, order.id)) ?? order;
  return order;
}

async function markPaid(
  siteId: string,
  order: PrivateOrder,
  attempt = 0,
): Promise<PrivateOrder> {
  // A hold that ran out gave its stock back: take it again if it's there.
  let stock: Write[] = [];
  let short = false;
  if (!order.held) {
    const again = await stockWrites(siteId, order, -1);
    if (again) stock = [...again, ...(await discountWrite(siteId, order.discountCode, 1))];
    else short = true;
  }
  const paid: PrivateOrder = {
    ...order,
    status: "paid",
    held: false,
    ...(short ? { stockShort: true } : {}),
    revision: order.revision + 1,
    updatedAt: now(),
  };
  const writes: Write[] = [
    put(siteId, "ORDER", order.id, paid, order.revision),
    remove(siteId, "HOLD", order.id),
    ...stock,
    put(siteId, "PAYMENT", order.id, {
      orderId: order.id,
      amount: order.total,
      currency: order.currency,
      provider: order.payment,
      checkout: order.checkout?.id,
      createdAt: now(),
    }),
    event(siteId, "order.paid"),
    audit(siteId, "shopper", short ? "order.paid_short" : "order.paid", order.id),
    message(
      siteId,
      order.email,
      `Order ${ref(order.id)} confirmed`,
      `Thank you. Your payment of ${(order.total / 100).toFixed(2)} ${order.currency} was received.`,
    ),
  ];
  // Empty the cart that was bought, unless the shopper has changed it since.
  const cart = await read<Cart>(siteId, "CART", order.cartHash);
  if (cart && cart.revision === order.cartRevision)
    writes.push(
      put(
        siteId,
        "CART",
        order.cartHash,
        { ...cart, lines: [], revision: cart.revision + 1, updatedAt: now() },
        cart.revision,
      ),
    );
  const customerId = digest(order.email);
  const previous = await read<Customer & { revision: number }>(
    siteId,
    "CUSTOMER",
    customerId,
  );
  writes.push(
    put(
      siteId,
      "CUSTOMER",
      customerId,
      {
        id: customerId,
        email: order.email,
        name: order.address.name,
        orders: (previous?.orders || 0) + 1,
        spent: {
          ...previous?.spent,
          [order.currency]: (previous?.spent[order.currency] || 0) + order.total,
        },
        updatedAt: now(),
        revision: (previous?.revision || 0) + 1,
      },
      previous?.revision,
    ),
  );
  try {
    await transact(writes);
    return paid;
  } catch (error) {
    // Someone else moved it first (a webhook and the shopper at once, or a
    // stock change): look again.
    if (attempt > 1 || !(error instanceof HttpError) || error.status !== 409) throw error;
    const fresh = await read<PrivateOrder>(siteId, "ORDER", order.id);
    if (!fresh || fresh.status !== "pending") return fresh ?? paid;
    return markPaid(siteId, fresh, attempt + 1);
  }
}

/** A verified payment notification: check that order with the provider. */
export async function onPaymentNotice(notice: PaymentNotice) {
  if (notice.kind !== "order") return;
  const order = await read<PrivateOrder>(notice.siteId, "ORDER", notice.id);
  if (!order || order.checkout?.id !== notice.checkoutId) return;
  await confirmOrder(notice.siteId, order);
}

export { publicOrder };
