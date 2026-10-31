/**
 * A readable accent for sites whose buttons are hard to read: white button
 * text needs 4.5:1 on the accent. Templates that moved to darker accents map
 * their old colour to the new one; any other accent darkens in its own hue
 * just far enough.
 */
const OLD_TEMPLATE_ACCENTS: Record<string, string> = {
  "#e07400": "#b85600", // Dhanlaxmi
  "#e8730c": "#b85600", // Volt
  "#b5655a": "#a65a50", // Glow
  "#2f9e44": "#28803a", // Fresh Basket
  "#e5484d": "#cf3439", // Pulse
};
const rgb = (hex: string) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = ([r, g, b]: number[]) => {
  const f = (v: number) =>
    (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** Contrast of white text on this colour. */
export const onWhite = (hex: string) => {
  const c = rgb(hex);
  return c ? 1.05 / (luminance(c) + 0.05) : 21;
};
const toHex = (c: number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** The accent to offer instead, or null when this one already reads well. */
export function readableAccent(accent: string): string | null {
  const known = OLD_TEMPLATE_ACCENTS[accent.trim().toLowerCase()];
  if (known) return known;
  const c = rgb(accent);
  if (!c || onWhite(accent) >= 4.5) return null;
  // Toward black a step at a time keeps the hue.
  for (let k = 0.98; k > 0.3; k -= 0.02) {
    const next = c.map((v) => v * k);
    if (1.05 / (luminance(next) + 0.05) >= 4.6) return toHex(next);
  }
  return null;
}
