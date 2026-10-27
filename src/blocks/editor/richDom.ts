/**
 * Typing formatted text on the canvas. The text being typed is real DOM
 * (`<strong>`, `<em>`, `<a>`), built here from runs and read back into runs
 * (src/blocks/richtext.tsx), so the owner sees the formatting, never markers.
 * Formatting covers whole words: a selection grows to the words it touches.
 */
import {
  explode,
  implode,
  normalizeRuns,
  toTree,
  type InlineLink,
  type Marks,
  type RichOptions,
  type RichTree,
  type Run,
} from "../richtext";

/** Fills the element with the runs (elements and text nodes, never HTML). */
export function fillRich(el: HTMLElement, runs: Run[]) {
  const build = (tree: RichTree[]): globalThis.Node[] =>
    tree.flatMap((t): globalThis.Node[] => {
      if ("text" in t)
        return t.text
          .split("\n")
          .flatMap((part, n) => [
            ...(n ? [document.createElement("br")] : []),
            ...(part ? [document.createTextNode(part)] : []),
          ]);
      const tag =
        t.mark === "b" ? "strong" : t.mark === "link" ? "a" : ("em" as const);
      const node = document.createElement(tag);
      if (t.mark === "i") node.className = "blk-i";
      if (t.mark === "link") {
        node.setAttribute("href", t.link.href);
        node.dataset.href = t.link.href;
        if (t.link.newTab) node.dataset.newTab = "";
      }
      node.append(...build(t.children));
      return [node];
    });
  el.replaceChildren(...build(toTree(runs)));
}

type Walk = {
  runs: Run[];
  /** Where each DOM node's text starts and ends. */
  at: Map<globalThis.Node, [number, number]>;
  length: number;
};
const BLOCK = /^(DIV|P|LI|H[1-6])$/;
/** Reads what's typed: browsers add <b>, <i>, styled spans, <div> lines. */
function walk(el: HTMLElement, options: RichOptions): Walk {
  const out: Walk = { runs: [], at: new Map(), length: 0 };
  const push = (text: string, marks: Marks) => {
    out.runs.push({ text, ...marks });
    out.length += text.length;
  };
  const visit = (node: globalThis.Node, marks: Marks) => {
    const start = out.length;
    if (node.nodeType === Node.TEXT_NODE) {
      push((node.textContent ?? "").replace(/\u00a0/g, " "), marks);
    } else if (node instanceof HTMLElement) {
      const tag = node.tagName;
      if (tag === "BR") push("\n", {});
      else {
        if (
          node !== el &&
          BLOCK.test(tag) &&
          out.length &&
          !out.runs[out.runs.length - 1].text.endsWith("\n")
        )
          push("\n", {});
        const m = { ...marks };
        const weight =
          node.style.fontWeight === "bold"
            ? 700
            : Number(node.style.fontWeight) || 0;
        if (tag === "STRONG" || tag === "B" || weight >= 600) m.b = true;
        if (tag === "I" || node.style.fontStyle === "italic") m.i = true;
        if (tag === "EM") {
          if (node.classList.contains("blk-i") || !options.accent) m.i = true;
          else m.accent = true;
        }
        if (tag === "A") {
          const href = node.dataset.href ?? node.getAttribute("href") ?? "";
          if (href)
            m.link = {
              href,
              ...(node.dataset.newTab !== undefined ? { newTab: true } : {}),
            };
        }
        node.childNodes.forEach((child) =>
          visit(child, node === el ? marks : m),
        );
      }
    }
    out.at.set(node, [start, out.length]);
  };
  visit(el, {});
  return out;
}
export function readRich(el: HTMLElement, options: RichOptions): Run[] {
  const runs = walk(el, options).runs;
  // The line break browsers keep at the very end isn't text.
  const { text, marks } = explode(runs);
  const end = text.replace(/\n+$/, "").length;
  return implode(text.slice(0, end), marks.slice(0, end));
}

