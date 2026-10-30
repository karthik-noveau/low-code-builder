import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { matchRoute } from "../../infra/api-routes.mjs";

// Forma Store as the AWS Lambda runs it: FORMA_MODE=aws, API Gateway events,
// and only the routes infra/api-routes.mjs gives the HTTP API. DynamoDB is the
// local one (a throwaway table); every other AWS endpoint is a dead loopback
// port and no real credentials are read, so nothing can reach AWS.
const table = `forma-hosted-store-${randomUUID()}`;
vi.hoisted(() => {
  const env = process.env;
  env.FORMA_MODE = "aws";
  delete env.DYNAMODB_ENDPOINT;
  delete env.AWS_PROFILE;
  delete env.AWS_SESSION_TOKEN;
  env.AWS_ENDPOINT_URL_DYNAMODB =
    env.TEST_DYNAMODB_URL || "http://127.0.0.1:8008";
  env.AWS_ENDPOINT_URL = "http://127.0.0.1:9";
  env.AWS_ACCESS_KEY_ID = "formaLocal";
  env.AWS_SECRET_ACCESS_KEY = "localOnly";
  env.AWS_SHARED_CREDENTIALS_FILE = "/nonexistent/forma-credentials";
  env.AWS_CONFIG_FILE = "/nonexistent/forma-config";
  env.AWS_EC2_METADATA_DISABLED = "true";
  env.AWS_ACCOUNT_ID_ENDPOINT_MODE = "disabled";
  env.AWS_REGION = "us-east-1";
  env.AWS_MAX_ATTEMPTS = "1";
  env.EDITOR_ORIGIN = "https://editor.forma.test";
  env.API_ORIGIN = "https://api.forma.test";
  env.SITE_ORIGIN = "https://sites.forma.test";
});
process.env.TABLE_NAME = table;
const { rawDb, db, putItem, siteKey } = await import("../../backend/database");
const { handler } = await import("../../backend/lambda");
const { publicationCommerce } =
  await import("../../backend/commerce-publishing");
const { CreateTableCommand, DeleteTableCommand } =
  await import("@aws-sdk/client-dynamodb");

// Belt and braces: refuse any DynamoDB request that isn't to this machine.
for (const stack of new Set([rawDb.middlewareStack, db.middlewareStack]))
  stack.add(
    (next) => async (args) => {
      const host = (args.request as { hostname?: string }).hostname;
      if (host !== "127.0.0.1" && host !== "localhost")
        throw new Error(`Refusing a DynamoDB request to ${host}.`);
      return next(args);
    },
    { step: "finalizeRequest", name: "formaLoopbackOnly" },
  );

const owner = `owner-${randomUUID()}`,
  site = randomUUID();
