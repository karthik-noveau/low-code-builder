// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseInline, serializeInline, type Run } from "../richtext";
import {
  fillRich,
  linkAt,
  linkFromInput,
  readRich,
  selectionOffsets,
  selectOffsets,
  setLink,
  toggleMark,
  wordRange,
} from "./richDom";

const T = {};
const H = { accent: true };
const el = (html = "") => {
  const div = document.createElement("p");
  // Test fixtures only: what browsers leave behind while typing.
  div.innerHTML = html;
  document.body.append(div);
  return div;
};
const runs = (s: string, o = T) => parseInline(s, o);
const out = (r: Run[], o = T) => serializeInline(r, o);

describe("typing formatted text", () => {
  it("draws and reads back the same text", () => {
    for (const [s, o] of [
      ['Fresh **bread** and __cakes__,\nevery [day](/menu "new tab")', T],
      ["Buy from us. *Earn **big** rewards.*", H],
      ["plain", T],
      ["", T],
    ] as const) {
      const p = el();
      fillRich(p, runs(s, o));
      expect(p.querySelector("script")).toBeNull();
      expect(out(readRich(p, o), o)).toBe(s);
    }
  });

  it("draws real elements", () => {
    const p = el();
    fillRich(p, runs("a **b** __c__ [d](https://x.in)\ne", H));
    expect(p.innerHTML).toBe(
      'a <strong>b</strong> <em class="blk-i">c</em> <a href="https://x.in" data-href="https://x.in">d</a><br>e',
    );
    fillRich(p, runs("*accent*", H));
    expect(p.innerHTML).toBe("<em>accent</em>");
  });

  it("reads what browsers leave while typing", () => {
    const p = el(
      'One <b>two</b> <i>three</i><div><span style="font-weight: 700">four</span>&nbsp;five</div><div><br></div>',
    );
    expect(out(readRich(p, T))).toBe("One **two** __three__\n**four** five");
    // Text blocks have no accent: <em> is italic there.
    expect(out(readRich(el("<em>x</em>"), T))).toBe("__x__");
    expect(out(readRich(el("<em>x</em>"), H), H)).toBe("*x*");
  });

  it("maps selections to text and back", () => {
    const p = el();
    fillRich(p, runs("ab **cd** ef\ngh"));
    selectOffsets(p, 3, 5);
    expect(window.getSelection()?.toString()).toBe("cd");
    expect(selectionOffsets(p, T)).toEqual([3, 5]);
    selectOffsets(p, 9, 11);
    expect(window.getSelection()?.toString()).toBe("gh");
    expect(selectionOffsets(p, T)).toEqual([9, 11]);
    selectOffsets(p, 0, 0);
    expect(selectionOffsets(p, T)).toEqual([0, 0]);
  });

  it("formats whole words", () => {
    expect(wordRange("hello world", 2, 3)).toEqual([0, 5]);
    expect(wordRange("hello world", 3, 8)).toEqual([0, 11]);
    // Only a space selected: nothing to format.
    expect(wordRange("hello world", 5, 6)).toEqual([6, 6]);
    expect(wordRange("hello world", 7, 7)).toEqual([6, 11]);
    expect(wordRange(" hi ", 0, 4)).toEqual([1, 3]);
  });

  it("wraps and unwraps the selection", () => {
    const r = runs("Fresh bread daily");
    const bold = toggleMark(r, 7, 9, "b", T);
    expect(bold.range).toEqual([6, 11]);
    expect(out(bold.runs)).toBe("Fresh **bread** daily");
    // Again on the same words: off.
    expect(out(toggleMark(bold.runs, 6, 11, "b", T).runs)).toBe(
      "Fresh bread daily",
    );
    // Partly bold: all of it becomes bold.
    expect(out(toggleMark(bold.runs, 0, 11, "b", T).runs)).toBe(
      "**Fresh bread** daily",
    );
    // Nested formatting, and unwrapping only part of it.
    const both = toggleMark(bold.runs, 0, 17, "i", T).runs;
    expect(out(both)).toBe("__Fresh__ **__bread__** __daily__");
    expect(out(toggleMark(both, 12, 17, "i", T).runs)).toBe(
      "__Fresh__ **__bread__** daily",
    );
    expect(out(toggleMark(runs("a b", H), 0, 1, "accent", H).runs, H)).toBe(
      "*a* b",
    );
  });

  it("links, relinks and unlinks words", () => {
    const r = setLink(runs("See our menu"), 4, 12, { href: "/menu" }, T);
    expect(out(r.runs)).toBe("See [our menu](/menu)");
    expect(linkAt(r.runs, 6, 6)).toEqual({
      link: { href: "/menu" },
      range: [4, 12],
    });
    expect(linkAt(r.runs, 1, 1)).toBeNull();
    const tab = setLink(r.runs, 4, 12, { href: "/menu", newTab: true }, T);
    expect(out(tab.runs)).toBe('See [our menu](/menu "new tab")');
    expect(out(setLink(tab.runs, 4, 12, null, T).runs)).toBe("See our menu");
    // Unsafe addresses never become links.
    expect(
      out(setLink(runs("x"), 0, 1, { href: "javascript:alert(1)" }, T).runs),
    ).toBe("x");
  });

  it("turns typed addresses into links", () => {
    expect(linkFromInput(" www.shop.in ")).toBe("https://www.shop.in");
    expect(linkFromInput("shop.in/menu")).toBe("https://shop.in/menu");
    expect(linkFromInput("hi@shop.in")).toBe("mailto:hi@shop.in");
    expect(linkFromInput("+91 98765 43210")).toBe("tel:+919876543210");
    expect(linkFromInput("/menu")).toBe("/menu");
    expect(linkFromInput("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
