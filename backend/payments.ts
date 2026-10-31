import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, epoch, HttpError, insist, isConditional, local } from "./config";
import { key, now, read } from "./commerce-data";
import { db, deleteItem, getItem, putItem } from "./database";

/**
 * Online payments through the owner's own Stripe or Razorpay account. Forma
 * creates a checkout for the exact total and asks the provider whether it was
 * paid, so the money never passes through us. Webhooks only say which
 * checkout to ask about (store orders whose shopper never comes back).
 * Owners either paste API keys or sign in with the provider (Stripe Connect
 * OAuth, Razorpay partner OAuth). Secret keys and tokens are encrypted at rest
 * and never sent back to the browser.
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
  /** Connected by signing in with the provider instead of pasting keys. */
  via?: "oauth";
  /** Stripe acct_… or Razorpay acc_… the platform acts for. */
  account?: string;
  /** Razorpay sign-in: when the access token runs out (epoch seconds). */
  tokenExpires?: number;
  /**
   * The site's own webhook, for pasted keys (signed-in accounts use Forma's
   * platform webhook): Stripe's endpoint id and signing secret, made through
   * the key; for Razorpay a secret Forma made for the owner to paste.
   */
  webhook?: { id?: string; secret: string; confirmed?: boolean };
}
export interface Connection {
  provider: ProviderId;
  mode: "test" | "live";
  hint: string;
  connectedAt: string;
  via?: "oauth";
  account?: string;
  /**
   * Whether payment notifications reach Forma: "ready", or "setup" when the
   * owner still has to add the webhook in Razorpay (or Stripe refused to make
   * one with that key).
   */
  webhook: "ready" | "setup";
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
  account?: string,
  base = stripeBase(),
) {
  return provider<T>(
    `${base}${path}`,
    {
      method: form ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        // Signed-in accounts: the platform key acts for the owner's account.
        ...(account ? { "stripe-account": account } : {}),
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
  base = razorpayBase(),
) {
  return provider<T>(
    `${base}${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        // An empty key id means an OAuth access token.
        authorization: keyId
          ? `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`
          : `Bearer ${secret}`,
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
  ...(c.via ? { via: c.via, account: c.account } : {}),
  webhook:
    c.via || c.webhook?.id || (c.provider === "razorpay" && c.webhook?.confirmed)
      ? "ready"
      : "setup",
});
export async function getConnection(siteId: string) {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  return stored ? publicConnection(stored) : null;
}
/** Saves a checked connection, letting go of a signed-in account it replaces. */
async function save(siteId: string, stored: StoredConnection) {
  const previous = await read<StoredConnection>(siteId, "PAYCONN");
  await putItem({ ...key(siteId, "PAYCONN"), ...stored });
  if (
    previous?.via &&
    (previous.provider !== stored.provider ||
      previous.account !== stored.account)
  )
    await release(previous);
  return publicConnection(stored);
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
  const previous = await read<StoredConnection>(siteId, "PAYCONN");
  if (previous?.webhook?.id) await dropStripeWebhook(previous);
  return save(siteId, {
    provider: name,
    mode,
    keyId,
    secret: seal(secret),
    hint: secret.slice(-4),
    connectedAt: now(),
    webhook:
      name === "stripe"
        ? await makeStripeWebhook(siteId, secret)
        : { secret: seal(randomBytes(24).toString("hex")) },
  });
}
/** Where a site's own webhook points (pasted keys). */
export const webhookUrl = (siteId: string, name: ProviderId) =>
  `${config.apiOrigin}/payments/webhooks/${name}/${siteId}`;
const STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];
/** Asks Stripe for a webhook with the owner's key; a key without that permission just leaves it to set up. */
async function makeStripeWebhook(siteId: string, secret: string) {
  const form = new URLSearchParams({
    url: webhookUrl(siteId, "stripe"),
    description: "Forma store orders",
  });
  STRIPE_EVENTS.forEach((e, i) => form.set(`enabled_events[${i}]`, e));
  const made = await stripe<{ id?: string; secret?: string }>(
    secret,
    "/v1/webhook_endpoints",
    form,
  ).catch(() => null);
  return made?.ok && made.data.id && made.data.secret
    ? { id: made.data.id, secret: seal(made.data.secret) }
    : undefined;
}
async function dropStripeWebhook(stored: StoredConnection) {
  if (stored.provider !== "stripe" || stored.via || !stored.webhook?.id) return;
  await provider(
    `${stripeBase()}/v1/webhook_endpoints/${encodeURIComponent(stored.webhook.id)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${unseal(stored.secret)}` },
    },
    "Stripe",
  ).catch(() => undefined);
}
/**
 * What the owner pastes into Razorpay's dashboard (pasted keys): the URL and
 * the secret Razorpay signs with. Asking for it is also how the owner says
 * it's done; a signed notification confirms it for good.
 */
export async function webhookSetup(siteId: string) {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  insist(stored && !stored.via, 404, "There’s no webhook to set up.");
  if (stored.provider === "stripe") {
    // Try again, for a key given the permission since it was pasted.
    if (!stored.webhook?.id) {
      const webhook = await makeStripeWebhook(siteId, unseal(stored.secret));
      if (webhook) await putItem({ ...key(siteId, "PAYCONN"), ...stored, webhook });
      return { provider: "stripe", ready: !!webhook, url: webhookUrl(siteId, "stripe") };
    }
    return { provider: "stripe", ready: true, url: webhookUrl(siteId, "stripe") };
  }
  const webhook = stored.webhook ?? {
    secret: seal(randomBytes(24).toString("hex")),
  };
  if (!stored.webhook) await putItem({ ...key(siteId, "PAYCONN"), ...stored, webhook });
  return {
    provider: "razorpay",
    ready: !!webhook.confirmed,
    url: webhookUrl(siteId, "razorpay"),
    secret: unseal(webhook.secret),
    events: ["payment_link.paid"],
  };
}
/** Removes the connection. False when a signed-in account couldn't be told to forget Forma. */
export async function disconnect(siteId: string) {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  if (stored) await dropStripeWebhook(stored);
  const k = key(siteId, "PAYCONN");
  await deleteItem(k.pk, k.sk);
  return stored?.via ? release(stored) : true;
}

/** Forma's own platform credentials; without them owners paste keys instead. */
function platform(name: ProviderId) {
  const env = process.env;
  const [clientId, secret] =
    name === "stripe"
      ? [env.STRIPE_CONNECT_CLIENT_ID, env.STRIPE_PLATFORM_SECRET]
      : [env.RAZORPAY_PARTNER_CLIENT_ID, env.RAZORPAY_PARTNER_CLIENT_SECRET];
  return clientId && secret ? { clientId, secret } : undefined;
}
export const signInProviders = () => ({
  stripe: !!platform("stripe"),
  razorpay: !!platform("razorpay"),
});
const stripeConnectBase = () =>
  process.env.STRIPE_CONNECT_BASE || "https://connect.stripe.com";
const razorpayAuthBase = () =>
  process.env.RAZORPAY_AUTH_BASE || "https://auth.razorpay.com";
/** Fixed, so a request can't send the provider's answer anywhere else. */
const returnUrl = (name: ProviderId) =>
  `${config.apiOrigin}/payments/sign-in/${name}/return`;
const SIGN_IN_SECONDS = 600;
interface PendingSignIn {
  siteId: string;
  owner: string;
  provider: ProviderId;
  expires: number;
  /** The editor origin to come back to (locally, localhost or 127.0.0.1). */
  editor: string;
  /** The provider's authorization code, sealed, once the owner comes back. */
  code?: string;
}
const stateKey = (state: string) => ({
  pk: `PAYSIGNIN#${createHash("sha256").update(state).digest("hex")}`,
  sk: "STATE",
});
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
function unavailable(name: ProviderId): never {
  throw new HttpError(
    503,
    `Signing in with ${name === "stripe" ? "Stripe" : "Razorpay"} isn’t available. Use API keys instead.`,
  );
}

/**
 * Starts signing in with the provider. The state is random, lasts ten
 * minutes, is stored only as a hash and belongs to this site and this owner.
 */
export async function startSignIn(
  siteId: string,
  owner: string,
  input: Record<string, unknown>,
) {
  const name = input.provider;
  insist(
    name === "stripe" || name === "razorpay",
    422,
    "Choose Stripe or Razorpay.",
  );
  const app = platform(name) ?? unavailable(name);
  // Fails now, not after the owner has signed in, when tokens can't be sealed.
  encryptionKey();
  const state = randomBytes(32).toString("base64url");
  // The editor keeps its session per origin, so come back to the same one.
  const editors = local
    ? [config.editorOrigin, config.editorOrigin.replace("127.0.0.1", "localhost")]
    : [config.editorOrigin];
  const pending: PendingSignIn = {
    siteId,
    owner,
    provider: name,
    expires: epoch() + SIGN_IN_SECONDS,
    editor: editors.find((o) => o === input.editor) ?? config.editorOrigin,
  };
  await putItem({ ...stateKey(state), ...pending });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: app.clientId,
    scope: "read_write",
    state,
    redirect_uri: returnUrl(name),
  });
  return {
    state,
    url: `${name === "stripe" ? stripeConnectBase() : razorpayAuthBase()}/${name === "stripe" ? "oauth/authorize" : "authorize"}?${params}`,
  };
}

const editorLink = (pending: PendingSignIn, result: string) =>
  `${pending.editor}/editor?${new URLSearchParams({ site: pending.siteId, open: "settings", payments: result })}`;
/**
 * Where the provider sends the owner back. It has no sign-in of its own, so
 * it only keeps the code with the pending state; the owner's editor finishes.
 */
export async function signInReturn(name: string, query: URLSearchParams) {
  const state = query.get("state") ?? "";
  const k = stateKey(state);
  const pending = STATE_PATTERN.test(state)
    ? await getItem<PendingSignIn>(k.pk, k.sk)
    : undefined;
  if (!pending || pending.provider !== name)
    return `${config.editorOrigin}/workspace`;
  const code = query.get("code") ?? "";
  const error = query.get("error");
  if (pending.expires <= epoch() || pending.code || error || !code) {
    // A used state stays for its owner to finish; anything else is over.
    if (!pending.code) await deleteItem(k.pk, k.sk);
    return editorLink(
      pending,
      pending.expires <= epoch() || pending.code
        ? "expired"
        : error === "access_denied"
          ? "cancelled"
          : "failed",
    );
  }
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: k,
        UpdateExpression: "SET #code = :code",
        ConditionExpression:
          "attribute_exists(pk) AND attribute_not_exists(#code)",
        ExpressionAttributeNames: { "#code": "code" },
        ExpressionAttributeValues: { ":code": seal(code.slice(0, 512)) },
      }),
    );
  } catch (e) {
    if (!isConditional(e)) throw e;
    return editorLink(pending, "expired");
  }
  return editorLink(pending, "finish");
}

