/**
 * Every business template works end to end on a published site: each
 * visitor form accepts what a real visitor would send, reference tracking
 * finds the result, and the owner can take the first step. Values are made up
 * from the field types, so a template whose forms can't be filled fails here.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createProject } from "../../src/studio/templates";
import { TEMPLATE_IDS, type Project } from "../../src/studio/model";
import { parseAmount } from "../../src/studio/payments";
import {
  REF_KEY,
  fieldOf,
  tableOf,
  type App,
  type AppField,
  type AppForm,
  type AppTable,
} from "../../src/apps/model";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";
let token = "";
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
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      // Public form routes are called from the published site.
      ...(path.startsWith("/apps/") ? { origin: sites } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => undefined) };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let serial = 0;
/** A value a visitor or owner would type for this field. */
function sample(project: Project, field: AppField): unknown {
  serial += 1;
  const day = new Date(Date.now() + (3 + (serial % 20)) * 864e5)
    .toISOString()
    .slice(0, 10);
  const collection = (project.collections ?? []).find(
    (c) => c.id === field.collection,
  );
  // Only a cart needs prices; a role or a class can be chosen without one.
  const items = () =>
    collection!.items.filter(
      (i) =>
        !i.hidden &&
        (field.type === "item" ||
          parseAmount(i.values[collection!.display.price]) !== null),
    );
  switch (field.type) {
    case "phone":
      return `98${String(10000000 + serial * 7919).slice(-8)}`;
    case "email":
      return `visitor${serial}-${randomUUID().slice(0, 6)}@example.com`;
    case "date":
      return day;
    case "number":
      return String(Math.max(field.min ?? 1, 1));
    case "money":
      return String(Math.max(field.min ?? 1, 500));
    case "choice":
      return field.options[serial % field.options.length];
    case "yesNo":
      return false;
    case "longText":
      return "Please call before you come. Thank you!";
    case "item":
      return items()[serial % items().length].slug;
    case "items": {
      const [a, b] = items();
      return b ? { [a.slug]: 2, [b.slug]: 1 } : { [a.slug]: 1 };
    }
    default:
      return field.unique
        ? `T-${serial}-${randomUUID().slice(0, 8)}`
        : `Asha ${serial}`;
  }
}
const fill = (project: Project, table: AppTable, ids: string[]) =>
  Object.fromEntries(
    ids
      .map((id) => fieldOf(table, id)!)
      .filter((f) => f.type !== "link" && (f.required || f.type !== "yesNo"))
      .map((f) => [f.id, sample(project, f)]),
  );

async function publish(project: Project) {
  const created = await call("/sites", "POST", { name: project.name });
  expect(created.response.status, JSON.stringify(created.data)).toBe(201);
  const id = created.data.site.id as string;
  const saved = await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
  expect(saved.status).toBe(200);
  const version = (await saved.json()).site.version;
  // Local builds are limited to one a second.
  for (let i = 0; i < 40; i++) {
    const { response } = await call(`/sites/${id}/publish`, "POST", {
      version,
    });
    if (response.status !== 429) break;
    await sleep(300);
  }
  for (let i = 0; i < 150; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) {
      expect(data.site.status).toBe("published");
      return id;
    }
    await sleep(200);
  }
  throw new Error("Publishing didn't finish.");
}

beforeAll(async () => {
  const account = (
    await call(
      "/auth/register",
      "POST",
      {
        email: `templates-${randomUUID()}@local.test`,
        password: "Local-test-password-42",
      },
      "",
    )
  ).data;
  // The local sign-up limiter allows a few accounts a minute.
  expect(account?.token, JSON.stringify(account)).toBeTruthy();
  token = account.token;
});

const withApps = TEMPLATE_IDS.filter((id) => createProject(id).app);

