import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
const project = createProject();
const services = createCollection("services");
services.items[1].hidden = true;
project.collections = [services];
let token = "",
  otherToken = "",
  viewerToken = "",
  id = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body && !(body instanceof Buffer)
        ? { "content-type": "application/json" }
        : {}),
    },
    body:
      body instanceof Buffer
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => undefined) };
}
/** Posts like a browser submitting the published HTML form. */
const submit = (fields: Record<string, string>, origin = sites) =>
  fetch(`${base}/inbox/${id}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    body: new URLSearchParams(fields),
  });
const booking = (extra: Record<string, string> = {}) => ({
  collection: services.id,
  item: services.items[0].slug,
  name: "Ada Brooks",
  email: "ada@example.com",
  date: "2026-12-01",
  time: "10:30",
  website: "",
  ...extra,
});
beforeAll(async () => {
  const password = "Local-test-password-42";
  token = (
    await call(
      "/auth/register",
      "POST",
      { email: `inbox-${randomUUID()}@local.test`, password },
      "",
    )
  ).data.token;
  otherToken = (
    await call(
      "/auth/register",
      "POST",
      { email: `other-${randomUUID()}@local.test`, password },
      "",
    )
  ).data.token;
  const viewerEmail = `viewer-${randomUUID()}@local.test`;
  viewerToken = (
    await call("/auth/register", "POST", { email: viewerEmail, password }, "")
  ).data.token;
  const created = await call("/sites", "POST", { name: "Inbox test" });
  id = created.data.site.id;
  await call(`/sites/${id}/commerce/members`, "POST", {
    email: viewerEmail,
    role: "viewer",
  });
  const saved = await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
  const version = (await saved.json()).site.version;
  await call(`/sites/${id}/publish`, "POST", { version });
  for (let i = 0; i < 80; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
});
describe("visitor actions reach the inbox", { concurrent: false }, () => {
  it("publishes item pages whose forms post to the inbox", async () => {
    const page = await (
      await fetch(
        `${sites}/sites/${id}/${services.slug}/${services.items[0].slug}.html`,
      )
    ).text();
    expect(page).toContain(`action="${base}/inbox/${id}"`);
    expect((await fetch(`${sites}/sites/${id}/thanks.html`)).status).toBe(200);
  });
  it("rejects requests the live site doesn't offer, bots and bad input", async () => {
    const hidden = await submit(booking({ item: services.items[1].slug }));
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).toContain("no longer accepts requests");
    expect((await submit(booking({ website: "spam" }))).status).toBe(422);
    const missing = await submit(booking({ date: "" }));
    expect(missing.status).toBe(422);
    expect(missing.headers.get("content-type")).toContain("text/html");
    expect((await submit(booking({ email: "<script>" }))).status).toBe(422);
  });
  it("accepts a booking from the published site and redirects to the thank-you page", async () => {
    const response = await submit(booking());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${sites}/sites/${id}/thanks.html`,
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("shows requests only to the site's team and lets them close one", async () => {
    expect(
      (await call(`/sites/${id}/inbox`, "GET", undefined, otherToken)).response
        .status,
    ).toBe(404);
    // Viewers can see the site but not visitors' contact details.
    expect(
      (await call(`/sites/${id}`, "GET", undefined, viewerToken)).response
        .status,
    ).toBe(200);
    expect(
      (await call(`/sites/${id}/inbox`, "GET", undefined, viewerToken)).response
        .status,
    ).toBe(403);
    const { data } = await call(`/sites/${id}/inbox`);
    expect(data.requests).toHaveLength(1);
    const [request] = data.requests;
    expect(request).toMatchObject({
      kind: "book",
      itemTitle: services.items[0].values[services.display.title],
      name: "Ada Brooks",
      fields: { date: "2026-12-01", time: "10:30" },
      status: "new",
    });
    const done = await call(`/sites/${id}/inbox/${request.id}`, "POST", {
      status: "done",
    });
    expect(done.data.request.status).toBe("done");
    expect(
      (await call(`/sites/${id}/inbox/${request.id}`, "POST", { status: "x" }))
        .response.status,
    ).toBe(422);
  });
  it("receives contact messages and email signups from the published site", async () => {
    const page = await (await fetch(`${sites}/sites/${id}/index.html`)).text();
    expect(page).toContain(`action="${base}/inbox/${id}"`);
    expect(page).toContain('name="form" value="newsletter"');
    const signup = await submit({
      form: "newsletter",
      email: "sam@example.com",
      website: "",
    });
    expect(signup.status).toBe(303);
    expect(
      (await submit({ form: "contact", email: "sam@example.com" })).status,
    ).toBe(422);
    const message = await submit({
      form: "contact",
      name: "Sam Lee",
      email: "sam@example.com",
      message: "Do you deliver on weekends?",
      website: "",
    });
    expect(message.status).toBe(303);
    expect(message.headers.get("location")).toBe(
      `${sites}/sites/${id}/thanks.html`,
    );
    const { data } = await call(`/sites/${id}/inbox`);
    expect(data.requests.slice(0, 2)).toMatchObject([
      {
        kind: "contact",
        itemTitle: "Contact form",
        name: "Sam Lee",
        fields: { message: "Do you deliver on weekends?" },
      },
      {
        kind: "newsletter",
        itemTitle: "Email signup",
        email: "sam@example.com",
      },
    ]);
  });
  it("lets the site's team delete a request, and no one else", async () => {
    const before = (await call(`/sites/${id}/inbox`)).data.requests;
    const [request] = before;
    expect(
      (
        await call(
          `/sites/${id}/inbox/${request.id}`,
          "DELETE",
          undefined,
          otherToken,
        )
      ).response.status,
    ).toBe(404);
    expect(
      (
        await call(
          `/sites/${id}/inbox/${request.id}/delete`,
          "POST",
          {},
          otherToken,
        )
      ).response.status,
    ).toBe(404);
    const removed = await call(`/sites/${id}/inbox/${request.id}`, "DELETE");
    expect(removed.response.status).toBe(200);
    const after = (await call(`/sites/${id}/inbox`)).data.requests;
    expect(after).toHaveLength(before.length - 1);
    expect(after.some((r: { id: string }) => r.id === request.id)).toBe(false);
    expect(
      (await call(`/sites/${id}/inbox/${request.id}`, "DELETE")).response
        .status,
    ).toBe(404);
  });
  it("follows the live release: removed items close, rollback reopens them", async () => {
    const settle = async () => {
      for (let i = 0; i < 80; i++) {
        const { data } = await call(`/sites/${id}`);
        if (!["queued", "publishing"].includes(data.site.status))
          return data.site;
        await new Promise((r) => setTimeout(r, 150));
      }
    };
    const first = (await call(`/sites/${id}/releases`)).data.releases[0].id;
    const next = structuredClone(project);
    next.collections![0].items[0].hidden = true;
    let site = (await call(`/sites/${id}`)).data.site;
    const saved = await fetch(`${base}/sites/${id}/draft`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/gzip",
        "if-match": String(site.version),
      },
      body: gzipSync(JSON.stringify(next)),
    });
    site = (await saved.json()).site;
    // Local builds are limited to one a second; retry until this one is accepted.
    for (let i = 0; i < 20; i++) {
      const { response } = await call(`/sites/${id}/publish`, "POST", {
        version: site.version,
      });
      if (response.status !== 429) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    site = await settle();
    expect((await submit(booking())).status).toBe(404);
    await call(`/sites/${id}/rollback`, "POST", {
      version: site.version,
      releaseId: first,
    });
    await settle();
    expect((await submit(booking())).status).toBe(303);
  });
  it("stops accepting requests once unpublished", async () => {
    const { data } = await call(`/sites/${id}`);
    await call(`/sites/${id}/unpublish`, "POST", {
      version: data.site.version,
    });
    for (let i = 0; i < 80; i++) {
      const { data } = await call(`/sites/${id}`);
      if (!["queued", "publishing"].includes(data.site.status)) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect((await submit(booking())).status).toBe(404);
  });
});
