/**
 * What the blocks editor does, in one place for the Add panel, canvas
 * toolbar, Layers and keyboard: where a new block goes, moving among
 * siblings, copy and paste, and dropping a dragged block or section. Each
 * works on the studio store's selection (`selected` is the section,
 * `selectedBlock` the node).
 */
import { create } from "zustand";
import { useStudio } from "../../studio/store";
import { findSection, type Project, type Section } from "../../studio/model";
import {
  cloneNode,
  findNode,
  locate,
  type Node,
  type NodeType,
} from "../model";
import { BLOCKS, canHold, createNode, nodeLabel } from "../registry";
import { presetById } from "../presets";
import { freeName, renameVar } from "../logic/model";
import { accepts, lockNotice } from "../lock";

/** What an Add panel item would put down, shown on the canvas while it's hovered. */
export type InsertPreview =
  | { kind: "block"; type: NodeType }
  | { kind: "preset"; id: string; after?: string };

/** Editor-only state that isn't part of the project (and isn't undone). */
export const useBlocksUi = create<{
  /** The block under the pointer, on the canvas or in Layers. */
  hover: string | null;
  setHover: (id: string | null) => void;
  /** ⌘C copies a block here; ⌘V pastes a fresh copy. */
  clipboard: Node | null;
  /** Something is being dragged (hides the selection toolbar). */
  dragging: boolean;
  /** The Add panel item under the pointer (or focused). */
  preview: InsertPreview | null;
  /** The block menu (right-click or the toolbar's More), at a viewport point. */
  menu: { x: number; y: number } | null;
}>((set) => ({
  hover: null,
  setHover: (hover) => set({ hover }),
  clipboard: null,
  dragging: false,
  preview: null,
  menu: null,
}));

/** The notification button that undoes the last change. */
export const undoAction = {
  label: "Undo",
  run: () => useStudio.getState().undo(),
};
export type Notify = (
  text: string,
  action?: { label: string; run: () => void },
) => void;

/** The selected "blocks" section and block (its root when only the section is selected). */
export function blockSelection():
  | { section: Section; root: Node; node: Node }
  | { section: Section | undefined; root?: undefined; node?: undefined } {
  const { project, selected, selectedBlock } = useStudio.getState();
  const section = findSection(project, selected);
  if (section?.type !== "blocks" || !section.root) return { section };
  const node =
    (selectedBlock && findNode([section.root], selectedBlock)) || section.root;
  return { section, root: section.root, node };
}

/**
 * Where a `type` block goes relative to the selected block: inside it when
 * it's a container that takes one ("inside"), otherwise right after it in
 * the nearest ancestor that can hold it.
 */
export function placeFor(
  root: Node,
  selected: string,
  type: NodeType,
  prefer: "inside" | "after" = "inside",
): { parent: string; index: number } | undefined {
  const node = findNode([root], selected) ?? root;
  const inside = () =>
    accepts(node, type)
      ? { parent: node.id, index: node.children?.length ?? 0 }
      : undefined;
  if (prefer === "inside" && inside()) return inside();
  for (let id = node.id; ;) {
    const at = locate([root], id);
    if (!at?.parent) break;
    if (accepts(at.parent, type))
      return { parent: at.parent.id, index: at.index + 1 };
    id = at.parent.id;
  }
  return (
    inside() ??
    (accepts(root, type)
      ? { parent: root.id, index: root.children?.length ?? 0 }
      : undefined)
  );
}

/**
 * Where a new section goes after `section`: right after it on the page, at
 * the top of the page after a header, at the end otherwise.
 */
export function sectionAfter(
  project: Project,
  page: string,
  section?: Section,
) {
  if (!section) return undefined;
  const pg = project.pages.find((p) => p.id === page);
  if (pg?.sections.some((s) => s.id === section.id)) return section.id;
  return project.header.some((s) => s.id === section.id) ? "start" : undefined;
}

/**
 * Puts `node` at the selection (see placeFor). Without a blocks section
 * selected, it goes into a new one after the selected section. Returns the
 * new block's id, or undefined when it can't go anywhere.
 */
export function insertAtSelection(
  node: Node,
  prefer: "inside" | "after" = "inside",
): string | undefined {
  const studio = useStudio.getState();
  const sel = blockSelection();
  if (sel.root) {
    const place = placeFor(sel.root, sel.node.id, node.type, prefer);
    if (place)
      return reveal(
        studio.insertNode(sel.section.id, place.parent, node, place.index),
      );
  }
  if (BLOCKS[node.type].parents) return;
  const root = createNode("section");
  root.children = [node];
  return addSectionWith(
    root,
    sectionAfter(studio.project, studio.activePage, sel.section),
  );
}

