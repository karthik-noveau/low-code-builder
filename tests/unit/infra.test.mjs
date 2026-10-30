import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  template,
  routerSource,
  editorRouterSource,
} from "../../infra/template.mjs";
import { apiRoutes, matchRoute } from "../../infra/api-routes.mjs";

describe("cost and deployment invariants", () => {
  const resources = template().Resources;
  it("serves direct links to static branded pages without rewriting assets", () => {
    const context = vm.createContext({});
    vm.runInContext(editorRouterSource, context);
    for (const path of [
      "/",
      "/features",
      "/help/publish",
      "/templates/table/",
      "/editor",
    ]) {
      expect(
        context.handler({ request: { uri: path, method: "GET" } }).uri,
      ).toBe(path.replace(/\/$/, "") + "/index.html");
    }
    expect(
      context.handler({ request: { uri: "/assets/main.js", method: "GET" } })
        .uri,
    ).toBe("/assets/main.js");
    expect(
      context.handler({ request: { uri: "/editor", method: "POST" } })
        .statusCode,
    ).toBe(405);
    expect(
      resources.EditorDistribution.Properties.DistributionConfig
        .CustomErrorResponses[0].ResponseCode,
    ).toBe(404);
  });
  it("has on-demand storage and no fixed compute or network resources", () => {
    expect(resources.Table.Properties.BillingMode).toBe("PAY_PER_REQUEST");
    for (const item of Object.values(resources)) {
      expect(item.Type).not.toMatch(
        /AWS::(?:EC2|ECS|RDS|ElasticLoadBalancing)/,
      );
      expect(item.Properties.ProvisionedConcurrencyConfig).toBeUndefined();
      expect(item.Properties.ProvisionedThroughput).toBeUndefined();
    }
    expect(resources.Users.Properties.UserPoolTier).toBe("LITE");
    expect(resources.ApiLogs.Properties.RetentionInDays).toBe(7);
  });
  it("keeps buckets private and authenticates every project route", () => {
    for (const name of ["EditorBucket", "DraftsBucket", "SitesBucket"])
      expect(
        resources[name].Properties.PublicAccessBlockConfiguration
          .BlockPublicPolicy,
      ).toBe(true);
    for (const [name, item] of Object.entries(resources)) {
      if (/^Route\d+$/.test(name))
        expect(item.Properties.AuthorizationType).toBe("JWT");
    }
    expect(
      resources.EditorDistribution.Properties.DistributionConfig.Origins,
    ).not.toEqual(
      resources.SiteDistribution.Properties.DistributionConfig.Origins,
    );
  });
  it("rewrites at the edge, blocks private files and fails closed on unpublish", async () => {
    let live = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const context = vm.createContext({
      cf: {
        kvs: () => ({
          get: async () => {
            if (!live) throw new Error("missing");
            return live;
          },
        }),
      },
    });
    vm.runInContext(
      routerSource.replace("import cf from 'cloudfront';", ""),
      context,
    );
    const root = "/sites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/";
    const route = (uri) => context.handler({ request: { uri, method: "GET" } });
    expect((await route(root)).uri).toBe(`${root}releases/${live}/index.html`);
    expect((await route(root + "project.forma.json")).statusCode).toBe(404);
    expect((await route(root + "%2e%2e/secret")).statusCode).toBe(404);
    // Installable app files are served from the live root, like pages.
    for (const file of [
      "app.js",
      "logic.js",
      "sw.js",
      "manifest.webmanifest",
      "icon.svg",
      "icon-192.png",
    ])
      expect((await route(root + file)).uri).toBe(
        `${root}releases/${live}/${file}`,
      );
    expect((await route(root + "other.js")).statusCode).toBe(404);
    const explicit = `${root}releases/${live}/index.html`;
    live = "";
    expect((await route(explicit)).statusCode).toBe(404);
  });
  it("lets published sites run Forma's app script and reach the public app API", () => {
    const csp =
      resources.SiteHeaders.Properties.ResponseHeadersPolicyConfig
        .SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy[
        "Fn::Sub"
      ];
    for (const part of [
      "script-src 'self'",
      "connect-src 'self' ${Api.ApiEndpoint}",
      "manifest-src 'self'",
      "worker-src 'self'",
      "default-src 'none'",
    ])
      expect(csp).toContain(part);
    for (const name of [
      "AppFindRoute",
      "AppSubmitRoute",
      "AppAvailabilityRoute",
      "AppPayRoute",
      "AppCheckoutRoute",
      "PushKeyRoute",
      "PaymentSignInRoute",
    ])
      expect(resources[name].Properties.AuthorizationType).toBe("NONE");
    const routes = Object.entries(resources)
      .filter(([name]) => /^Route\d+$/.test(name))
      .map(([, r]) => r.Properties.RouteKey);
    expect(routes).toContain("POST /sites/{id}/app/{proxy+}");
    expect(routes).toContain("POST /sites/{id}/inbox/{requestId}/refund");
    expect(routes).toContain("POST /sites/{id}/inbox/{requestId}/delete");
  });
});

