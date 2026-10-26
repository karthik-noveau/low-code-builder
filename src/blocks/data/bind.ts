/**
 * Data binding: a repeat block lists items (a collection's, or a public
 * view's rows) and repeats its template per item; inside it any block can
 * take its text, image or link from the current item through `node.bind`
 * (prop key → source):
 *   field:<id>   a field of the item (a collection field, or a view column)
 *   item:title   the collection item's title
 *   item:link    the item's own page (or its call-to-action link)
 *   item:index   its place in the list, 1, 2, 3… (leaderboards)
 *
 * Collections are resolved here at render time (static HTML on publish).
 * App views are filled in the visitor's browser: the published page carries
 * the template with markers (`marker`), and the data script swaps each
 * marker for the row's value (as text, or a checked URL).
 */
import type { Project } from "../../studio/model";
import {
  formatValue,
  itemHref,
  itemPath,
  itemTitle,
  type Collection,
  type CollectionItem,
} from "../../studio/collections";
import { viewColumns } from "./views";
import { pathTo, type Node, type Props, type PropValue } from "../model";

export interface DataItem {
  index: number;
  /** Field id → the value as visitors read it (prices, dates formatted). */
  values: Record<string, string>;
  /** Field id → the stored value, for images and links. */
  raw: Record<string, string>;
  title?: string;
  link?: string;
  /** The published template for app views: values become markers. */
  marker?: boolean;
}
export interface SourceField {
  /** A binding source, e.g. "field:abc". */
  source: string;
  name: string;
  /** "image", "link", "price", "money", "text"… */
  type: string;
}

/** Props that hold an address: bound to the stored value, not the shown one. */
export const URL_PROPS = new Set(["url", "link", "src", "image"]);
/** Which props of a block can be bound, by type. */
export const BINDABLE: Partial<Record<Node["type"], string[]>> = {
  heading: ["text"],
  text: ["text"],
  badge: ["text"],
  button: ["label", "url"],
  image: ["src", "alt", "link"],
  box: ["link"],
};

/** Markers in the published template; data script swaps them (src/blocks/data/runtime.ts). */
export const MARK_URL = "https://bind.invalid/";
export const markText = (source: string) => `⟦${source}⟧`;
export const markUrl = (source: string) =>
  `${MARK_URL}${encodeURIComponent(source)}`;

export function resolveBinding(
  source: string,
  item: DataItem,
  prop: string,
): string {
  const url = URL_PROPS.has(prop);
  if (item.marker) return url ? markUrl(source) : markText(source);
  if (source === "item:index") return String(item.index + 1);
  if (source === "item:title") return item.title ?? "";
  if (source === "item:link") return item.link ?? "";
  if (source.startsWith("field:")) {
    const id = source.slice(6);
    return (url ? item.raw[id] : item.values[id]) ?? "";
  }
  return "";
}
/** A node's props with its bindings filled from `item`. */
export function boundProps(node: Node, item: DataItem | undefined): Props {
  if (!node.bind || !item) return node.props;
  const props: Record<string, PropValue> = { ...node.props };
  for (const [prop, source] of Object.entries(node.bind))
    props[prop] = resolveBinding(source, item, prop);
  return props;
}

export type SourceRef =
  | { kind: "collection"; id: string }
  | { kind: "view"; id: string }
  | { kind: "card"; id: string }
  | { kind: "chart"; id: string }
  | { kind: "none"; id: "" };
export function parseSource(value: PropValue | undefined): SourceRef {
  const m = /^(collection|view|card|chart):([\w-]{1,64})$/.exec(
    typeof value === "string" ? value : "",
  );
  return m ? ({ kind: m[1], id: m[2] } as SourceRef) : { kind: "none", id: "" };
}

