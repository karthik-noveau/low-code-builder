import type { Section } from "./model";

/** Tablet and mobile overrides apply at or below these widths (the editor frames are 768px and 390px). */
export const BREAKPOINTS = { tablet: 768, mobile: 480 } as const;

/** Scoped CSS for a section's tablet/mobile overrides. Empty when there are none. */
export function responsiveCss(s: Section, editing = false) {
  // Ids are generated UUIDs; skip anything that could escape the selector.
  if (!s.responsive || !/^[\w-]+$/.test(s.id)) return "";
  const target = `[data-section-id="${s.id}"]`;
  return (["tablet", "mobile"] as const)
    .map((device) => {
      const o = s.responsive?.[device];
      if (!o) return "";
      const rules: string[] = [];
      const content: string[] = [];
      if (o.padding !== undefined)
        content.push(
          `padding-block:calc(${Math.round(o.padding)}px * var(--site-space, 1))!important`,
        );
      if (o.align) content.push(`text-align:${o.align}!important`);
      if (content.length)
        rules.push(`${target}>.site-section-content>*{${content.join(";")}}`);
      if (o.hidden !== undefined)
        rules.push(
          `${target}{${o.hidden ? (editing ? "opacity:.35" : "display:none") : editing ? "opacity:1" : "display:block"}}`,
        );
      return rules.length
        ? `@container (max-width:${BREAKPOINTS[device]}px){${rules.join("")}}`
        : "";
    })
    .join("");
}
