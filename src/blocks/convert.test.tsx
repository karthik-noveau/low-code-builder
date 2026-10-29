/**
 * Classic smart blocks (app form, contact, email signup, collection list)
 * open as form and repeat blocks (legacy.ts upgradeSmart) and publish the
 * same pages as before.
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
import { toBlocks, upgradeProject, upgradeSmart } from "./legacy";
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
      for (const [i, page] of after.pages.entries()) {
        const old = renderPage(before, before.pages[i], options);
        const now = renderPage(after, page, options);
        if (now.includes("blk-repeat")) {
          // Collection lists: the same items, linking to the same pages.
          const links = (html: string) =>
            [...html.matchAll(/href="(?:\.\/)?([\w-]+\/[\w-]+\.html)"/g)].map(
              (m) => m[1],
            );
          expect(links(now)).toEqual(links(old));
        } else expect(body(now)).toBe(body(old));
      }
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
