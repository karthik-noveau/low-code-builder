import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeading } from "./AppShell";
import { TemplateArt } from "./TemplateArt";
import { collections } from "./content";
import { Arrow } from "./Brand";
import { Icon } from "../studio/Icon";
import { useFocusTrap } from "../design/focus";
import { Website } from "../studio/Website";
import { createProject } from "../studio/templates";
import type { TemplateId } from "../studio/model";

type Item = (typeof collections)[number];

/**
 * Templates inside the workspace: browse, preview the real site in a panel,
 * and start a website from one, without leaving the app.
 */
export function WorkspaceTemplates() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<Item | null>(null);
  const categories = ["All", ...new Set(collections.map((c) => c.category))];
  const shown = collections.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.name} ${item.category} ${item.subtitle} ${item.works.join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <AppShell
      area="templates"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: "Templates" },
      ]}
    >
      <PageHeading
        title="Templates"
        description="Every template is a working business: pages, a catalogue and an app that takes orders, bookings or sign-ups. Change anything."
        action={
          <a
            className="brand-button brand-button-outline"
            href="/new?template=blank"
          >
            <Icon name="plus" size={15} /> Start blank
          </a>
        }
      />
      <div className="tp-toolbar">
        <div className="tp-filters" role="group" aria-label="Category">
          {categories.map((name) => (
            <button
              key={name}
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
              <span>
                {name === "All"
                  ? collections.length
                  : collections.filter((c) => c.category === name).length}
              </span>
            </button>
          ))}
        </div>
        <label className="dashboard-search-wrap tp-search">
          <Icon name="search" size={15} />
          <input
            className="dashboard-search"
            aria-label="Search templates"
            placeholder="Search templates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {!shown.length ? (
        <div className="commerce-panel commerce-empty">
          <span className="commerce-empty-icon" aria-hidden="true">
            <Icon name="search" size={22} />
          </span>
          <h2>No templates match</h2>
          <p>Try another word or category, or start from a blank page.</p>
        </div>
      ) : (
        <div className="tp-grid">
          {shown.map((item) => (
            <article className="tp-card" key={item.id}>
              <button
                className="tp-art"
                onClick={() => setPreviewing(item)}
                aria-label={`Preview ${item.name}`}
              >
                <TemplateArt template={item.id} />
                <span className="tp-art-hover" aria-hidden="true">
                  <Icon name="eye" size={15} /> Preview
                </span>
              </button>
              <div className="tp-body">
                <div className="tp-title">
                  <h2>{item.name}</h2>
                  <span className="tp-tag">{item.category}</span>
                </div>
                <p>{item.subtitle}</p>
                <p className="tp-works">
                  <Icon name="check" size={13} /> {item.works.join(" · ")}
                </p>
                <div className="tp-foot">
                  <span className="tp-palette" aria-hidden="true">
                    {item.palette.map((color) => (
                      <span key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <span className="tp-actions">
                    <button
                      className="brand-button brand-button-outline"
                      onClick={() => setPreviewing(item)}
                    >
                      Preview
                    </button>
                    <a
                      className="brand-button"
                      href={`/new?template=${item.id}`}
                    >
                      Use template
                    </a>
                  </span>
                </div>
              </div>
            </article>
          ))}
          <a className="tp-card tp-blank" href="/new?template=blank">
            <span className="tp-blank-art" aria-hidden="true">
              <Icon name="plus" size={22} />
            </span>
            <div className="tp-body">
              <div className="tp-title">
                <h2>Blank</h2>
                <span className="tp-tag">Start fresh</span>
              </div>
              <p>An empty page and your own ideas. Add sections as you go.</p>
            </div>
          </a>
        </div>
      )}
      {previewing && (
        <TemplatePreviewPanel
          item={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </AppShell>
  );
}

/** The real template, scrollable and clickable between its pages, over the workspace. */
function TemplatePreviewPanel({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const project = useMemo(
    () => createProject(item.id as TemplateId),
    [item.id],
  );
  const [pageId, setPageId] = useState(project.pages[0].id);
  const [opened, setOpened] = useState<{ c: string; i: string } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const frame = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel);
  const page = project.pages.find((p) => p.id === pageId) ?? project.pages[0];
  // Collection cards open their item page (a dish, a service, an event).
  const openedCollection = project.collections?.find((c) => c.id === opened?.c);
  const openedItem = openedCollection?.items.find((i) => i.id === opened?.i);
  const shownItem =
    openedCollection && openedItem
      ? { collection: openedCollection, item: openedItem }
      : undefined;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="tp-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="tp-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} preview`}
      >
        <header className="tp-panel-bar">
          <div className="tp-panel-title">
            <strong>{item.name}</strong>
            <span className="tp-tag">{item.category}</span>
          </div>
          <nav className="tp-pages" aria-label="Template pages">
            {project.pages.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === page.id && !shownItem}
                onClick={() => {
                  setPageId(p.id);
                  setOpened(null);
                  frame.current?.scrollTo({ top: 0 });
                }}
              >
                {p.name}
              </button>
            ))}
          </nav>
          <div className="tp-panel-actions">
            <div className="tp-device" role="group" aria-label="Preview size">
              <button
                aria-label="Desktop"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <Icon name="desktop" size={15} />
              </button>
              <button
                aria-label="Mobile"
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                <Icon name="mobile" size={15} />
              </button>
            </div>
            <a className="brand-button" href={`/new?template=${item.id}`}>
              Use this template <Arrow />
            </a>
            <button
              ref={close}
              className="tp-close"
              aria-label="Close preview"
              onClick={onClose}
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </header>
        <div className="tp-stage" ref={frame}>
          <div
            className={`tp-frame template-full-preview ${device === "mobile" ? "is-mobile preview-mobile" : ""}`}
          >
            <Website
              project={project}
              page={page}
              preview
              item={shownItem}
              onOpenItem={(c, i) => {
                setOpened({ c, i });
                frame.current?.scrollTo({ top: 0 });
              }}
              onNavigate={(id) => {
                setPageId(id);
                setOpened(null);
                frame.current?.scrollTo({ top: 0 });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