/** Adds a blocks section holding `root` and selects its first block. */
function addSectionWith(root: Node, after?: string) {
  const id = useStudio.getState().addBlocksSection(root, "Section", after);
  const first = findSection(useStudio.getState().project, id)?.root
    ?.children?.[0];
  if (first) useStudio.getState().select(id, first.id);
  return reveal(first?.id);
}

/** Adds a new block of `type` at the selection. */
export const insertBlock = (type: NodeType) =>
  insertAtSelection(createNode(type));

/**
 * Adds a prebuilt section after `after` (a section id, "start", or the end
 * of the page). Headers and footers go to the top or bottom of every page.
 */
export function insertPreset(id: string, after?: string) {
  const preset = presetById(id);
  if (!preset) return;
  const studio = useStudio.getState();
  let root = preset.build({ project: studio.project });
  const shared = ["header", "footer"].includes(preset.category);
  // Page values the section uses join the page, renamed if the page already
  // has one of that name (two sets of tabs keep their own).
  const page = studio.project.pages.find((p) => p.id === studio.activePage);
  const taken = (page?.variables ?? []).map((v) => v.name);
  const variables = (preset.variables?.() ?? []).map((v) => {
    const name = freeName(v.name, taken);
    taken.push(name);
    if (name !== v.name) root = renameVar(root, v.name, name);
    return { ...v, name };
  });
  return revealSection(
    studio.addBlocksSection(
      root,
      preset.name,
      shared ? undefined : after,
      variables,
    ),
  );
}

/** Selects the selected block's parent. False when there isn't one. */
export function selectParent() {
  const sel = blockSelection();
  if (!sel.root || sel.node === sel.root) return false;
  const parent = locate([sel.root], sel.node.id)?.parent;
  if (!parent) return false;
  useStudio.getState().select(sel.section.id, parent.id);
  return true;
}

/** Moves the selected block one place up (-1) or down (1) among its siblings. */
export function moveSibling(offset: -1 | 1) {
  const sel = blockSelection();
  if (!sel.root || selectionLock("move")) return false;
  const studio = useStudio.getState();
  if (sel.node === sel.root) {
    studio.moveSection(sel.section.id, offset);
    studio.select(sel.section.id, sel.root.id);
    revealSection(sel.section.id);
    return true;
  }
  const at = locate([sel.root], sel.node.id);
  const next = (at?.index ?? -1) + offset;
  if (!at?.parent || next < 0 || next >= at.siblings.length) return false;
  studio.moveNode(
    sel.section.id,
    sel.node.id,
    sel.section.id,
    at.parent.id,
    next,
  );
  reveal(sel.node.id);
  return true;
}

/**
 * Why the selected block can't be moved, deleted or duplicated (it, or the
 * block it sits in, is locked), or null when it can. See src/blocks/lock.ts.
 */
export function selectionLock(doing: "move" | "delete" | "duplicate") {
  const sel = blockSelection();
  if (!sel.root) return null;
  return lockNotice(sel.root, sel.node.id, doing, sel.section.name);
}

/** Locks or unlocks the selected block (or section). Returns whether it's locked now. */
export function toggleLocked() {
  const sel = blockSelection();
  if (!sel.root) return;
  const locked = !sel.node.locked;
  useStudio.getState().updateNode(sel.section.id, sel.node.id, (n) => ({
    ...n,
    locked: locked || undefined,
  }));
  return locked;
}

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
/**
 * Scrolls the canvas so `el` is in view (after an add or a move), smoothly
 * unless the owner prefers less motion. Nothing happens when it's already
 * fully visible; otherwise short blocks are centred and tall ones start near
 * the top, below the toolbar.
 */
