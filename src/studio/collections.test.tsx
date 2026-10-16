// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createProject } from "./templates";
import { validateProject, type Project } from "./model";
import {
  blueprints,
  createCollection,
  formatValue,
  importCsv,
  type Blueprint,
} from "./collections";
import { useStudio } from "./store";
import {
  buildSiteArchive,
  renderItemPage,
  renderPage,
  renderThanksPage,
} from "./export";
import { parseRequest, REQUEST_KINDS } from "./requests";
import { reviewProject } from "./review";
import { Studio } from "./Studio";

vi.mock("../cloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cloud/client")>()),
  initializeCloud: async () => ({ config: { enabled: false } }),
}));

function load(project: Project) {
  useStudio.setState({
    project,
    past: [],
    future: [],
    selected: null,
    selectedBlock: null,
    activePage: project.pages[0].id,
    saveError: "",
  });
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("collections", () => {
  it.each(Object.keys(blueprints) as Blueprint[])(
    "creates a valid %s collection",
    (blueprint) => {
      const project = createProject();
      project.collections = [createCollection(blueprint)];
      expect(validateProject(project)).toBe(true);
    },
  );
  it("rejects broken collections", () => {
    const project = createProject();
    const c = createCollection("products");
    project.collections = [c, { ...createCollection("menu"), slug: c.slug }];
    expect(validateProject(project)).toBe(false);
    project.collections = [
      { ...c, display: { ...c.display, title: "missing" } },
    ];
    expect(validateProject(project)).toBe(false);
    project.collections = [
      { ...c, items: [{ ...c.items[0], values: { unknown: "x" } }] },
    ];
    expect(validateProject(project)).toBe(false);
    project.collections = [{ ...c, slug: "Bad Slug" }];
    expect(validateProject(project)).toBe(false);
  });
  it("formats prices and dates for visitors", () => {
    const c = createCollection("events");
    const date = c.fields.find((f) => f.type === "date")!;
    expect(formatValue(c, date.id, "2026-04-18")).toBe("April 18, 2026");
    const p = createCollection("products");
    const price = p.fields.find((f) => f.type === "price")!;
    expect(formatValue(p, price.id, "1250")).toBe("$1,250");
    expect(formatValue(p, price.id, "9.5")).toBe("$9.50");
    expect(formatValue(p, price.id, "0")).toBe("Free");
  });
});

describe("spreadsheet import", () => {
  it("recognises a Shopify product export", () => {
    const csv = [
      "Handle,Title,Body (HTML),Variant Price,Image Src,Status",
      'linen-shirt,Linen shirt,"<p>Soft &amp; <b>breathable</b></p>",58.00,https://cdn.example.com/a.jpg,active',
      "linen-shirt,,,62.00,https://cdn.example.com/b.jpg,",
      "old-hat,Old hat,<p>Gone</p>,20.00,,draft",
    ].join("\n");
    const { collection: c, source } = importCsv(csv, "products_export");
    expect(source).toBe("shopify");
    expect(c.items).toHaveLength(2);
    const [shirt, hat] = c.items;
    expect(shirt.slug).toBe("linen-shirt");
    expect(shirt.values[c.display.title]).toBe("Linen shirt");
    expect(shirt.values[c.display.price]).toBe("58.00");
    expect(shirt.values[c.display.image]).toBe("https://cdn.example.com/a.jpg");
    expect(shirt.values[c.display.body]).toBe("Soft & breathable");
    expect(hat.hidden).toBe(true);
  });
  it("turns any CSV into a collection with guessed field types", () => {
    const csv = [
      "Course,Start date,Fee,Cover,Signup",
      "Pottery basics,2026-06-01,120,https://cdn.example.com/p.png,https://example.com/a",
      "Wheel throwing,2026-07-01,180,https://cdn.example.com/w.png,https://example.com/b",
    ].join("\n");
    const { collection: c, source } = importCsv(csv, "Classes");
    expect(source).toBe("csv");
    expect(c.name).toBe("Classes");
    expect(c.fields.map((f) => f.type)).toEqual([
      "text",
      "date",
      "price",
      "image",
      "link",
    ]);
    expect(c.items[1].values[c.display.title]).toBe("Wheel throwing");
    const project = createProject();
    project.collections = [c];
    expect(validateProject(project)).toBe(true);
  });
  it("explains files it can't use", () => {
    expect(() => importCsv("Name\n", "x")).toThrow(/header row/);
  });
});

describe("publishing collections", () => {
  function withListing() {
    load(createProject());
    useStudio.getState().addSection("collection");
    return useStudio.getState().project;
  }
  it("adds a fitting collection with the first list section, in one undo step", () => {
    const project = withListing();
    expect(project.collections).toHaveLength(1);
    expect(project.collections![0].blueprint).toBe("products");
    useStudio.getState().undo();
    expect(useStudio.getState().project.collections ?? []).toHaveLength(0);
  });
  it("lists items and gives each its own page", () => {
    const project = withListing();
    const c = project.collections![0];
    c.items[1].hidden = true;
    const html = renderPage(project, project.pages[0]);
    expect(html).toContain(`href="${c.slug}/${c.items[0].slug}.html"`);
    expect(html).not.toContain(c.items[1].slug);
    const item = renderItemPage(project, c, c.items[0]);
    expect(item).toContain('<base href="../">');
    expect(item).toContain("<title>Fiddle leaf fig — ");
    expect(item).toContain("$48");
    expect(item).toContain("Buy now");
    expect(item).toContain('class="site-header"');
  });
  it("exports item pages and bundles their images", async () => {
    const project = withListing();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(new Blob(["img"], { type: "image/jpeg" })),
      ),
    );
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await buildSiteArchive(project));
    const c = project.collections![0];
    const page = await zip
      .file(`${c.slug}/${c.items[0].slug}.html`)!
      .async("string");
    expect(page).toContain('src="images/plant-1.jpg"');
    expect(zip.file("images/plant-1.jpg")).not.toBeNull();
  });
});

