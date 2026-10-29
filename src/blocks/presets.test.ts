import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../studio/templates";
import { FONT_SIZES, walk, type Node } from "./model";
import { PRESET_CATEGORIES, PRESETS, presetById } from "./presets";
import { Nodes, type RenderContext } from "./render";
import { treeCss } from "./style";
import { rootValid } from "./validate";

const project = createProject("botanical", "Corner Shop");
const ctx: RenderContext = {
  project,
  exporting: true,
  href: (url) => url || "#",
  currentPage: project.pages[0].id,
};
const ids = (root: ReturnType<(typeof PRESETS)[number]["build"]>) =>
  [...walk([root])].map((n) => n.id);

describe("prebuilt sections", () => {
  it("have unique preset ids and known categories", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    const known = PRESET_CATEGORIES.map((c) => c.id);
    for (const p of PRESETS) expect(known).toContain(p.category);
    expect(presetById("hero-centered")?.name).toBeTruthy();
  });

  it("offer at least two sections in every category", () => {
    for (const c of PRESET_CATEGORIES)
      expect([
        c.id,
        PRESETS.filter((p) => p.category === c.id).length >= 2,
      ]).toEqual([c.id, true]);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))(
    "%s builds a valid tree",
    (_, preset) => {
      const root = preset.build({ project });
      expect(root.type).toBe("section");
      expect(rootValid(root)).toBe(true);
      const first = ids(root);
      expect(new Set(first).size).toBe(first.length);
      // A second build never reuses ids (inserting twice must not clash).
      const second = ids(preset.build({ project }));
      expect(second.some((id) => first.includes(id))).toBe(false);
      for (const n of walk([root]))
        if (n.type === "image") {
          expect(String(n.props.src)).toMatch(/^\/images\/[\w-]+\.(jpg|png)$/);
          expect(existsSync(`public${String(n.props.src)}`)).toBe(true);
          expect(String(n.props.alt).trim().length).toBeGreaterThan(3);
        }
    },
  );

  it.each(PRESETS.map((p) => [p.id, p] as const))("%s renders", (_, preset) => {
    const root = preset.build({ project });
    const html = renderToStaticMarkup(
      createElement(Nodes, { nodes: [root], ctx }),
    );
    expect(html).toContain(`n-${root.id}`);
    expect(html).not.toContain("undefined");
    expect(treeCss([root])).toContain(`.website .n-${root.id}.blk`);
  });

  it("put the site name where the brand belongs", () => {
    const html = renderToStaticMarkup(
      createElement(Nodes, {
        nodes: [presetById("footer-columns")!.build({ project })],
        ctx,
      }),
    );
    expect(html).toContain("Corner Shop");
  });

  it("render tones, reversed columns and footer menus", () => {
    const html = renderToStaticMarkup(
      createElement(Nodes, {
        nodes: ["stats-dark", "features-alternating", "footer-columns"].map(
          (id) => presetById(id)!.build({ project }),
        ),
        ctx,
      }),
    );
    expect(html).toContain("tone-dark");
    expect(html).toContain("is-reversed");
    expect(html).toContain("v-stack");
    // Stacked footer links never fold into a menu button.
    expect(html.match(/blk-menu-phone/g)).toBeNull();
  });

  const images = (root: Node) =>
    [...walk([root])]
      .filter((n) => n.type === "image")
      .map((n) => String(n.props.src));
  const texts = (root: Node) =>
    [...walk([root])]
      .filter((n) => n.type === "text" || n.type === "heading")
      .map((n) => String(n.props.text));

  it.each([
    ["testimonials-cards", 3],
    ["testimonials-quote", 1],
    ["testimonials-rating", 2],
    ["team-grid", 4],
    ["team-list", 4],
    ["content-quote", 1],
  ] as const)("%s shows people as photos, not initials", (id, people) => {
    const root = presetById(id)!.build({ project });
    const photos = images(root).filter((src) =>
      /^\/images\/person-\d\.jpg$/.test(src),
    );
    expect(photos).toHaveLength(people);
    // Different people in one section never share a portrait.
    expect(new Set(photos).size).toBe(people);
    expect(texts(root).filter((t) => /^[A-Z]{2}$/.test(t))).toEqual([]);
  });

  it.each(["logos-row", "logos-grid"])(
    "%s uses swappable placeholder logos, not made-up wordmarks",
    (id) => {
      const root = presetById(id)!.build({ project });
      const logos = images(root);
      expect(logos.length).toBeGreaterThanOrEqual(5);
      for (const src of logos)
        expect(src).toMatch(/^\/images\/logo-placeholder-\d\.png$/);
      const heights = [...walk([root])]
        .filter((n) => n.type === "image")
        .map((n) => n.style?.height);
      expect(new Set(heights).size).toBe(1);
      // Only the section's own words: an intro or a short line.
      expect(texts(root).length).toBeLessThanOrEqual(3);
    },
  );

  it("size headings with theme tokens, never fixed pixels", () => {
    const sizes = FONT_SIZES as readonly string[];
    for (const preset of PRESETS)
      for (const n of walk([preset.build({ project })]))
        if (n.type === "heading")
          for (const style of [n.style, n.tablet, n.mobile])
            if (style?.fontSize)
              expect([
                preset.id,
                n.props.text,
                sizes.includes(style.fontSize),
              ]).toEqual([preset.id, n.props.text, true]);
  });
});