export function scrollIntoCanvas(el: Element | null | undefined) {
  const scroller = el?.closest<HTMLElement>(".canvas-scroll");
  if (!el || !scroller) return false;
  const box = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const margin = 48;
  if (box.top >= view.top + margin && box.bottom <= view.bottom - margin / 2)
    return false;
  const offset =
    box.height < view.height - margin * 2
      ? (view.height - box.height) / 2
      : margin;
  scroller.scrollTo({
    top: scroller.scrollTop + box.top - view.top - offset,
    behavior: reducedMotion() ? "auto" : "smooth",
  });
  return true;
}
/** After the canvas has drawn it, scrolls the block `id` into view. Returns `id`. */
export function reveal<T extends string | undefined>(id: T): T {
  if (id && typeof requestAnimationFrame === "function")
    requestAnimationFrame(() =>
      scrollIntoCanvas(
        document.querySelector(
          `.canvas-scroll [data-node-id="${CSS.escape(id)}"]`,
        ),
      ),
    );
  return id;
}
/** The same for a whole section. */
export function revealSection<T extends string | undefined>(id: T): T {
  if (id && typeof requestAnimationFrame === "function")
    requestAnimationFrame(() =>
      scrollIntoCanvas(
        document.querySelector(
          `.canvas-scroll [data-section-id="${CSS.escape(id)}"]`,
        ),
      ),
    );
  return id;
}

/** Whether the selected block can move up/down among its siblings. */
export function canMove(section: Section, root: Node, id: string) {
  const project = useStudio.getState().project;
  if (id === root.id) {
    const list = [
      project.header,
      project.footer,
      ...project.pages.map((p) => p.sections),
    ].find((l) => l.some((s) => s.id === section.id));
    const i = list?.findIndex((s) => s.id === section.id) ?? -1;
    return { up: i > 0, down: !!list && i < list.length - 1 };
  }
  const at = locate([root], id);
  return {
    up: !!at && at.index > 0,
    down: !!at && at.index < at.siblings.length - 1,
  };
}

/**
 * Selects the next (1) or previous (-1) block beside the selected one,
 * wrapping around; the section block moves between the page's sections.
 */
export function selectSibling(offset: -1 | 1) {
  const sel = blockSelection();
  if (!sel.root) return false;
  const studio = useStudio.getState();
  if (sel.node === sel.root) {
    const page = studio.project.pages.find((p) => p.id === studio.activePage);
    const list = [
      ...studio.project.header,
      ...(page?.sections ?? []),
      ...studio.project.footer,
    ].filter((s) => s.type === "blocks" && s.root);
    const i = list.findIndex((s) => s.id === sel.section.id);
    if (i < 0 || list.length < 2) return false;
    const next = list[(i + offset + list.length) % list.length];
    studio.select(next.id, next.root!.id);
    return true;
  }
  const at = locate([sel.root], sel.node.id);
  if (!at || at.siblings.length < 2) return false;
  const next =
    at.siblings[(at.index + offset + at.siblings.length) % at.siblings.length];
  studio.select(sel.section.id, next.id);
  return true;
}

/** Selects the selected block's first block inside. */
export function selectFirstChild() {
  const sel = blockSelection();
  const first = sel.node?.children?.[0];
  if (!sel.root || !first) return false;
  useStudio.getState().select(sel.section.id, first.id);
  return true;
}

/** Shows or hides the selected block (or section) on the site. */
export function toggleHidden() {
  const sel = blockSelection();
  if (!sel.root) return;
  const studio = useStudio.getState();
  if (sel.node === sel.root) {
    studio.updateSection(sel.section.id, { hidden: !sel.section.hidden });
    return !sel.section.hidden;
  }
  const hidden = !sel.node.hidden;
  studio.updateNode(sel.section.id, sel.node.id, (n) => ({
    ...n,
    hidden: hidden || undefined,
  }));
  return hidden;
}

/** Whether the selected block can be put inside a new `type` block. */
export function canWrap(type: "box" | "row") {
  const sel = blockSelection();
  if (!sel.root || sel.node === sel.root) return false;
  const parent = locate([sel.root], sel.node.id)?.parent;
  return (
    !!parent &&
    accepts(parent, type) &&
    canHold(type, sel.node.type) &&
    !sel.node.locked
  );
}

/** Puts the selected block inside a new box or row, and selects that. */
export function wrapSelected(type: "box" | "row") {
  const sel = blockSelection();
  if (!sel.root || !canWrap(type)) return;
  const parent = locate([sel.root], sel.node.id)!.parent!;
  const wrapper = { ...createNode(type), children: [sel.node] };
  const studio = useStudio.getState();
  studio.updateNode(sel.section.id, parent.id, (p) => ({
    ...p,
    children: (p.children ?? []).map((c) =>
      c.id === sel.node.id ? wrapper : c,
    ),
  }));
  studio.select(sel.section.id, wrapper.id);
  return wrapper.id;
}

/** Recently added blocks and sections ("block:heading", "preset:<id>"), newest first. */
const RECENT_KEY = "forma-add-recent";
export function recentItems(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === "string").slice(0, 6)
      : [];
  } catch {
    return [];
  }
}
export function rememberRecent(item: string) {
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(
        [item, ...recentItems().filter((x) => x !== item)].slice(0, 6),
      ),
    );
  } catch {
    /* storage blocked: nothing to remember */
  }
}

