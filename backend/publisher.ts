import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  UpdateKeysCommand,
  GetKeyCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import { config, local, epoch, isConditional, insist } from "./config";
import { db, getItem, siteKey, putItem, deleteItem } from "./database";
import { getSite, listReleases } from "./sites";
import { readObject, writeObject, deleteObject } from "./objects";
import { decodeProject } from "./project";
import { compileSite } from "./compiler";
import { publicationCommerce } from "./commerce-publishing";
import { activateInbox, inboxConfig, writeInboxConfig } from "./inbox";
import type { Job, Release } from "./types";

const kvs = new CloudFrontKeyValueStoreClient({ region: config.region });
async function liveRelease(siteId: string) {
  if (local)
    return (
      await getItem<{ releaseId: string }>("LOCAL_ROUTES", `SITE#${siteId}`)
    )?.releaseId;
  try {
    return (
      await kvs.send(new GetKeyCommand({ KvsARN: config.kvsArn, Key: siteId }))
    ).Value;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException")
      return undefined;
    throw error;
  }
}
async function completeJob(job: Job, releaseId?: string) {
  await db.send(
    new UpdateCommand({
      TableName: config.table,
      Key: siteKey(job.owner, job.siteId),
      UpdateExpression:
        job.action === "unpublish"
          ? "SET #status = :status REMOVE publishedRelease, publishedAt, lockedUntil, workerUntil, #error"
          : "SET #status = :status, publishedRelease = :release, publishedAt = :at REMOVE lockedUntil, workerUntil, #error",
      ConditionExpression: "job.id = :id",
      ExpressionAttributeNames: { "#status": "status", "#error": "error" },
      ExpressionAttributeValues: {
        ":id": job.id,
        ":status": job.action === "unpublish" ? "unpublished" : "published",
        ...(job.action === "unpublish"
          ? {}
          : { ":release": releaseId, ":at": new Date().toISOString() }),
      },
    }),
  );
}
// Reconcile a pointer switch that succeeded just before a DB/network failure.
export async function recoverPublishedJob(job: Job) {
  const site = await getSite(job.owner, job.siteId);
  if (site.job?.id !== job.id) return true;
  const target =
    job.action === "publish"
      ? job.id
      : job.action === "rollback"
        ? job.releaseId
        : undefined;
  if ((await liveRelease(job.siteId)) !== target) return false;
  await activateInbox(job.owner, job.siteId, target);
  await completeJob(job, target);
  return true;
}
export async function promote(siteId: string, releaseId?: string) {
  if (local) {
    if (releaseId)
      await putItem({ pk: "LOCAL_ROUTES", sk: `SITE#${siteId}`, releaseId });
    else await deleteItem("LOCAL_ROUTES", `SITE#${siteId}`);
    return;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await kvs.send(
      new DescribeKeyValueStoreCommand({ KvsARN: config.kvsArn }),
    );
    try {
      await kvs.send(
        new UpdateKeysCommand({
          KvsARN: config.kvsArn,
          IfMatch: state.ETag,
          ...(releaseId
            ? { Puts: [{ Key: siteId, Value: releaseId }] }
            : { Deletes: [{ Key: siteId }] }),
        }),
      );
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "ConflictException" ||
        attempt === 4
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}
export async function publishJob(job: Job) {
  const site = await getSite(job.owner, job.siteId);
  if (
    site.job?.id !== job.id ||
    !["queued", "publishing"].includes(site.status)
  )
    return;
  insist(
    epoch() - job.createdAt < config.lockSeconds - 120,
    409,
    "This publish expired. Please publish again.",
  );
  // A conditional lease prevents duplicate queue deliveries from publishing concurrently.
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: siteKey(job.owner, job.siteId),
        UpdateExpression: "SET #status = :publishing, workerUntil = :until",
        ConditionExpression:
          "job.id = :id AND (attribute_not_exists(workerUntil) OR workerUntil < :now)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":publishing": "publishing",
          ":until": epoch() + 120,
          ":id": job.id,
          ":now": epoch(),
        },
      }),
    );
  } catch (error) {
    if (isConditional(error))
      throw new Error("Job already has an active worker");
    throw error;
  }
  let releaseId = job.releaseId;
  try {
    if (job.action === "publish") {
      const { project } = decodeProject(
        await readObject("drafts", job.draftKey!),
      );
      releaseId = job.id;
      const prefix = `sites/${job.siteId}/releases/${releaseId}`;
      const commerce = await publicationCommerce(job.siteId);
      await writeInboxConfig(job.siteId, releaseId, inboxConfig(project));
      const files = await compileSite(
        project,
        `/${prefix}`,
        commerce,
        `${config.apiOrigin}/inbox/${job.siteId}`,
      );
      // Bounded uploads; promote only after every artifact and its manifest are durable.
      for (let i = 0; i < files.length; i += 4)
        await Promise.all(
          files
            .slice(i, i + 4)
            .map((file) =>
              writeObject(
                "sites",
                `${prefix}/${file.name}`,
                file.body,
                file.type,
              ),
            ),
        );
      const release: Release = {
        pk: `SITE#${job.siteId}`,
        sk: `RELEASE#${releaseId}`,
        id: releaseId,
        owner: job.owner,
        siteId: job.siteId,
        version: job.version,
        createdAt: new Date().toISOString(),
        files: files.map((f) => `${prefix}/${f.name}`),
        compilerVersion: config.compilerVersion,
        commerceChecksum: commerce.checksum,
      };
      await putItem({ ...release });
    }
    if (job.action === "rollback") {
      const release = await getItem<Release>(
        `SITE#${job.siteId}`,
        `RELEASE#${releaseId}`,
      );
      insist(
        release?.owner === job.owner,
        404,
        "The selected release is unavailable.",
      );
    }
    const latest = await getSite(job.owner, job.siteId);
    insist(
      latest.job?.id === job.id && epoch() < (latest.lockedUntil || 0),
      409,
      "The publish lock expired.",
    );
    await promote(
      job.siteId,
      job.action === "unpublish" ? undefined : releaseId,
    );
    // Forms only accept requests for items in the live release; unpublishing closes them.
    await activateInbox(
      job.owner,
      job.siteId,
      job.action === "unpublish" ? undefined : releaseId,
    );
    await completeJob(job, releaseId);
    // Retain the live release plus the newest alternatives. Cleanup never breaks a successful publish.
    try {
      const releases = await listReleases(job.owner, job.siteId);
      const keep = new Set([
        releaseId,
        ...releases
          .filter((r) => r.id !== releaseId)
          .slice(0, config.keepReleases - (releaseId ? 1 : 0))
          .map((r) => r.id),
      ]);
      for (const old of releases.filter((r) => !keep.has(r.id))) {
        for (const file of old.files) await deleteObject("sites", file);
        await deleteObject("drafts", `inbox/${job.siteId}/${old.id}.json`);
        await deleteItem(old.pk, old.sk);
      }
    } catch {
      console.warn("release_cleanup_failed", { siteId: job.siteId });
    }
  } catch (error) {
    await db
      .send(
        new UpdateCommand({
          TableName: config.table,
          Key: siteKey(job.owner, job.siteId),
          UpdateExpression: "REMOVE workerUntil",
          ConditionExpression: "job.id = :id",
          ExpressionAttributeValues: { ":id": job.id },
        }),
      )
      .catch(() => {});
    throw error;
  }
}
