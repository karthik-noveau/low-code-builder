// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject, createSection } from "../../studio/templates";
import { createCollection } from "../../studio/collections";
import { validateProject, type Project } from "../../studio/model";
import { APP_TEMPLATES } from "../../apps/templates";
import {
  validateApp,
  type App,
  type AppRecord,
  type AppView,
} from "../../apps/model";
import { createNode } from "../registry";
import { walk, type Node } from "../model";
import { Nodes, type RenderContext } from "../render";
import { bindValid, rootValid } from "../validate";
import { presetById } from "../presets";
import {
  boundProps,
  markText,
  markUrl,
  parseSource,
  queryCollection,
  resolveBinding,
  sourceFields,
  type DataItem,
} from "./bind";
import {
  initialsOf,
  publicMetrics,
  runView,
  selectRecords,
  shownRow,
  viewWarnings,
} from "./views";
import { needsDataScript } from "./project";
import { DATA_SCRIPT } from "./runtime";
import { suggestedView } from "./presets";

const rewards = () =>
  APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Dhanlaxmi");
function setup() {
  const app = rewards();
  const [customers, purchases] = app.tables;
  const id = (t: typeof customers, name: string) =>
    t.fields.find((f) => f.name === name)!.id;
  return {
    app,
    customers,
    purchases,
    NAME: id(customers, "Name"),
    PHONE: id(customers, "Phone"),
    AMOUNT: id(purchases, "Purchase amount"),
    CUSTOMER: id(purchases, "Customer"),
    total: customers.totals[0],
  };
}
const record = (
  table: string,
  n: number,
  values: AppRecord["values"],
  extra: Partial<AppRecord> = {},
): AppRecord => ({
  id: `rec-${table}-${n}`,
  table,
  ref: `ESR-${1000 + n}`,
  values,
  status: "",
  note: "secret note",
  history: [
    { action: "", status: "", by: "owner@x.test", at: "2026-01-01T00:00:00Z" },
  ],
  source: "visitor",
  createdAt: `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00Z`,
  updatedAt: "",
  revision: 1,
  ...extra,
});

describe("bindings", () => {
  const item: DataItem = {
    index: 2,
    values: { price: "₹48", photo: "Photo" },
    raw: { price: "48", photo: "/images/plant-1.jpg" },
    title: "Fiddle leaf fig",
    link: "./products/fiddle.html",
  };
  it("resolve fields as shown text, and addresses as stored values", () => {
    expect(resolveBinding("field:price", item, "text")).toBe("₹48");
    expect(resolveBinding("field:photo", item, "src")).toBe(
      "/images/plant-1.jpg",
    );
    expect(resolveBinding("item:title", item, "text")).toBe("Fiddle leaf fig");
    expect(resolveBinding("item:link", item, "url")).toBe(
      "./products/fiddle.html",
    );
    expect(resolveBinding("item:index", item, "text")).toBe("3");
    expect(resolveBinding("field:missing", item, "text")).toBe("");
  });
  it("become markers in the published template", () => {
    const marker = { index: 0, values: {}, raw: {}, marker: true };
    expect(resolveBinding("field:abc", marker, "text")).toBe(
      markText("field:abc"),
    );
    expect(resolveBinding("field:abc", marker, "src")).toBe(
      markUrl("field:abc"),
    );
  });
  it("fill only bound props, leaving the rest as typed", () => {
    const node = createNode("button", { label: "Buy", url: "/shop" });
    node.bind = { url: "item:link" };
    expect(boundProps(node, item)).toMatchObject({
      label: "Buy",
      url: "./products/fiddle.html",
    });
    expect(boundProps(node, undefined)).toBe(node.props);
  });
  it("are validated: known sources only, a few per block", () => {
    expect(bindValid({ text: "field:abc-1", url: "item:link" })).toBe(true);
    expect(bindValid({ text: "javascript:alert(1)" })).toBe(false);
    expect(bindValid({ text: "item:secret" })).toBe(false);
    expect(bindValid({ "bad key": "item:title" })).toBe(false);
    expect(bindValid(["item:title"])).toBe(false);
    const root = createNode("section");
    const repeat = createNode("repeat", { source: "collection:x" });
    root.children = [repeat];
    expect(rootValid(root)).toBe(true);
    repeat.children![0].children![1].bind = { text: "<script>" };
    expect(rootValid(root)).toBe(false);
  });
  it("parse sources strictly", () => {
    expect(parseSource("view:ab-1")).toEqual({ kind: "view", id: "ab-1" });
    expect(parseSource("view:../x")).toEqual({ kind: "none", id: "" });
    expect(parseSource("table:x")).toEqual({ kind: "none", id: "" });
  });
});

