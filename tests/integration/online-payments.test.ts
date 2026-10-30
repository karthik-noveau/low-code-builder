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
 * and set TEST_FAKE_PROVIDERS=1 to include it (TEST_FAKE_PORT if 8799 is taken).
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
  payment_intent: string;
}
interface Link {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  reference_id: string;
  status: "created" | "paid";
  amount_paid: number;
  payments: { payment_id: string; status: string; amount: number }[];
}
interface Refund {
  id: string;
  amount: number;
  status: string;
  /** Stripe: payment intent; Razorpay: payment id. */
  of: string;
  key: string;
}
const sessions = new Map<string, Session>();
const links = new Map<string, Link>();
const refunds: Refund[] = [];
/** Makes the next refund go through but loses the answer, like a timeout. */
let dropNextRefund = false;
const refundsOf = (of: string) => refunds.filter((r) => r.of === of);
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
      const refunded = (value: unknown) => {
        if (!dropNextRefund) return send(200, value);
        dropNextRefund = false;
        req.socket.destroy();
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
            payment_intent: `pi_${id}`,
          };
          sessions.set(id, session);
          return send(200, session);
        }
        const one = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
        if (one && sessions.has(one[1])) return send(200, sessions.get(one[1]));
        if (path === "/v1/refunds" && req.method === "POST") {
          const form = new URLSearchParams(body);
          const key = String(req.headers["idempotency-key"] ?? "");
          const intent = form.get("payment_intent")!;
          const session = [...sessions.values()].find(
            (s) => s.payment_intent === intent,
          );
          if (!session || session.payment_status !== "paid")
            return send(404, { error: { message: "No such payment_intent" } });
          const earlier = refunds.find((r) => key && r.key === key);
          const view = (r: Refund) => ({
            id: r.id,
            amount: r.amount,
            status: r.status,
            payment_intent: r.of,
          });
          if (earlier) return refunded(view(earlier));
          const amount = Number(form.get("amount") ?? session.amount_total);
          const given = refundsOf(intent).reduce((t, r) => t + r.amount, 0);
          if (given + amount > session.amount_total)
            return send(400, {
              error: {
                code: "charge_already_refunded",
                message: "Charge has already been refunded.",
              },
            });
          const refund: Refund = {
            id: `re_test_${refunds.length + 1}`,
            amount,
            status: "succeeded",
            of: intent,
            key,
          };
          refunds.push(refund);
          return refunded(view(refund));
        }
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
            payments: [],
          };
          links.set(id, link);
          return send(200, link);
        }
        const one = /^\/v1\/payment_links\/([^/]+)$/.exec(path);
        if (one && links.has(one[1])) return send(200, links.get(one[1]));
        const pay = /^\/v1\/payments\/([^/]+)\/(refunds|refund)$/.exec(path);
        const link = [...links.values()].find((l) =>
          l.payments.some((p) => p.payment_id === pay?.[1]),
        );
        if (pay && !link)
          return send(400, {
            error: { code: "BAD_REQUEST_ERROR", description: "Invalid payment id" },
          });
        const view = (r: Refund) => ({
          id: r.id,
          amount: r.amount,
          status: r.status,
          receipt: r.key,
          payment_id: r.of,
        });
        if (pay && pay[2] === "refunds" && req.method === "GET")
          return send(200, { items: refundsOf(pay[1]).map(view) });
        if (pay && pay[2] === "refund" && req.method === "POST") {
          const input = JSON.parse(body);
          const given = refundsOf(pay[1]).reduce((t, r) => t + r.amount, 0);
          if (given + input.amount > link!.amount_paid)
            return send(400, {
              error: {
                code: "BAD_REQUEST_ERROR",
                description: "The payment has been fully refunded already",
              },
            });
          const refund: Refund = {
            id: `rfnd_${refunds.length + 1}`,
            amount: input.amount,
            status: "processed",
            of: pay[1],
            key: input.receipt ?? "",
          };
          refunds.push(refund);
          return refunded(view(refund));
        }
        return send(404, {});
      }
      send(404, {});
    });
  });
  return new Promise<void>((r) =>
    fake.listen(Number(process.env.TEST_FAKE_PORT || 8799), "127.0.0.1", r),
  );
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
  manager = "",
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
      const managerEmail = `manager-${randomUUID()}@local.test`;
      manager = (
        await call(
          "/auth/register",
          "POST",
          { email: managerEmail, password: "Local-test-password-42" },
          "",
        )
      ).data.token;
      const created = await call("/sites", "POST", { name: "Online pay" });
      id = created.data.site.id;
      await call(`/sites/${id}/commerce/members`, "POST", {
        email: managerEmail,
        role: "manager",
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

    const requests = async () =>
      (await call(`/sites/${id}/inbox`)).data.requests as {
        id: string;
        revision: number;
        payment?: {
          status: string;
          amount: number;
          checkout?: { id: string; provider: string };
          refund?: Record<string, unknown>;
        };
      }[];
    const refund = (requestId: string, body: object, auth = token) =>
      call(`/sites/${id}/inbox/${requestId}/refund`, "POST", body, auth);

    it("refuses refunds that aren't the owner's to make", async () => {
      const [paid] = (await requests()).filter(
        (r) => r.payment?.status === "paid",
      );
      const body = { revision: paid.revision };
      expect((await refund(paid.id, body, stranger)).response.status).toBe(404);
      const asManager = await refund(paid.id, body, manager);
      expect(asManager.response.status).toBe(403);
      expect(
        (await call(`/sites/${id}/inbox`, "GET", undefined, manager)).data
          .canRefund,
      ).toBe(false);
      expect((await call(`/sites/${id}/inbox`)).data.canRefund).toBe(true);
      // Another site's request id is just not found here.
      const other = (await call("/sites", "POST", { name: "Other" })).data.site
        .id;
      expect(
        (
          await call(`/sites/${other}/inbox/${paid.id}/refund`, "POST", body)
        ).response.status,
      ).toBe(404);
      const page = await order("1");
      const unpaid = (await requests()).find((r) =>
        page.endsWith(r.id),
      )!;
      const early = await refund(unpaid.id, { revision: unpaid.revision });
      expect(early.response.status).toBe(422);
      expect(early.data.error).toMatch(/Only paid/);
      expect(
        (await refund(paid.id, { revision: paid.revision - 1 })).response
          .status,
      ).toBe(409);
      expect(
        (await refund(paid.id, { revision: paid.revision, amount: paid.payment!.amount + 1 }))
          .data.error,
      ).toMatch(/at most/);
      expect(refunds).toHaveLength(0);
    });

    it("refunds a Razorpay payment once, even when the answer is lost", async () => {
      const link = [...links.values()].find((l) => l.status === "paid")!;
      link.payments = [
        { payment_id: "pay_1", status: "captured", amount: link.amount_paid },
      ];
      const request = (await requests()).find(
        (r) => r.payment?.checkout?.id === link.id,
      )!;
      dropNextRefund = true;
      const lost = await refund(request.id, { revision: request.revision });
      expect(lost.response.status).toBe(502);
      expect(lost.data.error).toMatch(/without refunding twice/);
      expect(refunds).toHaveLength(1);
      let stored = (await requests()).find((r) => r.id === request.id)!;
      expect(stored.payment!.status).toBe("paid");
      expect(stored.payment!.refund).toMatchObject({
        amount: unit,
        provider: "razorpay",
      });
      expect(stored.payment!.refund!.refundedAt).toBeUndefined();
      // Can't be marked unpaid while the refund is unsettled.
      expect(
        (
          await call(`/sites/${id}/inbox/${request.id}`, "POST", {
            payment: "unpaid",
          })
        ).response.status,
      ).toBe(409);
      const retried = await refund(request.id, { revision: stored.revision });
      expect(retried.response.status).toBe(200);
      expect(retried.data.request.payment).toMatchObject({
        status: "refunded",
        refund: { id: "rfnd_1", amount: unit, provider: "razorpay" },
      });
      expect(retried.data.request.payment.refund.byEmail).toMatch(/@local\.test$/);
      // Asking again answers with the same refund.
      const again = await refund(request.id, { revision: 0 });
      expect(again.data.request.payment.refund.id).toBe("rfnd_1");
      expect(refunds).toHaveLength(1);
      expect(refunds[0].key).toMatch(/^forma_rf_/);
      // Checking the payment doesn't turn it back into paid.
      stored = (
        await call(`/sites/${id}/inbox/${request.id}`, "POST", { sync: true })
      ).data.request;
      expect(stored.payment!.status).toBe("refunded");
      const html = await (
        await fetch(`${base}/inbox/${id}/requests/${request.id}`)
      ).text();
      expect(html).toContain("Payment refunded");
      expect(html).toContain("5–10 business days");
      expect(html).not.toContain("/checkout");
      const { data } = await call(`/sites/${id}/commerce`);
      expect(
        data.audit.filter(
          (a: { action: string; target: string }) =>
            a.action === "request.refunded" && a.target === request.id,
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(data)).not.toContain(RZP_SECRET);
    });

    it("needs the account a payment was made with", async () => {
      const request = (await requests()).find(
        (r) => r.payment?.checkout?.provider === "stripe",
      )!;
      const wrong = await refund(request.id, { revision: request.revision });
      expect(wrong.response.status).toBe(409);
      expect(wrong.data.error).toMatch(/Connect the Stripe account/);
      // A refused refund leaves nothing half done.
      expect(
        (await requests()).find((r) => r.id === request.id)!.payment!.refund,
      ).toBeUndefined();
    });

    it("refunds part of a Stripe payment with one idempotency key", async () => {
      await call(`/sites/${id}/payments`, "POST", {
        provider: "stripe",
        secret: STRIPE_KEY,
      });
      const request = (await requests()).find(
        (r) => r.payment?.checkout?.provider === "stripe",
      )!;
      dropNextRefund = true;
      expect(
        (await refund(request.id, { revision: request.revision, amount: unit }))
          .response.status,
      ).toBe(502);
      const pending = (await requests()).find((r) => r.id === request.id)!;
      // Two tries at once: only one may ask Stripe.
      const both = await Promise.all([
        refund(request.id, { revision: pending.revision }),
        refund(request.id, { revision: pending.revision }),
      ]);
      // The loser is told it's in progress, or (if it came late) sees it done.
      for (const b of both) expect([200, 409]).toContain(b.response.status);
      const done = both.find((b) => b.response.status === 200)!.data.request;
      expect(done.payment).toMatchObject({
        status: "refunded",
        refund: { amount: unit, provider: "stripe", id: "re_test_2" },
      });
      expect(refundsOf(`pi_${request.payment!.checkout!.id}`)).toHaveLength(1);
      const html = await (
        await fetch(`${base}/inbox/${id}/requests/${request.id}`)
      ).text();
      expect(html).toContain("Payment refunded");
      expect(html).toMatch(/refunded \$[\d.,]+ of \$/);
    });

    it("records refunds of payments the owner marked paid without calling a provider", async () => {
      const page = await order("1");
      const request = (await requests()).find((r) => page.endsWith(r.id))!;
      const marked = await call(`/sites/${id}/inbox/${request.id}`, "POST", {
        payment: "paid",
      });
      const before = refunds.length;
      const recorded = await refund(request.id, {
        revision: marked.data.request.revision,
      });
      expect(recorded.data.request.payment).toMatchObject({
        status: "refunded",
        refund: { amount: unit, refundedAt: expect.any(String) },
      });
      expect(recorded.data.request.payment.refund.provider).toBeUndefined();
      expect(refunds.length).toBe(before);
      expect(
        await (await fetch(`${base}/inbox/${id}/requests/${request.id}`)).text(),
      ).toContain("as refunded to you");
    });
  },
);
