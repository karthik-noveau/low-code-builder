import { describe, expect, it } from "vitest";
import {
  createBlock,
  validateProject,
  type Project,
  type Section,
  type SectionType,
} from "../studio/model";
import {
  classicProject,
  createProject,
  createSection,
} from "../studio/templates";
import { item } from "../studio/sites/kit";
import { needsUpgrade, toBlocks, upgradeProject } from "./legacy";
import { walk, type Node } from "./model";
import { rootValid } from "./validate";

const TYPES: SectionType[] = [
  "announcement",
  "header",
  "hero",
  "products",
  "features",
  "imageText",
  "gallery",
  "testimonials",
  "faq",
  "contact",
  "newsletter",
  "footer",
  "text",
  "cta",
  "custom",
  "collection",
  "app",
];
/** Every classic section type, and every look one can take. */
function classics(project: Project): Section[] {
  const collection = project.collections![0];
  const form = project.app!.forms[0];
  return [
    ...TYPES.map((type) =>
      createSection(type, {
        ...(type === "collection"
          ? {
              listing: {
                collection: collection.id,
                style: "list",
                columns: 2,
                limit: 3,
              },
            }
          : {}),
        ...(type === "app" ? { appForm: form.id } : {}),
      }),
    ),
    createSection("header", {
      variant: "brand",
      title: "Dhanlaxmi",
      eyebrow: "Electricals",
      items: [
        item("Home", "", "", "", "/"),
        { ...item("Add", "", "", "", "/a"), icon: "receipt" },
      ],
    }),
    createSection("hero", {
      variant: "badge",
      effect: "orbits",
      image: "",
      secondaryLabel: "See my rewards",
      secondaryUrl: "/",
      note: "No login needed.",
    }),
    createSection("hero", { layout: "split" }),
    createSection("hero", {
      image: "",
      secondaryLabel: "More",
      secondaryUrl: "/",
    }),
    createSection("features", {
      variant: "cards",
      title: "How it works",
      items: [item("Enter your phone", "We show your name.")],
    }),
    createSection("features", {
      title: "Why us",
      items: [item("Fast", "Same day.")],
    }),
    createSection("text", { variant: "notice", title: "Not registered?" }),
    createSection("footer", {
      variant: "centered",
      buttonLabel: "Owner sign in",
      buttonUrl: "{owner}",
    }),
    createSection("custom", { width: "narrow" }),
  ];
}
const texts = (root: Node) =>
  JSON.stringify([...walk([root])].map((n) => n.props));

