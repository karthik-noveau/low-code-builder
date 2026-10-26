/**
 * Site-wide questions about data blocks: whether published pages need the
 * data script (app data is filled in the browser), and which views and
 * figures a site shows.
 */
import type { Project } from "../../studio/model";
import { placedNodes, siteSections } from "../project";
import type { Node } from "../model";
import { parseSource } from "./bind";

/** Visible data blocks that read app data in the visitor's browser. */
export function appDataNodes(project: Project): Node[] {
  const sections = siteSections(project);
  return [
    ...placedNodes(sections, "repeat"),
    ...placedNodes(sections, "table"),
    ...placedNodes(sections, "stat"),
    ...placedNodes(sections, "chart"),
  ].filter((n) => {
    const ref = parseSource(n.props.source);
    return ref.kind === "view" || ref.kind === "card" || ref.kind === "chart";
  });
}
/** Whether published pages carry the data script (needs the public app API). */
export const needsDataScript = (project: Project, appApi?: string) =>
  !!appApi && !!project.app && appDataNodes(project).length > 0;
