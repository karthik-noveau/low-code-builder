/**
 * Email to shoppers through Amazon SES. Messages are written to the store's
 * outbox in the same transaction as what they're about (commerce-data.ts
 * `message`); with MAIL_FROM set they start "pending" and also go on a short
 * to-send list (MAILOUT), which is all a sender reads, after the request
 * that wrote them. Each message is claimed with a conditional write that
 * counts the attempt, so two requests never send it at once; a claim older
 * than five minutes, or a failure, is tried again, five attempts in all,
 * then it's "undeliverable". Without MAIL_FROM messages stay
 * "local-preview" (shown in the store's outbox only).
 *
 * Hosted, mail goes through the stack's SES configuration set, which reports
 * bounces and complaints to EventBridge and on to the API function
 * (`onMailEvent`): the message is marked, and an address that bounced for
 * good or complained is never mailed again by any store.
 */
import { createHash } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { config, idPattern, isConditional, local } from "./config";
import { db, getItem } from "./database";
import { key, now, partition, read } from "./commerce-data";
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
          credentials: {
            accessKeyId: "formaLocal",
            secretAccessKey: "localOnly",
          },
        }
      : {}),
  }));
const ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;
const BATCH = 10;
type Stored = OutboxMessage & { attempts?: number; claimedAt?: string };

/** Addresses never to mail again, Forma-wide (hashed). */
const suppression = (address: string) => ({
  pk: "MAILSUPPRESS",
  sk: createHash("sha256").update(address.trim().toLowerCase()).digest("hex"),
});
const isSuppressed = async (address: string) => {
  const k = suppression(address);
  return !!(await getItem(k.pk, k.sk));
};
/** "Store name" <address>, with the name safe inside the quotes. */
const sender = (name: string) =>
  `"${name.replace(/["\\\r\n]/g, "").slice(0, 80) || "Store"}" <${mailFrom()}>`;

const dropOut = (siteId: string, id: string) =>
  db
    .send(
      new DeleteCommand({
        TableName: config.table,
        Key: key(siteId, "MAILOUT", id),
      }),
    )
    .catch(() => undefined);
const mark = (
  siteId: string,
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
) =>
  db.send(
    new UpdateCommand({
      TableName: config.table,
      Key: key(siteId, "MAIL", id),
      UpdateExpression: `SET #s = :s${Object.keys(extra)
        .map((k) => `, ${k} = :${k}`)
        .join("")} REMOVE claimedAt`,
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": status,
        ...Object.fromEntries(
          Object.entries(extra).map(([k, v]) => [`:${k}`, v]),
        ),
      },
    }),
  );
/** Takes a message for sending, counting the attempt; false if it isn't ours to send now. */
async function claim(siteId: string, id: string) {
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, "MAIL", id),
        UpdateExpression:
          "SET #s = :sending, claimedAt = :now ADD attempts :one",
        ConditionExpression:
          "(#s = :pending OR #s = :failed OR (#s = :sending AND claimedAt < :stale)) AND (attribute_not_exists(attempts) OR attempts < :max)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":sending": "sending",
          ":pending": "pending",
          ":failed": "failed",
          ":now": now(),
          ":stale": new Date(Date.now() - LEASE_MS).toISOString(),
          ":one": 1,
          ":max": ATTEMPTS,
        },
      }),
    );
    return true;
  } catch (error) {
    if (isConditional(error)) return false;
    throw error;
  }
}
/**
 * Sends a store's waiting messages (a few per call). Never throws: mail
 * that can't go now is tried again after a later request.
 */
