import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { normalizeHostname } from "../../backend/domains";
import { publicIpv4 } from "../../backend/domain-probe";
import { domainTemplate } from "../../backend/domain-template";
import { routerSource, template } from "../../infra/template.mjs";
import { validateRecords, route53Changes } from "../../scripts/apply-dns.mjs";
import { resolveOidcSubject } from "../../infra/bootstrap.mjs";

describe("owned domains", () => {
  it("accepts exact legacy or immutable CI identities without broadening repository or environment access", () => {
    expect(resolveOidcSubject("owner/repo", "production")).toBe(
      "repo:owner/repo:environment:production",
    );
    expect(
      resolveOidcSubject(
        "owner/repo",
        "production",
        "repo:owner@123/repo@456:environment:production",
      ),
    ).toBe("repo:owner@123/repo@456:environment:production");
    for (const subject of [
      "repo:owner/*:environment:production",
      "repo:other@123/repo@456:environment:production",
      "repo:owner@123/repo@456:environment:development",
    ])
      expect(() =>
        resolveOidcSubject("owner/repo", "production", subject),
      ).toThrow();
  });
  it("normalizes real hostnames and rejects paths, wildcards, internal addresses and public suffixes", () => {
    expect(normalizeHostname("WWW.MyBusiness.com.")).toBe("www.mybusiness.com");
    expect(normalizeHostname("shop.bücher.de")).toBe("shop.xn--bcher-kva.de");
    for (const value of [
      "https://example.com",
      "example.com/path",
      "localhost",
      "127.0.0.1",
      "*.example.com",
      "co.uk",
      "a.localhost",
      "x.cloudfront.net",
      "something.amazonaws.com",
      "user@host.com",
      "example.com:443",
      "a..com",
    ])
      expect(() => normalizeHostname(value)).toThrow();
  });
  it("blocks private, metadata, multicast and documentation addresses from the HTTPS check", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "198.18.0.1",
      "203.0.113.1",
      "::1",
      "garbage",
    ])
      expect(publicIpv4(ip)).toBe(false);
    expect(publicIpv4("8.8.8.8")).toBe(true);
  });
  it("uses non-exportable ACM certificates, SNI and a private S3 origin without fixed compute", () => {
    const domain = domainTemplate({
      hostname: "shop.example.com",
      bucketDomain: "private.s3.us-east-1.amazonaws.com",
      originAccessId: "oac",
      routerArn: "router",
      headersPolicyId: "headers",
      stack: "forma-test",
    });
    expect(domain.Resources.Certificate.Properties.CertificateExport).toBe(
      "DISABLED",
    );
    expect(
      domain.Resources.Distribution.Properties.DistributionConfig
        .ViewerCertificate.SslSupportMethod,
    ).toBe("sni-only");
    expect(
      domain.Resources.Distribution.Properties.DistributionConfig
        .DefaultCacheBehavior.ViewerProtocolPolicy,
    ).toBe("redirect-to-https");
    expect(Object.keys(domain.Resources)).toEqual([
      "Certificate",
      "Distribution",
    ]);
    const resources = template().Resources;
    expect(
      resources.ApiRole.Properties.Policies[0].PolicyDocument.Statement.some(
        (statement) => statement.Action === "iam:PassRole",
      ),
    ).toBe(true);
    expect(
      resources.DomainExecutionRole.Properties.AssumeRolePolicyDocument
        .Statement[0].Principal.Service,
    ).toBe("cloudformation.amazonaws.com");
  });
  it("routes only the bound website and makes unpublishing effective on all domains", async () => {
    const siteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      release = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const map = new Map([
      [
        "host:www.mybusiness.com",
        JSON.stringify({ siteId, connectionId: "connection", active: true }),
      ],
      [siteId, release],
    ]);
    const context = vm.createContext({
      cf: {
        kvs: () => ({
          get: async (key: string) => {
            if (!map.has(key)) throw new Error("missing");
            return map.get(key);
          },
        }),
      },
    });
    vm.runInContext(
      routerSource.replace("import cf from 'cloudfront';", ""),
      context,
    );
    const route = (uri: string, host = "www.mybusiness.com") =>
      context.handler({
        request: { uri, method: "GET", headers: { host: { value: host } } },
      });
    expect((await route("/")).uri).toBe(
      `/sites/${siteId}/releases/${release}/index.html`,
    );
    expect(
      (await route(`/sites/${siteId}/releases/${release}/styles.css`)).uri,
    ).toBe(`/sites/${siteId}/releases/${release}/styles.css`);
    expect(
      (
        await route(
          `/sites/cccccccc-cccc-4ccc-8ccc-cccccccccccc/releases/${release}/index.html`,
        )
      ).statusCode,
    ).toBe(404);
    expect((await route("/project.forma.json")).statusCode).toBe(404);
    expect((await route("/", "unclaimed.mybusiness.com")).statusCode).toBe(404);
    expect(
      JSON.parse((await route("/.well-known/forma-domain")).body).connectionId,
    ).toBe("connection");
    map.delete(siteId);
    expect((await route("/")).statusCode).toBe(404);
    expect(
      (await route(`/sites/${siteId}/releases/${release}/styles.css`))
        .statusCode,
    ).toBe(404);
    map.set(siteId, release);
    map.set(
      "host:www.mybusiness.com",
      JSON.stringify({ siteId, connectionId: "connection", active: false }),
    );
    expect((await route("/")).statusCode).toBe(404);
  });
  it("exports only the requested DNS records and never generates an overwrite or a paid hosted zone", () => {
    const records = validateRecords({
      hostname: "mybusiness.com",
      records: [
        {
          purpose: "ownership",
          type: "TXT",
          name: "_forma.mybusiness.com",
          value: `forma-verification=${"a".repeat(48)}`,
        },
        {
          purpose: "certificate",
          type: "CNAME",
          name: "_abc.mybusiness.com",
          value: "_token.acm-validations.aws.",
        },
        {
          purpose: "routing",
          type: "ALIAS",
          name: "mybusiness.com",
          value: "d123.cloudfront.net",
        },
      ],
    });
    const changes = route53Changes(records);
    expect(changes).toHaveLength(4);
    expect(changes.every((change) => change.Action === "CREATE")).toBe(true);
    expect(
      changes.slice(2).map((change) => change.ResourceRecordSet.Type),
    ).toEqual(["A", "AAAA"]);
    expect(() =>
      validateRecords({
        hostname: "mybusiness.com",
        records: [
          {
            purpose: "routing",
            type: "MX",
            name: "mybusiness.com",
            value: "mail.example.com",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateRecords({
        hostname: "mybusiness.com",
        records: [
          {
            purpose: "routing",
            type: "CNAME",
            name: "someone-else.com",
            value: "d123.cloudfront.net",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateRecords({
        hostname: "mybusiness.com",
        records: [
          {
            purpose: "routing",
            type: "CNAME",
            name: "mybusiness.com",
            value: "local.cloudfront.local.test",
          },
        ],
      }),
    ).toThrow();
  });
});