describe("business templates work end to end", { concurrent: false }, () => {
  it("has an app in every business template", () => {
    expect(withApps.length).toBeGreaterThanOrEqual(9);
  });
  for (const template of withApps)
    it(`${template}: every visitor form works on the published site`, async () => {
      const project = createProject(template);
      const app = project.app as App;
      const id = await publish(project);
      const page = await (
        await fetch(`${sites}/sites/${id}/index.html`)
      ).text();
      expect(page).toContain("app.js");
      // Images the template uses are copied into the release and shown from there.
      if (JSON.stringify(project.pages[0]).includes("/images/"))
        expect(page).toMatch(
          new RegExp(`src="/sites/${id}/releases/[\\w-]+/images/[\\da-f]+\\.`),
        );
      // People who identify themselves (customers, members, students) are added first.
      const people = new Map<string, string>();
      for (const form of app.forms)
        if (form.identify && !people.has(form.identify.table)) {
          const table = tableOf(app, form.identify.table)!;
          const values = fill(
            project,
            table,
            table.fields
              .filter((f) => !f.ownerOnly || f.required)
              .map((f) => f.id),
          );
          const created = await call(`/sites/${id}/app/records`, "POST", {
            table: table.id,
            values,
          });
          expect([
            template,
            created.response.status,
            created.data?.message,
          ]).toEqual([template, 201, undefined]);
          people.set(table.id, String(values[form.identify.field]));
        }
      const sent = new Map<
        string,
        { ref: string; values: Record<string, unknown> }
      >();
      for (const form of app.forms.filter((f) => f.kind === "submit")) {
        const table = tableOf(app, form.table)!;
        const values = fill(project, table, form.fields);
        const result = await call(
          `/apps/${id}/forms/${form.id}`,
          "POST",
          {
            key: randomUUID(),
            identity: form.identify
              ? people.get(form.identify.table)
              : undefined,
            values,
            website: "",
          },
          "",
        );
        expect([
          template,
          form.name,
          result.response.status,
          result.data?.message,
        ]).toEqual([template, form.name, 201, result.data?.message]);
        expect(result.data.ref || table.prefix === "").toBeTruthy();
        sent.set(table.id, { ref: result.data.ref, values });
      }
      for (const form of app.forms.filter((f) => f.kind === "lookup"))
        await lookup(id, app, form, sent, people, template);
      // The owner moves each new record on with its first step.
      for (const table of app.tables.filter(
        (t) => t.actions.length && sent.has(t.id),
      )) {
        const { data } = await call(
          `/sites/${id}/app/records?table=${table.id}`,
        );
        const record = data.records[0];
        const action = table.actions.find((a) =>
          a.from.includes(record.status),
        )!;
        const values = fill(project, table, action.set);
        // Limits (e.g. reward ≤ purchase) are respected by using the smallest amount.
        for (const f of action.set)
          if (["money", "number"].includes(fieldOf(table, f)!.type))
            values[f] = String(Math.max(fieldOf(table, f)!.min ?? 1, 1));
        const moved = await call(
          `/sites/${id}/app/records/${record.id}/actions/${action.id}`,
          "POST",
          { values, note: "Thanks, see you soon.", revision: record.revision },
        );
        expect([
          template,
          action.name,
          moved.response.status,
          moved.data?.message,
        ]).toEqual([template, action.name, 200, undefined]);
        expect(moved.data.record.status).toBe(action.to);
      }
      const summary = await call(`/sites/${id}/app/summary`);
      expect(summary.response.status).toBe(200);
      expect(summary.data.cards.length).toBeGreaterThan(0);
    });
});

async function lookup(
  id: string,
  app: App,
  form: AppForm,
  sent: Map<string, { ref: string; values: Record<string, unknown> }>,
  people: Map<string, string>,
  template: string,
) {
  const table = tableOf(app, form.table)!;
  let value = "";
  let verify = "";
  const mine = sent.get(table.id);
  if (form.key === REF_KEY) {
    if (!mine) return;
    value = mine.ref;
    verify = form.verify ? String(mine.values[form.verify] ?? "") : "";
  } else if (people.has(table.id) && fieldOf(table, form.key!)?.unique) {
    value = people.get(table.id)!;
  } else if (mine && mine.values[form.key!] !== undefined) {
    value = String(mine.values[form.key!]);
  } else return;
  const query = `value=${encodeURIComponent(value)}${verify ? `&verify=${encodeURIComponent(verify)}` : ""}`;
  const found = await call(
    `/apps/${id}/forms/${form.id}/find?${query}`,
    "GET",
    undefined,
    "",
  );
  expect([
    template,
    form.name,
    found.response.status,
    found.data?.message,
  ]).toEqual([template, form.name, 200, undefined]);
  expect(found.data.kind).toBe("record");
  if (form.key === REF_KEY) expect(found.data.ref).toBe(mine!.ref);
}
