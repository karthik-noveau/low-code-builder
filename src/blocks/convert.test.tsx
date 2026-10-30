/**
 * Classic smart blocks (app form, contact, email signup, collection list,
 * products) open as form and repeat blocks (legacy.ts upgradeSmart) and
 * publish the same pages as before.
 */
import { describe, expect, it } from "vitest";
import type { Project } from "../studio/model";
import { classicProject, templateOptions } from "../studio/templates";
import { renderPage } from "../studio/export";
/** The inbox forms a site posts from (backend/inbox.ts inboxConfig reads these). */
const inboxConfig = (p: Project) => ({
  forms: [
    ...new Set(
      inboxForms(siteSections(p))
        .filter((f) => !/^https?:\/\//i.test(f.action))
        .map((f) => f.kind),
    ),
  ],
});
import { inboxForms, siteSections } from "./project";
import { productCards, toBlocks, upgradeProject, upgradeSmart } from "./legacy";
import type { StoreProduct } from "./data/store";
import { walk, type Node } from "./model";
import { syncForms } from "./forms/sync";
import { createNode } from "./registry";
import { rootValid } from "./validate";

/** A project as drafts saved before this change were: blocks with smart blocks. */
function withSmartBlocks(id: (typeof templateOptions)[number]["id"]): Project {
  const p = classicProject(id);
  const convert = (list: Project["header"]) => list.map((s) => toBlocks(s, p));
  return {
    ...p,
    header: convert(p.header),
    footer: convert(p.footer),
    pages: p.pages.map((pg) => ({ ...pg, sections: convert(pg.sections) })),
  };
}
const nodes = (p: Project): Node[] =>
  [...p.header, ...p.pages.flatMap((pg) => pg.sections), ...p.footer].flatMap(
    (s) => (s.root ? [...walk([s.root])] : []),
  );
/**
 * What a page shows, without the wrappers and classes a repeat adds (list
 * items, the "no products" box): its tags with their links, images and
 * labels, and its words. looks.css draws both the same (checked in a browser).
 */
const shown = (html: string) =>
  body(html)
    .replace(/ (class|aria-label|inert)="[^"]*"/g, "")
    .replace(/<\/?(div|ul|li)>/g, "");
/** Forma Store's catalogue as the publisher gives it (commerce-publishing.ts). */
const catalogue: StoreProduct[] = [
  ["Aloe", "₹299.00", "/images/plant-1.jpg", "Plants"],
  ["Basket", "₹499.00", "", "Pots"],
  ["Cactus", "", "/images/plant-2.jpg", "Plants"],
].map(([title, price, image, category], i) => ({
  id: `p${i}`,
  title,
  body: i === 1 ? "" : `About ${title}.`,
  image,
  price,
  url: `https://forma.test/store?site=s&product=p${i}`,
  category,
}));
/** The classic products blocks as the publisher filled them (backend/compiler.ts). */
function filled(p: Project, products: StoreProduct[]): Project {
  const q = structuredClone(p);
  for (const n of nodes(q))
    if (n.type === "products")
      n.children = productCards(products.slice(0, 12), n.id);
  return q;
}
/** A page's body without the per-block CSS (converted blocks add rules for parts drawn classically). */
const body = (html: string) =>
  html.replace(/<style>[^<]*<\/style>/g, "").replace(/<head>.*<\/head>/, "");

describe("smart blocks convert to form and repeat blocks", () => {
  const options = {
    inbox: "https://api.test/inbox/s",
    appApi: "https://api.test/apps/s",
  };
  for (const t of templateOptions.filter((t) => t.id !== "blank"))
    it(`${t.id}: same published pages, nothing smart left`, () => {
      const before = withSmartBlocks(t.id);
      expect(nodes(before).some((n) => n.type === "appForm")).toBe(
        !!before.app,
      );
      const after = upgradeProject(before);
      const kinds = new Set(nodes(after).map((n) => n.type));
      for (const smart of [
        "appForm",
        "contactForm",
        "newsletter",
        "collectionList",
        "products",
      ])
        expect([smart, kinds.has(smart as Node["type"])]).toEqual([
          smart,
          false,
        ]);
      // Converting again changes nothing (ids come from the replaced blocks).
      expect(upgradeProject(after)).toBe(after);
      expect(JSON.stringify(upgradeProject(structuredClone(before)))).toBe(
        JSON.stringify(after),
      );
      for (const s of after.pages.flatMap((pg) => pg.sections))
        expect(rootValid(s.root)).toBe(true);
      // The studio's first commit leaves the converted forms and the app alone.
      expect(syncForms(after, after)).toBe(after);
      expect(inboxConfig(after).forms?.sort()).toEqual(
        inboxConfig(before).forms?.sort(),
      );
      const stocked = filled(before, catalogue);
      let stores = 0;
      for (const [i, page] of after.pages.entries()) {
        const old = renderPage(before, before.pages[i], options);
        const now = renderPage(after, page, options);
        if (now.includes("rl-products")) {
          stores++;
          // Products: the block's own cards without a catalogue on the
          // website, the store's products (as the publisher drew them) with one.
          expect(shown(now)).toBe(shown(old));
          expect(
            shown(renderPage(after, page, { ...options, store: catalogue })),
          ).toBe(shown(renderPage(stocked, stocked.pages[i], options)));
        } else if (now.includes("blk-repeat")) {
          // Collection lists: the same items, linking to the same pages.
          const links = (html: string) =>
            [...html.matchAll(/href="(?:\.\/)?([\w-]+\/[\w-]+\.html)"/g)].map(
              (m) => m[1],
            );
          expect(links(now)).toEqual(links(old));
        } else expect(body(now)).toBe(body(old));
      }
      expect(stores).toBe(
        before.pages.filter((pg) =>
          JSON.stringify(pg.sections).includes('"type":"products"'),
        ).length,
      );
    });

  it("keeps a block whose form or collection is gone", () => {
    const p = withSmartBlocks("volt");
    const gone = structuredClone(p);
    gone.app!.forms = [];
    gone.collections = [];
    const after = upgradeProject(gone);
    expect(upgradeProject(after)).toBe(after);
    const kinds = nodes(after).map((n) => n.type);
    expect(kinds).toContain("appForm");
    expect(kinds).toContain("collectionList");
    expect(kinds).not.toContain("contactForm");
  });

  it("lists the store's products by category and limit", () => {
    const p = upgradeProject(withSmartBlocks("botanical"));
    const page = p.pages.find((pg) => pg.slug === "collection")!;
    const repeat = page.sections
      .flatMap((s) => [...walk([s.root!])])
      .find((n) => n.type === "repeat")!;
    expect(repeat.props).toMatchObject({
      source: "store:products",
      look: "products",
      limit: 12,
    });
    const titles = () =>
      [
        ...renderPage(p, page, { store: catalogue }).matchAll(
          /<h3[^>]*>([^<]*)<\/h3>/g,
        ),
      ]
        .map((m) => m[1])
        .filter((t) => catalogue.some((c) => c.title === t));
    expect(titles()).toEqual(["Aloe", "Basket", "Cactus"]);
    repeat.props.category = "plants";
    expect(titles()).toEqual(["Aloe", "Cactus"]);
    repeat.props.limit = 1;
    expect(titles()).toEqual(["Aloe"]);
    // Without a catalogue on the website: the block's own cards.
    expect(renderPage(p, page)).toContain("Fiddle leaf fig");
    expect(renderPage(p, page)).not.toContain("Aloe");
  });

  it("keeps a products block it can't convert, and adds new ones as store repeats", () => {
    const p = withSmartBlocks("botanical");
    const block = nodes(p).find((n) => n.type === "products")!;
    block.children!.push(createNode("text"));
    const after = upgradeProject(p);
    expect(nodes(after).filter((n) => n.type === "products")).toHaveLength(1);
    expect(upgradeProject(after)).toBe(after);
    const n = createNode("products");
    expect(n).toMatchObject({
      type: "repeat",
      props: { source: "store:products", look: "products" },
    });
    expect(n.children!.map((c) => c.props.slot ?? "card")).toEqual([
      "card",
      "empty",
    ]);
    const section = createNode("section");
    section.children = [n];
    expect(rootValid(section)).toBe(true);
  });

  it("draws an inbox form from its blocks: labels, button, own endpoint", () => {
    const p = upgradeProject(withSmartBlocks("botanical"));
    const page = p.pages.find((pg) => pg.slug === "contact")!;
    const form = page.sections
      .flatMap((s) => [...walk([s.root!])])
      .find((n) => n.type === "form" && n.props.kind === "contact")!;
    form.children![0].props.label = "Who are you?";
    form.children!.find((c) => c.type === "submit")!.props.label = "Go";
    const html = renderPage(p, page, { inbox: "https://api.test/inbox/s" });
    expect(html).toContain("Who are you?");
    expect(html).toContain('name="website"');
    expect(html).toMatch(/<button[^>]*class="site-button"[^>]*>Go</);
    form.props.action = "https://forms.test/x";
    expect(
      renderPage(p, page, { inbox: "https://api.test/inbox/s" }),
    ).toContain('action="https://forms.test/x"');
    expect(inboxConfig(p).forms).toEqual(["newsletter"]);
  });

  it("draws a classic app form with its blocks' words", () => {
    const p = upgradeProject(withSmartBlocks("volt"));
    const page = p.pages.find((pg) => pg.slug === "warranty")!;
    const form = page.sections
      .flatMap((s) => [...walk([s.root!])])
      .find((n) => n.type === "form" && n.props.look === "classic")!;
    const field = form.children!.find((c) => c.type === "field")!;
    field.props.label = "Full name";
    form.children!.find((c) => c.props.part === "title")!.props.text =
      "Register it";
    const html = renderPage(p, page, { appApi: "https://api.test/apps/s" });
    expect(html).toContain("Full name");
    expect(html).toContain(">Register it</h1>");
    // The Blocks look lays the same blocks out freely.
    delete form.props.look;
    expect(
      renderPage(p, page, { appApi: "https://api.test/apps/s" }),
    ).toContain("data-blocks-form");
  });

  it("adds Contact and Email signup blocks as inbox forms", () => {
    const n = createNode("newsletter");
    expect(n).toMatchObject({
      type: "form",
      props: { target: "inbox", kind: "newsletter" },
    });
    expect(n.children!.map((c) => c.type)).toEqual(["field", "submit"]);
  });

  it("converts saved sections and leaves classic-only drafts valid", () => {
    const p = withSmartBlocks("glow");
    const contact = p.pages
      .flatMap((pg) => pg.sections)
      .find((s) => JSON.stringify(s.root).includes('"contactForm"'))!;
    p.savedSections = [contact];
    const after = upgradeProject(p);
    expect(JSON.stringify(after.savedSections)).not.toContain('"contactForm"');
    expect(upgradeSmart(after.savedSections![0], after)).toBe(
      after.savedSections![0],
    );
  });
});
