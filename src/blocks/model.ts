/**
 * Blocks: the pieces every page is built from. A section is a tree of nodes;
 * containers (section, box, row, columns, grid) hold children, everything else
 * shows content. What each type holds and which fields it has live in
 * registry.ts; how styles become CSS lives in style.ts. See
 * docs/blocks-builder.md.
 */
import type { Condition, On } from "./logic/model";
export const NODE_TYPES = [
  // Layout
  "section",
  "box",
  "row",
  "columns",
  "column",
  "grid",
  // Basic
  "heading",
  "text",
  "button",
  "image",
  "icon",
  "list",
  "badge",
  "divider",
  "spacer",
  // Media
  "video",
  "map",
  // Site
  "logo",
  "menu",
  "themeToggle",
  "accordion",
  "social",
  "tabBar",
  // Forms and data
  "contactForm",
  "newsletter",
  "appForm",
  "collectionList",
  "products",
  // Data (src/blocks/data)
  "repeat",
  "stat",
  "chart",
  "table",
  // Forms (src/blocks/forms)
  "form",
  "field",
  "submit",
  "formStep",
  "formSuccess",
  "formError",
  "formSteps",
  "formRecord",
  // Logic (src/blocks/logic)
  "dialog",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** A block's content: text, links, choices. Which keys a type uses is in its registry fields. */
export type PropValue = string | number | boolean | string[];
export type Props = Record<string, PropValue>;

/** Spacing on four sides, in px: top, right, bottom, left. */
export type Sides = [number, number, number, number];
/**
 * The design properties a block can have. Colours accept a theme token
 * (COLOR_TOKENS) or a hex value; `radius` accepts "theme"; `fontSize` a token
 * (FONT_SIZES) or px. Anything unset follows the block's defaults and the theme.
 */
export interface Style {
  // Layout (containers)
  direction?: "column" | "row";
  gap?: number;
  /** Cross-axis alignment of children. */
  align?: "start" | "center" | "end" | "stretch";
  /** Main-axis distribution of children. */
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  /** Grid and columns: how many per row. */
  columns?: number;
  // Size
  width?: "auto" | "full" | number;
  maxWidth?: number;
  minHeight?: number;
  height?: number;
  // Spacing
  padding?: Sides;
  margin?: Sides;
  // Typography
  fontSize?: string;
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  italic?: boolean;
  font?: "body" | "heading";
  color?: string;
  // Background
  background?: string;
  backgroundImage?: string;
  /** Darkens a background image, 0–90 (%). */
  overlay?: number;
  // Border and effects
  borderWidth?: number;
  borderColor?: string;
  radius?: number | "theme" | "full";
  shadow?: "none" | "sm" | "md" | "lg";
  opacity?: number;
  /** Content of a section: narrow, normal, wide or full width. */
  contentWidth?: "narrow" | "normal" | "wide" | "full";
  /** Hidden at this size (set on `tablet` / `mobile`); faded in the editor. */
  hidden?: boolean;
}
export const COLOR_TOKENS = [
  "accent",
  "accentText",
  "text",
  "muted",
  "background",
  "surface",
  "line",
] as const;
export const FONT_SIZES = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
] as const;

export interface Node {
  id: string;
  type: NodeType;
  /** The owner's label in Layers; the type's label otherwise. */
  name?: string;
  props: Props;
  style?: Style;
  /** Overrides at tablet width (≤ 768px) and phone width (≤ 480px). */
  tablet?: Style;
  mobile?: Style;
  children?: Node[];
  hidden?: boolean;
  /** Kept in place in the editor: not moved, deleted or added to (src/blocks/lock.ts). */
  locked?: boolean;
  /**
   * Inside a repeat: props filled from the current item, prop key → source
   * ("field:<id>", "item:link", "item:title", "item:index"). See
   * src/blocks/data/bind.ts.
   */
  bind?: Binding;
  /** What a click does (src/blocks/logic). */
  on?: On;
  /** Shown only when this holds (src/blocks/logic). */
  when?: Condition;
}
export type Binding = Record<string, string>;
export type { Action, Condition, On } from "./logic/model";