describe("API routes on AWS", () => {
  const resources = template().Resources;
  const routes = Object.entries(resources).filter(
    ([, r]) => r.Type === "AWS::ApiGatewayV2::Route",
  );
  const byKey = new Map(routes.map(([id, r]) => [r.Properties.RouteKey, id]));
  const settings = resources.Stage.Properties.RouteSettings;
  it("makes exactly the listed hosted routes, each once, with its authorization", () => {
    const hosted = apiRoutes.filter((r) => !r.localOnly);
    expect(routes).toHaveLength(hosted.length);
    expect(byKey.size).toBe(hosted.length);
    for (const entry of hosted) {
      const resource = resources[entry.id];
      expect(resource?.Properties.RouteKey, entry.route).toBe(entry.route);
      if (entry.auth === "jwt")
        expect(resource.Properties, entry.route).toMatchObject({
          AuthorizationType: "JWT",
          AuthorizerId: { Ref: "Authorizer" },
          AuthorizationScopes: ["openid"],
        });
      else {
        expect(resource.Properties.AuthorizationType, entry.route).toBe("NONE");
        expect(resource.Properties.AuthorizerId).toBeUndefined();
      }
    }
    for (const entry of apiRoutes.filter((r) => r.localOnly))
      expect(byKey.has(entry.route), entry.route).toBe(false);
  });
  it("keeps the logical IDs of routes already deployed", () => {
    // A new ID for a deployed route key makes CloudFormation create a
    // duplicate route first, which fails the deploy.
    const deployed = [
      "GET /sites",
      "POST /sites",
      "GET /sites/{id}",
      "GET /sites/{id}/draft",
      "PUT /sites/{id}/draft",
      "GET /sites/{id}/releases",
      "GET /sites/{id}/domains",
      "POST /sites/{id}/domains",
      "POST /sites/{id}/domains/{domainId}/check",
      "POST /sites/{id}/domains/{domainId}/retry",
      "POST /sites/{id}/domains/{domainId}/disconnect",
      "POST /sites/{id}/domains/{domainId}/primary",
      "POST /sites/{id}/domains/{domainId}/remove",
      "POST /sites/{id}/publish",
      "POST /sites/{id}/rollback",
      "POST /sites/{id}/unpublish",
      "GET /sites/{id}/inbox",
      "POST /sites/{id}/inbox/{requestId}",
      "GET /sites/{id}/payments",
      "POST /sites/{id}/payments",
      "POST /sites/{id}/payments/disconnect",
      "GET /sites/{id}/app",
      "GET /sites/{id}/app/{proxy+}",
      "POST /sites/{id}/app/{proxy+}",
      "PUT /sites/{id}/app/{proxy+}",
      "GET /account/notifications",
      "POST /account/notifications",
      "POST /sites/{id}/payments/sign-in",
      "POST /sites/{id}/payments/sign-in/finish",
      "POST /sites/{id}/inbox/{requestId}/refund",
      "POST /sites/{id}/inbox/{requestId}/delete",
    ].map((route, index) => [`Route${index}`, route]);
    for (const [id, route] of [
      ...deployed,
      ["Health", "GET /health"],
      ["InboxRoute", "POST /inbox/{id}"],
      ["AppFindRoute", "GET /apps/{id}/forms/{formId}/find"],
      ["AppSubmitRoute", "POST /apps/{id}/forms/{formId}"],
      ["AppAvailabilityRoute", "GET /apps/{id}/forms/{formId}/availability"],
      ["AppPayRoute", "GET /apps/{id}/records/{recordId}/pay"],
      ["AppCheckoutRoute", "GET /apps/{id}/records/{recordId}/checkout"],
      ["PushKeyRoute", "GET /push/key"],
      ["PaymentSignInRoute", "GET /payments/sign-in/{provider}/return"],
      ["InboxCheckoutRoute", "GET /inbox/{id}/requests/{requestId}/checkout"],
      ["InboxPaymentRoute", "GET /inbox/{id}/requests/{requestId}"],
    ])
      expect(resources[id]?.Properties.RouteKey, id).toBe(route);
  });
  it("throttles every public route on its own and only names real routes", () => {
    for (const [, r] of routes) {
      const key = r.Properties.RouteKey;
      if (r.Properties.AuthorizationType === "NONE" && key !== "GET /health") {
        expect(settings[key], key).toBeDefined();
        expect(settings[key].ThrottlingBurstLimit).toBeLessThanOrEqual(20);
        expect(settings[key].ThrottlingRateLimit).toBeLessThanOrEqual(10);
      }
    }
    for (const key of Object.keys(settings)) {
      expect(byKey.has(key), key).toBe(true);
      expect(resources.Stage.DependsOn).toContain(byKey.get(key));
    }
    expect(resources.Stage.Properties.DefaultRouteSettings).toEqual({
      ThrottlingBurstLimit: 10,
      ThrottlingRateLimit: 5,
    });
  });
  it("routes the whole of Forma Store: owner routes signed in, the storefront public", () => {
    const store = "/store/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const owner = "/sites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/commerce";
    const order = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    for (const [request, auth] of [
      [`GET ${store}`, "NONE"],
      [`POST ${store}/events`, "NONE"],
      [`POST ${store}/cart`, "NONE"],
      [`POST ${store}/cart/read`, "NONE"],
      [`POST ${store}/checkout`, "NONE"],
      [`POST ${store}/forms`, "NONE"],
      [`POST ${store}/unsubscribe`, "NONE"],
      [`POST ${store}/orders/${order}/receipt`, "NONE"],
      [`POST ${store}/orders/${order}/return`, "NONE"],
      [`GET ${store}/account`, "JWT"],
      [`POST ${store}/account`, "JWT"],
      [`GET ${store}/account/profile`, "JWT"],
      [`POST ${store}/account/orders/${order}/return`, "JWT"],
      [`GET ${owner}`, "JWT"],
      [`GET ${owner}/catalog`, "JWT"],
      [`PUT ${owner}/settings`, "JWT"],
      [`POST ${owner}/products`, "JWT"],
      [`POST ${owner}/discounts`, "JWT"],
      [`POST ${owner}/content`, "JWT"],
      [`POST ${owner}/orders/${order}`, "JWT"],
      [`POST ${owner}/members`, "JWT"],
      [`POST ${owner}/members/${order}/remove`, "JWT"],
      [`GET ${owner}/export`, "JWT"],
      [`POST ${owner}/integrations`, "JWT"],
      [`GET ${owner}/integrations/${order}/events`, "JWT"],
      [`POST ${owner}/campaign-preview`, "JWT"],
    ]) {
      const [method, path] = request.split(" ");
      const entry = matchRoute(method, path);
      expect(entry && !entry.localOnly, request).toBe(true);
      expect(resources[entry.id].Properties.AuthorizationType, request).toBe(
        auth,
      );
    }
    // The sandbox payment never reaches a hosted store.
    expect(
      matchRoute("POST", `${store}/orders/${order}/pay-local`).localOnly,
    ).toBeTruthy();
  });
  it("matches paths the way API Gateway does", () => {
    const site = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(matchRoute("GET", `/sites/${site}`).route).toBe("GET /sites/{id}");
    expect(matchRoute("GET", `/sites/${site}/app/records/a/b`).route).toBe(
      "GET /sites/{id}/app/{proxy+}",
    );
    expect(matchRoute("GET", `/sites/${site}/app`).route).toBe(
      "GET /sites/{id}/app",
    );
    expect(matchRoute("GET", `/store/${site}/cart`)).toBeUndefined();
    expect(matchRoute("POST", `/store/${site}/cart/`)).toBeUndefined();
    expect(matchRoute("POST", `/store/${site}/nope`)).toBeUndefined();
    expect(matchRoute("GET", `/sites/${site}/commerce/catalog`).route).toBe(
      "GET /sites/{id}/commerce/catalog",
    );
  });
  it("lets the API run store transactions without widening its access", () => {
    const statements =
      resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement;
    const table = statements.find(
      (s) =>
        JSON.stringify(s.Resource) ===
        JSON.stringify({ "Fn::GetAtt": ["Table", "Arn"] }),
    );
    expect(table.Action).toEqual([
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
    ]);
    for (const role of ["ApiRole", "WorkerRole"])
      for (const statement of resources[role].Properties.Policies[0]
        .PolicyDocument.Statement) {
        const actions = [statement.Action].flat();
        expect(actions.some((a) => a.endsWith(":*") || a === "*")).toBe(false);
        expect(actions.some((a) => /Scan|BatchWrite/.test(a))).toBe(false);
        expect(statement.Resource).not.toBe("*");
      }
    const env = resources.ApiFunction.Properties.Environment.Variables;
    expect(env.EDITOR_ORIGIN).toBeDefined();
    expect(env.FORMA_MODE).toBe("aws");
    expect(resources.Table.Properties.TimeToLiveSpecification).toEqual({
      AttributeName: "expires",
      Enabled: true,
    });
  });
});
