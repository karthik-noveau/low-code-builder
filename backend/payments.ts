import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { HttpError, insist, local } from "./config";
import { key, now, read } from "./commerce-data";
import { deleteItem, putItem } from "./database";

/**
 * Online payments through the owner's own Stripe or Razorpay account. Forma
 * creates a checkout for the exact total and asks the provider whether it was
 * paid, so no webhook setup is needed and the money never passes through us.
 * Secret keys are encrypted at rest and never sent back to the browser.
 */
export type ProviderId = "stripe" | "razorpay";
interface StoredConnection {
  provider: ProviderId;
  mode: "test" | "live";
  /** Razorpay key id (public); empty for Stripe. */
  keyId: string;
  /** AES-256-GCM: iv.tag.ciphertext, base64. */
  secret: string;
  hint: string;
  connectedAt: string;
}
export interface Connection {
  provider: ProviderId;
  mode: "test" | "live";
  hint: string;
  connectedAt: string;
}
export interface Checkout {
  provider: ProviderId;
  id: string;
  url: string;
  createdAt: string;
}
const PROVIDER_TIMEOUT_MS = 10_000;

function encryptionKey() {
  const secret = process.env.PAYMENT_ENCRYPTION_KEY;
  insist(
    secret || local,
    503,
    "Online payments aren’t available yet. Use UPI, a payment link or bank details.",
  );
  // A fixed key is fine locally: local data never holds real secrets for long.
  return createHash("sha256")
    .update(secret || "forma-local-payment-key")
    .digest();
}
function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64"))
    .join(".");
}
function unseal(value: string) {
  const [iv, tag, body] = value.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}

const stripeBase = () =>
  process.env.STRIPE_API_BASE || "https://api.stripe.com";
const razorpayBase = () =>
  process.env.RAZORPAY_API_BASE || "https://api.razorpay.com";
