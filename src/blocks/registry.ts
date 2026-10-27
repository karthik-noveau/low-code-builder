/**
 * What each block type is: its name and icon in the Add panel, which blocks
 * it can hold, what a new one starts with, and the fields the Inspector shows
 * on its Content tab. Adding a block type is an entry here plus a case in
 * render.tsx.
 */
import {
  nodeId,
  type Node,
  type NodeType,
  type Props,
  type Style,
} from "./model";
import { DATA_BLOCKS } from "./data/registry";
import { FORM_BLOCKS } from "./forms/registry";
import { LOGIC_BLOCKS } from "./logic/registry";

export type FieldSpec =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | {
      key: string;
      label: string;
      kind: "longText";
      placeholder?: string;
      hint?: string;
    }
  | { key: string; label: string; kind: "link" }
  | { key: string; label: string; kind: "image" }
  | { key: string; label: string; kind: "icon" }
  | { key: string; label: string; kind: "toggle"; hint?: string }
  | {
      key: string;
      label: string;
      kind: "number";
      min: number;
      max: number;
      unit?: string;
    }
  | {
      key: string;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
    }
  /** One entry per line (list items, accordion questions, social links). */
  | { key: string; label: string; kind: "lines"; hint?: string }
  /** One of the site's app forms (an AppForm id). */
  | { key: string; label: string; kind: "appForm" }
  /** One of the site's collections (a Collection id). */
  | { key: string; label: string; kind: "collection" }
  /** Form blocks: the AppForm a form block shows, with "New form…" (forms/FormSettings.tsx). */
  | { key: string; label: string; kind: "form" }
  /** Field blocks: a field of the enclosing form's table (forms/FormSettings.tsx). */
  | { key: string; label: string; kind: "formField" };

export type Category =
  "layout" | "basic" | "media" | "site" | "form" | "data" | "logic";
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "basic", label: "Basic" },
  { id: "media", label: "Media" },
  { id: "site", label: "Site" },
  { id: "form", label: "Form" },
  { id: "data", label: "Forms and data" },
  { id: "logic", label: "Interactive" },
];
/**
 * Classic looks: the styles of the fixed section types sections were built
 * from before blocks (src/blocks/legacy.ts converts them; looks.css draws them).
 */
export const LOOKS = [
  ["announcement", "Announcement bar"],
  ["header", "Header"],
  ["header-brand", "Header with logo lockup"],
  ["hero", "Image banner"],
  ["hero-plain", "Banner without image"],
  ["hero-split", "Banner, image beside"],
  ["hero-badge", "Banner with badge"],
  ["features", "Features row"],
  ["steps", "Numbered cards"],
  ["collection", "Cards with heading"],
  ["gallery", "Gallery"],
  ["image-text", "Image with text"],
  ["testimonials", "Testimonials"],
  ["faq", "Questions and answers"],
  ["contact", "Contact form"],
  ["newsletter", "Email signup"],
  ["listing", "Collection list"],
  ["app", "App form"],
  ["rich", "Text"],
  ["notice", "Notice"],
  ["footer", "Footer"],
  ["footer-centered", "Centred footer"],
  ["custom", "Custom"],
  ["custom-narrow", "Custom, narrow"],
  ["custom-wide", "Custom, wide"],
  ["custom-full", "Custom, full width"],
] as const;

export interface BlockDef {
  label: string;
  icon: string;
  category: Category;
  /** One line for the Add panel. */
  description: string;
  /** Holds children; `accepts` limits which (default: any non-section block). */
  container?: boolean;
  accepts?: NodeType[];
  /** Only inside these parents (a column only in columns). */
  parents?: NodeType[];
  /** Not offered in the Add panel (made by its parent, like column). */
  internal?: boolean;
  /** The text edited in place on the canvas (double-click). */
  inline?: string;
  fields: FieldSpec[];
  props: () => Props;
  style?: () => Style;
  children?: () => Node[];
}

const choice = (...pairs: [string, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));

