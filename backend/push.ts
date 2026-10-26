/**
 * Web push without a third-party library: RFC 8291 message encryption
 * (aes128gcm) and RFC 8292 VAPID (an ES256 JWT), both with node:crypto.
 *
 * The VAPID keypair is made once and kept in the table (`PUSH`/`VAPID`), so
 * every API instance signs with the same key and owners' subscriptions keep
 * working across restarts and deploys. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
 * (base64url raw P-256 keys) override it when set. Losing the key only means
 * owners turn notifications on again.
 */
import {
  createECDH,
  createPrivateKey,
  createCipheriv,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { config, isConditional, local } from "./config";
import { db, getItem } from "./database";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushMessage {
  title: string;
  body: string;
  url: string;
}
const b64url = (bytes: Buffer) => bytes.toString("base64url");
const fromB64url = (text: string) => Buffer.from(text, "base64url");

interface Vapid {
  publicKey: string;
  privateKey: string;
}
let vapid: Promise<Vapid> | undefined;
async function loadVapid(): Promise<Vapid> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  const stored = await getItem<Vapid>("PUSH", "VAPID");
  if (stored) return stored;
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const fresh = {
    publicKey: b64url(ecdh.getPublicKey()),
    privateKey: b64url(ecdh.getPrivateKey()),
  };
  try {
    // Conditional, so two instances starting together agree on one key.
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: { pk: "PUSH", sk: "VAPID", ...fresh },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return fresh;
  } catch (error) {
    if (!isConditional(error)) throw error;
    return (await getItem<Vapid>("PUSH", "VAPID"))!;
  }
}
export function vapidKeys() {
  vapid ??= loadVapid().catch((error) => {
    vapid = undefined;
    throw error;
  });
  return vapid;
}
export const publicKey = async () => (await vapidKeys()).publicKey;

function signingKey(keys: Vapid): KeyObject {
  const raw = fromB64url(keys.publicKey);
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: b64url(raw.subarray(1, 33)),
      y: b64url(raw.subarray(33, 65)),
    },
    format: "jwk",
  });
}
/** RFC 8292: a short-lived token tying the request to our public key. */
export async function vapidHeader(endpoint: string) {
  const keys = await vapidKeys();
  const subject =
    process.env.VAPID_SUBJECT ||
    (config.editorOrigin.startsWith("https://")
      ? config.editorOrigin
      : "mailto:notifications@forma.invalid");
  const part = (value: object) => b64url(Buffer.from(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: signingKey(keys),
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}
/** RFC 8291: encrypts a payload so only the subscribed browser can read it. */
export function encryptPayload(
  subscription: PushSubscriptionInput,
  payload: Buffer,
) {
  const client = fromB64url(subscription.keys.p256dh);
  const auth = fromB64url(subscription.keys.auth);
  const server = createECDH("prime256v1");
  server.generateKeys();
  const serverPublic = server.getPublicKey();
  const shared = server.computeSecret(client);
  const ikm = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      auth,
      Buffer.concat([Buffer.from("WebPush: info\0"), client, serverPublic]),
      32,
    ),
  );
  const salt = randomBytes(16);
  const cek = Buffer.from(
    hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // A single record: the payload, then the 0x02 "last record" delimiter.
  const body = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = serverPublic.length;
  return Buffer.concat([header, serverPublic, body]);
}

/** Push services browsers use. Anything else is refused, so the API never posts to arbitrary hosts. */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];
export function validSubscription(
  value: unknown,
): value is PushSubscriptionInput {
  const s = value as PushSubscriptionInput;
  if (!s || typeof s !== "object" || typeof s.endpoint !== "string")
    return false;
  if (s.endpoint.length > 1000 || !s.keys || typeof s.keys !== "object")
    return false;
  const { p256dh, auth } = s.keys;
  if (typeof p256dh !== "string" || typeof auth !== "string") return false;
  if (fromB64url(p256dh).length !== 65 || fromB64url(auth).length !== 16)
    return false;
  let url: URL;
  try {
    url = new URL(s.endpoint);
  } catch {
    return false;
  }
  // Locally, a loopback receiver stands in for a push service (tests use one).
  if (
    local &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(url.hostname)
  )
    return true;
  return (
    url.protocol === "https:" &&
    !url.port &&
    PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  );
}

export type PushOutcome = "sent" | "gone" | "failed";
/** Sends one notification. "gone" means the browser unsubscribed; forget the device. */
export async function sendPush(
  subscription: PushSubscriptionInput,
  message: PushMessage,
): Promise<PushOutcome> {
  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidHeader(subscription.endpoint),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(24 * 3600),
        urgency: "high",
      },
      body: encryptPayload(subscription, Buffer.from(JSON.stringify(message))),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