async function provider<T>(
  url: string,
  init: RequestInit,
  name: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, `${name} didn’t respond. Try again in a moment.`);
  }
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data };
}
function stripe<T>(secret: string, path: string, form?: URLSearchParams) {
  return provider<T>(
    `${stripeBase()}${path}`,
    {
      method: form ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        ...(form
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: form,
    },
    "Stripe",
  );
}
function razorpay<T>(
  keyId: string,
  secret: string,
  path: string,
  body?: object,
) {
  return provider<T>(
    `${razorpayBase()}${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    "Razorpay",
  );
}

const publicConnection = (c: StoredConnection): Connection => ({
  provider: c.provider,
  mode: c.mode,
  hint: c.hint,
  connectedAt: c.connectedAt,
});
export async function getConnection(siteId: string) {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  return stored ? publicConnection(stored) : null;
}
/** Checks the key with the provider before saving it, so a typo fails here and not at a visitor's checkout. */
export async function connect(siteId: string, input: Record<string, unknown>) {
  const name = input.provider;
  insist(
    name === "stripe" || name === "razorpay",
    422,
    "Choose Stripe or Razorpay.",
  );
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";
  let mode: "test" | "live";
  let keyId = "";
  if (name === "stripe") {
    const match = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,200}$/.exec(secret);
    insist(
      match,
      422,
      "Paste a Stripe secret or restricted key (starts with rk_ or sk_).",
    );
    mode = match[2] as "test" | "live";
    const check = await stripe(secret, "/v1/checkout/sessions?limit=1");
    insist(
      check.ok,
      422,
      check.status === 401
        ? "Stripe didn’t accept that key."
        : "That key can’t read Checkout Sessions. Give it Checkout Sessions write access.",
    );
  } else {
    keyId = typeof input.keyId === "string" ? input.keyId.trim() : "";
    const match = /^rzp_(test|live)_[A-Za-z0-9]{8,40}$/.exec(keyId);
    insist(match, 422, "Paste your Razorpay key ID (starts with rzp_).");
    insist(
      /^[A-Za-z0-9]{8,100}$/.test(secret),
      422,
      "Paste your Razorpay key secret.",
    );
    mode = match[1] as "test" | "live";
    const check = await razorpay(keyId, secret, "/v1/payment_links?count=1");
    insist(check.ok, 422, "Razorpay didn’t accept that key ID and secret.");
  }
  const stored: StoredConnection = {
    provider: name,
    mode,
    keyId,
    secret: seal(secret),
    hint: secret.slice(-4),
    connectedAt: now(),
  };
  await putItem({ ...key(siteId, "PAYCONN"), ...stored });
  return publicConnection(stored);
}
export async function disconnect(siteId: string) {
  const k = key(siteId, "PAYCONN");
  await deleteItem(k.pk, k.sk);
}

/** ISO code providers need, from a symbol like ₹ or $. Unknown symbols can't be charged online. */
export function currencyCode(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(s)) return s;
  return (
    {
      "₹": "INR",
      RS: "INR",
      "RS.": "INR",
      $: "USD",
      US$: "USD",
      "€": "EUR",
      "£": "GBP",
      A$: "AUD",
      C$: "CAD",
      S$: "SGD",
    } as Record<string, string>
  )[s];
}
export interface CheckoutInput {
  requestId: string;
  reference: string;
  amount: number;
  currency: string;
  description: string;
  name: string;
  email: string;
  returnUrl: string;
}
export async function createCheckout(
  siteId: string,
  input: CheckoutInput,
): Promise<Checkout | null> {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  const code = currencyCode(input.currency);
  if (!stored || !code) return null;
  const secret = unseal(stored.secret);
  if (stored.provider === "stripe") {
    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": code.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount),
      "line_items[0][price_data][product_data][name]": input.description,
      client_reference_id: input.requestId,
      "metadata[forma_reference]": input.reference,
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
    });
    // App forms may have no email field; Stripe refuses an empty one.
    if (input.email) form.set("customer_email", input.email);
    const { ok, data } = await stripe<{
      id?: string;
      url?: string;
      error?: { message?: string };
    }>(secret, "/v1/checkout/sessions", form);
    insist(
      ok && data.id && data.url?.startsWith("https://"),
      502,
      "Stripe couldn’t start the payment. Use another option below.",
    );
    return {
      provider: "stripe",
      id: data.id!,
      url: data.url!,
      createdAt: now(),
    };
  }
  const { ok, data } = await razorpay<{ id?: string; short_url?: string }>(
    stored.keyId,
    secret,
    "/v1/payment_links",
    {
      amount: input.amount,
      currency: code,
      description: input.description,
      reference_id: input.reference,
      customer: input.email
        ? { name: input.name, email: input.email }
        : { name: input.name },
      notify: { email: false, sms: false },
      callback_url: input.returnUrl,
      callback_method: "get",
    },
  );
  insist(
    ok && data.id && data.short_url?.startsWith("https://"),
    502,
    "Razorpay couldn’t start the payment. Use another option below.",
  );
  return {
    provider: "razorpay",
    id: data.id!,
    url: data.short_url!,
    createdAt: now(),
  };
}
/** Asks the provider whether the checkout was paid in full. */
export async function checkoutPaid(
  siteId: string,
  checkout: Checkout,
  amount: number,
): Promise<boolean> {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  // A checkout made with another account can't be verified any more.
  if (!stored || stored.provider !== checkout.provider) return false;
  const secret = unseal(stored.secret);
  if (checkout.provider === "stripe") {
    const { ok, data } = await stripe<{
      payment_status?: string;
      amount_total?: number;
    }>(secret, `/v1/checkout/sessions/${encodeURIComponent(checkout.id)}`);
    return ok && data.payment_status === "paid" && data.amount_total === amount;
  }
  const { ok, data } = await razorpay<{
    status?: string;
    amount_paid?: number;
  }>(
    stored.keyId,
    secret,
    `/v1/payment_links/${encodeURIComponent(checkout.id)}`,
  );
  return ok && data.status === "paid" && (data.amount_paid ?? 0) >= amount;
}