/** The selection as text offsets inside the element (null: not inside). */
export function selectionOffsets(
  el: HTMLElement,
  options: RichOptions,
): [number, number] | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer))
    return null;
  return rangeOffsets(el, range, options);
}
export function rangeOffsets(
  el: HTMLElement,
  range: Range,
  options: RichOptions,
): [number, number] {
  const w = walk(el, options);
  const point = (node: globalThis.Node, offset: number) => {
    if (node.nodeType === Node.TEXT_NODE)
      return (w.at.get(node)?.[0] ?? 0) + offset;
    const child = node.childNodes[offset];
    if (child) return w.at.get(child)?.[0] ?? 0;
    return w.at.get(node)?.[1] ?? w.length;
  };
  const a = point(range.startContainer, range.startOffset);
  const b = point(range.endContainer, range.endOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

/** Selects text offsets (after fillRich: text nodes and <br>s only). */
export function selectOffsets(el: HTMLElement, start: number, end: number) {
  const leaves: { node: globalThis.Node; start: number; len: number }[] = [];
  let at = 0;
  const visit = (node: globalThis.Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      leaves.push({ node, start: at, len });
      at += len;
    } else if (node instanceof HTMLElement && node.tagName === "BR") {
      leaves.push({ node, start: at, len: 1 });
      at += 1;
    } else node.childNodes.forEach(visit);
  };
  el.childNodes.forEach(visit);
  /** A DOM point: inside the text that starts (after) or ends (before) here. */
  const point = (off: number, after: boolean): [globalThis.Node, number] => {
    for (const l of leaves) {
      if (l.node.nodeType !== Node.TEXT_NODE) continue;
      if (
        after
          ? off >= l.start && off < l.start + l.len
          : off > l.start && off <= l.start + l.len
      )
        return [l.node, off - l.start];
    }
    for (const l of leaves) {
      const parent = l.node.parentNode!;
      const index = Array.prototype.indexOf.call(parent.childNodes, l.node);
      if (l.start === off) return [parent, index];
      if (l.start + l.len === off) return [parent, index + 1];
    }
    return [el, el.childNodes.length];
  };
  const collapsed = start === end;
  const range = document.createRange();
  const [sn, so] = point(start, !collapsed || start === 0);
  range.setStart(sn, so);
  if (collapsed) range.collapse(true);
  else {
    const [en, eo] = point(end, false);
    range.setEnd(en, eo);
  }
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const WORD = /[\p{L}\p{N}]/u;
/** Grows a range to whole words and drops spaces at its edges. */
export function wordRange(text: string, start: number, end: number) {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (s === e && start < end) return [s, s] as const;
  if (s === e) {
    // A caret: the word it is in.
    while (s > 0 && WORD.test(text[s - 1])) s--;
    while (e < text.length && WORD.test(text[e])) e++;
    return [s, e] as const;
  }
  while (s > 0 && WORD.test(text[s - 1]) && WORD.test(text[s])) s--;
  while (e < text.length && WORD.test(text[e - 1]) && WORD.test(text[e])) e++;
  return [s, e] as const;
}

export type MarkKey = "b" | "i" | "accent";
/** Whether every letter in the range has the mark. */
export function rangeHas(
  runs: Run[],
  start: number,
  end: number,
  key: MarkKey,
) {
  const { text, marks } = explode(runs);
  let any = false;
  for (let n = start; n < end; n++) {
    if (/\s/.test(text[n])) continue;
    any = true;
    if (!marks[n][key]) return false;
  }
  return any;
}
/** Adds or removes a mark on whole words (removes when they all have it). */
export function toggleMark(
  runs: Run[],
  start: number,
  end: number,
  key: MarkKey,
  options: RichOptions,
): { runs: Run[]; range: readonly [number, number] } {
  const { text, marks } = explode(runs);
  const range = wordRange(text, start, end);
  const on = !rangeHas(runs, range[0], range[1], key);
  const next = marks.map((m, n) => {
    if (n < range[0] || n >= range[1]) return m;
    const copy = { ...m };
    if (on) copy[key] = true;
    else delete copy[key];
    return copy;
  });
  return { runs: normalizeRuns(implode(text, next), options), range };
}
/** The link at a caret or selection: its address and the words it covers. */
export function linkAt(runs: Run[], start: number, end: number) {
  const { text, marks } = explode(runs);
  const probe = start < end ? start : Math.max(0, start - 1);
  const pick = [probe, start].find((n) => marks[n]?.link);
  if (pick === undefined) return null;
  const link = marks[pick].link!;
  const same = (n: number) =>
    marks[n]?.link?.href === link.href &&
    !marks[n].link!.newTab === !link.newTab;
  let s = pick;
  let e = pick + 1;
  while (s > 0 && same(s - 1)) s--;
  while (e < text.length && same(e)) e++;
  return { link, range: [s, e] as const };
}
/** Links (or unlinks, with null) whole words. */
export function setLink(
  runs: Run[],
  start: number,
  end: number,
  link: InlineLink | null,
  options: RichOptions,
) {
  const { text, marks } = explode(runs);
  const range = wordRange(text, start, end);
  const next = marks.map((m, n) => {
    if (n < range[0] || n >= range[1]) return m;
    const copy = { ...m };
    if (link) copy.link = link;
    else delete copy.link;
    return copy;
  });
  return { runs: normalizeRuns(implode(text, next), options), range };
}

/**
 * The text being typed, for the text tools (one at a time). The toolbar reads
 * it on click; `richBus` says when the selection or formatting changed and
 * when ⌘K asked for the link box.
 */
export interface RichController {
  element: HTMLElement;
  options: RichOptions;
  /** Words are selected (or were, before the link box took focus). */
  hasSelection(): boolean;
  /** Marks of the selected words. */
  state(): { b: boolean; i: boolean; accent: boolean; link: InlineLink | null };
  toggle(key: MarkKey): void;
  /** Remembers the words a link will go on; false when there are none. */
  prepareLink(): boolean;
  /** Links (null: unlinks) the remembered words; an error message, if any. */
  applyLink(link: InlineLink | null): string | undefined;
  /** Puts the typing focus (and selection) back. */
  focus(): void;
  /** Saves and stops typing. */
  finish(): void;
}
export const richEditing: { current: RichController | null } = {
  current: null,
};
export const richBus = new EventTarget();
/** Says which shortcut was pressed while typing (the text tools act on it). */
export const richShortcut = (name: "b" | "i" | "link") =>
  richBus.dispatchEvent(new CustomEvent("shortcut", { detail: name }));

/** What an owner types as an address, as a link (www.… gets https://). */
export function linkFromInput(input: string): string {
  const v = input.trim();
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(v)) return `mailto:${v}`;
  if (/^\+?[0-9][0-9 ()-]{5,19}$/.test(v))
    return `tel:${v.replace(/[ ()-]/g, "")}`;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]\S*)?$/i.test(v))
    return `https://${v}`;
  return v;
}

/**
 * Whether the caret is on the first (`up`) or last line of the element, so
 * ↑/↓ would leave it. Without layout (no caret box) it counts as on the edge.
 */
export function caretOnEdgeLine(el: HTMLElement, up: boolean): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(up);
  const caret = Array.from(range.getClientRects()).find((r) => r.height > 0);
  const box = el.getBoundingClientRect();
  if (!caret || !box.height) return true;
  const line =
    parseFloat(getComputedStyle(el).lineHeight) || caret.height || 16;
  return up
    ? caret.top - box.top < line * 0.75
    : box.bottom - caret.bottom < line * 0.75;
}
