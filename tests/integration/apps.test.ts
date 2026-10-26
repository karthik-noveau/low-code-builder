import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { createServer, type Server } from "node:http";
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  randomUUID,
  verify,
} from "node:crypto";
import { createProject, createSection } from "../../src/studio/templates";
import { createCollection, createItem } from "../../src/studio/collections";
import { emptyPayments } from "../../src/studio/payments";
import { APP_TEMPLATES } from "../../src/apps/templates";
import {
  createAppField,
  emptyApp,
  REF_KEY,
  type AppField,
  type AppForm,
  type AppRecord,
  type AppTable,
} from "../../src/apps/model";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
const project = createProject();
const app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build(
  "Dhanlaxmi Electricals",
);
project.name = "Dhanlaxmi Electricals";
project.app = app;
const [customers, purchases] = app.tables;
const field = (table: typeof customers, name: string) =>
  table.fields.find((f) => f.name === name)!.id;
const NAME = field(customers, "Name");
const PHONE = field(customers, "Phone");
const AMOUNT = field(purchases, "Purchase amount");
const BOUGHT = field(purchases, "What did you buy?");
const REWARD = field(purchases, "Reward");
const CUSTOMER = field(purchases, "Customer");
const [submitForm, lookupForm] = app.forms;
const [totalReward, , pendingCount] = customers.totals;
// The step-by-step pages: "Is this you?" counts, a highlighted total.
submitForm.steps = ["Phone", "Confirm", "Purchase"];
submitForm.confirmTotals = [pendingCount.id, totalReward.id];
lookupForm.highlight = totalReward.id;
lookupForm.since = true;
// A form that exists in the app but isn't placed on any page.
app.forms.push({ ...lookupForm, id: "unplaced", name: "Unplaced" });
const [approve, reject] = purchases.actions;
project.pages[0].sections.push(
  createSection("app", { appForm: submitForm.id }),
  createSection("app", { appForm: lookupForm.id }),
);

let token = "",
  otherToken = "",
  viewerToken = "",
  ownerEmail = "",
  id = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => undefined) };
}
/** Calls a public route the way a published page does: cross-origin, no token. */
const visitor = (path: string, body?: unknown) =>
  call(`/apps/${id}${path}`, body ? "POST" : "GET", body, "", {
    origin: sites,
  });
const find = (form: string, value: string) =>
  visitor(`/forms/${form}/find?value=${encodeURIComponent(value)}`);
const send = (input: Record<string, unknown>) =>
  visitor(`/forms/${submitForm.id}`, {
    key: randomUUID(),
    identity: "98765 43210",
    values: { [AMOUNT]: "5000", [BOUGHT]: "Ceiling fan" },
    website: "",
    ...input,
  });
const records = async (table: string) =>
  (await call(`/sites/${id}/app/records?table=${table}`)).data as {
    records: AppRecord[];
    links: Record<string, Record<string, string>>;
  };
async function settle() {
  for (let i = 0; i < 80; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) return data.site;
    await new Promise((r) => setTimeout(r, 150));
  }
}

// A stand-in push service: records what the API sends, answers `status`.
const pushes: { headers: Record<string, unknown>; body: Buffer }[] = [];
let pushStatus = 201;
let receiver: Server;
let receiverUrl = "";
const browser = createECDH("prime256v1");
browser.generateKeys();
const authSecret = randomBytes(16);
/** What a browser does with a push: RFC 8291 decryption. */
function decrypt(body: Buffer) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const serverKey = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const shared = browser.computeSecret(serverKey);
  const ikm = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      authSecret,
      Buffer.concat([
        Buffer.from("WebPush: info\0"),
        browser.getPublicKey(),
        serverKey,
      ]),
      32,
    ),
  );
  const derive = (info: string, n: number) =>
    Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(info), n));
  const decipher = createDecipheriv(
    "aes-128-gcm",
    derive("Content-Encoding: aes128gcm\0", 16),
    derive("Content-Encoding: nonce\0", 12),
  );
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([
    decipher.update(data.subarray(0, -16)),
    decipher.final(),
  ]);
  expect(plain.at(-1)).toBe(2);
  return JSON.parse(plain.subarray(0, -1).toString());
}

