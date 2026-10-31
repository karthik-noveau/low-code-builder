/**
 * Block styles as CSS. Each styled node gets a rule on `.n-<id>`, and its
 * tablet/phone overrides go in container queries on the page (the editor's
 * device frames and real screens alike). Theme tokens become the site's CSS
 * variables, so changing the theme restyles every block that uses them.
 */
import { BREAKPOINTS } from "../studio/responsive";
import { safeImage } from "../studio/model";
import { walk, type Node, type Style } from "./model";

const COLORS: Record<string, string> = {
  accent: "var(--site-accent)",
  accentText: "var(--site-accent-text, #fff)",
  text: "var(--site-color)",
  muted: "color-mix(in srgb, var(--site-color) 64%, transparent)",
  background: "var(--site-background)",
  surface: "color-mix(in srgb, var(--site-color) 4%, var(--site-background))",
  line: "color-mix(in srgb, var(--site-color) 13%, transparent)",
};
/** Font sizes scale with the theme's type scale and shrink on small screens. */
const SIZES: Record<string, string> = {
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "19px",
  xl: "calc(clamp(20px, 2.2cqw, 24px) * var(--site-scale, 1))",
  "2xl": "calc(clamp(24px, 3cqw, 32px) * var(--site-scale, 1))",
  "3xl": "calc(clamp(28px, 4cqw, 46px) * var(--site-scale, 1))",
  "4xl": "calc(clamp(36px, 5.5cqw, 72px) * var(--site-scale, 1))",
};
const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgb(0 0 0 / 6%), 0 1px 1px rgb(0 0 0 / 4%)",
  md: "0 6px 18px -6px rgb(0 0 0 / 14%), 0 2px 4px rgb(0 0 0 / 5%)",
  lg: "0 24px 48px -16px rgb(0 0 0 / 22%), 0 4px 10px rgb(0 0 0 / 6%)",
};
const FLEX: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  between: "space-between",
};
const WIDTHS = { narrow: 680, normal: 1120, wide: 1320, full: 0 };

