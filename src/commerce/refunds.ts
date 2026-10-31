import type { Order } from "./types";

/**
 * What refunding these items (and shipping) comes to: their price less
 * their share of the discount, plus their share of the tax.
 */
export function refundAmount(
  order: Pick<Order, "lines" | "subtotal" | "discount" | "shipping" | "tax">,
  lines: { variantId: string; quantity: number }[],
  shipping: boolean,
) {
  const value = lines.reduce(
    (t, l) =>
      t +
      (order.lines.find((o) => o.variantId === l.variantId)?.unitPrice ?? 0) *
        l.quantity,
    0,
  );
  const discount = order.subtotal
    ? Math.round((order.discount * value) / order.subtotal)
    : 0;
  const taxable = value - discount + (shipping ? order.shipping : 0);
  const base = order.subtotal - order.discount + order.shipping;
  const tax = base ? Math.round((order.tax * taxable) / base) : 0;
  return taxable + tax;
}
