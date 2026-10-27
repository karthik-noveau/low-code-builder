/**
 * Formatting inside block text: bold, italic and links on words, stored as a
 * small markup in the same string props (so drafts, releases and validation
 * keep working, and text without markers means exactly what it did).
 *
 *   **bold**   __italic__   [words](https://example.com)
 *   [words](/menu "new tab")   *accent*  (headings only, as before)
 *
 * Rules that keep ordinary business text literal:
 * - Markers only count in pairs on one line, hugging the words they wrap
 *   (`** x **` and `2**3**4` stay as typed; a single `_` never counts, so
 *   emails, handles and file names are safe).
 * - A link needs `](` right after the words and a link-shaped address
 *   (http(s), /page, #section, tel:, mailto:…). Only addresses `safeLink`
 *   accepts become links; any other shows its words as plain text.
 * - `\` before `\ * _ [ ]` keeps that character literal (the editor writes
 *   these when someone types markers as text).
 *
 * Text is drawn as React elements (`<strong>`, `<em>`, `<a>`), never as HTML.
 */
import { Fragment, type ReactNode } from "react";
import { safeLink } from "./logic/model";
import type { NodeType, Props, PropValue } from "./model";

export interface InlineLink {
  href: string;
  newTab?: boolean;
}
export interface Marks {
  b?: boolean;
  i?: boolean;
  /** Headings: the accent colour (`*word*`). */
  accent?: boolean;
  link?: InlineLink;
}
export interface Run extends Marks {
  text: string;
}
export interface RichOptions {
  /** `*word*` is the accent colour (headings). */
  accent?: boolean;
}

/** Links one block's text may hold. */
export const MAX_INLINE_LINKS = 20;
/** Which props of which blocks take inline formatting. */
export const RICH_PROPS: Partial<Record<NodeType, string>> = {
  heading: "text",
  text: "text",
  list: "items",
};
export const richOptionsFor = (type: NodeType): RichOptions => ({
  accent: type === "heading",
});
/**
 * Blocks whose "Question | Answer" lines take formatting in the answer only
 * (the question is a `<summary>`, which can't hold a link).
 */
export const RICH_ANSWERS: Partial<Record<NodeType, string>> = {
  accordion: "items",
};
const asLines = (v: PropValue | undefined) =>
  Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
/** "Question | Answer" split at the first bar (as `pairs` reads it). */
const answerAt = (line: string) => {
  const bar = line.indexOf("|");
  return bar < 0
    ? null
    : { question: line.slice(0, bar), answer: line.slice(bar + 1) };
};
/** Every string of a block that takes formatting (for links: count, check). */
export function formattedText(type: NodeType, props: Props): string[] {
  const rich = RICH_PROPS[type];
  if (rich) return asLines(props[rich]);
  const answers = RICH_ANSWERS[type];
  if (answers)
    return asLines(props[answers]).flatMap((l) => {
      const at = answerAt(l);
      return at ? [at.answer.trim()] : [];
    });
  return [];
}
/** Every safe address a block's formatted text links to. */
export const formattedLinks = (type: NodeType, props: Props) =>
  inlineLinks(formattedText(type, props), richOptionsFor(type));
/** Props with the links in formatted text rewritten (page renames). */
export function mapFormattedLinks(
  type: NodeType,
  props: Props,
  fn: (url: string) => string,
): Props {
  const o = richOptionsFor(type);
  const rich = RICH_PROPS[type];
  if (rich) {
    const v = props[rich];
    if (typeof v === "string")
      return { ...props, [rich]: mapInlineLinks(v, o, fn) };
    if (Array.isArray(v))
      return { ...props, [rich]: v.map((line) => mapInlineLinks(line, o, fn)) };
    return props;
  }
  const answers = RICH_ANSWERS[type];
  const v = answers ? props[answers] : undefined;
  if (!answers || (typeof v !== "string" && !Array.isArray(v))) return props;
  const fix = (line: string) => {
    const at = answerAt(line);
    if (!at) return line;
    const answer = mapInlineLinks(at.answer, o, fn);
    return answer === at.answer ? line : `${at.question}|${answer}`;
  };
  return {
    ...props,
    [answers]:
      typeof v === "string" ? v.split("\n").map(fix).join("\n") : v.map(fix),
  };
}

