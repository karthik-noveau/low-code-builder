import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";
import { emptyPayments, parseAmount } from "../../src/studio/payments";

/**
 * Runs against fake Stripe and Razorpay APIs. Start the stack with
 *   STRIPE_API_BASE=http://127.0.0.1:8799/stripe
 *   RAZORPAY_API_BASE=http://127.0.0.1:8799/razorpay
 * and set TEST_FAKE_PROVIDERS=1 to include it.
 */
const enabled = process.env.TEST_FAKE_PROVIDERS === "1";
const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
const STRIPE_KEY = "rk_test_FormaFakeKey1234567890";
const RZP_ID = "rzp_test_FormaFake01";
const RZP_SECRET = "FormaFakeSecret12345";

interface Session {
  id: string;
  url: string;
  amount_total: number;
  currency: string;
  client_reference_id: string;
  payment_status: "paid" | "unpaid";
}
interface Link {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  reference_id: string;
  status: "created" | "paid";
  amount_paid: number;
}
const sessions = new Map<string, Session>();
const links = new Map<string, Link>();
let fake: Server;
function startFake() {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url || "/", "http://fake");
      const send = (status: number, value: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (url.pathname.startsWith("/stripe/")) {
        if (req.headers.authorization !== `Bearer ${STRIPE_KEY}`)
          return send(401, { error: { message: "Invalid API key" } });
        const path = url.pathname.slice("/stripe".length);
        if (path === "/v1/checkout/sessions" && req.method === "GET")
          return send(200, { data: [] });
        if (path === "/v1/checkout/sessions" && req.method === "POST") {
          const form = new URLSearchParams(body);
          const id = `cs_test_${sessions.size + 1}`;
          const session: Session = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            amount_total:
              Number(form.get("line_items[0][price_data][unit_amount]")) *
              Number(form.get("line_items[0][quantity]")),
            currency: form.get("line_items[0][price_data][currency]")!,
            client_reference_id: form.get("client_reference_id")!,
            payment_status: "unpaid",
          };
          sessions.set(id, session);
          return send(200, session);
        }
        const one = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
        if (one && sessions.has(one[1])) return send(200, sessions.get(one[1]));
        return send(404, {});
      }
      if (url.pathname.startsWith("/razorpay/")) {
        const expected = `Basic ${Buffer.from(`${RZP_ID}:${RZP_SECRET}`).toString("base64")}`;
        if (req.headers.authorization !== expected)
          return send(401, { error: { description: "Authentication failed" } });
        const path = url.pathname.slice("/razorpay".length);
        if (path === "/v1/payment_links" && req.method === "GET")
          return send(200, { payment_links: [] });
        if (path === "/v1/payment_links" && req.method === "POST") {
          const input = JSON.parse(body);
          const id = `plink_${links.size + 1}`;
          const link: Link = {
            id,
            short_url: `https://rzp.test/i/${id}`,
            amount: input.amount,
            currency: input.currency,
            reference_id: input.reference_id,
            status: "created",
            amount_paid: 0,
          };
          links.set(id, link);
          return send(200, link);
        }
        const one = /^\/v1\/payment_links\/([^/]+)$/.exec(path);
        if (one && links.has(one[1])) return send(200, links.get(one[1]));
        return send(404, {});
      }
      send(404, {});
    });
  });
  return new Promise<void>((r) => fake.listen(8799, "127.0.0.1", r));
}

const project = createProject();
const products = createCollection("products");
products.request = { kind: "order", label: "", collect: true };
project.collections = [products];
// No manual options: card payments alone are enough to ask for payment.
project.payments = { ...emptyPayments(), online: "stripe" };
const item = products.items[0];
const unit = parseAmount(item.values[products.display.price])!;
let token = "",
  stranger = "",
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
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => undefined) };
}
const register = async () =>
  (
    await call(
      "/auth/register",
      "POST",
      {
        email: `online-${randomUUID()}@local.test`,
        password: "Local-test-password-42",
      },
      "",
    )
  ).data.token as string;
const order = async (quantity: string) => {
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
      quantity,
      website: "",
    }),
  });
  expect(response.status).toBe(303);
  return response.headers.get("location")!;
};
const go = (url: string) => fetch(url, { redirect: "manual" });

