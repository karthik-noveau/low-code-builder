import { validateCollections, type Collection } from "./collections";
import { validatePayments, type PaymentSettings } from "./payments";
import { validateApp, type App } from "../apps/model";
import type { Node } from "../blocks/model";
import {
  mapNodeLinks,
  nodeImages,
  replaceNodeImages,
  rootValid,
} from "../blocks/validate";
import { variablesValid, type PageVariable } from "../blocks/logic/model";
export type SectionType =
  | "announcement"
  | "header"
  | "hero"
  | "products"
  | "features"
  | "imageText"
  | "gallery"
  | "testimonials"
  | "faq"
  | "contact"
  | "newsletter"
  | "footer"
  | "text"
  | "cta"
  | "custom"
  | "collection"
  | "app"
  | "blocks";
export type BlockType =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "spacer"
  | "divider"
  | "columns"
  | "column";
export interface Block {
  id: string;
  type: BlockType;
  text: string;
  url: string;
  image: string;
  alt: string;
  size: "sm" | "md" | "lg" | "xl";
  variant: "primary" | "secondary" | "link";
  height: number;
  children: Block[];
}
export type Device = "desktop" | "tablet" | "mobile";
export interface DeviceOverrides {
  padding?: number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
}
export type Animation = "none" | "fade" | "rise" | "zoom";
/** How a "collection" section lists a collection. */
export interface Listing {
  collection: string;
  style: "grid" | "list";
  columns: number;
  limit: number;
}
/** Every site template; projects remember which one they started from. */
export const TEMPLATE_IDS = [
  "botanical",
  "folio",
  "studio",
  "table",
  "volt",
  "dhanlaxmi",
  "glow",
  "fixright",
  "brightminds",
  "pulse",
  "freshbasket",
  "blank",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export interface Item {
  id: string;
  title: string;
  body: string;
  image: string;
  price: string;
  url: string;
  /** A features item's icon (one of FEATURE_ICONS); the section's default otherwise. */
  icon?: string;
}
/** Icons owners can pick for a features item. */
export const FEATURE_ICONS = [
  "leaf",
  "truck",
  "heart",
  "phone",
  "receipt",
  "bell",
  "wallet",
  "zap",
  "check",
  "lock",
  "users",
  "tag",
  "mail",
  "sparkles",
  "store",
  "globe",
  "home",
] as const;
export interface Section {
  id: string;
  type: SectionType;
  name: string;
  title: string;
  eyebrow: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  image: string;
  imageAlt: string;
  background: string;
  color: string;
  align: "left" | "center" | "right";
  layout: "cover" | "split";
  padding: number;
  height: number;
  overlay: number;
  hidden: boolean;
  items: Item[];
  formAction: string;
  blocks?: Block[];
  width?: "narrow" | "normal" | "wide" | "full";
  responsive?: Partial<Record<Exclude<Device, "desktop">, DeviceOverrides>>;
  animation?: Animation;
  listing?: Listing;
  /** The app form an "app" section shows (an AppForm id). */
  appForm?: string;
  /** A second, outlined button (hero and call to action). */
  secondaryLabel?: string;
  secondaryUrl?: string;
  /** A small reassuring line under the buttons (hero). */
  note?: string;
  /** A moving background (hero): orange orbits with travelling lights. */
  effect?: "none" | "orbits";
  /** A different look for the same content; see SECTION_VARIANTS. */
  variant?: string;
  /** A "blocks" section's tree: a section node and everything in it. */
  root?: Node;
}
/**
 * Looks a section can take. header "brand": a logo mark, the title over the
 * eyebrow as a two-line wordmark, the current page as a filled pill and a
 * light/dark switch. hero "badge": the eyebrow as a pill. features "cards":
 * numbered cards with icon tiles under a left-aligned heading. text "notice":
 * an information box. footer "centered": the page links and the button link
 * centred over the site name.
 */
export const SECTION_VARIANTS: Partial<Record<SectionType, string[]>> = {
  header: ["brand"],
  hero: ["badge"],
  features: ["cards"],
  text: ["notice"],
  footer: ["centered"],
};
/**
 * Link targets the publisher fills in: OWNER_LINK becomes the site owner's
 * branded app (sign-in, dashboard, approvals) for this site.
 */
export const OWNER_LINK = "{owner}";
export interface Page {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string;
  sections: Section[];
  /** Values the page remembers while someone is on it (src/blocks/logic). */
  variables?: PageVariable[];
}
export interface Asset {
  id: string;
  name: string;
  url: string;
}
export interface Project {
  version: 1;
  name: string;
  template: TemplateId;
  theme: {
    accent: string;
    background: string;
    color: string;
    font: "modern" | "editorial" | "classic";
    radius: number;
    scale?: "compact" | "balanced" | "dramatic";
    spacing?: "tight" | "comfortable" | "airy";
    buttons?: "solid" | "outline" | "pill";
    /** The dot after the site name in the header and footer; on unless false. */
    brandDot?: boolean;
    /** Visitors can switch the site between light and dark. */
    darkToggle?: boolean;
    /** The header's logo mark: "bolt" (built in) or an image address. */
    logo?: string;
  };
  header: Section[];
  footer: Section[];
  pages: Page[];
  assets: Asset[];
  savedSections?: Section[];
  collections?: Collection[];
  /** How visitors pay for orders, bookings and RSVPs. */
  payments?: PaymentSettings;
  /** The site's business app: tables, steps, forms and dashboard. */
  app?: App;
}
export const uid = () => crypto.randomUUID();
export const pageHref = (slug: string) =>
  slug ? `${slug}.html` : "index.html";
export const sectionMeta: Record<
  SectionType,
  { label: string; icon: string; description: string; category: string }
> = {
  announcement: {
    label: "Announcement bar",
    icon: "megaphone",
    description: "A little message with a big impact.",
    category: "Navigation",
  },
  header: {
    label: "Header",
    icon: "panelTop",
    description: "Your brand and page navigation.",
    category: "Navigation",
  },
  hero: {
    label: "Image banner",
    icon: "image",
    description: "Make a memorable first impression.",
    category: "Essentials",
  },
  products: {
    label: "Featured collection",
    icon: "grid",
    description: "Put your products in the spotlight.",
    category: "Commerce",
  },
  features: {
    label: "Features",
    icon: "columns",
    description: "Three good reasons to choose you.",
    category: "Essentials",
  },
  imageText: {
    label: "Image with text",
    icon: "panel",
    description: "Tell your story, side by side.",
    category: "Essentials",
  },
  gallery: {
    label: "Gallery",
    icon: "gallery",
    description: "A beautiful home for your work.",
    category: "Essentials",
  },
  testimonials: {
    label: "Testimonials",
    icon: "quote",
    description: "Let your customers do the talking.",
    category: "Social proof",
  },
  faq: {
    label: "Questions & answers",
    icon: "help",
    description: "Helpful answers, neatly organized.",
    category: "Social proof",
  },
  contact: {
    label: "Contact form",
    icon: "mail",
    description: "Start your next conversation.",
    category: "Forms",
  },
  newsletter: {
    label: "Email signup",
    icon: "send",
    description: "Build a community around your brand.",
    category: "Forms",
  },
  footer: {
    label: "Footer",
    icon: "panelBottom",
    description: "Finish with the essentials.",
    category: "Navigation",
  },
  text: {
    label: "Rich text",
    icon: "type",
    description: "A little space for your big ideas.",
    category: "Essentials",
  },
  cta: {
    label: "Call to action",
    icon: "arrowUpRight",
    description: "Give visitors a clear next step.",
    category: "Essentials",
  },
  collection: {
    label: "Collection list",
    icon: "grid",
    description: "Show products, a menu, listings, events, and more.",
    category: "Essentials",
  },
  app: {
    label: "App form",
    icon: "activity",
    description: "A form or lookup from your business app.",
    category: "Essentials",
  },
  blocks: {
    label: "Blocks",
    icon: "layers",
    description: "Built from blocks you arrange and style freely.",
    category: "Essentials",
  },
  custom: {
    label: "Custom section",
    icon: "layers",
    description: "Build your own layout from blocks.",
    category: "Essentials",
  },
};
export const blockMeta: Record<BlockType, { label: string; icon: string }> = {
  heading: { label: "Heading", icon: "type" },
  text: { label: "Text", icon: "edit" },
  button: { label: "Button", icon: "arrowUpRight" },
  image: { label: "Image", icon: "image" },
  spacer: { label: "Spacer", icon: "down" },
  divider: { label: "Divider", icon: "layers" },
  columns: { label: "Columns", icon: "columns" },
  column: { label: "Column", icon: "panel" },
};
/** Blocks that can be added inside a section or a column. */
export const leafBlocks: BlockType[] = [
  "heading",
  "text",
  "button",
  "image",
  "spacer",
  "divider",
];
export const MAX_COLUMNS = 4;
export function createBlock(type: BlockType): Block {
  const base: Block = {
    id: uid(),
    type,
    text: "",
    url: "#",
    image: "",
    alt: "",
    size: "md",
    variant: "primary",
    height: 0,
    children: [],
  };
  switch (type) {
    case "heading":
      return { ...base, text: "Say something memorable", size: "lg" };
    case "text":
      return {
        ...base,
        text: "Share the details that make your work worth a closer look.",
      };
    case "button":
      return { ...base, text: "Learn more" };
    case "spacer":
      return { ...base, height: 32 };
    case "columns":
      return {
        ...base,
        children: [createColumn("heading"), createColumn("text")],
      };
    default:
      return base;
  }
}
function createColumn(first: BlockType): Block {
  return { ...createBlock("column"), children: [createBlock(first)] };
}
/** Depth-first list of every block in a tree. */
export function flattenBlocks(blocks: Block[] = []): Block[] {
  return blocks.flatMap((b) => [b, ...flattenBlocks(b.children)]);
}
export function findBlock(blocks: Block[] = [], id: string | null) {
  return flattenBlocks(blocks).find((b) => b.id === id);
}
/** The block list that directly contains `id`, and the parent block (if any). */
export function findBlockParent(
  blocks: Block[],
  id: string,
  parent: Block | null = null,
): { list: Block[]; parent: Block | null } | undefined {
  if (blocks.some((b) => b.id === id)) return { list: blocks, parent };
  for (const b of blocks) {
    const found = findBlockParent(b.children, id, b);
    if (found) return found;
  }
}
/** Rebuild a block tree, giving `fn` each list of siblings bottom-up. */
export function mapBlockLists(
  blocks: Block[],
  fn: (list: Block[], parent: Block | null) => Block[],
  parent: Block | null = null,
): Block[] {
  return fn(
    blocks.map((b) => ({
      ...b,
      children: b.children.length ? mapBlockLists(b.children, fn, b) : [],
    })),
    parent,
  );
}
export function copyBlocks(blocks: Block[] = []): Block[] {
  return blocks.map((b) => ({
    ...b,
    id: uid(),
    children: copyBlocks(b.children),
  }));
}
/** Every image URL a section shows, including those inside blocks. */
export function sectionImages(section: Section) {
  return [
    section.image,
    ...section.items.map((i) => i.image),
    ...flattenBlocks(section.blocks).map((b) => b.image),
    ...nodeImages(section.root),
  ].filter(Boolean);
}
/** Replace image URLs in a section in place, e.g. for portable exports. */
export function replaceSectionImages(
  section: Section,
  replace: (src: string) => string | undefined,
) {
  section.image = replace(section.image) ?? section.image;
  for (const i of section.items) i.image = replace(i.image) ?? i.image;
  for (const b of flattenBlocks(section.blocks))
    b.image = replace(b.image) ?? b.image;
  replaceNodeImages(section.root, replace);
}
/** Rewrite links in a section, including those inside blocks. */
export function mapSectionLinks(
  section: Section,
  fn: (url: string) => string,
): Section {
  const blocks = (list: Block[]): Block[] =>
    list.map((b) => ({ ...b, url: fn(b.url), children: blocks(b.children) }));
  return {
    ...section,
    buttonUrl: fn(section.buttonUrl),
    items: section.items.map((i) => ({ ...i, url: fn(i.url) })),
    ...(section.blocks ? { blocks: blocks(section.blocks) } : {}),
    ...(section.root ? { root: mapNodeLinks(section.root, fn) } : {}),
  };
}
export const safeUrl = (value: string) =>
  /^(https?:\/\/|mailto:|tel:|#|\/|\.\/|[\w-]+\.html(?:#|$))/i.test(
    value.trim(),
  )
    ? value.trim()
    : "#";
export const safeImage = (value: string) =>
  /^(https?:\/\/|\/?images\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(
    value,
  ) || PUBLISHED_IMAGE.test(value)
    ? value
    : "";
/** Where publishing puts a copied image: /sites/<site>/releases/<release>/images/<hash>.<ext>. */
const PUBLISHED_IMAGE =
  /^\/sites\/[\w-]+\/releases\/[\w-]+\/images\/[\da-f]+\.(?:png|jpeg|webp|gif)$/i;
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "page";
export function findSection(project: Project, id: string | null) {
  return [
    ...project.header,
    ...project.pages.flatMap((p) => p.sections),
    ...project.footer,
  ].find((s) => s.id === id);
}
export function mapSections(
  project: Project,
  fn: (sections: Section[]) => Section[],
): Project {
  return {
    ...project,
    header: fn(project.header),
    footer: fn(project.footer),
    pages: project.pages.map((p) => ({ ...p, sections: fn(p.sections) })),
  };
}
const oneOf = <T>(value: T | undefined, options: readonly T[]) =>
  value === undefined || options.includes(value);
const inRange = (n: unknown, max: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
function blockValid(b: Block, depth: number): boolean {
  if (
    !b ||
    typeof b.id !== "string" ||
    !(b.type in blockMeta) ||
    !["text", "url", "image", "alt"].every(
      (k) => typeof b[k as keyof Block] === "string",
    ) ||
    !["sm", "md", "lg", "xl"].includes(b.size) ||
    !["primary", "secondary", "link"].includes(b.variant) ||
    !inRange(b.height, 1500) ||
    !Array.isArray(b.children)
  )
    return false;
  // Sections hold blocks and columns; columns hold columns; a column holds blocks.
  if (b.type === "columns")
    return (
      depth === 0 &&
      b.children.length >= 1 &&
      b.children.length <= MAX_COLUMNS &&
      b.children.every((c) => c?.type === "column" && blockValid(c, 1))
    );
  if (b.type === "column")
    return (
      depth === 1 &&
      b.children.every((c) => leafBlocks.includes(c?.type) && blockValid(c, 2))
    );
  return b.children.length === 0;
}
function overridesValid(o: DeviceOverrides | undefined) {
  return (
    o === undefined ||
    (typeof o === "object" &&
      (o.padding === undefined || inRange(o.padding, 1500)) &&
      oneOf(o.align, ["left", "center", "right"] as const) &&
      (o.hidden === undefined || typeof o.hidden === "boolean"))
  );
}
export function validateProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Project;
  const sectionValid = (s: Section) =>
    s &&
    (s.type === "blocks" ? rootValid(s.root) : s.root === undefined) &&
    (s.blocks === undefined ||
      (Array.isArray(s.blocks) &&
        s.blocks.every((b) => b?.type !== "column" && blockValid(b, 0)))) &&
    oneOf(s.width, ["narrow", "normal", "wide", "full"] as const) &&
    ["secondaryLabel", "secondaryUrl", "note"].every(
      (k) =>
        s[k as keyof Section] === undefined ||
        (typeof s[k as keyof Section] === "string" &&
          (s[k as keyof Section] as string).length <= 300),
    ) &&
    oneOf(s.effect, ["none", "orbits"] as const) &&
    (s.variant === undefined ||
      (SECTION_VARIANTS[s.type] ?? []).includes(s.variant)) &&
    (s.appForm === undefined ||
      (typeof s.appForm === "string" && s.appForm.length <= 64)) &&
    (s.listing === undefined ||
      (typeof s.listing === "object" &&
        typeof s.listing.collection === "string" &&
        ["grid", "list"].includes(s.listing.style) &&
        Number.isInteger(s.listing.columns) &&
        s.listing.columns >= 1 &&
        s.listing.columns <= 4 &&
        Number.isInteger(s.listing.limit) &&
        s.listing.limit >= 0 &&
        s.listing.limit <= 1000)) &&
    oneOf(s.animation, ["none", "fade", "rise", "zoom"] as const) &&
    (s.responsive === undefined ||
      (typeof s.responsive === "object" &&
        overridesValid(s.responsive.tablet) &&
        overridesValid(s.responsive.mobile))) &&
    typeof s.id === "string" &&
    s.type in sectionMeta &&
    [
      "name",
      "title",
      "eyebrow",
      "body",
      "buttonLabel",
      "buttonUrl",
      "image",
      "imageAlt",
      "background",
      "color",
      "formAction",
    ].every((k) => typeof s[k as keyof Section] === "string") &&
    ["left", "center", "right"].includes(s.align) &&
    ["cover", "split"].includes(s.layout) &&
    [s.padding, s.height, s.overlay].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1500,
    ) &&
    typeof s.hidden === "boolean" &&
    Array.isArray(s.items) &&
    s.items.every(
      (i) =>
        i &&
        ["id", "title", "body", "image", "price", "url"].every(
          (k) => typeof i[k as keyof Item] === "string",
        ) &&
        (i.icon === undefined ||
          (FEATURE_ICONS as readonly string[]).includes(i.icon)),
    );
  if (!(
    p.version === 1 &&
    typeof p.name === "string" &&
    (TEMPLATE_IDS as readonly string[]).includes(p.template) &&
    p.theme &&
    ["accent", "background", "color"].every((k) =>
      /^#[\da-f]{6}$/i.test(p.theme[k as "accent"]),
    ) &&
    ["modern", "editorial", "classic"].includes(p.theme.font) &&
    Number.isFinite(p.theme.radius) &&
    p.theme.radius >= 0 &&
    p.theme.radius <= 40 &&
    oneOf(p.theme.scale, ["compact", "balanced", "dramatic"] as const) &&
    oneOf(p.theme.spacing, ["tight", "comfortable", "airy"] as const) &&
    oneOf(p.theme.buttons, ["solid", "outline", "pill"] as const) &&
    (p.theme.brandDot === undefined || typeof p.theme.brandDot === "boolean") &&
    (p.theme.darkToggle === undefined ||
      typeof p.theme.darkToggle === "boolean") &&
    (p.theme.logo === undefined ||
      (typeof p.theme.logo === "string" && p.theme.logo.length <= 200_000)) &&
    Array.isArray(p.header) &&
    p.header.every(sectionValid) &&
    Array.isArray(p.footer) &&
    p.footer.every(sectionValid) &&
    (p.savedSections === undefined ||
      (Array.isArray(p.savedSections) &&
        p.savedSections.every(sectionValid))) &&
    (p.collections === undefined || validateCollections(p.collections)) &&
    (p.payments === undefined || validatePayments(p.payments)) &&
    (p.app === undefined ||
      validateApp(
        p.app,
        (p.collections ?? []).map((c) => c.id),
      )) &&
    Array.isArray(p.assets) &&
    p.assets.every(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.name === "string" &&
        typeof a.url === "string",
    ) &&
    Array.isArray(p.pages) &&
    p.pages.length > 0 &&
    p.pages.every(
      (pg) =>
        pg &&
        ["id", "name", "slug", "title", "description"].every(
          (k) => typeof pg[k as keyof Page] === "string",
        ) &&
        pg.slug !== "index" &&
        /^(?:|[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(pg.slug) &&
        Array.isArray(pg.sections) &&
        pg.sections.every(sectionValid) &&
        variablesValid(pg.variables),
    )
  ))
    return false;
  const ids = [
    ...p.header,
    ...p.pages.flatMap((pg) => pg.sections),
    ...p.footer,
    ...(p.savedSections ?? []),
  ].flatMap((s) => [s.id, ...flattenBlocks(s.blocks).map((b) => b.id)]);
  return (
    new Set(ids).size === ids.length &&
    new Set(p.pages.map((pg) => pg.id)).size === p.pages.length &&
    new Set(p.pages.map((pg) => pg.slug)).size === p.pages.length &&
    p.pages[0].slug === ""
  );
}
