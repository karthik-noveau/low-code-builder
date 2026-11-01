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
  it("signs shoppers in with an emailed code and keeps their addresses private", async () => {
    const owner = (
      await call("/auth/register", "POST", {
        email: `store-owner-${randomUUID()}@local.test`,
        password: "Local-customer-password-42",
      })
    ).data.token;
    const site = (
      await call("/sites", "POST", { name: "Customer test" }, owner)
    ).data.site.id;
    const overview = await call(
      `/sites/${site}/commerce`,
      "GET",
      undefined,
      owner,
    );
    const store = `/store/${site}/account`;
    // A closed store offers no sign-in.
    expect(
      (await call(`${store}/code`, "POST", { email: "a@local.test" })).status,
    ).toBe(404);
    await call(
      `/sites/${site}/commerce/settings`,
      "PUT",
      { ...overview.data.settings, enabled: true },
      owner,
    );
    /** The code from the response (local preview) or the store's outbox. */
    const codeFor = async (email: string) => {
      const sent = await call(`${store}/code`, "POST", { email });
      expect(sent.status).toBe(200);
      if (sent.data.preview) return String(sent.data.preview);
      const outbox = (
        await call(`/sites/${site}/commerce`, "GET", undefined, owner)
      ).data.outbox as { to: string; body: string }[];
      return /\b(\d{6})\b/.exec(
        outbox.find((m) => m.to === email)?.body ?? "",
      )![1];
    };
    const aEmail = `customer-a-${randomUUID()}@local.test`;
    // Wrong codes count; the sixth try fails even with the right code.
    const code = await codeFor(aEmail);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect(
        (await call(`${store}/session`, "POST", { email: aEmail, code: wrong }))
          .status,
      ).toBe(401);
    expect(
      (await call(`${store}/session`, "POST", { email: aEmail, code })).status,
    ).toBe(401);
    // Asking again straight away is refused.
    expect(
      (await call(`${store}/code`, "POST", { email: aEmail })).status,
    ).toBe(429);
    const bEmail = `customer-b-${randomUUID()}@local.test`;
    const bCode = await codeFor(bEmail);
    const session = await call(`${store}/session`, "POST", {
      email: bEmail.toUpperCase(),
      code: bCode,
    });
    expect(session.status).toBe(201);
    const b = String(session.data.token);
    // A code works once.
    expect(
      (await call(`${store}/session`, "POST", { email: bEmail, code: bCode }))
        .status,
    ).toBe(401);
    expect(
      (await call(`${store}/read`, "POST", { token: "f".repeat(64) })).status,
    ).toBe(401);
    expect((await call(`${store}/read`, "POST", {})).status).toBe(401);
    const address = {
      name: "Private Customer",
      line1: "1 Test Street",
      city: "City",
      postalCode: "10001",
      country: "US",
    };
    expect(
      (
        await call(store, "POST", {
          token: b,
          revision: 0,
          addresses: [address],
        })
      ).status,
    ).toBe(200);
    const read = await call(`${store}/read`, "POST", { token: b });
    expect(read.data.email).toBe(bEmail);
    expect(read.data.addresses).toEqual([address]);
    expect(
      (await call(store, "POST", { token: b, revision: 0, addresses: [] }))
        .status,
    ).toBe(409);
    // Another store doesn't know this token.
    expect(
      (await call(`/store/${randomUUID()}/account/read`, "POST", { token: b }))
        .status,
    ).toBe(404);
    expect((await call(`${store}/sign-out`, "POST", { token: b })).status).toBe(
      200,
    );
    expect((await call(`${store}/read`, "POST", { token: b })).status).toBe(
      401,
    );
  });
});
