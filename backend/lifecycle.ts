import {
  QueryCommand,
  BatchWriteCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { config, insist, local, epoch } from "./config";
import { db, getItem, siteKey } from "./database";
import { allow, siteAccess } from "./access";
import { deleteObject } from "./objects";
import type { Release } from "./types";

export async function partitionRows(pk: string) {
  const rows: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: cursor,
        ConsistentRead: true,
      }),
    );
    rows.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
    insist(
      rows.length <= 25000,
      409,
      "This workspace requires an offline data export and cleanup.",
    );
  } while (cursor);
  return rows;
}
export async function deleteKeys(keys: { pk: string; sk: string }[]) {
  for (let offset = 0; offset < keys.length; offset += 25) {
    let requests = keys
      .slice(offset, offset + 25)
      .map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length; attempt++) {
      insist(
        attempt < 10,
        503,
        "Cleanup needs a retry. Your deletion remains pending.",
      );
      const result = await db.send(
        new BatchWriteCommand({ RequestItems: { [config.table]: requests } }),
      );
      requests = (result.UnprocessedItems?.[config.table] ||
        []) as typeof requests;
      if (requests.length)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000, 50 * 2 ** attempt)),
        );
    }
  }
}
export async function deleteLocalSite(
  actor: string,
  id: string,
  confirmation: unknown,
) {
  insist(
    local,
    503,
    "Cloud data deletion requires the production retention workflow.",
  );
  const access = await siteAccess(actor, id);
  allow(access, "owner");
  const site = access.site as typeof access.site & { deleting?: boolean };
  insist(
    confirmation === `DELETE ${site.name}`,
    422,
    `Type DELETE ${site.name} to permanently delete this local website and its store data.`,
  );
  insist(
    !site.publishedRelease && !["queued", "publishing"].includes(site.status),
    409,
    "Unpublish this website and wait for publishing to finish before deleting it.",
  );
  const records = await partitionRows(`SITE#${id}`);
  insist(
    records
      .filter((row) => String(row.sk).startsWith("DOMAIN#"))
      .every((row) => row.status === "removed"),
    409,
    "Remove all domain connections before deleting the website.",
  );
  if (!site.deleting)
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(actor, id),
        UpdateExpression: "SET deleting = :yes, lockedUntil = :lock",
        ConditionExpression:
          "attribute_not_exists(publishedRelease) AND (attribute_not_exists(lockedUntil) OR lockedUntil < :now)",
        ExpressionAttributeValues: {
          ":yes": true,
          ":lock": epoch() + 86400,
          ":now": epoch(),
        },
      }),
    );
  await db.send(
    new UpdateCommand({
      TableName: config.table,
      Key: { pk: `COMMERCE#${id}`, sk: "LIFECYCLE#" },
      UpdateExpression: "SET #state = :state",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: { ":state": "deleted" },
    }),
  );
  const commerce = await partitionRows(`COMMERCE#${id}`);
  for (const release of records.filter((row) =>
    String(row.sk).startsWith("RELEASE#"),
  ) as unknown as Release[]) {
    for (const file of release.files)
      await deleteObject(
        "sites",
        file.startsWith("sites/")
          ? file
          : `sites/${id}/releases/${release.id}/${file}`,
      );
  }
  if (site.draftKey) await deleteObject("drafts", site.draftKey);
  const memberGrants = commerce
    .filter((row) => String(row.sk).startsWith("MEMBER#"))
    .map((row) => ({ pk: `USER#${row.id}`, sk: `ACCESS#${id}` }));
  await deleteKeys(
    [...commerce, ...records]
      .filter((row) => row.sk !== "LIFECYCLE#")
      .map((row) => ({ pk: String(row.pk), sk: String(row.sk) }))
      .concat(memberGrants),
  );
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: config.table,
            Key: siteKey(actor, id),
            ConditionExpression: "deleting = :yes",
            ExpressionAttributeValues: { ":yes": true },
          },
        },
        {
          Update: {
            TableName: config.table,
            Key: { pk: `USER#${actor}`, sk: "QUOTA" },
            UpdateExpression: "ADD siteCount :minus",
            ConditionExpression: "siteCount > :zero",
            ExpressionAttributeValues: { ":minus": -1, ":zero": 0 },
          },
        },
      ],
    }),
  );
  return { ok: true };
}
export async function requireNotDeleting(owner: string, id: string) {
  const key = siteKey(owner, id);
  const site = await getItem<{ deleting?: boolean }>(key.pk, key.sk);
  insist(site && !site.deleting, 404, "This website is unavailable.");
}