export function removeSelected() {
  const sel = blockSelection();
  if (!sel.root || selectionLock("delete")) return "";
  const label = sel.node === sel.root ? sel.section.name : nodeLabel(sel.node);
  useStudio.getState().removeNode(sel.section.id, sel.node.id);
  return label;
}

export function duplicateSelected() {
  const sel = blockSelection();
  if (!sel.root || selectionLock("duplicate")) return;
  if (sel.node === sel.root) {
    useStudio.getState().duplicateSection(sel.section.id);
    return revealSection(useStudio.getState().selected ?? undefined);
  }
  return reveal(
    useStudio.getState().duplicateNode(sel.section.id, sel.node.id),
  );
}

export function copySelected() {
  const sel = blockSelection();
  if (!sel.root) return false;
  useBlocksUi.setState({ clipboard: structuredClone(sel.node) });
  return true;
}

/** Pastes the copied block after the selection, with fresh ids. */
export function paste() {
  const clip = useBlocksUi.getState().clipboard;
  if (!clip) return;
  const studio = useStudio.getState();
  const sel = blockSelection();
  if (clip.type === "section")
    return revealSection(
      studio.addBlocksSection(
        clip,
        "Section",
        sectionAfter(studio.project, studio.activePage, sel.section),
      ),
    );
  return insertAtSelection(cloneNode(clip), "after");
}

/** What's being dragged: a new block, a prebuilt section, or a block already on the page. */
export type DragPayload =
  | { kind: "block"; type: NodeType }
  | { kind: "preset"; id: string }
  | { kind: "node"; section: string; id: string };
/** Set while dragging (drag data can't be read until the drop). */
let dragging: DragPayload | null = null;
export const DRAG_TYPE = "application/x-forma-block";
export const startDrag = (payload: DragPayload, data: DataTransfer) => {
  dragging = payload;
  data.setData(DRAG_TYPE, payload.kind);
  data.setData("text/plain", "");
  data.effectAllowed = payload.kind === "node" ? "move" : "copy";
  // After the browser has taken the drag image: changing the page during
  // dragstart can cancel the drag.
  setTimeout(() => {
    if (dragging) useBlocksUi.setState({ dragging: true });
  });
};
export const currentDrag = () => dragging;
export const endDrag = () => {
  dragging = null;
  useBlocksUi.setState({ dragging: false });
};

/** Where a drop lands: inside a block at an index, or as a section on the page. */
export type DropTarget =
  | { kind: "node"; section: string; parent: string; index: number }
  | { kind: "section"; after?: string };

/** The type of block the payload puts down (a section for prebuilt sections). */
export function payloadType(payload: DragPayload): NodeType | undefined {
  if (payload.kind === "block") return payload.type;
  if (payload.kind === "preset") return "section";
  const root = findSection(useStudio.getState().project, payload.section)?.root;
  return root && findNode([root], payload.id)?.type;
}

/** Carries out a drop. Returns the id of what was added or moved. */
export function drop(payload: DragPayload, target: DropTarget) {
  const studio = useStudio.getState();
  if (payload.kind === "block") rememberRecent(`block:${payload.type}`);
  if (payload.kind === "preset") rememberRecent(`preset:${payload.id}`);
  if (target.kind === "section") {
    if (payload.kind === "preset")
      return insertPreset(payload.id, target.after);
    if (payload.kind === "block") {
      const root = createNode("section");
      root.children = [createNode(payload.type)];
      return addSectionWith(root, target.after);
    }
    return;
  }
  if (payload.kind === "preset") return;
  if (payload.kind === "block")
    return reveal(
      studio.insertNode(
        target.section,
        target.parent,
        createNode(payload.type),
        target.index,
      ),
    );
  const root = findSection(studio.project, payload.section)?.root;
  const at = root && locate([root], payload.id);
  if (!at?.parent) return;
  // The index was counted with the block still in place.
  const index =
    payload.section === target.section &&
    at.parent.id === target.parent &&
    at.index < target.index
      ? target.index - 1
      : target.index;
  if (
    payload.section === target.section &&
    at.parent.id === target.parent &&
    at.index === index
  )
    return payload.id;
  studio.moveNode(
    payload.section,
    payload.id,
    target.section,
    target.parent,
    index,
  );
  return reveal(payload.id);
}
