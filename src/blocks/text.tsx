/**
 * Reading block content: "one per line" lists, "Label | target" pairs,
 * *accent* words in headings and video links. Shared by the renderer and
 * anything else that shows block text.
 */
import type { ReactNode } from "react";
import type { PropValue } from "./model";

export const lines = (v: PropValue | undefined) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
    .map((l) => l.trim())
    .filter(Boolean);
/** "Label | target" lines (menus, accordions, social links). */
export const pairs = (v: PropValue | undefined) =>
  lines(v).map((l) => {
    const [a, ...rest] = l.split("|");
    return [a.trim(), rest.join("|").trim()] as const;
  });

/** Text wrapped in *asterisks* is shown in the accent colour. */
export function emphasis(value: string): ReactNode[] {
  return value
    .split(/\*([^*\n]+)\*/)
    .map((part, n) => (n % 2 ? <em key={n}>{part}</em> : part));
}

/** A YouTube or Vimeo page link as its privacy-friendly embed address. */
export function embedUrl(url: string) {
  const yt =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(
      url,
    );
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return "";
}
