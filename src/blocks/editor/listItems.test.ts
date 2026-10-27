import { describe, expect, it } from "vitest";
import { parseInline } from "../richtext";
import {
  finishItems,
  itemsValue,
  joinPrevious,
  MAX_LIST_ITEMS,
  moveToItem,
  splitItem,
} from "./listItems";

const runs = (s: string) => parseInline(s);

describe("typing a list's points", () => {
  it("Enter splits a point at the caret, keeping each half's formatting", () => {
    const items = ["**Free** delivery today", "Easy returns"];
    // "Free delivery| today"
    expect(splitItem(items, 0, runs(items[0]), 13)).toEqual({
      items: ["**Free** delivery", " today", "Easy returns"],
      index: 1,
      caret: 0,
    });
    // At the end: a new empty point after it.
    expect(splitItem(items, 1, runs(items[1]), 12)).toEqual({
      items: ["**Free** delivery today", "Easy returns", ""],
      index: 2,
      caret: 0,
    });
    // A selection is replaced; bold words split stay bold on both sides.
    expect(splitItem(["**big deal**"], 0, runs("**big deal**"), 3, 4)).toEqual({
      items: ["**big**", "**deal**"],
      index: 1,
      caret: 0,
    });
    const full = Array.from({ length: MAX_LIST_ITEMS }, (_, i) => `p${i}`);
    expect(splitItem(full, 0, runs("p0"), 2)).toBeNull();
  });

  it("Backspace at the start removes an empty point or joins it to the one before", () => {
    const items = ["Free delivery", "", "Support"];
    // Formatting covers whole words, so it's kept where the points meet at a space.
    expect(
      joinPrevious(["Free ", "**delivery** now"], 1, runs("**delivery** now")),
    ).toEqual({ items: ["Free **delivery** now"], index: 0, caret: 5 });
    expect(joinPrevious(items, 1, runs(""))).toEqual({
      items: ["Free delivery", "Support"],
      index: 0,
      caret: 13,
    });
    expect(joinPrevious(items, 2, runs("__on__ WhatsApp"))).toEqual({
      items: ["Free delivery", "__on__ WhatsApp"],
      index: 1,
      caret: 0,
    });
    // The first point: an empty one goes when others follow, else nothing.
    expect(joinPrevious(["", "b"], 0, runs(""))).toEqual({
      items: ["b"],
      index: 0,
      caret: 0,
    });
    expect(joinPrevious(["a", "b"], 0, runs("a"))).toBeNull();
    expect(joinPrevious([""], 0, runs(""))).toBeNull();
  });

  it("↑/↓ keep what's typed and move to the next point", () => {
    expect(moveToItem(["a", "long point"], 0, runs("**a**"), 1, 1)).toEqual({
      items: ["**a**", "long point"],
      index: 1,
      caret: 1,
    });
    expect(
      moveToItem(["ab", "long point"], 1, runs("long point"), -1, 9),
    ).toEqual({ items: ["ab", "long point"], index: 0, caret: 2 });
    expect(moveToItem(["a"], 0, runs("a"), -1, 0)).toBeNull();
    expect(moveToItem(["a"], 0, runs("a"), 1, 0)).toBeNull();
  });

  it("saves one point per line, in the prop's own format", () => {
    expect(finishItems([" a ", "", "pasted\nlines", "  "])).toEqual([
      "a",
      "pasted",
      "lines",
    ]);
    expect(itemsValue(["a", "b"], ["x"])).toEqual(["a", "b"]);
    expect(itemsValue(["a", "b"], "x\ny")).toBe("a\nb");
  });
});
