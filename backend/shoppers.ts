/**
 * Shopper accounts, per store: a shopper signs in with a six-digit code
 * emailed to them (mail.ts sends it through SES; locally, without a sender,
 * the code is shown on the page). The session is a random token the browser
 * keeps for this store only, so shoppers never need a Skynoveau account and
 * hosted stores need no identity provider of their own.
 */
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, epoch, insist, isConditional, local } from "./config";
import { db } from "./database";
import {
  buyerKey,
  key,
  list,
  message,
  put,
  read,
  recent,
  transact,
} from "./commerce-data";
import { mailFrom } from "./mail";
import type { StoreSettings } from "../src/commerce/types";
import type { PrivateOrder } from "./commerce";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
/** Codes one address can ask for per hour. */
const CODES_PER_HOUR = 5;
const SESSION_DAYS = 30;

interface SignIn {
  hash: string;
  expires: number;
  tries: number;
  sentAt: number;
  windowStart: number;
  sent: number;
}
interface ShopperSession {
  email: string;
  expires: number;
}
/** Whether this store can offer shopper sign-in: it needs a way to send the code. */
export const accountsOpen = () => local || !!mailFrom();

export function shopperEmail(value: unknown) {
  insist(
    typeof value === "string" &&
      value.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
    422,
    "Enter a valid email address.",
  );
  return value.trim().toLowerCase();
}
/** Emails a sign-in code; locally without a sender it's returned to show on the page. */
export async function sendSignInCode(
  siteId: string,
  input: Record<string, unknown>,
) {
  insist(accountsOpen(), 503, "This store can’t send sign-in codes yet.");
  const email = shopperEmail(input.email);
  const store = await read<StoreSettings>(siteId, "SETTINGS");
  insist(store?.enabled, 404, "This store is not open.");
  const id = digest(email);
  const previous = await read<SignIn>(siteId, "SIGNIN", id);
  const t = epoch();
  insist(
    !previous || previous.sentAt <= t - 30,
    429,
    "A code was just sent. Wait a moment before asking again.",
  );
  const fresh = !previous || previous.windowStart <= t - 3600;
  insist(
    fresh || previous.sent < CODES_PER_HOUR,
    429,
    "Too many codes asked for. Try again in an hour.",
  );
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row: SignIn = {
    hash: digest(`${id}:${code}`),
    expires: t + CODE_MINUTES * 60,
    tries: 0,
    sentAt: t,
    windowStart: fresh ? t : previous.windowStart,
    sent: fresh ? 1 : previous.sent + 1,
  };
  try {
    await transact([
      {
        Put: {
          TableName: config.table,
          Item: { ...key(siteId, "SIGNIN", id), ...row },
          // Two requests at once send one code, not two.
          ConditionExpression: previous
            ? "sentAt = :sentAt"
            : "attribute_not_exists(pk)",
          ExpressionAttributeValues: previous
            ? { ":sentAt": previous.sentAt }
            : undefined,
        },
      },
      message(
        siteId,
        email,
        `Your sign-in code for ${store.name}`,
        `Your code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you didn’t ask to sign in to ${store.name}, ignore this email.`,
      ),
    ]);
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 409)
      insist(
        false,
        429,
        "A code was just sent. Wait a moment before asking again.",
      );
    throw error;
  }
  return {
    sent: true,
    // Local preview stores have nowhere to send it.
    ...(local && !mailFrom() ? { preview: code } : {}),
  };
}
/** Swaps a correct code for a session token for this store. */
export async function signInShopper(
  siteId: string,
  input: Record<string, unknown>,
) {
  insist(accountsOpen(), 503, "This store can’t send sign-in codes yet.");
  const email = shopperEmail(input.email);
  const code = typeof input.code === "string" ? input.code.trim() : "";
  insist(/^\d{6}$/.test(code), 422, "Enter the six-digit code from the email.");
  const id = digest(email);
  const row = await read<SignIn>(siteId, "SIGNIN", id);
  insist(
    row && row.expires > epoch() && row.tries < CODE_TRIES,
    401,
    "That code has expired. Ask for a new one.",
  );
  // Count the try first, so guesses stop after five whatever happens next.
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, "SIGNIN", id),
        UpdateExpression: "ADD tries :one",
        ConditionExpression: "#hash = :hash AND tries < :max",
        ExpressionAttributeNames: { "#hash": "hash" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":hash": row.hash,
          ":max": CODE_TRIES,
        },
      }),
    );
  } catch (error) {
    if (isConditional(error))
      insist(false, 401, "That code has expired. Ask for a new one.");
    throw error;
  }
  const expected = Buffer.from(row.hash, "hex");
  const given = Buffer.from(digest(`${id}:${code}`), "hex");
  insist(
    expected.length === given.length && timingSafeEqual(expected, given),
    401,
    row.tries + 1 >= CODE_TRIES
      ? "That code is wrong, and it’s now used up. Ask for a new one."
      : "That code is wrong. Check the email and try again.",
  );
  const token = randomBytes(32).toString("hex");
  const session: ShopperSession = {
    email,
    expires: epoch() + SESSION_DAYS * 86400,
  };
  await transact([
    put(siteId, "SHOPPER", digest(token), session),
    {
      Delete: {
        TableName: config.table,
        Key: key(siteId, "SIGNIN", id),
        // A code works once.
        ConditionExpression: "#hash = :hash",
        ExpressionAttributeNames: { "#hash": "hash" },
        ExpressionAttributeValues: { ":hash": row.hash },
      },
    },
  ]);
  return { token, email };
}
/** The signed-in shopper's email, from the token their browser sent. */
export async function shopper(siteId: string, token: unknown) {
  insist(accountsOpen(), 503, "This store can’t offer accounts yet.");
  insist(
    typeof token === "string" && /^[a-f0-9]{64}$/.test(token),
    401,
    "Sign in to view your account.",
  );
  const session = await read<ShopperSession>(siteId, "SHOPPER", digest(token));
  insist(
    session && session.expires > epoch(),
    401,
    "Your sign-in expired. Sign in again.",
  );
  return session.email;
}
export async function signOutShopper(siteId: string, token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return;
  await db.send(
    new DeleteCommand({
      TableName: config.table,
      Key: key(siteId, "SHOPPER", digest(token)),
    }),
  );
}
/** The orders placed with this email, newest first (the BUYER index; a scan for older stores). */
export async function shopperOrders(siteId: string, email: string) {
  const rows = await recent<{ orderId: string }>(
    siteId,
    `BUYER#${buyerKey(email)}`,
    100,
  );
  if (rows.length) {
    const orders = await Promise.all(
      rows.map((row) => read<PrivateOrder>(siteId, "ORDER", row.orderId)),
    );
    return orders.filter((o): o is PrivateOrder => !!o);
  }
  // Orders from before the index existed.
  return (await list<PrivateOrder>(siteId, "ORDER").catch(() => [])).filter(
    (order) => order.email.toLowerCase() === email,
  );
}
