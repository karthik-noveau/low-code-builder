import { randomUUID } from "node:crypto";
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
    status: "local-preview",
    createdAt: now(),
  };
  return put(siteId, "MAIL", item.id, item);
}
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
