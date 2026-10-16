import { randomUUID } from "node:crypto";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config as settings, HttpError, idPattern, insist } from "./config";
import { event, key, now, put, read, transact } from "./commerce-data";
import { db, getItem, putItem } from "./database";
import { readObject, writeObject } from "./objects";
import type { ApiRequest, ApiResponse } from "./api";
import type { Site } from "./types";
import { itemTitle, publishedItems } from "../src/studio/collections";
import type { Project } from "../src/studio/model";
import {
  parseRequest,
  type InboxRequest,
  type RequestKind,
} from "../src/studio/requests";

/**
 * What one release's forms accept, written at publish so visitors can't post
 * to items that aren't live. Kept in object storage (it grows with the
 * catalog); the database only points at the live release's copy.
 */
export interface InboxConfig {
  collections: {
    id: string;
    name: string;
    kind: RequestKind;
    /** Item slug → title. Slugs are [a-z0-9-], so no prototype keys. */
    items: Record<string, string>;
  }[];
}
/** Requests a site accepts per UTC day; bounds storage and inbox size under spam. */
export const DAILY_REQUESTS = 200;
const LIST_LIMIT = 500;
export function inboxConfig(project: Project): InboxConfig {
  const collections: InboxConfig["collections"] = [];
  for (const { collection, item } of publishedItems(project.collections)) {
    if (!collection.request) continue;
    let entry = collections.find((c) => c.id === collection.id);
    if (!entry) {
      entry = {
        id: collection.id,
        name: collection.name.slice(0, 120),
        kind: collection.request.kind,
        items: {},
      };
      collections.push(entry);
    }
    entry.items[item.slug] = itemTitle(collection, item).slice(0, 120);
  }
  return { collections };
}
const objectKey = (siteId: string, releaseId: string) =>
  `inbox/${siteId}/${releaseId}.json`;