export async function deliverMail(siteId: string) {
  if (!mailFrom()) return;
  try {
    const out = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":prefix": "MAILOUT#",
        },
        Limit: BATCH,
      }),
    );
    const ids = (out.Items ?? []).map((i) =>
      String(i.sk).slice("MAILOUT#".length),
    );
    if (!ids.length) return;
    const settings = await read<StoreSettings>(siteId, "SETTINGS").catch(
      () => undefined,
    );
    for (const id of ids) {
      const m = await read<Stored>(siteId, "MAIL", id);
      if (!m || m.status === "sent" || m.status === "undeliverable") {
        await dropOut(siteId, id);
        continue;
      }
      if (await isSuppressed(m.to)) {
        await mark(siteId, id, "suppressed").catch(() => undefined);
        await dropOut(siteId, id);
        continue;
      }
      if (!(await claim(siteId, id))) {
        // Out of attempts (a send that never reported back): give up on it.
        if (
          (m.attempts ?? 0) >= ATTEMPTS &&
          Date.parse(m.claimedAt ?? "") < Date.now() - LEASE_MS
        ) {
          await mark(siteId, id, "undeliverable").catch(() => undefined);
          await dropOut(siteId, id);
        }
        continue;
      }
      try {
        await ses().send(
          new SendEmailCommand({
            FromEmailAddress: sender(settings?.name ?? ""),
            Destination: { ToAddresses: [m.to] },
            ...(settings?.contactEmail
              ? { ReplyToAddresses: [settings.contactEmail] }
              : {}),
            // Bounces and complaints come back tagged with the message.
            ...(process.env.MAIL_CONFIGURATION_SET
              ? {
                  ConfigurationSetName: process.env.MAIL_CONFIGURATION_SET,
                  EmailTags: [
                    { Name: "site", Value: siteId },
                    { Name: "mail", Value: id },
                  ],
                }
              : {}),
            Content: {
              Simple: {
                Subject: { Data: m.subject.slice(0, 200), Charset: "UTF-8" },
                Body: {
                  Text: { Data: m.body, Charset: "UTF-8" },
                  ...(m.html
                    ? { Html: { Data: m.html, Charset: "UTF-8" } }
                    : {}),
                },
              },
            },
          }),
        );
      } catch (error) {
        console.error("mail_failed", siteId, id, String(error).slice(0, 200));
        const last = (m.attempts ?? 0) + 1 >= ATTEMPTS;
        await mark(siteId, id, last ? "undeliverable" : "failed", {
          lastError: String(error).slice(0, 200),
        }).catch(() => undefined);
        if (last) await dropOut(siteId, id);
        continue;
      }
      // Sent: record it (twice if need be, so a lost write doesn't resend it).
      await mark(siteId, id, "sent", { sentAt: now() })
        .catch(() => mark(siteId, id, "sent", { sentAt: now() }))
        .catch((error) =>
          console.error("mail_settle_failed", siteId, id, String(error)),
        );
      await dropOut(siteId, id);
    }
  } catch (error) {
    console.error("mail_delivery_failed", siteId, String(error).slice(0, 200));
  }
}

interface MailEvent {
  eventType?: string;
  mail?: { tags?: Record<string, string[]> };
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: { emailAddress?: string }[];
  };
  complaint?: { complainedRecipients?: { emailAddress?: string }[] };
}
/**
 * A bounce or complaint SES reported (the EventBridge event's detail). A
 * permanent bounce or a complaint stops mail to that address; the message,
 * if it's one of ours, says what happened.
 */
export async function onMailEvent(detail: MailEvent) {
  const complained = detail.eventType === "Complaint";
  const bounced = detail.eventType === "Bounce";
  if (!complained && !bounced) return;
  const permanent = complained || detail.bounce?.bounceType === "Permanent";
  const recipients = (
    complained
      ? detail.complaint?.complainedRecipients
      : detail.bounce?.bouncedRecipients
  )
    ?.map((r) => r.emailAddress?.replace(/^.*<([^>]+)>.*$/, "$1"))
    .filter((a): a is string => !!a && a.length <= 254);
  if (permanent)
    for (const address of recipients ?? [])
      await db.send(
        new PutCommand({
          TableName: config.table,
          Item: {
            ...suppression(address),
            reason: complained ? "complaint" : "bounce",
            at: now(),
          },
        }),
      );
  const siteId = detail.mail?.tags?.site?.[0] ?? "";
  const id = detail.mail?.tags?.mail?.[0] ?? "";
  if (!idPattern.test(siteId) || !/^\d+-[0-9a-f-]{36}$/.test(id)) return;
  await db
    .send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, "MAIL", id),
        UpdateExpression: "SET #s = :s",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": complained ? "complained" : "bounced",
        },
      }),
    )
    .catch((error) => {
      if (!isConditional(error)) throw error;
    });
}