describe("collections in a repeat", () => {
  const c = createCollection("products");
  const price = c.display.price;
  it("filter, sort and limit visible items", () => {
    c.items[1].hidden = true;
    expect(queryCollection(c, {}).length).toBe(2);
    expect(
      queryCollection(c, { sortField: price, sortDir: "desc" }).map(
        (i) => i.values[price],
      ),
    ).toEqual(["48", "34"]);
    expect(
      queryCollection(c, {
        filterField: price,
        filterOp: "atMost",
        filterValue: "40",
      }).length,
    ).toBe(1);
    expect(queryCollection(c, { limit: 1 }).length).toBe(1);
    c.items[1].hidden = false;
  });
  it("offer their fields, title and item page to bindings", () => {
    const p = createProject("blank");
    p.collections = [c];
    const fields = sourceFields(p, `collection:${c.id}`).map((f) => f.source);
    expect(fields).toContain("item:title");
    expect(fields).toContain("item:link");
    expect(fields).toContain(`field:${price}`);
  });
});

describe("public views", () => {
  it("refuse phone and email fields without the owner's consent", () => {
    const { app, customers, NAME, PHONE } = setup();
    const view: AppView = {
      id: "v1",
      name: "People",
      table: customers.id,
      fields: [NAME, PHONE],
      statuses: [],
      sort: "",
      limit: 10,
      public: true,
    };
    expect(validateApp({ ...app, views: [view] })).toBe(false);
    expect(validateApp({ ...app, views: [{ ...view, contact: true }] })).toBe(
      true,
    );
    expect(viewWarnings(app, { ...view, contact: true })[0]).toContain("phone");
  });
  it("refuse unknown fields, other tables' fields, bad limits and duplicates", () => {
    const { app, customers, AMOUNT, NAME } = setup();
    const base: AppView = {
      id: "v1",
      name: "People",
      table: customers.id,
      fields: [NAME],
      statuses: [],
      sort: "",
      limit: 10,
      public: true,
    };
    expect(validateApp({ ...app, views: [base] })).toBe(true);
    for (const bad of [
      { fields: ["nope"] },
      { fields: [AMOUNT] },
      { fields: [] },
      { fields: [NAME, NAME] },
      { limit: 0 },
      { limit: 101 },
      { sort: "nope" },
      { statuses: ["nope"] },
      { initials: [AMOUNT] },
      { table: "nope" },
      { public: "yes" },
      { filter: { field: "nope", op: "is", value: "" } },
    ])
      expect([
        bad,
        validateApp({ ...app, views: [{ ...base, ...bad } as AppView] }),
      ]).toEqual([bad, false]);
    expect(validateApp({ ...app, views: [base, base] })).toBe(false);
  });
  it("return only allow-listed fields, formatted, without ids or references", () => {
    const { app, customers, NAME, PHONE, total } = setup();
    const view: AppView = {
      id: "top",
      name: "Top customers",
      table: customers.id,
      fields: [NAME, total.id],
      initials: [NAME],
      statuses: [],
      sort: total.id,
      order: "desc",
      limit: 2,
      public: true,
    };
    const records = [
      record(
        customers.id,
        1,
        { [NAME]: "Asha Rao", [PHONE]: "9876543210" },
        { totals: { [total.id]: 920 } },
      ),
      record(
        customers.id,
        2,
        { [NAME]: "Ravi Kumar", [PHONE]: "9000000001" },
        { totals: { [total.id]: 4100 } },
      ),
      record(
        customers.id,
        3,
        { [NAME]: "Meena", [PHONE]: "9000000002" },
        { totals: { [total.id]: 10 } },
      ),
    ];
    const page = runView(app, view, records, {});
    expect(page.rows).toEqual([
      { [NAME]: "Ravi K.", [total.id]: "₹4,100" },
      { [NAME]: "Asha R.", [total.id]: "₹920" },
    ]);
    const text = JSON.stringify(page);
    for (const secret of [
      "9876543210",
      "rec-",
      "ESR-",
      "secret note",
      "owner@x.test",
      "Meena",
    ])
      expect(text).not.toContain(secret);
    expect(page.more).toBe(false);
    expect(page.columns.map((c) => c.id)).toEqual([NAME, total.id]);
  });
  it("leave out contact fields even if a stored view lost its consent", () => {
    const { app, customers, NAME, PHONE } = setup();
    const view = {
      id: "v",
      name: "x",
      table: customers.id,
      fields: [NAME, PHONE],
      statuses: [],
      sort: "",
      limit: 5,
      public: true,
    } as AppView;
    const row = shownRow(
      app,
      view,
      record(customers.id, 1, { [NAME]: "Asha", [PHONE]: "9876543210" }),
      {},
    );
    expect(row).toEqual({ [NAME]: "Asha" });
  });
  it("page within the view's limit, with statuses and filters", () => {
    const { app, purchases, AMOUNT } = setup();
    const approved = purchases.statuses.find((s) => s.tone === "good")!;
    const records = Array.from({ length: 30 }, (_, i) =>
      record(
        purchases.id,
        i,
        { [AMOUNT]: 100 * (i + 1) },
        { status: i % 2 ? approved.id : purchases.initial },
      ),
    );
    const view: AppView = {
      id: "p",
      name: "Orders",
      table: purchases.id,
      fields: [AMOUNT, "status"],
      statuses: [approved.id],
      sort: "",
      limit: 12,
      public: true,
    };
    expect(selectRecords(app, view, records)).toHaveLength(12);
    const first = runView(app, view, records, {}, 0, 5);
    expect(first.rows).toHaveLength(5);
    expect(first.more).toBe(true);
    expect(first.rows[0].status).toBe(approved.name);
    expect(runView(app, view, records, {}, 2, 5)).toMatchObject({
      more: false,
    });
    expect(runView(app, view, records, {}, 2, 5).rows).toHaveLength(2);
    const filtered = {
      ...view,
      filter: { field: AMOUNT, op: "atLeast" as const, value: "2500" },
    };
    expect(
      selectRecords(app, filtered, records).map((r) => r.values[AMOUNT]),
    ).toEqual([3000, 2800, 2600]);
  });
  it("names people as a first name and initial", () => {
    expect(initialsOf("Priya Sharma")).toBe("Priya S.");
    expect(initialsOf("  Asha  ")).toBe("Asha");
    expect(initialsOf("Anna Maria de Souza")).toBe("Anna S.");
  });
  it("suggest drafts that never include phone numbers or emails", () => {
    const { app } = setup();
    for (const kind of ["leaderboard", "recent"]) {
      const view = suggestedView(app, kind)!;
      expect(view.public).toBe(false);
      expect(validateApp({ ...app, views: [view] })).toBe(true);
    }
  });
  it("publish metrics only for figures marked public", async () => {
    const { app } = setup();
    app.dashboard.cards[0].public = true;
    app.dashboard.charts = [
      {
        id: "ch",
        name: "By month",
        table: app.tables[1].id,
        op: "count",
        statuses: [],
        months: 3,
      },
    ];
    const m = await publicMetrics(
      app,
      async () => [record(app.tables[1].id, 1, {})],
      new Date("2026-10-20T00:00:00Z"),
    );
    expect(m.cards.map((c) => c.id)).toEqual([app.dashboard.cards[0].id]);
    expect(m.charts).toEqual([]);
    app.dashboard.charts[0].public = true;
    const m2 = await publicMetrics(
      app,
      async () => [record(app.tables[1].id, 1, {})],
      new Date("2026-10-20T00:00:00Z"),
    );
    expect(m2.charts[0].bars).toHaveLength(3);
    expect(m2.charts[0].bars.at(-1)!.value).toBe(1);
    expect(JSON.stringify(m2)).not.toContain("rec-");
  });
});

