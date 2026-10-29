/**
 * Questions about a whole site that look inside block trees as well as the
 * classic sections: which app forms are placed, whether a page needs the site
 * script, where the phone tab bar comes from.
 */
import type { Project, Section } from "../studio/model";
import type { Node, NodeType } from "./model";
import { lines } from "./text";

/** The header, every page's sections and the footer. */
export const siteSections = (project: Project): Section[] => [
  ...project.header,
  ...project.pages.flatMap((p) => p.sections),
  ...project.footer,
];

/** The blocks visitors can see in a tree: hidden blocks and their insides left out. */
export function* shownNodes(root: Node | undefined): Generator<Node> {
  if (!root || root.hidden) return;
  yield root;
  for (const c of root.children ?? []) yield* shownNodes(c);
}

/** Blocks of `type` in the visible "blocks" sections of these sections. */
export function placedNodes(sections: Section[], type: NodeType): Node[] {
  return sections
    .filter((s) => !s.hidden && s.type === "blocks")
    .flatMap((s) => [...shownNodes(s.root)].filter((n) => n.type === type));
}

/** Whether a visible section shows a block of `type`. */
export const hasBlock = (project: Project, type: NodeType) =>
  placedNodes(siteSections(project), type).length > 0;

/** App form ids placed on the site: in visible app sections, app form blocks and form blocks. */
export function appFormsIn(project: Project): Set<string> {
  const sections = siteSections(project);
  return new Set([
    ...sections
      .filter((s) => s.type === "app" && !s.hidden && s.appForm)
      .map((s) => s.appForm as string),
    ...[...placedNodes(sections, "appForm"), ...placedNodes(sections, "form")]
      .map((n) => n.props.form)
      .filter((f): f is string => typeof f === "string" && !!f),
  ]);
}

/** App form ids a section shows (an app section's, or app form blocks'). */
export function sectionAppForms(s: Section): string[] {
  if (s.type === "app") return s.appForm ? [s.appForm] : [];
  const shown = [{ ...s, hidden: false }];
  // App form blocks and forms built from blocks (src/blocks/forms).
  return [...placedNodes(shown, "appForm"), ...placedNodes(shown, "form")]
    .map((n) => n.props.form)
    .filter((f): f is string => typeof f === "string" && !!f);
}

/** Collection ids a section lists (a collection section's, collection list blocks' or repeats'). */
export function sectionCollections(s: Section): string[] {
  if (s.type === "collection") return s.listing ? [s.listing.collection] : [];
  const shown = [{ ...s, hidden: false }];
  return [
    ...placedNodes(shown, "collectionList").map((n) => n.props.collection),
    ...placedNodes(shown, "repeat").map((n) =>
      typeof n.props.source === "string" &&
      n.props.source.startsWith("collection:")
        ? n.props.source.slice(11)
        : "",
    ),
  ].filter((c): c is string => typeof c === "string" && !!c);
}

/**
 * Contact and Email signup forms placed in visible blocks sections: inbox
 * form blocks (src/blocks/forms/classic.tsx) and the smart blocks they were.
 * `action` is the owner's own endpoint, if any.
 */
export function inboxForms(
  sections: Section[],
): { kind: "contact" | "newsletter"; action: string }[] {
  return [
    ...placedNodes(sections, "contactForm"),
    ...placedNodes(sections, "newsletter"),
    ...placedNodes(sections, "form").filter((n) => n.props.target === "inbox"),
  ].map((n) => ({
    kind:
      n.type === "newsletter" ||
      (n.type === "form" && n.props.kind === "newsletter")
        ? "newsletter"
        : "contact",
    action: String(n.props.action ?? ""),
  }));
}

/** Whether a visible hero or section has the moving "orbits" background. */
export const hasOrbits = (project: Project) =>
  siteSections(project).some(
    (s) =>
      !s.hidden &&
      ((s.type === "hero" && s.effect === "orbits") ||
        (s.type === "blocks" &&
          [...shownNodes(s.root)].some(
            (n) => n.type === "section" && n.props.effect === "orbits",
          ))),
  );

export interface Tab {
  id: string;
  label: string;
  url: string;
  icon?: string;
}
/**
 * The phone tab bar's tabs, when the site has one: a "brand" header's items,
 * or a tab bar block in the header or footer ("Label | /page | icon" lines).
 * An empty list means every page; undefined, no tab bar.
 */
export function tabBarOf(project: Project): Tab[] | undefined {
  const brand = project.header.find(
    (s) => !s.hidden && s.type === "header" && s.variant === "brand",
  );
  if (brand)
    return brand.items.map((i) => ({
      id: i.id,
      label: i.title,
      url: i.url,
      icon: i.icon,
    }));
  const node = placedNodes([...project.header, ...project.footer], "tabBar")[0];
  if (!node) return undefined;
  return lines(node.props.tabs).map((line, n) => {
    const [label, url = "/", icon = ""] = line.split("|").map((x) => x.trim());
    return {
      id: `${node.id}-${n}`,
      label,
      url: url || "/",
      icon: icon || undefined,
    };
  });
}