const NEW_TAB = ' "new tab"';
const SPECIAL = "\\*_[]";
const LINK_CLOSE = /\]\(([^\s()<>"'\\]{1,2000})( "new tab")?\)/y;
const LINK_SHAPED = /^(?:[a-z][a-z0-9+.-]{0,30}:|\/|#)/i;
const WORD = /[\p{L}\p{N}]/u;
const word = (c: string) => !!c && WORD.test(c);
const space = (c: string) => !c || /\s/.test(c);
/** Whether a string has anything the parser could read as markup. */
export const mayHaveMarkup = (s: string) => /\*|__|\]\(|\\/.test(s);

type Kind = "b" | "i" | "accent" | "link";
type Item =
  | { t: "text"; text: string }
  | {
      t: "open";
      kind: Kind;
      raw: string;
      matched?: boolean;
      link?: InlineLink | null;
    }
  | { t: "close"; kind: Kind };

/** Reads text with markup into runs of equally formatted text. */
export function parseInline(
  source: string,
  options: RichOptions = {},
  maxLinks = MAX_INLINE_LINKS,
): Run[] {
  if (!mayHaveMarkup(source)) return source ? [{ text: source }] : [];
  const items: Item[] = [];
  const stack: number[] = [];
  let links = 0;
  const text = (s: string) => items.push({ t: "text", text: s });
  const open = (kind: Kind, raw: string) => {
    items.push({ t: "open", kind, raw });
    stack.push(items.length - 1);
  };
  const kindAt = (k: number) => (items[stack[k]] as { kind: Kind }).kind;
  /** Closes the opener at stack position k; openers above it stay text. */
  const closeAt = (k: number, link?: InlineLink | null) => {
    const opener = items[stack[k]] as Extract<Item, { t: "open" }>;
    opener.matched = true;
    if (opener.kind === "link") opener.link = link ?? null;
    stack.length = k;
    items.push({ t: "close", kind: opener.kind });
  };
  const nearest = (kinds: Kind[]) => {
    for (let k = stack.length - 1; k >= 0; k--)
      if (kinds.includes(kindAt(k))) return k;
    return -1;
  };
  const run = (c: string, len: number, prev: string, next: string) => {
    const canOpen = !space(next) && !(word(prev) && word(next));
    const canClose = !space(prev) && !(word(prev) && word(next));
    if (c === "_") {
      if (len !== 2) return text(c.repeat(len));
      const k = canClose ? nearest(["i"]) : -1;
      if (k >= 0) return closeAt(k);
      return canOpen ? open("i", "__") : text("__");
    }
    if (len === 1 && options.accent) {
      // As before: any *words* on one line (no flanking rules).
      const k = prev && prev !== "\n" ? nearest(["accent"]) : -1;
      if (k >= 0) return closeAt(k);
      return next && next !== "\n" ? open("accent", "*") : text("*");
    }
    if (len === 2) {
      const k = canClose ? nearest(["b"]) : -1;
      if (k >= 0) return closeAt(k);
      return canOpen ? open("b", "**") : text("**");
    }
    if (len !== 3 || !options.accent) return text(c.repeat(len));
    // `***`: closes and opens accent and bold together.
    let left = 3;
    while (canClose && left > 0) {
      const k = nearest(["b", "accent"]);
      if (k < 0) break;
      const need = kindAt(k) === "b" ? 2 : 1;
      if (need > left) break;
      closeAt(k);
      left -= need;
    }
    if (!left) return;
    if (!canOpen) return text("*".repeat(left));
    if (left !== 2) open("accent", "*");
    if (left !== 1) open("b", "**");
  };

  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "\\" && i + 1 < n && SPECIAL.includes(source[i + 1])) {
      text(source[i + 1]);
      i += 2;
    } else if (c === "\n") {
      text("\n");
      stack.length = 0;
      i += 1;
    } else if (c === "*" || c === "_") {
      let j = i;
      while (j < n && source[j] === c) j++;
      run(c, j - i, source[i - 1] ?? "", source[j] ?? "");
      i = j;
    } else if (c === "[") {
      open("link", "[");
      i += 1;
    } else if (c === "]") {
      LINK_CLOSE.lastIndex = i;
      const m = LINK_CLOSE.exec(source);
      const k = m && LINK_SHAPED.test(m[1]) ? nearest(["link"]) : -1;
      if (m && k >= 0) {
        const ok = safeLink(m[1]) && links < maxLinks;
        if (ok) links += 1;
        // Links can't hold links: earlier "[" stay text.
        const below = stack
          .slice(0, k)
          .filter((_, at) => kindAt(at) !== "link");
        closeAt(
          k,
          ok ? { href: m[1], ...(m[2] ? { newTab: true } : {}) } : null,
        );
        stack.splice(0, stack.length, ...below);
        i += m[0].length;
      } else {
        text("]");
        i += 1;
      }
    } else {
      let j = i + 1;
      while (j < n && !"\\\n*_[]".includes(source[j])) j++;
      text(source.slice(i, j));
      i = j;
    }
  }

  const runs: Run[] = [];
  const count = { b: 0, i: 0, accent: 0 };
  const linked: (InlineLink | null)[] = [];
  const push = (s: string) => {
    let link: InlineLink | undefined;
    for (const l of linked) if (l) link = l;
    add(runs, {
      text: s,
      ...(count.b ? { b: true } : {}),
      ...(count.i ? { i: true } : {}),
      ...(count.accent ? { accent: true } : {}),
      ...(link ? { link } : {}),
    });
  };
  for (const it of items) {
    if (it.t === "text") push(it.text);
    else if (it.t === "open" && !it.matched) push(it.raw);
    else if (it.kind === "link") {
      if (it.t === "open") linked.push(it.link ?? null);
      else linked.pop();
    } else count[it.kind] += it.t === "open" ? 1 : -1;
  }
  return runs;
}

const sameLink = (a?: InlineLink, b?: InlineLink) =>
  a === b || (!!a && !!b && a.href === b.href && !a.newTab === !b.newTab);
const sameMarks = (a: Marks, b: Marks) =>
  !a.b === !b.b &&
  !a.i === !b.i &&
  !a.accent === !b.accent &&
  sameLink(a.link, b.link);
/** Appends text, joining it to the last run when it looks the same. */
function add(runs: Run[], run: Run) {
  if (!run.text) return;
  const last = runs[runs.length - 1];
  if (last && sameMarks(last, run)) last.text += run.text;
  else runs.push({ ...run });
}
export const sameRuns = (a: Run[], b: Run[]) =>
  a.length === b.length &&
  a.every((r, n) => r.text === b[n].text && sameMarks(r, b[n]));
/**
 * Whether two texts read the same: equal words, links and formatting, not
 * counting bold, italic or accent on spaces (they don't show).
 */
export function sameMeaning(a: Run[], b: Run[]) {
  const x = explode(a);
  const y = explode(b);
  if (x.text !== y.text) return false;
  for (let n = 0; n < x.text.length; n++) {
    const p = x.marks[n];
    const q = y.marks[n];
    if (!sameLink(p.link, q.link)) return false;
    if (
      !space(x.text[n]) &&
      !sameMarks({ ...p, link: undefined }, { ...q, link: undefined })
    )
      return false;
  }
  return true;
}
export const plainText = (runs: Run[]) => runs.map((r) => r.text).join("");

/** One mark set per character (editing works on these). */
export function explode(runs: Run[]): { text: string; marks: Marks[] } {
  const marks: Marks[] = [];
  for (const r of runs) {
    const { text, ...m } = r;
    for (let n = 0; n < text.length; n++) marks.push(m);
  }
  return { text: plainText(runs), marks };
}
export function implode(text: string, marks: Marks[]): Run[] {
  const runs: Run[] = [];
  for (let n = 0; n < text.length; n++) {
    const m = marks[n] ?? {};
    add(runs, {
      text: text[n],
      ...(m.b ? { b: true } : {}),
      ...(m.i ? { i: true } : {}),
      ...(m.accent ? { accent: true } : {}),
      ...(m.link ? { link: m.link } : {}),
    });
  }
  return runs;
}

/**
 * What the markup can say: formatting covers whole words, never a line break
 * or the spaces at its edges, accent only in headings, links only safe ones.
 */
export function normalizeRuns(runs: Run[], options: RichOptions = {}): Run[] {
  const { text, marks } = explode(runs);
  const m: Marks[] = marks.map((x, n) =>
    text[n] === "\n"
      ? {}
      : {
          ...(x.b ? { b: true } : {}),
          ...(x.i ? { i: true } : {}),
          ...(x.accent && options.accent ? { accent: true } : {}),
          ...(x.link && safeLink(x.link.href) ? { link: x.link } : {}),
        },
  );
  // A word takes the formatting of its first letter.
  for (let n = 1; n < text.length; n++)
    if (word(text[n - 1]) && word(text[n])) m[n] = m[n - 1];
  // Spaces at the edges of a stretch lose that formatting.
  for (const key of ["b", "i", "accent", "link"] as const) {
    const same = (a: Marks, b: Marks) =>
      key === "link" ? sameLink(a.link, b.link) : !!a[key] === !!b[key];
    let n = 0;
    while (n < text.length) {
      if (!m[n][key]) {
        n++;
        continue;
      }
      let end = n;
      while (end + 1 < text.length && m[end + 1][key] && same(m[n], m[end + 1]))
        end++;
      const drop = (at: number) => {
        const copy = { ...m[at] };
        delete copy[key];
        m[at] = copy;
      };
      for (let a = n; a <= end && space(text[a]); a++) drop(a);
      for (let a = end; a >= n && space(text[a]); a--) drop(a);
      n = end + 1;
    }
  }
  return implode(text, m);
}

/** Runs nested as they are written and drawn: link › accent › bold › italic. */
export type RichTree =
  | { text: string }
  | { mark: "link"; link: InlineLink; children: RichTree[] }
  | { mark: "accent" | "b" | "i"; children: RichTree[] };
const LEVELS = ["link", "accent", "b", "i"] as const;
export function toTree(runs: Run[], level = 0): RichTree[] {
  if (level >= LEVELS.length) return runs.map((r) => ({ text: r.text }));
  const key = LEVELS[level];
  const out: RichTree[] = [];
  let n = 0;
  while (n < runs.length) {
    const first = runs[n];
    let end = n + 1;
    const on = key === "link" ? !!first.link : !!first[key];
    while (
      end < runs.length &&
      (key === "link"
        ? sameLink(runs[end].link, first.link)
        : !!runs[end][key] === on)
    )
      end++;
    const inner = toTree(runs.slice(n, end), level + 1);
    if (!on) out.push(...inner);
    else if (key === "link")
      out.push({ mark: "link", link: first.link!, children: inner });
    else out.push({ mark: key, children: inner });
    n = end;
  }
  return out;
}

const escape = (s: string, all: boolean) =>
  all ? s.replace(/[\\*_[\]]/g, (c) => `\\${c}`) : s;
function write(tree: RichTree[], all: boolean): string {
  return tree
    .map((t) => {
      if ("text" in t) return escape(t.text, all);
      // Spaces at a group's edges go outside its markers (markers hug words).
      const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(
        write(t.children, all),
      )!;
      if (!inner) return before + after;
      const d =
        t.mark === "b"
          ? "**"
          : t.mark === "i"
            ? "__"
            : t.mark === "accent"
              ? "*"
              : "";
      const body =
        t.mark === "link"
          ? `[${inner}](${t.link.href}${t.link.newTab ? NEW_TAB : ""})`
          : d + inner + d;
      return before + body + after;
    })
    .join("");
}
/**
 * Runs as markup. Literal markers are escaped only when they would otherwise
 * be read as formatting, so ordinary text is stored exactly as typed.
 */
export function serializeInline(runs: Run[], options: RichOptions = {}) {
  const norm = normalizeRuns(runs, options);
  for (const all of [false, true]) {
    const s = write(toTree(norm), all);
    if (sameMeaning(parseInline(s, options), norm)) return s;
  }
  return escape(plainText(norm), true);
}

/** Every address the markup links to (safe ones, as drawn). */
export function inlineLinks(
  value: PropValue | undefined,
  options?: RichOptions,
) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const out: InlineLink[] = [];
  for (const s of list)
    for (const r of parseInline(s, options, Infinity))
      if (r.link && !sameLink(out[out.length - 1], r.link)) out.push(r.link);
  return out;
}
/** Rewrites link addresses (page renames); other text is left as it was. */
export function mapInlineLinks(
  value: string,
  options: RichOptions,
  fn: (url: string) => string,
): string {
  if (!value.includes("](")) return value;
  let changed = false;
  const runs = parseInline(value, options).map((r) => {
    if (!r.link) return r;
    const href = fn(r.link.href);
    if (href === r.link.href || !safeLink(href)) return r;
    changed = true;
    return { ...r, link: { ...r.link, href } };
  });
  return changed ? serializeInline(runs, options) : value;
}

export interface RichRender extends RichOptions {
  /** Turns an owner's address into an href (pages become .html on export). */
  href?: (url: string) => string;
  /** False inside something clickable: links show as their words. */
  links?: boolean;
  tabIndex?: number;
  /** Draws plain text (page values in "{var:name}"). */
  text?: (s: string) => ReactNode;
}
/** Text with its formatting, as React elements. */
export function richText(value: string, o: RichRender = {}): ReactNode {
  const text = o.text ?? ((s: string) => s);
  if (!mayHaveMarkup(value)) return text(value);
  const draw = (tree: RichTree[]): ReactNode[] =>
    tree.map((t, n) => {
      if ("text" in t) return <Fragment key={n}>{text(t.text)}</Fragment>;
      const inner = draw(t.children);
      if (t.mark === "b") return <strong key={n}>{inner}</strong>;
      if (t.mark === "i")
        return (
          <em key={n} className="blk-i">
            {inner}
          </em>
        );
      if (t.mark === "accent") return <em key={n}>{inner}</em>;
      if (o.links === false || t.mark !== "link")
        return <Fragment key={n}>{inner}</Fragment>;
      const external = /^https?:/i.test(t.link.href);
      return (
        <a
          key={n}
          href={o.href ? o.href(t.link.href) : t.link.href}
          tabIndex={o.tabIndex}
          {...(t.link.newTab
            ? { target: "_blank", rel: "noopener noreferrer" }
            : external
              ? { rel: "noopener noreferrer" }
              : {})}
        >
          {inner}
        </a>
      );
    });
  return draw(toTree(parseInline(value, o)));
}
