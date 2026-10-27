/**
 * Site-wide questions about logic (src/blocks/logic): which pages need the
 * logic script, the blocks "scroll to" clicks jump to, and the JSON config
 * a published page carries for the script (runtime.ts).
 */
import type { Page, Project, Section } from "../../studio/model";
import { walk, type Node } from "../model";
import {
  hasVars,
  NAVIGATION,
  runActions,
  type Condition,
  type PageVariable,
  type RunAction,
} from "./model";

/** The visible "blocks" sections a page shows (header, page, footer). */
const pageSections = (sections: Section[]) =>
  sections.filter((s) => !s.hidden && s.type === "blocks" && s.root);
function* shown(root: Node): Generator<Node> {
  if (root.hidden) return;
  yield root;
  for (const c of root.children ?? []) yield* shown(c);
}
/** Blocks "scroll to" clicks on these sections jump to. */
export function anchorsOf(sections: Section[]): Set<string> {
  const out = new Set<string>();
  for (const s of pageSections(sections))
    for (const n of shown(s.root!))
      for (const a of n.on?.click ?? [])
        if (a.do === "scroll") out.add(a.target);
  return out;
}
/** Whether these sections need the logic script. */
export function sectionsUseLogic(sections: Section[], page?: Page): boolean {
  for (const s of pageSections(sections))
    for (const n of shown(s.root!))
      if (
        n.on?.click?.some((a) => !NAVIGATION.has(a.do)) ||
        (n.on?.click?.length ?? 0) > 1 ||
        (n.when && n.when.rules.some((r) => r.if !== "item")) ||
        n.type === "dialog" ||
        (page?.variables?.length &&
          Object.values(n.props).some(
            (v) => typeof v === "string" && hasVars(v),
          ))
      )
        return true;
  return false;
}
/** What the logic script reads: the page values, clicks and conditions. */
export interface LogicConfig {
  vars: Record<
    string,
    { type: PageVariable["type"]; value: string; remember?: boolean }
  >;
  act: Record<string, RunAction[]>;
  when: Record<string, Condition>;
}
export function logicConfig(
  sections: Section[],
  page: Page | undefined,
  pageHref: (page: string) => string | undefined,
): LogicConfig {
  const config: LogicConfig = { vars: {}, act: {}, when: {} };
  for (const v of page?.variables ?? [])
    config.vars[v.name] = {
      type: v.type,
      value: v.value,
      ...(v.remember ? { remember: true } : {}),
    };
  for (const s of pageSections(sections))
    for (const n of shown(s.root!)) {
      const list = n.on?.click;
      if (list?.length) config.act[n.id] = runActions(list, pageHref);
      const rest = n.when?.rules.filter((r) => r.if !== "item");
      if (n.when && rest?.length)
        config.when[n.id] = { match: n.when.match, rules: rest };
    }
  return config;
}
/** The config as a non-executable JSON block, safe inside HTML. */
export function logicConfigTag(config: LogicConfig) {
  const json = JSON.stringify(config).replace(
    /[<>&\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return `<script type="application/json" id="forma-logic">${json}</script>`;
}

/** The sections a page shows: the header, its own and the footer. */
export const sectionsOf = (project: Project, page: Page): Section[] => [
  ...project.header,
  ...page.sections,
  ...project.footer,
];
/** Whether a page carries the logic script and its config. */
export const pageUsesLogic = (project: Project, page: Page) =>
  sectionsUseLogic(sectionsOf(project, page), page);
/** Whether any page needs the logic script (publishing adds logic.js). */
export const needsLogicScript = (project: Project) =>
  project.pages.some((page) => pageUsesLogic(project, page));

/** Whether a page has anything "Preview as" changes. */
export function pageHasStates(project: Project, page: Page) {
  if (page.variables?.length) return true;
  for (const s of [...project.header, ...page.sections, ...project.footer])
    if (s.root)
      for (const n of walk([s.root]))
        if (n.when?.rules.some((r) => r.if !== "item")) return true;
  return false;
}
