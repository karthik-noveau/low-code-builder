/**
 * Converts the classic fixed sections (hero, features, header, app form…) to
 * block trees with the same content and look. Each converted section's root
 * carries a classic look (`look`, drawn by looks.css) and the owner's own
 * settings (colours, padding, alignment, phone and tablet overrides) as block
 * styles, so it can then be edited block by block. upgradeProject converts a
 * whole project when it is opened or imported.
 */
import {
  type Block,
  type Item,
  type Project,
  type Section,
  type SectionType,
} from "../studio/model";
import {
  walk,
  type Node,
  type NodeType,
  type Props,
  type Style,
} from "./model";
import { BLOCKS } from "./registry";
import { rootValid } from "./validate";
import { fieldOf, tableOf } from "../apps/model";
import { appLinks } from "../apps/links";
import { identityField } from "./forms/model";
import { formChildren } from "./forms/sync";
import { inboxFormNode } from "./forms/inbox";
import type { Condition } from "./logic/model";

/** Section types whose title isn't the page's main heading (as Website.tsx). */
const PLAIN_TITLES = new Set<SectionType>([
  "announcement",
  "header",
  "hero",
  "features",
  "custom",
  "footer",
]);
const hex = (v: string) => (/^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);
const clean = <T extends object>(o: T): T | undefined => {
  const out = Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
  return Object.keys(out).length ? out : undefined;
};
/** Ids that stay the same each time a section is converted. */
function idMaker(sectionId: string) {
  let hash = 0;
  for (const c of sectionId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const base = /^[\w-]{1,40}$/.test(sectionId)
    ? sectionId
    : `s${hash.toString(36)}`;
  let n = 0;
  return () => `${base}-${(n++).toString(36)}`;
}

interface Extra {
  name?: string;
  style?: Style;
  tablet?: Style;
  mobile?: Style;
  hidden?: boolean;
}
type Make = (
  type: NodeType,
  props?: Props,
  children?: (Node | false | undefined | "")[],
  extra?: Extra,
) => Node;

function maker(sectionId: string): Make {
  const id = idMaker(sectionId);
  return (type, props = {}, children, extra = {}) => {
    const def = BLOCKS[type];
    const node: Node = {
      id: id(),
      type,
      props: { ...def.props(), ...props },
    };
    if (extra.name) node.name = extra.name;
    for (const key of ["style", "tablet", "mobile"] as const) {
      const s = extra[key] && clean(extra[key]);
      if (s) node[key] = s;
    }
    if (extra.hidden) node.hidden = true;
    if (def.container)
      node.children = (children ?? []).filter((c): c is Node => !!c);
    return node;
  };
}

/** Whether `s` holds its page's main heading (the first titled section without a hero). */
function isMain(s: Section, project: Project) {
  const page = project.pages.find((p) => p.sections.some((x) => x.id === s.id));
  if (!page) return false;
  const visible = page.sections.filter((x) => !x.hidden);
  if (visible.some((x) => x.type === "hero" && x.title)) return false;
  return visible.find((x) => x.title && !PLAIN_TITLES.has(x.type))?.id === s.id;
}

/** The fields every section has, left neutral on a converted one. */
function blankSection(s: Section, root: Node): Section {
  return {
    id: s.id,
    type: "blocks",
    name: s.name,
    title: "",
    eyebrow: "",
    body: "",
    buttonLabel: "",
    buttonUrl: "",
    image: "",
    imageAlt: "",
    background: "",
    color: "",
    align: "left",
    layout: "cover",
    padding: 0,
    height: 0,
    overlay: 0,
    hidden: s.hidden,
    items: [],
    formAction: "",
    ...(s.animation && s.animation !== "none"
      ? { animation: s.animation }
      : {}),
    root,
  };
}

/** Product and gallery cards (also used to fill a products block when publishing). */
export function itemCard(make: Make, i: Item, withPrice: boolean): Node {
  return make(
    "box",
    { variant: "plain" },
    [
      i.image
        ? make(
            "image",
            {
              src: i.image,
              alt: i.title,
              fit: "cover",
              ratio: "auto",
              link: i.url,
            },
            undefined,
            { style: { radius: "theme" } },
          )
        : // No photo: a placeholder tile, still linking to the item.
          make(
            "box",
            { variant: "plain", link: i.url },
            [make("icon", { icon: "image", variant: "plain", size: 32 })],
            { name: "Image" },
          ),
      make(
        "row",
        {},
        [
          make("heading", { text: i.title, level: "3" }),
          withPrice &&
            i.price &&
            make("text", { text: i.price, variant: "small" }, undefined, {
              name: "Price",
            }),
        ],
        {
          name: "Title",
          style: { justify: "between", align: "start", wrap: false, gap: 10 },
        },
      ),
      i.body && make("text", { text: i.body, variant: "muted" }),
    ],
    { name: i.title || "Card" },
  );
}

/** Product cards for a products block, from store or section items. */
export function productCards(items: Item[], seed: string): Node[] {
  const make = maker(`${seed}-p`);
  return items.map((i) => itemCard(make, i, true));
}

/**
 * The section as a "blocks" section with the same content and look. Blocks
 * sections come back unchanged; header and footer sections stay where they are.
 */
export function toBlocks(s: Section, project: Project): Section {
  if (s.type === "blocks") return s;
  const make = maker(s.id);
  const main = isMain(s, project);
  const text = (value: string, variant = "body", extra?: Extra) =>
    make("text", { text: value, variant }, undefined, extra);
  const heading = (value: string, level: number, extra?: Extra) =>
    make("heading", { text: value, level: String(level) }, undefined, extra);
  /** Eyebrow, title (the page's H1 when main) and description. */
  const headingParts = (o: { eyebrow?: boolean; body?: boolean } = {}) => [
    o.eyebrow !== false && s.eyebrow && text(s.eyebrow, "eyebrow"),
    s.title && heading(s.title, main ? 1 : 2),
    o.body !== false && s.body && text(s.body, "lead", { name: "Description" }),
  ];
  const button = (
    label: string,
    url: string,
    variant: string,
    props: Props = {},
    extra?: Extra,
  ) =>
    make(
      "button",
      { label, url, variant, size: "md", icon: "arrowUpRight", ...props },
      undefined,
      extra,
    );
  /** One button as is; two side by side. */
  const actions = (buttons: (Node | "" | false | undefined)[], gap = 10) => {
    const list = buttons.filter((b): b is Node => !!b);
    return list.length > 1
      ? make("row", {}, list, { name: "Buttons", style: { gap } })
      : list[0];
  };
  /** The section's own padding (top and bottom) and inline padding `x`. */
  const pad = (n: number, x = 0): Style["padding"] => [n, x, n, x];
  /** Phone and tablet overrides: the look's defaults, then the owner's. */
  const device = (
    which: "tablet" | "mobile",
    look: Style = {},
    x = 0,
  ): Style | undefined => {
    const o = s.responsive?.[which];
    // A tablet padding also holds on phones unless phones set their own.
    const padding =
      o?.padding ??
      (which === "mobile" ? s.responsive?.tablet?.padding : undefined);
    return clean({
      ...look,
      ...(padding !== undefined ? { padding: pad(padding, x) } : {}),
      ...(o?.align ? { textAlign: o.align } : {}),
      ...(o?.hidden ? { hidden: true } : {}),
    });
  };
  const root = (
    look: string,
    children: (Node | false | undefined | "")[],
    o: {
      props?: Props;
      style?: Style;
      tablet?: Style;
      mobile?: Style;
      x?: number;
      /** The look sets the alignment itself. */
      fixedAlign?: boolean;
    } = {},
  ) =>
    make(
      "section",
      {
        tag:
          s.type === "header"
            ? "header"
            : s.type === "footer"
              ? "footer"
              : "section",
        tone: "default",
        look,
        ...o.props,
      },
      children,
      {
        style: {
          padding: pad(s.padding, o.x),
          background: hex(s.background),
          color: hex(s.color),
          ...(o.fixedAlign ? {} : { textAlign: s.align }),
          ...o.style,
        },
        tablet: device("tablet", o.tablet, o.x),
        mobile: device("mobile", o.mobile, o.x),
      },
    );
  // A tree that wouldn't pass validation (very long text) stays classic.
  const done = (r: Node) => (rootValid(r) ? blankSection(s, r) : s);

  switch (s.type) {
    case "announcement":
      return done(
        root("announcement", [
          make(
            "box",
            { variant: "plain", link: s.buttonUrl },
            [text(s.title)],
            {
              name: "Link",
            },
          ),
        ]),
      );
    case "header": {
      const brand = s.variant === "brand";
      const cta = button(
        s.buttonLabel,
        s.buttonUrl,
        brand ? "primary" : "link",
        { size: brand ? "sm" : "md", icon: brand ? "" : "arrowUpRight" },
        { name: "Header button", hidden: !s.buttonLabel },
      );
      const bar = make(
        "row",
        {},
        [
          make("logo", {
            text: s.title,
            tagline: brand ? s.eyebrow : "",
            dot: true,
          }),
          make("menu", { source: "pages", variant: brand ? "pill" : "plain" }),
          cta,
          make("themeToggle"),
        ],
        {
          name: "Bar",
          style: {
            justify: brand ? "start" : "between",
            gap: brand ? 12 : 20,
            wrap: false,
          },
        },
      );
      if (!brand)
        return done(
          root("header", [bar], { tablet: { padding: [23, 0, 23, 0] } }),
        );
      return done(
        root(
          "header-brand",
          [
            bar,
            make("tabBar", {
              tabs: s.items.map(
                (i) =>
                  `${i.title.replaceAll("|", "/")} | ${i.url || "/"}${i.icon ? ` | ${i.icon}` : ""}`,
              ),
            }),
          ],
          {
            props: { sticky: true },
            style: { padding: undefined },
            fixedAlign: true,
          },
        ),
      );
    }
    case "hero": {
      if (s.variant === "badge") {
        const icon = (n: number) =>
          s.items[n]?.icon ? `rw:${s.items[n].icon}` : "";
        return done(
          root(
            "hero-badge",
            [
              make(
                "box",
                { variant: "plain" },
                [
                  s.eyebrow &&
                    make("badge", {
                      text: s.eyebrow,
                      icon: "rw:bolt",
                      variant: "soft",
                    }),
                  heading(s.title, 1),
                  s.body && text(s.body, "lead"),
                  (s.buttonLabel || s.secondaryLabel) &&
                    make(
                      "row",
                      {},
                      [
                        s.buttonLabel &&
                          button(s.buttonLabel, s.buttonUrl, "primary", {
                            size: "lg",
                            iconStart: icon(0),
                            icon: "rw:arrow",
                          }),
                        s.secondaryLabel &&
                          button(
                            s.secondaryLabel,
                            s.secondaryUrl ?? "",
                            "secondary",
                            {
                              size: "lg",
                              iconStart: icon(1),
                              icon: "",
                            },
                          ),
                      ],
                      {
                        name: "Buttons",
                        style: { gap: 12, justify: "center" },
                      },
                    ),
                  s.note && text(s.note, "small", { name: "Note" }),
                ],
                { name: "Copy" },
              ),
            ],
            {
              props: s.effect === "orbits" ? { effect: "orbits" } : {},
              style: { padding: [72, 16, 56, 16] },
              tablet: { padding: [64, 20, 40, 20] },
              mobile: { padding: [52, 20, 40, 20] },
              x: 16,
              fixedAlign: true,
            },
          ),
        );
      }
      const image = s.image;
      const look =
        s.layout === "split" ? "hero-split" : image ? "hero" : "hero-plain";
      return done(
        root(
          look,
          [
            image &&
              make(
                "image",
                { src: image, alt: s.imageAlt, fit: "cover", ratio: "auto" },
                undefined,
                { name: "Banner image" },
              ),
            make(
              "box",
              { variant: "plain" },
              [
                s.eyebrow && text(s.eyebrow, "eyebrow"),
                s.title && heading(s.title, 1),
                s.body && text(s.body),
                actions([
                  s.buttonLabel &&
                    button(s.buttonLabel, s.buttonUrl, "primary"),
                  s.secondaryLabel &&
                    button(
                      s.secondaryLabel,
                      s.secondaryUrl ?? "",
                      "secondary",
                      {
                        icon: "",
                      },
                    ),
                ]),
                s.note && text(s.note, "small", { name: "Note" }),
              ],
              { name: "Copy" },
            ),
            text(project.name.toUpperCase(), "small", { name: "Corner label" }),
          ],
          {
            props: {
              shade: s.overlay,
              ...(s.effect === "orbits" ? { effect: "orbits" } : {}),
            },
            style: { minHeight: s.height },
            tablet: { minHeight: 400 },
            mobile: {
              minHeight: 430,
              padding: [50, 0, look === "hero-split" ? 250 : 50, 0],
            },
          },
        ),
      );
    }
    case "features": {
      if (s.variant === "cards")
        return done(
          root(
            "steps",
            [
              s.title && heading(s.title, main ? 1 : 2),
              make(
                "grid",
                {},
                s.items.map((i, n) =>
                  make(
                    "box",
                    { variant: "card" },
                    [
                      make("icon", {
                        icon: `rw:${i.icon ?? ["phone", "receipt", "bell", "wallet"][n % 4]}`,
                        variant: "tile",
                        size: 18,
                      }),
                      make(
                        "row",
                        {},
                        [
                          text(String(n + 1), "small", { name: "Number" }),
                          text(i.title, "body", { name: "Title" }),
                        ],
                        { name: "Step", style: { gap: 8, wrap: false } },
                      ),
                      text(i.body, "muted"),
                    ],
                    { name: i.title || `Step ${n + 1}` },
                  ),
                ),
                {
                  name: "Steps",
                  style: { columns: 4, gap: 16 },
                  tablet: { columns: 2 },
                },
              ),
            ],
            {
              style: { padding: [0, 16, 32, 16] },
              tablet: { padding: [0, 20, 32, 20] },
              x: 16,
              fixedAlign: true,
            },
          ),
        );
      return done(
        root(
          "features",
          [
            s.title &&
              make(
                "box",
                { variant: "plain" },
                [text(s.eyebrow, "eyebrow"), heading(s.title, 2)],
                {
                  name: "Heading",
                },
              ),
            make(
              "row",
              {},
              s.items.map((i, n) =>
                make(
                  "box",
                  { variant: "plain" },
                  [
                    make("icon", {
                      icon: i.icon ?? ["leaf", "truck", "heart"][n % 3],
                      variant: "plain",
                      size: 25,
                    }),
                    make("box", { variant: "plain" }, [
                      heading(i.title, 3),
                      text(i.body, "muted"),
                    ]),
                  ],
                  {
                    name: i.title || "Feature",
                    style: { direction: "row", align: "center" },
                  },
                ),
              ),
              { name: "Features", style: { justify: "between", wrap: false } },
            ),
          ],
          { mobile: { padding: [24, 0, 24, 0] } },
        ),
      );
    }
    case "products":
    case "gallery":
    case "testimonials": {
      const head = make(
        "row",
        {},
        [
          make("box", { variant: "plain" }, headingParts(), {
            name: "Heading",
          }),
          s.type !== "testimonials" &&
            s.buttonLabel &&
            button(s.buttonLabel, s.buttonUrl, "link", { icon: "arrow" }),
        ],
        { name: "Heading row", style: { justify: "between", wrap: false } },
      );
      const cards =
        s.type === "testimonials"
          ? make(
              "grid",
              {},
              s.items.map((i) =>
                make(
                  "box",
                  { variant: "plain" },
                  [
                    text("★★★★★", "muted", { name: "Stars" }),
                    text(i.body),
                    text(i.title, "small", { name: "Name" }),
                  ],
                  { name: i.title || "Quote" },
                ),
              ),
              { name: "Quotes", style: { columns: 3 } },
            )
          : make(
              s.type === "products" ? "products" : "grid",
              {},
              s.items.map((i) => itemCard(make, i, s.type === "products")),
              {
                name: s.type === "products" ? "Products" : "Gallery",
                style: { columns: 3 },
              },
            );
      return done(
        root(
          s.type === "testimonials"
            ? "testimonials"
            : s.type === "gallery"
              ? "gallery"
              : "collection",
          [head, cards],
          { mobile: { padding: [40, 0, 40, 0] } },
        ),
      );
    }
    case "imageText": {
      const image =
        s.image &&
        make("column", {}, [
          make("image", {
            src: s.image,
            alt: s.imageAlt,
            fit: "cover",
            ratio: "auto",
          }),
        ]);
      const copy = make("column", {}, [
        ...headingParts(),
        s.buttonLabel && button(s.buttonLabel, s.buttonUrl, "primary"),
      ]);
      const right = s.layout === "split";
      return done(
        root(
          "image-text",
          [
            make(
              "columns",
              { reverse: right && !!image },
              right ? [copy, image] : [image, copy],
              { style: { columns: 2, align: "center" } },
            ),
          ],
          { mobile: { padding: [35, 0, 35, 0] } },
        ),
      );
    }
    case "faq":
      return done(
        root(
          "faq",
          [
            make(
              "columns",
              {},
              [
                make("column", {}, headingParts()),
                make("column", {}, [
                  make("accordion", {
                    items: s.items.map(
                      (i) =>
                        `${i.title.replaceAll("|", "/").replace(/\s+/g, " ")} | ${i.body.replace(/\s+/g, " ")}`,
                    ),
                  }),
                ]),
              ],
              { style: { columns: 2, align: "start" } },
            ),
          ],
          { mobile: { padding: [40, 0, 40, 0] } },
        ),
      );
    case "contact":
      return done(
        root(
          "contact",
          [
            make(
              "columns",
              {},
              [
                make("column", {}, headingParts()),
                make("column", {}, [
                  make("contactForm", {
                    label: s.buttonLabel,
                    action: s.formAction,
                  }),
                ]),
              ],
              { style: { columns: 2, align: "start" } },
            ),
          ],
          { mobile: { padding: [40, 0, 40, 0] } },
        ),
      );
    case "newsletter":
      return done(
        root(
          "newsletter",
          [
            make("box", { variant: "plain" }, headingParts(), {
              name: "Heading",
            }),
            make("newsletter", { label: s.buttonLabel, action: s.formAction }),
          ],
          { mobile: { padding: [40, 0, 40, 0] } },
        ),
      );
    case "footer": {
      if (s.variant === "centered")
        return done(
          root(
            "footer-centered",
            [
              make(
                "row",
                {},
                [
                  make("menu", { source: "pages", variant: "inline" }),
                  s.buttonLabel &&
                    make("menu", {
                      source: "custom",
                      links: [
                        `${s.buttonLabel.replaceAll("|", "/")} | ${s.buttonUrl}`,
                      ],
                      variant: "inline",
                    }),
                ],
                { name: "Links", style: { justify: "center", gap: 24 } },
              ),
              s.title && text(s.title, "small"),
              s.body && text(s.body, "small"),
            ],
            { style: { padding: [26, 24, 26, 24] }, x: 24, fixedAlign: true },
          ),
        );
      return done(
        root(
          "footer",
          [
            make(
              "box",
              { variant: "plain" },
              [
                make("logo", { text: s.title, mark: false, dot: true }),
                s.body && text(s.body, "small"),
              ],
              { name: "Brand" },
            ),
            make("menu", { source: "pages", variant: "inline" }),
            text(`© {year} ${project.name}. All rights reserved.`, "small", {
              name: "Copyright",
              style: { width: "full" },
            }),
          ],
          {
            style: {
              direction: "row",
              wrap: true,
              justify: "between",
              align: "start",
              gap: 35,
            },
          },
        ),
      );
    }
    case "collection":
      return done(
        root("listing", [
          (s.eyebrow || s.title || s.body) &&
            make("box", { variant: "plain" }, headingParts(), {
              name: "Heading",
            }),
          make("collectionList", {
            collection: s.listing?.collection ?? "",
            style: s.listing?.style ?? "grid",
            columns: s.listing?.columns ?? 3,
            limit: s.listing?.limit ?? 0,
          }),
        ]),
      );
    case "app":
      return done(
        root("app", [
          s.eyebrow && text(s.eyebrow, "eyebrow"),
          make("appForm", {
            form: s.appForm ?? "",
            heading: true,
            level: main ? "1" : "2",
          }),
        ]),
      );
    case "custom": {
      const width = s.width ?? "normal";
      return done(
        root(
          width === "normal" ? "custom" : `custom-${width}`,
          fromBlocks(make, s.blocks ?? []),
        ),
      );
    }
    case "text":
    case "cta":
    default: {
      if (s.type === "text" && s.variant === "notice")
        return done(
          root(
            "notice",
            [
              make(
                "box",
                { variant: "notice" },
                [
                  make("icon", { icon: "rw:info", variant: "plain", size: 16 }),
                  make("box", { variant: "plain" }, [
                    s.title &&
                      (main
                        ? heading(s.title, 1)
                        : text(s.title, "lead", { name: "Title" })),
                    s.body && text(s.body, "body"),
                  ]),
                ],
                { style: { direction: "row", gap: 12, align: "start" } },
              ),
            ],
            {
              style: { padding: [0, 16, 56, 16] },
              tablet: { padding: [0, 20, 56, 20] },
              mobile: { padding: [0, 20, 32, 20] },
              x: 16,
              fixedAlign: true,
            },
          ),
        );
      return done(
        root(
          "rich",
          [
            ...headingParts(),
            actions([
              s.buttonLabel && button(s.buttonLabel, s.buttonUrl, "primary"),
              s.secondaryLabel &&
                button(s.secondaryLabel, s.secondaryUrl ?? "", "secondary"),
            ]),
          ],
          { mobile: { padding: [45, 0, 45, 0] } },
        ),
      );
    }
  }
}

/** A custom section's old blocks as block nodes. */
function fromBlocks(make: Make, blocks: Block[]): Node[] {
  return blocks.flatMap((b): Node[] => {
    switch (b.type) {
      case "heading":
        return [
          make(
            "heading",
            {
              text: b.text,
              level: b.size === "lg" || b.size === "xl" ? "2" : "3",
            },
            undefined,
            b.size === "xl"
              ? { style: { fontSize: "4xl" } }
              : b.size === "sm"
                ? { style: { fontSize: "17" } }
                : undefined,
          ),
        ];
      case "text":
        return [
          make("text", { text: b.text, variant: "body" }, undefined, {
            style: {
              fontSize: { sm: "12", md: "14", lg: "17", xl: "21" }[b.size],
            },
          }),
        ];
      case "button":
        return [
          make("button", {
            label: b.text,
            url: b.url,
            variant: b.variant,
            size: "md",
            icon: b.variant === "link" ? "" : "arrowUpRight",
          }),
        ];
      case "image":
        return [
          make(
            "image",
            { src: b.image, alt: b.alt, fit: "cover", ratio: "auto" },
            undefined,
            b.height ? { style: { height: b.height } } : undefined,
          ),
        ];
      case "spacer":
        return [make("spacer", {}, undefined, { style: { height: b.height } })];
      case "divider":
        return [make("divider")];
      case "columns":
        return [
          make(
            "columns",
            {},
            b.children.map((c) =>
              make("column", {}, fromBlocks(make, c.children)),
            ),
            {
              style: {
                columns: Math.max(1, Math.min(4, b.children.length)),
                gap: 32,
                align: "stretch",
              },
            },
          ),
        ];
      default:
        return [];
    }
  });
}

// ------------------------------------------------------------ smart blocks

/** Smart blocks that convert to form and repeat blocks (phases 3–4). */
const SMART = new Set<NodeType>([
  "appForm",
  "contactForm",
  "newsletter",
  "collectionList",
]);
const str = (v: unknown) => (typeof v === "string" ? v : "");
/** The block's own place: id, name, styles, visibility, logic. */
const own = (n: Node): Partial<Node> => {
  const out: Partial<Node> = { id: n.id };
  for (const key of [
    "name",
    "style",
    "tablet",
    "mobile",
    "hidden",
    "locked",
    "on",
    "when",
  ] as const)
    if (n[key] !== undefined) (out as Record<string, unknown>)[key] = n[key];
  return out;
};
/** Gives a converted tree ids derived from the block it replaces. */
function reId(nodes: Node[], base: string) {
  let i = 0;
  for (const n of walk(nodes)) n.id = `${base}-c${(i++).toString(36)}`;
  return nodes;
}
function block(
  type: NodeType,
  props: Props = {},
  children?: Node[],
  extra: Partial<Node> = {},
): Node {
  const def = BLOCKS[type];
  return {
    id: "",
    type,
    props: { ...def.props(), ...props },
    ...(def.container ? { children: children ?? [] } : {}),
    ...extra,
  };
}
const whenSet = (source: string): Condition => ({
  match: "all",
  rules: [{ if: "item", field: source, op: "set" }],
});

/**
 * An app form block as a form block with the classic look: the form's own
 * blocks (forms/sync.ts formChildren), worded as the classic form is, with
 * its title and intro first.
 */
function appFormBlock(n: Node, project: Project): Node | undefined {
  const app = project.app;
  const form = app?.forms.find((f) => f.id === str(n.props.form));
  const table = form && app && tableOf(app, form.table);
  if (!app || !form || !table) return undefined;
  const link = appLinks(app, project.pages, form, (url) => url).lookup;
  const kids = formChildren(
    app,
    form,
    link && { url: link.href, label: link.label },
  );
  const who = form.kind === "submit" ? identityField(app, form) : undefined;
  const cart =
    form.kind === "submit" &&
    form.fields.some((id) => fieldOf(table, id)?.type === "items");
  const flow = !!who && !!form.steps && !cart;
  // The classic form's words where the blocks' defaults differ.
  for (const k of walk(kids)) {
    const action = str(k.props.action);
    if (k.type === "submit" && action === "again")
      k.props.label = flow
        ? "Record another"
        : cart
          ? "Place another order"
          : "Send another";
    if (k.type === "submit" && who && !flow && action === "confirm")
      k.props.label = "Yes, that’s me";
    if (k.type === "submit" && who && !flow && action === "change")
      k.props.label = `No, change ${who.name.toLowerCase()}`;
    if (k.type === "submit" && cart && action === "submit" && !form.button)
      k.props.label = "Place order";
    if (k.type === "formSuccess" && flow)
      for (const h of k.children ?? [])
        if (h.type === "heading")
          h.props.text = form.copy?.doneTitle?.trim() || "Sent";
  }
  const crumbs = !!(form.steps || form.highlight);
  const heading = n.props.heading !== false;
  const top: Node[] = heading
    ? [
        block("heading", {
          text: form.title,
          level: str(n.props.level) === "1" ? "1" : "2",
          part: "title",
        }),
        ...(!crumbs && form.intro
          ? [
              block("text", {
                text: form.intro,
                variant: "lead",
                part: "intro",
              }),
            ]
          : []),
      ]
    : [];
  return {
    ...own(n),
    type: "form",
    props: { form: form.id, look: "classic" },
    children: reId([...top, ...kids], n.id),
  } as Node;
}

/** A Contact or Email signup block as an inbox form block. */
function inboxBlock(n: Node): Node {
  const form = inboxFormNode(
    n.type === "newsletter" ? "newsletter" : "contact",
    n.id,
    str(n.props.label),
    str(n.props.action),
  );
  return { ...form, ...own(n), type: "form" } as Node;
}

/**
 * A collection list as a repeat with the classic card (look "listing"):
 * photo, title and price, subtitle and summary, the whole card linking to
 * the item's page (or a call-to-action link). Parts show only when the item
 * has them, as the classic cards do.
 */
function listingBlock(n: Node, project: Project): Node | undefined {
  const c = project.collections?.find((x) => x.id === str(n.props.collection));
  if (!c) return undefined;
  const d = c.display;
  const field = (id: string) => `field:${id}`;
  const text = (name: string, source: string, variant = "body") =>
    block("text", { text: "", variant }, undefined, {
      name,
      bind: { text: source },
      when: whenSet(source),
    });
  const copy = block(
    "box",
    { variant: "plain" },
    [
      block(
        "row",
        {},
        [
          block("heading", { text: "", level: "3" }, undefined, {
            bind: { text: "item:title" },
          }),
          ...(d.price ? [text("Price", field(d.price))] : []),
        ],
        { name: "Title" },
      ),
      ...(d.subtitle ? [text("Subtitle", field(d.subtitle), "eyebrow")] : []),
      ...(d.summary && d.summary !== d.subtitle
        ? [text("Summary", field(d.summary))]
        : []),
    ],
    { name: "Copy" },
  );
  const card = block(
    "box",
    { variant: "plain" },
    [
      ...(d.image
        ? [
            block(
              "image",
              { src: "", alt: "", fit: "cover", ratio: "auto" },
              undefined,
              {
                bind: { src: field(d.image), alt: "item:title" },
                when: whenSet(field(d.image)),
              },
            ),
          ]
        : []),
      copy,
      ...(!c.itemPages && d.action && d.actionLabel
        ? [
            block(
              "button",
              {
                label: d.actionLabel,
                url: "",
                variant: "link",
                size: "md",
                icon: "arrow",
              },
              undefined,
              {
                bind: { url: field(d.action) },
                when: whenSet(field(d.action)),
              },
            ),
          ]
        : []),
    ],
    {
      name: "Card",
      ...(c.itemPages ? { bind: { link: "item:link" } } : {}),
    },
  );
  const columns = Math.max(
    1,
    Math.min(4, typeof n.props.columns === "number" ? n.props.columns : 3),
  );
  const limit =
    typeof n.props.limit === "number" ? Math.max(0, n.props.limit) : 0;
  const base = own(n);
  return {
    ...base,
    type: "repeat",
    props: {
      ...BLOCKS.repeat.props(),
      source: `collection:${c.id}`,
      layout: str(n.props.style) === "list" ? "list" : "grid",
      limit,
      look: "listing",
    },
    style: { ...base.style, columns },
    children: reId([card], n.id),
  } as Node;
}

/** A smart block as form or repeat blocks; the same block when it can't be. */
function fromSmart(n: Node, project: Project): Node {
  switch (n.type) {
    case "appForm":
      return appFormBlock(n, project) ?? n;
    case "contactForm":
    case "newsletter":
      return inboxBlock(n);
    case "collectionList":
      return listingBlock(n, project) ?? n;
    default:
      return n;
  }
}
/** Whether a tree still holds a smart block that converts. */
const hasSmart = (root: Node | undefined) =>
  !!root && [...walk([root])].some((n) => SMART.has(n.type));

/**
 * A blocks section with its app form, contact, signup and collection list
 * blocks converted (phases 3–4). Ids come from the replaced blocks, so
 * converting again changes nothing; a tree that wouldn't validate stays.
 */
export function upgradeSmart(s: Section, project: Project): Section {
  if (s.type !== "blocks" || !hasSmart(s.root)) return s;
  const visit = (n: Node): Node => {
    if (SMART.has(n.type)) return fromSmart(n, project);
    if (!n.children) return n;
    const kids = n.children.map(visit);
    return kids.some((c, i) => c !== n.children![i])
      ? { ...n, children: kids }
      : n;
  };
  const root = visit(s.root!);
  return root !== s.root && rootValid(root) ? { ...s, root } : s;
}

/** Whether any section (saved ones included) still has a classic type. */
export const needsUpgrade = (p: Project) =>
  [
    ...p.header,
    ...p.pages.flatMap((pg) => pg.sections),
    ...p.footer,
    ...(p.savedSections ?? []),
  ].some((s) => s.type !== "blocks" || hasSmart(s.root));

/**
 * The project with every classic section converted to blocks (header,
 * pages, footer and saved sections). Unchanged when there is nothing to do.
 */
export function upgradeProject<T extends Project>(p: T): T {
  if (!needsUpgrade(p)) return p;
  // Classic sections first, then the smart blocks in them (and in sections
  // converted earlier), against the project as it is now.
  let changed = false;
  const convert = (list: Section[]) => {
    const next = list.map((s) => upgradeSmart(toBlocks(s, p), p));
    if (next.some((s, i) => s !== list[i])) changed = true;
    return next;
  };
  const next = {
    ...p,
    header: convert(p.header),
    footer: convert(p.footer),
    pages: p.pages.map((pg) => ({ ...pg, sections: convert(pg.sections) })),
    ...(p.savedSections ? { savedSections: convert(p.savedSections) } : {}),
  };
  // Blocks that can't convert (their form or collection is gone) stay as they are.
  return changed ? next : p;
}
