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
function stripe<T>(
  secret: string,
  path: string,
  form?: URLSearchParams,
  idempotencyKey?: string,
) {
  return provider<T>(
    `${stripeBase()}${path}`,
    {
      method: form ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
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

interface ProviderError {
  error?: { message?: string; description?: string; code?: string };
}
/** The provider's reason in words an owner can act on. */
function refundError(name: string, status: number, data: ProviderError) {
  if (status === 401 || status === 403)
    return new HttpError(
      422,
      name === "Stripe"
        ? "Stripe didn’t allow the refund. Give the connected key Refunds write access, or refund it in your Stripe dashboard."
        : "Razorpay didn’t accept the connected key. Connect it again, or refund it in your Razorpay dashboard.",
    );
  if (status >= 500 || status === 429)
    return new HttpError(502, `${name} is busy. Try the refund again in a moment.`);
  const reason = (data.error?.message || data.error?.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (data.error?.code === "charge_already_refunded")
    return new HttpError(
      409,
      "This payment was already refunded in your Stripe dashboard.",
    );
  return new HttpError(
    422,
    `${name} couldn’t refund this payment${reason ? `: ${reason.replace(/\.$/, "")}` : ""}.`,
  );
}
/**
 * Refunds part or all of a paid checkout. `key` makes retries safe: Stripe
 * returns the same refund for the same idempotency key, and Razorpay refunds
 * carry it as their receipt, so a retry finds the earlier one first.
 */
export async function refundCheckout(
  siteId: string,
  checkout: Checkout,
  amount: number,
  key: string,
  reference: string,
): Promise<{ id: string; amount: number }> {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  const name = checkout.provider === "stripe" ? "Stripe" : "Razorpay";
  // Only the provider that took the payment can give it back.
  insist(
    stored && stored.provider === checkout.provider,
    409,
    `Connect the ${name} account this was paid with to refund it, or refund it in your ${name} dashboard.`,
  );
  const secret = unseal(stored.secret);
  if (checkout.provider === "stripe") {
    const session = await stripe<
      ProviderError & { payment_intent?: string | { id?: string } }
    >(
      secret,
      `/v1/checkout/sessions/${encodeURIComponent(checkout.id)}`,
    );
    if (!session.ok) throw refundError(name, session.status, session.data);
    const intent =
      typeof session.data.payment_intent === "string"
        ? session.data.payment_intent
        : session.data.payment_intent?.id;
    insist(intent, 409, "Stripe has no payment for this checkout to refund.");
    const { ok, status, data } = await stripe<
      ProviderError & { id?: string; amount?: number; status?: string }
    >(
      secret,
      "/v1/refunds",
      new URLSearchParams({
        payment_intent: intent,
        amount: String(amount),
        "metadata[forma_reference]": reference,
        "metadata[forma_refund]": key,
      }),
      key,
    );
    if (!ok) throw refundError(name, status, data);
    insist(
      data.id && data.status !== "failed" && data.status !== "canceled",
      422,
      "Stripe couldn’t refund this payment. Refund it in your Stripe dashboard.",
    );
    return { id: data.id, amount: data.amount ?? amount };
  }
  const link = await razorpay<
    ProviderError & {
      payments?: { payment_id?: string; status?: string }[] | null;
    }
  >(stored.keyId, secret, `/v1/payment_links/${encodeURIComponent(checkout.id)}`);
  if (!link.ok) throw refundError(name, link.status, link.data);
  // A partly refunded payment stays captured; a fully refunded one says so.
  const paymentId = link.data.payments?.find(
    (p) => (p.status === "captured" || p.status === "refunded") && p.payment_id,
  )?.payment_id;
  insist(paymentId, 409, "Razorpay has no captured payment for this link to refund.");
  const path = `/v1/payments/${encodeURIComponent(paymentId)}`;
  type Refund = { id?: string; amount?: number; receipt?: string; status?: string };
  // Razorpay has no idempotency header: look for this refund before making it.
  const earlier = await razorpay<ProviderError & { items?: Refund[] }>(
    stored.keyId,
    secret,
    `${path}/refunds?count=100`,
  );
  if (!earlier.ok) throw refundError(name, earlier.status, earlier.data);
  const found = earlier.data.items?.find(
    (r) => r.receipt === key && r.id && r.status !== "failed",
  );
  if (found) return { id: found.id!, amount: found.amount ?? amount };
  const { ok, status, data } = await razorpay<ProviderError & Refund>(
    stored.keyId,
    secret,
    `${path}/refund`,
    { amount, speed: "normal", receipt: key, notes: { forma_reference: reference } },
  );
  if (!ok) throw refundError(name, status, data);
  insist(
    data.id && data.status !== "failed",
    422,
    "Razorpay couldn’t refund this payment. Refund it in your Razorpay dashboard.",
  );
  return { id: data.id, amount: data.amount ?? amount };
}