/** Turns the code into a connection, once, for the owner who started it. */
export async function finishSignIn(
  siteId: string,
  owner: string,
  input: Record<string, unknown>,
) {
  const state = typeof input.state === "string" ? input.state : "";
  insist(STATE_PATTERN.test(state), 422, "Connect again to finish signing in.");
  let pending: PendingSignIn | undefined;
  try {
    pending = (
      await db.send(
        new DeleteCommand({
          TableName: config.table,
          Key: stateKey(state),
          ConditionExpression:
            "attribute_exists(#code) AND siteId = :site AND #owner = :owner AND #expires > :now",
          ExpressionAttributeNames: {
            "#code": "code",
            "#owner": "owner",
            "#expires": "expires",
          },
          ExpressionAttributeValues: {
            ":site": siteId,
            ":owner": owner,
            ":now": epoch(),
          },
          ReturnValues: "ALL_OLD",
        }),
      )
    ).Attributes as PendingSignIn | undefined;
  } catch (e) {
    if (!isConditional(e)) throw e;
  }
  insist(
    pending?.code,
    409,
    "That sign-in expired or was already used. Connect again.",
  );
  const code = unseal(pending.code);
  const app = platform(pending.provider) ?? unavailable(pending.provider);
  if (pending.provider === "stripe") {
    const token = await stripe<{ stripe_user_id?: string; livemode?: boolean }>(
      app.secret,
      "/oauth/token",
      new URLSearchParams({ grant_type: "authorization_code", code }),
      undefined,
      undefined,
      stripeConnectBase(),
    );
    const account = token.data.stripe_user_id ?? "";
    insist(
      token.ok && /^acct_[A-Za-z0-9]{6,64}$/.test(account),
      422,
      "Stripe didn’t finish connecting your account. Connect again.",
    );
    const stored: StoredConnection = {
      provider: "stripe",
      mode: token.data.livemode ? "live" : "test",
      keyId: "",
      secret: "",
      hint: account.slice(-4),
      connectedAt: now(),
      via: "oauth",
      account,
    };
    const check = await stripe(
      app.secret,
      "/v1/checkout/sessions?limit=1",
      undefined,
      undefined,
      account,
    );
    if (!check.ok) {
      await release(stored);
      throw new HttpError(
        422,
        "Stripe connected, but Forma couldn’t read Checkout Sessions on that account. Connect again.",
      );
    }
    return save(siteId, stored);
  }
  const token = await razorpayToken(app, {
    grant_type: "authorization_code",
    code,
    redirect_uri: returnUrl("razorpay"),
    mode: process.env.RAZORPAY_PARTNER_MODE === "test" ? "test" : "live",
  });
  const account = token?.razorpay_account_id ?? "";
  insist(
    token && /^acc_[A-Za-z0-9]{6,64}$/.test(account),
    422,
    "Razorpay didn’t finish connecting your account. Connect again.",
  );
  const stored: StoredConnection = {
    provider: "razorpay",
    mode: token.public_token?.startsWith("rzp_test") ? "test" : "live",
    keyId: token.public_token ?? "",
    secret: sealTokens(token),
    hint: account.slice(-4),
    connectedAt: now(),
    via: "oauth",
    account,
    tokenExpires: epoch() + token.expires_in,
  };
  const check = await razorpay(
    "",
    token.access_token,
    "/v1/payment_links?count=1",
  );
  if (!check.ok) {
    await release(stored);
    throw new HttpError(
      422,
      "Razorpay connected, but Forma couldn’t read payment links on that account. Connect again.",
    );
  }
  return save(siteId, stored);
}

