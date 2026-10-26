import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject } from "../../src/studio/templates";
import { walk, type Node, type NodeType } from "../../src/blocks/model";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
let token = "",
  otherToken = "",
  id = "",
  version = 0,
  url = "",
  firstRelease = "";
const project = createProject();
const email = `test-${randomUUID()}@local.test`;
const password = "Local-test-password-42";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body:
      body instanceof Buffer
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  return { response, data: await response.json() };
}
const draft = () => gzipSync(JSON.stringify(project));
/** The first block of `type` in a page's first section (the hero). */
const heroBlock = (p: typeof project, type: NodeType): Node =>
  [...walk([p.pages[0].sections[0].root!])].find((n) => n.type === type)!;
async function waitForPublish() {
  for (let i = 0; i < 80; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) return data.site;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Publish timed out");
}
beforeAll(async () => {
  const a = await call("/auth/register", "POST", { email, password }, "");
  expect(a.response.status).toBe(200);
  token = a.data.token;
  const b = await call(
    "/auth/register",
    "POST",
    { email: `other-${randomUUID()}@local.test`, password },
    "",
  );
  otherToken = b.data.token;
});
describe("real DynamoDB Local end-to-end flow", { concurrent: false }, () => {
  it("protects the API and checks local account credentials", async () => {
    expect((await call("/sites", "GET", undefined, "")).response.status).toBe(
      401,
    );
    expect(
      (await call("/sites", "GET", undefined, "made-up-token")).response.status,
    ).toBe(401);
    expect(
      (
        await call(
          "/auth/login",
          "POST",
          { email, password: "wrong-password-42" },
          "",
        )
      ).response.status,
    ).toBe(401);
    const result = await call("/auth/login", "POST", { email, password }, "");
    expect(result.response.status).toBe(200);
    expect(
      (
        await call("/sites", "GET", undefined, token, {
          origin: "https://evil.example",
        })
      ).response.status,
    ).toBe(403);
  });
  it("creates a site, saves a compressed draft and reloads it", async () => {
    const created = await call("/sites", "POST", { name: project.name });
    expect(created.response.status).toBe(201);
    id = created.data.site.id;
    const saved = await call(`/sites/${id}/draft`, "PUT", draft(), token, {
      "content-type": "application/gzip",
      "if-match": "0",
    });
    expect(saved.response.status).toBe(200);
    version = saved.data.site.version;
    expect(version).toBe(1);
    expect(saved.data.site.template).toBe(project.template);
    const loaded = await call(`/sites/${id}/draft`);
    expect(loaded.data).toEqual(project);
    expect(loaded.response.headers.get("x-draft-version")).toBe("1");
    expect(
      (await call("/sites")).data.sites.some(
        (site: { id: string }) => site.id === id,
      ),
    ).toBe(true);
  });
  it("isolates drafts, metadata and publish operations between accounts", async () => {
    for (const route of ["", "/draft", "/releases"])
      expect(
        (await call(`/sites/${id}${route}`, "GET", undefined, otherToken))
          .response.status,
      ).toBe(404);
    expect(
      (await call(`/sites/${id}/publish`, "POST", { version }, otherToken))
        .response.status,
    ).toBe(404);
    expect(
      (await call("/sites", "GET", undefined, otherToken)).data.sites,
    ).toEqual([]);
  });
  it("deduplicates unchanged saves and prevents stale/concurrent overwrites", async () => {
    const identical = await call(`/sites/${id}/draft`, "PUT", draft(), token, {
      "content-type": "application/gzip",
      "if-match": "0",
    });
    expect(identical.data.site.version).toBe(version);
    project.name = "Concurrent edit";
    const results = await Promise.all(
      ["First edit", "Second edit"].map((name) =>
        call(
          `/sites/${id}/draft`,
          "PUT",
          gzipSync(JSON.stringify({ ...project, name })),
          token,
          { "content-type": "application/gzip", "if-match": String(version) },
        ),
      ),
    );
    expect(results.map((r) => r.response.status).sort()).toEqual([200, 409]);
    version++;
    Object.assign(project, (await call(`/sites/${id}/draft`)).data);
    expect(
      (
        await call(
          `/sites/${id}/draft`,
          "PUT",
          gzipSync(JSON.stringify({ ...project, name: "Stale change" })),
          token,
          { "content-type": "application/gzip", "if-match": "0" },
        )
      ).response.status,
    ).toBe(409);
  });
  it("publishes only a complete release on a separate origin", async () => {
    const result = await call(`/sites/${id}/publish`, "POST", { version });
    expect(result.response.status).toBe(202);
    const site = await waitForPublish();
    expect(site.status).toBe("published");
    url = site.url;
    firstRelease = site.publishedRelease;
    const repeated = await call(`/sites/${id}/publish`, "POST", { version });
    expect(repeated.data.site.publishedRelease).toBe(firstRelease);
    expect(repeated.data.site.status).toBe("published");
    expect((await call(`/sites/${id}/releases`)).data.releases).toHaveLength(1);
    const page = await fetch(url);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain("Good things");
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    const stylesheet = html.match(/href="([^"]+styles.css)"/)?.[1];
    expect(stylesheet).toContain(`/releases/${firstRelease}/`);
    expect((await fetch(new URL(stylesheet!, url))).status).toBe(200);
    expect((await fetch(`${url}project.forma.json`)).status).toBe(404);
    expect((await fetch(`${url}images/%2e%2e%2fsecret`)).status).toBe(404);
  });
  it("retains the live site during a failed publish, then recovers", async () => {
    heroBlock(project, "image").props.src = "/images/missing.jpg";
    const saved = await call(`/sites/${id}/draft`, "PUT", draft(), token, {
      "content-type": "application/gzip",
      "if-match": String(version),
    });
    version = saved.data.site.version;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await call(`/sites/${id}/publish`, "POST", { version });
    const failed = await waitForPublish();
    expect(failed.status).toBe("failed");
    expect(failed.publishedRelease).toBe(firstRelease);
    expect((await fetch(url)).status).toBe(200);
    heroBlock(project, "image").props.src = "/images/botanical.jpg";
    heroBlock(project, "heading").props.text = "A second release";
    const next = await call(`/sites/${id}/draft`, "PUT", draft(), token, {
      "content-type": "application/gzip",
      "if-match": String(version),
    });
    version = next.data.site.version;
    let retry = await call(`/sites/${id}/publish`, "POST", { version });
    if (retry.response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      retry = await call(`/sites/${id}/publish`, "POST", { version });
    }
    expect(retry.response.status).toBe(202);
    expect((await waitForPublish()).status).toBe("published");
    expect(await (await fetch(url)).text()).toContain("A second release");
  }, 20000);
  it("rolls back and unpublishes without changing the editable draft", async () => {
    expect((await call(`/sites/${id}/releases`)).data.releases).toHaveLength(2);
    await call(`/sites/${id}/rollback`, "POST", {
      version,
      releaseId: firstRelease,
    });
    expect((await waitForPublish()).publishedRelease).toBe(firstRelease);
    expect(await (await fetch(url)).text()).toContain("Good things");
    expect(
      heroBlock((await call(`/sites/${id}/draft`)).data, "heading").props.text,
    ).toBe("A second release");
    await call(`/sites/${id}/unpublish`, "POST", { version });
    expect((await waitForPublish()).status).toBe("unpublished");
    expect((await fetch(url)).status).toBe(404);
    expect(
      (await fetch(`${url}releases/${firstRelease}/index.html`)).status,
    ).toBe(404);
  });
  it("revokes the local session on sign out", async () => {
    await call("/auth/logout", "POST");
    expect((await call("/sites")).response.status).toBe(401);
  });
});