/** The fields an item of a repeat's source offers to bindings. */
export function sourceFields(
  project: Project,
  source: PropValue | undefined,
): SourceField[] {
  const ref = parseSource(source);
  const index: SourceField = {
    source: "item:index",
    name: "Place in list (1, 2, 3…)",
    type: "number",
  };
  if (ref.kind === "collection") {
    const c = project.collections?.find((x) => x.id === ref.id);
    if (!c) return [];
    return [
      { source: "item:title", name: "Title", type: "text" },
      ...(c.itemPages
        ? [{ source: "item:link", name: "Item page", type: "link" }]
        : c.display.action
          ? [{ source: "item:link", name: "Call-to-action link", type: "link" }]
          : []),
      ...c.fields.map((f) => ({
        source: `field:${f.id}`,
        name: f.name,
        type: f.type,
      })),
      index,
    ];
  }
  if (ref.kind === "view") {
    const view = project.app?.views?.find((v) => v.id === ref.id);
    if (!view || !project.app) return [];
    return [
      ...viewColumns(project.app, view).map((c) => ({
        source: `field:${c.id}`,
        name: c.name,
        type: c.money ? "money" : c.type,
      })),
      index,
    ];
  }
  return [];
}

/** Which sources suit a prop: images take image fields, links take links. */
export function fieldsForProp(fields: SourceField[], prop: string) {
  if (prop === "src") return fields.filter((f) => f.type === "image");
  if (prop === "url" || prop === "link")
    return fields.filter((f) => f.type === "link");
  return fields.filter((f) => f.type !== "image");
}

export interface CollectionQuery {
  filterField?: string;
  filterOp?: string;
  filterValue?: string;
  sortField?: string;
  sortDir?: string;
  limit?: number;
}
const numberOf = (v: string) => Number(v.replace(/[^\d.-]/g, ""));
/** A collection's visible items after a repeat's filter, sort and limit. */
export function queryCollection(
  c: Collection,
  q: CollectionQuery,
): CollectionItem[] {
  let items = c.items.filter((i) => !i.hidden);
  const field = c.fields.find((f) => f.id === q.filterField);
  if (field && q.filterOp) {
    const want = (q.filterValue ?? "").trim().toLowerCase();
    items = items.filter((i) => {
      const raw = i.values[field.id] ?? "";
      const v = raw.trim().toLowerCase();
      switch (q.filterOp) {
        case "is":
          return v === want;
        case "not":
          return v !== want;
        case "contains":
          return v.includes(want);
        case "atLeast":
          return numberOf(raw) >= Number(want);
        case "atMost":
          return numberOf(raw) <= Number(want);
        case "set":
          return v !== "";
        case "empty":
          return v === "";
        default:
          return true;
      }
    });
  }
  const sort = c.fields.find((f) => f.id === q.sortField);
  if (sort) {
    const numeric = ["number", "price"].includes(sort.type);
    const dir = q.sortDir === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      const x = a.values[sort.id] ?? "",
        y = b.values[sort.id] ?? "";
      return (
        dir *
        (numeric
          ? numberOf(x || "0") - numberOf(y || "0")
          : x.localeCompare(y, undefined, { numeric: true }))
      );
    });
  }
  return q.limit && q.limit > 0 ? items.slice(0, q.limit) : items;
}
/** A collection item as a repeat's template sees it. */
export function collectionItem(
  c: Collection,
  item: CollectionItem,
  index: number,
  exporting: boolean,
): DataItem {
  const values: Record<string, string> = {};
  for (const f of c.fields)
    values[f.id] = formatValue(c, f.id, item.values[f.id] ?? "");
  return {
    index,
    values,
    raw: { ...item.values },
    title: itemTitle(c, item),
    link: c.itemPages
      ? exporting
        ? `./${itemHref(c, item)}`
        : itemPath(c, item)
      : c.display.action
        ? (item.values[c.display.action] ?? "")
        : "",
  };
}
/** A public view's row as a repeat's template sees it. */
export const rowItem = (
  row: Record<string, string>,
  index: number,
): DataItem => ({
  index,
  values: row,
  raw: row,
});

const DATA_TYPES = new Set<Node["type"]>(["repeat", "stat", "chart", "table"]);
/** The nearest repeat around a block (not the block itself). */
export function enclosingRepeat(root: Node, node: Node) {
  const path = pathTo([root], node.id);
  for (let i = path.length - 2; i >= 0; i--)
    if (path[i].type === "repeat") return path[i];
}
/** Whether the Inspector's Data tab has anything for this block. */
export const hasDataTab = (root: Node, node: Node) =>
  DATA_TYPES.has(node.type) ||
  (!!enclosingRepeat(root, node) && !!BINDABLE[node.type]);
