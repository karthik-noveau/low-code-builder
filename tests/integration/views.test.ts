import { beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { Window } from "happy-dom";
import { createProject, createSection } from "../../src/studio/templates";
import { APP_TEMPLATES } from "../../src/apps/templates";
import type { AppView } from "../../src/apps/model";
import { presetById } from "../../src/blocks/presets";
import { walk } from "../../src/blocks/model";

const base = process.env.TEST_API_URL || "http://127.0.0.1:8787";
const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";

// The rewards app: Customers (name, phone) and Purchases.
const project = createProject("blank");
project.name = "Views test";
const app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Views test");
const [customers] = app.tables;
const NAME = customers.titleField;
const PHONE = customers.fields.find((f) => f.type === "phone")!.id;
const total = customers.totals[0];
const view: AppView = {
  id: "leaders",
  name: "Our customers",
  table: customers.id,
  fields: [NAME, total.id],
  initials: [NAME],
  statuses: [],
  sort: NAME,
  order: "asc",
  limit: 5,
  public: true,
};
// A draft view that shows phones: never served.
const draft: AppView = {
  ...view,
  id: "draft",
  fields: [NAME, PHONE],
  contact: true,
  public: false,
};
app.views = [view, draft];
app.dashboard.cards[0].public = true;
project.app = app;
// A page with a leaderboard bound to the public view.
const board = presetById("data-leaderboard")!.build({ project });
const repeat = [...walk([board])].find((n) => n.type === "repeat")!;
repeat.props = {
  ...repeat.props,
  source: `view:${view.id}`,
  limit: 3,
  more: true,
};
const nameBlock = [...walk([repeat])].find((x) => x.name === "Name")!;
const totalBlock = [...walk([repeat])].find((x) => x.name === "Total")!;
nameBlock.bind = { text: `field:${NAME}` };
totalBlock.bind = { text: `field:${total.id}` };
project.pages[0].sections.push(
  createSection("blocks", { name: "Leaders", root: board }),
);

let token = "",
  id = "";
const recordIds: string[] = [];
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
  const text = await response.text();
  // JSON.parse answers `any`, like response.json() in the other suites.
  const data = text.startsWith("{") ? JSON.parse(text) : undefined;
  return { response, text, data };
}
/** A read the way a published page makes it: cross-origin, no token. */
const visitor = (path: string) =>
  call(`/apps/${id}${path}`, "GET", undefined, "", { origin: sites });
async function settle() {
  for (let i = 0; i < 80; i++) {
    const { data } = await call(`/sites/${id}`);
    if (!["queued", "publishing"].includes(data.site.status)) return data.site;
    await new Promise((r) => setTimeout(r, 150));
  }
}

beforeAll(async () => {
  token = (
    await call(
      "/auth/register",
      "POST",
      {
        email: `views-${randomUUID()}@local.test`,
        password: "Local-test-password-42",
      },
      "",
    )
  ).data.token;
  const created = await call("/sites", "POST", { name: "Views test" });
  id = created.data.site.id;
  await fetch(`${base}/sites/${id}/draft`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "if-match": String(created.data.site.version),
    },
    body: gzipSync(JSON.stringify(project)),
  });
  for (const [name, phone] of [
    ["Asha Rao", "9876543210"],
    ["Ravi Kumar", "9000000001"],
    ["Meena Iyer", "9000000002"],
    ["Zoya Khan", "9000000003"],
    ["Bala Subramanian", "9000000004"],
    ["Kiran Patel", "9000000005"],
  ]) {
    const r = await call(`/sites/${id}/app/records`, "POST", {
      table: customers.id,
      values: { [NAME]: name, [PHONE]: phone },
    });
    recordIds.push(r.data.record.id);
  }
});