/** Sends a request the way API Gateway would, or answers as it would. */
async function call(
  method: string,
  path: string,
  body?: unknown,
  signedIn: string | undefined = owner,
) {
  const route = matchRoute(method, path);
  // API Gateway has no such route: it answers 404 without calling Lambda.
  if (!route || route.localOnly)
    return { status: 404, routed: false, data: {} };
  const jwt = route.auth === "jwt";
  // The JWT authorizer turns away requests without a token.
  if (jwt && !signedIn) return { status: 401, routed: true, data: {} };
  const event = {
    version: "2.0",
    routeKey: route.route,
    rawPath: path,
    rawQueryString: "",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    requestContext: {
      http: { method, path, sourceIp: "203.0.113.7" },
      authorizer: jwt
        ? { jwt: { claims: { sub: signedIn, token_use: "access" } } }
        : undefined,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
  const response = await handler(event);
  const text = Buffer.from(response.body, "base64").toString();
  return {
    status: response.statusCode,
    routed: true,
    data: text ? JSON.parse(text) : {},
  };
}
const admin = (path = "", method = "GET", body?: unknown) =>
  call(method, `/sites/${site}/commerce${path ? `/${path}` : ""}`, body);
const shop = (path = "", body?: unknown) =>
  call(
    body === undefined ? "GET" : "POST",
    `/store/${site}${path ? `/${path}` : ""}`,
    body,
    undefined,
  );

beforeAll(async () => {
  await rawDb.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );
  const now = new Date().toISOString();
  await putItem({
    ...siteKey(owner, site),
    id: site,
    owner,
    name: "Hosted store",
    version: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
});
afterAll(async () => {
  await rawDb.send(new DeleteTableCommand({ TableName: table }));
});

describe(
  "Forma Store through the AWS Lambda handler",
  { concurrent: false },
  () => {
    let product: { id: string; variants: { id: string }[] };
    it("keeps the owner's store behind the JWT authorizer and the API's own check", async () => {
      expect(
        (await call("GET", `/sites/${site}/commerce`, undefined, "")).status,
      ).toBe(401);
      // Without verified claims the API itself refuses too.
      const response = await handler({
        rawPath: `/sites/${site}/commerce`,
        rawQueryString: "",
        headers: {},
        requestContext: { http: { method: "GET", sourceIp: "203.0.113.7" } },
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);
      expect(response.statusCode).toBe(401);
      expect(
        (await call("GET", `/sites/${site}/commerce`, undefined, "stranger"))
          .status,
      ).toBe(404);
    });
    it("sets up and opens the store", async () => {
      const first = await admin();
      expect(first.status).toBe(200);
      expect(first.data.role).toBe("owner");
      expect((await admin("catalog")).data.open).toBe(false);
      expect((await shop()).status).toBe(404);
      expect(
        (
          await admin("settings", "PUT", {
            ...first.data.settings,
            enabled: true,
            linkFromWebsite: true,
            useCatalogOnWebsite: true,
          })
        ).status,
      ).toBe(200);
      const saved = await admin("products", "POST", {
        title: "Hosted planter",
        description: "Sold from AWS",
        image: "/images/plant-1.jpg",
        collection: "Home",
        status: "active",
        variants: [
          {
            id: randomUUID(),
            title: "Small",
            sku: "HP-S",
            stock: 3,
            price: 2500,
            prices: {},
          },
        ],
      });
      expect(saved.status).toBe(200);
      product = saved.data.product;
      expect(
        (
          await admin("discounts", "POST", {
            code: "HOSTED10",
            kind: "percent",
            value: 10,
            currency: "USD",
            minimum: 0,
            maxUses: 5,
            expiresAt: "",
            active: true,
          })
        ).status,
      ).toBe(200);
    });
    it("puts the store on the website: Shop link and catalogue sections", async () => {
      const catalog = (await admin("catalog")).data;
      expect(catalog).toMatchObject({ open: true, website: true });
      expect(catalog.products[0].url).toBe(
        `https://editor.forma.test/store?site=${site}&product=${product.id}`,
      );
      const binding = await publicationCommerce(site);
      expect(binding.shopUrl).toBe(
        `https://editor.forma.test/store?site=${site}`,
      );
      expect(binding.products).toHaveLength(1);
      expect(binding.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
    it("serves the storefront, cart, discount and forms without a token", async () => {
      const store = await shop();
      expect(store.status).toBe(200);
      expect(store.data).toMatchObject({
        sandbox: false,
        checkout: false,
        accounts: false,
      });
      expect(store.data.settings.owner).toBeUndefined();
      expect(store.data.products).toHaveLength(1);
      expect(
        (await shop("events", { id: randomUUID(), name: "store.visit" }))
          .status,
      ).toBe(200);
      const cart = await shop("cart", {
        lines: [
          {
            productId: product.id,
            variantId: product.variants[0].id,
            quantity: 2,
          },
        ],
        marketId: "default",
        country: "US",
        discountCode: "HOSTED10",
      });
      expect(cart.status).toBe(200);
      expect(cart.data.quote).toMatchObject({ subtotal: 5000, discount: 500 });
      const read = await shop("cart/read", { token: cart.data.token });
      expect(read.status).toBe(200);
      expect(read.data.cart.lines[0].quantity).toBe(2);
      expect(
        (
          await shop("forms", {
            kind: "newsletter",
            email: "hosted-subscriber@forma.test",
            consent: true,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await shop("forms", {
            kind: "contact",
            email: "hosted-shopper@forma.test",
            name: "Shopper",
            message: "Do you ship to Canada?",
          })
        ).status,
      ).toBe(201);
      expect(
        (await shop("unsubscribe", { token: "a".repeat(64) })).data,
      ).toEqual({ ok: true });
      expect(
        (
          await shop(`orders/${randomUUID()}/receipt`, {
            receipt: "b".repeat(64),
          })
        ).status,
      ).toBe(404);
    });
    it("keeps what has no hosted provider yet closed: checkout, sandbox payment, accounts, invitations", async () => {
      const cart = await shop("cart", {
        lines: [
          {
            productId: product.id,
            variantId: product.variants[0].id,
            quantity: 1,
          },
        ],
        marketId: "default",
        country: "US",
      });
      const checkout = await shop("checkout", {
        token: cart.data.token,
        email: "hosted-shopper@forma.test",
        address: {
          name: "Shopper",
          line1: "1 Example Street",
          city: "Test City",
          postalCode: "10001",
          country: "US",
        },
      });
      expect(checkout.status).toBe(503);
      // The sandbox payment route isn't on the HTTP API at all…
      const pay = await shop(`orders/${randomUUID()}/pay-local`, {
        receipt: "c".repeat(64),
        outcome: "approved",
      });
      expect(pay.routed).toBe(false);
      // …and the API refuses it in AWS mode even if it were.
      const direct = await handler({
        rawPath: `/store/${site}/orders/${randomUUID()}/pay-local`,
        rawQueryString: "",
        headers: { "content-type": "application/json" },
        requestContext: { http: { method: "POST", sourceIp: "203.0.113.7" } },
        body: JSON.stringify({ receipt: "c".repeat(64), outcome: "approved" }),
        isBase64Encoded: false,
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer);
      expect(direct.statusCode).toBe(404);
      expect((await call("GET", `/store/${site}/account`)).status).toBe(503);
      expect(
        (await call("GET", `/store/${site}/account`, undefined, "")).status,
      ).toBe(401);
      expect(
        (
          await admin("members", "POST", {
            email: "teammate@forma.test",
            role: "editor",
          })
        ).status,
      ).toBe(503);
    });
    it("runs the owner's workspace: inbox of messages, outbox, integrations, export and campaigns", async () => {
      const overview = (await admin()).data;
      expect(overview.submissions).toHaveLength(2);
      expect(overview.analytics.events["store.visit"]).toBe(1);
      expect(
        overview.outbox.map((m: { status: string }) => m.status),
      ).toContain("local-preview");
      const integration = await admin("integrations", "POST", {
        name: "Hosted feed",
        events: ["product.updated"],
        enabled: true,
      });
      expect(integration.status).toBe(200);
      expect(integration.data.secret).toMatch(/^[a-f0-9]{64}$/);
      const events = await admin(
        `integrations/${integration.data.integration.id}/events`,
      );
      expect(events.status).toBe(200);
      expect((await admin("export")).data.format).toBe("forma-commerce-v1");
      const campaign = await admin("campaign-preview", "POST", {
        subject: "Spring",
        body: "New planters",
      });
      expect(campaign.data).toMatchObject({
        count: 1,
        delivery: "preview-only",
      });
      expect(
        (
          await admin(`orders/${randomUUID()}`, "POST", {
            revision: 1,
            action: "fulfill",
          })
        ).status,
      ).toBe(404);
    });
  },
);
