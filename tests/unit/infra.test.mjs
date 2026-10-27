import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  template,
  routerSource,
  editorRouterSource,
} from "../../infra/template.mjs";

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
    ])
      expect(resources[name].Properties.AuthorizationType).toBe("NONE");
    const routes = Object.entries(resources)
      .filter(([name]) => /^Route\d+$/.test(name))
      .map(([, r]) => r.Properties.RouteKey);
    expect(routes).toContain("POST /sites/{id}/app/{proxy+}");
  });
});