interface RazorpayTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  public_token?: string;
  razorpay_account_id?: string;
}
async function razorpayToken(
  app: { clientId: string; secret: string },
  grant: Record<string, string>,
) {
  const { ok, data } = await provider<Partial<RazorpayTokens>>(
    `${razorpayAuthBase()}/token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.secret,
        ...grant,
      }),
    },
    "Razorpay",
  );
  return ok &&
    typeof data.access_token === "string" &&
    typeof data.refresh_token === "string" &&
    Number.isFinite(data.expires_in)
    ? (data as RazorpayTokens)
    : undefined;
}
const sealTokens = (t: RazorpayTokens) =>
  seal(JSON.stringify({ access: t.access_token, refresh: t.refresh_token }));
const unsealTokens = (stored: StoredConnection) =>
  JSON.parse(unseal(stored.secret)) as { access: string; refresh: string };
/** Swaps the refresh token for new tokens. Another request may have done it first. */
async function refreshRazorpay(siteId: string, stored: StoredConnection) {
  const app = platform("razorpay") ?? unavailable("razorpay");
  const token = await razorpayToken(app, {
    grant_type: "refresh_token",
    refresh_token: unsealTokens(stored).refresh,
  });
  if (!token) {
    const latest = await read<StoredConnection>(siteId, "PAYCONN");
    insist(
      latest?.via && latest.secret !== stored.secret,
      422,
      "Razorpay signed Forma out of your account. Connect Razorpay again in Settings → Get paid.",
    );
    return latest;
  }
  const next: StoredConnection = {
    ...stored,
    secret: sealTokens(token),
    tokenExpires: epoch() + token.expires_in,
  };
  try {
    // Only over the tokens it replaced, so a disconnect isn't undone.
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: { ...key(siteId, "PAYCONN"), ...next },
        ConditionExpression: "#secret = :old",
        ExpressionAttributeNames: { "#secret": "secret" },
        ExpressionAttributeValues: { ":old": stored.secret },
      }),
    );
  } catch (e) {
    if (!isConditional(e)) throw e;
  }
  return next;
}
/** Tells the provider Forma no longer needs a signed-in account. */
async function release(stored: StoredConnection) {
  const app = platform(stored.provider);
  if (!app) return false;
  try {
    if (stored.provider === "stripe") {
      const { ok } = await stripe(
        app.secret,
        "/oauth/deauthorize",
        new URLSearchParams({
          client_id: app.clientId,
          stripe_user_id: stored.account ?? "",
        }),
        undefined,
        undefined,
        stripeConnectBase(),
      );
      return ok;
    }
    const tokens = unsealTokens(stored);
    let ok = true;
    for (const [hint, token] of [
      ["refresh_token", tokens.refresh],
      ["access_token", tokens.access],
    ])
      ok =
        (
          await provider(
            `${razorpayAuthBase()}/revoke`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                client_id: app.clientId,
                client_secret: app.secret,
                token_type_hint: hint,
                token,
              }),
            },
            "Razorpay",
          )
        ).ok && ok;
    return ok;
  } catch {
    return false;
  }
}

type Answer<T> = { ok: boolean; status: number; data: T };
/** Calls the provider as the site's connected account, however it was connected. */
type Caller = <T>(
  path: string,
  body?: URLSearchParams | object,
  idempotencyKey?: string,
) => Promise<Answer<T>>;
async function caller(
  siteId: string,
  stored: StoredConnection,
): Promise<Caller> {
  if (stored.provider === "stripe") {
    const secret = stored.via
      ? (platform("stripe") ?? unavailable("stripe")).secret
      : unseal(stored.secret);
    return (path, body, idempotencyKey) =>
      stripe(
        secret,
        path,
        body as URLSearchParams | undefined,
        idempotencyKey,
        stored.via ? stored.account : undefined,
      );
  }
  if (!stored.via) {
    const secret = unseal(stored.secret);
    return (path, body) => razorpay(stored.keyId, secret, path, body);
  }
  let current = stored;
  // Refresh a day early, and again if Razorpay says the token is no good.
  if ((current.tokenExpires ?? 0) - epoch() < 86400)
    current = await refreshRazorpay(siteId, current);
  return async <T>(path: string, body?: object) => {
    const answer = await razorpay<T>("", unsealTokens(current).access, path, body);
    if (answer.status !== 401) return answer;
    current = await refreshRazorpay(siteId, current);
    return razorpay<T>("", unsealTokens(current).access, path, body);
  };
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
  /** Store orders: when the checkout stops taking payment (epoch seconds). */
  expiresAt?: number;
  /** What the checkout pays for, so a webhook can find it. */
  kind?: "order";
}
export async function createCheckout(
  siteId: string,
  input: CheckoutInput,
): Promise<Checkout | null> {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  const code = currencyCode(input.currency);
  if (!stored || !code) return null;
  const call = await caller(siteId, stored);
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
      "metadata[forma_site]": siteId,
    });
    if (input.kind) form.set("metadata[forma_kind]", input.kind);
    if (input.expiresAt) form.set("expires_at", String(input.expiresAt));
    // App forms may have no email field; Stripe refuses an empty one.
    if (input.email) form.set("customer_email", input.email);
    const { ok, data } = await call<{
      id?: string;
      url?: string;
      error?: { message?: string };
    }>("/v1/checkout/sessions", form);
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
  const { ok, data } = await call<{ id?: string; short_url?: string }>(
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
      notes: {
        forma_site: siteId,
        forma_id: input.requestId,
        ...(input.kind ? { forma_kind: input.kind } : {}),
      },
      ...(input.expiresAt ? { expire_by: input.expiresAt } : {}),
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
  const call = await caller(siteId, stored);
  if (checkout.provider === "stripe") {
    const { ok, data } = await call<{
      payment_status?: string;
      amount_total?: number;
    }>(`/v1/checkout/sessions/${encodeURIComponent(checkout.id)}`);
    return ok && data.payment_status === "paid" && data.amount_total === amount;
  }
  const { ok, data } = await call<{
    status?: string;
    amount_paid?: number;
  }>(`/v1/payment_links/${encodeURIComponent(checkout.id)}`);
  return ok && data.status === "paid" && (data.amount_paid ?? 0) >= amount;
}

/**
 * Stops a checkout taking payment (a store hold ran out). False when the
 * provider says no, which is what happens if it was paid in the meantime.
 */
export async function cancelCheckout(siteId: string, checkout: Checkout) {
  const stored = await read<StoredConnection>(siteId, "PAYCONN");
  if (!stored || stored.provider !== checkout.provider) return false;
  const call = await caller(siteId, stored);
  const id = encodeURIComponent(checkout.id);
  const { ok } =
    checkout.provider === "stripe"
      ? await call(`/v1/checkout/sessions/${id}/expire`, new URLSearchParams())
      : await call(`/v1/payment_links/${id}/cancel`, {});
  return ok;
}

/** A payment notification Forma acts on: which site's checkout to check. */
export interface PaymentNotice {
  provider: ProviderId;
  siteId: string;
  kind: string;
  /** The order (or request) id the checkout was made for. */
  id: string;
  checkoutId: string;
}
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret: string, value: string | Buffer) =>
  createHmac("sha256", secret).update(value).digest("hex");
/** Stripe-Signature: t=…,v1=…; signed over "t.body", five minutes' grace. */
function stripeSigned(header: string, body: Buffer, secret: string) {
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1] ?? "";
  if (!/^\d{1,12}$/.test(t) || Math.abs(epoch() - Number(t)) > 300) return false;
  const expected = hmac(secret, Buffer.concat([Buffer.from(`${t}.`), body]));
  return parts.some(([k, v]) => k === "v1" && !!v && safeEqual(v, expected));
}
/**
 * Checks a webhook's signature and says which checkout it's about; null for
 * events Forma doesn't act on. `siteId` is set for a site's own webhook
 * (pasted keys), absent for Forma's platform webhook (signed-in accounts).
 */
export async function readWebhook(
  name: ProviderId,
  siteId: string | undefined,
  body: Buffer,
  headers: Record<string, string | undefined>,
): Promise<PaymentNotice | null> {
  const stored = siteId
    ? await read<StoredConnection>(siteId, "PAYCONN")
    : undefined;
  const secret = siteId
    ? stored?.provider === name && !stored.via && stored.webhook
      ? unseal(stored.webhook.secret)
      : undefined
    : name === "stripe"
      ? process.env.STRIPE_WEBHOOK_SECRET
      : process.env.RAZORPAY_WEBHOOK_SECRET;
  insist(
    secret,
    siteId ? 404 : 503,
    siteId ? "Not found." : "This webhook isn’t set up.",
  );
  const signed =
    name === "stripe"
      ? stripeSigned(headers["stripe-signature"] ?? "", body, secret)
      : safeEqual(headers["x-razorpay-signature"] ?? "", hmac(secret, body));
  insist(signed, 400, "Invalid signature.");
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body.toString()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  // A signed notification proves the owner's Razorpay webhook works.
  if (siteId && stored?.webhook && !stored.webhook.confirmed && name === "razorpay")
    await putItem({
      ...key(siteId, "PAYCONN"),
      ...stored,
      webhook: { ...stored.webhook, confirmed: true },
    });
  const pick = (o: unknown, ...path: string[]) =>
    path.reduce<unknown>(
      (v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined),
      o,
    );
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let notice: PaymentNotice;
  if (name === "stripe") {
    if (!STRIPE_EVENTS.includes(str(event.type))) return null;
    const session = pick(event, "data", "object");
    notice = {
      provider: name,
      siteId: str(pick(session, "metadata", "forma_site")),
      kind: str(pick(session, "metadata", "forma_kind")),
      id: str(pick(session, "client_reference_id")),
      checkoutId: str(pick(session, "id")),
    };
  } else {
    if (event.event !== "payment_link.paid") return null;
    const link = pick(event, "payload", "payment_link", "entity");
    notice = {
      provider: name,
      siteId: str(pick(link, "notes", "forma_site")),
      kind: str(pick(link, "notes", "forma_kind")),
      id: str(pick(link, "notes", "forma_id")),
      checkoutId: str(pick(link, "id")),
    };
  }
  if (!notice.siteId || !notice.id || !notice.checkoutId) return null;
  // A site's own webhook only speaks for that site; the platform's only for
  // the account the site signed in with.
  if (siteId) return notice.siteId === siteId ? notice : null;
  const account = str(
    name === "stripe" ? event.account : pick(event, "account_id"),
  );
  const site = await read<StoredConnection>(notice.siteId, "PAYCONN");
  return site?.via && site.provider === name && site.account === account
    ? notice
    : null;
}

interface ProviderError {
  error?: { message?: string; description?: string; code?: string };
}
/** The provider's reason in words an owner can act on. */
function refundError(
  name: string,
  status: number,
  data: ProviderError,
  signedIn = false,
) {
  if (status === 401 || status === 403)
    return new HttpError(
      422,
      signedIn
        ? `${name} didn’t allow the refund. Connect ${name} again, or refund it in your ${name} dashboard.`
        : name === "Stripe"
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
  const call = await caller(siteId, stored);
  if (checkout.provider === "stripe") {
    const session = await call<
      ProviderError & { payment_intent?: string | { id?: string } }
    >(`/v1/checkout/sessions/${encodeURIComponent(checkout.id)}`);
    if (!session.ok) throw refundError(name, session.status, session.data, !!stored.via);
    const intent =
      typeof session.data.payment_intent === "string"
        ? session.data.payment_intent
        : session.data.payment_intent?.id;
    insist(intent, 409, "Stripe has no payment for this checkout to refund.");
    const { ok, status, data } = await call<
      ProviderError & { id?: string; amount?: number; status?: string }
    >(
      "/v1/refunds",
      new URLSearchParams({
        payment_intent: intent,
        amount: String(amount),
        "metadata[forma_reference]": reference,
        "metadata[forma_refund]": key,
      }),
      key,
    );
    if (!ok) throw refundError(name, status, data, !!stored.via);
    insist(
      data.id && data.status !== "failed" && data.status !== "canceled",
      422,
      "Stripe couldn’t refund this payment. Refund it in your Stripe dashboard.",
    );
    return { id: data.id, amount: data.amount ?? amount };
  }
  const link = await call<
    ProviderError & {
      payments?: { payment_id?: string; status?: string }[] | null;
    }
  >(`/v1/payment_links/${encodeURIComponent(checkout.id)}`);
  if (!link.ok) throw refundError(name, link.status, link.data, !!stored.via);
  // A partly refunded payment stays captured; a fully refunded one says so.
  const paymentId = link.data.payments?.find(
    (p) => (p.status === "captured" || p.status === "refunded") && p.payment_id,
  )?.payment_id;
  insist(paymentId, 409, "Razorpay has no captured payment for this link to refund.");
  const path = `/v1/payments/${encodeURIComponent(paymentId)}`;
  type Refund = { id?: string; amount?: number; receipt?: string; status?: string };
  // Razorpay has no idempotency header: look for this refund before making it.
  const earlier = await call<ProviderError & { items?: Refund[] }>(
    `${path}/refunds?count=100`,
  );
  if (!earlier.ok) throw refundError(name, earlier.status, earlier.data, !!stored.via);
  const found = earlier.data.items?.find(
    (r) => r.receipt === key && r.id && r.status !== "failed",
  );
  if (found) return { id: found.id!, amount: found.amount ?? amount };
  const { ok, status, data } = await call<ProviderError & Refund>(
    `${path}/refund`,
    { amount, speed: "normal", receipt: key, notes: { forma_reference: reference } },
  );
  if (!ok) throw refundError(name, status, data, !!stored.via);
  insist(
    data.id && data.status !== "failed",
    422,
    "Razorpay couldn’t refund this payment. Refund it in your Razorpay dashboard.",
  );
  return { id: data.id, amount: data.amount ?? amount };
}
