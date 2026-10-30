/**
 * Drawn over the canvas for blocks sections: the hover outline and name,
 * the selected block's outline, name tag and toolbar, "+" buttons between
 * sections and inside the selected layout block, the text tools while
 * typing, where a dragged block or Add panel item would land, and the block
 * menu. It sits beside the canvas rather than in it, so it never changes
 * the page's layout, and follows the blocks on every frame (scrolling,
 * zoom, typing).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import { findSection, type Device } from "../../studio/model";
import { findNode, pathTo, type Node as BlockNode } from "../model";
import { BLOCKS, nodeLabel } from "../registry";
import {
  blockSelection,
  canMove,
  currentDrag,
  drop,
  duplicateSelected,
  endDrag,
  moveSibling,
  placeFor,
  removeSelected,
  selectionLock,
  startDrag,
  toggleLocked,
  undoAction,
  useBlocksUi,
  type Notify,
} from "./actions";
import {
  findDrop,
  insertLine,
  nodeElement,
  sectionLine,
  sectionSlot,
  type DropHint,
  type Rect,
} from "./dropzone";
import { BlockMenu } from "./BlockMenu";
import { TextToolbar } from "./TextToolbar";
import { presetById } from "../presets";
import { isClassicForm } from "../forms/inbox";

interface Geometry {
  frame: Rect;
  /** The page itself, which the toolbar stays inside. */
  site?: Rect;
  hover?: Rect;
  selected?: Rect;
  /** The section under the pointer (classic ones too), for the "+" between sections. */
  section?: { id: string; rect: Rect };
  /** Text being typed. */
  typing?: Rect;
  /** Bottom of the header on every page, which the tag and tools keep clear of. */
  ceiling?: number;
  /** Where the hovered Add panel item would go. */
  preview?: DropHint["line"] & { box?: Rect };
}
const box = (el: Element | null | undefined): Rect | undefined => {
  const r = el?.getBoundingClientRect();
  return r && (r.width || r.height)
    ? { left: r.left, top: r.top, width: r.width, height: r.height }
    : undefined;
};
/** Height of the name tag and toolbar. */
const BAR = 28;

