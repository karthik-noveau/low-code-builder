/**
 * Prebuilt data sections (category "data" in ../presets.ts): a product grid,
 * a priced menu, listing cards, a leaderboard, a row of live figures, a
 * monthly chart and a recent-orders table. Each picks the site's fitting
 * collection or app figures when it has them, and binds its card to the
 * collection's fields; app lists start empty with a suggestion
 * (`suggest`), which the Data tab turns into a draft view in one click.
 */
import type { Project } from "../../studio/model";
import type { Collection } from "../../studio/collections";
import {
  appId,
  CONTACT_TYPES,
  fieldOf,
  type App,
  type AppView,
} from "../../apps/model";
import { createNode } from "../registry";
import type { Binding, Node, NodeType, Props, Style } from "../model";
import type { Preset } from "../presets";

function n(
  type: NodeType,
  props: Props = {},
  style?: Style,
  children?: Node[],
  bind?: Binding,
): Node {
  const node = createNode(type, props);
  if (style) node.style = { ...node.style, ...style };
  if (children) node.children = children;
  if (bind && Object.keys(bind).length) node.bind = bind;
  return node;
}
const section = (children: Node[], props: Props = {}, style: Style = {}) => {
  const s = n(
    "section",
    props,
    { padding: [88, 24, 88, 24], gap: 40, ...style },
    children,
  );
  s.mobile = { padding: [64, 18, 64, 18], gap: 28 };
  return s;
};
function intro(
  eyebrow: string,
  title: string,
  lead = "",
  align: "center" | "left" = "center",
) {
  return n(
    "box",
    { variant: "plain" },
    { gap: 12, maxWidth: 680, textAlign: align },
    [
      n("text", { text: eyebrow, variant: "eyebrow" }),
      n("heading", { text: title, level: "2" }),
      ...(lead ? [n("text", { text: lead, variant: "lead" })] : []),
    ],
  );
}
const field = (id: string | undefined) => (id ? `field:${id}` : undefined);
const binds = (map: Record<string, string | undefined>): Binding =>
  Object.fromEntries(
    Object.entries(map).filter((e): e is [string, string] => !!e[1]),
  );
/** The "When empty" box every repeat carries. */
const whenEmpty = (line: string) =>
  n(
    "box",
    { variant: "plain", slot: "empty" },
    { padding: [24, 0, 24, 0], align: "center" },
    [
      n(
        "text",
        { text: line, variant: "body" },
        { color: "muted", textAlign: "center" },
      ),
    ],
  );
const repeat = (
  source: string,
  props: Props,
  style: Style,
  card: Node,
  empty: string,
) => {
  const r = n("repeat", { source, ...props }, style, [card, whenEmpty(empty)]);
  r.children![0].name = "Card";
  r.children![1].name = "When empty";
  return r;
};
const phone = (node: Node, mobile: Style) => {
  node.mobile = mobile;
  return node;
};
/** The site's collection made from one of `blueprints`, else its first. */
const collectionFor = (
  project: Project,
  ...blueprints: string[]
): Collection | undefined =>
  project.collections?.find((c) => blueprints.includes(c.blueprint)) ??
  (blueprints.includes("*") ? project.collections?.[0] : undefined);

/** A first draft of an app list for a suggestion: owner-safe fields only. */
export function suggestedView(app: App, kind: string): AppView | undefined {
  if (kind === "leaderboard") {
    // A people table with a summed total, e.g. Customers by total reward.
    const table =
      app.tables.find((t) => t.totals.some((x) => x.op === "sum")) ??
      app.tables.find((t) => t.totals.length);
    const total = table?.totals.find((x) => x.op === "sum") ?? table?.totals[0];
    if (!table || !total) return;
    const title = fieldOf(table, table.titleField);
    return {
      id: appId(),
      name: `Top ${table.name.toLowerCase()}`,
      table: table.id,
      fields: [table.titleField, total.id],
      ...(title && ["text", "link"].includes(title.type)
        ? { initials: [table.titleField] }
        : {}),
      statuses: [],
      sort: total.id,
      order: "desc",
      limit: 10,
      public: false,
    };
  }
  if (kind === "recent") {
    // A table with a workflow, e.g. orders or bookings, newest first.
    const table = app.tables.find((t) => t.statuses.length) ?? app.tables[0];
    if (!table) return;
    const safe = table.fields.filter(
      (f) =>
        !CONTACT_TYPES.includes(f.type) &&
        f.type !== "longText" &&
        f.id !== table.titleField &&
        !f.ownerOnly,
    );
    const title = fieldOf(table, table.titleField);
    const fields = [
      ...(title && !CONTACT_TYPES.includes(title.type) ? [title.id] : []),
      ...safe
        .filter((f) =>
          ["items", "item", "money", "date", "choice"].includes(f.type),
        )
        .slice(0, 3)
        .map((f) => f.id),
      ...(table.statuses.length ? ["status"] : []),
    ];
    return {
      id: appId(),
      name: `Recent ${table.name.toLowerCase()}`,
      table: table.id,
      fields: fields.length ? fields.slice(0, 5) : [table.titleField],
      ...(title && ["text", "link"].includes(title.type)
        ? { initials: [table.titleField] }
        : {}),
      statuses: [],
      sort: "",
      limit: 20,
      public: false,
    };
  }
}