describe("data manager", () => {
  it("creates a collection from a blueprint and adds an item", () => {
    load(createProject("table"));
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: /^Data/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Menu Dishes and drinks/ }),
    );
    const menu = useStudio.getState().project.collections![0];
    expect(menu.blueprint).toBe("menu");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add dish" }));
    expect(useStudio.getState().project.collections![0].items).toHaveLength(
      menu.items.length + 1,
    );
    fireEvent.change(within(dialog).getByLabelText("Dish"), {
      target: { value: "Pea risotto" },
    });
    expect(
      useStudio.getState().project.collections![0].items[0].values[
        menu.display.title
      ],
    ).toBe("Pea risotto");
  });
  it("opens an item page inside preview", () => {
    load(createProject());
    useStudio.getState().addSection("collection");
    const { container } = render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const card =
      container.querySelector<HTMLAnchorElement>(".site-listing-card")!;
    fireEvent.click(card);
    expect(container.querySelector(".site-item h1")?.textContent).toBe(
      "Fiddle leaf fig",
    );
  });
});

describe("visitor actions", () => {
  it("gives fitting blueprints a request form by default", () => {
    expect(createCollection("services").request?.kind).toBe("book");
    expect(createCollection("jobs").request?.kind).toBe("apply");
    expect(createCollection("events").request?.kind).toBe("rsvp");
    expect(createCollection("team").request).toBeUndefined();
    const project = createProject();
    project.collections = [
      {
        ...createCollection("services"),
        request: { kind: "nope" as never, label: "" },
      },
    ];
    expect(validateProject(project)).toBe(false);
  });
  it("validates what visitors send", () => {
    const ok = parseRequest("book", {
      name: " Ada ",
      email: "ADA@example.com",
      date: "2026-11-02",
      time: "14:30",
      guests: "2",
      ignored: "x",
    });
    expect(ok).toEqual({
      ok: true,
      name: "Ada",
      email: "ada@example.com",
      fields: { date: "2026-11-02", time: "14:30", guests: "2" },
    });
    expect(
      parseRequest("book", { name: "Ada", email: "ada@example.com" }),
    ).toEqual({
      ok: false,
      error: "Add preferred date.",
    });
    expect(
      parseRequest("apply", {
        name: "A",
        email: "a@b.co",
        link: "javascript:alert(1)",
      }).ok,
    ).toBe(false);
    expect(
      parseRequest("order", { name: "A", email: "a@b.co", quantity: "500" }).ok,
    ).toBe(false);
    expect(
      parseRequest("enquire", { name: "A", email: "nope", message: "hi" }).ok,
    ).toBe(false);
  });
  it("posts item page forms to the inbox when published, and omits them in plain exports", () => {
    const project = createProject();
    const c = createCollection("services");
    project.collections = [c];
    const live = renderItemPage(project, c, c.items[0], {
      inbox: "https://api.example/inbox/site-1",
    });
    expect(live).toContain('action="https://api.example/inbox/site-1"');
    expect(live).toContain('method="post"');
    expect(live).toContain(`name="collection" value="${c.id}"`);
    expect(live).toContain(`name="item" value="${c.items[0].slug}"`);
    expect(live).toContain('type="date"');
    expect(live).toContain("Book now");
    expect(renderItemPage(project, c, c.items[0])).not.toContain(
      "site-request",
    );
    expect(renderThanksPage(project)).toContain("your request was sent");
  });
  it("flags actions that can't be shown", () => {
    const project = createProject();
    project.collections = [
      { ...createCollection("services"), itemPages: false },
    ];
    expect(
      reviewProject(project).some((i) => i.id.startsWith("request-")),
    ).toBe(true);
  });
  it("lets owners choose an action and previews the form without sending", () => {
    load(createProject());
    useStudio.getState().addSection("collection");
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: /^Data/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "Settings" }));
    fireEvent.change(within(dialog).getByLabelText("Visitor action"), {
      target: { value: "enquire" },
    });
    expect(useStudio.getState().project.collections![0].request).toEqual({
      kind: "enquire",
      label: "",
    });
    expect(
      within(dialog).getByText(new RegExp(REQUEST_KINDS.enquire.description)),
    ).toBeTruthy();
  });
  it("opens the inbox and explains publishing when no site is connected", () => {
    load(createProject());
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: /^Inbox/ }));
    expect(
      screen.getByText("Publish with Forma to receive requests"),
    ).toBeTruthy();
  });
});
