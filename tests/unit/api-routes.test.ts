import { describe, expect, it, vi } from "vitest";
import { apiRoutes } from "../../infra/api-routes.mjs";

// No database: every handler that gets as far as storage fails with a 500,
// which is all this test needs to tell a handled route from an unknown one.
vi.hoisted(() => {
  process.env.DYNAMODB_ENDPOINT = "http://127.0.0.1:9";
  process.env.AWS_MAX_ATTEMPTS = "1";
  process.env.FORMA_DATA_DIR = "/nonexistent/forma-route-probe";
});
// Site access granted, so scoped routes reach their own routing.
vi.mock("../../backend/access", () => ({
  siteAccess: async (owner: string, id: string) => ({
    owner,
    role: "owner",
    site: { id, name: "Probe", owner },
  }),
  allow: () => undefined,
  sharedSites: async () => [],
}));
const { api } = await import("../../backend/api");

const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const samples: Record<string, string> = {
  requestId: `1700000000000-${uuid}`,
  provider: "stripe",
  proxy: "records",
};
const pathOf = (route: string) =>
  route
    .split(" ")[1]
    .replace(/\{(\w+)\+?\}/g, (_, name: string) => samples[name] ?? uuid);
/** What the router answers when nothing handles a path. */
const unknown = (status: number, error: unknown) =>
  status === 405 ||
  (status === 404 &&
    [
      "Not found.",
      "Store endpoint not found.",
      "Commerce endpoint not found.",
    ].includes(String(error)));

describe("the backend handles every listed API route", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  it.each(
    apiRoutes.filter((r) => !r.outsideApi).map((r) => [r.route, r] as const),
  )("%s", async (route, entry) => {
    const [method] = route.split(" ");
    const response = await api({
      method,
      path: pathOf(route),
      owner: entry.auth === "jwt" ? "probe-owner" : undefined,
      email: entry.auth === "jwt" ? "probe@example.com" : undefined,
      body: Buffer.from(method === "GET" ? "" : "{}"),
      headers: { "content-type": "application/json" },
    });
    let error: unknown;
    try {
      error = JSON.parse(response.body.toString()).error;
    } catch {
      error = undefined;
    }
    expect(unknown(response.status, error), `${response.status} ${error}`).toBe(
      false,
    );
  });
  it("tells an unknown route apart", async () => {
    for (const path of [
      `/store/${uuid}/nope`,
      `/sites/${uuid}/commerce/nope`,
      `/sites/${uuid}/nope`,
    ]) {
      const response = await api({
        method: "POST",
        path,
        owner: "probe-owner",
        body: Buffer.from("{}"),
        headers: {},
      });
      expect(
        unknown(response.status, JSON.parse(response.body.toString()).error),
        path,
      ).toBe(true);
    }
  });
  it("fails loudly locally when an answered route isn't listed", async () => {
    vi.resetModules();
    vi.doMock("../../infra/api-routes.mjs", () => ({
      apiRoutes: [],
      matchRoute: () => undefined,
    }));
    const unlisted = (await import("../../backend/api")).api;
    const response = await unlisted({
      method: "GET",
      path: "/health",
      body: Buffer.alloc(0),
      headers: {},
    });
    expect(response.status).toBe(500);
    expect(JSON.parse(response.body.toString()).error).toContain(
      "infra/api-routes.mjs",
    );
    vi.doUnmock("../../infra/api-routes.mjs");
  });
});
