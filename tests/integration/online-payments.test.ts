import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "../../backend/database";
import { config } from "../../backend/config";
import { createProject } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";
import { emptyPayments, parseAmount } from "../../src/studio/payments";

/**
 * Runs against fake Stripe and Razorpay APIs, including their sign-in (OAuth)
 * hosts. Start the stack with
 *   STRIPE_API_BASE=http://127.0.0.1:8799/stripe
 *   RAZORPAY_API_BASE=http://127.0.0.1:8799/razorpay
 *   STRIPE_CONNECT_BASE=http://127.0.0.1:8799/stripe-connect
 *   RAZORPAY_AUTH_BASE=http://127.0.0.1:8799/razorpay-auth
 *   STRIPE_CONNECT_CLIENT_ID=ca_FormaFakePlatform
 *   STRIPE_PLATFORM_SECRET=sk_test_FormaFakePlatform123
 *   RAZORPAY_PARTNER_CLIENT_ID=FormaFakePartner
 *   RAZORPAY_PARTNER_CLIENT_SECRET=FormaFakePartnerSecret
 *   RAZORPAY_PARTNER_MODE=test
 * and set TEST_FAKE_PROVIDERS=1 to include it (TEST_FAKE_PORT if 8799 is taken).
 */
const enabled = process.env.TEST_FAKE_PROVIDERS === "1";
const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
const STRIPE_KEY = "rk_test_FormaFakeKey1234567890";
const RZP_ID = "rzp_test_FormaFake01";
const RZP_SECRET = "FormaFakeSecret12345";
const STRIPE_CLIENT = "ca_FormaFakePlatform";
const STRIPE_PLATFORM = "sk_test_FormaFakePlatform123";
const RZP_CLIENT = "FormaFakePartner";
const RZP_CLIENT_SECRET = "FormaFakePartnerSecret";
const STRIPE_ACCOUNT = "acct_FormaOwner1234";
const RZP_ACCOUNT = "acc_FormaOwner5678";