export async function writeInboxConfig(
  siteId: string,
  releaseId: string,
  value: InboxConfig,
) {
  await writeObject(
    "drafts",
    objectKey(siteId, releaseId),
    Buffer.from(JSON.stringify(value)),
    "application/json",
  );
}
/** Points the public endpoint at a release's config; no release closes every form. */
export async function activateInbox(
  owner: string,
  siteId: string,
  releaseId?: string,
) {
  await putItem({
    ...key(siteId, "INBOXCFG"),
    owner,
    releaseId: releaseId ?? "",
  });
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const page = (status: number, title: string, body: string): ApiResponse => ({
  status,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
  },
  body: Buffer.from(
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c1c1c}</style></head><body><h1>${escape(title)}</h1><p>${escape(body)}</p></body></html>`,
  ),
});
function fields(request: ApiRequest): Record<string, unknown> {
  insist(request.body.length <= 16 * 1024, 413, "That request is too large.");
  const type = request.headers["content-type"] || "";
  const text = request.body.toString();
  if (type.startsWith("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  try {
    const value: unknown = JSON.parse(text || "{}");
    insist(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Expected a JSON object.",
    );
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function liveConfig(siteId: string) {
  const pointer = await read<{ owner: string; releaseId: string }>(
    siteId,
    "INBOXCFG",
  );
  if (!pointer?.releaseId) return undefined;
  try {
    const value = JSON.parse(
      (
        await readObject("drafts", objectKey(siteId, pointer.releaseId))
      ).toString(),
    ) as InboxConfig;
    return { owner: pointer.owner, value };
  } catch {
    // Releases published before visitor actions existed have no config.
    return undefined;
  }
}
/** The site's current address, so a domain change never strands visitors on an old host. */
async function siteUrl(owner: string, siteId: string) {
  const site = await getItem<Site>(`USER#${owner}`, `SITE#${siteId}`);
  return site?.domainUrl || `${settings.siteOrigin}/sites/${siteId}/`;
}
export async function receiveRequest(
  siteId: string,
  input: Record<string, unknown>,
) {
  insist(idPattern.test(siteId), 404, "This website isn’t accepting requests.");
  // Bots fill every field; people never see this one.
  insist(!input.website, 422, "Your request could not be sent.");
  const live = await liveConfig(siteId);
  insist(live, 404, "This website isn’t accepting requests.");
  const collection = live.value.collections.find(
    (c) => c.id === input.collection,
  );
  const title =
    collection &&
    typeof input.item === "string" &&
    Object.hasOwn(collection.items, input.item)
      ? collection.items[input.item]
      : undefined;
  insist(collection && title, 404, "This item no longer accepts requests.");
  const parsed = parseRequest(collection.kind, input);
  insist(parsed.ok, 422, parsed.ok ? "" : parsed.error);
  const createdAt = now();
  const item: InboxRequest = {
    id: `${Date.now()}-${randomUUID()}`,
    kind: collection.kind,
    collection: collection.id,
    collectionName: collection.name,
    item: input.item as string,
    itemTitle: title,
    name: parsed.name,
    email: parsed.email,
    fields: parsed.fields,
    status: "new",
    createdAt,
  };
  try {
    await transact([
      put(siteId, "REQUEST", item.id, { ...item, revision: 1 }),
      event(siteId, "request.received"),
      {
        Update: {
          TableName: settings.table,
          Key: key(siteId, "INBOXDAY", createdAt.slice(0, 10)),
          UpdateExpression: "ADD #count :one",
          ConditionExpression: "attribute_not_exists(#count) OR #count < :max",
          ExpressionAttributeNames: { "#count": "count" },
          ExpressionAttributeValues: { ":one": 1, ":max": DAILY_REQUESTS },
        },
      },
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      throw new HttpError(
        429,
        "This website has received too many requests today. Please try again tomorrow.",
      );
    throw error;
  }
  return { item, siteUrl: await siteUrl(live.owner, siteId) };
}
/** Public endpoint for visitor action forms. Plain HTML forms get a redirect or a readable page, never JSON. */
export async function inboxPublic(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const match = /^\/inbox\/([^/]+)$/.exec(request.path);
  if (!match) return undefined;
  const form = (request.headers["content-type"] || "").startsWith(
    "application/x-www-form-urlencoded",
  );
  try {
    insist(request.method === "POST", 405, "Use POST.");
    const { siteUrl } = await receiveRequest(match[1], fields(request));
    if (form)
      return {
        status: 303,
        headers: {
          location: new URL("thanks.html", siteUrl).toString(),
          "cache-control": "no-store",
        },
        body: Buffer.alloc(0),
      };
    return {
      status: 201,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: Buffer.from(JSON.stringify({ ok: true })),
    };
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const reason =
      error instanceof HttpError
        ? error.message
        : "Something went wrong. Please try again.";
    if (!(error instanceof HttpError))
      console.error(
        "inbox_failed",
        error instanceof Error ? error.name : "Unknown",
      );
    if (form)
      return page(
        status,
        "Your request wasn’t sent",
        `${reason} Go back to fix it and try again.`,
      );
    return {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: Buffer.from(JSON.stringify({ error: reason })),
    };
  }
}
/** The newest requests, newest first. Older ones stay stored but aren't listed. */
export async function listRequests(siteId: string) {
  const k = key(siteId, "REQUEST");
  const result = await db.send(
    new QueryCommand({
      TableName: settings.table,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": k.pk, ":prefix": k.sk },
      ScanIndexForward: false,
      ConsistentRead: true,
      Limit: LIST_LIMIT,
    }),
  );
  return (result.Items ?? []).map((row) => {
    const { pk: _pk, sk: _sk, ...data } = row;
    void _pk;
    void _sk;
    return data as InboxRequest & { revision: number };
  });
}
export async function updateRequest(
  siteId: string,
  id: string,
  input: Record<string, unknown>,
) {
  insist(/^\d{13}-[a-f0-9-]{36}$/.test(id), 404, "Request not found.");
  insist(
    input.status === "new" || input.status === "done",
    422,
    "Choose new or done.",
  );
  const current = await read<InboxRequest & { revision: number }>(
    siteId,
    "REQUEST",
    id,
  );
  insist(current, 404, "Request not found.");
  const next = {
    ...current,
    status: input.status,
    revision: current.revision + 1,
  };
  await transact([put(siteId, "REQUEST", id, next, current.revision)]);
  return next;
}
