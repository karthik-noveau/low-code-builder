/**
 * Where a drag over the canvas would land. Works from what the pointer is
 * over: the deepest block that can take the dragged block gets it (at the
 * slot nearest the pointer), unless the pointer is near that block's edge,
 * when it goes beside it instead. Prebuilt sections, and blocks over a
 * classic section, land between sections.
 */
import { useStudio } from "../../studio/store";
import { findSection } from "../../studio/model";
import { contains, findNode, pathTo, type Node } from "../model";
import { canHold, nodeLabel } from "../registry";
import { payloadType, type DragPayload, type DropTarget } from "./actions";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface DropHint {
  target: DropTarget;
  /** The line where it lands, in viewport px. */
  line?: { x: number; y: number; length: number; vertical: boolean };
  /** The block it goes into (outlined while dragging). */
  box?: Rect;
  label: string;
}

const rectOf = (el: Element | null | undefined): Rect | undefined => {
  const r = el?.getBoundingClientRect();
  return r && (r.width || r.height)
    ? { left: r.left, top: r.top, width: r.width, height: r.height }
    : undefined;
};
export const nodeElement = (scope: ParentNode, id: string) =>
  scope.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);

/**
 * The child slot of `parent` nearest (x, y): its index and where to draw the
 * line. Children side by side (rows, grids) split left/right, stacked ones
 * top/bottom.
 */
export function slot(scope: ParentNode, parent: Node, x: number, y: number) {
  const kids = (parent.children ?? [])
    .map((c, i) => ({ i, r: rectOf(nodeElement(scope, c.id)) }))
    .filter((k): k is { i: number; r: Rect } => !!k.r);
  if (!kids.length)
    return { index: parent.children?.length ?? 0, line: undefined };
  const distance = (r: Rect) =>
    Math.hypot(
      Math.max(r.left - x, 0, x - (r.left + r.width)),
      Math.max(r.top - y, 0, y - (r.top + r.height)),
    );
  const near = kids.reduce((a, b) => (distance(b.r) < distance(a.r) ? b : a));
  const r = near.r;
  const sideBySide = kids.some(
    (k) =>
      k !== near &&
      Math.min(k.r.top + k.r.height, r.top + r.height) -
        Math.max(k.r.top, r.top) >
        Math.min(k.r.height, r.height) / 2,
  );
  const before = sideBySide
    ? x < r.left + r.width / 2
    : y < r.top + r.height / 2;
  return {
    index: near.i + (before ? 0 : 1),
    line: sideBySide
      ? {
          vertical: true,
          x: before ? r.left : r.left + r.width,
          y: r.top,
          length: r.height,
        }
      : {
          vertical: false,
          x: r.left,
          y: before ? r.top : r.top + r.height,
          length: r.width,
        },
  };
}

/**
 * The `after` for a new section just before or after `section`: page
 * sections by position; over the header it starts the page, over the
 * footer it ends it.
 */
export function sectionSlot(section: string, before: boolean) {
  const { project, activePage } = useStudio.getState();
  const sections =
    project.pages.find((p) => p.id === activePage)?.sections ?? [];
  const index = sections.findIndex((s) => s.id === section);
  if (index < 0)
    return project.header.some((s) => s.id === section) ? "start" : undefined;
  return before ? (index === 0 ? "start" : sections[index - 1].id) : section;
}

