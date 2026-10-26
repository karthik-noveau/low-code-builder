/**
 * Plain-language names for the raw values the store keeps (statuses, kinds,
 * roles, activity actions), so every screen describes them the same way.
 */
const titleCase = (value: string) =>
  value.replace(/[._-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const statuses: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid · not shipped",
  fulfilled: "Shipped",
  refunded: "Refunded",
  cancelled: "Cancelled",
  contact: "Contact message",
  newsletter: "Newsletter signup",
};
/** An order, product, article or submission status, a submission kind, or a team role. */
export const statusLabel = (value: string) =>
  statuses[value] || titleCase(value);

const returns: Record<string, string> = {
  requested: "Return requested",
  approved: "Return approved",
  rejected: "Return declined",
  refunded: "Return refunded",
};
export const returnLabel = (value: string) =>
  returns[value] || `Return ${value}`;

const actions: Record<string, string> = {
  "settings.updated": "Changed store settings",
  "product.created": "Added a product",
  "product.updated": "Edited a product",
  "discount.saved": "Saved a discount",
  "content.saved": "Saved an article",
  "integration.saved": "Saved an integration",
  "order.paid": "Order paid",
  "order.fulfilled": "Order shipped",
  "order.refunded": "Order refunded",
  "order.cancelled": "Order cancelled",
  "return.requested": "Return requested",
  "return.approved": "Return approved",
  "return.rejected": "Return declined",
  "return.refunded": "Return refunded",
  "member.added": "Added a collaborator",
  "member.removed": "Removed a collaborator",
};
/** An activity record's action, e.g. `order.paid` → "Order paid". */
export const activityLabel = (action: string) =>
  actions[action] || titleCase(action);

/** Order numbers are the first eight characters of the order's ID. */
export const orderNumber = (id: string) => `#${id.slice(0, 8)}`;
