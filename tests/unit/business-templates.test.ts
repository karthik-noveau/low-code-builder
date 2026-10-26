import { describe, expect, it } from "vitest";
import {
  createProject,
  storeSeed,
  templateOptions,
} from "../../src/studio/templates";
import {
  flattenBlocks,
  OWNER_LINK,
  validateProject,
  type Project,
  type Section,
} from "../../src/studio/model";
import { validateApp, REF_KEY, fieldOf } from "../../src/apps/model";
import { appIssues } from "../../src/apps/issues";
import { APP_TEMPLATES } from "../../src/apps/templates";
import { renderItemPage, renderPage } from "../../src/studio/export";
import { publishedItems } from "../../src/studio/collections";
import { compileSite } from "../../backend/compiler";
import { collections as gallery } from "../../src/brand/content";

const business = templateOptions.filter((t) => t.id !== "blank");
const sections = (p: Project) => [
  ...p.header,
  ...p.pages.flatMap((pg) => pg.sections),
  ...p.footer,
];
/** Every link a visitor can follow, with where it was found. */
function links(p: Project) {
  const found: [string, string][] = [];
  for (const s of sections(p).filter((s) => !s.hidden)) {
    // Contact and email signup buttons send their form; they aren't links.
    if (s.type === "contact" || s.type === "newsletter" || s.type === "app")
      continue;
    if (s.buttonLabel || s.type === "announcement")
      found.push([s.buttonUrl, `${s.type} “${s.title}”`]);
    if (s.secondaryLabel)
      found.push([s.secondaryUrl ?? "", `${s.type} “${s.secondaryLabel}”`]);
    for (const i of s.items) if (i.url) found.push([i.url, `item ${i.title}`]);
    for (const b of flattenBlocks(s.blocks))
      if (b.type === "button") found.push([b.url, `block ${b.text}`]);
  }
  for (const c of p.collections ?? [])
    for (const f of c.fields.filter((f) => f.type === "link"))
      for (const i of c.items)
        if (i.values[f.id]) found.push([i.values[f.id], `${c.name} ${i.slug}`]);
  return found;
}
function resolves(p: Project, url: string) {
  if (/^(https:\/\/|mailto:|tel:)/.test(url)) return true;
  // The publisher fills in the owner's app for this site.
  if (url === OWNER_LINK) return true;
  if (p.pages.some((pg) => `/${pg.slug}` === url)) return true;
  const [, slug, item] = /^\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(url) ?? [];
  const c = p.collections?.find((c) => c.slug === slug && c.itemPages);
  return !!c?.items.some((i) => i.slug === item && !i.hidden);
}
const visibleText = (p: Project) =>
  JSON.stringify([
    sections(p)
      .filter((s) => !s.hidden)
      .map((s: Section) => [
        s.title,
        s.eyebrow,
        s.body,
        s.buttonLabel,
        s.items,
        s.blocks,
      ]),
    p.collections,
    p.app?.forms,
    p.pages.map((pg) => [pg.title, pg.description]),
  ]).toLowerCase();