export const DATA_PRESETS: Preset[] = [
  {
    id: "data-products",
    name: "Product grid",
    category: "data",
    description:
      "Your products as photo cards with prices, each linking to its page",
    build: ({ project }) => {
      const c = collectionFor(project, "products", "*");
      const d = c?.display;
      const card = n(
        "box",
        { variant: "card" },
        { gap: 8, padding: [0, 0, 20, 0] },
        [
          n(
            "image",
            { src: "/images/plant-1.jpg", alt: "Product photo", ratio: "1/1" },
            undefined,
            undefined,
            binds({ src: field(d?.image), alt: "item:title" }),
          ),
          n(
            "heading",
            { text: "Product name", level: "3" },
            { fontSize: "lg", padding: [8, 20, 0, 20] },
            undefined,
            binds({ text: c ? "item:title" : undefined }),
          ),
          n(
            "text",
            { text: "₹0", variant: "body" },
            { fontWeight: 600, color: "accent", padding: [0, 20, 0, 20] },
            undefined,
            binds({ text: field(d?.price) }),
          ),
          n(
            "text",
            { text: "A short description.", variant: "small" },
            { color: "muted", padding: [0, 20, 0, 20] },
            undefined,
            binds({ text: field(d?.summary) }),
          ),
        ],
        binds({
          link: c && (c.itemPages || d?.action) ? "item:link" : undefined,
        }),
      );
      return section([
        intro("Shop", "Our products", "Fresh from the shelf, picked by hand."),
        phone(
          repeat(
            c ? `collection:${c.id}` : "",
            { layout: "grid", label: "Products" },
            { columns: 3, gap: 24 },
            card,
            "New products are on their way.",
          ),
          { columns: 2, gap: 12 },
        ),
      ]);
    },
  },
  {
    id: "data-menu",
    name: "Menu with prices",
    category: "data",
    description:
      "Dishes in a tidy list: name and description, price on the right",
    build: ({ project }) => {
      const c = collectionFor(project, "menu", "services", "*");
      const d = c?.display;
      const card = n(
        "box",
        { variant: "plain" },
        {
          direction: "row",
          justify: "between",
          align: "start",
          gap: 16,
          padding: [16, 0, 16, 0],
        },
        [
          n("box", { variant: "plain" }, { gap: 4 }, [
            n(
              "heading",
              { text: "Dish name", level: "3" },
              { fontSize: "lg" },
              undefined,
              binds({ text: c ? "item:title" : undefined }),
            ),
            n(
              "text",
              { text: "What’s in it.", variant: "small" },
              { color: "muted" },
              undefined,
              binds({ text: field(d?.summary) }),
            ),
          ]),
          n(
            "text",
            { text: "₹0", variant: "body" },
            { fontWeight: 700, color: "accent" },
            undefined,
            binds({ text: field(d?.price) }),
          ),
        ],
      );
      const list = repeat(
        c ? `collection:${c.id}` : "",
        { layout: "list", label: c?.name ?? "Menu" },
        { gap: 0 },
        card,
        "The menu is being written. Ask us what’s cooking today.",
      );
      return section(
        [
          intro("Menu", "Today’s menu", "Cooked fresh every morning."),
          n("box", { variant: "plain" }, { maxWidth: 760, width: "full" }, [
            list,
          ]),
        ],
        {},
        { align: "center" },
      );
    },
  },
  {
    id: "data-listings",
    name: "Listing cards",
    category: "data",
    description:
      "Properties, events or services as cards with a photo, details and a button",
    build: ({ project }) => {
      const c = collectionFor(
        project,
        "properties",
        "events",
        "services",
        "jobs",
        "*",
      );
      const d = c?.display;
      const card = n(
        "box",
        { variant: "card" },
        { gap: 10, padding: [0, 0, 22, 0] },
        [
          n(
            "image",
            {
              src: "/images/interior.jpg",
              alt: "Listing photo",
              ratio: "16/10",
            },
            undefined,
            undefined,
            binds({ src: field(d?.image), alt: "item:title" }),
          ),
          n(
            "text",
            { text: "Location", variant: "eyebrow" },
            { padding: [6, 22, 0, 22] },
            undefined,
            binds({ text: field(d?.subtitle) }),
          ),
          n(
            "heading",
            { text: "Listing title", level: "3" },
            { fontSize: "xl", padding: [0, 22, 0, 22] },
            undefined,
            binds({ text: c ? "item:title" : undefined }),
          ),
          n(
            "text",
            { text: "₹0", variant: "body" },
            { fontWeight: 600, padding: [0, 22, 0, 22] },
            undefined,
            binds({ text: field(d?.price) }),
          ),
          n(
            "button",
            {
              label: d?.actionLabel || "View details",
              url: "",
              variant: "secondary",
              size: "sm",
            },
            { margin: [4, 22, 0, 22] },
            undefined,
            binds({
              url: c && (c.itemPages || d?.action) ? "item:link" : undefined,
            }),
          ),
        ],
      );
      return section([
        intro(
          "Listings",
          c?.name ?? "Available now",
          "See something you like? Book a visit today.",
        ),
        repeat(
          c ? `collection:${c.id}` : "",
          { layout: "grid", label: c?.name ?? "Listings" },
          { columns: 3, gap: 24 },
          card,
          "Nothing listed right now. Check back soon.",
        ),
      ]);
    },
  },
  {
    id: "data-leaderboard",
    name: "Leaderboard",
    category: "data",
    description:
      "Your top customers by a total from your app, names shown as “Priya S.”",
    build: () => {
      const rank = n(
        "text",
        { text: "1", variant: "body" },
        { fontSize: "xl", fontWeight: 800, color: "accent", width: 32 },
        undefined,
        { text: "item:index" },
      );
      const name = n(
        "heading",
        { text: "Customer name", level: "3" },
        { fontSize: "lg" },
      );
      const amount = n(
        "text",
        { text: "₹0", variant: "body" },
        { fontWeight: 700, fontSize: "lg" },
      );
      name.name = "Name";
      amount.name = "Total";
      const card = n(
        "box",
        { variant: "card" },
        {
          direction: "row",
          align: "center",
          justify: "between",
          gap: 16,
          padding: [14, 22, 14, 18],
        },
        [
          n(
            "box",
            { variant: "plain" },
            { direction: "row", align: "center", gap: 12 },
            [rank, name],
          ),
          amount,
        ],
      );
      const board = repeat(
        "",
        { layout: "list", label: "Leaderboard", suggest: "leaderboard" },
        { gap: 10 },
        card,
        "The board fills up as customers earn.",
      );
      return section(
        [
          intro(
            "This month",
            "Top customers",
            "Thank you for shopping with us. Here’s who’s leading.",
          ),
          n("box", { variant: "plain" }, { maxWidth: 640, width: "full" }, [
            board,
          ]),
        ],
        { tone: "soft" },
        { align: "center" },
      );
    },
  },
  {
    id: "data-figures",
    name: "Live figures",
    category: "data",
    description: "Three numbers from your app’s dashboard, kept up to date",
    build: ({ project }) => {
      const cards = project.app?.dashboard.cards.slice(0, 3) ?? [];
      const stats = (
        cards.length ? cards.map((c) => `card:${c.id}`) : ["", "", ""]
      ).map((source, i) =>
        n("stat", {
          source,
          label: cards[i]
            ? ""
            : ["Happy customers", "Orders this year", "Rewards paid"][i],
          variant: "card",
        }),
      );
      // A row, so figures share the width (and a hidden one leaves no gap).
      const row = n(
        "row",
        {},
        { gap: 20, align: "stretch", width: "full" },
        stats,
      );
      return section([intro("By the numbers", "Growing with you"), row]);
    },
  },
  {
    id: "data-chart",
    name: "Monthly chart",
    category: "data",
    description:
      "One of your app’s charts with a heading, e.g. rewards paid by month",
    build: ({ project }) => {
      const chart = project.app?.dashboard.charts?.[0];
      return section([
        intro("Every month", "Month by month", "", "left"),
        n(
          "chart",
          { source: chart ? `chart:${chart.id}` : "", title: "", kind: "bar" },
          { maxWidth: 880, width: "full" },
        ),
      ]);
    },
  },
  {
    id: "data-orders",
    name: "Recent orders table",
    category: "data",
    description:
      "A table of recent records with only safe fields; cards on phones",
    build: () =>
      section([
        intro("Live", "Recent orders", "", "left"),
        n(
          "table",
          {
            source: "",
            caption: "Recent orders",
            showCaption: false,
            limit: 10,
            more: true,
            suggest: "recent",
          },
          { width: "full" },
        ),
      ]),
  },
];
