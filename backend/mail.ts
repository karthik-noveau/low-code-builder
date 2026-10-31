/**
 * Email to shoppers through Amazon SES. Messages are written to the store's
 * outbox in the same transaction as what they're about (commerce-data.ts
 * `message`); with MAIL_FROM set they start "pending" and are sent here,
 * after the request that wrote them. Each is claimed with a conditional
 * write first, so two requests never send the same one; a claim older than
 * five minutes, or a failure, is tried again, up to five times. Without
 * MAIL_FROM they stay "local-preview" (shown in the store's outbox only).
 */
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, isConditional, local } from "./config";
import { db } from "./database";
import { key, list, now, read } from "./commerce-data";
import type { OutboxMessage, StoreSettings } from "../src/commerce/types";

/** The verified SES address Forma sends from; empty keeps mail as previews. */
export const mailFrom = () => process.env.MAIL_FROM || "";
let client: SESv2Client | undefined;
const ses = () =>
  (client ??= new SESv2Client({
    region: config.region,
    // A stand-in SES (tests) with placeholder credentials, locally only.
    ...(local && process.env.SES_ENDPOINT
      ? {
          endpoint: process.env.SES_ENDPOINT,
          credentials: { accessKeyId: "formaLocal", secretAccessKey: "localOnly" },
        }
      : {}),
  }));
const ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;
type Stored = OutboxMessage & { attempts?: number; claimedAt?: string };

/** "Store name" <address>, with the name safe inside the quotes. */
const sender = (name: string) =>
  `"${name.replace(/["\\\r\n]/g, "").slice(0, 80) || "Store"}" <${mailFrom()}>`;

async function claim(siteId: string, m: Stored) {
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, "MAIL", m.id),
        UpdateExpression: "SET #s = :sending, claimedAt = :now",
        ConditionExpression:
          "#s = :pending OR #s = :failed OR (#s = :sending AND claimedAt < :stale)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":sending": "sending",
          ":pending": "pending",
          ":failed": "failed",
          ":now": now(),
          ":stale": new Date(Date.now() - LEASE_MS).toISOString(),
        },
      }),
    );
    return true;
  } catch (error) {
    if (isConditional(error)) return false;
    throw error;
  }
}
async function settle(siteId: string, m: Stored, sent: boolean, detail = "") {
  await db.send(
    new UpdateCommand({
      TableName: config.table,
      Key: key(siteId, "MAIL", m.id),
      UpdateExpression: sent
        ? "SET #s = :s, sentAt = :now REMOVE claimedAt"
        : "SET #s = :s, attempts = :a, lastError = :e REMOVE claimedAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: sent
        ? { ":s": "sent", ":now": now() }
        : {
            ":s": (m.attempts ?? 0) + 1 >= ATTEMPTS ? "undeliverable" : "failed",
            ":a": (m.attempts ?? 0) + 1,
            ":e": detail.slice(0, 200),
          },
    }),
  );
}
/**
 * Sends a store's waiting messages (a few per call). Never throws: mail
 * that can't go now is tried again after a later request.
 */
export async function deliverMail(siteId: string, store?: Pick<StoreSettings, "name" | "contactEmail">) {
  if (!mailFrom()) return;
  try {
    const waiting = (await list<Stored>(siteId, "MAIL", 5000)).filter(
      (m) =>
        (m.status === "pending" ||
          m.status === "failed" ||
          (m.status === "sending" &&
            Date.parse(m.claimedAt ?? "") < Date.now() - LEASE_MS)) &&
        (m.attempts ?? 0) < ATTEMPTS,
    );
    if (!waiting.length) return;
    const settings =
      store ??
      (await read<StoreSettings>(siteId, "SETTINGS").catch(() => undefined));
    for (const m of waiting.slice(0, 10)) {
      if (!(await claim(siteId, m))) continue;
      try {
        await ses().send(
          new SendEmailCommand({
            FromEmailAddress: sender(settings?.name ?? ""),
            Destination: { ToAddresses: [m.to] },
            ...(settings?.contactEmail
              ? { ReplyToAddresses: [settings.contactEmail] }
              : {}),
            Content: {
              Simple: {
                Subject: { Data: m.subject.slice(0, 200), Charset: "UTF-8" },
                Body: { Text: { Data: m.body, Charset: "UTF-8" } },
              },
            },
          }),
        );
        await settle(siteId, m, true);
      } catch (error) {
        console.error("mail_failed", siteId, m.id, String(error).slice(0, 200));
        await settle(siteId, m, false, String(error)).catch(() => undefined);
      }
    }
  } catch (error) {
    console.error("mail_delivery_failed", siteId, String(error).slice(0, 200));
  }
}
