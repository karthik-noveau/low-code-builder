/**
 * Layers: everything on the open page as a tree — the shared header, the
 * page's sections and the footer. Blocks sections open into their blocks;
 * classic sections are a single row. Select (synced with the canvas),
 * rename (double-click or F2), show/hide, lock, drag to reorder (sections
 * also between the header, the page and the footer), right-click for the
 * block menu, expand or collapse everything. Guides show the nesting; small
 * device icons mark blocks hidden on tablets or phones.
 */
import {
  useEffect,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import { findSection, sectionMeta, type Section } from "../../studio/model";
import { locate, pathTo, type Node } from "../model";
import { BLOCKS, nodeLabel } from "../registry";
import { accepts, lockNotice } from "../lock";
import { varsUsed } from "../logic/model";
import {
  currentDrag,
  drop,
  endDrag,
  payloadType,
  revealSection,
  startDrag,
  undoAction,
  useBlocksUi,
  type DropTarget,
  type Notify,
} from "./actions";
import { sectionSlot } from "./dropzone";

type Zone = "before" | "after" | "inside";
/** The three lists sections live in: the shared header, the page, the shared footer. */
type List = "header" | "page" | "footer";

function Rename({
  value,
  label,
  onDone,
}: {
  value: string;
  label: string;
  onDone: (name: string | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="layer-rename"
      autoFocus
      aria-label={label}
      value={draft}
      maxLength={80}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(draft);
        if (e.key === "Escape") onDone(null);
      }}
    />
  );
}

