export interface Variant {
  id: string;
  title: string;
  sku: string;
  stock: number;
  price: number;
  prices: Record<string, number>;
}
export interface Product {
  id: string;
  revision: number;
  title: string;
  description: string;
  image: string;
  collection: string;
  status: "active" | "draft" | "archived";
  variants: Variant[];
  translations: Record<string, { title: string; description: string }>;
  createdAt: string;
  updatedAt: string;
}
export interface Market {
  id: string;
  name: string;
  currency: string;
  language: string;
  countries: string[];
  shipping: number;
  freeShippingFrom: number;
  taxBasisPoints: number;
}
export interface StoreSettings {
  linkFromWebsite?: boolean;
  useCatalogOnWebsite?: boolean;
  siteId: string;
  revision: number;
  name: string;
  enabled: boolean;
  currency: string;
  markets: Market[];
  contactEmail: string;
}
export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}
export interface PricedLine extends CartLine {
  title: string;
  variant: string;
  sku: string;
  unitPrice: number;
  total: number;
}
export interface Quote {
  lines: PricedLine[];
  currency: string;
  marketId: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  discountCode: string;
}
export interface Address {
  name: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}
export interface Order extends Quote {
  returnRequest?: {
    reason: string;
    status: "requested" | "approved" | "rejected" | "refunded";
    createdAt: string;
    response?: string;
  };
  id: string;
  revision: number;
  email: string;
  address: Address;
  status: "pending" | "paid" | "fulfilled" | "cancelled" | "refunded";
  /** How it's paid: the local sandbox, or the owner's Stripe or Razorpay. */
  payment: "local-sandbox" | "stripe" | "razorpay";
  /** Until when its stock is held for the shopper to pay. */
  holdUntil?: string;
  /** Where the shopper pays, while the hold lasts. */
  payUrl?: string;
  /** The hold ran out before payment; its stock went back. */
  expired?: boolean;
  /** Paid after its hold ran out, when the stock had gone: refund it. */
  stockShort?: boolean;
  /** Money given back, oldest first; the order is "refunded" once they add up to its total. */
  refunds?: OrderRefund[];
  tracking: string;
  createdAt: string;
  updatedAt: string;
}
export interface OrderRefund {
  amount: number;
  /** Items refunded (by variant), with how many. */
  lines: { variantId: string; quantity: number }[];
  shipping: boolean;
  /** Their stock went back on the shelf. */
  restocked: boolean;
  createdAt: string;
  /** The provider's refund id, for online payments. */
  providerId?: string;
}
export interface Discount {
  id: string;
  code: string;
  revision: number;
  kind: "percent" | "fixed";
  value: number;
  currency: string;
  minimum: number;
  maxUses: number;
  uses: number;
  expiresAt: string;
  active: boolean;
}
export interface ContentEntry {
  id: string;
  revision: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
}
export interface Customer {
  id: string;
  email: string;
  name: string;
  orders: number;
  spent: Record<string, number>;
  updatedAt: string;
}
export interface Submission {
  id: string;
  name: string;
  email: string;
  message: string;
  kind: "contact" | "newsletter";
  consent: boolean;
  createdAt: string;
}
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
}
export interface OutboxMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  /** "local-preview" without an email sender; otherwise how sending went. */
  status: "local-preview" | "pending" | "sending" | "sent" | "failed" | "undeliverable";
  sentAt?: string;
}
export interface Member {
  id: string;
  email: string;
  role: "manager" | "editor" | "viewer";
}
export interface Integration {
  id: string;
  revision: number;
  name: string;
  events: string[];
  enabled: boolean;
}
export interface CommerceOverview {
  settings: StoreSettings;
  products: Product[];
  orders: Order[];
  customers: Customer[];
  discounts: Discount[];
  content: ContentEntry[];
  submissions: Submission[];
  audit: AuditEvent[];
  outbox: OutboxMessage[];
  members: Member[];
  integrations: Integration[];
  role: "owner" | Member["role"];
  usage: {
    products: number;
    orders: number;
    submissions: number;
    storageBytes: number;
    currencyTotals: Record<string, number>;
  };
  analytics: {
    events: Record<string, number>;
    paidOrders: number;
    returningCustomers: number;
  };
}
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    amount / 100,
  );