beforeAll(async () => {
  receiver = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      pushes.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(pushStatus);
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  const address = receiver.address();
  receiverUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/push/abc`;

  const password = "Local-test-password-42";
  ownerEmail = `apps-${randomUUID()}@local.test`;
  token = (
    await call("/auth/register", "POST", { email: ownerEmail, password }, "")
  ).data.token;
  otherToken = (
    await call(
      "/auth/register",
      "POST",
      { email: `other-${randomUUID()}@local.test`, password },
      "",
    )
  ).data.token;
  const viewerEmail = `viewer-${randomUUID()}@local.test`;
  viewerToken = (
    await call("/auth/register", "POST", { email: viewerEmail, password }, "")
  ).data.token;
  const created = await call("/sites", "POST", { name: "Apps test" });
  id = created.data.site.id;
  await call(`/sites/${id}/commerce/members`, "POST", {
    email: viewerEmail,
    role: "viewer",
  });
  await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
});
afterAll(() => receiver?.close());

describe("business apps", { concurrent: false }, () => {
  let asha = "";
  it("lets the owner register customers before publishing", async () => {
    const info = await call(`/sites/${id}/app`);
    expect(info.data.published).toBe(false);
    expect(info.data.app.tables).toHaveLength(2);
    const created = await call(`/sites/${id}/app/records`, "POST", {
      table: customers.id,
      values: { [NAME]: "Asha Rao", [PHONE]: "+91 98765 43210" },
    });
    expect(created.response.status).toBe(201);
    expect(created.data.record).toMatchObject({
      values: { [NAME]: "Asha Rao", [PHONE]: "9876543210" },
      source: "owner",
      revision: 1,
    });
    asha = created.data.record.id;
    // The same number typed another way is still the same number.
    const duplicate = await call(`/sites/${id}/app/records`, "POST", {
      table: customers.id,
      values: { [NAME]: "Someone Else", [PHONE]: "9876543210" },
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data).toMatchObject({ field: PHONE });
    expect(duplicate.data.message).toContain("Asha Rao");
    const invalid = await call(`/sites/${id}/app/records`, "POST", {
      table: customers.id,
      values: { [NAME]: "", [PHONE]: "123" },
    });
    expect(invalid.response.status).toBe(422);
    expect(invalid.data.field).toBe(NAME);
    for (const [name, phone] of [
      ["Ravi Kumar", "9000000001"],
      ["Meena Iyer", "9000000002"],
    ])
      expect(
        (
          await call(`/sites/${id}/app/records`, "POST", {
            table: customers.id,
            values: { [NAME]: name, [PHONE]: phone },
          })
        ).response.status,
      ).toBe(201);
    // Forms aren't open until the site is live.
    expect((await find(submitForm.id, "9876543210")).response.status).toBe(404);
  });
  it("keeps records from viewers and other accounts", async () => {
    expect(
      (await call(`/sites/${id}/app`, "GET", undefined, viewerToken)).response
        .status,
    ).toBe(403);
    expect(
      (await call(`/sites/${id}/app`, "GET", undefined, otherToken)).response
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          `/sites/${id}/app/records?table=${customers.id}`,
          "GET",
          undefined,
          viewerToken,
        )
      ).response.status,
    ).toBe(403);
  });
  it("publishes pages that load app.js and install as an app", async () => {
    const { data } = await call(`/sites/${id}`);
    await call(`/sites/${id}/publish`, "POST", {
      version: data.site.version,
    });
    expect((await settle()).status).toBe("published");
    expect((await call(`/sites/${id}/app`)).data.published).toBe(true);
    const page = await fetch(`${sites}/sites/${id}/index.html`);
    const html = await page.text();
    expect(html).toContain('<script src="app.js" defer></script>');
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');
    const csp = page.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain(`connect-src 'self' ${base}`);
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    const files: [string, string][] = [
      ["app.js", "text/javascript"],
      ["sw.js", "text/javascript"],
      ["manifest.webmanifest", "application/manifest+json"],
      ["icon.svg", "image/svg+xml"],
      ["icon-192.png", "image/png"],
      ["icon-512.png", "image/png"],
      ["offline.html", "text/html"],
    ];
    for (const [name, type] of files) {
      const response = await fetch(`${sites}/sites/${id}/${name}`);
      expect(response.status, name).toBe(200);
      expect(response.headers.get("content-type")).toContain(type);
    }
    const manifest = await (
      await fetch(`${sites}/sites/${id}/manifest.webmanifest`)
    ).json();
    expect(manifest).toMatchObject({
      short_name: "Rewards",
      start_url: ".",
      display: "standalone",
      theme_color: project.theme.accent,
    });
    const png = Buffer.from(
      await (await fetch(`${sites}/sites/${id}/icon-192.png`)).arrayBuffer(),
    );
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(192);
    expect(await (await fetch(`${sites}/sites/${id}/app.js`)).text()).toContain(
      "serviceWorker",
    );
    expect(await (await fetch(`${sites}/sites/${id}/sw.js`)).text()).toContain(
      "offline.html",
    );
  });
  it("asks visitors “is this you?” with masked details, and refuses unknown numbers", async () => {
    const preflight = await fetch(`${base}/apps/${id}/forms/${submitForm.id}`, {
      method: "OPTIONS",
      headers: {
        origin: sites,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    const match = await find(submitForm.id, "+91 98765-43210");
    expect(match.response.status).toBe(200);
    expect(match.response.headers.get("access-control-allow-origin")).toBe("*");
    expect(match.data).toEqual({
      kind: "match",
      fields: [
        { name: "Name", value: "Asha Rao" },
        { name: "Phone", value: "•••••3210" },
      ],
      title: "Asha Rao",
      initials: "AR",
      totals: [
        {
          id: pendingCount.id,
          name: "Waiting for review",
          value: "0",
          amount: 0,
          money: false,
          tone: "waiting",
          phrase: "0 waiting for review purchases",
        },
        {
          id: totalReward.id,
          name: "Total reward",
          value: "₹0",
          amount: 0,
          money: true,
          tone: "good",
          short: "₹0",
          phrase: "₹0 total reward",
        },
      ],
    });
    const unknown = await find(submitForm.id, "9111111111");
    expect(unknown.response.status).toBe(404);
    expect(unknown.data.message).toBe(
      "This number isn’t registered. Ask the shop to register you.",
    );
    expect((await find("unplaced", "9876543210")).response.status).toBe(404);
  });
  let first: { ref: string; key: string } = { ref: "", key: "" };
  it("records a visitor's purchase once, however often they tap", async () => {
    const key = randomUUID();
    const sent = await send({
      key,
      // Visitors can't set the reward or the status.
      values: {
        [AMOUNT]: "5000",
        [BOUGHT]: "Ceiling fan",
        [REWARD]: "4000",
        [CUSTOMER]: "someone-else",
      },
      status: "approved",
    });
    expect(sent.response.status).toBe(201);
    expect(sent.data.ref).toMatch(/^ESR-10\d\d$/);
    expect(sent.data.message).toBe(
      `Sent for approval. Your reference is ${sent.data.ref}.`,
    );
    // The success screen's badge.
    expect(sent.data.status).toEqual({
      name: "Waiting for review",
      tone: "waiting",
    });
    first = { ref: sent.data.ref, key };
    const taps = await Promise.all(
      Array.from({ length: 5 }, () => send({ key })),
    );
    for (const tap of taps) {
      expect(tap.data.ref).toBe(sent.data.ref);
      expect(tap.data.status).toEqual(sent.data.status);
    }
    const { records: list } = await records(purchases.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      ref: sent.data.ref,
      status: "pending",
      source: "visitor",
      values: { [AMOUNT]: 5000, [CUSTOMER]: asha },
    });
    expect(list[0].values[REWARD]).toBeUndefined();
  });
  it("refuses bots, missing details and unknown customers", async () => {
    expect((await send({ website: "spam" })).response.status).toBe(422);
    const noIdentity = await send({ identity: "" });
    expect(noIdentity.response.status).toBe(422);
    expect(noIdentity.data.field).toBe("identity");
    const stranger = await send({ identity: "9111111111" });
    expect(stranger.response.status).toBe(422);
    expect(stranger.data).toMatchObject({
      field: "identity",
      message: "This number isn’t registered. Ask the shop to register you.",
    });
    const noAmount = await send({ values: { [BOUGHT]: "Lamp" } });
    expect(noAmount.response.status).toBe(422);
    expect(noAmount.data.field).toBe(AMOUNT);
    expect((await send({ key: "short" })).response.status).toBe(422);
    expect((await records(purchases.id)).records).toHaveLength(1);
  });
  it("shows the owner records with totals and link names", async () => {
    const list = await records(customers.id);
    const row = list.records.find((r) => r.id === asha)!;
    const [totalReward, , waiting] = customers.totals;
    expect(row.totals).toMatchObject({ [totalReward.id]: 0, [waiting.id]: 1 });
    const bought = await records(purchases.id);
    expect(bought.links[customers.id][asha]).toBe("Asha Rao");
    const summary = (await call(`/sites/${id}/app/summary`)).data;
    expect(summary.cards.map((c: { value: number }) => c.value)).toEqual([
      0, 1, 0, 3,
    ]);
    expect(summary.lists[0].records).toHaveLength(1);
  });
  it("approves with a reward no larger than the purchase, once", async () => {
    const [record] = (await records(purchases.id)).records;
    const path = `/sites/${id}/app/records/${record.id}/actions/${approve.id}`;
    const tooMuch = await call(path, "POST", {
      values: { [REWARD]: "6000" },
      revision: record.revision,
    });
    expect(tooMuch.response.status).toBe(422);
    expect(tooMuch.data).toMatchObject({ field: REWARD });
    expect(tooMuch.data.message).toBe(
      "Reward can't be more than the purchase amount.",
    );
    const missing = await call(path, "POST", {
      values: {},
      revision: record.revision,
    });
    expect(missing.response.status).toBe(422);
    expect(missing.data.field).toBe(REWARD);
    expect(
      (
        await call(path, "POST", {
          values: { [REWARD]: "500" },
          revision: record.revision + 5,
        })
      ).response.status,
    ).toBe(409);
    const done = await call(path, "POST", {
      values: { [REWARD]: "500" },
      revision: record.revision,
    });
    expect(done.response.status).toBe(200);
    expect(done.data.record).toMatchObject({
      status: "approved",
      values: { [REWARD]: 500 },
      revision: record.revision + 1,
    });
    expect(done.data.record.history.at(-1)).toMatchObject({
      action: "Approve",
      status: "approved",
      by: ownerEmail,
    });
    const again = await call(path, "POST", {
      values: { [REWARD]: "500" },
      revision: done.data.record.revision,
    });
    expect(again.response.status).toBe(409);
    expect(again.data.message).toContain("already approved");
  });
  it("applies 20 simultaneous approvals exactly once", async () => {
    const sent = await send({
      values: { [AMOUNT]: "2000", [BOUGHT]: "Extension board" },
    });
    const record = (await records(purchases.id)).records.find(
      (r) => r.ref === sent.data.ref,
    )!;
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        call(
          `/sites/${id}/app/records/${record.id}/actions/${approve.id}`,
          "POST",
          { values: { [REWARD]: "100" }, revision: record.revision },
        ),
      ),
    );
    const statuses = results.map((r) => r.response.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    const after = (await records(purchases.id)).records.find(
      (r) => r.id === record.id,
    )!;
    expect(after.revision).toBe(2);
    expect(after.history).toHaveLength(2);
  });
  it("rejects only with a reason, which the visitor sees", async () => {
    const sent = await send({
      values: { [AMOUNT]: "800", [BOUGHT]: "Bulbs" },
    });
    const record = (await records(purchases.id)).records.find(
      (r) => r.ref === sent.data.ref,
    )!;
    const path = `/sites/${id}/app/records/${record.id}/actions/${reject.id}`;
    const silent = await call(path, "POST", {
      note: " ",
      revision: record.revision,
    });
    expect(silent.response.status).toBe(422);
    expect(silent.data.field).toBe("note");
    const rejected = await call(path, "POST", {
      note: "Bill missing",
      revision: record.revision,
    });
    expect(rejected.data.record).toMatchObject({
      status: "rejected",
      note: "Bill missing",
    });
    const lookup = await find(lookupForm.id, "9876543210");
    expect(lookup.response.status).toBe(200);
    expect(lookup.data.kind).toBe("record");
    expect(lookup.data.fields).toEqual([{ name: "Name", value: "Asha Rao" }]);
    expect(lookup.data).toMatchObject({
      title: "Asha Rao",
      initials: "AR",
      key: "•••••3210",
      highlight: {
        id: totalReward.id,
        name: "Total reward",
        value: "₹600",
        amount: 600,
        money: true,
      },
    });
    expect(Date.parse(lookup.data.since)).toBeGreaterThan(0);
    // The highlighted total isn't repeated as a tile.
    expect(lookup.data.totals).toEqual([
      {
        id: pendingCount.id,
        name: "Waiting for review",
        value: "0",
        amount: 0,
        money: false,
        tone: "waiting",
        phrase: "0 waiting for review purchases",
      },
    ]);
    expect(lookup.data.history).toHaveLength(3);
    const [latest] = lookup.data.history;
    expect(latest).toMatchObject({
      ref: sent.data.ref,
      status: { name: "Rejected", tone: "bad" },
      note: "Bill missing",
    });
    expect(latest.fields).toEqual([
      { name: "Purchase amount", value: "₹800", type: "money" },
      { name: "What did you buy?", value: "Bulbs", type: "longText" },
      { name: "Reward", value: "", type: "money", owner: true },
    ]);
    // When it moved on: "Rejected 2 minutes ago".
    expect(Date.parse(latest.at)).toBeGreaterThanOrEqual(
      Date.parse(latest.createdAt),
    );
    const approved = lookup.data.history.find(
      (h: { ref: string }) => h.ref === first.ref,
    );
    expect(approved.fields[2]).toEqual({
      name: "Reward",
      value: "₹500",
      type: "money",
      owner: true,
    });
    expect(approved.at).toBeTruthy();
  });
  it("never deletes a customer with history, and moves a changed number", async () => {
    const refused = await call(
      `/sites/${id}/app/records/${asha}/delete`,
      "POST",
    );
    expect(refused.response.status).toBe(409);
    expect(refused.data.message).toContain("Mark them inactive instead");
    const { records: list } = await records(customers.id);
    const ravi = list.find((r) => r.values[NAME] === "Ravi Kumar")!;
    const meena = list.find((r) => r.values[NAME] === "Meena Iyer")!;
    const path = `/sites/${id}/app/records/${ravi.id}`;
    expect(
      (
        await call(path, "PUT", {
          values: { [PHONE]: "9000000002" },
          revision: ravi.revision,
        })
      ).response.status,
    ).toBe(409);
    const moved = await call(path, "PUT", {
      values: { [PHONE]: "9000000003" },
      revision: ravi.revision,
    });
    expect(moved.response.status).toBe(200);
    expect(moved.data.record.values[PHONE]).toBe("9000000003");
    expect(
      (
        await call(path, "PUT", {
          values: { [NAME]: "Ravi K" },
          revision: ravi.revision,
        })
      ).response.status,
    ).toBe(409);
    expect((await find(submitForm.id, "9000000001")).response.status).toBe(404);
    expect((await find(submitForm.id, "9000000003")).response.status).toBe(200);
    const removed = await call(
      `/sites/${id}/app/records/${meena.id}/delete`,
      "POST",
    );
    expect(removed.data).toEqual({ deleted: true });
    // Her number is free again.
    expect(
      (
        await call(`/sites/${id}/app/records`, "POST", {
          table: customers.id,
          values: { [NAME]: "New Meena", [PHONE]: "9000000002" },
        })
      ).response.status,
    ).toBe(201);
  });
  it("keeps paused customers out of the forms without losing their history", async () => {
    const PAUSED = field(customers, "Paused");
    const record = await call(`/sites/${id}/app/records`, "POST", {
      table: customers.id,
      values: { [NAME]: "Paused Pat", [PHONE]: "9000000009", [PAUSED]: true },
    });
    expect(record.response.status).toBe(201);
    for (const form of [submitForm.id, lookupForm.id]) {
      const refused = await find(form, "9000000009");
      expect(refused.response.status).toBe(403);
      expect(refused.data.message).toContain("paused");
    }
    expect((await send({ identity: "9000000009" })).response.status).toBe(403);
    const resumed = await call(
      `/sites/${id}/app/records/${record.data.record.id}`,
      "PUT",
      { values: { [PAUSED]: false }, revision: record.data.record.revision },
    );
    expect(resumed.response.status).toBe(200);
    expect((await find(lookupForm.id, "9000000009")).response.status).toBe(200);
  });
  it("notifies the owner's devices with an encrypted push", async () => {
    const key = await call("/push/key", "GET", undefined, "");
    expect(key.response.headers.get("access-control-allow-origin")).toBe("*");
    expect(Buffer.from(key.data.publicKey, "base64url")).toHaveLength(65);
    expect(
      (
        await call(`/sites/${id}/app/devices`, "POST", {
          subscription: {
            endpoint: "https://evil.example/collect",
            keys: {
              p256dh: browser.getPublicKey("base64url"),
              auth: authSecret.toString("base64url"),
            },
          },
        })
      ).response.status,
    ).toBe(422);
    const added = await call(`/sites/${id}/app/devices`, "POST", {
      subscription: {
        endpoint: receiverUrl,
        keys: {
          p256dh: browser.getPublicKey("base64url"),
          auth: authSecret.toString("base64url"),
        },
      },
      label: "Shop phone",
    });
    expect(added.response.status).toBe(201);
    expect(added.data.device).toMatchObject({ label: "Shop phone" });
    expect(
      (await call(`/sites/${id}/app/devices`, "GET", undefined, viewerToken))
        .response.status,
    ).toBe(403);
    const test = await call(`/sites/${id}/app/devices/test`, "POST");
    expect(test.data).toEqual({ sent: 1 });
    const [push] = pushes.splice(0);
    expect(push.headers["content-encoding"]).toBe("aes128gcm");
    const auth = String(push.headers.authorization);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth)!;
    expect(k).toBe(key.data.publicKey);
    const [header, claims, signature] = jwt.split(".");
    expect(
      JSON.parse(Buffer.from(claims, "base64url").toString()),
    ).toMatchObject({ aud: new URL(receiverUrl).origin });
    const raw = Buffer.from(k, "base64url");
    const vapidKey = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33).toString("base64url"),
      },
      format: "jwk",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: vapidKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(decrypt(push.body).title).toBe("Notifications are on");
    // A visitor's purchase pings the owner, pointing at the app page.
    const sent = await send({
      values: { [AMOUNT]: "1200", [BOUGHT]: "Switches" },
    });
    const message = decrypt(pushes.splice(0)[0].body);
    expect(message.title).toContain(sent.data.ref);
    expect(message.body).toContain("Asha Rao");
    expect(message.url).toContain(
      `/owner?site=${id}&table=${purchases.id}&record=`,
    );
    // A browser that unsubscribed is forgotten.
    pushStatus = 410;
    expect((await call(`/sites/${id}/app/devices/test`, "POST")).data).toEqual({
      sent: 0,
    });
    expect((await call(`/sites/${id}/app/devices`)).data.devices).toEqual([]);
  });
  it("limits lookups per visitor per minute", async () => {
    let limited = false;
    for (let i = 0; i < 35 && !limited; i++)
      limited =
        (await find(lookupForm.id, "9000000099")).response.status === 429;
    expect(limited).toBe(true);
  });
  it("closes every form once unpublished", async () => {
    const { data } = await call(`/sites/${id}`);
    await call(`/sites/${id}/unpublish`, "POST", {
      version: data.site.version,
    });
    await settle();
    expect((await call(`/sites/${id}/app`)).data.published).toBe(false);
    expect((await find(lookupForm.id, "9876543210")).response.status).toBe(404);
    expect((await send({})).response.status).toBe(404);
    // The owner keeps working with the records.
    expect((await records(purchases.id)).records.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- orders, bookings, payments

const menu = createCollection("menu");
menu.currency = "₹";
const DISH = menu.display.title;
const PRICE = menu.display.price;
menu.items = [];
for (const [title, price, hidden] of [
  ["Paneer tikka", "250", false],
  ["Butter naan", "67", false],
  ["Off menu", "10", true],
] as const)
  menu.items.push({
    ...createItem(menu, { [DISH]: title, [PRICE]: price }),
    hidden,
  });
const events = createCollection("events");
events.fields.push({ id: "seats", name: "Seats", type: "number", options: [] });
events.items = [
  createItem(events, { [events.display.title]: "Wine tasting", seats: "4" }),
  createItem(events, { [events.display.title]: "Open mic" }),
];

function table(
  id: string,
  name: string,
  singular: string,
  prefix: string,
  fields: AppField[],
  extra: Partial<AppTable> = {},
): AppTable {
  return {
    id,
    name,
    singular,
    fields,
    titleField: fields[0].id,
    statuses: [],
    initial: "",
    actions: [],
    totals: [],
    prefix,
    notify: false,
    ...extra,
  };
}
const f = (id: string, name: string, type: AppField["type"], extra = {}) =>
  ({ ...createAppField(name, type, extra), id }) as AppField;
const orders = table(
  "orders",
  "Orders",
  "Order",
  "ORD",
  [
    f("name", "Name", "text", { required: true }),
    f("phone", "Phone", "phone", { required: true }),
    f("email", "Email", "email"),
    f("dishes", "Dishes", "items", { required: true, collection: menu.id }),
  ],
  {
    notify: true,
    statuses: [
      { id: "placed", name: "Placed", tone: "waiting" },
      { id: "out", name: "Out for delivery", tone: "neutral" },
      { id: "delivered", name: "Delivered", tone: "good" },
    ],
    initial: "placed",
    actions: [
      {
        id: "dispatch",
        name: "Dispatch",
        from: ["placed"],
        to: "out",
        set: [],
        note: "optional",
        limits: [],
        tone: "primary",
        tellVisitor: true,
      },
    ],
  },
);
const bookings = table(
  "bookings",
  "Bookings",
  "Booking",
  "BK",
  [
    f("name", "Name", "text", { required: true }),
    f("phone", "Phone", "phone", { required: true }),
    f("date", "Date", "date", { required: true }),
  ],
  {
    statuses: [
      { id: "booked", name: "Booked", tone: "good" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "booked",
    actions: [
      {
        id: "cancel",
        name: "Cancel",
        from: ["booked"],
        to: "cancelled",
        set: [],
        note: "none",
        limits: [],
        tone: "danger",
      },
      {
        id: "rebook",
        name: "Rebook",
        from: ["cancelled"],
        to: "booked",
        set: [],
        note: "none",
        limits: [],
        tone: "primary",
      },
    ],
    capacity: [
      {
        id: "tables",
        name: "Tables per day",
        group: ["date"],
        max: 10,
        statuses: ["booked"],
        message: "That day is fully booked.",
      },
    ],
  },
);
const tickets = table(
  "tickets",
  "Tickets",
  "Ticket",
  "TK",
  [
    f("name", "Name", "text", { required: true }),
    f("event", "Event", "item", { required: true, collection: events.id }),
    f("guests", "Guests", "number", { min: 1, max: 10 }),
  ],
  {
    capacity: [
      {
        id: "seats",
        name: "Seats",
        group: ["event"],
        max: 0,
        maxField: "seats",
        size: "guests",
        statuses: [],
        message: "Sold out.",
      },
    ],
  },
);
const form = (
  id: string,
  kind: AppForm["kind"],
  tableId: string,
  fields: string[],
  extra: Partial<AppForm> = {},
): AppForm => ({
  id,
  name: id,
  kind,
  table: tableId,
  fields,
  totals: [],
  title: id,
  intro: "",
  button: "Send",
  success: "Thanks. Your reference is {ref}.",
  ...extra,
});
const shopApp = {
  ...emptyApp("Spice Route"),
  tables: [orders, bookings, tickets],
  forms: [
    form("order", "submit", "orders", ["name", "phone", "email", "dishes"], {
      payment: { field: "dishes" },
    }),
    form("track", "lookup", "orders", ["name", "dishes"], {
      key: REF_KEY,
      verify: "phone",
    }),
    form("book", "submit", "bookings", ["name", "phone", "date"]),
    form("mine", "lookup", "bookings", ["date"], { key: "phone" }),
    form("ticket", "submit", "tickets", ["name", "event", "guests"]),
  ],
};
const shop = createProject();
shop.name = "Spice Route";
shop.collections = [menu, events];
shop.payments = {
  ...emptyPayments(),
  upi: "spiceroute@okaxis",
  payee: "Spice Route",
  bank: "HDFC Bank 0012 3456",
};
shop.app = shopApp;
for (const f of shopApp.forms)
  shop.pages[0].sections.push(createSection("app", { appForm: f.id }));

describe(
  "business apps that take orders, bookings and payments",
  { concurrent: false },
  () => {
    let shopId = "";
    const ask = (path: string, body?: unknown) =>
      call(`/apps/${shopId}${path}`, body ? "POST" : "GET", body, "", {
        origin: sites,
      });
    const lookup = (formId: string, value: string, verify?: string) =>
      ask(
        `/forms/${formId}/find?value=${encodeURIComponent(value)}${verify === undefined ? "" : `&verify=${encodeURIComponent(verify)}`}`,
      );
    const submit = (
      formId: string,
      values: Record<string, unknown>,
      key = randomUUID(),
    ) => ask(`/forms/${formId}`, { key, values, website: "" });
    const list = async (tableId: string) =>
      (await call(`/sites/${shopId}/app/records?table=${tableId}`)).data
        .records as AppRecord[];
    const outbox = async () =>
      (await call(`/sites/${shopId}/commerce`)).data.outbox as {
        to: string;
        subject: string;
        body: string;
      }[];

    beforeAll(async () => {
      const created = await call("/sites", "POST", { name: "Spice Route" });
      shopId = created.data.site.id;
      const saved = await fetch(`${base}/sites/${shopId}/draft`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/gzip",
          "if-match": String(created.data.site.version),
        },
        body: gzipSync(JSON.stringify(shop)),
      });
      expect(saved.status).toBe(200);
      const store = (await call(`/sites/${shopId}/commerce`)).data.settings;
      expect(
        (
          await call(`/sites/${shopId}/commerce/settings`, "PUT", {
            ...store,
            contactEmail: "kitchen@spiceroute.test",
          })
        ).response.status,
      ).toBe(200);
      const { data } = await call(`/sites/${shopId}`);
      await call(`/sites/${shopId}/publish`, "POST", {
        version: data.site.version,
      });
      for (let i = 0; i < 80; i++) {
        const site = (await call(`/sites/${shopId}`)).data.site;
        if (!["queued", "publishing"].includes(site.status)) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    });

    let order = { id: "", ref: "", key: "" };
    it("prices a cart from the live menu and asks for payment by UPI", async () => {
      const key = randomUUID();
      const hidden = await submit("order", {
        name: "Asha",
        phone: "9876543210",
        dishes: { "off-menu": 1 },
      });
      expect(hidden.response.status).toBe(422);
      expect(hidden.data.field).toBe("dishes");
      const sent = await submit(
        "order",
        {
          name: "Asha",
          phone: "+91 98765 43210",
          email: "Asha@Example.test",
          // A visitor's prices are ignored: the menu's are used.
          dishes: { "paneer-tikka": 2, "butter-naan": 2 },
        },
        key,
      );
      expect(sent.response.status).toBe(201);
      expect(sent.data.ref).toMatch(/^ORD-10\d\d$/);
      expect(sent.data.payment).toMatchObject({
        amount: "₹634",
        status: "unpaid",
        reference: sent.data.ref,
        recordId: expect.any(String),
      });
      expect(sent.data.payment.upi).toContain(
        "upi://pay?pa=spiceroute%40okaxis",
      );
      expect(sent.data.payment.upi).toContain("am=634.00");
      expect(sent.data.payment.instructions).toContain("HDFC Bank 0012 3456");
      expect(sent.data.payment.checkout).toBeUndefined();
      order = { id: sent.data.payment.recordId, ref: sent.data.ref, key };
      // A second tap gets the same order and payment.
      const again = await submit("order", {}, key);
      expect(again.data).toEqual(sent.data);
      const [record] = await list("orders");
      expect(record).toMatchObject({
        id: order.id,
        values: { dishes: 634, phone: "9876543210" },
        lines: {
          dishes: [
            {
              slug: "paneer-tikka",
              title: "Paneer tikka",
              price: 250,
              quantity: 2,
            },
            {
              slug: "butter-naan",
              title: "Butter naan",
              price: 67,
              quantity: 2,
            },
          ],
        },
        payment: { amount: 634, status: "unpaid", reference: order.ref },
      });
      expect(JSON.stringify(record)).not.toContain("payKey");
      const mail = (await outbox()).find((m) => m.subject.includes(order.ref))!;
      expect(mail.to).toBe("kitchen@spiceroute.test");
      expect(mail.body).toContain(
        `New order ${order.ref}: 2 × Paneer tikka, 2 × Butter naan — ₹634`,
      );
    });
    it("shows the payment only to the visitor who sent it", async () => {
      const pay = await ask(`/records/${order.id}/pay?key=${order.key}`);
      expect(pay.response.status).toBe(200);
      expect(pay.response.headers.get("access-control-allow-origin")).toBe("*");
      expect(pay.data).toMatchObject({ amount: "₹634", status: "unpaid" });
      for (const k of [randomUUID(), "x"])
        expect(
          (await ask(`/records/${order.id}/pay?key=${k}`)).response.status,
        ).toBe(404);
    });
    it("tracks an order by its reference and phone, without saying whether it exists", async () => {
      const found = await lookup(
        "track",
        order.ref.toLowerCase(),
        "98765-43210",
      );
      expect(found.response.status).toBe(200);
      expect(found.data).toMatchObject({
        kind: "record",
        ref: order.ref,
        status: { name: "Placed", tone: "waiting" },
        fields: [
          { name: "Name", value: "Asha" },
          { name: "Dishes", value: "₹634" },
        ],
        lines: [
          { title: "Paneer tikka", quantity: 2, price: "₹500" },
          { title: "Butter naan", quantity: 2, price: "₹134" },
        ],
      });
      expect(found.data.steps).toEqual([
        { name: "Placed", at: expect.any(String) },
      ]);
      const wrongPhone = await lookup("track", order.ref, "9000000000");
      const unknown = await lookup("track", "ORD-9999", "9876543210");
      expect(wrongPhone.response.status).toBe(404);
      expect(unknown.response.status).toBe(404);
      expect(wrongPhone.data.message).toBe(unknown.data.message);
      const noPhone = await lookup("track", order.ref);
      expect(noPhone.response.status).toBe(422);
      expect(noPhone.data.field).toBe("verify");
    });
    it("lets the owner mark it paid and tells the visitor it's on its way", async () => {
      let [record] = await list("orders");
      const paid = await call(
        `/sites/${shopId}/app/records/${order.id}/paid`,
        "POST",
        {
          revision: record.revision,
        },
      );
      expect(paid.response.status).toBe(200);
      expect(paid.data.record.payment).toMatchObject({
        status: "paid",
        confirmedBy: "owner",
      });
      const pay = await ask(`/records/${order.id}/pay?key=${order.key}`);
      expect(pay.data.status).toBe("paid");
      expect(pay.data.upi).toBeUndefined();
      record = paid.data.record;
      const dispatched = await call(
        `/sites/${shopId}/app/records/${order.id}/actions/dispatch`,
        "POST",
        { note: "Rider Ravi, 20 minutes", revision: record.revision },
      );
      expect(dispatched.response.status).toBe(200);
      expect(dispatched.data.record.payment.status).toBe("paid");
      const mail = (await outbox()).find((m) => m.to === "asha@example.test")!;
      expect(mail.subject).toContain(
        `Your order ${order.ref} is now Out for delivery`,
      );
      expect(mail.subject).toContain("Spice Route");
      expect(mail.body).toContain("Rider Ravi, 20 minutes");
      const found = await lookup("track", order.ref, "9876543210");
      expect(found.data.status.name).toBe("Out for delivery");
      expect(found.data.note).toBe("Rider Ravi, 20 minutes");
      expect(found.data.steps.map((s: { name: string }) => s.name)).toEqual([
        "Placed",
        "Out for delivery",
      ]);
      expect(JSON.stringify(found.data)).not.toContain(ownerEmail);
    });
    it("books exactly the places there are, however many arrive at once", async () => {
      const day = "2026-12-01";
      const empty = await ask("/forms/book/availability");
      expect(empty.data).toEqual({
        capacities: [{ id: "tables", group: ["date"], max: 10, left: {} }],
      });
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          submit("book", {
            name: `Guest ${i}`,
            phone: "9000000100",
            date: day,
          }),
        ),
      );
      const statuses = results.map((r) => r.response.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(10);
      expect(statuses.filter((s) => s === 409)).toHaveLength(20);
      const full = results.find((r) => r.response.status === 409)!;
      expect(full.data).toMatchObject({
        message: "That day is fully booked.",
        field: "date",
      });
      expect(
        (await list("bookings")).filter((r) => r.status === "booked"),
      ).toHaveLength(10);
      expect(
        (await ask("/forms/book/availability")).data.capacities[0].left,
      ).toEqual({
        [day]: 0,
      });
      // The owner can't overbook either.
      const owner = await call(`/sites/${shopId}/app/records`, "POST", {
        table: "bookings",
        values: { name: "Walk-in", phone: "9000000200", date: day },
      });
      expect(owner.response.status).toBe(409);
      expect(owner.data.field).toBe("date");
      // Another day is open.
      expect(
        (
          await submit("book", {
            name: "Ravi",
            phone: "9000000101",
            date: "2026-12-02",
          })
        ).response.status,
      ).toBe(201);
      // "My bookings" lists the visitor's bookings, newest first.
      const mine = await lookup("mine", "+91 90000 00100");
      expect(mine.data.kind).toBe("record");
      expect(mine.data.fields).toEqual([]);
      expect(mine.data.history).toHaveLength(10);
      expect(mine.data.history[0]).toMatchObject({
        status: { name: "Booked" },
        fields: [{ name: "Date", value: expect.any(String) }],
      });
      expect((await lookup("mine", "9111111111")).response.status).toBe(404);
    });
    it("frees places on cancel, edit and delete, and refuses a rebook when full", async () => {
      const day = "2026-12-01";
      const booked = (await list("bookings")).filter(
        (r) => r.status === "booked" && r.values.date === day,
      );
      const [a, b, c] = booked;
      const cancelled = await call(
        `/sites/${shopId}/app/records/${a.id}/actions/cancel`,
        "POST",
        { revision: a.revision },
      );
      expect(cancelled.response.status).toBe(200);
      expect(
        (await ask("/forms/book/availability")).data.capacities[0].left[day],
      ).toBe(1);
      expect(
        (await submit("book", { name: "Late", phone: "9000000102", date: day }))
          .response.status,
      ).toBe(201);
      const rebook = await call(
        `/sites/${shopId}/app/records/${a.id}/actions/rebook`,
        "POST",
        { revision: cancelled.data.record.revision },
      );
      expect(rebook.response.status).toBe(409);
      expect(rebook.data.message).toBe("That day is fully booked.");
      // Moving a booking to another day frees its place.
      const moved = await call(`/sites/${shopId}/app/records/${b.id}`, "PUT", {
        values: { date: "2026-12-02" },
        revision: b.revision,
      });
      expect(moved.response.status).toBe(200);
      const left = (await ask("/forms/book/availability")).data.capacities[0]
        .left;
      expect(left).toMatchObject({ [day]: 1, "2026-12-02": 8 });
      expect(
        (
          await call(
            `/sites/${shopId}/app/records/${a.id}/actions/rebook`,
            "POST",
            {
              revision: cancelled.data.record.revision,
            },
          )
        ).response.status,
      ).toBe(200);
      expect(
        (await call(`/sites/${shopId}/app/records/${c.id}/delete`, "POST"))
          .response.status,
      ).toBe(200);
      expect(
        (await ask("/forms/book/availability")).data.capacities[0].left[day],
      ).toBe(1);
    });
    it("sells an event's seats by its own number, guests included", async () => {
      const seats = await ask("/forms/ticket/availability");
      expect(seats.data.capacities[0].left).toEqual({ "wine-tasting": 4 });
      const buy = (event: string, guests: string) =>
        submit("ticket", { name: "Meena", event, guests });
      expect((await buy("wine-tasting", "3")).response.status).toBe(201);
      const over = await buy("wine-tasting", "2");
      expect(over.response.status).toBe(409);
      expect(over.data).toMatchObject({ message: "Sold out.", field: "event" });
      expect((await buy("wine-tasting", "1")).response.status).toBe(201);
      // An event without a seat count has no limit.
      expect((await buy("open-mic", "10")).response.status).toBe(201);
      expect(
        (await ask("/forms/ticket/availability")).data.capacities[0].left,
      ).toEqual({
        "wine-tasting": 0,
      });
      const [ticket] = await list("tickets");
      expect(ticket.lines?.event?.[0].title).toBe("Open mic");
    });
  },
);