/** Where `payload` would land with the pointer at (x, y) over `under`. */
export function findDrop(
  payload: DragPayload,
  x: number,
  y: number,
  under: Element | null,
  website: HTMLElement,
): DropHint | null {
  const { project, activePage } = useStudio.getState();
  const page = project.pages.find((p) => p.id === activePage);
  const type = payloadType(payload);
  if (!page || !type) return null;
  const sectionEl = under?.closest<HTMLElement>("[data-section-id]");
  const section = findSection(project, sectionEl?.dataset.sectionId ?? null);
  const moving =
    payload.kind === "node"
      ? findNode(
          [findSection(project, payload.section)?.root].filter(
            (n): n is Node => !!n,
          ),
          payload.id,
        )
      : undefined;

  if (payload.kind !== "preset" && section?.type === "blocks" && section.root) {
    const id = under?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    const chain = id ? pathTo([section.root], id).reverse() : [section.root];
    for (const [i, cur] of chain.entries()) {
      if (moving && contains(moving, cur.id)) continue;
      if (!canHold(cur.type, type)) continue;
      const el = nodeElement(website, cur.id);
      const box = rectOf(el);
      if (!box) continue;
      const parent = chain[i + 1];
      // Near the edge of a block that could also go beside it: beside wins.
      const edge = Math.min(12, box.width / 5, box.height / 5);
      const nearEdge =
        parent &&
        canHold(parent.type, type) &&
        (x - box.left < edge ||
          box.left + box.width - x < edge ||
          y - box.top < edge ||
          box.top + box.height - y < edge);
      if (nearEdge) continue;
      const { index, line } = slot(website, cur, x, y);
      return {
        target: { kind: "node", section: section.id, parent: cur.id, index },
        line,
        box,
        label:
          cur === section.root
            ? `Into ${section.name}`
            : `Into ${nodeLabel(cur)}`,
      };
    }
  }
  if (payload.kind === "node") return null;

  // Between sections.
  const box = rectOf(sectionEl);
  if (!section || !box) {
    const last = page.sections.at(-1);
    const lastBox =
      last &&
      rectOf(
        website.querySelector(`[data-section-id="${CSS.escape(last.id)}"]`),
      );
    return {
      target: { kind: "section" },
      line: lastBox && {
        vertical: false,
        x: lastBox.left,
        y: lastBox.top + lastBox.height,
        length: lastBox.width,
      },
      label: "New section at the end",
    };
  }
  const before = y < box.top + box.height / 2;
  return {
    target: { kind: "section", after: sectionSlot(section.id, before) },
    line: {
      vertical: false,
      x: box.left,
      y: before ? box.top : box.top + box.height,
      length: box.width,
    },
    label: "New section",
  };
}

/**
 * The line where a block put into `parent` at `index` would appear: before
 * the child at `index`, after the last child, or (empty parent) along the
 * parent's top inside edge.
 */
export function insertLine(
  scope: ParentNode,
  parent: Node,
  index: number,
): DropHint["line"] {
  const kids = (parent.children ?? [])
    .map((c) => rectOf(nodeElement(scope, c.id)))
    .filter((r): r is Rect => !!r);
  const box = rectOf(nodeElement(scope, parent.id));
  if (!kids.length)
    return box
      ? {
          vertical: false,
          x: box.left + 8,
          y: box.top + Math.min(box.height / 2, 24),
          length: Math.max(box.width - 16, 0),
        }
      : undefined;
  const sideBySide =
    kids.length > 1 &&
    Math.abs(kids[0].top - kids[1].top) < kids[0].height / 2 &&
    kids[1].left > kids[0].left;
  const at = kids[Math.min(index, kids.length - 1)];
  const after = index >= kids.length;
  return sideBySide
    ? {
        vertical: true,
        x: after ? at.left + at.width + 2 : at.left - 2,
        y: at.top,
        length: at.height,
      }
    : {
        vertical: false,
        x: at.left,
        y: after ? at.top + at.height + 2 : at.top - 2,
        length: at.width,
      };
}

/** The line a new section placed `after` (a section id, "start" or the end) would sit on. */
export function sectionLine(
  website: HTMLElement,
  after: string | undefined,
  shared?: "header" | "footer",
): DropHint["line"] {
  const { project, activePage } = useStudio.getState();
  const page = project.pages.find((p) => p.id === activePage);
  const el = (id?: string) =>
    id
      ? rectOf(website.querySelector(`[data-section-id="${CSS.escape(id)}"]`))
      : undefined;
  const line = (r: Rect | undefined, bottom: boolean) =>
    r && {
      vertical: false,
      x: r.left,
      y: bottom ? r.top + r.height : r.top,
      length: r.width,
    };
  if (shared === "header") return line(el(project.header.at(-1)?.id), true);
  if (shared === "footer")
    return (
      line(el(project.footer.at(-1)?.id), true) ??
      line(el(page?.sections.at(-1)?.id), true)
    );
  if (after === "start")
    return (
      line(el(page?.sections[0]?.id), false) ??
      line(el(project.header.at(-1)?.id), true)
    );
  if (after && page?.sections.some((s) => s.id === after))
    return line(el(after), true);
  return (
    line(el(page?.sections.at(-1)?.id), true) ??
    line(el(project.header.at(-1)?.id), true)
  );
}
