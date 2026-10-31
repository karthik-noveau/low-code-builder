import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createProject } from "../../src/studio/templates";
import type { CommerceOverview, Product } from "../../src/commerce/types";
import { refundAmount } from "../../src/commerce/refunds";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
let token = "",
  outsider = "",
  editor = "",
  viewer = "",
  site = "";
let product: Product;
const editorEmail = `editor-${randomUUID()}@local.test`,
  viewerEmail = `viewer-${randomUUID()}@local.test`;
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
const shop = (path = "", input?: unknown) =>
  call(
    `/store/${site}${path ? `/${path}` : ""}`,
    input === undefined ? "GET" : "POST",
    input,
    "",
  );
async function account(email = `commerce-${randomUUID()}@local.test`) {
  return (
    await call(
      "/auth/register",
      "POST",
      { email, password: "Local-commerce-password-42" },
      "",
    )
  ).data.token as string;
}
const variant = (stock = 5) => ({
  id: randomUUID(),
  title: "Small",
  sku: "POT-S",
  stock,
  price: 2500,
  prices: { EUR: 2200 },
});
const customer = (country = "US") => ({
  email: `shopper-${randomUUID()}@local.test`,
  address: {
    name: "Test Shopper",
    line1: "1 Example Street",
    city: "Test City",
    postalCode: "10001",
    country,
  },
});
async function basket(p = product, quantity = 1, extra = {}) {
  const result = await shop("cart", {
    lines: [{ productId: p.id, variantId: p.variants[0].id, quantity }],
    marketId: "default",
    country: "US",
    ...extra,
  });
  expect(result.status).toBe(200);
  return result.data;
}
beforeAll(async () => {
  token = await account();
  outsider = await account();
  editor = await account(editorEmail);
  viewer = await account(viewerEmail);
  site = (await call("/sites", "POST", { name: "Commerce integration test" }))
    .data.site.id;
});
describe("commerce against DynamoDB Local", { concurrent: false }, () => {
  const waitForPublish = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = (await call(`/sites/${site}`)).data.site;
      if (!["queued", "publishing"].includes(result.status)) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Publish timed out.");
  };
  it("keeps private stores closed and hides owner details", async () => {
    expect((await admin()).status).toBe(200);
    expect((await shop()).status).toBe(404);
    expect((await admin("", "GET", undefined, outsider)).status).toBe(404);
    const data = (await admin()).data as CommerceOverview;
    expect(
      (
        await admin("settings", "PUT", {
          ...data.settings,
          enabled: true,
          markets: [
            {
              ...data.settings.markets[0],
              shipping: 500,
              taxBasisPoints: 1000,
            },
            {
              id: "eu",
              name: "Europe",
              currency: "EUR",
              countries: ["FR"],
              language: "fr",
              shipping: 700,
              freeShippingFrom: 10000,
              taxBasisPoints: 2000,
            },
          ],
        })
      ).status,
    ).toBe(200);
    const publicStore = await shop();
    expect(publicStore.data.settings.owner).toBeUndefined();
    expect(publicStore.data.sandbox).toBe(true);
  });
  it("creates variants and rejects invalid money, duplicate variants, and stale edits", async () => {
    const input = {
      title: "Handmade planter",
      description: "Test description",
      image: "/images/plant-1.jpg",
      collection: "Home",
      status: "active",
      variants: [variant()],
      translations: {
        fr: { title: "Pot artisanal", description: "Description" },
      },
    };
    product = (await admin("products", "POST", input)).data.product;
    expect(product.revision).toBe(1);
    expect(
      (await admin("products", "POST", { ...product, revision: 99 })).status,
    ).toBe(409);
    expect(
      (
        await admin("products", "POST", {
          ...input,
          variants: [{ ...input.variants[0], price: -1 }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await admin("products", "POST", {
          ...input,
          variants: [input.variants[0], input.variants[0]],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await admin("products", "POST", {
          ...input,
          image: "javascript:alert(1)",
        })
      ).status,
    ).toBe(422);
  });
  it("calculates prices, discounts, shipping and taxes on the server", async () => {
    expect(
      (
        await admin("discounts", "POST", {
          code: "SAVE10",
          kind: "percent",
          value: 10,
          currency: "USD",
          minimum: 0,
          maxUses: 1,
          expiresAt: "",
          active: true,
        })
      ).status,
    ).toBe(200);
    const cart = await basket(product, 2, {
      discountCode: "SAVE10",
      total: 1,
      subtotal: 1,
    });
    expect(cart.quote).toMatchObject({
      subtotal: 5000,
      discount: 500,
      shipping: 500,
      tax: 500,
      total: 5500,
    });
    const euro = await basket(product, 1, { marketId: "eu", country: "FR" });
    expect(euro.quote).toMatchObject({
      currency: "EUR",
      subtotal: 2200,
      shipping: 700,
      tax: 580,
      total: 3480,
    });
    expect(
      (
        await shop("cart", {
          lines: [
            {
              productId: product.id,
              variantId: product.variants[0].id,
              quantity: 1,
            },
          ],
          country: "XX",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await shop("cart", {
          lines: [
            {
              productId: product.id,
              variantId: product.variants[0].id,
              quantity: 99,
            },
          ],
        })
      ).status,
    ).toBe(409);
    expect(
      (await shop("cart", { token: cart.token, revision: 0, lines: [] }))
        .status,
    ).toBe(409);
  });
  it("declines payments without stock changes and completes a purchase exactly once", async () => {
    const cart = await basket(product, 2, { discountCode: "SAVE10" });
    const details = customer();
    const created = await shop("checkout", { token: cart.token, ...details });
    expect(created.status).toBe(201);
    const repeated = await shop("checkout", { token: cart.token, ...details });
    expect(repeated.data).toEqual(created.data);
    const { orderId, receipt } = created.data;
    expect(
      (await shop(`orders/${orderId}/receipt`, { receipt: "a".repeat(64) }))
        .status,
    ).toBe(404);
    expect(
      (
        await shop(`orders/${orderId}/pay-local`, {
          receipt,
          outcome: "declined",
        })
      ).status,
    ).toBe(402);
    expect(
      ((await admin()).data as CommerceOverview).products[0].variants[0].stock,
    ).toBe(5);
    const paid = await shop(`orders/${orderId}/pay-local`, {
      receipt,
      outcome: "approved",
      amount: 1,
    });
    expect(paid.status).toBe(200);
    expect(paid.data.order.total).toBe(5500);
    expect(paid.data.order.receiptHash).toBeUndefined();
    expect(
      (
        await shop(`orders/${orderId}/pay-local`, {
          receipt,
          outcome: "approved",
        })
      ).data.order.status,
    ).toBe("paid");
    const state = (await admin()).data as CommerceOverview;
    expect(state.products[0].variants[0].stock).toBe(3);
    expect(state.discounts[0].uses).toBe(1);
    expect(state.customers[0].orders).toBe(1);
    expect(state.customers[0].spent.USD).toBe(5500);
    expect(
      (
        await shop("cart", {
          lines: [
            {
              productId: product.id,
              variantId: product.variants[0].id,
              quantity: 1,
            },
          ],
          discountCode: "SAVE10",
        })
      ).status,
    ).toBe(422);
    const fulfilled = await admin(`orders/${orderId}`, "POST", {
      revision: paid.data.order.revision,
      action: "fulfill",
      tracking: "LOCAL-123",
    });
    expect(fulfilled.data.order.status).toBe("fulfilled");
    expect(
      (
        await shop(`orders/${orderId}/return`, {
          receipt: "a".repeat(64),
          reason: "Wrong size",
        })
      ).status,
    ).toBe(404);
    const returned = await shop(`orders/${orderId}/return`, {
      receipt,
      reason: "Wrong size",
    });
    expect(returned.data.order.returnRequest.status).toBe("requested");
    expect(
      (await shop(`orders/${orderId}/return`, { receipt, reason: "Duplicate" }))
        .status,
    ).toBe(409);
    const approved = await admin(`orders/${orderId}`, "POST", {
      revision: returned.data.order.revision,
      action: "approve-return",
    });
    expect(approved.data.order.returnRequest.status).toBe("approved");
    const refund = await admin(`orders/${orderId}`, "POST", {
      revision: approved.data.order.revision,
      action: "refund",
      restock: true,
    });
    expect(refund.data.order.status).toBe("refunded");
    expect(refund.data.order.returnRequest.status).toBe("refunded");
    expect(
      (
        await admin(`orders/${orderId}`, "POST", {
          revision: refund.data.order.revision,
          action: "refund",
          restock: true,
        })
      ).status,
    ).toBe(409);
    const after = (await admin()).data as CommerceOverview;
    expect(after.products[0].variants[0].stock).toBe(5);
    expect(after.customers[0].spent.USD).toBe(0);
  });
  it("refunds part of an order, then the rest, never more than was paid", async () => {
    const before = ((await admin()).data as CommerceOverview).products.find(
      (p) => p.id === product.id,
    )!.variants[0].stock;
    const cart = await basket(product, 2);
    const started = await shop("checkout", { token: cart.token, ...customer() });
    const { orderId, receipt } = started.data;
    const paid = (await shop(`orders/${orderId}/pay-local`, { receipt, outcome: "approved" })).data.order;
    const one = [{ variantId: product.variants[0].id, quantity: 1 }];
    expect(
      (await admin(`orders/${orderId}`, "POST", {
        revision: paid.revision,
        action: "refund",
        lines: [{ variantId: product.variants[0].id, quantity: 3 }],
      })).status,
    ).toBe(422);
    expect(
      (await admin(`orders/${orderId}`, "POST", {
        revision: paid.revision,
        action: "refund",
        lines: one,
        amount: paid.total + 1,
      })).status,
    ).toBe(422);
    const part = await admin(`orders/${orderId}`, "POST", {
      revision: paid.revision,
      action: "refund",
      lines: one,
      shipping: false,
      restock: true,
    });
    expect(part.data.order.status).toBe("paid");
    expect(part.data.order.refunds).toEqual([
      expect.objectContaining({
        amount: refundAmount(paid, one, false),
        lines: one,
        shipping: false,
        restocked: true,
      }),
    ]);
    const mid = ((await admin()).data as CommerceOverview).products.find(
      (p) => p.id === product.id,
    )!.variants[0].stock;
    expect(mid).toBe(before - 1);
    // The rest: the other item and shipping, to exactly the total.
    const rest = await admin(`orders/${orderId}`, "POST", {
      revision: part.data.order.revision,
      action: "refund",
    });
    expect(rest.data.order.status).toBe("refunded");
    expect(
      rest.data.order.refunds.reduce((t: number, r: { amount: number }) => t + r.amount, 0),
    ).toBe(paid.total);
    expect(rest.data.order.refunds[1]).toMatchObject({ shipping: true, restocked: false });
    const receiptView = await shop(`orders/${orderId}/receipt`, { receipt });
    expect(receiptView.data.order.refunds).toHaveLength(2);
  });
  it("does not oversell the last item under concurrent purchases", async () => {
    const p = (
      await admin("products", "POST", {
        title: "Last item",
        status: "active",
        variants: [variant(1)],
      })
    ).data.product as Product;
    const a = await basket(p),
      b = await basket(p);
    const orders = await Promise.all(
      [a, b].map((cart) =>
        shop("checkout", { token: cart.token, ...customer() }),
      ),
    );
    const payments = await Promise.all(
      orders.map((o) =>
        shop(`orders/${o.data.orderId}/pay-local`, {
          receipt: o.data.receipt,
          outcome: "approved",
        }),
      ),
    );
    expect(payments.map((p) => p.status).sort()).toEqual([200, 409]);
    expect(
      ((await admin()).data as CommerceOverview).products.find(
        (item) => item.id === p.id,
      )?.variants[0].stock,
    ).toBe(0);
  });
  it("rejects a stale checkout after prices or cart contents change", async () => {
    const cart = await basket();
    const order = await shop("checkout", { token: cart.token, ...customer() });
    const current = ((await admin()).data as CommerceOverview).products.find(
      (p) => p.id === product.id,
    )!;
    expect(
      (
        await admin("products", "POST", {
          ...current,
          variants: current.variants.map((v) => ({ ...v, price: v.price + 1 })),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await shop(`orders/${order.data.orderId}/pay-local`, {
          receipt: order.data.receipt,
          outcome: "approved",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await shop("cart", {
          token: cart.token,
          revision: cart.cart.revision,
          lines: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await shop(`orders/${order.data.orderId}/pay-local`, {
          receipt: order.data.receipt,
          outcome: "approved",
        })
      ).status,
    ).toBe(409);
  });
  it("enforces collaborator roles on both commerce and website APIs", async () => {
    expect(
      (await admin("members", "POST", { email: editorEmail, role: "editor" }))
        .status,
    ).toBe(200);
    expect(
      (await admin("members", "POST", { email: viewerEmail, role: "viewer" }))
        .status,
    ).toBe(200);
    expect(
      (await call("/sites", "GET", undefined, editor)).data.sites.some(
        (s: { id: string }) => s.id === site,
      ),
    ).toBe(true);
    expect(
      (
        await admin(
          "products",
          "POST",
          { title: "Editor product", status: "draft", variants: [variant()] },
          editor,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await admin(
          "products",
          "POST",
          { title: "Viewer product", status: "draft", variants: [variant()] },
          viewer,
        )
      ).status,
    ).toBe(403);
    const data = (await admin()).data as CommerceOverview;
    expect((await admin("settings", "PUT", data.settings, editor)).status).toBe(
      403,
    );
    expect(
      (await call(`/sites/${site}/publish`, "POST", { version: 0 }, editor))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          `/sites/${site}/domains`,
          "POST",
          { hostname: "www.example.test" },
          editor,
        )
      ).status,
    ).toBe(403);
    const member = data.members.find((m) => m.email === editorEmail)!;
    expect(
      (await admin(`members/${member.id}/remove`, "POST", {})).status,
    ).toBe(200);
    expect((await admin("", "GET", undefined, editor)).status).toBe(404);
  });
  it("publishes content, captures consented forms, and signs local integration events", async () => {
    const entry = {
      title: "A story",
      slug: "a-story",
      body: "Our story in plain text.",
      status: "published",
    };
    expect((await admin("content", "POST", entry)).status).toBe(200);
    expect((await admin("content", "POST", entry)).status).toBe(409);
    expect((await shop()).data.content[0].title).toBe("A story");
    expect(
      (
        await shop("forms", {
          kind: "newsletter",
          email: "subscriber@local.test",
          consent: false,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await shop("forms", {
          kind: "newsletter",
          email: "subscriber@local.test",
          consent: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await shop("forms", {
          kind: "contact",
          email: "contact@local.test",
          message: "Please help.",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await shop("forms", {
          kind: "contact",
          email: "bot@local.test",
          message: "Spam",
          website: "spam",
        })
      ).status,
    ).toBe(422);
    const preview = await admin("campaign-preview", "POST", {
      subject: "Hello",
      body: "A newsletter",
    });
    expect(preview.data.recipients).toEqual(["subscriber@local.test"]);
    expect(preview.data.delivery).toBe("preview-only");
    const mail = ((await admin()).data as CommerceOverview).outbox.find(
      (mail) => mail.subject === "Your newsletter subscription",
    )!;
    const unsubscribeToken = mail.body.match(/unsubscribe=([a-f0-9]{64})/)![1];
    expect(
      (await shop("unsubscribe", { token: unsubscribeToken })).status,
    ).toBe(200);
    expect(
      (await shop("unsubscribe", { token: unsubscribeToken })).status,
    ).toBe(200);
    expect(
      (
        await admin("campaign-preview", "POST", {
          subject: "Hello",
          body: "Test",
        })
      ).data.count,
    ).toBe(0);
    expect(
      (
        await shop("forms", {
          kind: "newsletter",
          email: "subscriber@local.test",
          consent: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin("campaign-preview", "POST", {
          subject: "Hello",
          body: "Test",
        })
      ).data.count,
    ).toBe(1);
    const integration = await admin("integrations", "POST", {
      name: "Test integration",
      events: ["order.paid"],
      enabled: true,
    });
    expect(integration.status).toBe(200);
    const events = await admin(
      `integrations/${integration.data.integration.id}/events`,
    );
    expect(events.data.events.length).toBeGreaterThan(0);
    expect(events.data.events[0].signature).toBe(
      createHmac("sha256", integration.data.secret)
        .update(events.data.events[0].payload)
        .digest("hex"),
    );
    expect(
      ((await admin()).data as { integrations: { secret?: string }[] })
        .integrations[0].secret,
    ).toBeUndefined();
    expect((await admin("export", "GET", undefined, viewer)).status).toBe(403);
    expect((await admin("export")).data.format).toBe("forma-commerce-v1");
  });
  it("connects published product sections and avoids rebuilding for inventory-only changes", async () => {
    const overview = (await admin()).data as CommerceOverview;
    expect(
      (
        await admin("settings", "PUT", {
          ...overview.settings,
          linkFromWebsite: true,
          useCatalogOnWebsite: true,
        })
      ).status,
    ).toBe(200);
    // The editor's store repeats read what published pages will show.
    const catalog = await admin("catalog");
    expect(catalog.data).toMatchObject({ open: true, website: true });
    expect(
      catalog.data.products.find((p: { id: string }) => p.id === product.id),
    ).toMatchObject({
      title: "Handmade planter",
      category: "Home",
      url: expect.stringContaining(`product=${product.id}`),
    });
    expect((await admin("catalog", "GET", undefined, outsider)).status).toBe(
      404,
    );
    const draft = await fetch(`${base}/sites/${site}/draft`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/gzip",
        "if-match": "0",
      },
      body: gzipSync(JSON.stringify(createProject())),
    });
    expect(draft.status).toBe(200);
    const version = (await draft.json()).site.version;
    expect(
      (await call(`/sites/${site}/publish`, "POST", { version })).status,
    ).toBe(202);
    const published = await waitForPublish();
    expect(published.status).toBe("published");
    const html = await (await fetch(published.url)).text();
    expect(html).toContain("Handmade planter");
    expect(html).toContain("rl-products");
    expect(html).toContain(`product=${product.id}`);
    expect(html).toContain(`/store?site=${site}`);
    const current = ((await admin()).data as CommerceOverview).products.find(
      (p) => p.id === product.id,
    )!;
    const changed = await admin("products", "POST", {
      ...current,
      variants: current.variants.map((v) => ({ ...v, stock: v.stock + 1 })),
    });
    expect(changed.status).toBe(200);
    const unchanged = await call(`/sites/${site}/publish`, "POST", { version });
    expect(unchanged.data.site.publishedRelease).toBe(
      published.publishedRelease,
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await admin("products", "POST", {
      ...changed.data.product,
      title: "New catalog title",
    });
    expect(
      (await call(`/sites/${site}/publish`, "POST", { version })).status,
    ).toBe(202);
    const republished = await waitForPublish();
    expect(republished.publishedRelease).not.toBe(published.publishedRelease);
    expect(await (await fetch(republished.url)).text()).toContain(
      "New catalog title",
    );
  }, 20000);
});
