/**
 * Getting paid without a payment provider. The owner lists how visitors can
 * pay — a UPI ID, bank transfer details, a payment link from any provider
 * (Stripe, Razorpay, PayPal…) or in person. After an order, booking or RSVP,
 * visitors see the amount, a reference and these options; the owner marks
 * the request paid in the Inbox. No fees and nothing to connect.
 * Shared by the editor, the static renderer and the backend.
 */
import type { InboxRequest, RequestFieldId, RequestKind } from "./requests";

export interface PaymentSettings {
  /** UPI ID, e.g. name@bank. */
  upi: string;
  /** Name UPI apps show to the payer. */
  payee: string;
  /** Bank transfer details, shown as written. */
  bank: string;
  /** An https payment link from any provider. */
  link: string;
  /** How to pay in person, e.g. "Pay at the counter"; empty hides it. */
  inPerson: string;
  note: string;
  /**
   * The owner's connected Stripe or Razorpay account, if any. Only a hint for
   * the editor and pages: the server checks the real connection.
   */
  online?: "" | "stripe" | "razorpay";
}
type TextSetting = Exclude<keyof PaymentSettings, "online">;
export const PAYMENT_LIMITS: Record<TextSetting, number> = {
  upi: 100,
  payee: 80,
  bank: 600,
  link: 500,
  inPerson: 120,
  note: 300,
};
export const emptyPayments = (): PaymentSettings => ({
  upi: "",
  payee: "",
  bank: "",
  link: "",
  inPerson: "",
  note: "",
});
const upiPattern = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const linkPattern = /^https:\/\/[^\s<>"']{4,}$/;

/**
 * Shape only. Formats are checked by `paymentProblems` instead, so a
 * half-typed UPI ID is still a valid project and can be saved.
 */
export function validatePayments(value: unknown): value is PaymentSettings {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    (Object.keys(PAYMENT_LIMITS) as TextSetting[]).every(
      (k) => typeof p[k] === "string" && p[k].length <= PAYMENT_LIMITS[k],
    ) &&
    (p.online === undefined ||
      ["", "stripe", "razorpay"].includes(p.online as string))
  );
}
/** What's wrong with the settings, keyed by field, in words for the owner. */
export function paymentProblems(
  p: PaymentSettings,
): Partial<Record<keyof PaymentSettings, string>> {
  const problems: Partial<Record<keyof PaymentSettings, string>> = {};
  if (p.upi && !upiPattern.test(p.upi.trim()))
    problems.upi = "Use a UPI ID such as yourname@okbank.";
  if (p.link && !linkPattern.test(p.link.trim()))
    problems.link = "Use a full link starting with https://.";
  return problems;
}
/** The methods visitors can actually use: badly formatted ones are left out. */
export function usablePayments(p?: PaymentSettings): PaymentSettings | null {
  if (!p) return null;
  const problems = paymentProblems(p);
  const usable: PaymentSettings = {
    upi: problems.upi ? "" : p.upi.trim(),
    payee: p.payee.trim(),
    bank: p.bank.trim(),
    link: problems.link ? "" : p.link.trim(),
    inPerson: p.inPerson.trim(),
    note: p.note.trim(),
    online: p.online ?? "",
  };
  return usable.upi ||
    usable.bank ||
    usable.link ||
    usable.inPerson ||
    usable.online
    ? usable
    : null;
}

/** Kinds that can ask for payment, and the field that multiplies the price. */
export const PAYABLE_KINDS: Partial<
  Record<RequestKind, RequestFieldId | null>
> = { order: "quantity", book: null, rsvp: "guests" };
export const canCollect = (kind: RequestKind) => kind in PAYABLE_KINDS;

/** A price as typed by the owner ("1,299", "24.50", "$12") in minor units. */
export function parseAmount(price: string | undefined): number | null {
  const cleaned = (price ?? "").replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 100_000_000_00 ? cents : null;
}
/** What a request costs: the item price times quantity or guests. */
export function requestAmount(
  kind: RequestKind,
  unit: number | null,
  fields: Partial<Record<RequestFieldId, string>>,
): number | null {
  if (unit === null || !canCollect(kind)) return null;
  const by = PAYABLE_KINDS[kind];
  const count = by ? Number(fields[by] || 1) : 1;
  return Number.isInteger(count) && count > 0 ? unit * count : null;
}
export const formatAmount = (cents: number, currency: string) =>
  `${currency}${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
export const isRupee = (currency: string) =>
  /^(₹|rs\.?|inr)$/i.test(currency.trim());
/** A short code visitors add to their payment so the owner can match it. */
export const paymentReference = (requestId: string) =>
  (requestId.split("-")[1] ?? requestId).slice(0, 8).toUpperCase();
/** Opens the visitor's UPI app with the payee, reference and (in rupees) the amount. */
export function upiLink(
  p: PaymentSettings,
  amount: number | null,
  currency: string,
  reference: string,
) {
  const query = new URLSearchParams({ pa: p.upi });
  if (p.payee) query.set("pn", p.payee);
  query.set("tn", reference);
  if (amount !== null && isRupee(currency)) {
    query.set("am", (amount / 100).toFixed(2));
    query.set("cu", "INR");
  }
  return `upi://pay?${query.toString().replace(/\+/g, "%20")}`;
}

type RequestPayment = NonNullable<InboxRequest["payment"]>;
/**
 * How much to give back, in minor units: the whole payment unless a smaller
 * amount is asked for. Only paid payments with a known amount, refunded once.
 */
export function refundAmount(
  payment: RequestPayment,
  asked?: unknown,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (payment.status === "refunded" || payment.refund?.refundedAt)
    return { ok: false, error: "This payment was already refunded." };
  if (payment.status !== "paid")
    return { ok: false, error: "Only paid requests can be refunded." };
  if (payment.amount === null)
    return { ok: false, error: "This request has no amount to refund." };
  if (asked === undefined || asked === null) return { ok: true, amount: payment.amount };
  if (!Number.isInteger(asked) || (asked as number) <= 0)
    return { ok: false, error: "Enter an amount to refund." };
  if ((asked as number) > payment.amount)
    return {
      ok: false,
      error: `You can refund at most ${formatAmount(payment.amount, payment.currency)}.`,
    };
  return { ok: true, amount: asked as number };
}
/** "Paid", "Unpaid", "Refunded" or "Partly refunded". */
export function paymentStatusLabel(payment: RequestPayment) {
  if (payment.status === "unpaid") return "Unpaid";
  if (payment.status === "paid") return "Paid";
  return payment.refund && payment.amount !== null && payment.refund.amount < payment.amount
    ? "Partly refunded"
    : "Refunded";
}
