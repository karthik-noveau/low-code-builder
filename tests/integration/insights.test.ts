/**
 * Search and insights end to end: a published site carries its canonical
 * address, social cards, structured data, sitemap and robots.txt; each store
 * product gets its own page with Product data; insights.js page views are
 * counted per day (visitors once), and orders are credited to the campaign
 * the shopper came from.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createProject } from "../../src/studio/templates";
import { emptySeo } from "../../src/studio/seo";
import type { CommerceOverview } from "../../src/commerce/types";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
let token = "",
  site = "",
  root = "";
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
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : undefined };
}
const admin = (path = "", method = "GET", input?: unknown) =>
  call(`/sites/${site}/commerce${path ? `/${path}` : ""}`, method, input);
const page = async (path: string) => {
  const response = await fetch(`${root}/${path}`);
  return {
    status: response.status,
    text: await response.text(),
    type: response.headers.get("content-type"),
  };
};

beforeAll(async () => {
  token = (
    await call(
      "/auth/register",
      "POST",
      {
        email: `insights-${randomUUID()}@local.test`,
        password: "Local-insights-password-42",
      },
      "",
    )
  ).data.token;
  site = (await call("/sites", "POST", { name: "Leafy" })).data.site.id;
  const overview = (await admin()).data as CommerceOverview;
  expect(
    (await admin("settings", "PUT", { ...overview.settings, enabled: true }))
      .status,
  ).toBe(200);
  expect(
    (
      await admin("products", "POST", {
        title: "Snake Plant",
        description: "Hard to kill.",
        collection: "Indoor",
        image: "https://images.example.com/snake.jpg",
        status: "active",
        handle: "snake-plant",
        variants: [
          { title: "Default", sku: "SNK", price: 1850, stock: 5, prices: {} },
        ],
      })
    ).status,
  ).toBe(200);
  const project = createProject();
  project.name = "Leafy";
  project.pages.push({
    ...structuredClone(project.pages[0]),
    id: randomUUID(),
    slug: "about",
    name: "About",
    title: "About Leafy",
    description: "Who we are and how we grow our plants.",
    sections: [],
  });
  project.pages.push({
    ...structuredClone(project.pages[0]),
    id: randomUUID(),
    slug: "secret",
    name: "Secret",
    sections: [],
    noindex: true,
  });
  project.seo = {
    ...emptySeo(),
    language: "en-IN",
    image: "https://images.example.com/share.jpg",
    business: {
      ...emptySeo().business,
      type: "Store",
      name: "Leafy Plants",
      phone: "+91 98450 00000",
      city: "Pune",
      country: "IN",
    },
    social: ["https://instagram.com/leafy"],
    google: "google-token-123",
    ga4: "G-TEST1234",
  };
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
  for (let i = 0; i < 150 && !root; i++) {
    const { data } = await call(`/sites/${site}`);
    if (data.site.status === "published")
      root = data.site.url.replace(/\/$/, "");
    else if (data.site.status === "failed") throw new Error(data.site.error);
    else await new Promise((r) => setTimeout(r, 200));
  }
  expect(root).toBeTruthy();
}, 60_000);

describe("search", () => {
  it("describes pages to search engines and social apps", async () => {
    const home = (await page("")).text;
    expect(home).toContain('<html lang="en-IN">');
    expect(home).toContain(`<link rel="canonical" href="${root}/">`);
    expect(home).toContain(
      '<meta property="og:image" content="https://images.example.com/share.jpg">',
    );
    expect(home).toContain('name="twitter:card" content="summary_large_image"');
    expect(home).toContain(
      'name="google-site-verification" content="google-token-123"',
    );
    expect(home).toContain('"@type":"WebSite"');
    expect(home).toContain('"@type":"Store","name":"Leafy Plants"');
    expect(home).toContain('"sameAs":["https://instagram.com/leafy"]');
    expect(home).toContain('src="insights.js" data-api="');
    expect(home).toContain('data-ga="G-TEST1234" data-consent="1"');
    const about = (await page("about")).text;
    expect(about).toContain(`<link rel="canonical" href="${root}/about">`);
    expect(about).toContain('"@type":"BreadcrumbList"');
    expect((await page("secret")).text).toContain(
      'content="noindex, nofollow"',
    );
  });
  it("publishes a sitemap and robots.txt", async () => {
    const sitemap = await page("sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.type).toContain("xml");
    expect(sitemap.text).toContain(`<loc>${root}/about</loc>`);
    expect(sitemap.text).toContain(`<loc>${root}/products/snake-plant</loc>`);
    expect(sitemap.text).not.toContain("secret");
    const robots = await page("robots.txt");
    expect(robots.text).toContain("Disallow: /secret");
    expect(robots.text).toContain(`Sitemap: ${root}/sitemap.xml`);
    expect((await page("insights.js")).text).toContain("sendBeacon");
  });
  it("gives each product its own page at its Shopify address", async () => {
    const product = await page("products/snake-plant");
    expect(product.status).toBe(200);
    expect(product.text).toContain("<title>Snake Plant — Leafy</title>");
    expect(product.text).toContain('"@type":"Product"');
    expect(product.text).toContain('"price":"18.50","priceCurrency":"USD"');
    expect(product.text).toContain("Buy now");
    expect(product.text).toContain(`/store?site=${site}&amp;product=`);
  });
});

describe("insights", () => {
  const hit = (body: object, agent = "Mozilla/5.0 (Test) Chrome/120") =>
    call(`/track/${site}`, "POST", JSON.stringify(body), "", {
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": agent,
    });
  it("counts views, visitors once, sources and devices", async () => {
    expect((await hit({ p: "/", r: "google.com", w: 1400 })).status).toBe(204);
    await hit({ p: "/about", r: "", w: 1400 });
    await hit(
      { p: "/", s: "newsletter", m: "email", c: "spring-sale", w: 390 },
      "Mozilla/5.0 (Phone) Safari/17",
    );
    await hit({ p: "/", w: 1400 }, "Googlebot/2.1");
    await hit({ p: "/<script>", w: 1400 }, "Mozilla/5.0 (Other) Firefox/120");
    // The first visitor again: a view, not a new visit.
    expect((await hit({ p: "/" })).status).toBe(204);
    const { data } = await call(`/sites/${site}/insights?days=7`);
    expect(data.tracking).toBe(true);
    expect(data.series).toHaveLength(7);
    // Six hits, less the crawler.
    expect(data.totals.views).toBe(5);
    expect(data.totals.visitors).toBe(3);
    expect(data.pages).toContainEqual(["/", 4]);
    expect(data.pages).toContainEqual(["/about", 1]);
    expect(data.referrers).toContainEqual(["google.com", 1]);
    expect(data.campaigns).toEqual([["spring-sale", 1]]);
    expect(data.devices).toContainEqual(["mobile", 1]);
    expect(
      (await call(`/sites/${site}/insights`, "GET", undefined, "")).status,
    ).toBe(401);
  });
  it("credits orders to the campaign they came from", async () => {
    const shop = (path: string, input?: unknown) =>
      call(
        `/store/${site}/${path}`,
        input === undefined ? "GET" : "POST",
        input,
        "",
      );
    const store = (await call(`/store/${site}`, "GET", undefined, "")).data;
    const product = store.products[0];
    const cart = (
      await shop("cart", {
        lines: [
          {
            productId: product.id,
            variantId: product.variants[0].id,
            quantity: 2,
          },
        ],
        marketId: "default",
        country: "US",
      })
    ).data;
    const order = await shop("checkout", {
      token: cart.token,
      email: "buyer@example.com",
      address: {
        name: "Buyer",
        line1: "1 Main St",
        city: "Test City",
        postalCode: "10001",
        country: "US",
      },
      attribution: {
        source: "Newsletter",
        medium: "email",
        campaign: "spring-sale",
        referrer: "",
      },
    });
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    const paid = await shop(`orders/${order.data.orderId}/pay-local`, {
      receipt: order.data.receipt,
      outcome: "approved",
    });
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    const { data } = await call(`/sites/${site}/insights?days=7`);
    expect(data.totals.orders).toBe(1);
    expect(data.channels[0]).toMatchObject({
      source: "newsletter",
      medium: "email",
      campaign: "spring-sale",
      orders: 1,
    });
    expect(data.funnel.checkouts).toBeGreaterThanOrEqual(1);
  });
});

describe("marketing", () => {
  it("sends a campaign to subscribers in steps, each with their own way out", async () => {
    const shop = (path: string, input: unknown) =>
      call(`/store/${site}/${path}`, "POST", input, "");
    for (const email of ["a@example.com", "b@example.com"])
      expect(
        (await shop("forms", { kind: "newsletter", email, consent: true }))
          .status,
      ).toBe(201);
    const preview = await admin("campaigns", "POST", {
      mode: "preview",
      subject: "Spring sale",
      body: "New plants are in: http://127.0.0.1:5178/store?site=x and https://elsewhere.example.com/",
      audience: "subscribers",
    });
    expect(preview.data.count).toBe(2);
    expect(preview.data.body).toContain("utm_campaign=spring-sale");
    expect(preview.data.body).toContain("https://elsewhere.example.com/");
    expect(preview.data.body).not.toContain("elsewhere.example.com/?utm");
    // buyer@example.com bought (previous test) but never subscribed: never mailed.
    expect(
      (
        await admin("campaigns", "POST", {
          mode: "preview",
          subject: "x",
          body: "y",
          audience: "customers",
        })
      ).data.count,
    ).toBe(0);
    expect(
      (
        await admin("campaigns", "POST", {
          mode: "preview",
          subject: "x",
          body: "y",
          audience: "everyone",
        })
      ).status,
    ).toBe(422);
    const test = await admin("campaigns", "POST", {
      mode: "test",
      subject: "Spring sale",
      body: "Hello",
    });
    expect(test.status, JSON.stringify(test.data)).toBe(200);
    const sent = await admin("campaigns", "POST", {
      mode: "send",
      subject: "Spring sale",
      body: "Hello",
      name: "Spring Sale",
    });
    expect(sent.data).toMatchObject({
      done: true,
      campaign: { name: "spring-sale", total: 2, queued: 2, status: "sent" },
    });
    const overview = (await admin()).data as CommerceOverview;
    const mails = overview.outbox.filter((m) => m.subject === "Spring sale");
    expect(mails.map((m) => m.to).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    const token = mails
      .find((m) => m.to === "a@example.com")!
      .body.match(/unsubscribe=([a-f0-9]{64})/)![1];
    expect((await shop("unsubscribe", { token })).status).toBe(200);
    expect(
      (
        await admin("campaigns", "POST", {
          mode: "preview",
          subject: "x",
          body: "y",
        })
      ).data.count,
    ).toBe(1);
    const listed = await admin("campaigns", "POST", { mode: "list" });
    expect(listed.data.campaigns[0]).toMatchObject({
      name: "spring-sale",
      status: "sent",
    });
    expect(listed.data.campaigns[0].recipients).toBeUndefined();
  });
  it("reminds a shopper about an unpaid checkout once", async () => {
    const shop = (path: string, input?: unknown) =>
      call(
        `/store/${site}/${path}`,
        input === undefined ? "GET" : "POST",
        input,
        "",
      );
    const store = (await call(`/store/${site}`, "GET", undefined, "")).data;
    const product = store.products[0];
    const cart = (
      await shop("cart", {
        lines: [
          {
            productId: product.id,
            variantId: product.variants[0].id,
            quantity: 1,
          },
        ],
        marketId: "default",
        country: "US",
      })
    ).data;
    const order = (
      await shop("checkout", {
        token: cart.token,
        email: "left@example.com",
        address: {
          name: "Lee",
          line1: "1 Main St",
          city: "Test City",
          postalCode: "10001",
          country: "US",
        },
      })
    ).data;
    let current = ((await admin()).data as CommerceOverview).orders.find(
      (o) => o.id === order.orderId,
    )!;
    // Still open: nothing to remind yet.
    expect(
      (
        await admin(`orders/${current.id}`, "POST", {
          revision: current.revision,
          action: "remind",
        })
      ).status,
    ).toBe(409);
    const cancelled = await admin(`orders/${current.id}`, "POST", {
      revision: current.revision,
      action: "cancel",
    });
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
    current = cancelled.data.order;
    const reminded = await admin(`orders/${current.id}`, "POST", {
      revision: current.revision,
      action: "remind",
    });
    expect(reminded.status, JSON.stringify(reminded.data)).toBe(200);
    expect(reminded.data.order.remindedAt).toBeTruthy();
    const mail = ((await admin()).data as CommerceOverview).outbox.find(
      (m) =>
        m.to === "left@example.com" &&
        m.subject === "You left something behind",
    );
    expect(mail?.body).toContain("utm_campaign=abandoned-checkout");
    expect(
      (
        await admin(`orders/${current.id}`, "POST", {
          revision: reminded.data.order.revision,
          action: "remind",
        })
      ).status,
    ).toBe(409);
  });
});
