/**
 * Moving a store to Forma end to end: customers from another store import
 * idempotently with their history and marketing consent, imported products
 * keep their old handle, and a published site answers the old Shopify and
 * Wix addresses (and the owner's own moved pages) with a redirect page,
 * while its own pages are served at clean addresses.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createProject } from "../../src/studio/templates";
import type { CommerceOverview } from "../../src/commerce/types";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
let token = "",
  viewer = "",
  site = "";
const viewerEmail = `migrate-viewer-${randomUUID()}@local.test`;
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const admin = (path = "", method = "GET", input?: unknown, auth = token) =>
  call(`/sites/${site}/commerce${path ? `/${path}` : ""}`, method, input, auth);
const register = async (email: string) =>
  (
    await call(
      "/auth/register",
      "POST",
      { email, password: "Local-migrate-password-42" },
      "",
    )
  ).data.token as string;

beforeAll(async () => {
  token = await register(`migrate-${randomUUID()}@local.test`);
  viewer = await register(viewerEmail);
  site = (await call("/sites", "POST", { name: "Moved store" })).data.site.id;
  const overview = (await admin()).data as CommerceOverview;
  expect(
    (await admin("settings", "PUT", { ...overview.settings, enabled: true }))
      .status,
  ).toBe(200);
  expect(
    (await admin("members", "POST", { email: viewerEmail, role: "viewer" }))
      .status,
  ).toBe(200);
});

describe("store migration", () => {
  it("imports customers once, with their history and consent", async () => {
    const customers = [
      {
        email: "Asha@Example.com",
        name: "Asha Rao",
        phone: "+91 98450 00000",
        marketing: true,
        orders: 7,
        spent: 123450,
      },
      {
        email: "ben@example.com",
        name: "Ben",
        phone: "",
        marketing: false,
        orders: 0,
        spent: 0,
      },
      {
        email: "not-an-email",
        name: "Nope",
        phone: "",
        marketing: true,
        orders: 1,
        spent: 1,
      },
    ];
    const first = await admin("customers", "POST", {
      source: "shopify",
      customers,
    });
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect(first.data).toEqual({
      created: 2,
      updated: 0,
      subscribed: 1,
      skipped: ["not-an-email"],
    });
    // The same file again changes nothing.
    const again = await admin("customers", "POST", {
      source: "shopify",
      customers,
    });
    expect(again.data).toMatchObject({ created: 0, updated: 2, subscribed: 0 });
    const overview = (await admin()).data as CommerceOverview;
    const asha = overview.customers.find((c) => c.email === "asha@example.com");
    expect(asha).toMatchObject({
      name: "Asha Rao",
      orders: 7,
      spent: { USD: 123450 },
      phone: "+91 98450 00000",
      imported: { from: "shopify", orders: 7, spent: 123450, currency: "USD" },
    });
    expect(overview.analytics.returningCustomers).toBe(1);
    expect(
      overview.submissions
        .filter((s) => s.kind === "newsletter" && s.consent)
        .map((s) => s.email),
    ).toEqual(["asha@example.com"]);
    // No welcome email to people who never asked this store for one.
    expect(overview.outbox.some((m) => m.to === "asha@example.com")).toBe(
      false,
    );
    expect(overview.audit.some((a) => a.action === "customers.imported")).toBe(
      true,
    );
    expect(overview.hosting).toEqual({
      local: true,
      mail: expect.any(Boolean),
      payments: false,
    });
  });
  it("keeps customer import to owners and managers, in bounded batches", async () => {
    const one = [
      {
        email: "x@example.com",
        name: "",
        phone: "",
        marketing: false,
        orders: 0,
        spent: 0,
      },
    ];
    expect(
      (
        await admin(
          "customers",
          "POST",
          { source: "shopify", customers: one },
          viewer,
        )
      ).status,
    ).toBe(403);
    expect(
      (await admin("customers", "POST", { source: "etsy", customers: one }))
        .status,
    ).toBe(422);
    expect(
      (await admin("customers", "POST", { source: "csv", customers: [] }))
        .status,
    ).toBe(422);
    expect(
      (
        await admin("customers", "POST", {
          source: "csv",
          customers: Array.from({ length: 201 }, () => one[0]),
        })
      ).status,
    ).toBe(422);
  });
  it("keeps an imported product's old handle and checks it", async () => {
    const product = {
      title: "Linen Shirt",
      description: "Soft linen.",
      collection: "Summer Shirts",
      image: "",
      status: "active",
      handle: "linen-shirt",
      variants: [
        { title: "S", sku: "LIN-S", price: 4000, stock: 3, prices: {} },
      ],
    };
    expect(
      (await admin("products", "POST", { ...product, handle: "Linen Shirt!" }))
        .status,
    ).toBe(422);
    const saved = await admin("products", "POST", product);
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.product.handle).toBe("linen-shirt");
  });
  it("answers old Shopify and Wix addresses on the published site", async () => {
    const project = createProject();
    project.pages.push({
      ...structuredClone(project.pages[0]),
      id: randomUUID(),
      slug: "about",
      name: "About",
      sections: [],
    });
    project.redirects = [
      { from: "pages/about-us", to: "/about" },
      { from: "blogs/news/spring", to: "https://example.com/spring" },
      // A real page at the path wins over a redirect.
      { from: "about", to: "/" },
    ];
    const draft = await fetch(`${base}/sites/${site}/draft`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/gzip",
        "if-match": "0",
      },
      body: gzipSync(JSON.stringify(project)),
    });
    expect(draft.status).toBe(200);
    const version = (await draft.json()).site.version;
    expect(
      (await call(`/sites/${site}/publish`, "POST", { version })).status,
    ).toBe(202);
    let url = "";
    for (let i = 0; i < 150 && !url; i++) {
      const { data } = await call(`/sites/${site}`);
      if (data.site.status === "published") url = data.site.url;
      else await new Promise((r) => setTimeout(r, 200));
    }
    expect(url).toBeTruthy();
    const root = url.replace(/\/(index\.html)?$/, "");
    const page = async (path: string) => {
      const response = await fetch(`${root}/${path}`);
      return { status: response.status, html: await response.text() };
    };
    // Clean addresses serve the site's own pages.
    const about = await page("about");
    expect(about.status).toBe(200);
    expect(about.html).not.toContain("http-equiv");
    expect((await page("about/")).status).toBe(404);
    expect((await page("pages/about-us")).html).toContain('url=../about.html"');
    expect((await page("blogs/news/spring")).html).toContain(
      "url=https://example.com/spring",
    );
    const shirt = await page("products/linen-shirt");
    expect(shirt.status).toBe(200);
    expect(shirt.html).toMatch(
      new RegExp(`url=[^"]*/store\\?site=${site}&#38;product=`),
    );
    expect((await page("product-page/linen-shirt")).html).toContain("product=");
    expect((await page("collections/summer-shirts")).html).toContain(
      "collection=Summer+Shirts",
    );
    expect((await page("collections/all")).html).toContain(
      `/store?site=${site}`,
    );
    expect((await page("products/never-existed")).status).toBe(404);
  });
});
