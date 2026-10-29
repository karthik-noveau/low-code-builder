import { Fragment, useState, type DragEvent, type ReactNode } from "react";
import { useStudio } from "./store";
import { Icon } from "./Icon";
import { IconButton } from "./ui";
import { ActionMenu } from "./ActionMenu";
import { sectionMeta, type Section } from "./model";
import {
  placeSectionAt,
  type Notify,
  type SectionList,
} from "../blocks/editor/actions";

export function Navigator({
  view = "pages",
  onView,
  layers,
  onAddBlock,
  onNavigate,
  hovered,
  onHover,
  onSelect,
  onPageSettings,
  onAddPage,
  onAdd,
  onStyles,
  onMedia,
  onHelp,
  onTemplates,
  onSaved,
  onData,
  onInbox,
  onApp,
  onReview,
  issueCount,
  onClose,
  notify,
}: {
  /** The site map (pages and sections) or the open page's layers. */
  view?: "pages" | "layers";
  onView?: (view: "pages" | "layers") => void;
  layers?: ReactNode;
  /** Opens the Add panel on its Blocks tab. */
  onAddBlock?: () => void;
  onNavigate: (id: string, keepNavigator?: boolean) => void;
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  onSelect: (id: string) => void;
  onPageSettings: () => void;
  onAddPage: () => void;
  onAdd: () => void;
  onStyles: () => void;
  onMedia: () => void;
  onHelp: () => void;
  onTemplates: () => void;
  onSaved: () => void;
  onData: () => void;
  onInbox: () => void;
  /** Opens the business app builder. */
  onApp?: () => void;
  onReview: () => void;
  issueCount: number;
  onClose: () => void;
  notify: Notify;
}) {
  const store = useStudio();
  const { project } = store;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string | null>(null);
  /** The section being dragged, and where it would land. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{
    row: string;
    zone: "before" | "after";
  } | null>(null);
  const search = query.trim().toLowerCase();
  const matches = (section: Section) =>
    `${section.name} ${section.title} ${section.body}`
      .toLowerCase()
      .includes(search);
  const pages = project.pages.filter(
    (page) =>
      !search ||
      `${page.name} /${page.slug}`.toLowerCase().includes(search) ||
      page.sections.some(matches),
  );
  const navigate = (id: string, keepNavigator = false) => {
    setCollapsed(null);
    onNavigate(id, keepNavigator);
  };
  const select = (id: string, pageId?: string) => {
    if (pageId && pageId !== store.activePage) navigate(pageId);
    onSelect(id);
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };
  /** Drops the dragged section into a list (see placeSectionAt) and selects it. */
  const place = (
    list: SectionList,
    target?: string,
    zone?: "before" | "after",
  ) => {
    const moved = dragging;
    endDrag();
    if (moved && placeSectionAt(moved, list, notify, target, zone))
      onSelect(moved);
  };
  /** The end of a list (or an empty one) while a section is dragged. */
  const listEnd = (list: SectionList, label: string) => {
    const id = `end:${list}`;
    return (
      <div
        className={`layers-list-end outline-drop-end ${over?.row === id ? "is-over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (over?.row !== id) setOver({ row: id, zone: "after" });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setOver((o) => (o?.row === id ? null : o));
        }}
        onDrop={(event) => {
          event.preventDefault();
          place(list);
        }}
      >
        {label}
      </div>
    );
  };
  const row = (
    s: Section,
    index: number,
    sections: Section[],
    pageId?: string,
    /** The list it can be dragged within and out of (the open page's or a shared one). */
    list?: SectionList,
  ) => (
    <div
      key={s.id}
      className={`outline-row ${store.selected === s.id ? "selected" : ""} ${hovered === s.id ? "is-hovered" : ""} ${s.hidden ? "is-hidden" : ""} ${dragging === s.id ? "is-dragging" : ""} ${over?.row === s.id ? `drop-${over.zone}` : ""}`}
      onPointerEnter={() => onHover?.(s.id)}
      onPointerLeave={() => onHover?.(null)}
      draggable={!!list && !search}
      onDragStart={(event) => {
        if (s.root?.locked) {
          event.preventDefault();
          notify("Locked. Unlock it in Layers to move it.");
          return;
        }
        event.dataTransfer.setData("text/forma-section", s.id);
        event.dataTransfer.effectAllowed = "move";
        // After the browser has taken the drag image: drop targets appear.
        setTimeout(() => setDragging(s.id));
      }}
      onDragEnd={endDrag}
      onDragOver={(event: DragEvent) => {
        if (!list || !dragging) return;
        event.preventDefault();
        const r = event.currentTarget.getBoundingClientRect();
        const zone =
          r.height && event.clientY - r.top < r.height / 2 ? "before" : "after";
        if (over?.row !== s.id || over.zone !== zone)
          setOver({ row: s.id, zone });
      }}
      onDrop={(event) => {
        if (!list || !dragging) return;
        event.preventDefault();
        place(list, s.id, over?.row === s.id ? over.zone : "after");
      }}
    >
      <button
        className="outline-select"
        aria-label={`Select ${s.name}`}
        aria-pressed={store.selected === s.id}
        title={s.title ? `${s.name} · ${s.title}` : s.name}
        onClick={() => select(s.id, pageId)}
      >
        <Icon name={sectionMeta[s.type].icon} size={14} />
        <span>{s.name}</span>
        {s.root?.locked && <Icon name="lock" size={12} />}
        {s.hidden && <Icon name="eyeOff" size={12} />}
      </button>
      <ActionMenu
        label={`Actions for ${s.name}`}
        actions={[
          {
            label: s.hidden ? "Show section" : "Hide section",
            icon: s.hidden ? "eye" : "eyeOff",
            run: () => store.updateSection(s.id, { hidden: !s.hidden }),
          },
          {
            label: "Duplicate section",
            icon: "copy",
            run: () => {
              if (pageId) navigate(pageId);
              store.duplicateSection(s.id);
              onSelect(useStudio.getState().selected!);
              notify("Section duplicated");
            },
          },
          {
            label: "Save to library",
            icon: "folder",
            run: () => {
              store.saveSection(s.id);
              notify(`${s.name} saved. Find it in Saved sections.`);
            },
          },
          {
            label: "Move up",
            icon: "up",
            disabled: index === 0 || !!s.root?.locked,
            run: () => store.moveSection(s.id, -1),
          },
          {
            label: "Move down",
            icon: "down",
            disabled: index === sections.length - 1 || !!s.root?.locked,
            run: () => store.moveSection(s.id, 1),
          },
          {
            label: "Delete section",
            icon: "trash",
            danger: true,
            disabled: !!s.root?.locked,
            run: () => {
              store.removeSection(s.id);
              notify("Section deleted. Use Undo to restore it.");
            },
          },
        ]}
      />
    </div>
  );
  const shared = [...project.header, ...project.footer].filter(
    (s) => !search || matches(s),
  );
  return (
    <aside className="site-navigator" aria-label="Website navigator">
      <div className="navigator-title">
        {onView ? (
          <div className="navigator-views" role="tablist" aria-label="Show">
            {(["pages", "layers"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={view === v ? "selected" : ""}
                onClick={() => onView(v)}
              >
                <Icon name={v === "pages" ? "pages" : "layers"} size={14} />
                {v === "pages" ? "Pages" : "Layers"}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <strong>Website</strong>
            <span className="navigator-count">
              {project.pages.length} pages
            </span>
          </div>
        )}
        <IconButton icon="panel" label="Hide site map" onClick={onClose} />
      </div>
      {view === "layers" && (
        <>
          <div className="navigator-insert-row">
            <button className="navigator-insert" onClick={onAdd}>
              <Icon name="plus" size={16} />
              <span>Section</span>
            </button>
            <button className="navigator-insert" onClick={onAddBlock ?? onAdd}>
              <Icon name="plus" size={16} />
              <span>Block</span>
            </button>
          </div>
          <div className="navigator-scroll">{layers}</div>
        </>
      )}
      {/* The site map stays mounted under Layers (its search and folds keep). */}
      <div className="navigator-search" hidden={view === "layers"}>
        <Icon name="search" size={15} />
        <input
          aria-label="Find pages or sections"
          placeholder="Find a page or section…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <IconButton
            icon="x"
            label="Clear navigator search"
            onClick={() => setQuery("")}
          />
        )}
      </div>
      <button
        className="navigator-insert"
        onClick={onAdd}
        aria-label="Insert a section"
        hidden={view === "layers"}
      >
        <Icon name="plus" size={17} />
        <span>Add section</span>
      </button>
      <div
        className="navigator-scroll navigator-pages-view"
        hidden={view === "layers"}
      >
        <div className="navigator-group-label">
          <span>{search ? "Search results" : "Pages"}</span>
          <button
            className="navigator-new-page"
            onClick={onAddPage}
            aria-label="Add page"
          >
            <Icon name="plus" size={14} />
            Add page
          </button>
        </div>
        <div className="navigator-pages">
          {pages.map((page) => {
            const active = page.id === store.activePage;
            const expanded = !!search || (active && collapsed !== page.id);
            const sections = search
              ? page.sections.filter(matches)
              : page.sections;
            const index = project.pages.indexOf(page);
            return (
              <div
                className={`navigator-page-group ${active ? "current" : ""}`}
                key={page.id}
              >
                <div className={`navigator-page-row ${active ? "active" : ""}`}>
                  <button
                    className="page-disclosure"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${page.name} sections`}
                    aria-expanded={expanded}
                    onClick={() => {
                      if (active) setCollapsed(expanded ? page.id : null);
                      else navigate(page.id, true);
                    }}
                  >
                    <Icon name={expanded ? "down" : "chevron"} size={12} />
                  </button>
                  <button
                    className="navigator-page-select"
                    aria-current={active ? "page" : undefined}
                    title={`${page.name} · /${page.slug}`}
                    onClick={() => navigate(page.id)}
                  >
                    <Icon name={index === 0 ? "home" : "pages"} size={15} />
                    <strong>{page.name}</strong>
                  </button>
                  <ActionMenu
                    label={`Actions for ${page.name}`}
                    actions={[
                      {
                        label: "Page settings & SEO",
                        icon: "settings",
                        run: () => {
                          navigate(page.id);
                          onPageSettings();
                        },
                      },
                      {
                        label: "Duplicate page",
                        icon: "copy",
                        run: () => {
                          const id = store.duplicatePage(page.id);
                          if (id) navigate(id);
                          notify("Page duplicated with all its sections");
                        },
                      },
                      {
                        label: "Move page up",
                        icon: "up",
                        disabled: index <= 1,
                        run: () => store.movePage(page.id, -1),
                      },
                      {
                        label: "Move page down",
                        icon: "down",
                        disabled:
                          index === 0 || index === project.pages.length - 1,
                        run: () => store.movePage(page.id, 1),
                      },
                      {
                        label: "Delete page",
                        icon: "trash",
                        danger: true,
                        disabled: index === 0,
                        run: () => {
                          store.removePage(page.id);
                          notify("Page deleted. Use Undo to restore it.");
                        },
                      },
                    ]}
                  />
                </div>
                {expanded && (
                  <div className="page-outline">
                    {sections.map((s) =>
                      row(
                        s,
                        page.sections.indexOf(s),
                        page.sections,
                        page.id,
                        active ? "page" : undefined,
                      ),
                    )}
                    {active &&
                      dragging &&
                      listEnd("page", `Drop here: only on ${page.name}`)}
                    {!page.sections.length && !search && !dragging && (
                      <p className="outline-empty">
                        Your page is a blank canvas.
                      </p>
                    )}
                    {active && !search && (
                      <button className="outline-add" onClick={onAdd}>
                        <Icon name="plus" size={14} />
                        Add section
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!pages.length && !shared.length && (
          <div className="navigator-empty">
            <strong>No matches</strong>
            <p>Try a page name, section, or a word from your content.</p>
            <button onClick={() => setQuery("")}>Clear search</button>
          </div>
        )}
        {(shared.length > 0 || dragging) && (
          <div className="navigator-shared">
            <div className="navigator-group-label">
              <span>Shared sections</span>
              <span className="shared-caption">All pages</span>
            </div>
            {(["header", "footer"] as const).map((list) => {
              const all = project[list];
              return [
                ...all
                  .filter((s) => !search || matches(s))
                  .map((s) => row(s, all.indexOf(s), all, undefined, list)),
                dragging && (
                  <Fragment key={`end:${list}`}>
                    {listEnd(
                      list,
                      `Drop here: ${list === "header" ? "top" : "bottom"} of every page`,
                    )}
                  </Fragment>
                ),
              ];
            })}
          </div>
        )}
      </div>
      <div className="navigator-tools" hidden={view === "layers"}>
        <button
          className="navigator-design-kit"
          onClick={onStyles}
          title="Colours, fonts and the site's personality"
        >
          <Icon name="palette" size={16} />
          <span className="design-kit-copy">
            <strong>Site styles</strong>
          </span>
          <span className="theme-dots">
            <i style={{ background: project.theme.background }} />
            <i style={{ background: project.theme.accent }} />
            <i style={{ background: project.theme.color }} />
          </span>
        </button>
        <button onClick={onData}>
          <Icon name="layers" size={16} />
          <span>Data</span>
          <small>{project.collections?.length || 0}</small>
        </button>
        <button onClick={onInbox}>
          <Icon name="mail" size={16} />
          <span>Inbox</span>
        </button>
        {onApp && (
          <button onClick={onApp}>
            <Icon name="activity" size={16} />
            <span>App</span>
            <small>{project.app ? project.app.forms.length : "New"}</small>
          </button>
        )}
        <button onClick={onSaved}>
          <Icon name="folder" size={16} />
          <span>
            Saved<span className="sr-only"> sections</span>
          </span>
          <small>{project.savedSections?.length || 0}</small>
        </button>
        <button onClick={onMedia}>
          <Icon name="image" size={16} />
          <span>Media</span>
        </button>
        <button onClick={onTemplates}>
          <Icon name="grid" size={16} />
          <span>Templates</span>
        </button>
      </div>
      <div className="navigator-bottom">
        <button
          className="review-link"
          onClick={onReview}
          aria-label="Review site"
        >
          <Icon name={issueCount ? "checklist" : "check"} size={15} />
          <span>Review site</span>
          {issueCount > 0 && <b>{issueCount}</b>}
        </button>
        <IconButton icon="help" label="Help" onClick={onHelp} />
      </div>
    </aside>
  );
}