describe.each(business.map((t) => [t.id, t.name] as const))(
  "the %s template (%s)",
  (id) => {
    const p = createProject(id, "Riverside Co");
    const collectionIds = (p.collections ?? []).map((c) => c.id);

    it("is a valid project with a valid, issue-free app", () => {
      expect(validateProject(p)).toBe(true);
      if (id === "botanical") {
        // The store runs Botanical; it has no app of its own.
        expect(p.app).toBeUndefined();
        return;
      }
      expect(validateApp(p.app, collectionIds)).toBe(true);
      expect(appIssues(p.app!)).toEqual([]);
      expect(
        p.app!.tables.filter((t) => !t.private).every((t) => t.notify),
      ).toBe(true);
      expect(p.app!.dashboard.cards.length).toBeGreaterThanOrEqual(3);
      expect(p.app!.dashboard.lists.length).toBeGreaterThanOrEqual(1);
    });

    it("names the business everywhere", () => {
      expect(p.name).toBe("Riverside Co");
      const header = p.header.find((s) => s.type === "header")!;
      // A two-line wordmark puts the name's first word over the rest.
      expect(
        header.variant === "brand"
          ? `${header.title} ${header.eyebrow}`
          : header.title,
      ).toBe("Riverside Co");
      expect(p.pages.every((pg) => pg.title.endsWith("— Riverside Co"))).toBe(
        true,
      );
    });

    it("links only to pages and items that exist", () => {
      const broken = links(p).filter(([url]) => !resolves(p, url));
      expect(broken).toEqual([]);
    });

    it("puts every app form on a page in the navigation", () => {
      for (const form of p.app?.forms ?? []) {
        const on = p.pages.filter((pg) =>
          pg.sections.some(
            (s) => s.type === "app" && s.appForm === form.id && !s.hidden,
          ),
        );
        // Every page is in the header navigation, so a form on a page is reachable.
        expect([form.name, on.length > 0]).toEqual([form.name, true]);
      }
      for (const s of sections(p).filter((s) => s.type === "app"))
        expect(p.app?.forms.some((f) => f.id === s.appForm)).toBe(true);
      for (const s of sections(p).filter((s) => s.type === "collection"))
        expect(collectionIds).toContain(s.listing?.collection);
      expect(p.pages.length).toBeLessThanOrEqual(7);
      const hero = p.pages[0].sections.find((s) => s.type === "hero")!;
      expect(hero.buttonLabel).toBeTruthy();
      expect(resolves(p, hero.buttonUrl)).toBe(true);
    });

    it("orders and books from collections with real, priced items", () => {
      for (const t of p.app?.tables ?? [])
        for (const f of t.fields.filter(
          (f) => f.type === "item" || f.type === "items",
        )) {
          const c = p.collections!.find((c) => c.id === f.collection)!;
          const shown = c.items.filter((i) => !i.hidden);
          expect(shown.length).toBeGreaterThanOrEqual(3);
          if (f.type === "items" || c.display.price)
            for (const i of shown)
              expect([
                c.name,
                i.slug,
                Number(i.values[c.display.price]) >= 0,
                i.values[c.display.price] !== "",
              ]).toEqual([c.name, i.slug, true, true]);
          if (f.type === "items")
            expect(
              shown.every((i) => Number(i.values[c.display.price]) > 0),
            ).toBe(true);
          for (const cap of t.capacity ?? [])
            if (cap.maxField && cap.group[0] === f.id)
              expect(c.fields.find((x) => x.id === cap.maxField)?.type).toBe(
                "number",
              );
        }
      for (const form of p.app?.forms ?? []) {
        const t = p.app!.tables.find((t) => t.id === form.table)!;
        if (form.key === REF_KEY) expect(t.prefix).toBeTruthy();
        if (form.payment) expect(form.kind).toBe("submit");
        if (form.verify) expect(fieldOf(t, form.verify)).toBeTruthy();
      }
    });

    it("has specific copy, no placeholders", () => {
      const text = visibleText(p);
      for (const bad of [
        "lorem",
        "coming soon",
        "example.com",
        "a little something extraordinary",
        "thoughtful details. lasting impressions",
        "made with purpose",
        "/explore",
      ])
        expect([bad, text.includes(bad)]).toEqual([bad, false]);
      for (const pg of p.pages) {
        expect(pg.description.length).toBeGreaterThanOrEqual(50);
        expect(pg.description.length).toBeLessThanOrEqual(160);
        expect(pg.title.length).toBeLessThanOrEqual(60);
      }
      // Dhanlaxmi reproduces an existing app page for page, and it has neither.
      if (id !== "dhanlaxmi") {
        expect(
          p.pages.some((pg) => pg.sections.some((s) => s.type === "contact")),
        ).toBe(true);
        expect(sections(p).some((s) => s.type === "faq")).toBe(true);
      }
      expect(p.footer.length).toBe(1);
    });

    it("renders every page and item page, and compiles with bundled images", async () => {
      for (const pg of p.pages)
        expect(renderPage(p, pg)).toContain("<!doctype html>");
      for (const { collection, item } of publishedItems(p.collections))
        expect(renderItemPage(p, collection, item)).toContain(
          "<!doctype html>",
        );
      const files = await compileSite(p, "https://sites.test/release");
      expect(files.some((f) => f.name === "index.html")).toBe(true);
    });
  },
);

describe("template gallery and store seeding", () => {
  it("lists every business template in the gallery with a category", () => {
    expect(gallery.map((g) => g.id).sort()).toEqual(
      business.map((t) => t.id).sort(),
    );
    for (const g of gallery) expect(g.category).toBeTruthy();
  });
  it("seeds a real catalogue for the online store only", () => {
    const seed = storeSeed("botanical")!;
    expect(seed.products.length).toBeGreaterThanOrEqual(8);
    expect(
      new Set(seed.products.map((p) => p.collection)).size,
    ).toBeGreaterThanOrEqual(3);
    for (const product of seed.products) {
      expect(product.image).toMatch(/^\/images\/[a-z0-9.-]+$/);
      for (const v of product.variants) {
        expect(Number.isInteger(v.price) && v.price > 0).toBe(true);
        expect(Number.isInteger(v.stock) && v.stock >= 0).toBe(true);
      }
    }
    expect(seed.settings).toEqual({
      enabled: true,
      linkFromWebsite: true,
      useCatalogOnWebsite: true,
    });
    for (const t of templateOptions.filter((t) => t.id !== "botanical"))
      expect(storeSeed(t.id)).toBeUndefined();
  });
  it("app templates bring the collections their item fields need", () => {
    for (const t of APP_TEMPLATES) {
      const { app, collections } = t.create("Shop", { taken: ["menu"] });
      const ids = collections.map((c) => c.id);
      expect([t.id, validateApp(app, ids)]).toEqual([t.id, true]);
      expect([t.id, appIssues(app)]).toEqual([t.id, []]);
      expect(collections.every((c) => c.slug !== "menu")).toBe(true);
      const page = `/${t.page.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      for (const c of collections)
        for (const f of c.fields.filter((f) => f.type === "link"))
          for (const i of c.items) expect(i.values[f.id]).toBe(page);
    }
  });
});