const text = (value: string, extra: Props = {}): Node => ({
  id: nodeId(),
  type: "text",
  props: { text: value, variant: "body", ...extra },
});
const heading = (value: string): Node => ({
  id: nodeId(),
  type: "heading",
  props: { text: value, level: "3" },
});
const column = (children: Node[] = []): Node => ({
  id: nodeId(),
  type: "column",
  props: {},
  children,
});

export const BLOCKS: Record<NodeType, BlockDef> = {
  section: {
    label: "Section",
    icon: "panel",
    category: "layout",
    description: "A full-width band of the page",
    container: true,
    internal: true,
    fields: [
      {
        key: "tag",
        label: "Landmark",
        kind: "select",
        options: choice(
          ["section", "Section"],
          ["header", "Header"],
          ["footer", "Footer"],
        ),
      },
      {
        key: "tone",
        label: "Colours",
        kind: "select",
        options: choice(
          ["default", "Page colours"],
          ["soft", "Soft band"],
          ["accent", "Accent band"],
          ["dark", "Dark band"],
        ),
      },
      {
        key: "sticky",
        label: "Stick to the top while scrolling",
        kind: "toggle",
      },
      {
        key: "effect",
        label: "Moving background",
        kind: "select",
        options: choice(["none", "None"], ["orbits", "Orbits"]),
      },
      {
        key: "look",
        label: "Classic style",
        kind: "select",
        options: [
          { value: "", label: "None" },
          ...choice(...LOOKS.map(([v, l]) => [v, l] as [string, string])),
        ],
      },
      {
        key: "shade",
        label: "Image shade (classic banner)",
        kind: "number",
        min: 0,
        max: 100,
        unit: "%",
      },
    ],
    props: () => ({ tag: "section", tone: "default" }),
    style: () => ({ padding: [72, 24, 72, 24], gap: 24 }),
  },
  box: {
    label: "Box",
    icon: "panel",
    category: "layout",
    description: "Groups blocks; style it as a card, panel or notice",
    container: true,
    fields: [
      {
        key: "variant",
        label: "Look",
        kind: "select",
        options: choice(
          ["plain", "Plain"],
          ["card", "Card"],
          ["panel", "Panel"],
          ["notice", "Notice"],
          ["accent", "Accent"],
          ["dark", "Dark"],
        ),
      },
      { key: "link", label: "Whole box links to", kind: "link" },
    ],
    props: () => ({ variant: "plain", link: "" }),
    style: () => ({ gap: 12 }),
  },
  row: {
    label: "Row",
    icon: "columns",
    category: "layout",
    description: "Blocks side by side that wrap on small screens",
    container: true,
    fields: [],
    props: () => ({}),
    style: () => ({
      direction: "row",
      gap: 12,
      align: "center",
      wrap: true,
    }),
  },
  columns: {
    label: "Columns",
    icon: "columns",
    category: "layout",
    description: "Two to four columns that stack on phones",
    container: true,
    accepts: ["column"],
    fields: [
      {
        key: "reverse",
        label: "Last column first when stacked",
        kind: "toggle",
        hint: "Keeps an image above its text on phones.",
      },
    ],
    props: () => ({ reverse: false }),
    style: () => ({ columns: 2, gap: 32, align: "start" }),
    children: () => [
      column([
        heading("What you offer"),
        text("A sentence or two about it. Select this text to change it."),
      ]),
      column([
        heading("Why people choose you"),
        text("Another short point. Add images, buttons or lists from Add."),
      ]),
    ],
  },
  column: {
    label: "Column",
    icon: "panel",
    category: "layout",
    description: "One column",
    container: true,
    internal: true,
    parents: ["columns"],
    fields: [],
    props: () => ({}),
    style: () => ({ gap: 12 }),
  },
  grid: {
    label: "Grid",
    icon: "grid",
    category: "layout",
    description: "Cards in a grid, fewer per row on smaller screens",
    container: true,
    fields: [],
    props: () => ({}),
    style: () => ({ columns: 3, gap: 20 }),
  },
  heading: {
    label: "Heading",
    icon: "type",
    category: "basic",
    description: "A title; *stars* colour words in the accent",
    inline: "text",
    fields: [
      {
        key: "text",
        label: "Text",
        kind: "longText",
        hint: "**bold**, __italic__, [words](/page), *accent*. Or select words while typing on the page.",
      },
      {
        key: "level",
        label: "Level",
        kind: "select",
        options: choice(
          ["1", "Page title (H1)"],
          ["2", "Section title (H2)"],
          ["3", "Subheading (H3)"],
          ["4", "Small heading (H4)"],
        ),
      },
    ],
    props: () => ({ text: "A clear, short heading", level: "2" }),
  },
  text: {
    label: "Text",
    icon: "edit",
    category: "basic",
    description: "A paragraph, a lead line or a small label",
    inline: "text",
    fields: [
      {
        key: "text",
        label: "Text",
        kind: "longText",
        hint: "**bold**, __italic__, [words](/page). Or select words while typing on the page.",
      },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: choice(
          ["body", "Paragraph"],
          ["lead", "Lead (larger)"],
          ["small", "Small"],
          ["eyebrow", "Label above a heading"],
          ["muted", "Muted"],
        ),
      },
    ],
    props: () => ({
      text: "Say what you offer and why it matters, in a sentence or two.",
      variant: "body",
    }),
  },
  button: {
    label: "Button",
    icon: "arrowUpRight",
    category: "basic",
    description: "A link styled as a button",
    inline: "label",
    fields: [
      { key: "label", label: "Label", kind: "text" },
      { key: "url", label: "Goes to", kind: "link" },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: choice(
          ["primary", "Filled"],
          ["secondary", "Outlined"],
          ["ghost", "Soft"],
          ["link", "Text link"],
        ),
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: choice(["sm", "Small"], ["md", "Medium"], ["lg", "Large"]),
      },
      { key: "icon", label: "Icon after the label", kind: "icon" },
      { key: "iconStart", label: "Icon before the label", kind: "icon" },
      { key: "newTab", label: "Open in a new tab", kind: "toggle" },
    ],
    props: () => ({
      label: "Get started",
      url: "",
      variant: "primary",
      size: "md",
      icon: "",
      newTab: false,
    }),
  },
  image: {
    label: "Image",
    icon: "image",
    category: "basic",
    description: "A photo or illustration",
    fields: [
      { key: "src", label: "Image", kind: "image" },
      {
        key: "alt",
        label: "Description for screen readers",
        kind: "text",
        placeholder: "What the image shows",
      },
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: choice(
          ["cover", "Fill the frame"],
          ["contain", "Show it all"],
        ),
      },
      {
        key: "ratio",
        label: "Shape",
        kind: "select",
        options: choice(
          ["auto", "Original"],
          ["1/1", "Square"],
          ["4/3", "4:3"],
          ["16/9", "Wide 16:9"],
          ["3/4", "Portrait 3:4"],
        ),
      },
      { key: "link", label: "Links to", kind: "link" },
    ],
    props: () => ({ src: "", alt: "", fit: "cover", ratio: "auto", link: "" }),
    style: () => ({ radius: "theme" }),
  },
  icon: {
    label: "Icon",
    icon: "sparkles",
    category: "basic",
    description: "A line icon, optionally in a tile",
    fields: [
      { key: "icon", label: "Icon", kind: "icon" },
      {
        key: "variant",
        label: "Look",
        kind: "select",
        options: choice(
          ["plain", "Plain"],
          ["tile", "Tile"],
          ["circle", "Circle"],
        ),
      },
      {
        key: "size",
        label: "Size",
        kind: "number",
        min: 12,
        max: 96,
        unit: "px",
      },
    ],
    props: () => ({ icon: "sparkles", variant: "tile", size: 22 }),
  },
  list: {
    label: "List",
    icon: "checklist",
    category: "basic",
    description: "Points with ticks, bullets or numbers",
    fields: [
      {
        key: "items",
        label: "Points",
        kind: "lines",
        hint: "One per line. **bold**, __italic__, [words](/page).",
      },
      {
        key: "marker",
        label: "Marker",
        kind: "select",
        options: choice(
          ["check", "Ticks"],
          ["bullet", "Bullets"],
          ["number", "Numbers"],
        ),
      },
    ],
    props: () => ({
      items: ["Free delivery over ₹999", "Easy returns", "Support on WhatsApp"],
      marker: "check",
    }),
    style: () => ({ gap: 10 }),
  },
  badge: {
    label: "Badge",
    icon: "tag",
    category: "basic",
    description: "A small pill label",
    inline: "text",
    fields: [
      { key: "text", label: "Text", kind: "text" },
      { key: "icon", label: "Icon", kind: "icon" },
      {
        key: "variant",
        label: "Look",
        kind: "select",
        options: choice(
          ["soft", "Soft"],
          ["solid", "Solid"],
          ["outline", "Outline"],
        ),
      },
    ],
    props: () => ({ text: "New", icon: "", variant: "soft" }),
  },
  divider: {
    label: "Divider",
    icon: "minus",
    category: "basic",
    description: "A thin line between blocks",
    fields: [],
    props: () => ({}),
    style: () => ({ margin: [8, 0, 8, 0] }),
  },
  spacer: {
    label: "Spacer",
    icon: "panel",
    category: "basic",
    description: "Empty space",
    fields: [],
    props: () => ({}),
    style: () => ({ height: 32 }),
  },
  video: {
    label: "Video",
    icon: "eye",
    category: "media",
    description: "A YouTube or Vimeo video",
    fields: [
      {
        key: "url",
        label: "YouTube or Vimeo link",
        kind: "text",
        placeholder: "https://www.youtube.com/watch?v=…",
      },
      { key: "title", label: "Title for screen readers", kind: "text" },
    ],
    props: () => ({ url: "", title: "Video" }),
    style: () => ({ radius: "theme" }),
  },
  map: {
    label: "Map",
    icon: "globe",
    category: "media",
    description: "A map of your address",
    fields: [
      {
        key: "address",
        label: "Address",
        kind: "text",
        placeholder: "12 MG Road, Bengaluru",
      },
      { key: "zoom", label: "Zoom", kind: "number", min: 3, max: 20 },
    ],
    props: () => ({ address: "", zoom: 15 }),
    style: () => ({ height: 320, radius: "theme" }),
  },
  logo: {
    label: "Logo",
    icon: "store",
    category: "site",
    description: "Your logo and site name, linking home",
    fields: [
      { key: "text", label: "Name", kind: "text" },
      { key: "tagline", label: "Second line", kind: "text" },
      { key: "image", label: "Logo image", kind: "image" },
      { key: "mark", label: "Show the logo mark", kind: "toggle" },
      { key: "dot", label: "Dot after the name", kind: "toggle" },
    ],
    props: () => ({ text: "", tagline: "", image: "", mark: true, dot: true }),
  },
  menu: {
    label: "Menu",
    icon: "menu",
    category: "site",
    description: "Links to your pages; a menu button on phones",
    fields: [
      {
        key: "source",
        label: "Links",
        kind: "select",
        options: choice(["pages", "Every page"], ["custom", "Chosen links"]),
      },
      {
        key: "links",
        label: "Chosen links",
        kind: "lines",
        hint: "One per line: Label | /page or https://…",
      },
      {
        key: "variant",
        label: "Look",
        kind: "select",
        options: choice(
          ["plain", "Plain"],
          ["pill", "Current page as a pill"],
          ["underline", "Current page underlined"],
          ["inline", "Links in a row, no menu button"],
          ["stack", "Links in a column (footers)"],
        ),
      },
    ],
    props: () => ({ source: "pages", links: [], variant: "plain" }),
  },
  themeToggle: {
    label: "Theme switch",
    icon: "moon",
    category: "site",
    description: "Lets visitors switch between light and dark",
    fields: [],
    props: () => ({}),
  },
  accordion: {
    label: "Accordion",
    icon: "help",
    category: "site",
    description: "Questions that open to show their answers",
    fields: [
      {
        key: "items",
        label: "Questions and answers",
        kind: "lines",
        hint: "One per line: Question | Answer",
      },
    ],
    props: () => ({
      items: [
        "Do you deliver? | Yes, across the city within two days.",
        "Can I return an item? | Within 7 days, unused and with the bill.",
      ],
    }),
  },
  social: {
    label: "Social links",
    icon: "globe",
    category: "site",
    description: "Links to your Instagram, WhatsApp and more",
    fields: [
      {
        key: "links",
        label: "Links",
        kind: "lines",
        hint: "One per line: Instagram | https://instagram.com/…",
      },
    ],
    props: () => ({ links: [] }),
    style: () => ({ gap: 12 }),
  },
  tabBar: {
    label: "Phone tab bar",
    icon: "menu",
    category: "site",
    description: "Navigation along the bottom of the screen on phones",
    fields: [
      {
        key: "tabs",
        label: "Tabs",
        kind: "lines",
        hint: "One per line: Label | /page | icon. Empty: every page.",
      },
    ],
    props: () => ({ tabs: [] }),
  },
  contactForm: {
    label: "Contact form",
    icon: "mail",
    category: "data",
    description: "Name, email and message, sent to your Inbox",
    fields: [
      { key: "label", label: "Button", kind: "text" },
      {
        key: "action",
        label: "Send to another address (optional)",
        kind: "text",
        placeholder: "https://… your own form endpoint",
      },
    ],
    props: () => ({ label: "Send message", action: "" }),
  },
  newsletter: {
    label: "Email signup",
    icon: "send",
    category: "data",
    description: "An email box and button, sent to your Inbox",
    fields: [
      { key: "label", label: "Button", kind: "text" },
      {
        key: "action",
        label: "Send to another address (optional)",
        kind: "text",
        placeholder: "https://… your own form endpoint",
      },
    ],
    props: () => ({ label: "Subscribe", action: "" }),
  },
  appForm: {
    label: "App form",
    icon: "activity",
    category: "data",
    description: "A form or lookup from your business app",
    fields: [
      { key: "form", label: "Form", kind: "appForm" },
      {
        key: "heading",
        label: "Show the form’s title and intro",
        kind: "toggle",
      },
      {
        key: "level",
        label: "Title level",
        kind: "select",
        options: choice(["1", "Page title (H1)"], ["2", "Section title (H2)"]),
      },
    ],
    props: () => ({ form: "", heading: true, level: "2" }),
  },
  collectionList: {
    label: "Collection list",
    icon: "grid",
    category: "data",
    description:
      "A collection’s items as cards or a list, linking to their pages",
    fields: [
      { key: "collection", label: "Collection", kind: "collection" },
      {
        key: "style",
        label: "Show as",
        kind: "select",
        options: choice(["grid", "Cards"], ["list", "List"]),
      },
      {
        key: "columns",
        label: "Cards per row",
        kind: "number",
        min: 1,
        max: 4,
      },
      {
        key: "limit",
        label: "How many (0: all)",
        kind: "number",
        min: 0,
        max: 100,
      },
    ],
    props: () => ({ collection: "", style: "grid", columns: 3, limit: 0 }),
  },
  products: {
    label: "Products",
    icon: "store",
    category: "data",
    description:
      "Product cards; Forma Store fills in your products when you publish",
    container: true,
    accepts: ["box"],
    fields: [],
    props: () => ({}),
    style: () => ({ columns: 3, gap: 20 }),
  },
  ...DATA_BLOCKS,
  ...FORM_BLOCKS,
  ...LOGIC_BLOCKS,
};

/** A new block with its defaults (and default children, with fresh ids). */
export function createNode(type: NodeType, props: Props = {}): Node {
  const def = BLOCKS[type];
  const children = def.children?.() ?? (def.container ? [] : undefined);
  return {
    id: nodeId(),
    type,
    props: { ...def.props(), ...props },
    ...(def.style ? { style: def.style() } : {}),
    ...(children ? { children } : {}),
  };
}
/** Whether `child` may go directly inside `parent`. */
export function canHold(parent: NodeType, child: NodeType) {
  const def = BLOCKS[parent];
  if (!def.container || child === "section") return false;
  // A dialog opens on its own, never from inside another one.
  if (child === "dialog" && parent === "dialog") return false;
  if (def.accepts) return def.accepts.includes(child);
  const only = BLOCKS[child].parents;
  return !only || only.includes(parent);
}
export const nodeLabel = (n: Node) => n.name || BLOCKS[n.type].label;
