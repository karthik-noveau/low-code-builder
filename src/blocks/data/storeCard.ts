/**
 * A repeat over Forma Store's products (`store:products`, look "products")
 * with the classic products block's card (legacy.ts itemCard): the photo (or
 * a placeholder tile) linking to the product's page, the name and price in a
 * row, and the description. Its "When there are no products" box holds what
 * visitors see without the store's catalogue on the website: a converted
 * block's own cards, laid out as before.
 */
import {
  walk,
  type Node,
  type NodeType,
  type Props,
  type Style,
} from "../model";
import type { Condition } from "../logic/model";
import { STORE_SOURCE } from "./store";

type Block = (
  type: NodeType,
  props?: Props,
  children?: Node[],
  extra?: Partial<Node>,
) => Node;
const when = (field: string, op: "set" | "empty"): Condition => ({
  match: "all",
  rules: [{ if: "item", field, op }],
});

/** The classic product card, bound to the item. */
function storeCard(block: Block): Node {
  return block(
    "box",
    { variant: "plain" },
    [
      block(
        "image",
        { src: "", alt: "", fit: "cover", ratio: "auto" },
        undefined,
        {
          style: { radius: "theme" },
          bind: { src: "item:image", alt: "item:title", link: "item:link" },
          when: when("item:image", "set"),
        },
      ),
      block(
        "box",
        { variant: "plain" },
        [block("icon", { icon: "image", variant: "plain", size: 32 })],
        {
          name: "Image",
          bind: { link: "item:link" },
          when: when("item:image", "empty"),
        },
      ),
      block(
        "row",
        {},
        [
          block("heading", { text: "", level: "3" }, undefined, {
            bind: { text: "item:title" },
          }),
          block("text", { text: "", variant: "small" }, undefined, {
            name: "Price",
            bind: { text: "item:price" },
            when: when("item:price", "set"),
          }),
        ],
        {
          name: "Title",
          style: { justify: "between", align: "start", wrap: false, gap: 10 },
        },
      ),
      block("text", { text: "", variant: "muted" }, undefined, {
        name: "Description",
        bind: { text: "item:description" },
        when: when("item:description", "set"),
      }),
    ],
    { name: "Card" },
  );
}

/**
 * The store repeat `id`. `cards` are shown, in a grid styled `grid`, when
 * there are no products; ids of the new parts derive from `id`, so building
 * it again gives the same tree.
 */
export function storeRepeat(
  block: Block,
  id: string,
  o: {
    own?: Partial<Node>;
    cards: Node[];
    grid?: Pick<Node, "style" | "tablet" | "mobile">;
    limit?: number;
  },
): Node {
  const card = storeCard(block);
  let i = 0;
  for (const n of walk([card])) n.id = `${id}-c${(i++).toString(36)}`;
  const grid = block("grid", {}, o.cards, { name: "Products", ...o.grid });
  grid.id = `${id}-e1`;
  const empty = block("box", { variant: "plain", slot: "empty" }, [grid], {
    name: "When there are no products",
  });
  empty.id = `${id}-e0`;
  return {
    ...block("repeat", {
      source: STORE_SOURCE,
      layout: "grid",
      limit: o.limit ?? 0,
      look: "products",
    }),
    ...o.own,
    id,
    type: "repeat",
    children: [card, empty],
  };
}

/** The grid-related parts of a block's styles (columns and gap). */
export function gridStyles(n: Node): Pick<Node, "style" | "tablet" | "mobile"> {
  const out: Pick<Node, "style" | "tablet" | "mobile"> = {};
  for (const key of ["style", "tablet", "mobile"] as const) {
    const s = n[key];
    if (!s) continue;
    const pick: Style = {};
    if (s.columns !== undefined) pick.columns = s.columns;
    if (s.gap !== undefined) pick.gap = s.gap;
    if (Object.keys(pick).length) out[key] = pick;
  }
  return out;
}