export function CanvasOverlay({
  scroll,
  typing,
  device = "desktop",
  onPick,
  notify,
  onAddSection,
  onAddBlock,
  onEditText,
  onDoneTyping,
}: {
  /** The canvas scroller (holds the .website). */
  scroll: RefObject<HTMLDivElement | null>;
  /** Text is being typed on the canvas: text tools instead of the toolbar. */
  typing: boolean;
  device?: Device;
  /** A block was selected here (or dropped): open its settings. */
  onPick: (section: string, node: string) => void;
  notify: Notify;
  /** Opens the Add panel for a new section after `after` ("start": the top). */
  onAddSection?: (after?: string) => void;
  /** Opens the Add panel's blocks, to add inside the selected layout block. */
  onAddBlock?: () => void;
  /** Starts typing a block's text on the canvas. */
  onEditText?: (section: string, node: string) => void;
  /** Finishes typing (the text tools' Done). */
  onDoneTyping?: () => void;
}) {
  const project = useStudio((s) => s.project);
  const selected = useStudio((s) => s.selected);
  const selectedBlock = useStudio((s) => s.selectedBlock);
  const hover = useBlocksUi((s) => s.hover);
  const dragging = useBlocksUi((s) => s.dragging);
  const preview = useBlocksUi((s) => s.preview);
  const menuOpen = useBlocksUi((s) => !!s.menu);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const [parentsOpen, setParentsOpen] = useState(false);
  const pointerSection = useRef<string | null>(null);
  const tools = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState({ tools: 0, tag: 0 });

  const section = findSection(project, selected);
  const root = section?.type === "blocks" ? section.root : undefined;
  const node =
    root && ((selectedBlock && findNode([root], selectedBlock)) || root);
  const hoverSection = hover
    ? [
        ...project.header,
        ...project.pages.flatMap((p) => p.sections),
        ...project.footer,
      ].find((s) => s.root && findNode([s.root], hover))
    : undefined;
  const hoverNode =
    hoverSection?.root && hover
      ? findNode([hoverSection.root], hover)
      : undefined;
  useEffect(() => setParentsOpen(false), [selected, selectedBlock]);

  // Follow the blocks: their boxes move with scrolling, zoom and edits.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const sc = scroll.current;
      const site = sc?.querySelector<HTMLElement>(".website");
      const area = box(sc);
      if (sc && site && area) {
        const sectionId = pointerSection.current;
        const sectionRect = sectionId
          ? box(
              site.querySelector(
                `[data-section-id="${CSS.escape(sectionId)}"]`,
              ),
            )
          : undefined;
        const next: Geometry = {
          frame: area,
          site: box(site),
          hover: hover ? box(nodeElement(site, hover)) : undefined,
          selected: node ? box(nodeElement(site, node.id)) : undefined,
          section:
            sectionId && sectionRect
              ? { id: sectionId, rect: sectionRect }
              : undefined,
          typing: typing
            ? box(
                // A list's point: the tools go above the whole list, clear of the other points.
                site
                  .querySelector(".inline-copy.is-editing")
                  ?.closest('[data-node-type="list"]') ??
                  site.querySelector(".inline-copy.is-editing"),
              )
            : undefined,
          preview: previewLine(site),
          ceiling: node ? headerBottom(site, node.id) : undefined,
        };
        setGeo((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        );
        const w = {
          tools: tools.current?.offsetWidth ?? 0,
          tag: tag.current?.offsetWidth ?? 0,
        };
        setWidths((p) => (p.tools === w.tools && p.tag === w.tag ? p : w));
      }
      frame = requestAnimationFrame(tick);
    };
    /** Where the header ends, unless the block is in it. */
    const headerBottom = (site: HTMLElement, id: string) => {
      const header = useStudio.getState().project.header;
      if (header.some((s) => s.root && findNode([s.root], id))) return;
      const bottoms = header.flatMap((s) => {
        const r = box(
          site.querySelector(`[data-section-id="${CSS.escape(s.id)}"]`),
        );
        return r ? [r.top + r.height] : [];
      });
      return bottoms.length ? Math.max(...bottoms) : undefined;
    };
    /** The line where the hovered Add panel item would land. */
    const previewLine = (site: HTMLElement): Geometry["preview"] => {
      if (!preview) return undefined;
      if (preview.kind === "preset") {
        const p = presetById(preview.id);
        const shared =
          p?.category === "header" || p?.category === "footer"
            ? p.category
            : undefined;
        return sectionLine(site, preview.after, shared);
      }
      const sel = blockSelection();
      if (!sel.root) {
        const studio = useStudio.getState();
        const after =
          sel.section &&
          studio.project.pages
            .find((p) => p.id === studio.activePage)
            ?.sections.some((s) => s.id === sel.section!.id)
            ? sel.section.id
            : undefined;
        return sectionLine(site, after);
      }
      const place = placeFor(sel.root, sel.node.id, preview.type);
      const parent = place && findNode([sel.root], place.parent);
      if (!place || !parent) return undefined;
      const line = insertLine(site, parent, place.index);
      return line && { ...line, box: box(nodeElement(site, parent.id)) };
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [scroll, hover, node, typing, preview]);

  // Hover, right-click and drag-and-drop on the canvas.
  useEffect(() => {
    const sc = scroll.current;
    if (!sc) return;
    const ui = useBlocksUi.getState();
    const move = (e: PointerEvent) => {
      const el = e.target as Element;
      const id =
        el.closest?.<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? null;
      if (useBlocksUi.getState().hover !== id) ui.setHover(id);
      pointerSection.current =
        el.closest?.<HTMLElement>("[data-section-id]")?.dataset.sectionId ??
        null;
    };
    const leave = (e: PointerEvent) => {
      // Moving onto the overlay's own buttons keeps the hover.
      if ((e.relatedTarget as Element | null)?.closest?.(".blocks-overlay"))
        return;
      ui.setHover(null);
      pointerSection.current = null;
    };
    const menu = (e: MouseEvent) => {
      const el = e.target as Element;
      const id = el.closest?.<HTMLElement>("[data-node-id]")?.dataset.nodeId;
      const sectionId =
        el.closest?.<HTMLElement>("[data-section-id]")?.dataset.sectionId;
      const s = findSection(useStudio.getState().project, sectionId ?? null);
      if (!id || !s?.root || !findNode([s.root], id)) return;
      if (el.closest(".inline-copy.is-editing")) return;
      e.preventDefault();
      onPick(s.id, id);
      useBlocksUi.setState({ menu: { x: e.clientX, y: e.clientY } });
    };
    const site = () => sc.querySelector<HTMLElement>(".website");
    const over = (e: DragEvent) => {
      const payload = currentDrag();
      const website = site();
      if (!payload || !website) return;
      e.preventDefault();
      const next = findDrop(
        payload,
        e.clientX,
        e.clientY,
        e.target as Element,
        website,
      );
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = next
          ? payload.kind === "node"
            ? "move"
            : "copy"
          : "none";
      setHint((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    const out = (e: DragEvent) => {
      if (!sc.contains(e.relatedTarget as globalThis.Node | null))
        setHint(null);
    };
    const put = (e: DragEvent) => {
      const payload = currentDrag();
      const website = site();
      if (!payload || !website) return;
      e.preventDefault();
      const target = findDrop(
        payload,
        e.clientX,
        e.clientY,
        e.target as Element,
        website,
      )?.target;
      setHint(null);
      endDrag();
      if (!target) return;
      const before = useStudio.getState().past.length;
      const id = drop(payload, target);
      const state = useStudio.getState();
      if (id && state.selected)
        onPick(state.selected, state.selectedBlock ?? id);
      if (payload.kind === "node" && state.past.length > before)
        notify("Block moved", undoAction);
    };
    const done = () => {
      setHint(null);
      endDrag();
    };
    sc.addEventListener("pointermove", move);
    sc.addEventListener("pointerleave", leave);
    sc.addEventListener("contextmenu", menu);
    sc.addEventListener("dragover", over);
    sc.addEventListener("dragleave", out);
    sc.addEventListener("drop", put);
    document.addEventListener("dragend", done);
    return () => {
      sc.removeEventListener("pointermove", move);
      sc.removeEventListener("pointerleave", leave);
      sc.removeEventListener("contextmenu", menu);
      sc.removeEventListener("dragover", over);
      sc.removeEventListener("dragleave", out);
      sc.removeEventListener("drop", put);
      document.removeEventListener("dragend", done);
    };
  }, [scroll, onPick, notify]);

  const menu = (
    <BlockMenu notify={notify} onPick={onPick} onEditText={onEditText} />
  );
  const frame = geo?.frame ?? box(scroll.current);
  if (!frame) return menu;
  const at = (r: Rect) => ({
    left: r.left - frame.left,
    top: r.top - frame.top,
    width: r.width,
    height: r.height,
  });
  const showSelection = !!(node && root && section && geo?.selected && !typing);
  const showHover =
    !!(hoverNode && geo?.hover && !typing && !dragging) && hoverNode !== node;
  const sel = geo?.selected && at(geo.selected);
  const path = node && root ? pathTo([root], node.id) : [];
  const label = (id: string) => {
    const n = path.find((p) => p.id === id);
    return n === root ? (section?.name ?? "Section") : n ? nodeLabel(n) : "";
  };
  const moves =
    node && root && section ? canMove(section, root, node.id) : null;
  const isRoot = node === root;
  const def = node ? BLOCKS[node.type] : undefined;

  // The name tag sits on the outline's top-left corner and the tools on its
  // top-right, both outside the block. With no room above they go below it;
  // with no room either side (a tall block), or when they'd cover the
  // header (a section right below it), just inside its top edge.
  const place = (() => {
    if (!sel) return null;
    const room = BAR + 2;
    const ceiling = Math.max(0, (geo?.ceiling ?? 0) - frame.top);
    const above = sel.top - ceiling >= room;
    const below = frame.height - (sel.top + sel.height) >= room;
    const where = above ? "above" : below && !ceiling ? "below" : "inside";
    const top =
      where === "above"
        ? sel.top - BAR
        : where === "below"
          ? sel.top + sel.height
          : Math.max(sel.top, ceiling) + 2;
    const fits = widths.tag + widths.tools + 8 <= sel.width;
    const right = geo?.site
      ? Math.min(frame.width, geo.site.left + geo.site.width - frame.left)
      : frame.width;
    // A narrow block keeps the name and the tools side by side, moved left
    // together near the site's right edge so the tools never cover the name.
    const tagLeft = Math.max(
      0,
      Math.min(sel.left, right - widths.tag - (fits ? 0 : widths.tools + 4)),
    );
    const toolsLeft = fits
      ? Math.min(sel.left + sel.width - widths.tools, right - widths.tools)
      : tagLeft + widths.tag + 4;
    return { where, top, tagLeft, toolsLeft: Math.max(0, toolsLeft) };
  })();

  // "+" between sections: on the hovered section's top and bottom edges.
  const studio = useStudio.getState();
  const pageSections =
    project.pages.find((p) => p.id === studio.activePage)?.sections ?? [];
  const hovered = geo?.section && at(geo.section.rect);
  const inPage =
    !!geo?.section && pageSections.some((s) => s.id === geo.section!.id);
  const isFirst = inPage && pageSections[0]?.id === geo?.section?.id;
  const showGaps = !!(
    hovered &&
    onAddSection &&
    !typing &&
    !dragging &&
    !preview
  );
  const gapButton = (y: number, after: string | undefined, key: string) => (
    <button
      key={key}
      type="button"
      className="blocks-gap-add"
      style={{ left: hovered!.left + hovered!.width / 2, top: y }}
      aria-label="Add a section here"
      data-tip="Add a section here"
      onClick={() => onAddSection?.(after)}
    >
      <Icon name="plus" size={14} />
    </button>
  );
  const typingBar =
    typing && geo?.typing && node && section
      ? (() => {
          const t = at(geo.typing);
          const top = t.top >= 40 ? t.top - 36 : t.top + t.height + 6;
          return (
            <TextToolbar
              section={section.id}
              node={node}
              device={device}
              onDone={() => onDoneTyping?.()}
              wordsOnly={!!root && pathTo([root], node.id).some(isClassicForm)}
              style={{
                left: Math.max(4, Math.min(t.left, frame.width - 360)),
                top: Math.max(4, top),
              }}
            />
          );
        })()
      : null;
  const pv = geo?.preview;

  return (
    <>
      <div
        className="blocks-overlay"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
        }}
      >
        {showHover && geo?.hover && (
          <div className="blocks-hover" style={at(geo.hover)}>
            <span className="blocks-tag">
              {hoverNode === hoverSection?.root
                ? hoverSection?.name
                : nodeLabel(hoverNode!)}
              <LogicMarks node={hoverNode!} />
            </span>
          </div>
        )}
        {showGaps &&
          inPage && [
            isFirst &&
              gapButton(
                hovered!.top,
                sectionSlot(geo!.section!.id, true),
                "top",
              ),
            gapButton(
              hovered!.top + hovered!.height,
              geo!.section!.id,
              "bottom",
            ),
          ]}
        {/* Kept mounted while dragging: removing the drag handle would cancel the drag. */}
        {showSelection && sel && place && (
          <>
            <div
              className={`blocks-selected ${isRoot ? "is-root" : ""} ${dragging ? "is-dragging" : ""}`}
              style={sel}
            />
            <div
              ref={tag}
              className={`blocks-name is-${place.where} ${dragging ? "is-dragging" : ""}`}
              style={{ left: place.tagLeft, top: place.top }}
            >
              <button
                type="button"
                className="blocks-name-button"
                aria-haspopup="menu"
                aria-expanded={parentsOpen}
                aria-label={`${label(node!.id)}. Show what it sits in`}
                data-tip={path.length > 1 ? "What it sits in" : undefined}
                onClick={() => path.length > 1 && setParentsOpen(!parentsOpen)}
              >
                <Icon name={isRoot ? "panel" : def!.icon} size={12} />
                <span>{label(node!.id)}</span>
                {node!.locked && (
                  <span className="blocks-locked" title="Locked">
                    <Icon name="lock" size={11} />
                    <span className="sr-only">Locked</span>
                  </span>
                )}
                <LogicMarks node={node!} />
                {path.length > 1 && <Icon name="down" size={11} />}
              </button>
              {parentsOpen && (
                <div
                  className="blocks-parents"
                  role="menu"
                  aria-label="Select a block it sits in"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setParentsOpen(false);
                    }
                  }}
                >
                  {path.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      aria-current={p.id === node!.id ? "true" : undefined}
                      style={{ paddingLeft: 8 + i * 10 }}
                      onClick={() => {
                        setParentsOpen(false);
                        onPick(section!.id, p.id);
                      }}
                    >
                      <Icon
                        name={p === root ? "panel" : BLOCKS[p.type].icon}
                        size={12}
                      />
                      <span>{label(p.id)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              ref={tools}
              className={`blocks-toolbar is-${place.where} ${dragging ? "is-dragging" : ""}`}
              role="toolbar"
              aria-label={`${label(node!.id)} actions`}
              style={{ left: place.toolsLeft, top: place.top }}
            >
              {!isRoot && (
                <button
                  type="button"
                  className="blocks-tool"
                  aria-label="Select parent"
                  data-tip="Select parent · Esc"
                  onClick={() => onPick(section!.id, path[path.length - 2].id)}
                >
                  <Icon name="parent" size={14} />
                </button>
              )}
              {!isRoot && (
                <span
                  className="blocks-tool blocks-grip"
                  draggable
                  role="button"
                  tabIndex={-1}
                  aria-label="Drag to move"
                  data-tip="Drag to move"
                  onDragStart={(e) => {
                    const locked = selectionLock("move");
                    if (locked) {
                      e.preventDefault();
                      notify(locked);
                      return;
                    }
                    startDrag(
                      { kind: "node", section: section!.id, id: node!.id },
                      e.dataTransfer,
                    );
                    const el =
                      scroll.current && nodeElement(scroll.current, node!.id);
                    if (el) e.dataTransfer.setDragImage(el, 12, 12);
                  }}
                  onDragEnd={endDrag}
                >
                  <Icon name="grip" size={14} />
                </span>
              )}
              <button
                type="button"
                className="blocks-tool"
                aria-label={isRoot ? "Move section up" : "Move up"}
                data-tip={isRoot ? "Move section up" : "Move up · Alt ↑"}
                disabled={!moves?.up}
                onClick={() => {
                  const locked = selectionLock("move");
                  if (locked) notify(locked);
                  else moveSibling(-1);
                }}
              >
                <Icon name="up" size={14} />
              </button>
              <button
                type="button"
                className="blocks-tool"
                aria-label={isRoot ? "Move section down" : "Move down"}
                data-tip={isRoot ? "Move section down" : "Move down · Alt ↓"}
                disabled={!moves?.down}
                onClick={() => {
                  const locked = selectionLock("move");
                  if (locked) notify(locked);
                  else moveSibling(1);
                }}
              >
                <Icon name="down" size={14} />
              </button>
              <button
                type="button"
                className="blocks-tool"
                aria-label="Duplicate"
                data-tip="Duplicate · ⌘D"
                onClick={() => {
                  const locked = selectionLock("duplicate");
                  if (locked) return notify(locked);
                  duplicateSelected();
                  const s = useStudio.getState();
                  if (s.selected) onPick(s.selected, s.selectedBlock ?? "");
                }}
              >
                <Icon name="copy" size={14} />
              </button>
              <button
                type="button"
                className={`blocks-tool ${node!.locked ? "is-on" : ""}`}
                aria-label={node!.locked ? "Unlock" : "Lock"}
                aria-pressed={!!node!.locked}
                data-tip={
                  node!.locked
                    ? "Unlock to move or delete it"
                    : "Lock its place and what’s inside"
                }
                onClick={() => {
                  const now = toggleLocked();
                  notify(
                    now
                      ? `${label(node!.id)} locked. Text and settings stay editable.`
                      : `${label(node!.id)} unlocked`,
                    undoAction,
                  );
                }}
              >
                <Icon name={node!.locked ? "lock" : "unlock"} size={14} />
              </button>
              <button
                type="button"
                className="blocks-tool"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                data-tip="More · right-click"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  useBlocksUi.setState({
                    menu: { x: r.left, y: r.bottom + 4 },
                  });
                }}
              >
                <Icon name="dots" size={16} />
              </button>
              <button
                type="button"
                className={`blocks-tool danger ${selectionLock("delete") ? "is-blocked" : ""}`}
                aria-label="Delete"
                aria-disabled={selectionLock("delete") ? true : undefined}
                data-tip={selectionLock("delete") ?? "Delete · Del"}
                onClick={() => {
                  const locked = selectionLock("delete");
                  if (locked) return notify(locked);
                  const name = removeSelected();
                  const s = useStudio.getState();
                  if (s.selected) onPick(s.selected, s.selectedBlock ?? "");
                  notify(`${name} deleted`, undoAction);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            {def?.container &&
              onAddBlock &&
              !node!.locked &&
              sel.height > (isRoot ? 140 : 56) &&
              !dragging &&
              !preview && (
                <button
                  type="button"
                  className="blocks-add-inside"
                  style={{
                    left: sel.left + sel.width / 2,
                    // Nested blocks: on the bottom edge; a section: just inside it,
                    // clear of the "+" for a new section on its edge.
                    top: sel.top + sel.height - (isRoot ? 18 : 0),
                  }}
                  aria-label={`Add a block to ${label(node!.id)}`}
                  data-tip={`Add a block to ${label(node!.id)}`}
                  onClick={onAddBlock}
                >
                  <Icon name="plus" size={13} />
                  Add block
                </button>
              )}
          </>
        )}
        {pv &&
          !hint &&
          (() => {
            // The Add panel covers the canvas's left edge: keep the label in view,
            // and point up or down when the spot is scrolled out of view.
            const panel = document
              .querySelector(".add-flyout")
              ?.getBoundingClientRect();
            const minLeft = panel ? panel.right - frame.left + 8 : 4;
            const y = pv.y - frame.top;
            const out = y < 0 ? "up" : y > frame.height ? "down" : null;
            if (out)
              return (
                <span
                  className={`blocks-drop-label is-edge is-${out}`}
                  style={{
                    left: Math.max(minLeft, (minLeft + frame.width) / 2 - 60),
                    ...(out === "up" ? { top: 8 } : { bottom: 8 }),
                  }}
                >
                  <Icon name={out === "up" ? "up" : "down"} size={12} />
                  Adds {out === "up" ? "above" : "further down"}
                </span>
              );
            const label = labelStyle(pv, frame);
            return (
              <>
                {pv.box && (
                  <div
                    className="blocks-drop-box is-preview"
                    style={at(pv.box)}
                  />
                )}
                <div
                  className={`blocks-drop-line is-preview ${pv.vertical ? "vertical" : ""}`}
                  style={lineStyle(pv, frame)}
                />
                <span
                  className="blocks-drop-label"
                  style={{
                    ...label,
                    left: Math.max(minLeft, Number(label.left)),
                  }}
                >
                  Adds here
                </span>
              </>
            );
          })()}
        {hint && (
          <>
            {hint.box && (
              <div className="blocks-drop-box" style={at(hint.box)} />
            )}
            {hint.line && (
              <div
                className={`blocks-drop-line ${hint.line.vertical ? "vertical" : ""}`}
                style={lineStyle(hint.line, frame)}
              />
            )}
            <span
              className="blocks-drop-label"
              style={
                hint.line
                  ? labelStyle(hint.line, frame)
                  : {
                      left: Math.max(
                        4,
                        (hint.box?.left ?? frame.left) - frame.left,
                      ),
                      top: Math.max(
                        4,
                        (hint.box?.top ?? frame.top) - frame.top - 24,
                      ),
                    }
              }
            >
              {hint.label}
            </span>
          </>
        )}
        {typingBar}
      </div>
      {menu}
    </>
  );
}

type Line = NonNullable<DropHint["line"]>;
const lineStyle = (l: Line, frame: Rect): CSSProperties =>
  l.vertical
    ? { left: l.x - frame.left - 1.5, top: l.y - frame.top, height: l.length }
    : { left: l.x - frame.left, top: l.y - frame.top - 1.5, width: l.length };
const labelStyle = (l: Line, frame: Rect): CSSProperties => ({
  left: Math.max(4, l.x - frame.left),
  top: Math.max(4, l.y - frame.top - (l.vertical ? 0 : 24)),
});

/** Lightning: does something when clicked. Eye: shown only when a rule is met. */
function LogicMarks({ node }: { node: BlockNode }) {
  const click = !!node.on?.click?.length;
  const when = !!node.when;
  if (!click && !when) return null;
  return (
    <span
      className="blocks-logic"
      title={[
        click && "Does something when clicked",
        when && "Shown only when a rule is met",
      ]
        .filter(Boolean)
        .join(". ")}
    >
      {click && <Icon name="zap" size={11} />}
      {when && <Icon name="eye" size={11} />}
    </span>
  );
}