describe("converting classic sections to blocks", () => {
  const project = classicProject("table");
  const list = classics(project);

  it.each(
    list.map(
      (s) => [`${s.type}${s.variant ? ` ${s.variant}` : ""}`, s] as const,
    ),
  )("converts %s to a valid blocks section with the same content", (_, s) => {
    const out = toBlocks(s, project);
    expect(out.type).toBe("blocks");
    expect(out.id).toBe(s.id);
    expect(out.name).toBe(s.name);
    expect(rootValid(out.root)).toBe(true);
    const root = out.root!;
    expect(root.props.tag).toBe(
      s.type === "header"
        ? "header"
        : s.type === "footer"
          ? "footer"
          : "section",
    );
    expect(String(root.props.look)).toBeTruthy();
    const all = texts(root);
    const shown: string[] = [];
    // App forms show the form's own title; custom sections never showed theirs.
    if (!["app", "collection", "custom"].includes(s.type)) shown.push(s.title);
    if (
      [
        "hero",
        "products",
        "gallery",
        "imageText",
        "faq",
        "contact",
        "newsletter",
        "text",
        "cta",
      ].includes(s.type)
    )
      shown.push(s.body);
    if (s.buttonLabel && !["testimonials", "faq", "footer"].includes(s.type))
      shown.push(s.buttonLabel);
    if (s.secondaryLabel) shown.push(s.secondaryLabel);
    if (s.note) shown.push(s.note);
    if (s.type !== "custom")
      for (const i of s.items) shown.push(...[i.title, i.body].filter(Boolean));
    for (const b of walkBlocks(s)) shown.push(b);
    for (const t of shown.filter(Boolean))
      expect([s.type, all.includes(JSON.stringify(t).slice(1, -1))]).toEqual([
        s.type,
        true,
      ]);
  });
  it("gives the same ids each time, unique within the tree", () => {
    for (const s of list) {
      const a = toBlocks(s, project);
      expect(toBlocks(s, project)).toEqual(a);
      const ids = [...walk([a.root!])].map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("keeps colours, padding, phone and tablet overrides and the animation", () => {
    const s = createSection("text", {
      background: "#112233",
      color: "#ffffff",
      padding: 40,
      align: "center",
      animation: "rise",
      responsive: {
        tablet: { padding: 20, align: "left" },
        mobile: { hidden: true },
      },
    });
    const out = toBlocks(s, project);
    const root = out.root!;
    expect(out.animation).toBe("rise");
    expect(out.responsive).toBeUndefined();
    expect(root.style).toMatchObject({
      background: "#112233",
      color: "#ffffff",
      padding: [40, 0, 40, 0],
      textAlign: "center",
    });
    expect(root.tablet).toMatchObject({
      padding: [20, 0, 20, 0],
      textAlign: "left",
    });
    // A tablet padding holds on phones unless they set their own.
    expect(root.mobile).toMatchObject({
      padding: [20, 0, 20, 0],
      hidden: true,
    });
  });
  it("makes the first titled section the page's H1 when there is no hero", () => {
    const p = classicProject("table");
    const page = p.pages.find((pg) => pg.slug === "menu")!;
    const [first, ...rest] = page.sections.filter((s) => !s.hidden);
    const heading = (s: Section) =>
      [...walk([toBlocks(s, p).root!])].find(
        (n) => n.type === "heading" || n.type === "appForm",
      );
    expect(heading(first)?.props.level).toBe("1");
    for (const s of rest) expect(heading(s)?.props.level ?? "2").not.toBe("1");
  });
  it("keeps a section classic when its tree would be invalid", () => {
    const s = createSection("faq", { items: [item("Long?", "x".repeat(600))] });
    expect(toBlocks(s, project)).toBe(s);
  });
  it("turns old custom blocks into block nodes", () => {
    const heading = {
      ...createBlock("heading"),
      text: "Big",
      size: "xl" as const,
    };
    const button = {
      ...createBlock("button"),
      text: "Go",
      url: "/menu",
      variant: "link" as const,
    };
    const out = toBlocks(
      createSection("custom", { blocks: [heading, button] }),
      project,
    );
    const nodes = [...walk([out.root!])];
    expect(nodes.find((n) => n.type === "heading")).toMatchObject({
      props: { text: "Big", level: "2" },
      style: { fontSize: "4xl" },
    });
    expect(nodes.find((n) => n.type === "button")?.props).toMatchObject({
      label: "Go",
      url: "/menu",
      variant: "link",
    });
  });
});

describe("upgrading projects", () => {
  it("converts every section, saved ones too, and leaves blocks projects alone", () => {
    const p = classicProject("glow");
    p.savedSections = [createSection("faq")];
    const up = upgradeProject(p);
    expect(validateProject(up)).toBe(true);
    expect(needsUpgrade(up)).toBe(false);
    expect(up.savedSections![0].type).toBe("blocks");
    expect(upgradeProject(up)).toBe(up);
  });
  it.each(["botanical", "dhanlaxmi", "blank"] as const)(
    "builds the %s template from blocks",
    (id) => {
      const p = createProject(id);
      expect(validateProject(p)).toBe(true);
      expect(needsUpgrade(p)).toBe(false);
    },
  );
});

/** The text in a custom section's old blocks. */
function walkBlocks(s: Section): string[] {
  const out: string[] = [];
  const visit = (list = s.blocks ?? []) => {
    for (const b of list) {
      if (b.text) out.push(b.text);
      visit(b.children);
    }
  };
  visit();
  return out;
}
