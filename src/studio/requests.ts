/**
 * Visitor actions: a collection item can ask visitors to book, order, apply,
 * RSVP or enquire. Requests arrive in the site's Forma inbox, so a salon, an
 * agency or a venue gets bookings without a third-party app. Shared by the
 * editor, the static renderer and the backend so all three agree on fields.
 */
export type RequestKind = "enquire" | "book" | "order" | "apply" | "rsvp";
export type RequestFieldId =
  "date" | "time" | "guests" | "quantity" | "link" | "phone" | "message";
export interface RequestFieldSpec {
  label: string;
  input: "date" | "time" | "number" | "url" | "tel" | "textarea";
  required: boolean;
  min?: number;
  max?: number;
}
export interface RequestKindSpec {
  label: string;
  /** What the owner sees in the inbox, e.g. "Booking". */
  noun: string;
  button: string;
  description: string;
  fields: RequestFieldId[];
  required: RequestFieldId[];
}
export const REQUEST_FIELDS: Record<RequestFieldId, RequestFieldSpec> = {
  date: { label: "Preferred date", input: "date", required: false },
  time: { label: "Preferred time", input: "time", required: false },
  guests: {
    label: "Guests",
    input: "number",
    required: false,
    min: 1,
    max: 50,
  },
  quantity: {
    label: "Quantity",
    input: "number",
    required: false,
    min: 1,
    max: 99,
  },
  link: { label: "Portfolio or CV link", input: "url", required: false },
  phone: { label: "Phone", input: "tel", required: false },
  message: { label: "Message", input: "textarea", required: false },
};
export const REQUEST_KINDS: Record<RequestKind, RequestKindSpec> = {
  enquire: {
    label: "Enquiry",
    noun: "Enquiry",
    button: "Send enquiry",
    description: "Visitors ask a question about this item.",
    fields: ["phone", "message"],
    required: ["message"],
  },
  book: {
    label: "Booking",
    noun: "Booking",
    button: "Request booking",
    description: "Visitors pick a date and time; you confirm by email.",
    fields: ["date", "time", "guests", "phone", "message"],
    required: ["date"],
  },
  order: {
    label: "Order request",
    noun: "Order",
    button: "Request to order",
    description:
      "Visitors ask for a quantity; you arrange payment and delivery.",
    fields: ["quantity", "phone", "message"],
    required: ["quantity"],
  },
  apply: {
    label: "Application",
    noun: "Application",
    button: "Apply",
    description: "Candidates send a link to their CV or portfolio.",
    fields: ["link", "phone", "message"],
    required: ["link"],
  },
  rsvp: {
    label: "RSVP",
    noun: "RSVP",
    button: "RSVP",
    description: "Guests reserve a place and say how many are coming.",
    fields: ["guests", "message"],
    required: ["guests"],
  },
};
/**
 * Site-wide forms (Contact and Email signup sections) also arrive in the inbox
 * when the site is published through Forma and no outside endpoint is set.
 */
export type SiteFormKind = "contact" | "newsletter";
export type InboxKind = RequestKind | SiteFormKind;
export const SITE_FORMS: Record<SiteFormKind, RequestKindSpec> = {
  contact: {
    label: "Contact form",
    noun: "Message",
    button: "Send message",
    description: "Visitors send you a message.",
    fields: ["message"],
    required: ["message"],
  },
  newsletter: {
    label: "Email signup",
    noun: "Signup",
    button: "Subscribe",
    description: "Visitors join your mailing list.",
    fields: [],
    required: [],
  },
};
export const INBOX_KINDS: Record<InboxKind, RequestKindSpec> = {
  ...REQUEST_KINDS,
  ...SITE_FORMS,
};
export const isSiteForm = (value: unknown): value is SiteFormKind =>
  value === "contact" || value === "newsletter";
export interface CollectionRequest {
  kind: RequestKind;
  /** Button text; empty uses the kind's default. */
  label: string;
  /** Show payment options after an order, booking or RSVP (see payments.ts). */
  collect?: boolean;
}
export const requestButton = (r: CollectionRequest) =>
  r.label || REQUEST_KINDS[r.kind].button;
export function validateRequestConfig(
  value: unknown,
): value is CollectionRequest {
  const r = value as CollectionRequest;
  return (
    !!r &&
    typeof r === "object" &&
    Object.hasOwn(REQUEST_KINDS, r.kind) &&
    typeof r.label === "string" &&
    r.label.length <= 40 &&
    (r.collect === undefined || typeof r.collect === "boolean")
  );
}

/** A visitor's request as stored in the inbox. */
export interface InboxRequest {
  id: string;
  kind: InboxKind;
  collection: string;
  collectionName: string;
  item: string;
  itemTitle: string;
  name: string;
  email: string;
  fields: Partial<Record<RequestFieldId, string>>;
  status: "new" | "done";
  createdAt: string;
  /** Present when the visitor was asked to pay. Amount is in minor units. */
  payment?: {
    amount: number | null;
    currency: string;
    reference: string;
    status: "unpaid" | "paid";
    /** A checkout in the owner's Stripe or Razorpay account. */
    checkout?: {
      provider: "stripe" | "razorpay";
      id: string;
      url: string;
      createdAt: string;
    };
    /** Who marked it paid: the provider confirmed it, or the owner did. */
    confirmedBy?: "provider" | "owner";
    paidAt?: string;
  };
}
const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const urlPattern = /^https?:\/\/[^\s]{3,500}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;
/**
 * Validates a visitor's submission for a kind. Returns clean values or a
 * visitor-facing message explaining what to fix.
 */
export function parseRequest(
  kind: InboxKind,
  input: Record<string, unknown>,
):
  | { ok: true; name: string; email: string; fields: InboxRequest["fields"] }
  | { ok: false; error: string } {
  const spec = INBOX_KINDS[kind];
  const text = (key: string) =>
    typeof input[key] === "string" ? (input[key] as string).trim() : "";
  const name = text("name");
  const email = text("email").toLowerCase();
  // An email signup asks only for the address.
  if ((!name && kind !== "newsletter") || name.length > 100)
    return { ok: false, error: "Add your name." };
  if (!emailPattern.test(email) || email.length > 254)
    return { ok: false, error: "Add a valid email address." };
  const fields: InboxRequest["fields"] = {};
  for (const id of spec.fields) {
    const field = REQUEST_FIELDS[id];
    const value = text(id);
    if (!value) {
      if (spec.required.includes(id))
        return { ok: false, error: `Add ${field.label.toLowerCase()}.` };
      continue;
    }
    const bad = {
      ok: false as const,
      error: `Check ${field.label.toLowerCase()}.`,
    };
    if (
      field.input === "date" &&
      (!datePattern.test(value) || isNaN(Date.parse(value)))
    )
      return bad;
    if (field.input === "time" && !timePattern.test(value)) return bad;
    if (field.input === "number") {
      const n = Number(value);
      if (
        !Number.isInteger(n) ||
        n < (field.min ?? 0) ||
        n > (field.max ?? 1e6)
      )
        return bad;
    }
    if (field.input === "url" && !urlPattern.test(value)) return bad;
    if (field.input === "tel" && !/^[0-9+()\-.\s]{5,30}$/.test(value))
      return bad;
    if (value.length > (field.input === "textarea" ? 3000 : 200)) return bad;
    fields[id] = value;
  }
  return { ok: true, name, email, fields };
}
