import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { requireNotDeleting } from "./lifecycle";
import { config, HttpError, insist, local, idPattern } from "./config";
import { getItem } from "./database";
import { allow, siteAccess } from "./access";
import {
  audit,
  event,
  key,
  list,
  message,
  now,
  put,
  read,
  transact,
  type Write,
} from "./commerce-data";
import type {
  Address,
  CartLine,
  ContentEntry,
  Customer,
  Discount,
  Market,
  Order,
  Product,
  Quote,
  StoreSettings,
  Submission,
  Variant,
} from "../src/commerce/types";
import { getConnection, refundCheckout, type Checkout } from "./payments";
import {
  confirmOrder,
  release,
  startPaidCheckout,
  sweepHolds,
} from "./store-checkout";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const currencies = new Set(["USD", "EUR", "GBP", "INR", "CAD", "AUD"]);
export function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
): string {
  insist(
    typeof value === "string" &&
      value.length <= max &&
      (optional || value.trim().length > 0),
    422,
    `Enter a valid ${label} (up to ${max} characters).`,
  );
  return value.trim();
}
export function integer(
  value: unknown,
  label: string,
  min = 0,
  max = 100_000_000,
): number {
  insist(
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max,
    422,
    `Enter a valid ${label}.`,
  );
  return value as number;
}
export function object(value: unknown): Record<string, unknown> {
  insist(
    value && typeof value === "object" && !Array.isArray(value),
    422,
    "Expected an object.",
  );
  return value as Record<string, unknown>;
}
export function email(value: unknown) {
  const result = text(value, "email address", 254).toLowerCase();
  insist(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result),
    422,
    "Enter a valid email address.",
  );
  return result;
}
function currency(value: unknown) {
  insist(
    typeof value === "string" && currencies.has(value),
    422,
    "Choose USD, EUR, GBP, INR, CAD or AUD.",
  );
  return value;
}
export async function settings(siteId: string) {
  return read<StoreSettings & { owner: string }>(siteId, "SETTINGS");
}
export async function ensureStore(actor: string, siteId: string) {
  const access = await siteAccess(actor, siteId);
  let stored = await settings(siteId);
  if (!stored) {
    allow(access, "owner");
    stored = {
      siteId,
      owner: actor,
      revision: 1,
      name: access.site.name,
      enabled: false,
      currency: "USD",
      contactEmail: "",
      markets: [
        {
          id: "default",
          name: "United States",
          currency: "USD",
          language: "en",
          countries: ["US"],
          shipping: 0,
          freeShippingFrom: 0,
          taxBasisPoints: 0,
        },
      ],
    };
    try {
      await transact([put(siteId, "SETTINGS", "", stored)]);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
      stored = await settings(siteId);
    }
  }
  insist(stored, 500, "Store could not be initialized.");
  return { access, stored };
}
export async function saveSettings(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  const { access, stored } = await ensureStore(actor, siteId);
  allow(access, "manage");
  insist(
    input.revision === stored.revision,
    409,
    "Settings changed. Refresh first.",
  );
  insist(
    Array.isArray(input.markets) &&
      input.markets.length > 0 &&
      input.markets.length <= 8,
    422,
    "Add between one and eight markets.",
  );
  const markets: Market[] = input.markets.map((raw) => {
    const m = object(raw);
    const id = text(m.id, "market ID", 40);
    insist(
      /^[a-z0-9-]+$/.test(id),
      422,
      "Market IDs use lowercase letters, numbers and hyphens.",
    );
    insist(
      Array.isArray(m.countries) &&
        m.countries.length > 0 &&
        m.countries.length <= 100 &&
        m.countries.every((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c)),
      422,
      "Use two-letter country codes.",
    );
    const language = text(m.language, "language", 10);
    insist(
      /^[a-z]{2}(?:-[A-Z]{2})?$/.test(language),
      422,
      "Use a language code such as en or fr.",
    );
    return {
      id,
      name: text(m.name, "market name", 80),
      currency: currency(m.currency),
      language,
      countries: [...new Set(m.countries as string[])],
      shipping: integer(m.shipping, "shipping amount"),
      freeShippingFrom: integer(m.freeShippingFrom, "free shipping threshold"),
      taxBasisPoints: integer(m.taxBasisPoints, "tax rate", 0, 5000),
    };
  });
  insist(
    new Set(markets.map((m) => m.id)).size === markets.length,
    422,
    "Market IDs must be unique.",
  );
  const next = {
    ...stored,
    linkFromWebsite: input.linkFromWebsite === true,
    useCatalogOnWebsite: input.useCatalogOnWebsite === true,
    name: text(input.name, "store name", 120),
    currency: currency(input.currency),
    enabled: input.enabled === true,
    contactEmail: input.contactEmail ? email(input.contactEmail) : "",
    markets,
    revision: stored.revision + 1,
  };
  await transact([
    put(siteId, "SETTINGS", "", next, stored.revision),
    audit(siteId, actor, "settings.updated", siteId),
  ]);
  return next;
}
export async function saveProduct(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  const { access } = await ensureStore(actor, siteId);
  allow(access, "edit");
  const id = input.id ? text(input.id, "product ID", 36) : randomUUID();
  insist(idPattern.test(id), 422, "Invalid product ID.");
  const previous = await read<Product>(siteId, "PRODUCT", id);
  insist(
    previous ? input.revision === previous.revision : !input.revision,
    409,
    "Product changed. Refresh first.",
  );
  if (!previous)
    insist(
      (await list<Product>(siteId, "PRODUCT")).length < 500,
      409,
      "The local catalog supports 500 products.",
    );
  insist(
    Array.isArray(input.variants) &&
      input.variants.length > 0 &&
      input.variants.length <= 50,
    422,
    "Add between one and 50 variants.",
  );
  const variants: Variant[] = input.variants.map((raw) => {
    const v = object(raw);
    const variantId = v.id ? text(v.id, "variant ID", 36) : randomUUID();
    insist(idPattern.test(variantId), 422, "Invalid variant ID.");
    const prices: Record<string, number> = {};
    for (const [code, amount] of Object.entries(object(v.prices || {})))
      prices[currency(code)] = integer(amount, "market price");
    return {
      id: variantId,
      title: text(v.title, "variant name", 80),
      sku: text(v.sku || "", "SKU", 80, true),
      stock: integer(v.stock, "stock", 0, 1_000_000),
      price: integer(v.price, "price"),
      prices,
    };
  });
  insist(
    new Set(variants.map((v) => v.id)).size === variants.length,
    422,
    "Variant IDs must be unique.",
  );
  const image = text(input.image || "", "image URL", 2000, true);
  insist(
    !image ||
      /^https:\/\/[^\s]+$/.test(image) ||
      /^\/images\/[a-zA-Z0-9._-]+$/.test(image),
    422,
    "Use an HTTPS image URL or a bundled image.",
  );
  insist(
    ["active", "draft", "archived"].includes(String(input.status)),
    422,
    "Choose a product status.",
  );
  const translations: Product["translations"] = {};
  for (const [lang, raw] of Object.entries(object(input.translations || {}))) {
    insist(
      /^[a-z]{2}(?:-[A-Z]{2})?$/.test(lang),
      422,
      "Invalid translation language.",
    );
    const t = object(raw);
    translations[lang] = {
      title: text(t.title, "translated title", 120),
      description: text(
        t.description || "",
        "translated description",
        5000,
        true,
      ),
    };
  }
  insist(
    Object.keys(translations).length <= 8,
    422,
    "Use up to eight translations.",
  );
  const product: Product = {
    id,
    revision: (previous?.revision || 0) + 1,
    title: text(input.title, "product name", 120),
    description: text(input.description || "", "description", 5000, true),
    image,
    collection: text(input.collection || "", "collection", 80, true),
    status: input.status as Product["status"],
    variants,
    translations,
    createdAt: previous?.createdAt || now(),
    updatedAt: now(),
  };
  await transact([
    put(siteId, "PRODUCT", id, product, previous?.revision),
    audit(siteId, actor, previous ? "product.updated" : "product.created", id),
  ]);
  return product;
}
export async function saveDiscount(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  const { access } = await ensureStore(actor, siteId);
  allow(access, "manage");
  const code = text(input.code, "discount code", 30).toUpperCase();
  insist(
    /^[A-Z0-9_-]+$/.test(code),
    422,
    "Discount codes use letters, numbers, hyphens and underscores.",
  );
  const previous = await read<Discount>(siteId, "DISCOUNT", code);
  insist(
    previous ? input.revision === previous.revision : !input.revision,
    409,
    "Discount changed. Refresh first.",
  );
  insist(
    input.kind === "percent" || input.kind === "fixed",
    422,
    "Choose percent or fixed.",
  );
  const expiresAt = text(input.expiresAt || "", "expiry", 30, true);
  insist(
    !expiresAt || Number.isFinite(Date.parse(expiresAt)),
    422,
    "Invalid expiry date.",
  );
  const result: Discount = {
    id: code,
    code,
    revision: (previous?.revision || 0) + 1,
    kind: input.kind,
    value: integer(
      input.value,
      "discount value",
      1,
      input.kind === "percent" ? 100 : 100_000_000,
    ),
    currency: currency(input.currency),
    minimum: integer(input.minimum || 0, "minimum spend"),
    maxUses: integer(input.maxUses || 0, "usage limit"),
    uses: previous?.uses || 0,
    expiresAt,
    active: input.active === true,
  };
  await transact([
    put(siteId, "DISCOUNT", code, result, previous?.revision),
    audit(siteId, actor, "discount.saved", code),
  ]);
  return result;
}
export async function saveContent(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  const { access } = await ensureStore(actor, siteId);
  allow(access, "edit");
  const id = input.id ? text(input.id, "entry ID", 36) : randomUUID();
  insist(idPattern.test(id), 422, "Invalid entry ID.");
  const previous = await read<ContentEntry>(siteId, "CONTENT", id);
  insist(
    previous ? previous.revision === input.revision : !input.revision,
    409,
    "Entry changed. Refresh first.",
  );
  const slug = text(input.slug, "URL slug", 100);
  insist(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
    422,
    "Use a lowercase URL slug.",
  );
  insist(
    input.status === "draft" || input.status === "published",
    422,
    "Choose draft or published.",
  );
  const item: ContentEntry = {
    id,
    revision: (previous?.revision || 0) + 1,
    title: text(input.title, "title", 160),
    slug,
    body: text(input.body, "article", 20000),
    status: input.status,
    createdAt: previous?.createdAt || now(),
    updatedAt: now(),
  };
  const writes = [
    put(siteId, "CONTENT", id, item, previous?.revision),
    audit(siteId, actor, "content.saved", id),
  ];
  if (previous?.slug !== slug) {
    writes.push(put(siteId, "SLUG", slug, { id }));
    if (previous)
      writes.push({
        Delete: {
          TableName: config.table,
          Key: key(siteId, "SLUG", previous.slug),
        },
      });
  }
  await transact(writes);
  return item;
}
export async function storefront(siteId: string) {
  const stored = await settings(siteId);
  insist(stored?.enabled, 404, "This store is not open.");
  await requireNotDeleting(stored.owner, siteId);
  // Stock held by checkouts that ran out goes back on the shelf first.
  await sweepHolds(siteId);
  const connection = await getConnection(siteId);
  const { owner: _owner, ...publicSettings } = stored;
  void _owner;
  return {
    settings: publicSettings,
    products: (await list<Product>(siteId, "PRODUCT")).filter(
      (p) => p.status === "active",
    ),
    content: (await list<ContentEntry>(siteId, "CONTENT")).filter(
      (p) => p.status === "published",
    ),
    // Checkout needs the owner's Stripe or Razorpay; locally, without one,
    // a sandbox stands in. Hosted stores have no customer sign-in yet
    // (docs/commerce.md), so the storefront doesn't offer it.
    sandbox: local && !connection,
    checkout: local || !!connection,
    accounts: local,
  };
}
export interface Cart {
  revision: number;
  lines: CartLine[];
  marketId: string;
  country: string;
  discountCode: string;
  expires: number;
  createdAt: string;
  updatedAt: string;
}
export function cartKey(token: string) {
  insist(/^[a-f0-9]{64}$/.test(token), 404, "Cart not found.");
  return digest(token);
}
export async function getCart(siteId: string, token: string) {
  await storefrontEnabled(siteId);
  const cart = await read<Cart>(siteId, "CART", cartKey(token));
  insist(
    cart && cart.expires > Math.floor(Date.now() / 1000),
    404,
    "Your cart expired. Start a new cart.",
  );
  return cart;
}
export async function storefrontEnabled(siteId: string) {
  const store = await settings(siteId);
  insist(store?.enabled, 404, "This store is not open.");
  await requireNotDeleting(store.owner, siteId);
  return store;
}
export async function saveCart(
  siteId: string,
  input: Record<string, unknown>,
  token?: string,
) {
  const store = await storefrontEnabled(siteId);
  const previous = token ? await getCart(siteId, token) : undefined;
  if (previous)
    insist(
      input.revision === previous.revision,
      409,
      "Cart changed. Refresh first.",
    );
  insist(
    Array.isArray(input.lines) && input.lines.length <= 20,
    422,
    "A cart supports up to 20 variants.",
  );
  const lines = input.lines.map((raw) => {
    const line = object(raw);
    insist(
      typeof line.productId === "string" &&
        idPattern.test(line.productId) &&
        typeof line.variantId === "string" &&
        idPattern.test(line.variantId),
      422,
      "Invalid product or variant.",
    );
    return {
      productId: line.productId,
      variantId: line.variantId,
      quantity: integer(line.quantity, "quantity", 1, 99),
    };
  });
  insist(
    new Set(lines.map((l) => `${l.productId}/${l.variantId}`)).size ===
      lines.length,
    422,
    "Combine duplicate cart lines.",
  );
  const market =
    store.markets.find((m) => m.id === input.marketId) ||
    (!input.marketId ? store.markets[0] : undefined);
  insist(market, 422, "Choose a supported market.");
  const country = text(input.country || market.countries[0], "country", 2);
  insist(
    market.countries.includes(country),
    422,
    "This country is not supported by the selected market.",
  );
  const cart: Cart = {
    revision: (previous?.revision || 0) + 1,
    lines,
    marketId: market.id,
    country,
    discountCode: text(
      input.discountCode || "",
      "discount code",
      30,
      true,
    ).toUpperCase(),
    expires: Math.floor(Date.now() / 1000) + 7 * 86400,
    createdAt: previous?.createdAt || now(),
    updatedAt: now(),
  };
  const priced = await quote(siteId, cart);
  const secret = token || randomBytes(32).toString("hex");
  await transact([
    put(siteId, "CART", cartKey(secret), cart, previous?.revision),
    ...(!previous ? [event(siteId, "cart.created")] : []),
  ]);
  return { token: secret, cart, quote: priced.quote };
}
export async function quote(siteId: string, cart: Cart) {
  const store = await storefrontEnabled(siteId);
  const market = store.markets.find((m) => m.id === cart.marketId);
  insist(
    market && market.countries.includes(cart.country),
    422,
    "This delivery destination is unavailable.",
  );
  const products = new Map<string, Product>();
  const lines = [];
  for (const line of cart.lines) {
    const product =
      products.get(line.productId) ||
      (await read<Product>(siteId, "PRODUCT", line.productId));
    insist(
      product?.status === "active",
      409,
      "A product is no longer available.",
    );
    products.set(product.id, product);
    const variant = product.variants.find((v) => v.id === line.variantId);
    insist(
      variant && variant.stock >= line.quantity,
      409,
      `${product.title} has insufficient stock.`,
    );
    const price =
      market.currency === store.currency
        ? variant.price
        : variant.prices[market.currency];
    insist(
      Number.isSafeInteger(price) && price >= 0,
      422,
      `${product.title} has no price for ${market.currency}.`,
    );
    lines.push({
      ...line,
      title: product.title,
      variant: variant.title,
      sku: variant.sku,
      unitPrice: price,
      total: price * line.quantity,
    });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  let discount = 0,
    promotion: Discount | undefined;
  if (cart.discountCode) {
    promotion = await read<Discount>(siteId, "DISCOUNT", cart.discountCode);
    insist(
      promotion?.active &&
        (!promotion.expiresAt ||
          Date.parse(promotion.expiresAt) > Date.now()) &&
        (!promotion.maxUses || promotion.uses < promotion.maxUses) &&
        subtotal >= promotion.minimum,
      422,
      "This discount is unavailable or its minimum spend is not met.",
    );
    insist(
      promotion.kind === "percent" || promotion.currency === market.currency,
      422,
      "This discount is for a different currency.",
    );
    discount = Math.min(
      subtotal,
      promotion.kind === "percent"
        ? Math.floor((subtotal * promotion.value) / 100)
        : promotion.value,
    );
  }
  const shipping =
    !lines.length ||
    (market.freeShippingFrom > 0 &&
      subtotal - discount >= market.freeShippingFrom)
      ? 0
      : market.shipping;
  const tax = Math.round(
    ((subtotal - discount + shipping) * market.taxBasisPoints) / 10000,
  );
  const result: Quote = {
    lines,
    currency: market.currency,
    marketId: market.id,
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping + tax,
    discountCode: cart.discountCode,
  };
  insist(
    Number.isSafeInteger(result.total) && result.total <= 100_000_000,
    422,
    "The order total exceeds the supported limit.",
  );
  return { quote: result, products, promotion, store };
}
export interface PrivateOrder extends Order {
  cartHash: string;
  cartRevision: number;
  receiptHash: string;
  /** The provider's checkout (Stripe Checkout Session or Razorpay payment link). */
  checkout?: Checkout;
  /** Its stock is taken and held until `holdUntil` (store-checkout.ts). */
  held?: boolean;
}
export async function checkout(siteId: string, input: Record<string, unknown>) {
  const connection = await getConnection(siteId);
  insist(
    local || connection,
    503,
    "This store can’t take payments yet. Checkout is unavailable.",
  );
  const token = text(input.token, "cart token", 64);
  const cart = await getCart(siteId, token);
  insist(cart.lines.length > 0, 422, "Add a product before checking out.");
  await sweepHolds(siteId);
  const checkoutKey = `${cartKey(token)}-${cart.revision}`;
  const prior = await read<{ orderId: string; receipt: string }>(
    siteId,
    "CHECKOUT",
    checkoutKey,
  );
  if (prior) {
    // Pressing "Pay" twice goes back to the same checkout.
    const order = await read<PrivateOrder>(siteId, "ORDER", prior.orderId);
    return order?.status === "pending" && order.checkout
      ? { ...prior, url: order.checkout.url }
      : prior;
  }
  const { quote: priced, store } = await quote(siteId, cart);
  const rawAddress = object(input.address);
  const address: Address = {
    name: text(rawAddress.name, "full name", 100),
    line1: text(rawAddress.line1, "address", 200),
    city: text(rawAddress.city, "city", 100),
    postalCode: text(rawAddress.postalCode, "postal code", 30),
    country: text(rawAddress.country, "country", 2),
  };
  insist(
    address.country === cart.country,
    422,
    "Update the cart country before checkout.",
  );
  const id = randomUUID(),
    receipt = randomBytes(32).toString("hex");
  const order: PrivateOrder = {
    ...priced,
    id,
    revision: 1,
    email: email(input.email),
    address,
    status: "pending",
    payment: "local-sandbox",
    tracking: "",
    createdAt: now(),
    updatedAt: now(),
    cartHash: cartKey(token),
    cartRevision: cart.revision,
    receiptHash: digest(receipt),
  };
  if (connection)
    return startPaidCheckout(
      siteId,
      connection.provider,
      order,
      receipt,
      checkoutKey,
      store.name,
    );
  await transact([
    put(siteId, "ORDER", id, order),
    put(siteId, "CHECKOUT", checkoutKey, { orderId: id, receipt }),
    event(siteId, "checkout.started"),
  ]);
  return { orderId: id, receipt };
}
export function publicOrder(order: PrivateOrder): Order {
  const {
    cartHash: _cart,
    cartRevision: _revision,
    receiptHash: _receipt,
    checkout,
    held: _held,
    ...result
  } = order;
  void _cart;
  void _revision;
  void _receipt;
  void _held;
  return {
    ...result,
    // While it's open, the shopper can go back to pay.
    ...(checkout && order.status === "pending" && order.held
      ? { payUrl: checkout.url }
      : {}),
  };
}
export async function receiptOrder(siteId: string, id: string, secret: string) {
  const order = await read<PrivateOrder>(siteId, "ORDER", id);
  insist(
    /^[a-f0-9]{64}$/.test(secret) && order?.receiptHash === digest(secret),
    404,
    "Order not found.",
  );
  // Back from Stripe or Razorpay: ask whether it's paid.
  return publicOrder(await confirmOrder(siteId, order));
}
export async function payLocal(
  siteId: string,
  id: string,
  input: Record<string, unknown>,
) {
  insist(local, 404, "Not found.");
  await storefrontEnabled(siteId);
  const secret = text(input.receipt, "receipt token", 64);
  await receiptOrder(siteId, id, secret);
  const order = (await read<PrivateOrder>(siteId, "ORDER", id))!;
  if (order.status !== "pending" || order.payment !== "local-sandbox")
    return publicOrder(order);
  insist(
    input.outcome === "approved" || input.outcome === "declined",
    422,
    "Choose a sandbox payment outcome.",
  );
  if (input.outcome === "declined")
    throw new HttpError(
      402,
      "Sandbox payment declined. No stock or funds were changed.",
    );
  const cart = await read<Cart>(siteId, "CART", order.cartHash);
  insist(
    cart && cart.revision === order.cartRevision,
    409,
    "Your cart changed. Check out again.",
  );
  const current = await quote(siteId, cart);
  insist(
    isDeepStrictEqual(current.quote, {
      lines: order.lines,
      currency: order.currency,
      marketId: order.marketId,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      tax: order.tax,
      total: order.total,
      discountCode: order.discountCode,
    }),
    409,
    "Prices changed. Update your cart before checking out.",
  );
  const paid = {
    ...order,
    status: "paid" as const,
    revision: order.revision + 1,
    updatedAt: now(),
  };
  const writes: Write[] = [
    put(siteId, "ORDER", id, paid, order.revision),
    put(siteId, "PAYMENT", id, {
      orderId: id,
      amount: order.total,
      currency: order.currency,
      provider: "local-sandbox",
      createdAt: now(),
    }),
    event(siteId, "order.paid"),
    message(
      siteId,
      order.email,
      `Order ${id.slice(0, 8)} confirmed`,
      `Your sandbox order has been confirmed. Total: ${(order.total / 100).toFixed(2)} ${order.currency}. No real payment was taken.`,
    ),
  ];
  for (const product of current.products.values()) {
    const variants = product.variants.map((v) => ({
      ...v,
      stock:
        v.stock -
        (order.lines.find(
          (l) => l.productId === product.id && l.variantId === v.id,
        )?.quantity || 0),
    }));
    writes.push(
      put(
        siteId,
        "PRODUCT",
        product.id,
        {
          ...product,
          variants,
          revision: product.revision + 1,
          updatedAt: now(),
        },
        product.revision,
      ),
    );
  }
  // Consuming a cart is atomic with stock and payment, preventing double purchase on retries.
  writes.push(
    put(
      siteId,
      "CART",
      order.cartHash,
      { ...cart, lines: [], revision: cart.revision + 1, updatedAt: now() },
      cart.revision,
    ),
  );
  if (current.promotion)
    writes.push(
      put(
        siteId,
        "DISCOUNT",
        current.promotion.code,
        {
          ...current.promotion,
          uses: current.promotion.uses + 1,
          revision: current.promotion.revision + 1,
        },
        current.promotion.revision,
      ),
    );
  const customerId = digest(order.email),
    previous = await read<Customer & { revision: number }>(
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
          [order.currency]:
            (previous?.spent[order.currency] || 0) + order.total,
        },
        updatedAt: now(),
        revision: (previous?.revision || 0) + 1,
      },
      previous?.revision,
    ),
  );
  writes.push(audit(siteId, "shopper", "order.paid", id));
  await transact(writes);
  return publicOrder(paid);
}
export async function orderAction(
  actor: string,
  siteId: string,
  id: string,
  input: Record<string, unknown>,
) {
  const access = await siteAccess(actor, siteId);
  allow(access, "manage");
  const order = await read<PrivateOrder>(siteId, "ORDER", id);
  insist(order, 404, "Order not found.");
  insist(
    order.revision === input.revision,
    409,
    "Order changed. Refresh first.",
  );
  const action = input.action;
  if (action === "approve-return" || action === "reject-return") {
    insist(
      order.returnRequest?.status === "requested" &&
        ["paid", "fulfilled"].includes(order.status),
      409,
      "There is no open return request.",
    );
    const next = {
      ...order,
      revision: order.revision + 1,
      updatedAt: now(),
      returnRequest: {
        ...order.returnRequest,
        status: (action === "approve-return" ? "approved" : "rejected") as
          "approved" | "rejected",
        response: text(input.response || "", "return response", 1000, true),
      },
    };
    await transact([
      put(siteId, "ORDER", id, next, order.revision),
      audit(siteId, actor, `return.${next.returnRequest.status}`, id),
      message(
        siteId,
        order.email,
        `Return ${next.returnRequest.status}`,
        `Your return request for ${id.slice(0, 8)} is ${next.returnRequest.status}. ${next.returnRequest.response}`,
      ),
    ]);
    return publicOrder(next);
  }
  // Ask Stripe or Razorpay about a pending order now.
  if (action === "check")
    return publicOrder(await confirmOrder(siteId, order));
  // A held order gives its stock back (and its checkout stops taking payment).
  if (action === "cancel" && order.status === "pending" && order.held) {
    const next = await release(siteId, id, { force: true, actor });
    insist(next, 404, "Order not found.");
    insist(
      next.status === "cancelled",
      409,
      "This order was just paid. Refund it instead.",
    );
    return publicOrder(next);
  }
  insist(
    ["fulfill", "cancel", "refund"].includes(String(action)),
    422,
    "Unknown order action.",
  );
  if (action === "fulfill")
    insist(order.status === "paid", 409, "Only paid orders can be fulfilled.");
  if (action === "cancel")
    insist(
      order.status === "pending",
      409,
      "Paid orders must be refunded, not cancelled.",
    );
  let providerRefund: { id: string; amount: number } | undefined;
  if (action === "refund") {
    insist(
      order.status === "paid" || order.status === "fulfilled",
      409,
      "Only paid orders can be refunded.",
    );
    insist(
      order.checkout || local,
      503,
      "This order wasn’t paid online, so Forma can’t refund it.",
    );
    // The money goes back through the provider it was paid with. The key
    // makes a retried refund find the first one instead of paying twice.
    if (order.checkout) {
      allow(access, "owner");
      providerRefund = await refundCheckout(
        siteId,
        order.checkout,
        order.total,
        `forma_rf_${id.replace(/-/g, "")}`,
        id.slice(0, 8).toUpperCase(),
      );
    }
  }
  const next = {
    ...order,
    ...(action === "refund" && order.returnRequest
      ? {
          returnRequest: {
            ...order.returnRequest,
            status: "refunded" as const,
          },
        }
      : {}),
    status: (action === "fulfill"
      ? "fulfilled"
      : action === "cancel"
        ? "cancelled"
        : "refunded") as Order["status"],
    tracking:
      action === "fulfill"
        ? text(input.tracking || "", "tracking reference", 200, true)
        : order.tracking,
    revision: order.revision + 1,
    updatedAt: now(),
  };
  const writes: Write[] = [
    put(siteId, "ORDER", id, next, order.revision),
    audit(siteId, actor, `order.${next.status}`, id),
    event(siteId, `order.${next.status}`),
    message(
      siteId,
      order.email,
      `Order ${id.slice(0, 8)} ${next.status}`,
      `Your ${order.checkout ? "" : "sandbox "}order is ${next.status}.${next.tracking ? ` Tracking: ${next.tracking}` : ""}`,
    ),
  ];
  if (action === "refund") {
    writes.push(
      put(siteId, "REFUND", id, {
        orderId: id,
        amount: order.total,
        currency: order.currency,
        ...(providerRefund
          ? { provider: order.payment, providerId: providerRefund.id }
          : {}),
        createdAt: now(),
      }),
    );
    if (input.restock === true) {
      for (const productId of new Set(order.lines.map((l) => l.productId))) {
        const product = await read<Product>(siteId, "PRODUCT", productId);
        insist(
          product,
          409,
          "A product is missing; refund without restocking.",
        );
        const orderLines = order.lines.filter((l) => l.productId === productId);
        insist(
          orderLines.every((line) =>
            product.variants.some((v) => v.id === line.variantId),
          ),
          409,
          "A variant was removed; refund without restocking.",
        );
        writes.push(
          put(
            siteId,
            "PRODUCT",
            productId,
            {
              ...product,
              revision: product.revision + 1,
              updatedAt: now(),
              variants: product.variants.map((v) => ({
                ...v,
                stock:
                  v.stock +
                  (orderLines.find((l) => l.variantId === v.id)?.quantity || 0),
              })),
            },
            product.revision,
          ),
        );
      }
    }
    const customerId = digest(order.email),
      customer = await read<Customer & { revision: number }>(
        siteId,
        "CUSTOMER",
        customerId,
      );
    if (customer)
      writes.push(
        put(
          siteId,
          "CUSTOMER",
          customerId,
          {
            ...customer,
            spent: {
              ...customer.spent,
              [order.currency]: Math.max(
                0,
                (customer.spent[order.currency] || 0) - order.total,
              ),
            },
            revision: customer.revision + 1,
            updatedAt: now(),
          },
          customer.revision,
        ),
      );
  }
  await transact(writes);
  return publicOrder(next);
}
export async function requestReturn(
  siteId: string,
  id: string,
  reason: unknown,
  credentials: { receipt?: string; email?: string },
) {
  const order = await read<PrivateOrder>(siteId, "ORDER", id);
  insist(
    order &&
      ((credentials.email && order.email === credentials.email) ||
        (credentials.receipt &&
          digest(credentials.receipt) === order.receiptHash)),
    404,
    "Order not found.",
  );
  insist(
    ["paid", "fulfilled"].includes(order.status),
    409,
    "This order cannot be returned.",
  );
  insist(
    !order.returnRequest,
    409,
    "This order already has a return request. Contact the store for assistance.",
  );
  const next: PrivateOrder = {
    ...order,
    revision: order.revision + 1,
    updatedAt: now(),
    returnRequest: {
      reason: text(reason, "return reason", 1000),
      status: "requested",
      createdAt: now(),
    },
  };
  await transact([
    put(siteId, "ORDER", id, next, order.revision),
    audit(siteId, "shopper", "return.requested", id),
    message(
      siteId,
      order.email,
      `Return requested for ${id.slice(0, 8)}`,
      "Your return request has been received. The store will review it before any refund is issued.",
    ),
  ]);
  return publicOrder(next);
}
export async function unsubscribe(
  siteId: string,
  input: Record<string, unknown>,
) {
  const token = text(input.token, "unsubscribe token", 64);
  insist(/^[a-f0-9]{64}$/.test(token), 422, "Invalid unsubscribe link.");
  const record = await read<{ submissionId: string }>(
    siteId,
    "UNSUBSCRIBE",
    digest(token),
  );
  if (!record) return { ok: true };
  const item = await read<Submission & { revision: number }>(
    siteId,
    "SUBMISSION",
    record.submissionId,
  );
  if (!item?.consent) return { ok: true };
  await transact([
    put(
      siteId,
      "SUBMISSION",
      item.id,
      { ...item, consent: false, revision: item.revision + 1 },
      item.revision,
    ),
    {
      Delete: {
        TableName: config.table,
        Key: key(siteId, "UNSUBSCRIBE", digest(token)),
      },
    },
  ]);
  return { ok: true };
}
export async function submitForm(
  siteId: string,
  input: Record<string, unknown>,
) {
  const store = await storefrontEnabled(siteId);
  insist(
    input.kind === "contact" || input.kind === "newsletter",
    422,
    "Choose contact or newsletter.",
  );
  insist(!input.website, 422, "Submission rejected.");
  insist(
    input.kind !== "newsletter" || input.consent === true,
    422,
    "Consent is required to subscribe.",
  );
  const address = email(input.email);
  const item: Submission = {
    id: input.kind === "newsletter" ? digest(address) : randomUUID(),
    kind: input.kind,
    email: address,
    name: text(input.name || "", "name", 100, true),
    message: text(
      input.message || "",
      "message",
      5000,
      input.kind === "newsletter",
    ),
    consent: input.consent === true,
    createdAt: now(),
  };
  const previous =
    input.kind === "newsletter"
      ? await read<Submission & { revision?: number }>(
          siteId,
          "SUBMISSION",
          item.id,
        )
      : undefined;
  if (previous?.consent) return { ok: true };
  const writes = [
    put(
      siteId,
      "SUBMISSION",
      item.id,
      { ...item, revision: (previous?.revision || 0) + 1 },
      previous?.revision,
    ),
    event(siteId, "form.submitted"),
  ];
  // The store's contact email hears about new messages.
  if (input.kind === "contact" && store.contactEmail)
    writes.push(
      message(
        siteId,
        store.contactEmail,
        `New message from ${item.name || item.email}`,
        `${item.message}\n\nReply to ${item.email}.`,
      ),
    );
  if (input.kind === "newsletter") {
    const token = randomBytes(32).toString("hex");
    writes.push(
      put(siteId, "UNSUBSCRIBE", digest(token), { submissionId: item.id }),
    );
    writes.push(
      message(
        siteId,
        address,
        "Your newsletter subscription",
        `You opted in to this store's updates. Unsubscribe at ${config.editorOrigin}/store?site=${siteId}&unsubscribe=${token}`,
      ),
    );
  }
  await transact(writes);
  return { ok: true };
}
export async function addMember(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  insist(
    local,
    503,
    "Cloud invitations require a configured identity provider.",
  );
  const access = await siteAccess(actor, siteId);
  allow(access, "owner");
  const address = email(input.email);
  const user = await getItem<{ id: string }>(`EMAIL#${address}`, "USER");
  insist(
    user && user.id !== actor,
    422,
    "Create the collaborator's local account first, then add their email.",
  );
  insist(
    ["manager", "editor", "viewer"].includes(String(input.role)),
    422,
    "Choose manager, editor or viewer.",
  );
  await transact([
    {
      Put: {
        TableName: config.table,
        Item: {
          pk: `USER#${user.id}`,
          sk: `ACCESS#${siteId}`,
          owner: access.owner,
          siteId,
          role: input.role,
        },
      },
    },
    {
      Put: {
        TableName: config.table,
        Item: {
          ...key(siteId, "MEMBER", user.id),
          id: user.id,
          email: address,
          role: input.role,
        },
      },
    },
    audit(siteId, actor, "member.added", user.id),
    message(
      siteId,
      address,
      `Access to ${access.site.name}`,
      `You have ${String(input.role)} access to this local workspace.`,
    ),
  ]);
  return { ok: true };
}
export async function removeMember(
  actor: string,
  siteId: string,
  memberId: string,
) {
  const access = await siteAccess(actor, siteId);
  allow(access, "owner");
  insist(idPattern.test(memberId), 422, "Invalid member.");
  await transact([
    {
      Delete: {
        TableName: config.table,
        Key: { pk: `USER#${memberId}`, sk: `ACCESS#${siteId}` },
      },
    },
    {
      Delete: { TableName: config.table, Key: key(siteId, "MEMBER", memberId) },
    },
    audit(siteId, actor, "member.removed", memberId),
  ]);
  return { ok: true };
}
