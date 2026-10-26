/**
 * The Add panel, opened beside Pages/Layers (so the page's tree stays in
 * view): prebuilt sections (with live miniatures) and single blocks. One
 * search finds both. Categories are a sticky index; recently added items
 * come first. Click (or Enter) adds at the selection, drag drops at the spot
 * shown on the canvas, and hovering an item shows on the canvas where it
 * would go. Arrow keys move through the items.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Icon } from "../../studio/Icon";
import { IconButton } from "../../studio/ui";
import { useStudio } from "../../studio/store";
import type { Project } from "../../studio/model";
import { NODE_TYPES, type Node, type NodeType } from "../model";
import { BLOCKS, CATEGORIES } from "../registry";
import {
  PRESETS,
  PRESET_CATEGORIES,
  presetById,
  type Preset,
} from "../presets";
import { Nodes } from "../render";
import { FormFieldsGroup } from "../forms/AddFields";
import { treeCss } from "../style";
import {
  blockSelection,
  endDrag,
  insertBlock,
  insertPreset,
  recentItems,
  rememberRecent,
  startDrag,
  useBlocksUi,
  type InsertPreview,
  type Notify,
} from "./actions";

export type AddTab = "sections" | "blocks";
/** Width the miniatures are drawn at before scaling down. */
const PREVIEW_WIDTH = 1200;

/** Videos and maps as plain panels: miniatures shouldn't load players. */
function stillFrame(node: Node): Node {
  if (node.type === "video" || node.type === "map")
    return {
      id: node.id,
      type: "box",
      props: { variant: "panel" },
      style: { ...node.style, minHeight: node.style?.height ?? 260 },
      children: [],
    };
  return node.children
    ? { ...node, children: node.children.map(stillFrame) }
    : node;
}