function dataProject() {
  const p: Project = createProject("blank");
  const products = createCollection("products");
  p.collections = [products];
  const s = setup();
  const view: AppView = {
    id: "top",
    name: "Top customers",
    table: s.customers.id,
    fields: [s.NAME, s.total.id],
    initials: [s.NAME],
    statuses: [],
    sort: s.total.id,
    order: "desc",
    limit: 10,
    public: true,
  };
  s.app.views = [view];
  p.app = s.app;
  return { p, s, products, view };
}
const render = (
  p: Project,
  nodes: Node[],
  extra: Partial<RenderContext> = {},
) =>
  renderToStaticMarkup(
    createElement(Nodes, {
      nodes,
      ctx: { project: p, exporting: true, href: (u) => u || "#", ...extra },
    }),
  );

describe("data blocks on the page", () => {
  it("write collection items into the published HTML, with links to their pages", () => {
    const { p, products } = dataProject();
    const root = presetById("data-products")!.build({ project: p });
    const html = render(p, [root]);
    expect(html.match(/class="blk-repeat-item"/g)).toHaveLength(3);
    expect(html).toContain("Fiddle leaf fig");
    expect(html).toContain("$48");
    expect(html).toContain(`href="./${products.slug}/fiddle-leaf-fig.html"`);
    expect(html).toContain('src="/images/plant-1.jpg"');
    expect(html).toContain("<ul");
    expect(html).not.toContain("data-view");
  });
  it("leave app lists as a skeleton and a template with markers", () => {
    const { p, s } = dataProject();
    const root = presetById("data-leaderboard")!.build({ project: p });
    const repeat = [...walk([root])].find((n) => n.type === "repeat")!;
    repeat.props.source = "view:top";
    const name = [...walk([repeat])].find((x) => x.name === "Name")!;
    const total = [...walk([repeat])].find((x) => x.name === "Total")!;
    name.bind = { text: `field:${s.NAME}` };
    total.bind = { text: `field:${s.total.id}` };
    expect(rootValid(root)).toBe(true);
    const html = render(p, [root], { appApi: "https://api.test/apps/site" });
    expect(html).toContain('data-app-api="https://api.test/apps/site"');
    expect(html).toContain('data-view="top"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("<template");
    expect(html).toContain(markText(`field:${s.NAME}`));
    expect(html).toContain(markText("item:index"));
    // Without the app API (a downloaded copy) app lists are left out.
    expect(render(p, [root])).not.toContain("blk-repeat-items");
    p.pages[0].sections.push(createSection("blocks", { name: "Data", root }));
    expect(needsDataScript(p, "https://api.test/apps/site")).toBe(true);
    expect(validateProject(p)).toBe(true);
  });
  it("show sample rows in the editor before there are records", () => {
    const { p, s } = dataProject();
    const table = createNode("table", { source: "view:top" });
    const html = render(p, [table], { exporting: false });
    expect(html).toContain("<th");
    expect(html).toContain('scope="col"');
    expect(html).toContain("Total reward");
    expect(html).toMatch(/Priya S\./);
    void s;
  });
  it("hide figures the owner hasn't made public", () => {
    const { p } = dataProject();
    const stat = createNode("stat", {
      source: `card:${p.app!.dashboard.cards[0].id}`,
      label: "Customers",
    });
    expect(render(p, [stat], { appApi: "https://api.test/apps/site" })).toBe(
      "",
    );
    p.app!.dashboard.cards[0].public = true;
    expect(
      render(p, [stat], { appApi: "https://api.test/apps/site" }),
    ).toContain("data-metric");
    const count = createNode("stat", {
      source: `collection:${p.collections![0].id}`,
      label: "Products",
    });
    expect(render(p, [count])).toContain(">3<");
  });
});

describe("the data script", () => {
  it("fills a published list from the public view, as text, and pages", async () => {
    const { p, s } = dataProject();
    const root = presetById("data-leaderboard")!.build({ project: p });
    const repeat = [...walk([root])].find((n) => n.type === "repeat")!;
    repeat.props = {
      ...repeat.props,
      source: "view:top",
      more: true,
      limit: 2,
    };
    const name = [...walk([repeat])].find((x) => x.name === "Name")!;
    const total = [...walk([repeat])].find((x) => x.name === "Total")!;
    name.bind = { text: `field:${s.NAME}` };
    total.bind = { text: `field:${s.total.id}` };
    const card = repeat.children![0];
    card.children!.push(createNode("image", { src: "", alt: "" }));
    card.children!.at(-1)!.bind = {
      src: `field:${s.NAME}`,
      alt: `field:${s.NAME}`,
    };
    document.body.innerHTML = render(p, [root], {
      appApi: "https://api.test/apps/site",
    });
    const pages = [
      {
        rows: [
          { [s.NAME]: "Ravi K.", [s.total.id]: "₹4,100" },
          { [s.NAME]: "<img src=x onerror=alert(1)>", [s.total.id]: "₹920" },
        ],
        more: true,
        page: 0,
      },
      {
        rows: [{ [s.NAME]: "javascript:alert(1)", [s.total.id]: "₹10" }],
        more: false,
        page: 1,
      },
    ];
    const fetch = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify(pages[page]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    new Function(DATA_SCRIPT)();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll(".blk-repeat-items > li:not(.is-skeleton)"),
      ).toHaveLength(2),
    );
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.test/apps/site/views/top?page=0&size=2",
    );
    const items = [...document.querySelectorAll(".blk-repeat-items > li")];
    expect(items[0].textContent).toContain("1Ravi K.₹4,100");
    // Values go in as text, never as HTML.
    expect(items[1].querySelector("h3")!.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(
      document.querySelectorAll(".blk-repeat-items img[src='x']"),
    ).toHaveLength(0);
    // A value that isn't an image address hides the image.
    expect((items[0].querySelector("img") as HTMLImageElement).hidden).toBe(
      true,
    );
    const more = document.querySelector(
      ".blk-repeat-more",
    ) as HTMLButtonElement;
    expect(more.hidden).toBe(false);
    more.click();
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".blk-repeat-items > li")).toHaveLength(
        3,
      ),
    );
    expect(more.hidden).toBe(true);
    expect(
      document.querySelector(".blk-repeat-items")!.innerHTML,
    ).not.toContain("⟦");
    expect(
      document.querySelector(".blk-repeat-items")!.innerHTML,
    ).not.toContain("bind.invalid");
    expect(document.querySelector("[data-live]")!.textContent).toBe(
      "1 more shown",
    );
    vi.unstubAllGlobals();
  });
  it("shows the empty state, and an error with Try again", async () => {
    const { p, s } = dataProject();
    const root = createNode("section");
    const repeat = createNode("repeat", { source: "view:top" });
    root.children = [repeat];
    void s;
    document.body.innerHTML = render(p, [root], {
      appApi: "https://api.test/apps/site",
    });
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail
          ? new Response(JSON.stringify({ message: "Too many requests." }), {
              status: 429,
            })
          : new Response(JSON.stringify({ rows: [], more: false }), {
              status: 200,
            }),
      ),
    );
    new Function(DATA_SCRIPT)();
    const error = document.querySelector(".blk-data-error") as HTMLElement;
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toContain("Too many requests.");
    fail = false;
    (document.querySelector(".blk-data-retry") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(
        (document.querySelector(".blk-repeat-empty") as HTMLElement).hidden,
      ).toBe(false),
    );
    expect(error.hidden).toBe(true);
    vi.unstubAllGlobals();
  });
});

export type { App };