describe.skipIf(!enabled)(
  "visitors pay through the owner's Stripe or Razorpay",
  { concurrent: false },
  () => {
    beforeAll(async () => {
      await startFake();
      token = await register();
      stranger = await register();
      const created = await call("/sites", "POST", { name: "Online pay" });
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
    afterAll(() => new Promise<void>((r) => fake?.close(() => r())));

    it("checks keys with the provider and never returns them", async () => {
      const payments = `/sites/${id}/payments`;
      expect(
        (await call(payments, "POST", { provider: "stripe", secret: "nope" }))
          .response.status,
      ).toBe(422);
      const wrong = await call(payments, "POST", {
        provider: "stripe",
        secret: "rk_test_SomeoneElsesKey123456",
      });
      expect(wrong.response.status).toBe(422);
      expect(wrong.data.error).toMatch(/didn’t accept/);
      expect(
        (
          await call(
            payments,
            "POST",
            { provider: "stripe", secret: STRIPE_KEY },
            stranger,
          )
        ).response.status,
      ).toBe(404);
      const ok = await call(payments, "POST", {
        provider: "stripe",
        secret: STRIPE_KEY,
      });
      expect(ok.data.connection).toEqual({
        provider: "stripe",
        mode: "test",
        hint: STRIPE_KEY.slice(-4),
        connectedAt: expect.any(String),
      });
      const read = await call(payments);
      expect(JSON.stringify(read.data)).not.toContain(STRIPE_KEY);
      expect(read.data.connection.provider).toBe("stripe");
    });

    it("charges the exact total once and confirms it with Stripe", async () => {
      const page = await order("2");
      const html = await (await fetch(page)).text();
      expect(html).toContain(`${page}/checkout`);
      expect(html).toContain("by card");
      const first = await go(`${page}/checkout`);
      expect(first.status).toBe(303);
      const checkout = first.headers.get("location")!;
      expect(checkout).toMatch(/^https:\/\/checkout\.stripe\.test\//);
      const session = sessions.get(checkout.split("/").pop()!)!;
      expect(session.amount_total).toBe(unit * 2);
      expect(session.currency).toBe("usd");
      expect(page).toContain(session.client_reference_id);
      // Retrying reuses the open checkout instead of creating another.
      expect((await go(`${page}/checkout`)).headers.get("location")).toBe(
        checkout,
      );
      expect(sessions.size).toBe(1);
      // Returning without paying changes nothing.
      expect(await (await fetch(page)).text()).not.toContain(
        "Payment received",
      );
      // A paid session for a different amount isn't accepted.
      session.payment_status = "paid";
      session.amount_total = unit;
      expect(await (await fetch(page)).text()).not.toContain(
        "Payment received",
      );
      session.amount_total = unit * 2;
      const paid = await (await fetch(page)).text();
      expect(paid).toContain("Payment received");
      expect(paid).toContain("has been notified");
      const { data } = await call(`/sites/${id}/inbox`);
      expect(data.requests[0].payment).toMatchObject({
        status: "paid",
        confirmedBy: "provider",
      });
      // Paid requests don't start new checkouts.
      expect((await go(`${page}/checkout`)).headers.get("location")).toBe(page);
    });

    it("works with Razorpay, and the owner can check a payment from the inbox", async () => {
      expect(
        (await call(`/sites/${id}/payments/disconnect`, "POST", {})).data,
      ).toEqual({ connection: null });
      const connected = await call(`/sites/${id}/payments`, "POST", {
        provider: "razorpay",
        keyId: RZP_ID,
        secret: RZP_SECRET,
      });
      expect(connected.data.connection.provider).toBe("razorpay");
      const page = await order("1");
      const checkout = (await go(`${page}/checkout`)).headers.get("location")!;
      expect(checkout).toMatch(/^https:\/\/rzp\.test\/i\//);
      const link = links.get(checkout.split("/").pop()!)!;
      expect(link).toMatchObject({ amount: unit, currency: "USD" });
      const { data } = await call(`/sites/${id}/inbox`);
      const request = data.requests.find(
        (r: { payment?: { checkout?: { id: string } } }) =>
          r.payment?.checkout?.id === link.id,
      );
      expect(request.payment.reference).toBe(link.reference_id);
      link.status = "paid";
      link.amount_paid = unit;
      const synced = await call(`/sites/${id}/inbox/${request.id}`, "POST", {
        sync: true,
      });
      expect(synced.data.request.payment).toMatchObject({
        status: "paid",
        confirmedBy: "provider",
      });
    });
  },
);
