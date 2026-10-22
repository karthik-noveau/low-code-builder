import {
  addDomain,
  listDomains,
  publicDomain,
  checkDomain,
  disconnectDomain,
  primaryDomain,
  writeLocalDns,
  removeDomain,
} from "./domains";
import { config, HttpError, insist, idPattern } from "./config";
import {
  createSite,
  getSite,
  listSites,
  saveDraft,
  readDraft,
  listReleases,
  requestPublish,
} from "./sites";
import { publicSite } from "./types";
import { commerceApi } from "./commerce-api";
import { inboxPublic, listRequests, updateRequest } from "./inbox";
import { connect, disconnect, getConnection } from "./payments";
import { allow, sharedSites, siteAccess } from "./access";
import { deleteLocalSite } from "./lifecycle";
import { getItem, putItem } from "./database";

export interface ApiRequest {
  method: string;
  path: string;
  owner?: string;
  email?: string;
  body: Buffer;
  headers: Record<string, string | undefined>;
}
export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
export const jsonResponse = (value: unknown, status = 200): ApiResponse => ({
  status,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
  body: Buffer.from(JSON.stringify(value)),
});
export async function api(request: ApiRequest): Promise<ApiResponse> {
  try {
    const { method, path, body, headers } = request;
    let owner = request.owner;
    if (path === "/health" && method === "GET")
      return jsonResponse({ ok: true });
    const inbox = await inboxPublic(request);
    if (inbox) return inbox;
    const commerce = await commerceApi(request);
    if (commerce) return jsonResponse(commerce.value, commerce.status || 200);
    insist(
      owner && /^[a-zA-Z0-9_-]{1,128}$/.test(owner),
      401,
      "Sign in to continue.",
    );
    const scoped = /^\/sites\/([^/]+)/.exec(path);
    if (scoped) {
      const access = await siteAccess(owner, scoped[1]);
      allow(
        access,
        // The inbox holds visitors' contact details, so viewers can't open it.
        /^\/sites\/[^/]+\/inbox(\/|$)/.test(path)
          ? "edit"
          : method === "GET"
            ? "read"
            : path.endsWith("/draft")
              ? "edit"
              : path.includes("/domains") ||
                  path.endsWith("/delete") ||
                  // Where a site's money goes is the owner's decision.
                  /^\/sites\/[^/]+\/payments(\/|$)/.test(path)
                ? "owner"
                : "manage",
      );
      owner = access.owner;
    }
    const data = () => {
      insist(body.length <= 8192, 413, "Request too large.");
      try {
        const value: unknown = JSON.parse(body.toString() || "{}");
        insist(
          value && typeof value === "object" && !Array.isArray(value),
          400,
          "Expected a JSON object.",
        );
        return value as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Invalid JSON.");
      }
    };
    const show = (site: Parameters<typeof publicSite>[0]) =>
      publicSite(site, config.siteOrigin);
    const paymentsMatch = /^\/sites\/([^/]+)\/payments(\/disconnect)?$/.exec(
      path,
    );
    if (paymentsMatch) {
      const [, siteId, off] = paymentsMatch;
      insist(idPattern.test(siteId), 404, "Not found.");
      if (!off && method === "GET")
        return jsonResponse({ connection: await getConnection(siteId) });
      if (!off && method === "POST")
        return jsonResponse({ connection: await connect(siteId, data()) });
      if (off && method === "POST") {
        await disconnect(siteId);
        return jsonResponse({ connection: null });
      }
      throw new HttpError(405, "Method not allowed.");
    }
    const inboxMatch = /^\/sites\/([^/]+)\/inbox(?:\/([^/]+))?$/.exec(path);
    if (inboxMatch) {
      const [, siteId, requestId] = inboxMatch;
      insist(idPattern.test(siteId), 404, "Not found.");
      if (!requestId && method === "GET")
        return jsonResponse({ requests: await listRequests(siteId) });
      if (requestId && method === "POST")
        return jsonResponse({
          request: await updateRequest(siteId, requestId, data()),
        });
      throw new HttpError(405, "Method not allowed.");
    }
    // When the account last read its notifications, so every browser agrees.
    if (path === "/account/notifications") {
      const key = { pk: `USER#${owner}`, sk: "NOTIFICATIONS" };
      if (method === "GET")
        return jsonResponse({
          seenAt:
            (await getItem<{ seenAt?: string }>(key.pk, key.sk))?.seenAt ?? "",
        });
      if (method === "POST") {
        const seenAt = String(data().seenAt ?? "");
        insist(
          !Number.isNaN(Date.parse(seenAt)) && seenAt.length <= 40,
          400,
          "Expected a date.",
        );
        await putItem({ ...key, seenAt });
        return jsonResponse({ seenAt });
      }
      throw new HttpError(405, "Method not allowed.");
    }
    if (path === "/sites" && method === "GET")
      return jsonResponse({
        sites: [...(await listSites(owner)), ...(await sharedSites(owner))].map(
          show,
        ),
      });
    if (path === "/sites" && method === "POST")
      return jsonResponse(
        { site: show(await createSite(owner, data().name)) },
        201,
      );
    const domainMatch =
      /^\/sites\/([^/]+)\/domains(?:\/([^/]+)(?:\/(check|retry|disconnect|primary|local-dns|remove))?)?$/.exec(
        path,
      );
    if (domainMatch) {
      const [, siteId, domainId, operation] = domainMatch;
      insist(
        idPattern.test(siteId) && (!domainId || idPattern.test(domainId)),
        404,
        "Not found.",
      );
      if (!domainId && method === "GET")
        return jsonResponse({
          domains: (await listDomains(owner, siteId)).map(publicDomain),
        });
      if (!domainId && method === "POST")
        return jsonResponse(
          {
            domain: publicDomain(
              await addDomain(owner, siteId, data().hostname),
            ),
          },
          201,
        );
      if (domainId && method === "POST") {
        const domain =
          operation === "check" || operation === "retry"
            ? await checkDomain(owner, siteId, domainId, operation === "retry")
            : operation === "remove"
              ? await removeDomain(owner, siteId, domainId)
              : operation === "disconnect"
                ? await disconnectDomain(owner, siteId, domainId)
                : operation === "primary"
                  ? await primaryDomain(owner, siteId, domainId)
                  : operation === "local-dns"
                    ? await writeLocalDns(
                        owner,
                        siteId,
                        domainId,
                        data().records,
                      )
                    : undefined;
        insist(domain, 404, "Not found.");
        return jsonResponse({ domain: publicDomain(domain) });
      }
      throw new HttpError(405, "Unsupported domain operation.");
    }
    const match =
      /^\/sites\/([^/]+)(?:\/(draft|releases|publish|rollback|unpublish|delete))?$/.exec(
        path,
      );
    insist(match && idPattern.test(match[1]), 404, "Not found.");
    const [, id, action] = match;
    if (action === "delete" && method === "POST")
      return jsonResponse(
        await deleteLocalSite(request.owner!, id, data().confirmation),
      );
    if (!action && method === "GET")
      return jsonResponse({ site: show(await getSite(owner, id)) });
    if (action === "draft" && method === "GET") {
      const { site, bytes } = await readDraft(owner, id);
      return {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "cache-control": "no-store",
          "x-draft-version": String(site.version),
        },
        body: bytes,
      };
    }
    if (action === "draft" && method === "PUT") {
      insist(
        headers["content-type"]?.startsWith("application/gzip"),
        415,
        "Upload a gzip project.",
      );
      const version = headers["if-match"];
      insist(
        version !== undefined && /^\d+$/.test(version),
        428,
        "A draft version is required.",
      );
      return jsonResponse({
        site: show(await saveDraft(owner, id, Number(version), body)),
      });
    }
    if (action === "releases" && method === "GET")
      return jsonResponse({
        releases: (await listReleases(owner, id)).map((r) => ({
          id: r.id,
          version: r.version,
          createdAt: r.createdAt,
        })),
      });
    if (
      ["publish", "rollback", "unpublish"].includes(action) &&
      method === "POST"
    ) {
      const input = data();
      insist(
        Number.isInteger(input.version) &&
          (action !== "rollback" ||
            (typeof input.releaseId === "string" &&
              idPattern.test(input.releaseId))),
        422,
        "A valid version and release are required.",
      );
      return jsonResponse(
        {
          site: show(
            await requestPublish(
              owner,
              id,
              input.version as number,
              action as "publish" | "rollback" | "unpublish",
              input.releaseId as string | undefined,
            ),
          ),
        },
        202,
      );
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return jsonResponse({ error: error.message }, error.status);
    console.error("api_failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
    return jsonResponse(
      {
        error: "The service could not complete this request. Please try again.",
      },
      500,
    );
  }
}
