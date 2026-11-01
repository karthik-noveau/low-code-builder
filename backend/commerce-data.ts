import { createHash, randomUUID } from "node:crypto";
import {
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { config, HttpError, isConditional } from "./config";
import { db, getItem } from "./database";
import type { AuditEvent, OutboxMessage } from "../src/commerce/types";

export type Write = NonNullable<
  TransactWriteCommandInput["TransactItems"]
>[number];
export const partition = (siteId: string) => `COMMERCE#${siteId}`;
export const key = (siteId: string, kind: string, id = "") => ({
  pk: partition(siteId),
  sk: `${kind}#${id}`,
});
export const now = () => new Date().toISOString();
export async function read<T>(siteId: string, kind: string, id = "") {
  const k = key(siteId, kind, id);
  const item = await getItem<T & { pk: string; sk: string }>(k.pk, k.sk);
  if (!item) return undefined;
  const { pk: _pk, sk: _sk, ...data } = item;
  void _pk;
  void _sk;
  return data as T;
}
/** The newest `count` rows of a kind (ids that start with a timestamp), never more. */
export async function recent<T>(siteId: string, kind: string, count: number) {
  const result = await db.send(
    new QueryCommand({
      TableName: config.table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": partition(siteId),
        ":prefix": `${kind}#`,
      },
      ScanIndexForward: false,
      Limit: count,
    }),
  );
  return (result.Items || []).map((item) => {
    const { pk: _pk, sk: _sk, ...data } = item;
    void _pk;
    void _sk;
    return data as T;
  });
}
export async function list<T>(
  siteId: string,
  kind: string,
  maximum = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":prefix": `${kind}#`,
        },
        ConsistentRead: true,
        Limit: Math.min(100, maximum - rows.length),
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of result.Items || []) {
      const { pk: _pk, sk: _sk, ...data } = item;
      void _pk;
      void _sk;
      rows.push(data as T);
    }
    cursor = result.LastEvaluatedKey;
  } while (cursor && rows.length < maximum);
  if (cursor)
    throw new HttpError(
      413,
      "This collection exceeds the local workspace limit. Export and archive older records.",
    );
  return rows;
}
export function put(
  siteId: string,
  kind: string,
  id: string,
  value: object,
  revision?: number,
): Write {
  return {
    Put: {
      TableName: config.table,
      Item: { ...key(siteId, kind, id), ...value },
      ConditionExpression:
        revision === undefined
          ? "attribute_not_exists(pk)"
          : "revision = :revision",
      ...(revision === undefined
        ? {}
        : { ExpressionAttributeValues: { ":revision": revision } }),
    },
  };
}
export function audit(
  siteId: string,
  actor: string,
  action: string,
  target: string,
): Write {
  const event: AuditEvent = {
    id: `${Date.now()}-${randomUUID()}`,
    actor,
    action,
    target,
    createdAt: now(),
  };
  return put(siteId, "AUDIT", event.id, event);
}
export function message(
  siteId: string,
  to: string,
  subject: string,
  body: string,
): Write {
  const item: OutboxMessage = {
    id: `${Date.now()}-${randomUUID()}`,
    to,
    subject,
    body,
    // Sent by mail.ts when Forma has an SES sender; a preview otherwise.
    status: process.env.MAIL_FROM ? "pending" : "local-preview",
    createdAt: now(),
  };
  return put(siteId, "MAIL", item.id, item);
}
/** Finds a shopper's orders by email without reading every order (shoppers.ts). */
export const buyerKey = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
export const buyer = (siteId: string, email: string, orderId: string) =>
  put(siteId, "BUYER", `${buyerKey(email)}#${orderId}`, { orderId });
export function event(siteId: string, name: string): Write {
  return {
    Update: {
      TableName: config.table,
      Key: key(siteId, "METRIC", name),
      UpdateExpression: "SET #name = :name ADD #count :one",
      ExpressionAttributeNames: { "#name": "name", "#count": "count" },
      ExpressionAttributeValues: { ":name": name, ":one": 1 },
    },
  };
}
export async function transact(writes: Write[]) {
  // Each message to send also goes on its store's short to-send list
  // (mail.ts), so senders never read the whole outbox.
  writes = [
    ...writes,
    ...writes.flatMap((w): Write[] =>
      w.Put?.Item?.status === "pending" &&
      String(w.Put.Item.sk ?? "").startsWith("MAIL#")
        ? [
            {
              Put: {
                TableName: config.table,
                Item: {
                  pk: w.Put.Item.pk,
                  sk: `MAILOUT#${String(w.Put.Item.sk).slice("MAIL#".length)}`,
                },
              },
            },
          ]
        : [],
    ),
  ];
  // Store events also count toward today's insights (backend/insights.ts),
  // one counter row per day, written with the event.
  const events = new Map<string, string[]>();
  for (const w of writes) {
    const sk = String(w.Update?.Key?.sk ?? "");
    if (sk.startsWith("METRIC#"))
      events.set(String(w.Update!.Key!.pk), [
        ...(events.get(String(w.Update!.Key!.pk)) ?? []),
        sk.slice("METRIC#".length),
      ]);
  }
  for (const [pk, names] of events) {
    const counts = new Map<string, number>();
    for (const n of names)
      counts.set(`e:${n}`, (counts.get(`e:${n}`) ?? 0) + 1);
    const entries = [...counts];
    writes.push({
      Update: {
        TableName: config.table,
        Key: { pk, sk: `STATS#${new Date().toISOString().slice(0, 10)}` },
        UpdateExpression: `SET expires = :expires ADD ${entries.map((_, i) => `#e${i} :e${i}`).join(", ")}`,
        ExpressionAttributeNames: Object.fromEntries(
          entries.map(([name], i) => [`#e${i}`, name]),
        ),
        ExpressionAttributeValues: {
          ":expires": Math.floor(Date.now() / 1000) + 400 * 86400,
          ...Object.fromEntries(entries.map(([, n], i) => [`:e${i}`, n])),
        },
      },
    });
  }
  const partitions = new Set(
    writes
      .map(
        (write) =>
          write.Put?.Item?.pk || write.Update?.Key?.pk || write.Delete?.Key?.pk,
      )
      .filter(
        (value): value is string =>
          typeof value === "string" && value.startsWith("COMMERCE#"),
      ),
  );
  const guards: Write[] = [...partitions].map((pk) => ({
    ConditionCheck: {
      TableName: config.table,
      Key: { pk, sk: "LIFECYCLE#" },
      ConditionExpression: "attribute_not_exists(#state) OR #state = :active",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: { ":active": "active" },
    },
  }));
  try {
    await db.send(
      new TransactWriteCommand({ TransactItems: [...writes, ...guards] }),
    );
  } catch (error) {
    if (isConditional(error))
      throw new HttpError(
        409,
        "The record or stock changed. Refresh and try again.",
      );
    throw error;
  }
}
