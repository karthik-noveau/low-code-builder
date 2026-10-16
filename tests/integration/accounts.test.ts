import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
async function call(route: string, method = "GET", body?: unknown, token = "") {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
describe("local account lifecycle", () => {
  it("recovers a password once and revokes every older session", async () => {
    const email = `recovery-${randomUUID()}@local.test`,
      password = "Local-test-password-42",
      changed = "Changed-password-123";
    const first = await call("/auth/register", "POST", { email, password });
    expect(first.status).toBe(200);
    const second = await call("/auth/login", "POST", { email, password });
    const forgot = await call("/auth/forgot", "POST", { email });
    expect(forgot.status).toBe(200);
    expect(forgot.data.token).toBeUndefined();
    const missing = await call("/auth/forgot", "POST", {
      email: `missing-${randomUUID()}@local.test`,
    });
    expect(missing.data).toEqual(forgot.data);
    const directory = path.resolve(".local/data/mail");
    const messages = await Promise.all(
      (await readdir(directory))
        .filter((file) => file.startsWith("reset-"))
        .map(async (file) =>
          JSON.parse(await readFile(path.join(directory, file), "utf8")),
        ),
    );
    const message = messages.find((item) => item.to === email);
    expect(message).toBeDefined();
    const token = new URL(message.url).searchParams.get("reset");
    expect(
      (await call("/auth/reset", "POST", { token, password: changed })).status,
    ).toBe(200);
    expect(
      (await call("/auth/reset", "POST", { token, password: changed })).status,
    ).toBe(410);
    for (const session of [first.data.token, second.data.token])
      expect((await call("/sites", "GET", undefined, session)).status).toBe(
        401,
      );
    expect(
      (await call("/auth/login", "POST", { email, password })).status,
    ).toBe(401);
    const signedIn = await call("/auth/login", "POST", {
      email,
      password: changed,
    });
    expect(signedIn.status).toBe(200);
    expect(
      (
        await call(
          "/account/logout-all",
          "POST",
          { currentPassword: changed },
          signedIn.data.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/sites", "GET", undefined, signedIn.data.token)).status,
    ).toBe(401);
  });
  it("guards site/account deletion and removes access without destroying unrelated data", async () => {
    const email = `delete-${randomUUID()}@local.test`,
      password = "Local-delete-password-42";
    const account = await call("/auth/register", "POST", { email, password });
    const token = account.data.token;
    const site = (await call("/sites", "POST", { name: "Delete test" }, token))
      .data.site;
    await call(`/sites/${site.id}/commerce`, "GET", undefined, token);
    expect(
      (
        await call(
          "/account/delete",
          "POST",
          { currentPassword: password, confirmation: `DELETE ${email}` },
          token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `/sites/${site.id}/delete`,
          "POST",
          { confirmation: "DELETE wrong name" },
          token,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await call(
          `/sites/${site.id}/delete`,
          "POST",
          { confirmation: "DELETE Delete test" },
          token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call(`/sites/${site.id}`, "GET", undefined, token)).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/account/delete",
          "POST",
          {
            currentPassword: "incorrect-password",
            confirmation: `DELETE ${email}`,
          },
          token,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          "/account/delete",
          "POST",
          { currentPassword: password, confirmation: `DELETE ${email}` },
          token,
        )
      ).status,
    ).toBe(200);
    expect((await call("/sites", "GET", undefined, token)).status).toBe(401);
    expect(
      (await call("/auth/login", "POST", { email, password })).status,
    ).toBe(401);
  });
  it("keeps customer addresses and order history private to the signed-in account", async () => {
    const password = "Local-customer-password-42";
    const a = (
      await call("/auth/register", "POST", {
        email: `customer-a-${randomUUID()}@local.test`,
        password,
      })
    ).data.token;
    const b = (
      await call("/auth/register", "POST", {
        email: `customer-b-${randomUUID()}@local.test`,
        password,
      })
    ).data.token;
    const site = (await call("/sites", "POST", { name: "Customer test" }, a))
      .data.site.id;
    await call(`/sites/${site}/commerce`, "GET", undefined, a);
    const route = `/store/${site}/account`;
    expect(
      (
        await call(
          `/store/${randomUUID()}/account`,
          "POST",
          { revision: 0, addresses: [] },
          a,
        )
      ).status,
    ).toBe(404);
    expect((await call(route)).status).toBe(401);
    const address = {
      name: "Private Customer",
      line1: "1 Test Street",
      city: "City",
      postalCode: "10001",
      country: "US",
    };
    expect(
      (await call(route, "POST", { revision: 0, addresses: [address] }, a))
        .status,
    ).toBe(200);
    expect((await call(route, "GET", undefined, a)).data.addresses).toEqual([
      address,
    ]);
    expect((await call(route, "GET", undefined, b)).data.addresses).toEqual([]);
    expect(
      (await call(route, "POST", { revision: 0, addresses: [] }, a)).status,
    ).toBe(409);
  });
});