describe("public views", { concurrent: false }, () => {
  it("serves nothing before the site is published", async () => {
    expect((await visitor(`/views/${view.id}`)).response.status).toBe(404);
    expect((await visitor("/metrics")).response.status).toBe(404);
  });

  it("publishes a page that loads the data script", async () => {
    const { data } = await call(`/sites/${id}`);
    await call(`/sites/${id}/publish`, "POST", { version: data.site.version });
    expect((await settle()).status).toBe("published");
    const html = await (await fetch(`${sites}/sites/${id}/index.html`)).text();
    expect(html).toContain(`data-view="${view.id}"`);
    expect(html).toContain('<script src="app.js" defer></script>');
    expect(await (await fetch(`${sites}/sites/${id}/app.js`)).text()).toContain(
      "data-view",
    );
  });

  it("returns only the allow-listed fields, without ids, phones or references", async () => {
    const { response, data, text } = await visitor(
      `/views/${view.id}?page=0&size=3`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(data.rows).toEqual([
      { [NAME]: "Asha R.", [total.id]: "₹0" },
      { [NAME]: "Bala S.", [total.id]: "₹0" },
      { [NAME]: "Kiran P.", [total.id]: "₹0" },
    ]);
    expect(data.more).toBe(true);
    expect(Object.keys(data).sort()).toEqual([
      "columns",
      "more",
      "name",
      "page",
      "rows",
    ]);
    for (const secret of [
      "98765",
      "9000000",
      ...recordIds,
      "Rao",
      "createdAt",
      "history",
      "revision",
    ])
      expect(text).not.toContain(secret);
    // Paging stops at the view's limit (5 of 6 customers).
    const second = await visitor(`/views/${view.id}?page=1&size=3`);
    expect(
      second.data.rows.map((r: Record<string, string>) => r[NAME]),
    ).toEqual(["Meena I.", "Ravi K."]);
    expect(second.data.more).toBe(false);
    expect(
      (await visitor(`/views/${view.id}?page=2&size=3`)).data.rows,
    ).toEqual([]);
  });

  it("never serves a draft view, an unknown view or another site's", async () => {
    const hidden = await visitor(`/views/${draft.id}`);
    expect(hidden.response.status).toBe(404);
    expect(hidden.text).not.toContain("98765");
    expect((await visitor("/views/nope")).response.status).toBe(404);
    expect(
      (await call(`/apps/not-a-site/views/${view.id}`, "GET", undefined, ""))
        .response.status,
    ).toBe(404);
    expect(
      (await call(`/apps/${id}/views/${view.id}`, "POST", {}, "")).response
        .status,
    ).toBe(405);
  });

  it("serves public figures as numbers only", async () => {
    const { response, data, text } = await visitor("/metrics");
    expect(response.status).toBe(200);
    expect(data.cards.map((c: { id: string }) => c.id)).toEqual([
      app.dashboard.cards[0].id,
    ]);
    expect(typeof data.cards[0].value).toBe("number");
    expect(data.charts).toEqual([]);
    for (const secret of ["98765", ...recordIds])
      expect(text).not.toContain(secret);
  });

  it("fills the published page's list from the live view", async () => {
    const html = await (await fetch(`${sites}/sites/${id}/index.html`)).text();
    const script = await (await fetch(`${sites}/sites/${id}/app.js`)).text();
    const window = new Window({ url: `${sites}/sites/${id}/index.html` });
    window.document.body.innerHTML = html.slice(
      html.indexOf("<body>") + 6,
      html.lastIndexOf("</body>"),
    );
    const send = (url: string, init?: RequestInit) =>
      fetch(url, { ...init, headers: { origin: sites } });
    // app.js as the browser runs it (forms widget, install hook and the data script).
    new Function(
      "window",
      "document",
      "fetch",
      "NodeFilter",
      "navigator",
      "addEventListener",
      "location",
      script,
    )(
      window,
      window.document,
      send,
      window.NodeFilter,
      {},
      () => {},
      window.location,
    );
    const items = () => [
      ...window.document.querySelectorAll(
        ".blk-repeat-items > li:not(.is-skeleton)",
      ),
    ];
    for (let i = 0; i < 50 && items().length < 3; i++)
      await new Promise((r) => setTimeout(r, 100));
    expect(items().map((li) => li.querySelector("h3")!.textContent)).toEqual([
      "Asha R.",
      "Bala S.",
      "Kiran P.",
    ]);
    expect(items()[0].textContent).toContain("1");
    const more = window.document.querySelector(
      ".blk-repeat-more",
    ) as unknown as HTMLButtonElement;
    expect(more.hidden).toBe(false);
    more.click();
    for (let i = 0; i < 50 && items().length < 5; i++)
      await new Promise((r) => setTimeout(r, 100));
    expect(items()).toHaveLength(5);
    expect(more.hidden).toBe(true);
    await window.happyDOM.close();
  });

  it("limits reads per visitor per minute", async () => {
    let limited = false;
    for (let i = 0; i < 70 && !limited; i++)
      limited = (await visitor(`/views/${view.id}`)).response.status === 429;
    expect(limited).toBe(true);
    const refused = await visitor("/metrics");
    expect(refused.response.status).toBe(429);
    expect(refused.data.message).toContain("Too many");
  });

  it("closes views once unpublished", async () => {
    const { data } = await call(`/sites/${id}`);
    await call(`/sites/${id}/unpublish`, "POST", {
      version: data.site.version,
    });
    await settle();
    expect((await visitor(`/views/${view.id}`)).response.status).toBe(404);
  });
});
