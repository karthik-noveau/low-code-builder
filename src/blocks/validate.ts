/**
 * Checks a block tree before it is saved or published, and lists the images
 * and links inside it (publishing copies images; exports rewrite links).
 */
import {
  COLOR_TOKENS,
  FONT_SIZES,
  NODE_TYPES,
  walk,
  type Node,
  type Style,
} from "./model";
import { BLOCKS, canHold } from "./registry";
import { conditionValid, onValid, safeLink } from "./logic/model";

export const MAX_DEPTH = 12;
export const MAX_NODES = 600;
const MAX_TEXT = 5000;

const num = (v: unknown, min: number, max: number) =>
  v === undefined ||
  (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max);
const oneOf = (v: unknown, options: readonly unknown[]) =>
  v === undefined || options.includes(v);
const colorOk = (v: unknown) =>
  v === undefined ||
  (typeof v === "string" &&
    ((COLOR_TOKENS as readonly string[]).includes(v) ||
      /^#[0-9a-f]{3,8}$/i.test(v) ||
      v === ""));
const sides = (v: unknown, min: number) =>
  v === undefined ||
  (Array.isArray(v) &&
    v.length === 4 &&
    v.every((n) => num(n, min, 800) && typeof n === "number"));

const STYLE_KEYS = new Set<keyof Style>([
  "direction",
  "gap",
  "align",
  "justify",
  "wrap",
  "columns",
  "width",
  "maxWidth",
  "minHeight",
  "height",
  "padding",
  "margin",
  "fontSize",
  "fontWeight",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "uppercase",
  "italic",
  "font",
  "color",
  "background",
  "backgroundImage",
  "overlay",
  "borderWidth",
  "borderColor",
  "radius",
  "shadow",
  "opacity",
  "contentWidth",
  "hidden",
]);

export function styleValid(s: unknown): boolean {
  if (s === undefined) return true;
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const v = s as Style;
  return (
    Object.keys(v).every((k) => STYLE_KEYS.has(k as keyof Style)) &&
    oneOf(v.direction, ["column", "row"]) &&
    num(v.gap, 0, 400) &&
    oneOf(v.align, ["start", "center", "end", "stretch"]) &&
    oneOf(v.justify, ["start", "center", "end", "between"]) &&
    oneOf(v.wrap, [true, false]) &&
    num(v.columns, 1, 6) &&
    (oneOf(v.width, ["auto", "full"]) || num(v.width, 0, 4000)) &&
    num(v.maxWidth, 0, 4000) &&
    num(v.minHeight, 0, 4000) &&
    num(v.height, 0, 4000) &&
    sides(v.padding, 0) &&
    sides(v.margin, -400) &&
    (v.fontSize === undefined ||
      (FONT_SIZES as readonly string[]).includes(v.fontSize) ||
      /^\d{1,3}$/.test(v.fontSize)) &&
    oneOf(v.fontWeight, [400, 500, 600, 700, 800]) &&
    oneOf(v.textAlign, ["left", "center", "right"]) &&
    num(v.lineHeight, 0.8, 3) &&
    num(v.letterSpacing, -10, 20) &&
    oneOf(v.uppercase, [true, false]) &&
    oneOf(v.italic, [true, false]) &&
    oneOf(v.font, ["body", "heading"]) &&
    colorOk(v.color) &&
    colorOk(v.background) &&
    colorOk(v.borderColor) &&
    (v.backgroundImage === undefined ||
      (typeof v.backgroundImage === "string" &&
        v.backgroundImage.length <= 3_000_000)) &&
    num(v.overlay, 0, 90) &&
    num(v.borderWidth, 0, 20) &&
    (oneOf(v.radius, ["theme", "full"]) || num(v.radius, 0, 200)) &&
    oneOf(v.shadow, ["none", "sm", "md", "lg"]) &&
    num(v.opacity, 0, 100) &&
    oneOf(v.contentWidth, ["narrow", "normal", "wide", "full"]) &&
    oneOf(v.hidden, [true, false])
  );
}

function propsValid(props: unknown) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return false;
  return Object.values(props).every(
    (v) =>
      (typeof v === "string" &&
        (v.length <= MAX_TEXT || v.startsWith("data:image/"))) ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      (Array.isArray(v) &&
        v.length <= 100 &&
        v.every((x) => typeof x === "string" && x.length <= 500)),
  );
}

