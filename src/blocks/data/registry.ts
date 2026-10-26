/**
 * The data blocks' registry entries (spread into BLOCKS in ../registry.ts).
 * What each lists or counts (its `source`) and the bindings are set on the
 * Inspector's Data tab (../editor/DataPanel.tsx), not here.
 */
import { nodeId, type Node, type Props } from "../model";
import type { BlockDef } from "../registry";

const choice = (...pairs: [string, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));
const make = (
  type: Node["type"],
  props: Props,
  extra: Partial<Node> = {},
): Node => ({
  id: nodeId(),
  type,
  props,
  ...extra,
});

/** A repeat's starting card: image, title, a line and a price, bound once a source is chosen. */
export function repeatChildren(): Node[] {
  return [
    make(
      "box",
      { variant: "card" },
      {
        style: { gap: 10, padding: [0, 0, 18, 0] },
        children: [
          make("image", { src: "", alt: "", ratio: "4/3" }),
          make(
            "heading",
            { text: "Item title", level: "3" },
            { style: { fontSize: "lg", padding: [0, 18, 0, 18] } },
          ),
          make(
            "text",
            { text: "A short line about it.", variant: "small" },
            { style: { padding: [0, 18, 0, 18], color: "muted" } },
          ),
        ],
      },
    ),
    make(
      "box",
      { variant: "plain", slot: "empty" },
      {
        name: "When empty",
        style: { padding: [24, 0, 24, 0], align: "center" },
        children: [
          make(
            "text",
            { text: "Nothing here yet. Check back soon.", variant: "body" },
            { style: { color: "muted", textAlign: "center" } },
          ),
        ],
      },
    ),
  ];
}

export const DATA_BLOCKS: Record<
  "repeat" | "stat" | "chart" | "table",
  BlockDef
> = {
  repeat: {
    label: "Repeat",
    icon: "layers",
    category: "data",
    description: "A card repeated for every item of a collection or app list",
    container: true,
    accepts: ["box"],
    fields: [
      {
        key: "layout",
        label: "Show as",
        kind: "select",
        options: choice(
          ["grid", "Cards in a grid"],
          ["list", "A list"],
          ["carousel", "A carousel (swipe)"],
        ),
      },
      {
        key: "limit",
        label: "How many at once (0: all)",
        kind: "number",
        min: 0,
        max: 24,
      },
      {
        key: "more",
        label: "“Load more” button (app records)",
        kind: "toggle",
      },
      {
        key: "moreLabel",
        label: "Load more button",
        kind: "text",
        placeholder: "Load more",
      },
      {
        key: "label",
        label: "List name for screen readers",
        kind: "text",
        placeholder: "e.g. Our menu",
      },
    ],
    props: () => ({
      source: "",
      layout: "grid",
      limit: 0,
      more: false,
      moreLabel: "",
    }),
    style: () => ({ columns: 3, gap: 20 }),
    children: repeatChildren,
  },
  stat: {
    label: "Number",
    icon: "activity",
    category: "data",
    description:
      "A live figure from your app, or how many items a collection has",
    fields: [
      {
        key: "label",
        label: "Label",
        kind: "text",
        placeholder: "e.g. Happy customers",
      },
      { key: "prefix", label: "Before the number", kind: "text" },
      {
        key: "suffix",
        label: "After the number",
        kind: "text",
        placeholder: "e.g. +",
      },
      { key: "caption", label: "Small print", kind: "text" },
      {
        key: "variant",
        label: "Look",
        kind: "select",
        options: choice(
          ["plain", "Plain"],
          ["card", "Card"],
          ["accent", "Accent"],
        ),
      },
    ],
    props: () => ({
      source: "",
      label: "",
      prefix: "",
      suffix: "",
      caption: "",
      variant: "plain",
    }),
  },
  chart: {
    label: "Chart",
    icon: "chart",
    category: "data",
    description: "One of your app’s charts: a figure per month",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      {
        key: "kind",
        label: "Draw as",
        kind: "select",
        options: choice(["bar", "Bars"], ["line", "A line"]),
      },
    ],
    props: () => ({ source: "", title: "", kind: "bar" }),
  },
  table: {
    label: "Table",
    icon: "grid",
    category: "data",
    description:
      "Rows from your app (only the fields you allow); cards on phones",
    fields: [
      { key: "caption", label: "Title", kind: "text" },
      {
        key: "showCaption",
        label: "Show the title above the table",
        kind: "toggle",
      },
      { key: "limit", label: "Rows at once", kind: "number", min: 1, max: 24 },
      { key: "more", label: "“Load more” button", kind: "toggle" },
      {
        key: "emptyText",
        label: "When there are no rows",
        kind: "text",
        placeholder: "Nothing to show yet.",
      },
    ],
    props: () => ({
      source: "",
      caption: "",
      showCaption: true,
      limit: 10,
      more: false,
      emptyText: "",
    }),
  },
};
