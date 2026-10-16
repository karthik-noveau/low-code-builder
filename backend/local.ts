import { createServer, type IncomingMessage } from "node:http";
import { config, local, HttpError, epoch, idPattern } from "./config";
import {
  initializeDatabase,
  getItem,
  queryItems,
  putItem,
  deleteItem,
} from "./database";
import { api, jsonResponse, type ApiResponse } from "./api";
import {
  localAuthenticate,
  localSession,
  localLogout,
  localRecovery,
  localAccountAction,
} from "./local-auth";
import { publishJob, recoverPublishedJob } from "./publisher";
import { failJob } from "./sites";
import { readObject } from "./objects";
import type { Job } from "./types";

if (!local) throw new Error("The local server cannot run in AWS mode.");
// Fail closed: no configured endpoint can accidentally send local data or credentials to AWS.
for (const address of [
  config.endpoint,
  config.siteOrigin,
  config.editorOrigin,
  config.apiOrigin,
]) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(address).hostname))
    throw new Error("Local mode requires loopback URLs.");
}
await initializeDatabase();
const allowedOrigins = new Set([
  config.editorOrigin,
  config.editorOrigin.replace("127.0.0.1", "localhost"),
]);
async function bodyOf(req: IncomingMessage, limit = config.maxCompressed) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
let workerRunning = false;
async function drainQueue() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    for (const job of await queryItems<
      Job & { attempts: number; retryAt?: number }
    >("LOCAL_QUEUE", "JOB#")) {
      if (job.retryAt && job.retryAt > epoch()) continue;
      try {
        await publishJob(job);
        await deleteItem("LOCAL_QUEUE", `JOB#${job.id}`);
      } catch (error) {
        const attempts = job.attempts + 1;
        if (
          error instanceof HttpError ||
          attempts >= 3 ||
          epoch() - job.createdAt >= config.lockSeconds - 120
        ) {
          if (await recoverPublishedJob(job)) {
            await deleteItem("LOCAL_QUEUE", `JOB#${job.id}`);
            continue;
          }
          await failJob(
            job,
            error instanceof HttpError
              ? error.message
              : "Publishing failed. Your previous live site is unchanged; try publishing again.",
          );
          await putItem({
            ...job,
            pk: "LOCAL_DLQ",
            sk: `JOB#${job.id}`,
            attempts,
          });
          await deleteItem("LOCAL_QUEUE", `JOB#${job.id}`);
        } else
          await putItem({
            ...job,
            pk: "LOCAL_QUEUE",
            sk: `JOB#${job.id}`,
            attempts,
            retryAt: epoch() + 3,
          });
      }
    }
  } catch (error) {
    console.error(
      "local_worker_failed",
      error instanceof Error ? error.name : "Unknown",
    );
  } finally {
    workerRunning = false;
  }
}
const rate = new Map<string, { start: number; count: number }>();
const server = createServer(async (req, res) => {
  let response: ApiResponse;
  try {
    const origin = req.headers.origin;
    // Visitor action forms post from published sites (any origin); they never read the response.
    const publicForm =
      req.method === "POST" && /^\/inbox\/[^/?]+(?:\?|$)/.test(req.url || "");
    if (origin && !allowedOrigins.has(origin) && !publicForm)
      throw new HttpError(403, "Origin is not allowed.");
    const host = req.headers.host?.split(":")[0];
    if (host !== "127.0.0.1" && host !== "localhost")
      throw new HttpError(403, "Host is not allowed.");
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
    }
    res.setHeader(
      "access-control-allow-headers",
      "authorization,content-type,if-match",
    );
    res.setHeader("access-control-expose-headers", "x-draft-version");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", "http://localhost");
    if (
      (url.pathname.startsWith("/store/") ||
        url.pathname.startsWith("/inbox/")) &&
      req.method === "POST"
    ) {
      const id = `store:${req.socket.remoteAddress || "local"}`;
      const prior = rate.get(id);
      const window =
        prior && Date.now() - prior.start < 60000
          ? prior
          : { start: Date.now(), count: 0 };
      rate.set(id, window);
      if (++window.count > 180)
        throw new HttpError(
          429,
          "Too many store requests. Wait a minute and try again.",
        );
    }
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (
      ["/auth/register", "/auth/login", "/auth/forgot", "/auth/reset"].includes(
        url.pathname,
      )
    ) {
      if (req.method !== "POST") throw new HttpError(405, "Use POST.");
      const ip = req.socket.remoteAddress || "local";
      const attempt = rate.get(ip);
      const state =
        attempt && Date.now() - attempt.start < 60000
          ? attempt
          : { start: Date.now(), count: 0 };
      rate.set(ip, state);
      if (++state.count > 30)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in a minute.",
        );
      let input: Record<string, unknown>;
      try {
        input = JSON.parse((await bodyOf(req, 8192)).toString());
      } catch {
        throw new HttpError(400, "Invalid request.");
      }
      response = jsonResponse(
        url.pathname === "/auth/forgot" || url.pathname === "/auth/reset"
          ? await localRecovery(
              url.pathname.endsWith("forgot") ? "forgot" : "reset",
              input,
            )
          : await localAuthenticate(
              url.pathname.endsWith("register") ? "register" : "login",
              input,
            ),
      );
    } else if (url.pathname === "/auth/logout" && req.method === "POST") {
      await localLogout(token);
      response = jsonResponse({ ok: true });
    } else {
      const session = await localSession(token);
      if (
        [
          "/account/password",
          "/account/delete",
          "/account/logout-all",
        ].includes(url.pathname)
      ) {
        if (!session) throw new HttpError(401, "Sign in to continue.");
        if (req.method !== "POST") throw new HttpError(405, "Use POST.");
        let input: Record<string, unknown>;
        try {
          input = JSON.parse((await bodyOf(req, 8192)).toString());
        } catch {
          throw new HttpError(400, "Invalid JSON.");
        }
        response = jsonResponse(
          await localAccountAction(
            session,
            url.pathname.split("/").at(-1) as
              "password" | "delete" | "logout-all",
            input,
          ),
        );
      } else if (url.pathname === "/auth/me") {
        if (!session) throw new HttpError(401, "Sign in to continue.");
        response = jsonResponse({
          user: { id: session.owner, email: session.email },
          expires: session.expires,
        });
      } else
        response = await api({
          method: req.method || "GET",
          path: url.pathname,
          owner: session?.owner,
          email: session?.email,
          body: await bodyOf(req),
          headers: {
            "content-type": req.headers["content-type"],
            "if-match": req.headers["if-match"],
          },
        });
    }
  } catch (error) {
    response = jsonResponse(
      {
        error:
          error instanceof HttpError ? error.message : "Local service error.",
      },
      error instanceof HttpError ? error.status : 500,
    );
    if (!(error instanceof HttpError))
      console.error(
        "local_request_failed",
        error instanceof Error ? error.name : "Unknown",
      );
  }
  res.writeHead(response.status, response.headers);
  res.end(response.body);
  void drainQueue();
});
const contentTypes: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const sitesServer = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD")
      throw new Error("Not found");
    const raw = (req.url || "").split("?")[0];
    const custom = /^\/__domains\/([a-z0-9.-]+)\/(.*)$/.exec(raw);
    let resolved = raw;
    if (custom) {
      const stored = await getItem<{ value: string }>(
        "LOCAL_DOMAINS",
        `HOST#${custom[1]}`,
      );
      if (!stored) throw new Error("Domain not connected");
      const binding = JSON.parse(stored.value) as {
        siteId: string;
        connectionId: string;
        active: boolean;
      };
      if (custom[2] === ".well-known/forma-domain") {
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(
          JSON.stringify({
            hostname: custom[1],
            siteId: binding.siteId,
            connectionId: binding.connectionId,
          }),
        );
        return;
      }
      if (!binding.active) throw new Error("Domain disconnected");
      resolved = `/sites/${binding.siteId}/${custom[2]}`;
    }
    const match = /^\/sites\/([^/]+)\/(.*)$/.exec(resolved);
    if (!match || !idPattern.test(match[1])) throw new Error("Not found");
    const [, id, tail] = match;
    const live = await getItem<{ releaseId: string }>(
      "LOCAL_ROUTES",
      `SITE#${id}`,
    );
    if (!live) throw new Error("Not published");
    const explicit = /^releases\/([^/]+)\/(.*)$/.exec(tail);
    const release = explicit?.[1] || live.releaseId;
    const file = (explicit ? explicit[2] : tail) || "index.html";
    if (
      !idPattern.test(release) ||
      !/^(?:(?:[a-z0-9-]+\/)?[a-z0-9-]+\.html|styles\.css|images\/[a-f0-9]{64}\.(?:png|jpeg|gif|webp))$/.test(
        file,
      )
    )
      throw new Error("Not found");
    const bytes = await readObject(
      "sites",
      `sites/${id}/releases/${release}/${file}`,
    );
    res.writeHead(200, {
      "content-type":
        contentTypes[file.split(".").at(-1)!] || "application/octet-stream",
      "cache-control": explicit
        ? "public,max-age=31536000,immutable"
        : "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy": `default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self' https:; form-action 'self' https: ${config.apiOrigin}; base-uri 'self'; frame-ancestors 'none'`,
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, {
      "content-type": "text/plain",
      "cache-control": "no-store",
    });
    res.end("This site is not published.");
  }
});
server.listen(Number(process.env.API_PORT || 8787), "127.0.0.1", () =>
  console.log("Local API: http://127.0.0.1:8787"),
);
sitesServer.listen(
  Number(new URL(config.siteOrigin).port || 8788),
  "127.0.0.1",
  () => console.log(`Published sites: ${config.siteOrigin}`),
);
// Local-only retry loop. AWS uses SQS event delivery and has no polling process.
const timer = setInterval(() => void drainQueue(), 5000);
void drainQueue();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    server.close();
    sitesServer.close();
    process.exit(0);
  });