export function Layers({
  onSelectSection,
  onSelectNode,
  notify = () => {},
}: {
  onSelectSection: (id: string) => void;
  onSelectNode: (section: string, node: string) => void;
  notify?: Notify;
}) {
  const store = useStudio();
  const { project, selected, selectedBlock } = store;
  const page = project.pages.find((p) => p.id === store.activePage)!;
  const hover = useBlocksUi((s) => s.hover);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ row: string; zone: Zone } | null>(
    null,
  );
  /** The section being dragged by its row (it can change lists). */
  const [movingSection, setMovingSection] = useState<string | null>(null);

  // The selection's section and ancestors open (once per new selection), so
  // its row is in view.
  const [opened, setOpened] = useState("");
  const selectionKey = `${selected}:${selectedBlock}`;
  if (selected && opened !== selectionKey) {
    setOpened(selectionKey);
    const root = findSection(project, selected)?.root;
    const path = root && selectedBlock ? pathTo([root], selectedBlock) : [];
    const ids = [selected, ...path.slice(0, -1).map((n) => n.id)];
    if (!ids.every((id) => open.has(id))) setOpen(new Set([...open, ...ids]));
  }
  useEffect(() => {
    requestAnimationFrame(() =>
      document
        .querySelector(".layers .layer-row.selected")
        ?.scrollIntoView?.({ block: "nearest" }),
    );
  }, [selected, selectedBlock]);

  /** Every row that can open: sections with blocks, and blocks with blocks inside. */
  const openable = () => {
    const ids: string[] = [];
    const visit = (nodes: Node[]) =>
      nodes.forEach((n) => {
        if (n.children?.length) {
          ids.push(n.id);
          visit(n.children);
        }
      });
    for (const s of [...project.header, ...page.sections, ...project.footer])
      if (s.root?.children?.length) {
        ids.push(s.id);
        visit(s.root.children);
      }
    return ids;
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Where a drag over a row (section `s`, block `n`) would land. */
  const zoneFor = (
    e: DragEvent,
    s: Section,
    n: Node | undefined,
  ): { zone: Zone; target: DropTarget } | null => {
    const payload = currentDrag();
    const type = payload && payloadType(payload);
    if (!payload || !type) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const rel = r.height ? (e.clientY - r.top) / r.height : 0.5;
    const root = s.root;
    const half: Zone = rel < 0.5 ? "before" : "after";
    // Section rows (classic, or a blocks section's own row) for new sections.
    if (payload.kind === "preset" || !root || !n) {
      if (payload.kind === "node") return null;
      if (payload.kind === "block" && root && n === root)
        return {
          zone: "inside",
          target: {
            kind: "node",
            section: s.id,
            parent: root.id,
            index: root.children?.length ?? 0,
          },
        };
      return {
        zone: half,
        target: {
          kind: "section",
          after: sectionSlot(s.id, half === "before"),
        },
      };
    }
    // A block can't go inside itself.
    if (
      payload.kind === "node" &&
      pathTo([root], n.id).some((p) => p.id === payload.id)
    )
      return null;
    const at = locate([root], n.id);
    const middle = rel > 0.25 && rel < 0.75;
    if (
      accepts(n, type) &&
      (middle || n === root || !at?.parent || !accepts(at.parent, type))
    )
      return {
        zone: "inside",
        target: {
          kind: "node",
          section: s.id,
          parent: n.id,
          index: rel < 0.5 && n !== root ? 0 : (n.children?.length ?? 0),
        },
      };
    if (!at?.parent || !accepts(at.parent, type)) return null;
    return {
      zone: half,
      target: {
        kind: "node",
        section: s.id,
        parent: at.parent.id,
        index: at.index + (half === "after" ? 1 : 0),
      },
    };
  };
  const dropProps = (rowId: string, s: Section, n?: Node) => ({
    onDragOver: (e: DragEvent) => {
      const found = zoneFor(e, s, n);
      if (!found) return;
      e.preventDefault();
      e.stopPropagation();
      if (dropAt?.row !== rowId || dropAt.zone !== found.zone)
        setDropAt({ row: rowId, zone: found.zone });
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null))
        setDropAt((d) => (d?.row === rowId ? null : d));
    },
    onDrop: (e: DragEvent) => {
      const payload = currentDrag();
      const found = zoneFor(e, s, n);
      e.preventDefault();
      setDropAt(null);
      endDrag();
      if (!payload || !found) return;
      const id = drop(payload, found.target);
      const state = useStudio.getState();
      if (id && state.selected) {
        if (state.selectedBlock)
          onSelectNode(state.selected, state.selectedBlock);
        else onSelectSection(state.selected);
      }
    },
  });

  const row = ({
    id,
    depth,
    icon,
    name,
    isSelected,
    hidden,
    locked,
    onLock,
    hiddenOn = [],
    logic,
    kids,
    onSelect,
    onRename,
    onHide,
    onMenu,
    drag,
    drops,
    hoverId,
  }: {
    id: string;
    depth: number;
    icon: string;
    name: string;
    isSelected: boolean;
    hidden: boolean;
    /** Locked in place (src/blocks/lock.ts); onLock toggles it. */
    locked?: boolean;
    onLock?: () => void;
    /** Screen sizes it's hidden on (tablet, phone). */
    hiddenOn?: ("tablet" | "mobile")[];
    /** Has a click (lightning) or a "show only when" (src/blocks/logic). */
    logic?: { click: boolean; when: boolean };
    kids?: ReactNode;
    onSelect: () => void;
    onRename: (name: string) => void;
    onHide: () => void;
    /** Right-click: selects the row and opens the block menu there. */
    onMenu?: (x: number, y: number) => void;
    drag?: (e: DragEvent) => void;
    drops: ReturnType<typeof dropProps>;
    hoverId?: string;
  }) => {
    const expanded = open.has(id);
    return (
      <div className="layer" key={id} role="none">
        <div
          className={`layer-row ${isSelected ? "selected" : ""} ${hidden ? "is-hidden" : ""} ${locked ? "is-locked" : ""} ${hoverId && hover === hoverId ? "is-hovered" : ""} ${dropAt?.row === id ? `drop-${dropAt.zone}` : ""}`}
          style={
            {
              paddingLeft: 4 + depth * 14,
              "--indent": `${4 + depth * 14 + 18}px`,
            } as CSSProperties
          }
          onContextMenu={
            onMenu
              ? (e) => {
                  e.preventDefault();
                  onMenu(e.clientX, e.clientY);
                }
              : undefined
          }
          draggable={!!drag && renaming !== id}
          onDragStart={drag}
          onDragEnd={() => {
            setDropAt(null);
            endDrag();
          }}
          onPointerEnter={() =>
            hoverId && useBlocksUi.getState().setHover(hoverId)
          }
          onPointerLeave={() =>
            hoverId && useBlocksUi.getState().setHover(null)
          }
          {...drops}
        >
          {depth > 0 && (
            <span
              className="layer-guides"
              aria-hidden="true"
              style={{ width: depth * 14 }}
            />
          )}
          {kids ? (
            <button
              type="button"
              className="layer-disclosure"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
              aria-expanded={expanded}
              onClick={() => toggle(id)}
            >
              <Icon name={expanded ? "down" : "chevron"} size={11} />
            </button>
          ) : (
            <span className="layer-disclosure" aria-hidden="true" />
          )}
          {renaming === id ? (
            <span className="layer-select">
              <Icon name={icon} size={13} />
              <Rename
                value={name}
                label={`Rename ${name}`}
                onDone={(next) => {
                  setRenaming(null);
                  if (next !== null && next.trim() && next.trim() !== name)
                    onRename(next.trim());
                }}
              />
            </span>
          ) : (
            <button
              type="button"
              className="layer-select"
              aria-pressed={isSelected}
              aria-description="Double-click or press F2 to rename"
              title={name}
              onClick={onSelect}
              onDoubleClick={() => setRenaming(id)}
              onKeyDown={(e) => {
                if (e.key === "F2") {
                  e.preventDefault();
                  setRenaming(id);
                }
              }}
            >
              <Icon name={icon} size={13} />
              <span>{name}</span>
            </button>
          )}
          {(logic?.click || logic?.when) && (
            <span
              className="layer-logic-marks"
              title={[
                logic.click && "Does something when clicked",
                logic.when && "Shown only when a rule is met",
              ]
                .filter(Boolean)
                .join(". ")}
            >
              {logic.click && <Icon name="zap" size={11} />}
              {logic.when && <Icon name="eye" size={11} />}
              <span className="sr-only">
                {[
                  logic.click && "Does something when clicked",
                  logic.when && "Shown only when a rule is met",
                ]
                  .filter(Boolean)
                  .join(". ")}
              </span>
            </span>
          )}
          {hiddenOn.length > 0 && !hidden && (
            <span
              className="layer-device-marks"
              title={`Hidden on ${hiddenOn.map((d) => (d === "mobile" ? "phones" : "tablets")).join(" and ")}`}
            >
              {hiddenOn.map((d) => (
                <Icon key={d} name={d} size={11} />
              ))}
              <span className="sr-only">
                Hidden on{" "}
                {hiddenOn
                  .map((d) => (d === "mobile" ? "phones" : "tablets"))
                  .join(" and ")}
              </span>
            </span>
          )}
          {onLock && (
            <button
              type="button"
              className="layer-lock"
              aria-label={`${locked ? "Unlock" : "Lock"} ${name}`}
              aria-pressed={!!locked}
              title={
                locked
                  ? "Locked: it can’t be moved or deleted. Unlock it"
                  : "Lock its place and what’s inside"
              }
              onClick={onLock}
            >
              <Icon name={locked ? "lock" : "unlock"} size={13} />
            </button>
          )}
          <button
            type="button"
            className="layer-eye"
            aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
            title={
              hidden ? "Hidden on your site. Show it" : "Hide on your site"
            }
            onClick={onHide}
          >
            <Icon name={hidden ? "eyeOff" : "eye"} size={13} />
          </button>
        </div>
        {kids && expanded && <div role="group">{kids}</div>}
      </div>
    );
  };

  const nodeRows = (s: Section, nodes: Node[], depth: number): ReactNode =>
    nodes.map((n) =>
      row({
        id: n.id,
        depth,
        icon: BLOCKS[n.type].icon,
        name: nodeLabel(n),
        isSelected: selected === s.id && selectedBlock === n.id,
        hidden: !!n.hidden,
        locked: !!n.locked,
        onLock: () => toggleLock(s, n),
        logic: { click: !!n.on?.click?.length, when: !!n.when },
        hiddenOn: (["tablet", "mobile"] as const).filter((d) =>
          d === "tablet"
            ? n.tablet?.hidden === true
            : (n.mobile?.hidden ?? n.tablet?.hidden) === true,
        ),
        onMenu: (x, y) => {
          onSelectNode(s.id, n.id);
          useBlocksUi.setState({ menu: { x, y } });
        },
        kids: n.children?.length
          ? nodeRows(s, n.children, depth + 1)
          : undefined,
        onSelect: () => onSelectNode(s.id, n.id),
        onRename: (name) =>
          store.updateNode(s.id, n.id, (x) => ({ ...x, name })),
        onHide: () =>
          store.updateNode(s.id, n.id, (x) => ({
            ...x,
            hidden: !x.hidden || undefined,
          })),
        drag: (e) => {
          const locked = s.root && lockNotice(s.root, n.id, "move", s.name);
          if (locked) {
            e.preventDefault();
            notify(locked);
            return;
          }
          startDrag({ kind: "node", section: s.id, id: n.id }, e.dataTransfer);
        },
        drops: dropProps(n.id, s, n),
        hoverId: n.id,
      }),
    );
  /** Locks or unlocks a block (a section by its root): one undo step. */
  const toggleLock = (s: Section, n: Node) => {
    const label = n === s.root ? s.name : nodeLabel(n);
    store.updateNode(s.id, n.id, (x) => ({
      ...x,
      locked: !x.locked || undefined,
    }));
    notify(
      n.locked
        ? `${label} unlocked`
        : `${label} locked. Text and settings stay editable.`,
      undoAction,
    );
  };
  const listOf = (id: string): List | undefined =>
    project.header.some((s) => s.id === id)
      ? "header"
      : project.footer.some((s) => s.id === id)
        ? "footer"
        : page.sections.some((s) => s.id === id)
          ? "page"
          : undefined;
  const sections = {
    header: project.header,
    page: page.sections,
    footer: project.footer,
  };
  /**
   * Drops the dragged section into `list` before or after `target` (the end
   * of the list without one). Moving between lists changes where it shows:
   * every page (header, footer) or only this page.
   */
  const placeSection = (
    moved: string,
    list: List,
    target?: string,
    zone: Zone = "after",
  ) => {
    const section = findSection(project, moved);
    const from = listOf(moved);
    if (!section || !from || moved === target) return;
    if (section.root?.locked)
      return notify(lockNotice(section.root, section.root.id, "move")!);
    if (from === "page" && list !== "page" && varsUsed(section.root).size)
      return notify(
        `${section.name} uses this page’s values, so it stays on ${page.name}.`,
      );
    const rest = sections[list].filter((x) => x.id !== moved);
    const at = target ? rest.findIndex((x) => x.id === target) : -1;
    const index = at < 0 ? rest.length : at + (zone === "before" ? 0 : 1);
    if (
      from === list &&
      sections[list].findIndex((x) => x.id === moved) === index
    )
      return;
    if (!store.placeSection(moved, list, index)) return;
    notify(
      from === list
        ? `${section.name} moved`
        : list === "header"
          ? `${section.name} now shows at the top of every page`
          : list === "footer"
            ? `${section.name} now shows at the bottom of every page`
            : `${section.name} now shows on ${page.name} only`,
      undoAction,
    );
    if (section.root) onSelectNode(moved, section.root.id);
    else onSelectSection(moved);
    revealSection(moved);
  };
  const sectionRow = (s: Section, list: List) =>
    row({
      id: s.id,
      depth: 0,
      icon: s.root ? "panel" : sectionMeta[s.type].icon,
      name: s.name,
      isSelected:
        selected === s.id &&
        (!s.root || !selectedBlock || selectedBlock === s.root.id),
      hidden: !!s.hidden,
      locked: !!s.root?.locked,
      onLock: s.root ? () => toggleLock(s, s.root!) : undefined,
      kids: s.root?.children?.length
        ? nodeRows(s, s.root.children, 1)
        : undefined,
      onSelect: () =>
        s.root ? onSelectNode(s.id, s.root.id) : onSelectSection(s.id),
      onMenu: s.root
        ? (x, y) => {
            onSelectNode(s.id, s.root!.id);
            useBlocksUi.setState({ menu: { x, y } });
          }
        : undefined,
      onRename: (name) => store.updateSection(s.id, { name }),
      onHide: () => store.updateSection(s.id, { hidden: !s.hidden }),
      // Sections move within their list or to another one (header, page, footer).
      drag: (e) => {
        if (s.root?.locked) {
          e.preventDefault();
          notify(lockNotice(s.root, s.root.id, "move")!);
          return;
        }
        e.dataTransfer.setData("text/forma-section", s.id);
        e.dataTransfer.effectAllowed = "move";
        // After the browser has taken the drag image (see startDrag).
        setTimeout(() => setMovingSection(s.id));
      },
      drops: {
        ...dropProps(s.id, s, s.root),
        onDragOver: (e: DragEvent) => {
          if (movingSection) {
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            const zone: Zone =
              r.height && e.clientY - r.top < r.height / 2 ? "before" : "after";
            if (dropAt?.row !== s.id || dropAt.zone !== zone)
              setDropAt({ row: s.id, zone });
            return;
          }
          dropProps(s.id, s, s.root).onDragOver(e);
        },
        onDrop: (e: DragEvent) => {
          if (movingSection) {
            e.preventDefault();
            e.stopPropagation();
            const zone = dropAt?.row === s.id ? dropAt.zone : "after";
            setDropAt(null);
            setMovingSection(null);
            placeSection(movingSection, list, s.id, zone);
            return;
          }
          dropProps(s.id, s, s.root).onDrop(e);
        },
      },
      hoverId: s.root?.id,
    });

  const groups: [List, string, Section[]][] = [
    ["header", "Top of every page", project.header],
    ["page", page.name, page.sections],
    ["footer", "Bottom of every page", project.footer],
  ];
  /** The end of a list (or an empty one) while a section is dragged. */
  const listEnd = (list: List) => ({
    onDragOver: (e: DragEvent) => {
      if (!movingSection) return;
      e.preventDefault();
      if (dropAt?.row !== `end:${list}`)
        setDropAt({ row: `end:${list}`, zone: "inside" });
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null))
        setDropAt((d) => (d?.row === `end:${list}` ? null : d));
    },
    onDrop: (e: DragEvent) => {
      if (!movingSection) return;
      e.preventDefault();
      setDropAt(null);
      setMovingSection(null);
      placeSection(movingSection, list);
    },
  });
  return (
    <div
      className={`layers ${movingSection ? "is-moving-section" : ""}`}
      aria-label={`Layers of ${page.name}`}
      onDragEnd={() => {
        setMovingSection(null);
        setDropAt(null);
      }}
    >
      <div className="layers-tools">
        <span>Right-click a layer for more</span>
        <button
          type="button"
          aria-label="Expand all"
          title="Expand all"
          onClick={() => setOpen(new Set(openable()))}
        >
          <Icon name="expandAll" size={13} />
        </button>
        <button
          type="button"
          aria-label="Collapse all"
          title="Collapse all"
          onClick={() => setOpen(new Set())}
        >
          <Icon name="collapseAll" size={13} />
        </button>
      </div>
      {groups.map(([list, title, items]) =>
        items.length || movingSection ? (
          <div
            className="layers-group"
            key={list}
            {...(items.length ? {} : listEnd(list))}
          >
            <div className="navigator-group-label">
              <span>{title}</span>
            </div>
            {items.map((s) => sectionRow(s, list))}
            {movingSection && (
              <div
                className={`layers-list-end ${dropAt?.row === `end:${list}` ? "is-over" : ""}`}
                {...(items.length ? listEnd(list) : {})}
              >
                {list === "page"
                  ? `Drop here: only on ${page.name}`
                  : `Drop here: ${list === "header" ? "top" : "bottom"} of every page`}
              </div>
            )}
          </div>
        ) : null,
      )}
      {!page.sections.length && (
        <p className="outline-empty">This page has no sections yet.</p>
      )}
    </div>
  );
}