export const nodeId = () => crypto.randomUUID();

/** Every node in the tree, parents before children. */
export function* walk(nodes: Node[]): Generator<Node> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* walk(n.children);
  }
}
export function findNode(nodes: Node[], id: string): Node | undefined {
  for (const n of walk(nodes)) if (n.id === id) return n;
}
/** The node's parent (null at the top level) and its index there. */
export function locate(
  nodes: Node[],
  id: string,
  parent: Node | null = null,
): { parent: Node | null; siblings: Node[]; index: number } | undefined {
  const index = nodes.findIndex((n) => n.id === id);
  if (index >= 0) return { parent, siblings: nodes, index };
  for (const n of nodes)
    if (n.children) {
      const found = locate(n.children, id, n);
      if (found) return found;
    }
}
/** The chain from the top-level node down to `id`, inclusive. */
export function pathTo(nodes: Node[], id: string): Node[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    if (n.children) {
      const rest = pathTo(n.children, id);
      if (rest.length) return [n, ...rest];
    }
  }
  return [];
}
/** Whether `id` is `ancestor` or inside it. */
export const contains = (ancestor: Node, id: string) =>
  !!findNode([ancestor], id);

/**
 * A copy with fresh ids throughout (duplicate, paste, insert a preset).
 * Clicks that open a dialog or scroll to a block inside the copy follow the
 * copy (src/blocks/logic).
 */
export function cloneNode(node: Node): Node {
  const ids = new Map<string, string>();
  const copy = (n: Node): Node => {
    const id = nodeId();
    ids.set(n.id, id);
    return {
      ...structuredClone(n),
      id,
      children: n.children?.map(copy),
    };
  };
  const relink = (n: Node): Node => {
    const click = n.on?.click?.map((a) =>
      a.do === "openDialog" && ids.has(a.dialog)
        ? { ...a, dialog: ids.get(a.dialog)! }
        : a.do === "scroll" && ids.has(a.target)
          ? { ...a, target: ids.get(a.target)! }
          : a,
    );
    return {
      ...n,
      ...(click ? { on: { ...n.on, click } } : {}),
      children: n.children?.map(relink),
    };
  };
  return relink(copy(node));
}

/** Applies `fn` to the node with `id`, returning a new tree (others shared). */
export function mapNode(
  nodes: Node[],
  id: string,
  fn: (n: Node) => Node,
): Node[] {
  return nodes.map((n) =>
    n.id === id
      ? fn(n)
      : n.children
        ? { ...n, children: mapNode(n.children, id, fn) }
        : n,
  );
}
export function removeNode(nodes: Node[], id: string): Node[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n,
    );
}
/** Inserts `node` into `parent` (null: the top level) at `index` (default: the end). */
export function insertNode(
  nodes: Node[],
  parent: string | null,
  node: Node,
  index?: number,
): Node[] {
  const put = (list: Node[]) => {
    const copy = [...list];
    copy.splice(index ?? copy.length, 0, node);
    return copy;
  };
  if (parent === null) return put(nodes);
  return mapNode(nodes, parent, (p) => ({
    ...p,
    children: put(p.children ?? []),
  }));
}
/**
 * Moves `id` into `parent` at `index`, the index counted after taking the
 * node out. Refused (unchanged) when that would put a node inside itself.
 */
export function moveNode(
  nodes: Node[],
  id: string,
  parent: string | null,
  index: number,
): Node[] {
  const node = findNode(nodes, id);
  if (!node || (parent && contains(node, parent))) return nodes;
  return insertNode(removeNode(nodes, id), parent, node, index);
}
/** Merges into a style, dropping keys set to undefined so they fall back again. */
export function mergeStyle(style: Style | undefined, patch: Partial<Style>) {
  const next: Record<string, unknown> = { ...style, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return Object.keys(next).length ? (next as Style) : undefined;
}
