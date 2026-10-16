import { useState, type ChangeEvent } from "react";
import { useStudio } from "./store";
import { Icon } from "./Icon";
import { IconButton, Field, ColorField, Range } from "./ui";
import { sectionMeta, safeImage, type Section } from "./model";
import { templateOptions } from "./templates";

type ThemeKey = "scale" | "spacing" | "buttons";
/** Site-wide design tokens. The middle option is each token's default. */
const themeChoices: {
  key: ThemeKey;
  label: string;
  options: [string, string][];
}[] = [
  {
    key: "scale",
    label: "Heading scale",
    options: [
      ["compact", "Compact"],
      ["balanced", "Balanced"],
      ["dramatic", "Dramatic"],
    ],
  },
  {
    key: "spacing",
    label: "Section spacing",
    options: [
      ["tight", "Tight"],
      ["comfortable", "Comfortable"],
      ["airy", "Airy"],
    ],
  },
  {
    key: "buttons",
    label: "Button style",
    options: [
      ["outline", "Outline"],
      ["solid", "Solid"],
      ["pill", "Pill"],
    ],
  },
];

export type Panel = "sections" | "pages" | "theme" | "assets" | "settings";
export function Sidebar({
  panel,
  setPanel,
  openTemplates,
  openLibrary,
  openPage,
  openAssets,
  upload,
  onImport,
  onBackup,
  notify,
  focusSection,
  onPageSettings,
}: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  openTemplates: () => void;
  openLibrary: () => void;
  openPage: () => void;
  openAssets: () => void;
  upload: (files: FileList | null) => void;
  onImport: (e: ChangeEvent<HTMLInputElement>) => void;
  onBackup: () => void;
  notify: (s: string) => void;
  focusSection: (id: string) => void;
  onPageSettings: () => void;
}) {
  const store = useStudio();
  const { project, selected } = store;
  const page = project.pages.find((p) => p.id === store.activePage)!;
  const template = templateOptions.find((t) => t.id === project.template)!;
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const group = (title: string, sections: Section[], shared = false) => (
    <div className="section-group">
      <div className="section-group-title">
        <button
          onClick={() =>
            setCollapsed((prev) =>
              prev.includes(title)
                ? prev.filter((g) => g !== title)
                : [...prev, title],
            )
          }
        >
          <Icon
            name={collapsed.includes(title) ? "chevron" : "down"}
            size={12}
          />
          {title}
        </button>
        {shared && (
          <span title="Shared across all pages">
            <Icon name="globe" size={11} />
          </span>
        )}
      </div>
      {!collapsed.includes(title) &&
        sections.map((s, index) => (
          <div
            key={s.id}
            className={`tree-node ${selected === s.id ? "selected" : ""} ${s.hidden ? "hidden-section" : ""} ${dropTarget === s.id ? "drop-target" : ""}`}
            draggable
            onDragStart={(e) => {
              setDragging(s.id);
              e.dataTransfer.setData("text/forma-section", s.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (dragging && sections.some((s) => s.id === dragging)) {
                e.preventDefault();
                setDropTarget(s.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/forma-section");
              if (id) store.reorderSection(id, s.id);
              setDragging(null);
              setDropTarget(null);
            }}
          >
            <div className="tree-row">
              <span className="tree-grip">
                <Icon name="grip" size={12} />
              </span>
              <button className="tree-main" onClick={() => focusSection(s.id)}>
                <Icon name={sectionMeta[s.type].icon} size={15} />
                <span>{s.name}</span>
              </button>
              <div className="tree-actions">
                <IconButton
                  icon={s.hidden ? "eyeOff" : "eye"}
                  label={`${s.hidden ? "Show" : "Hide"} ${s.name}`}
                  onClick={() =>
                    store.updateSection(s.id, { hidden: !s.hidden })
                  }
                />
                <IconButton
                  icon="up"
                  label={`Move ${s.name} up`}
                  disabled={index === 0}
                  onClick={() => store.moveSection(s.id, -1)}
                />
                <IconButton
                  icon="down"
                  label={`Move ${s.name} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => store.moveSection(s.id, 1)}
                />
              </div>
            </div>
            {selected === s.id &&
              !s.hidden &&
              ["hero", "imageText", "text", "cta"].includes(s.type) && (
                <div className="tree-children">
                  {s.title && (
                    <button onClick={() => focusSection(s.id)}>
                      <Icon name="type" size={13} />
                      <span>{s.title.replace(/\n/g, " ")}</span>
                    </button>
                  )}
                  {s.body && (
                    <button onClick={() => focusSection(s.id)}>
                      <Icon name="alignLeft" size={13} />
                      <span>Description</span>
                    </button>
                  )}
                  {s.buttonLabel && (
                    <button onClick={() => focusSection(s.id)}>
                      <Icon name="arrowUpRight" size={13} />
                      <span>{s.buttonLabel}</span>
                    </button>
                  )}
                </div>
              )}
          </div>
        ))}
    </div>
  );
  return (
    <aside className="left-panel">
      <div className="left-heading">
        <h2>
          {
            {
              sections: "Sections",
              pages: "Pages",
              theme: "Site styles",
              assets: "Media library",
              settings: "Settings",
            }[panel]
          }
        </h2>
        {panel === "sections" ? (
          <span className="small-badge">{page.sections.length}</span>
        ) : (
          <IconButton
            icon={panel === "pages" ? "plus" : "x"}
            label={panel === "pages" ? "Add page" : "Close panel"}
            onClick={panel === "pages" ? openPage : () => setPanel("sections")}
          />
        )}
      </div>
      <div className="left-scroll">
        {panel === "sections" && (
          <>
            <button className="current-template" onClick={openTemplates}>
              <div
                className="template-swatch"
                style={{
                  backgroundColor: template.color,
                  backgroundImage: template.image
                    ? `url(${template.image})`
                    : undefined,
                }}
              >
                <Icon name="leaf" size={19} />
              </div>
              <div>
                <strong>{template.name}</strong>
                <span>Current template</span>
              </div>
              <Icon name="chevron" size={14} />
            </button>
            <div className="page-tree-label">
              <Icon name="home" size={14} />
              <span>{page.name}</span>
              <span className="page-tree-kind">Default</span>
            </div>
            {group("Header", project.header, true)}
            {group("Template", page.sections)}
            <button className="add-section-button" onClick={openLibrary}>
              <Icon name="plus" size={16} />
              Add section
            </button>
            {group("Footer", project.footer, true)}
            <div className="tree-note">
              <Icon name="grip" size={12} />
              <span>Drag sections to find your flow.</span>
            </div>
          </>
        )}
        {panel === "pages" && (
          <div className="panel-content">
            <p className="panel-description">Every page, part of your story.</p>
            <label className="search-box">
              <Icon name="search" size={15} />
              <input
                aria-label="Search pages"
                placeholder="Find a page…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="page-list">
              {project.pages
                .filter((p) =>
                  p.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((p) => (
                  <button
                    key={p.id}
                    className={p.id === page.id ? "active" : ""}
                    onClick={() => store.goToPage(p.id)}
                  >
                    <Icon name={p.slug ? "pages" : "home"} size={17} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>/{p.slug}</small>
                    </span>
                    <Icon name="chevron" size={13} />
                  </button>
                ))}
            </div>
            <button className="subtle-button full-width" onClick={openPage}>
              <Icon name="plus" size={15} />
              Add a page
            </button>
            <div className="info-card">
              <Icon name="globe" size={18} />
              <p>
                Your header and footer are shared across every page. Change them
                once, update everywhere.
              </p>
            </div>
          </div>
        )}
        {panel === "theme" && (
          <div className="panel-content">
            <p className="panel-description">
              Set the colors, typography, and corners used across your website.
            </p>
            <h4 className="eyebrow-label">COLOR PALETTE</h4>
            <div className="palette-grid">
              {[
                ["#294b3b", "#fcfcf9", "#25352b"],
                ["#41444b", "#faf9f6", "#25262b"],
                ["#843d2b", "#fff9f1", "#4c3229"],
                ["#3f5491", "#f6f8ff", "#24324d"],
              ].map((colors, i) => (
                <button
                  aria-label={`Apply ${["Botanical", "Graphite", "Terracotta", "Blue hour"][i]} palette`}
                  className={project.theme.accent === colors[0] ? "chosen" : ""}
                  key={colors[0]}
                  onClick={() =>
                    store.commit((p) => ({
                      ...p,
                      theme: {
                        ...p.theme,
                        accent: colors[0],
                        background: colors[1],
                        color: colors[2],
                      },
                    }))
                  }
                >
                  <div>
                    {colors.map((c) => (
                      <span style={{ background: c }} key={c} />
                    ))}
                  </div>
                  <span>
                    {["Botanical", "Graphite", "Terracotta", "Blue hour"][i]}
                  </span>
                </button>
              ))}
            </div>
            <ColorField
              label="Accent"
              value={project.theme.accent}
              onChange={(v) =>
                store.commit((p) => ({
                  ...p,
                  theme: { ...p.theme, accent: v || "#294b3b" },
                }))
              }
            />
            <ColorField
              label="Background"
              value={project.theme.background}
              onChange={(v) =>
                store.commit((p) => ({
                  ...p,
                  theme: { ...p.theme, background: v || "#fcfcf9" },
                }))
              }
            />
            <ColorField
              label="Text"
              value={project.theme.color}
              onChange={(v) =>
                store.commit((p) => ({
                  ...p,
                  theme: { ...p.theme, color: v || "#25352b" },
                }))
              }
            />
            <div className="panel-divider" />
            <h4 className="eyebrow-label">TYPOGRAPHY</h4>
            <div className="font-list">
              {(["editorial", "modern", "classic"] as const).map((font) => (
                <button
                  className={project.theme.font === font ? "chosen" : ""}
                  key={font}
                  onClick={() =>
                    store.commit((p) => ({ ...p, theme: { ...p.theme, font } }))
                  }
                >
                  <span
                    style={{
                      fontFamily: font === "modern" ? "Arial" : "Georgia",
                    }}
                  >
                    Aa
                  </span>
                  <div>
                    <strong>{font[0].toUpperCase() + font.slice(1)}</strong>
                    <small>
                      {font === "editorial"
                        ? "Serif headings · Sans body"
                        : font === "modern"
                          ? "Clean, confident, contemporary"
                          : "Timeless serif throughout"}
                    </small>
                  </div>
                  {font === project.theme.font && (
                    <Icon name="check" size={15} />
                  )}
                </button>
              ))}
            </div>
            <Range
              label="Corner radius"
              value={project.theme.radius}
              max={24}
              onChange={(radius) =>
                store.commit((p) => ({ ...p, theme: { ...p.theme, radius } }))
              }
            />
            {themeChoices.map(({ key, label, options }) => (
              <div className="theme-choice" key={key}>
                <span className="field">{label}</span>
                <div className="segmented">
                  {options.map(([value, name]) => (
                    <button
                      key={value}
                      className={
                        (project.theme[key] ?? options[1][0]) === value
                          ? "chosen"
                          : ""
                      }
                      aria-pressed={
                        (project.theme[key] ?? options[1][0]) === value
                      }
                      onClick={() =>
                        store.commit((p) => ({
                          ...p,
                          theme: { ...p.theme, [key]: value },
                        }))
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="info-card">
              <Icon name="palette" size={18} />
              <p>
                Section colors override these defaults. Reset a section’s colors
                to follow your theme.
              </p>
            </div>
          </div>
        )}
        {panel === "assets" && (
          <div className="panel-content">
            <p className="panel-description">
              Upload and manage images for your website.
            </p>
            <label
              className="upload-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                upload(e.dataTransfer.files);
              }}
            >
              <Icon name="upload" size={24} />
              <strong>Drop images here</strong>
              <span>or click to browse · up to 3 MB each</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="asset-grid">
              {project.assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    const id = store.addSection("imageText");
                    store.updateSection(id, {
                      image: asset.url,
                      imageAlt: asset.name,
                    });
                    setPanel("sections");
                    notify("Image added to a new section");
                  }}
                  title={`Add ${asset.name} to page`}
                >
                  <img src={safeImage(asset.url)} alt={asset.name} />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
            {!project.assets.length && (
              <p className="muted-note">
                Upload an image to start your library.
              </p>
            )}
            <button className="subtle-button full-width" onClick={openAssets}>
              <Icon name="image" size={15} />
              Browse starter images
            </button>
          </div>
        )}
        {panel === "settings" && (
          <div className="panel-content">
            <p className="panel-description">
              A few details, all in one place.
            </p>
            <Field
              label="Website name"
              value={project.name}
              onChange={(name) => store.commit((p) => ({ ...p, name }))}
            />
            <div className="panel-divider" />
            <h4 className="eyebrow-label">YOUR PROJECT</h4>
            <p className="muted-note">
              Changes are saved in this browser. Keep a project backup to edit
              on another device.
            </p>
            <button className="subtle-button full-width" onClick={onBackup}>
              <Icon name="download" size={15} />
              Download project
            </button>
            <label className="subtle-button full-width import-button">
              <Icon name="upload" size={15} />
              Import project
              <input
                type="file"
                accept=".json,application/json"
                onChange={onImport}
              />
            </label>
            <div className="panel-divider" />
            <h4 className="eyebrow-label">START SOMETHING NEW</h4>
            <p className="muted-note">
              Explore a different direction with a ready-to-edit template.
            </p>
            <button
              className="subtle-button full-width"
              onClick={openTemplates}
            >
              <Icon name="grid" size={15} />
              Explore templates
            </button>
            <div className="info-card">
              <Icon name="lock" size={17} />
              <p>
                Your project stays in this browser. Download a backup to carry
                it to another device.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="left-bottom">
        <button onClick={onPageSettings}>
          <Icon name="settings" size={16} />
          <span>Page settings</span>
          <Icon name="chevron" size={13} />
        </button>
      </div>
    </aside>
  );
}
