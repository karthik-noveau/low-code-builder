/**
 * Typing a list's points on the canvas (TypedList.tsx): what Enter,
 * Backspace and the arrow keys do to the points, worked out on the points'
 * markup (one string per point, src/blocks/richtext.tsx) and the typed runs
 * of the point being typed into. The list prop keeps one point per line.
 */
import type { PropValue } from "../model";
import {
  explode,
  implode,
  parseInline,
  plainText,
  serializeInline,
  type Run,
} from "../richtext";

/** The points while typing, which one is typed into and where the caret goes. */
export interface ListEdit {
  items: string[];
  index: number;
  /** Text offset in that point (undefined: its end). */
  caret?: number;
}
/** As many points as a list holds (validate.ts: 100 lines). */
export const MAX_LIST_ITEMS = 100;

const write = (runs: Run[]) => serializeInline(runs);
const length = (item: string) => plainText(parseInline(item)).length;

/**
 * Enter: the point splits at the caret (a selection is replaced). What
 * follows the caret, with its formatting, becomes a new point after it, and
 * the caret goes to its start. At the end of a point that's an empty one.
 */
export function splitItem(
  items: string[],
  index: number,
  runs: Run[],
  from: number,
  to = from,
): ListEdit | null {
  if (items.length >= MAX_LIST_ITEMS) return null;
  const { text, marks } = explode(runs);
  const before = implode(text.slice(0, from), marks.slice(0, from));
  const after = implode(text.slice(to), marks.slice(to));
  const next = [...items];
  next.splice(index, 1, write(before), write(after));
  return { items: next, index: index + 1, caret: 0 };
}

/**
 * Backspace at the start of a point: it joins the point before it (an empty
 * one is removed), and the caret goes where they meet. The first point has
 * nothing before it: an empty first point is removed when others follow.
 */
export function joinPrevious(
  items: string[],
  index: number,
  runs: Run[],
): ListEdit | null {
  const empty = !plainText(runs).trim();
  if (index === 0) {
    if (!empty || items.length < 2) return null;
    return { items: items.slice(1), index: 0, caret: 0 };
  }
  const previous = items[index - 1];
  const next = [...items];
  next.splice(
    index - 1,
    2,
    empty ? previous : write([...parseInline(previous), ...runs]),
  );
  return { items: next, index: index - 1, caret: length(previous) };
}

/** ↑/↓: the point before or after, the caret at the same offset (or its end). */
export function moveToItem(
  items: string[],
  index: number,
  runs: Run[],
  by: -1 | 1,
  caret: number,
): ListEdit | null {
  const to = index + by;
  if (to < 0 || to >= items.length) return null;
  const next = [...items];
  next[index] = write(runs);
  return { items: next, index: to, caret: Math.min(caret, length(next[to])) };
}

/**
 * The points to save: pasted lines become points of their own, spaces at
 * the ends go and empty points are left out (as the list draws them).
 */
export const finishItems = (items: string[]) =>
  items
    .flatMap((item) => item.split("\n"))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);

/** The points in the prop's own format: a list of lines, or one text. */
export const itemsValue = (items: string[], was: PropValue | undefined) =>
  typeof was === "string" ? items.join("\n") : items;