interface Session {
  id: string;
  url: string;
  amount_total: number;
  currency: string;
  client_reference_id: string;
  payment_status: "paid" | "unpaid";
  payment_intent: string;
  /** The connected account it was made on; "" for pasted keys. */
  account: string;
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
  account: string;
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
/** What the fake sign-in hosts saw and handed out. */
const oauth = {
  /** The next authorize answers like the owner pressed cancel. */
  deny: false,
  codes: new Map<string, { account: string; used: boolean; redirect: string }>(),
  connected: new Set<string>(),
  deauthorized: [] as string[],
  /** Razorpay access token → account; removed when expired or revoked. */
  access: new Map<string, string>(),
  refresh: new Map<string, string>(),
  issued: [] as string[],
  revoked: [] as string[],
  refreshes: 0,
  modes: [] as string[],
  /** Lifetime of the next Razorpay access token. */
  expiresIn: 7862400,
};
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
      const authorize = /^\/(stripe-connect\/oauth|razorpay-auth)\/authorize$/.exec(
        url.pathname,
      );
      if (authorize && req.method === "GET") {
        const stripeSide = authorize[1] === "stripe-connect/oauth";
        const q = url.searchParams;
        const redirect = q.get("redirect_uri")!;
        if (
          q.get("client_id") !== (stripeSide ? STRIPE_CLIENT : RZP_CLIENT) ||
          q.get("response_type") !== "code" ||
          q.get("scope") !== "read_write" ||
          !q.get("state")
        )
          return send(400, { error: "invalid_request" });
        const back = new URL(redirect);
        back.searchParams.set("state", q.get("state")!);
        if (oauth.deny) {
          oauth.deny = false;
          back.searchParams.set("error", "access_denied");
          back.searchParams.set("error_description", "The user denied your request");
        } else {
          const code = `${stripeSide ? "ac" : "rzpcode"}_FormaFakeCode${oauth.codes.size + 1}`;
          oauth.codes.set(code, {
            account: stripeSide ? STRIPE_ACCOUNT : RZP_ACCOUNT,
            used: false,
            redirect,
          });
          back.searchParams.set("code", code);
        }
        res.writeHead(302, { location: back.href });
        return res.end();
      }
      if (url.pathname.startsWith("/stripe-connect/oauth/")) {
        if (req.headers.authorization !== `Bearer ${STRIPE_PLATFORM}`)
          return send(401, { error: "invalid_client" });
        const form = new URLSearchParams(body);
        if (url.pathname.endsWith("/token")) {
          const grant = oauth.codes.get(form.get("code") ?? "");
          if (form.get("grant_type") !== "authorization_code" || !grant || grant.used)
            return send(400, { error: "invalid_grant" });
          grant.used = true;
          oauth.connected.add(grant.account);
          return send(200, {
            stripe_user_id: grant.account,
            livemode: false,
            scope: "read_write",
            token_type: "bearer",
            access_token: "sk_test_DeprecatedAccessToken",
            refresh_token: "rt_DeprecatedRefreshToken",
          });
        }
        if (url.pathname.endsWith("/deauthorize")) {
          const account = form.get("stripe_user_id") ?? "";
          if (form.get("client_id") !== STRIPE_CLIENT || !oauth.connected.has(account))
            return send(400, { error: "invalid_client" });
          oauth.connected.delete(account);
          oauth.deauthorized.push(account);
          return send(200, { stripe_user_id: account });
        }
        return send(404, {});
      }
      if (url.pathname.startsWith("/razorpay-auth/")) {
        const input = JSON.parse(body || "{}");
        if (input.client_id !== RZP_CLIENT || input.client_secret !== RZP_CLIENT_SECRET)
          return send(401, { error: { description: "Invalid client" } });
        const issue = (account: string) => {
          const n = oauth.issued.length / 2 + 1;
          const access = `rzp_at_FormaFake${n}`;
          const refresh = `rzp_rt_FormaFake${n}`;
          oauth.access.set(access, account);
          oauth.refresh.set(refresh, account);
          oauth.issued.push(access, refresh);
          const expires_in = oauth.expiresIn;
          oauth.expiresIn = 7862400;
          return send(200, {
            public_token: "rzp_test_oauth_FormaFake01",
            token_type: "Bearer",
            expires_in,
            access_token: access,
            refresh_token: refresh,
            razorpay_account_id: account,
          });
        };
        if (url.pathname === "/razorpay-auth/token") {
          if (input.grant_type === "authorization_code") {
            const grant = oauth.codes.get(input.code);
            if (!grant || grant.used || input.redirect_uri !== grant.redirect)
              return send(400, { error: { description: "Invalid code" } });
            grant.used = true;
            oauth.modes.push(input.mode);
            return issue(grant.account);
          }
          if (input.grant_type === "refresh_token") {
            const account = oauth.refresh.get(input.refresh_token);
            if (!account)
              return send(400, { error: { description: "Invalid refresh token" } });
            oauth.refresh.delete(input.refresh_token);
            oauth.refreshes++;
            return issue(account);
          }
          return send(400, {});
        }
        if (url.pathname === "/razorpay-auth/revoke") {
          oauth.access.delete(input.token);
          oauth.refresh.delete(input.token);
          oauth.revoked.push(`${input.token_type_hint}:${input.token}`);
          return send(200, { message: "Token Revoked" });
        }
        return send(404, {});
      }
      if (url.pathname.startsWith("/stripe/")) {
        const asAccount = String(req.headers["stripe-account"] ?? "");
        const account =
          req.headers.authorization === `Bearer ${STRIPE_KEY}` && !asAccount
            ? ""
            : req.headers.authorization === `Bearer ${STRIPE_PLATFORM}` &&
                oauth.connected.has(asAccount)
              ? asAccount
              : undefined;
        if (account === undefined)
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
            account,
          };
          sessions.set(id, session);
          return send(200, session);
        }
        const one = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
        if (one && sessions.get(one[1])?.account === account)
          return send(200, sessions.get(one[1]));
        if (path === "/v1/refunds" && req.method === "POST") {
          const form = new URLSearchParams(body);
          const key = String(req.headers["idempotency-key"] ?? "");
          const intent = form.get("payment_intent")!;
          const session = [...sessions.values()].find(
            (s) => s.payment_intent === intent && s.account === account,
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
        const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        const account =
          req.headers.authorization === expected
            ? ""
            : bearer
              ? oauth.access.get(bearer[1])
              : undefined;
        if (account === undefined)
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
            account,
          };
          links.set(id, link);
          return send(200, link);
        }
        const one = /^\/v1\/payment_links\/([^/]+)$/.exec(path);
        if (one && links.get(one[1])?.account === account)
          return send(200, links.get(one[1]));
        const pay = /^\/v1\/payments\/([^/]+)\/(refunds|refund)$/.exec(path);
        const link = [...links.values()].find(
          (l) =>
            l.account === account &&
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
      // The list names the signed-in account, so the Inbox can say "by you".
      expect(stored.payment!.refund!.by).toBe(
        (await call(`/sites/${id}/inbox`)).data.you,
      );
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

    const signInStart = (provider: string, auth = token, site = id) =>
      call(
        `/sites/${site}/payments/sign-in`,
        "POST",
        { provider, editor: "http://localhost:5178" },
        auth,
      );
    const finish = (state: string, auth = token, site = id) =>
      call(`/sites/${site}/payments/sign-in/finish`, "POST", { state }, auth);
    /** Plays the owner's browser: to the provider, back to Forma, to the editor. */
    const signInBrowser = async (url: string) => {
      const atProvider = await go(url);
      expect(atProvider.status).toBe(302);
      const back = atProvider.headers.get("location")!;
      const returned = await go(back);
      expect(returned.status).toBe(303);
      expect(returned.headers.get("referrer-policy")).toBe("no-referrer");
      return { back, editor: returned.headers.get("location")! };
    };
    const expireState = (state: string) =>
      db.send(
        new UpdateCommand({
          TableName: config.table,
          Key: {
            pk: `PAYSIGNIN#${createHash("sha256").update(state).digest("hex")}`,
            sk: "STATE",
          },
          UpdateExpression: "SET #expires = :past",
          ExpressionAttributeNames: { "#expires": "expires" },
          ExpressionAttributeValues: { ":past": 1 },
        }),
      );
    const secrets = () => [
      STRIPE_PLATFORM,
      RZP_CLIENT_SECRET,
      ...oauth.issued,
      ...oauth.codes.keys(),
    ];

    it("offers signing in only to owners, with a fixed return address", async () => {
      const read = await call(`/sites/${id}/payments`);
      expect(read.data.signIn).toEqual({ stripe: true, razorpay: true });
      expect((await signInStart("stripe", stranger)).response.status).toBe(404);
      expect((await signInStart("stripe", manager)).response.status).toBe(403);
      expect((await signInStart("paypal")).response.status).toBe(422);
      const { data } = await signInStart("stripe");
      const url = new URL(data.url);
      expect(url.pathname).toBe("/stripe-connect/oauth/authorize");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        response_type: "code",
        client_id: STRIPE_CLIENT,
        scope: "read_write",
        state: data.state,
        redirect_uri: `${base}/payments/sign-in/stripe/return`,
      });
      expect(data.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await signInStart("stripe")).data.state).not.toBe(data.state);
    });

    it("connects Stripe by signing in, refusing bad, expired, reused or someone else's state", async () => {
      // A made-up state goes nowhere near a site.
      const bogus = await go(
        `${base}/payments/sign-in/stripe/return?code=ac_x&state=${"a".repeat(43)}`,
      );
      expect(bogus.headers.get("location")).toBe("http://127.0.0.1:5178/workspace");
      expect((await finish("not-a-state")).response.status).toBe(422);
      // Pressing cancel at Stripe.
      const cancelled = (await signInStart("stripe")).data;
      oauth.deny = true;
      const denied = await signInBrowser(cancelled.url);
      expect(denied.editor).toBe(
        `http://localhost:5178/editor?site=${id}&open=settings&payments=cancelled`,
      );
      expect((await finish(cancelled.state)).response.status).toBe(409);
      // Too slow.
      const slow = (await signInStart("stripe")).data;
      await expireState(slow.state);
      expect((await signInBrowser(slow.url)).editor).toContain("payments=expired");
      expect((await finish(slow.state)).response.status).toBe(409);
      // Someone else's editor address is never used.
      const elsewhere = await call(`/sites/${id}/payments/sign-in`, "POST", {
        provider: "stripe",
        editor: "https://attacker.test",
      });
      const landed = await signInBrowser(elsewhere.data.url);
      expect(landed.editor).toMatch(/^http:\/\/127\.0\.0\.1:5178\/editor\?/);
      await finish(elsewhere.data.state).then(() =>
        call(`/sites/${id}/payments/disconnect`, "POST", {}),
      );

      const { state, url } = (await signInStart("stripe")).data;
      const { back, editor } = await signInBrowser(url);
      expect(editor).toBe(
        `http://localhost:5178/editor?site=${id}&open=settings&payments=finish`,
      );
      // The code stays on the server: nothing secret goes to the editor.
      for (const secret of secrets()) expect(editor).not.toContain(secret);
      expect((await go(back)).headers.get("location")).toContain("payments=expired");
      // Another account can't finish it, here or on their own site.
      const theirs = (await call("/sites", "POST", { name: "Theirs" }, stranger))
        .data.site.id;
      expect((await finish(state, stranger, theirs)).response.status).toBe(409);
      expect((await finish(state, stranger)).response.status).toBe(404);
      expect((await finish(state, manager)).response.status).toBe(403);
      const done = await finish(state);
      expect(done.response.status).toBe(200);
      expect(done.data.connection).toEqual({
        provider: "stripe",
        mode: "test",
        hint: STRIPE_ACCOUNT.slice(-4),
        connectedAt: expect.any(String),
        via: "oauth",
        account: STRIPE_ACCOUNT,
      });
      expect((await finish(state)).response.status).toBe(409);
      const read = JSON.stringify((await call(`/sites/${id}/payments`)).data);
      for (const secret of [...secrets(), "sk_test_DeprecatedAccessToken"])
        expect(read).not.toContain(secret);
    });

    it("takes and refunds payments on the signed-in Stripe account", async () => {
      const page = await order("1");
      const checkout = (await go(`${page}/checkout`)).headers.get("location")!;
      const session = sessions.get(checkout.split("/").pop()!)!;
      expect(session.account).toBe(STRIPE_ACCOUNT);
      session.payment_status = "paid";
      expect(await (await fetch(page)).text()).toContain("Payment received");
      const request = (await requests()).find((r) => page.endsWith(r.id))!;
      const done = await refund(request.id, { revision: request.revision });
      expect(done.data.request.payment).toMatchObject({
        status: "refunded",
        refund: { provider: "stripe", amount: unit },
      });
      expect(refundsOf(session.payment_intent)).toHaveLength(1);
    });

    it("lets go of the Stripe account on disconnect", async () => {
      const off = await call(`/sites/${id}/payments/disconnect`, "POST", {});
      expect(off.data).toEqual({ connection: null });
      expect(oauth.deauthorized).toContain(STRIPE_ACCOUNT);
      expect(oauth.connected.has(STRIPE_ACCOUNT)).toBe(false);
    });

    it("connects Razorpay by signing in and refreshes its token", async () => {
      const { state, url } = (await signInStart("razorpay")).data;
      const authorize = new URL(url);
      expect(authorize.pathname).toBe("/razorpay-auth/authorize");
      expect(authorize.searchParams.get("redirect_uri")).toBe(
        `${base}/payments/sign-in/razorpay/return`,
      );
      // A Stripe return can't use a Razorpay state.
      expect(
        (
          await go(
            `${base}/payments/sign-in/stripe/return?code=ac_1&state=${state}`,
          )
        ).headers.get("location"),
      ).toBe("http://127.0.0.1:5178/workspace");
      // The first token is about to run out, so the next call refreshes it.
      oauth.expiresIn = 60;
      expect((await signInBrowser(url)).editor).toContain("payments=finish");
      const done = await finish(state);
      expect(done.data.connection).toMatchObject({
        provider: "razorpay",
        mode: "test",
        via: "oauth",
        account: RZP_ACCOUNT,
      });
      expect(oauth.modes).toEqual(["test"]);
      expect(oauth.refreshes).toBe(0);
      const page = await order("1");
      const checkout = (await go(`${page}/checkout`)).headers.get("location")!;
      const link = links.get(checkout.split("/").pop()!)!;
      expect(link.account).toBe(RZP_ACCOUNT);
      expect(oauth.refreshes).toBe(1);
      // Razorpay stops taking the current token: refresh and try again.
      oauth.access.clear();
      link.status = "paid";
      link.amount_paid = unit;
      link.payments = [
        { payment_id: "pay_oauth", status: "captured", amount: unit },
      ];
      const request = (await requests()).find((r) => page.endsWith(r.id))!;
      const synced = await call(`/sites/${id}/inbox/${request.id}`, "POST", {
        sync: true,
      });
      expect(synced.data.request.payment.status).toBe("paid");
      expect(oauth.refreshes).toBe(2);
      const refunded = await refund(request.id, {
        revision: synced.data.request.revision,
      });
      expect(refunded.data.request.payment).toMatchObject({
        status: "refunded",
        refund: { provider: "razorpay", amount: unit },
      });
      expect(refundsOf("pay_oauth")).toHaveLength(1);
      const everything = JSON.stringify([
        done.data,
        synced.data,
        refunded.data,
        (await call(`/sites/${id}/payments`)).data,
        (await call(`/sites/${id}/inbox`)).data,
      ]);
      for (const secret of secrets()) expect(everything).not.toContain(secret);
    });

    it("revokes Razorpay's tokens on disconnect", async () => {
      const latest = oauth.issued.slice(-2);
      const off = await call(`/sites/${id}/payments/disconnect`, "POST", {});
      expect(off.data).toEqual({ connection: null });
      expect(oauth.revoked).toEqual(
        expect.arrayContaining([
          `access_token:${latest[0]}`,
          `refresh_token:${latest[1]}`,
        ]),
      );
      expect(oauth.refresh.size + oauth.access.size).toBe(0);
    });
  },
);