/** A prebuilt section drawn small, exactly as it will look on this site. */
export function PresetPreview({
  preset,
  project,
  zoom,
}: {
  preset: Preset;
  project: Project;
  zoom: number;
}) {
  const { theme, name } = project;
  // Drawn once it scrolls near the view: the panel holds dozens of these.
  const frame = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const el = frame.current;
    if (near || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  // Rebuilt only when what it shows changes (the site's name and theme).
  const node = useMemo(
    () => (near ? stillFrame(preset.build({ project })) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, name, theme, near],
  );
  if (!node)
    return (
      <div
        ref={frame}
        className="add-preset-preview is-waiting"
        aria-hidden="true"
      />
    );
  return (
    <div className="add-preset-preview" aria-hidden="true" inert>
      <div
        className={`website website-preview font-${theme.font} scale-${theme.scale ?? "balanced"} spacing-${theme.spacing ?? "comfortable"} buttons-${theme.buttons ?? "solid"}`}
        style={
          {
            width: PREVIEW_WIDTH,
            zoom,
            "--site-accent": theme.accent,
            "--site-background": theme.background,
            "--site-color": theme.color,
            "--site-radius": `${theme.radius}px`,
            background: theme.background,
            color: theme.color,
          } as CSSProperties
        }
      >
        <style dangerouslySetInnerHTML={{ __html: treeCss([node]) }} />
        <Nodes
          nodes={[node]}
          ctx={{ project, exporting: false, href: () => "#", miniature: true }}
        />
      </div>
    </div>
  );
}

const blockTypes = NODE_TYPES.filter((t) => !BLOCKS[t].internal);

export function AddPanel({
  tab,
  onTab,
  after,
  onAfter,
  onClose,
  onSection,
  onBlock,
  onBrowseSaved,
  notify,
  alone = false,
}: {
  tab: AddTab;
  onTab: (tab: AddTab) => void;
  /** Where new sections go: after this section, "start", or the end. */
  after?: string;
  onAfter: (after?: string) => void;
  onClose: () => void;
  /** A section was added (by click): show it. */
  onSection: (id: string, name: string) => void;
  /** A block was added (by click): show its settings. */
  onBlock: (section: string, node: string) => void;
  /** Opens the sections the owner saved to reuse. */
  onBrowseSaved: () => void;
  notify: Notify;
  /** Pages/Layers is closed: the panel sits at the edge. */
  alone?: boolean;
}) {
  const store = useStudio();
  const { project } = store;
  const page = project.pages.find((p) => p.id === store.activePage)!;
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const list = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.24);
  const [recent, setRecent] = useState(recentItems);
  // Miniatures are drawn full size and zoomed to the panel's width.
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth) setZoom((el.clientWidth - 34) / PREVIEW_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Nothing to show on the canvas once the panel closes.
  useEffect(() => () => useBlocksUi.setState({ preview: null }), []);
  const words = search.split(/\s+/).filter(Boolean);
  const matches = (...text: string[]) => {
    const hay = text.join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };

  const presetGroups = PRESET_CATEGORIES.map((c) => ({
    id: c.id as string,
    label: c.label,
    items: PRESETS.filter(
      (p) => p.category === c.id && matches(p.name, p.description, c.label),
    ),
  })).filter((c) => c.items.length);
  const blockGroups = CATEGORIES.map((c) => ({
    id: c.id as string,
    label: c.label,
    items: blockTypes.filter(
      (t) =>
        BLOCKS[t].category === c.id &&
        matches(BLOCKS[t].label, BLOCKS[t].description, c.label),
    ),
  })).filter((c) => c.items.length);
  const recentPresets = recent
    .filter((r) => r.startsWith("preset:"))
    .map((r) => presetById(r.slice(7)))
    .filter((p): p is Preset => !!p);
  const recentBlocks = recent
    .filter((r) => r.startsWith("block:"))
    .map((r) => r.slice(6) as NodeType)
    .filter((t) => BLOCKS[t] && !BLOCKS[t].internal);

  const sel = blockSelection();
  const target = sel.root
    ? sel.node === sel.root
      ? sel.section.name
      : `${BLOCKS[sel.node.type].label.toLowerCase()} in ${sel.section.name}`
    : null;
  const where =
    after === "start"
      ? "at the top of the page"
      : after
        ? `after ${page.sections.find((s) => s.id === after)?.name ?? "the selection"}`
        : "at the end of the page";

  const showPreview = (preview: InsertPreview | null) =>
    useBlocksUi.setState({ preview });
  const addPreset = (preset: Preset) => {
    const id = insertPreset(preset.id, after);
    rememberRecent(`preset:${preset.id}`);
    setRecent(recentItems());
    showPreview(null);
    if (id) onSection(id, preset.name);
  };
  const addBlock = (type: NodeType) => {
    const id = insertBlock(type);
    const s = useStudio.getState();
    if (id && s.selected) {
      rememberRecent(`block:${type}`);
      setRecent(recentItems());
      onBlock(s.selected, id);
    } else
      notify(
        `A ${BLOCKS[type].label.toLowerCase()} can’t go here. Select a box, row or section first.`,
      );
  };

  // Arrow keys move between items; from the search box, down enters the list.
  const items = () =>
    Array.from(list.current?.querySelectorAll<HTMLElement>(".add-item") ?? []);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      const el = all[Math.max(0, Math.min(all.length - 1, n))];
      el?.focus();
      el?.scrollIntoView?.({ block: "nearest" });
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") {
      if (i <= 0) document.getElementById("add-search")?.focus();
      else go(i - 1);
    } else if (e.key === "Home" && i >= 0) go(0);
    else if (e.key === "End" && i >= 0) go(all.length - 1);
    else return;
    e.preventDefault();
  };

  const presetCard = (preset: Preset, key = preset.id) => (
    <button
      key={key}
      type="button"
      className="add-preset add-item"
      draggable
      aria-label={`${preset.name}: ${preset.description}`}
      onDragStart={(e) => {
        showPreview(null);
        startDrag({ kind: "preset", id: preset.id }, e.dataTransfer);
      }}
      onDragEnd={endDrag}
      onPointerEnter={() =>
        showPreview({ kind: "preset", id: preset.id, after })
      }
      onPointerLeave={() => showPreview(null)}
      onFocus={() => showPreview({ kind: "preset", id: preset.id, after })}
      onBlur={() => showPreview(null)}
      onClick={() => addPreset(preset)}
    >
      <PresetPreview preset={preset} project={project} zoom={zoom} />
      <span className="add-preset-name">
        <span>
          <strong>{preset.name}</strong>
          <small>{preset.description}</small>
        </span>
        <Icon name="grip" size={14} className="add-grip" />
      </span>
    </button>
  );
  const blockRow = (type: NodeType, key: string = type) => {
    const def = BLOCKS[type];
    return (
      <button
        key={key}
        type="button"
        className="add-block add-item"
        draggable
        aria-label={`${def.label}: ${def.description}`}
        onDragStart={(e) => {
          showPreview(null);
          startDrag({ kind: "block", type }, e.dataTransfer);
        }}
        onDragEnd={endDrag}
        onPointerEnter={() => showPreview({ kind: "block", type })}
        onPointerLeave={() => showPreview(null)}
        onFocus={() => showPreview({ kind: "block", type })}
        onBlur={() => showPreview(null)}
        onClick={() => addBlock(type)}
      >
        <span className="add-block-icon">
          <Icon name={def.icon} size={17} />
        </span>
        <strong>{def.label}</strong>
        <small>{def.description}</small>
        <Icon name="grip" size={14} className="add-grip" />
      </button>
    );
  };
  const jump = (id: string) => {
    const el = list.current?.querySelector<HTMLElement>(
      `[data-group="${CSS.escape(id)}"]`,
    );
    if (el && list.current)
      list.current.scrollTo({
        top:
          el.offsetTop -
          (list.current.querySelector<HTMLElement>(".add-index")
            ?.offsetHeight ?? 0) -
          4,
        behavior: "smooth",
      });
  };
  const index = (groups: { id: string; label: string }[]) =>
    groups.length > 1 && (
      <nav className="add-index" aria-label="Jump to a category">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            tabIndex={-1}
            onClick={() => jump(g.id)}
          >
            {g.label}
          </button>
        ))}
      </nav>
    );
  const nothing = (
    <div className="navigator-empty add-empty">
      <Icon name="search" size={18} />
      <strong>Nothing matches “{query.trim()}”</strong>
      <p>Try a shorter word, like “text”, “photo” or “price”.</p>
    </div>
  );

  return (
    <aside
      className={`site-navigator add-panel add-flyout ${alone ? "is-alone" : ""}`}
      role="dialog"
      aria-label="Add blocks and sections"
      onKeyDown={keys}
    >
      <div className="navigator-title">
        <div>
          <strong>Add</strong>
        </div>
        <IconButton icon="x" label="Close add panel" onClick={onClose} />
      </div>
      <div className="navigator-search add-search">
        <Icon name="search" size={15} />
        <input
          id="add-search"
          autoFocus
          aria-label="Search sections and blocks"
          placeholder="Search sections and blocks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              items()[0]?.click();
            }
          }}
        />
        {query && (
          <IconButton
            icon="x"
            label="Clear search"
            onClick={() => setQuery("")}
          />
        )}
      </div>
      {!search && (
        <div className="add-tabs" role="tablist" aria-label="What to add">
          {(["sections", "blocks"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              id={`add-tab-${t}`}
              aria-selected={tab === t}
              aria-controls="add-panel-body"
              className={tab === t ? "selected" : ""}
              onClick={() => onTab(t)}
            >
              <Icon name={t === "sections" ? "panel" : "grid"} size={14} />
              {t === "sections" ? "Sections" : "Blocks"}
            </button>
          ))}
        </div>
      )}
      {(tab === "sections" || search) && (
        <label className="add-placement">
          <span>New sections go</span>
          <select
            aria-label="Section position"
            value={after ?? "end"}
            onChange={(e) =>
              onAfter(e.target.value === "end" ? undefined : e.target.value)
            }
          >
            <option value="end">At the end of {page.name}</option>
            <option value="start">At the top of {page.name}</option>
            {page.sections.map((s) => (
              <option key={s.id} value={s.id}>
                After {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div
        className="navigator-scroll add-scroll"
        id="add-panel-body"
        role={search ? undefined : "tabpanel"}
        aria-labelledby={search ? undefined : `add-tab-${tab}`}
        ref={list}
      >
        {search ? (
          <>
            {!blockGroups.length && !presetGroups.length && nothing}
            {blockGroups.length > 0 && (
              <section className="add-group">
                <h3>Blocks</h3>
                <div className="add-blocks">
                  {blockGroups.flatMap((g) => g.items).map((t) => blockRow(t))}
                </div>
              </section>
            )}
            {presetGroups.length > 0 && (
              <section className="add-group">
                <h3>Sections · {where}</h3>
                {presetGroups.flatMap((g) => g.items).map((p) => presetCard(p))}
              </section>
            )}
          </>
        ) : tab === "sections" ? (
          <>
            {index(presetGroups)}
            <p className="add-hint">
              Click to add {where}, or drag onto the page. Everything in a
              section can be changed afterwards.
            </p>
            {recentPresets.length > 0 && (
              <section className="add-group" data-group="recent">
                <h3>
                  <Icon name="undo" size={12} />
                  Recently added
                </h3>
                {recentPresets
                  .slice(0, 2)
                  .map((p) => presetCard(p, `recent-${p.id}`))}
              </section>
            )}
            {presetGroups.map((group) => (
              <section
                className="add-group"
                key={group.id}
                data-group={group.id}
              >
                <h3>{group.label}</h3>
                {group.items.map((p) => presetCard(p))}
              </section>
            ))}
            <button className="add-more" onClick={onBrowseSaved}>
              <Icon name="folder" size={15} />
              Your saved sections
            </button>
          </>
        ) : (
          <>
            {index(blockGroups)}
            <p className="add-hint">
              {target
                ? `Click to add to the ${target}, or drag onto the page.`
                : "Click to add in a new section, or drag onto the page."}
            </p>
            <FormFieldsGroup search={search} onBlock={onBlock} />
            {recentBlocks.length > 0 && (
              <section className="add-group" data-group="recent">
                <h3>
                  <Icon name="undo" size={12} />
                  Recently added
                </h3>
                <div className="add-blocks">
                  {recentBlocks.map((t) => blockRow(t, `recent-${t}`))}
                </div>
              </section>
            )}
            {blockGroups.map((group) => (
              <section
                className="add-group"
                key={group.id}
                data-group={group.id}
              >
                <h3>{group.label}</h3>
                <div className="add-blocks">
                  {group.items.map((t) => blockRow(t))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
      <p className="add-footer" aria-hidden="true">
        <kbd>↑</kbd>
        <kbd>↓</kbd> to move · <kbd>Enter</kbd> to add · <kbd>Esc</kbd> to close
      </p>
    </aside>
  );
}
