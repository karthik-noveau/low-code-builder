import { randomUUID } from "node:crypto";
import { UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  config,
  local,
  insist,
  isConditional,
  HttpError,
  epoch,
} from "./config";
import { db, getItem, queryItems, siteKey, putItem } from "./database";
import { readObject, writeObject, deleteObject } from "./objects";
import { decodeProject } from "./project";
import type { Job, Release, Site } from "./types";
import { publicationCommerce } from "./commerce-publishing";

const sqs = new SQSClient({ region: config.region });
export async function getSite(owner: string, id: string) {
  const key = siteKey(owner, id);
  const site = await getItem<Site>(key.pk, key.sk);
  insist(site, 404, "Site not found.");
  return site;
}
export const listSites = (owner: string) =>
  queryItems<Site>(`USER#${owner}`, "SITE#", config.maxSites);
export async function createSite(owner: string, name: unknown) {
  insist(
    typeof name === "string" && name.trim().length > 0 && name.length <= 120,
    422,
    "Enter a name of up to 120 characters.",
  );
  const id = randomUUID(),
    now = new Date().toISOString();
  const site: Site = {
    ...siteKey(owner, id),
    id,
    owner,
    name: name.trim(),
    version: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          ...(local
            ? [
                {
                  ConditionCheck: {
                    TableName: config.table,
                    Key: { pk: `USER#${owner}`, sk: "ACCOUNT" },
                    ConditionExpression:
                      "attribute_not_exists(#state) OR #state = :active",
                    ExpressionAttributeNames: { "#state": "state" },
                    ExpressionAttributeValues: { ":active": "active" },
                  },
                },
              ]
            : []),
          {
            Update: {
              TableName: config.table,
              Key: { pk: `USER#${owner}`, sk: "QUOTA" },
              UpdateExpression: "ADD siteCount :one",
              ConditionExpression:
                "attribute_not_exists(siteCount) OR siteCount < :max",
              ExpressionAttributeValues: { ":one": 1, ":max": config.maxSites },
            },
          },
          {
            Put: {
              TableName: config.table,
              Item: site,
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      }),
    );
  } catch (error) {
    if (isConditional(error))
      throw new HttpError(
        409,
        `This workspace allows ${config.maxSites} sites.`,
      );
    throw error;
  }
  return site;
}
export async function saveDraft(
  owner: string,
  id: string,
  version: number,
  bytes: Buffer,
) {
  const site = await getSite(owner, id);
  const { project, checksum } = decodeProject(bytes);
  if (checksum === site.checksum) return site;
  insist(
    Number.isInteger(version) && version === site.version,
    409,
    "This draft changed in another session. Open the saved version, or save your work as a new site.",
  );
  insist(
    !site.lockedUntil || site.lockedUntil < epoch(),
    423,
    "Publishing is in progress. Your edits are safe in this browser; save again when it finishes.",
  );
  const key = `drafts/${owner}/${id}/${randomUUID()}.json.gz`;
  await writeObject("drafts", key, bytes, "application/gzip");
  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(owner, id),
        UpdateExpression:
          "SET draftKey = :key, checksum = :checksum, #template = :template, #name = :name, #version = :next, updatedAt = :now",
        ConditionExpression:
          "#version = :version AND (attribute_not_exists(lockedUntil) OR lockedUntil < :time)",
        ExpressionAttributeNames: {
          "#name": "name",
          "#version": "version",
          "#template": "template",
        },
        ExpressionAttributeValues: {
          ":key": key,
          ":checksum": checksum,
          ":name": project.name,
          ":template": project.template,
          ":next": version + 1,
          ":version": version,
          ":now": new Date().toISOString(),
          ":time": epoch(),
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    // Cleanup failure must never turn a successful conditional save into a failed save.
    if (site.draftKey)
      await deleteObject("drafts", site.draftKey).catch(() =>
        console.warn("draft_cleanup_failed", { siteId: id }),
      );
    return result.Attributes as Site;
  } catch (error) {
    await deleteObject("drafts", key).catch(() => {});
    if (isConditional(error))
      throw new HttpError(
        409,
        "The draft changed or publishing started. Refresh its status before saving again.",
      );
    throw error;
  }
}
export async function readDraft(owner: string, id: string) {
  const site = await getSite(owner, id);
  insist(site.draftKey, 404, "This site has no saved draft yet.");
  return { site, bytes: await readObject("drafts", site.draftKey) };
}
export async function listReleases(owner: string, id: string) {
  await getSite(owner, id);
  return (await queryItems<Release>(`SITE#${id}`, "RELEASE#"))
    .filter((r) => r.owner === owner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function requestPublish(
  owner: string,
  id: string,
  version: number,
  action: Job["action"],
  releaseId?: string,
) {
  const site = await getSite(owner, id);
  insist(
    site.draftKey && site.version === version,
    409,
    "Save the latest draft before publishing.",
  );
  insist(
    !site.lockedUntil || site.lockedUntil < epoch(),
    423,
    "Another publishing operation is still running.",
  );
  if (action === "rollback") {
    const release = await getItem<Release>(
      `SITE#${id}`,
      `RELEASE#${releaseId}`,
    );
    insist(
      release?.owner === owner,
      404,
      "That release is no longer available.",
    );
  }
  if (action === "publish" && site.publishedRelease) {
    const current = await getItem<Release>(
      `SITE#${id}`,
      `RELEASE#${site.publishedRelease}`,
    );
    if (
      current?.version === version &&
      current.compilerVersion === config.compilerVersion &&
      (current.commerceChecksum || "") ===
        (await publicationCommerce(id)).checksum &&
      site.status === "published"
    )
      return site;
  }
  // Only new builds are rate limited; taking a site offline should always be available.
  insist(
    action !== "publish" ||
      !site.lastPublishAt ||
      epoch() - site.lastPublishAt >= (local ? 1 : 60),
    429,
    "Wait a minute before publishing again.",
  );
  const job: Job = {
    id: randomUUID(),
    owner,
    siteId: id,
    action,
    draftKey: site.draftKey,
    version,
    releaseId,
    createdAt: epoch(),
  };
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(owner, id),
        UpdateExpression:
          "SET #status = :status, job = :job, lockedUntil = :until, lastPublishAt = :now REMOVE #error",
        ConditionExpression:
          "#version = :version AND (attribute_not_exists(lockedUntil) OR lockedUntil < :now)",
        ExpressionAttributeNames: {
          "#status": "status",
          "#version": "version",
          "#error": "error",
        },
        ExpressionAttributeValues: {
          ":status": "queued",
          ":job": job,
          ":until": epoch() + config.lockSeconds,
          ":now": epoch(),
          ":version": version,
        },
      }),
    );
  } catch (error) {
    if (isConditional(error))
      throw new HttpError(409, "The site changed. Refresh and try again.");
    throw error;
  }
  try {
    if (local)
      await putItem({
        pk: "LOCAL_QUEUE",
        sk: `JOB#${job.id}`,
        ...job,
        attempts: 0,
      });
    else
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: config.queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
  } catch (error) {
    await failJob(job, "Could not queue this publish. Please try again.");
    throw error;
  }
  return getSite(owner, id);
}
export async function failJob(job: Job, message: string) {
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(job.owner, job.siteId),
        UpdateExpression:
          "SET #status = :failed, #error = :message REMOVE lockedUntil, workerUntil",
        ConditionExpression: "job.id = :id",
        ExpressionAttributeNames: { "#status": "status", "#error": "error" },
        ExpressionAttributeValues: {
          ":id": job.id,
          ":failed": "failed",
          ":message": message,
        },
      }),
    );
  } catch (error) {
    if (!isConditional(error)) throw error;
  }
}
