import { beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createProject } from "../../src/studio/templates";
import type { DomainConnection } from "../../src/cloud/client";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
let token = "",
  other = "",
  siteId = "",
  defaultUrl = "",
  firstRelease = "";
let domain: DomainConnection;
const hostname = `shop-${randomUUID().slice(0, 8)}.mybusiness.test`;
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
  headers: Record<string, string> = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${auth}`,
      "content-type": "application/json",
      ...headers,
    },
    body:
      body instanceof Buffer
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const domainPath = () => `/sites/${siteId}/domains/${domain.id}`;
async function check() {
  const result = await call(`${domainPath()}/check`, "POST", {});
  expect(result.status).toBe(200);
  domain = result.data.domain;
  return domain;
}
async function apply() {
  expect(
    (
      await call(`${domainPath()}/local-dns`, "POST", {
        records: domain.records,
      })
    ).status,
  ).toBe(200);
}
async function published() {
  for (let i = 0; i < 100; i++) {
    const site = (await call(`/sites/${siteId}`)).data.site;
    if (!["queued", "publishing"].includes(site.status)) return site;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Publishing timed out");
}
beforeAll(async () => {
  token = (
    await call(
      "/auth/register",
      "POST",
      {
        email: `domain-${randomUUID()}@local.test`,
        password: "Local-domain-password42",
      },
      "",
    )
  ).data.token;
  other = (
    await call(
      "/auth/register",
      "POST",
      {
        email: `other-domain-${randomUUID()}@local.test`,
        password: "Local-domain-password42",
      },
      "",
    )
  ).data.token;
  expect(token).toBeTruthy();
  expect(other).toBeTruthy();
  siteId = (await call("/sites", "POST", { name: "Domain test" })).data.site.id;
  const saved = await call(
    `/sites/${siteId}/draft`,
    "PUT",
    gzipSync(JSON.stringify(createProject("table"))),
    token,
    { "content-type": "application/gzip", "if-match": "0" },
  );
  expect(saved.status).toBe(200);
});
describe(
  "real local domain onboarding and publishing",
  { concurrent: false },
  () => {
    it("creates an idempotent connection and enforces ownership of the site", async () => {
      const created = await call(`/sites/${siteId}/domains`, "POST", {
        hostname,
      });
      expect(created.status).toBe(201);
      domain = created.data.domain;
      expect(domain.status).toBe("ownership");
      expect(domain.local).toBe(true);
      expect(
        (await call(`/sites/${siteId}/domains`, "POST", { hostname })).data
          .domain.id,
      ).toBe(domain.id);
      expect(
        (await call(`/sites/${siteId}/domains`, "GET", undefined, other))
          .status,
      ).toBe(404);
      expect(
        (
          await call(
            `${domainPath()}/local-dns`,
            "POST",
            { records: domain.records },
            other,
          )
        ).status,
      ).toBe(404);
      expect((await check()).status).toBe("ownership");
    });
    it("requires separate ownership, certificate and routing records before connecting", async () => {
      await apply();
      expect((await check()).status).toBe("certificate");
      expect(
        domain.records.some((record) => record.purpose === "certificate"),
      ).toBe(true);
      await apply();
      expect((await check()).status).toBe("dns");
      expect(
        domain.records.some((record) => record.purpose === "routing"),
      ).toBe(true);
      await apply();
      expect((await check()).status).toBe("connected");
      expect((await fetch(domain.url!)).status).toBe(404); // Connected domain, unpublished content.
      expect((await call(`${domainPath()}/primary`, "POST", {})).status).toBe(
        200,
      );
      expect((await call(`/sites/${siteId}`)).data.site.primaryDomain).toBe(
        hostname,
      );
    });
    it("publishes on the owned-domain preview with working same-origin assets", async () => {
      expect(
        (await call(`/sites/${siteId}/publish`, "POST", { version: 1 })).status,
      ).toBe(202);
      const site = await published();
      expect(site.status).toBe("published");
      firstRelease = site.publishedRelease;
      defaultUrl = site.defaultUrl;
      expect(site.url).toBe(domain.url);
      const page = await fetch(site.url);
      expect(page.status).toBe(200);
      const html = await page.text();
      const css = html.match(/href="([^"]+styles.css)"/)?.[1];
      expect(css).toMatch(/^\/sites\//);
      expect((await fetch(new URL(css!, site.url))).status).toBe(200);
      expect((await fetch(new URL("contact.html", site.url))).status).toBe(200);
      expect(
        (await fetch(new URL("project.forma.json", site.url))).status,
      ).toBe(404);
      expect((await check()).status).toBe("connected");
      expect((await fetch(site.url)).status).toBe(200);
    });
    it("disconnects only the custom domain and reconnects without rebuilding the website", async () => {
      expect(
        (await call(`${domainPath()}/disconnect`, "POST", {})).data.domain
          .status,
      ).toBe("disconnected");
      expect((await fetch(domain.url!)).status).toBe(404);
      expect((await fetch(defaultUrl)).status).toBe(200);
      expect(
        (await call(`/sites/${siteId}`)).data.site.primaryDomain,
      ).toBeUndefined();
      expect((await check()).status).toBe("connected");
      expect((await fetch(domain.url!)).status).toBe(200);
      expect((await call(`/sites/${siteId}`)).data.site.publishedRelease).toBe(
        firstRelease,
      );
    });
    it("prevents another tenant from claiming or disabling an already verified domain", async () => {
      const otherSite = (
        await call("/sites", "POST", { name: "Another workspace" }, other)
      ).data.site.id;
      const pending = (
        await call(`/sites/${otherSite}/domains`, "POST", { hostname }, other)
      ).data.domain;
      const path = `/sites/${otherSite}/domains/${pending.id}`;
      expect(
        (
          await call(
            `${path}/local-dns`,
            "POST",
            { records: pending.records },
            other,
          )
        ).status,
      ).toBe(200);
      expect((await call(`${path}/check`, "POST", {}, other)).status).toBe(409);
      expect((await call(`${path}/remove`, "POST", {}, other)).status).toBe(
        200,
      );
      expect((await fetch(domain.url!)).status).toBe(200);
      expect(
        (await call(`${domainPath()}/primary`, "POST", {}, other)).status,
      ).toBe(404);
    });
    it("deactivates a connection when ownership proof disappears and enforces a recoverable quota", async () => {
      const connectedUrl = domain.url!;
      expect(
        (await call(`${domainPath()}/local-dns`, "POST", { records: [] }))
          .status,
      ).toBe(200);
      expect((await check()).status).toBe("ownership");
      expect((await fetch(connectedUrl)).status).toBe(404);
      await apply();
      expect((await check()).status).toBe("connected");
      const second = (
        await call(`/sites/${siteId}/domains`, "POST", {
          hostname: `www.${hostname}`,
        })
      ).data.domain;
      expect(
        (
          await call(`/sites/${siteId}/domains`, "POST", {
            hostname: `third.${hostname}`,
          })
        ).status,
      ).toBe(409);
      expect(
        (await call(`/sites/${siteId}/domains/${second.id}/remove`, "POST", {}))
          .status,
      ).toBe(200);
      expect(
        (await call(`/sites/${siteId}/domains`)).data.domains,
      ).toHaveLength(1);
      expect(
        (
          await call(`${domainPath()}/local-dns`, "POST", {
            records: [{ type: "MX" }],
          })
        ).status,
      ).toBe(422);
      expect((await fetch(domain.url!)).status).toBe(200);
    });
    it("unpublishes all addresses, removes the connection, and releases its quota", async () => {
      expect(
        (await call(`/sites/${siteId}/unpublish`, "POST", { version: 1 }))
          .status,
      ).toBe(202);
      await published();
      expect((await fetch(domain.url!)).status).toBe(404);
      expect((await fetch(defaultUrl)).status).toBe(404);
      expect(
        (await call(`${domainPath()}/remove`, "POST", {})).data.domain.status,
      ).toBe("removed");
      expect(
        (await call(`/sites/${siteId}/domains`)).data.domains,
      ).toHaveLength(0);
      expect(
        (await call(`/sites/${siteId}/domains`, "POST", { hostname })).status,
      ).toBe(201);
    });
  },
);