/** Bindings: a few props, each filled from a field or the item (src/blocks/data/bind.ts). */
export function bindValid(bind: unknown): boolean {
  if (bind === undefined) return true;
  if (!bind || typeof bind !== "object" || Array.isArray(bind)) return false;
  const entries = Object.entries(bind);
  return (
    entries.length <= 8 &&
    entries.every(
      ([k, v]) =>
        /^[a-zA-Z]{1,20}$/.test(k) &&
        typeof v === "string" &&
        /^(?:field:[\w-]{1,64}|item:(?:title|link|index))$/.test(v),
    )
  );
}

/** A section's block tree: a section node holding blocks it may hold, nested sanely. */
export function rootValid(root: unknown): root is Node {
  const n = root as Node;
  if (!n || n.type !== "section") return false;
  let count = 0;
  const ok = (node: Node, depth: number): boolean => {
    count += 1;
    if (
      count > MAX_NODES ||
      depth > MAX_DEPTH ||
      !node ||
      typeof node.id !== "string" ||
      !/^[\w-]{1,64}$/.test(node.id) ||
      !(NODE_TYPES as readonly string[]).includes(node.type) ||
      (node.name !== undefined &&
        (typeof node.name !== "string" || node.name.length > 80)) ||
      (node.hidden !== undefined && typeof node.hidden !== "boolean") ||
      !propsValid(node.props) ||
      !bindValid(node.bind) ||
      // Clicks and "show only when" (src/blocks/logic/model.ts).
      !onValid(node.on, node.type) ||
      !conditionValid(node.when) ||
      ![node.style, node.tablet, node.mobile].every(styleValid)
    )
      return false;
    const def = BLOCKS[node.type];
    if (!def.container) return node.children === undefined;
    return (
      Array.isArray(node.children) &&
      node.children.every(
        (c) => c && canHold(node.type, c.type) && ok(c, depth + 1),
      )
    );
  };
  if (!ok(n, 0)) return false;
  const ids = [...walk([n])].map((x) => x.id);
  return new Set(ids).size === ids.length;
}

/** Image addresses in a tree: image blocks, logos and background images. */
export function nodeImages(root: Node | undefined): string[] {
  if (!root) return [];
  const out: string[] = [];
  for (const n of walk([root])) {
    for (const key of ["src", "image"])
      if (typeof n.props[key] === "string" && n.props[key] !== "bolt")
        out.push(n.props[key] as string);
    for (const s of [n.style, n.tablet, n.mobile])
      if (s?.backgroundImage) out.push(s.backgroundImage);
  }
  return out.filter(Boolean);
}
/** Replaces image addresses in place (publishing, portable exports). */
export function replaceNodeImages(
  root: Node | undefined,
  replace: (src: string) => string | undefined,
) {
  if (!root) return;
  for (const n of walk([root])) {
    for (const key of ["src", "image"]) {
      const v = n.props[key];
      if (typeof v === "string" && v && v !== "bolt")
        n.props[key] = replace(v) ?? v;
    }
    for (const s of [n.style, n.tablet, n.mobile])
      if (s?.backgroundImage)
        s.backgroundImage = replace(s.backgroundImage) ?? s.backgroundImage;
  }
}
/** A copy with every link rewritten (single links and "Label | link" lines). */
export function mapNodeLinks(root: Node, fn: (url: string) => string): Node {
  const props = { ...root.props };
  for (const key of ["url", "link"])
    if (typeof props[key] === "string" && props[key])
      props[key] = fn(props[key] as string);
  if (root.type === "menu" || root.type === "social")
    if (Array.isArray(props.links))
      props.links = props.links.map((line) => {
        const [label, ...rest] = line.split("|");
        const url = rest.join("|").trim();
        return url ? `${label.trim()} | ${fn(url)}` : line;
      });
  // Tab bar lines: "Label | link | icon".
  if (root.type === "tabBar" && Array.isArray(props.tabs))
    props.tabs = props.tabs.map((line) => {
      const [label, url, ...rest] = line.split("|").map((x) => x.trim());
      return url
        ? [label, fn(url), ...rest].filter((x, i) => i < 2 || x).join(" | ")
        : line;
    });
  // "Open a link" clicks; a link that no longer fits is left as it was.
  const click = root.on?.click?.map((a) => {
    if (a.do !== "link") return a;
    const url = fn(a.url);
    return safeLink(url) ? { ...a, url } : a;
  });
  return {
    ...root,
    props,
    ...(click ? { on: { ...root.on, click } } : {}),
    ...(root.children
      ? { children: root.children.map((c) => mapNodeLinks(c, fn)) }
      : {}),
  };
}
