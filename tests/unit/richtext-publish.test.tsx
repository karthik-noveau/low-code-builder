import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject, templateOptions } from "../../src/studio/templates";
import { renderPage } from "../../src/studio/export";
import { blocksSection } from "../../src/studio/store";
import { mapSectionLinks, validateProject } from "../../src/studio/model";
import { createNode } from "../../src/blocks/registry";
import { walk, type Node } from "../../src/blocks/model";
import { Nodes, type RenderContext } from "../../src/blocks/render";
import { PRESETS } from "../../src/blocks/presets";
import { rootValid } from "../../src/blocks/validate";
import { RICH_PROPS, richText } from "../../src/blocks/richtext";

/** How text was drawn before inline formatting (headings: *accent*). */
const legacy = (value: string, heading: boolean): ReactNode =>
  heading
    ? value
        .split(/\*([^*\n]+)\*/)
        .map((part, n) =>
          n % 2 ? createElement("em", { key: n }, part) : part,
        )
    : value;
const html = (node: ReactNode) =>
  renderToStaticMarkup(createElement("div", null, node));

function page(children: Node[]) {
  const project = createProject("botanical", "Corner Shop");
  const root = createNode("section");
  root.children = children;
  project.pages[0].sections.push(blocksSection(root, "Words"));
  return project;
}

describe("formatted text on the published site", () => {
  it("publishes bold, italic and links as HTML, no script needed", () => {
    const project = page([
      createNode("heading", {
        text: "Fresh **every** day, *Pune*",
        level: "2",
      }),
      createNode("text", {
        text: 'Read [our story](/our-story), [order](https://wa.me/91999 "new tab") or __call__ [us](tel:+919999999999).\n[bad](javascript:alert)',
      }),
      createNode("list", {
        items: ["**Free** delivery", "See [care tips](#care)"],
      }),
    ]);
    expect(validateProject(project)).toBe(true);
    const out = renderPage(project, project.pages[0]);
    expect(out).toContain("Fresh <strong>every</strong> day, <em>Pune</em>");
    expect(out).toContain('<a href="our-story.html">our story</a>');
    expect(out).toContain(
      '<a href="https://wa.me/91999" target="_blank" rel="noopener noreferrer">order</a>',
    );
    expect(out).toContain('<em class="blk-i">call</em>');
    expect(out).toContain('<a href="tel:+919999999999">us</a>');
    expect(out).toContain("\nbad</p>");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("<span><strong>Free</strong> delivery</span>");
    expect(out).toContain('<a href="#care">care tips</a>');
  });

  it("never puts links inside links", () => {
    const text = createNode("text", { text: "Go to [menu](/menu) now" });
    const heading = createNode("heading", { text: "See [offers](#o)" });
    heading.on = { click: [{ do: "page", page: "x" }] };
    const card = createNode("box", { link: "/collection" });
    card.children = [text];
    const project = page([card, heading]);
    const ctx: RenderContext = {
      project,
      exporting: true,
      href: (u) => u,
    };
    const out = html(createElement(Nodes, { nodes: [card, heading], ctx }));
    expect(out).toContain("Go to menu now");
    expect(out).toContain("See offers");
    expect((out.match(/<a /g) ?? []).length).toBe(1);
  });

  it("draws the same formatting in the editor, links not focusable", () => {
    const text = createNode("text", { text: "a **b** [c](/menu)" });
    const project = page([text]);
    const out = html(
      createElement(Nodes, {
        nodes: [text],
        ctx: {
          project,
          exporting: false,
          href: (u) => u,
          edit: {
            selected: null,
            typing: null,
            onStartTyping: () => {},
            onFinishTyping: () => {},
            onCommit: () => {},
            onSelect: () => {},
          },
        },
      }),
    );
    expect(out).toContain(
      'a <strong>b</strong> <a href="/menu" tabindex="-1">c</a>',
    );
  });

  it("caps links per block and renames page links", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => `[l${i}](/p${i})`).join(" ");
    const root = createNode("section");
    root.children = [createNode("text", { text: many(20) })];
    expect(rootValid(root)).toBe(true);
    root.children = [createNode("text", { text: many(21) })];
    expect(rootValid(root)).toBe(false);
    root.children = [createNode("text", { text: "[a](/old) and **b**" })];
    const moved = mapSectionLinks(blocksSection(root, "x"), (u) =>
      u === "/old" ? "/new" : u,
    );
    expect(moved.root!.children![0].props.text).toBe("[a](/new) and **b**");
  });

  it("leaves every template and prebuilt section's text as it was", () => {
    let checked = 0;
    const check = (n: Node) => {
      const key = RICH_PROPS[n.type];
      if (!key) return;
      const values = ([] as string[]).concat(
        (n.props[key] as string | string[] | undefined) ?? [],
      );
      for (const v of values) {
        checked += 1;
        expect([
          v,
          html(richText(v, { accent: n.type === "heading" })),
        ]).toEqual([v, html(legacy(v, n.type === "heading"))]);
      }
    };
    for (const t of templateOptions) {
      const project = createProject(t.id);
      for (const s of [
        ...project.header,
        ...project.footer,
        ...project.pages.flatMap((p) => p.sections),
      ])
        if (s.root) for (const n of walk([s.root])) check(n);
    }
    const project = createProject("botanical");
    for (const p of PRESETS)
      for (const n of walk([p.build({ project })])) check(n);
    expect(checked).toBeGreaterThan(500);
  });
});
