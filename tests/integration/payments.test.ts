import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";
import {
  emptyPayments,
  formatAmount,
  parseAmount,
} from "../../src/studio/payments";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
const project = createProject();
const products = createCollection("products");
products.request = { kind: "order", label: "", collect: true };
project.collections = [products];
project.payments = {
  ...emptyPayments(),
  upi: "greenshop@okhdfc",
  payee: "Green Shop",
  bank: "Green Shop Ltd\nAccount 12345678",
  link: "https://buy.stripe.com/test_123",
};
const item = products.items[0];
const unit = parseAmount(item.values[products.display.price])!;
let token = "",
  id = "",
  payPage = "";
async function call(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => undefined) };
}
beforeAll(async () => {
  token = (
    await (
      await fetch(`${base}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `pay-${randomUUID()}@local.test`,
          password: "Local-test-password-42",
        }),
      })
    ).json()
  ).token;
  const created = await call("/sites", "POST", { name: "Payments test" });
  id = created.data.site.id;
  const saved = await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
  await call(`/sites/${id}/publish`, "POST", {
    version: (await saved.json()).site.version,
  });
  for (let i = 0; i < 80; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
});
describe("visitors pay the owner directly", { concurrent: false }, () => {
  it("tells visitors on the item page that payment comes next", async () => {
    const page = await (
      await fetch(`${sites}/sites/${id}/${products.slug}/${item.slug}.html`)
    ).text();
    expect(page).toContain("how to pay");
  });
  it("sends an order to a payment page with the total, reference and options", async () => {
    const response = await fetch(`${base}/inbox/${id}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: sites,
      },
      body: new URLSearchParams({
        collection: products.id,
        item: item.slug,
        name: "Ada Brooks",
        email: "ada@example.com",
        quantity: "2",
        website: "",
      }),
    });
    expect(response.status).toBe(303);
    payPage = response.headers.get("location")!;
    expect(payPage).toMatch(new RegExp(`^${base}/inbox/${id}/requests/`));
    const page = await fetch(payPage);
    expect(page.status).toBe(200);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await page.text();
    expect(html).toContain(formatAmount(unit * 2, products.currency));
    expect(html).toContain("upi://pay?pa=greenshop%40okhdfc");
    expect(html).toContain("https://buy.stripe.com/test_123");
    expect(html).toContain("Account 12345678");
    // The page is a capability for the visitor; it never shows their details.
    expect(html).not.toContain("ada@example.com");
  });
  it("shows the amount in the inbox and lets the owner mark it paid", async () => {
    const { data } = await call(`/sites/${id}/inbox`);
    const [request] = data.requests;
    expect(request.payment).toMatchObject({
      amount: unit * 2,
      status: "unpaid",
    });
    expect(payPage).toContain(request.id);
    expect(
      (
        await call(`/sites/${id}/inbox/${request.id}`, "POST", {
          payment: "maybe",
        })
      ).response.status,
    ).toBe(422);
    const paid = await call(`/sites/${id}/inbox/${request.id}`, "POST", {
      payment: "paid",
    });
    expect(paid.data.request.payment.status).toBe("paid");
    expect(paid.data.request.status).toBe("new");
    expect(await (await fetch(payPage)).text()).toContain("Payment received");
  });
  it("doesn't reveal requests that don't exist", async () => {
    const missing = await fetch(
      `${base}/inbox/${id}/requests/1760000000000-${randomUUID()}`,
    );
    expect(missing.status).toBe(404);
  });
});