/** A colour token or a hex/rgb value; anything else is dropped. */
export function color(value: string | undefined) {
  if (!value) return "";
  if (value in COLORS) return COLORS[value];
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\([\d\s.,%/]+\)$/i.test(value)
    ? value
    : "";
}
/** How light a typed (opaque hex or rgb) colour is, 0–1; null for tokens and see-through colours. */
export function lightness(value: string | undefined): number | null {
  if (!value || value in COLORS || !color(value)) return null;
  let rgba: number[];
  if (value.startsWith("#")) {
    const h = value.slice(1);
    const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    rgba = (full.match(/../g) ?? []).map((x) => parseInt(x, 16));
    if (rgba.length > 3) rgba[3] /= 255;
  } else {
    rgba = (value.match(/[\d.]+%?/g) ?? []).map((x, i) =>
      x.endsWith("%") ? (parseFloat(x) / 100) * (i < 3 ? 255 : 1) : Number(x),
    );
  }
  if (rgba.length < 3 || (rgba[3] ?? 1) < 0.9) return null;
  const lin = (v: number) =>
    (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(rgba[0]) + 0.7152 * lin(rgba[1]) + 0.0722 * lin(rgba[2]);
}
const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const sides = (s: number[]) => s.map(px).join(" ");

/** Declarations for one style, as `prop:value` strings. */
export function declarations(
  s: Style,
  type?: Node["type"],
  device?: "tablet" | "mobile",
): string[] {
  const out: string[] = [];
  const add = (prop: string, value: string | undefined) =>
    value && out.push(`${prop}:${value}`);
  const grid =
    type === "grid" ||
    type === "columns" ||
    type === "products" ||
    type === "repeat";
  // Grids read their column count from variables, so tablet and phone
  // fall back to fewer columns unless they set their own (see blocks.css).
  if (s.columns !== undefined && grid)
    add(
      device === "tablet" ? "--cols-t" : device === "mobile" ? "--cols-m" : "--cols",
      String(Math.max(1, Math.min(6, Math.round(s.columns)))),
    );
  if (s.direction && !grid) add("flex-direction", s.direction);
  if (s.gap !== undefined) add("gap", px(s.gap));
  if (s.align) add("align-items", FLEX[s.align]);
  if (s.justify && !grid) add("justify-content", FLEX[s.justify]);
  if (s.wrap !== undefined && !grid) add("flex-wrap", s.wrap ? "wrap" : "nowrap");
  if (s.width === "full") add("width", "100%");
  else if (s.width === "auto") add("width", "auto");
  // A set width holds in rows (no growing or shrinking, which would let the
  // row's shared 240px basis win) but never overflows its parent.
  else if (typeof s.width === "number") {
    add("width", px(s.width));
    if (!s.maxWidth) add("max-width", "100%");
    add("flex", "0 0 auto");
  }
  if (s.maxWidth) add("max-width", px(s.maxWidth));
  if (s.minHeight) add("min-height", px(s.minHeight));
  if (s.height !== undefined) add("height", px(s.height));
  if (s.padding)
    add(
      "padding",
      type === "section"
        ? s.padding
            .map((n, i) =>
              i % 2 === 0 ? `calc(${px(n)} * var(--site-space, 1))` : px(n),
            )
            .join(" ")
        : sides(s.padding),
    );
  if (s.margin) add("margin", sides(s.margin));
  if (s.fontSize) add("font-size", SIZES[s.fontSize] ?? (/^\d+$/.test(s.fontSize) ? `${s.fontSize}px` : ""));
  if (s.fontWeight) add("font-weight", String(s.fontWeight));
  if (s.textAlign) {
    add("text-align", s.textAlign);
    // Inherited by inline-sized blocks and paragraphs inside (blocks.css).
    add("--blk-self", { left: "flex-start", center: "center", right: "flex-end" }[s.textAlign]);
    add("--blk-margin", { left: "0", center: "auto", right: "auto 0" }[s.textAlign]);
  }
  if (s.lineHeight) add("line-height", String(s.lineHeight));
  if (s.letterSpacing !== undefined) add("letter-spacing", px(s.letterSpacing));
  if (s.uppercase !== undefined) add("text-transform", s.uppercase ? "uppercase" : "none");
  if (s.italic !== undefined) add("font-style", s.italic ? "italic" : "normal");
  if (s.font)
    add("font-family", s.font === "heading" ? "var(--site-heading-font, inherit)" : "inherit");
  // A typed colour doesn't follow the theme, so where the site is dark (the
  // visitor's dark theme, a dark section) dark text and light backgrounds swap
  // for readable ones. The plain value stays first for older browsers.
  const scheme = (prop: string, value: string, dark: string | false) => {
    add(prop, value);
    if (dark) add(prop, `light-dark(${value}, ${dark})`);
  };
  const ink = lightness(s.color);
  // As a text colour the accent is lifted on dark backgrounds (blocks.css).
  if (s.color === "accent") add("color", "var(--blk-ink, var(--site-accent))");
  else
    scheme(
      "color",
      color(s.color),
      ink !== null && ink < 0.4 && `color-mix(in srgb, ${s.color} 40%, #fff)`,
    );
  const fill = lightness(s.background);
  const image = s.backgroundImage ? safeImage(s.backgroundImage) : "";
  const overlay = Math.max(0, Math.min(90, s.overlay ?? 0)) / 100;
  if (image)
    add(
      "background",
      `${overlay ? `linear-gradient(rgb(0 0 0 / ${overlay}), rgb(0 0 0 / ${overlay})), ` : ""}url("${image.replace(/["\\\n]/g, "")}") center / cover no-repeat${color(s.background) ? ` ${color(s.background)}` : ""}`,
    );
  else
    scheme(
      "background",
      color(s.background),
      fill !== null &&
        fill > 0.35 &&
        `color-mix(in srgb, ${s.background} 10%, var(--site-background))`,
    );
  if (s.borderWidth !== undefined)
    add(
      "border",
      s.borderWidth
        ? `${px(s.borderWidth)} solid ${color(s.borderColor) || COLORS.line}`
        : "0",
    );
  else if (s.borderColor) add("border-color", color(s.borderColor));
  if (s.radius !== undefined)
    add(
      "border-radius",
      s.radius === "theme"
        ? "var(--site-radius)"
        : s.radius === "full"
          ? "999px"
          : px(s.radius),
    );
  if (s.shadow) add("box-shadow", SHADOWS[s.shadow]);
  if (s.opacity !== undefined) add("opacity", String(s.opacity / 100));
  return out;
}

/** A section's content column: its max width (`0` = full bleed). */
export const contentMax = (s?: Style) =>
  WIDTHS[s?.contentWidth ?? "normal"];

const safeId = (id: string) => /^[\w-]+$/.test(id);

/**
 * The CSS for every node in these trees. A section's content width goes on
 * its inner column; everything else on the node itself. Selectors are
 * `.website .n-<id>.blk` so an owner's style outranks the block defaults in
 * blocks.css (and website.css's element rules) without !important.
 */
export function treeCss(roots: Node[], editing = false) {
  const base: string[] = [];
  const at: Record<"tablet" | "mobile", string[]> = { tablet: [], mobile: [] };
  for (const n of walk(roots)) {
    if (!safeId(n.id)) continue;
    const sel = `.website .n-${n.id}.blk`;
    const rule = (s: Style | undefined, device?: "tablet" | "mobile") => {
      if (!s) return "";
      const d = declarations(s, n.type, device);
      // Hidden at this size: gone on the site, faded in the editor.
      if (s.hidden) d.push(editing ? "opacity:.35" : "display:none!important");
      const inner =
        n.type === "section" && s.contentWidth
          ? `${sel}>.blk-inner{max-width:${contentMax(s) ? px(contentMax(s)) : "none"}}`
          : "";
      // Layout declarations on a section apply to its inner column.
      if (n.type === "section") {
        const layout = d.filter((x) =>
          /^(gap|align-items|justify-content|flex-direction|flex-wrap):/.test(x),
        );
        const own = d.filter((x) => !layout.includes(x));
        return (
          (own.length ? `${sel}{${own.join(";")}}` : "") +
          (layout.length ? `${sel}>.blk-inner{${layout.join(";")}}` : "") +
          inner
        );
      }
      // A row stacked into a column: the blocks that share its width
      // (flex-basis 240px, blocks.css) mustn't become 240px tall.
      const stacked =
        n.type === "row" && s.direction === "column"
          ? `${sel}>.blk{flex-basis:auto}`
          : "";
      // A repeat's space between goes to its cards too (looks set their own).
      const cards =
        n.type === "repeat" && s.gap !== undefined
          ? `${sel}>.blk-repeat-items{gap:${px(s.gap)}}`
          : "";
      return (d.length ? `${sel}{${d.join(";")}}` : "") + stacked + cards;
    };
    base.push(rule(n.style));
    at.tablet.push(rule(n.tablet, "tablet"));
    at.mobile.push(rule(n.mobile, "mobile"));
  }
  return (
    base.join("") +
    (["tablet", "mobile"] as const)
      .map((d) =>
        at[d].join("")
          ? `@container (max-width:${BREAKPOINTS[d]}px){${at[d].join("")}}`
          : "",
      )
      .join("")
  );
}
