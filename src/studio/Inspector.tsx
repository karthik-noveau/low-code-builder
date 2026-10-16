import { useEffect, useRef, useState } from "react";
import type { TextField } from "./InlineText";
import { Icon } from "./Icon";
import { Field, ColorField, Range, IconButton } from "./ui";
import { useStudio } from "./store";
import { BlockSettings, BlockTree } from "./BlockEditor";
import {
  findSection,
  findBlock,
  sectionMeta,
  uid,
  safeImage,
  slugify,
  type Animation,
  type Device,
  type DeviceOverrides,
  type Section,
} from "./model";

export type MediaTarget = { section: string; item?: string; block?: string };
const deviceNames = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };
const animations: { id: Animation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade in" },
  { id: "rise", label: "Rise up" },
  { id: "zoom", label: "Zoom in" },
];
export function Inspector({
  pickMedia,
  notify,
  onClose,
  focusField,
  onEditText,
  draft,
  device = "desktop",
  onDevice,
  onManageData,
}: {
  onManageData?: (collection?: string) => void;
  device?: Device;
  onDevice?: (device: Device) => void;
  pickMedia: (target: MediaTarget) => void;
  notify: (text: string) => void;
  onClose?: () => void;
  focusField?: TextField | null;
  onEditText?: (field: TextField) => void;
  draft?: { field: TextField; text: string };
}) {
  const store = useStudio();
  const section = findSection(store.project, store.selected);
  const page = store.project.pages.find((p) => p.id === store.activePage)!;
  const inspectorRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusField)
      inspectorRef.current
        ?.querySelector(`[data-editor-field="${focusField}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [focusField]);
  const [tab, setTab] = useState<"content" | "design">("content");
  const [slugDraft, setSlugDraft] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const update = (values: Partial<Section>) =>
    section && store.updateSection(section.id, values);
  const mediaButton = (src: string, item?: string) => (
    <button
      className="media-picker"
      onClick={() => section && pickMedia({ section: section.id, item })}
    >
      {src ? (
        <img src={safeImage(src)} alt="Selected image" />
      ) : (
        <span className="media-placeholder">
          <Icon name="image" size={25} />
        </span>
      )}
      <span>
        <Icon name="image" size={14} />
        {src ? "Change image" : "Select an image"}
        <Icon name="chevron" size={13} />
      </span>
    </button>
  );
  if (!section)
    return (
      <aside className="inspector" ref={inspectorRef}>
        <div className="inspector-heading">
          <span className="inspector-type">
            <Icon name="pages" />
            Page settings
          </span>
          <IconButton icon="x" label="Close inspector" onClick={onClose} />
        </div>
        <div className="inspector-scroll">
          <div className="inspector-intro">
            <Icon name="globe" size={26} />
            <h3>Page details</h3>
            <p>
              Manage the page name, URL, and how it appears in search results.
            </p>
          </div>
          <div className="inspector-group">
            <Field
              label="Page name"
              value={page.name}
              onChange={(name) => store.updatePage(page.id, { name })}
            />
            <Field
              label="Page title"
              value={page.title}
              onChange={(title) => store.updatePage(page.id, { title })}
            />
            <div className="field">
              <label htmlFor="page-slug">URL path</label>
              <input
                id="page-slug"
                value={
                  page.id === store.project.pages[0].id
                    ? "/"
                    : slugDraft?.id === page.id
                      ? slugDraft.value
                      : page.slug
                }
                disabled={page.id === store.project.pages[0].id}
                onChange={(e) =>
                  setSlugDraft({ id: page.id, value: e.target.value })
                }
                onBlur={() => {
                  if (slugDraft?.id !== page.id) return;
                  const slug = slugify(slugDraft.value);
                  if (
                    slug === "index" ||
                    store.project.pages.some(
                      (p) => p.id !== page.id && p.slug === slug,
                    )
                  )
                    notify("That URL is already in use. Choose another.");
                  else store.updatePage(page.id, { slug });
                  setSlugDraft(null);
                }}
              />
              <small>
                {page.id === store.project.pages[0].id
                  ? "Your home page always lives at /."
                  : "A unique address for this page."}
              </small>
            </div>
            <Field
              label="Meta description"
              multiline
              value={page.description}
              onChange={(description) =>
                store.updatePage(page.id, { description })
              }
              hint={`${page.description.length} / 160 recommended characters`}
            />
          </div>
          <div className="inspector-group">
            <h4>SEARCH PREVIEW</h4>
            <div className="seo-preview">
              <span>
                {store.project.name.toLowerCase().replace(/\s+/g, "")}.com/
                {page.slug}
              </span>
              <strong>{page.title || page.name}</strong>
              <p>
                {page.description ||
                  "Add a description to help people discover this page."}
              </p>
            </div>
          </div>
          {page.id !== store.project.pages[0].id && (
            <div className="inspector-group">
              <button
                className="danger-text"
                onClick={() => {
                  store.removePage(page.id);
                  notify("Page removed. Use Undo to bring it back.");
                }}
              >
                <Icon name="trash" size={14} />
                Delete page
              </button>
            </div>
          )}
        </div>
        <div className="inspector-hint">
          <Icon name="eye" size={14} />
          Select a section to edit its content and design.
        </div>
      </aside>
    );
  const s = section;
  const block = findBlock(s.blocks, store.selectedBlock);
  // Tablet inherits desktop; mobile inherits tablet, then desktop.
  const overridden = <K extends keyof DeviceOverrides>(key: K) =>
    device === "desktop"
      ? undefined
      : (s.responsive?.[device]?.[key] ??
        (device === "mobile" ? s.responsive?.tablet?.[key] : undefined));
  const responsive = <K extends keyof DeviceOverrides>(
    key: K,
    value: DeviceOverrides[K],
  ) => {
    if (device === "desktop")
      return update({ [key]: value } as Partial<Section>);
    // Read the latest overrides so quick successive edits don't drop each other.
    const current = findSection(useStudio.getState().project, s.id)?.responsive;
    update({
      responsive: {
        ...current,
        [device]: { ...current?.[device], [key]: value },
      },
    });
  };
  const padding = overridden("padding") ?? s.padding;
  const align = overridden("align") ?? s.align;
  const deviceHidden = overridden("hidden") ?? false;
  const hasOverrides =
    device !== "desktop" &&
    Object.keys(s.responsive?.[device] ?? {}).length > 0;
  const hasMedia = ["hero", "imageText"].includes(s.type);
  const hasButton = [
    "hero",
    "imageText",
    "products",
    "cta",
    "text",
    "header",
  ].includes(s.type);
  const hasItems = [
    "products",
    "gallery",
    "features",
    "testimonials",
    "faq",
  ].includes(s.type);
  return (
    <aside className="inspector" ref={inspectorRef}>
      <div className="inspector-heading">
        <span className="inspector-type">
          <Icon name={sectionMeta[s.type].icon} />
          {sectionMeta[s.type].label}
        </span>
        <IconButton
          icon="x"
          label="Close inspector"
          onClick={onClose ?? (() => store.select(null))}
        />
      </div>
      <div className="inspector-tabs">
        <button
          className={tab === "content" ? "selected" : ""}
          onClick={() => setTab("content")}
        >
          Content
        </button>
        <button
          className={tab === "design" ? "selected" : ""}
          onClick={() => setTab("design")}
        >
          Design
        </button>
      </div>
      <div className="inspector-scroll" key={s.id}>
        {tab === "content" && s.type === "custom" ? (
          block ? (
            <BlockSettings
              key={block.id}
              section={s}
              block={block}
              pickMedia={pickMedia}
              notify={notify}
            />
          ) : (
            <BlockTree section={s} />
          )
        ) : tab === "content" ? (
          <>
            {s.type === "collection" && s.listing && (
              <div className="inspector-group">
                <h4>COLLECTION</h4>
                <label className="field">
                  Show
                  <select
                    value={s.listing.collection}
                    onChange={(e) =>
                      update({
                        listing: { ...s.listing!, collection: e.target.value },
                      })
                    }
                  >
                    {!store.project.collections?.some(
                      (c) => c.id === s.listing?.collection,
                    ) && <option value="">Choose a collection</option>}
                    {(store.project.collections ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.items.length})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">Layout</label>
                <div className="segmented">
                  {(["grid", "list"] as const).map((style) => (
                    <button
                      key={style}
                      className={s.listing!.style === style ? "chosen" : ""}
                      onClick={() =>
                        update({ listing: { ...s.listing!, style } })
                      }
                    >
                      {style === "grid" ? "Cards" : "List"}
                    </button>
                  ))}
                </div>
                {s.listing.style === "grid" && (
                  <Range
                    label="Columns"
                    value={s.listing.columns}
                    min={1}
                    max={4}
                    unit=""
                    onChange={(columns) =>
                      update({ listing: { ...s.listing!, columns } })
                    }
                  />
                )}
                <Range
                  label="Show up to"
                  value={s.listing.limit}
                  max={48}
                  unit=""
                  onChange={(limit) =>
                    update({ listing: { ...s.listing!, limit } })
                  }
                />
                <small className="block-hint">
                  0 shows every visible item.
                </small>
                {onManageData && (
                  <button
                    className="subtle-button full-width"
                    onClick={() => onManageData(s.listing?.collection)}
                  >
                    <Icon name="layers" size={15} />
                    Edit items and fields
                  </button>
                )}
              </div>
            )}
            <div className="inspector-group">
              <h4>
                {["header", "footer"].includes(s.type) ? "BRAND" : "TEXT"}
              </h4>
              {!["header", "footer", "announcement", "features"].includes(
                s.type,
              ) && (
                <Field
                  label="Eyebrow"
                  editorField="eyebrow"
                  highlighted={focusField === "eyebrow"}
                  onEditCanvas={
                    onEditText ? () => onEditText("eyebrow") : undefined
                  }
                  value={draft?.field === "eyebrow" ? draft.text : s.eyebrow}
                  editingOnCanvas={draft?.field === "eyebrow"}
                  onChange={(eyebrow) => update({ eyebrow })}
                  placeholder="A short introduction"
                />
              )}
              <Field
                label={
                  ["header", "footer"].includes(s.type)
                    ? "Brand name"
                    : s.type === "announcement"
                      ? "Announcement"
                      : "Heading"
                }
                editorField="title"
                highlighted={focusField === "title"}
                onEditCanvas={
                  onEditText ? () => onEditText("title") : undefined
                }
                value={draft?.field === "title" ? draft.text : s.title}
                editingOnCanvas={draft?.field === "title"}
                multiline={s.type === "hero"}
                onChange={(title) => update({ title })}
              />
              {!["header", "announcement", "features"].includes(s.type) && (
                <Field
                  label="Description"
                  editorField="body"
                  highlighted={focusField === "body"}
                  onEditCanvas={
                    onEditText ? () => onEditText("body") : undefined
                  }
                  value={draft?.field === "body" ? draft.text : s.body}
                  editingOnCanvas={draft?.field === "body"}
                  multiline
                  onChange={(body) => update({ body })}
                />
              )}
            </div>
            {hasMedia && (
              <div className="inspector-group">
                <h4>IMAGE</h4>
                {mediaButton(s.image)}
                <Field
                  label="Image description"
                  value={s.imageAlt}
                  onChange={(imageAlt) => update({ imageAlt })}
                  placeholder="Describe your image"
                />
              </div>
            )}
            {hasButton && (
              <div className="inspector-group">
                <h4>BUTTON</h4>
                <Field
                  label="Button label"
                  editorField="buttonLabel"
                  highlighted={focusField === "buttonLabel"}
                  onEditCanvas={
                    onEditText ? () => onEditText("buttonLabel") : undefined
                  }
                  value={
                    draft?.field === "buttonLabel" ? draft.text : s.buttonLabel
                  }
                  editingOnCanvas={draft?.field === "buttonLabel"}
                  onChange={(buttonLabel) => update({ buttonLabel })}
                  placeholder="Leave empty to hide"
                />
                <label className="field">
                  Link to
                  <select
                    value={
                      store.project.pages.some(
                        (p) => `/${p.slug}` === s.buttonUrl,
                      )
                        ? s.buttonUrl
                        : "custom"
                    }
                    onChange={(e) =>
                      update({
                        buttonUrl:
                          e.target.value === "custom" ? "#" : e.target.value,
                      })
                    }
                  >
                    {store.project.pages.map((p) => (
                      <option value={`/${p.slug}`} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="custom">Custom link</option>
                  </select>
                </label>
                <Field
                  label="Link URL"
                  value={s.buttonUrl}
                  onChange={(buttonUrl) => update({ buttonUrl })}
                  placeholder="https://example.com"
                />
              </div>
            )}
            {s.type === "announcement" && (
              <div className="inspector-group">
                <Field
                  label="Link URL"
                  value={s.buttonUrl}
                  onChange={(buttonUrl) => update({ buttonUrl })}
                />
              </div>
            )}
            {hasItems && (
              <div className="inspector-group">
                <h4>
                  {s.type === "products" ? "PRODUCTS" : "ITEMS"}
                  <span>{s.items.length}</span>
                </h4>
                {s.items.map((item, index) => (
                  <details className="item-editor" key={item.id}>
                    <summary>
                      <span className="item-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="item-title"
                        title={item.title || "Untitled"}
                      >
                        {item.title || "Untitled"}
                      </span>
                      <Icon name="down" size={13} />
                    </summary>
                    <div>
                      <Field
                        label={s.type === "faq" ? "Question" : "Title"}
                        value={item.title}
                        onChange={(title) =>
                          update({
                            items: s.items.map((i) =>
                              i.id === item.id ? { ...i, title } : i,
                            ),
                          })
                        }
                      />
                      <Field
                        label={s.type === "faq" ? "Answer" : "Description"}
                        value={item.body}
                        multiline
                        onChange={(body) =>
                          update({
                            items: s.items.map((i) =>
                              i.id === item.id ? { ...i, body } : i,
                            ),
                          })
                        }
                      />
                      {["products", "gallery"].includes(s.type) && (
                        <>
                          {mediaButton(item.image, item.id)}
                          {s.type === "products" && (
                            <Field
                              label="Price"
                              value={item.price}
                              onChange={(price) =>
                                update({
                                  items: s.items.map((i) =>
                                    i.id === item.id ? { ...i, price } : i,
                                  ),
                                })
                              }
                            />
                          )}
                          <Field
                            label="Link URL"
                            value={item.url}
                            onChange={(url) =>
                              update({
                                items: s.items.map((i) =>
                                  i.id === item.id ? { ...i, url } : i,
                                ),
                              })
                            }
                            placeholder="Product or checkout link"
                          />
                        </>
                      )}
                      <div className="item-actions">
                        <IconButton
                          icon="up"
                          label={`Move item ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => {
                            const items = [...s.items];
                            [items[index - 1], items[index]] = [
                              items[index],
                              items[index - 1],
                            ];
                            update({ items });
                          }}
                        />
                        <button
                          className="danger-text"
                          onClick={() =>
                            update({
                              items: s.items.filter((i) => i.id !== item.id),
                            })
                          }
                        >
                          <Icon name="trash" size={13} />
                          Remove item
                        </button>
                      </div>
                    </div>
                  </details>
                ))}
                <button
                  className="subtle-button full-width"
                  onClick={() =>
                    update({
                      items: [
                        ...s.items,
                        {
                          id: uid(),
                          title: "New item",
                          body: "A short description.",
                          image: "",
                          price: "",
                          url: "",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" size={15} />
                  Add item
                </button>
              </div>
            )}
            {["contact", "newsletter"].includes(s.type) && (
              <div className="inspector-group">
                <h4>FORM SETTINGS</h4>
                <Field
                  label="Submit button"
                  value={s.buttonLabel}
                  onChange={(buttonLabel) => update({ buttonLabel })}
                />
                <Field
                  label="Form endpoint"
                  value={s.formAction}
                  onChange={(formAction) => update({ formAction })}
                  placeholder="https://formspree.io/f/…"
                  hint="Connect a form service to receive submissions. The form stays disabled until an HTTPS or HTTP endpoint is supplied."
                />
              </div>
            )}
          </>
        ) : (
          <>
            {hasMedia && (
              <div className="inspector-group">
                <h4>LAYOUT</h4>
                <div className="layout-options">
                  {(["cover", "split"] as const).map((layout) => (
                    <button
                      key={layout}
                      className={s.layout === layout ? "chosen" : ""}
                      onClick={() => update({ layout })}
                    >
                      <span className={`layout-diagram ${layout}`} />
                      <span>
                        {s.type === "hero"
                          ? layout === "cover"
                            ? "Full image"
                            : "Split"
                          : layout === "cover"
                            ? "Image left"
                            : "Image right"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="inspector-group">
              <h4>COLORS</h4>
              <ColorField
                label="Background"
                value={s.background}
                fallback={store.project.theme.background}
                onChange={(background) => update({ background })}
              />
              <ColorField
                label="Text"
                value={s.color}
                fallback={store.project.theme.color}
                onChange={(color) => update({ color })}
              />
            </div>
            <div className="inspector-group">
              <h4>
                SPACING & POSITION
                {onDevice && (
                  <span className="device-scope">
                    {(["desktop", "tablet", "mobile"] as const).map((d) => (
                      <button
                        key={d}
                        className={device === d ? "chosen" : ""}
                        aria-label={`Edit ${deviceNames[d].toLowerCase()} layout`}
                        aria-pressed={device === d}
                        title={deviceNames[d]}
                        onClick={() => onDevice(d)}
                      >
                        <Icon name={d} size={13} />
                      </button>
                    ))}
                  </span>
                )}
              </h4>
              {device !== "desktop" && (
                <p className="device-note">
                  {hasOverrides
                    ? `Custom ${device} layout. Other devices are unchanged.`
                    : `Matches ${device === "mobile" && s.responsive?.tablet ? "tablet" : "desktop"}. Changes here apply to ${device} only.`}
                  {hasOverrides && (
                    <button
                      onClick={() => {
                        const rest = { ...s.responsive };
                        delete rest[device];
                        update({ responsive: rest });
                      }}
                    >
                      Reset
                    </button>
                  )}
                </p>
              )}
              <label className="field">Text alignment</label>
              <div className="segmented alignment">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    aria-label={`Align ${a}`}
                    className={align === a ? "chosen" : ""}
                    key={a}
                    onClick={() => responsive("align", a)}
                  >
                    <Icon
                      name={`align${a[0].toUpperCase()}${a.slice(1)}`}
                      size={17}
                    />
                  </button>
                ))}
              </div>
              <Range
                label="Vertical padding"
                value={padding}
                onChange={(value) => responsive("padding", value)}
                step={4}
              />
              {device !== "desktop" && (
                <label className="switch-row">
                  Show on {device}
                  <button
                    className={`switch ${!deviceHidden ? "on" : ""}`}
                    role="switch"
                    aria-checked={!deviceHidden}
                    aria-label={`Show on ${device}`}
                    onClick={() => responsive("hidden", !deviceHidden)}
                  >
                    <span />
                  </button>
                </label>
              )}
              {s.type === "custom" && (
                <label className="field">
                  Content width
                  <select
                    value={s.width ?? "normal"}
                    onChange={(e) =>
                      update({ width: e.target.value as Section["width"] })
                    }
                  >
                    <option value="narrow">Narrow</option>
                    <option value="normal">Normal</option>
                    <option value="wide">Wide</option>
                    <option value="full">Full width</option>
                  </select>
                </label>
              )}
              {s.type === "hero" && (
                <>
                  <Range
                    label="Banner height"
                    value={s.height}
                    min={280}
                    max={800}
                    step={10}
                    onChange={(height) => update({ height })}
                  />
                  <Range
                    label="Image overlay"
                    value={s.overlay}
                    max={90}
                    unit="%"
                    onChange={(overlay) => update({ overlay })}
                  />
                </>
              )}
            </div>
            <div className="inspector-group">
              <h4>ANIMATION</h4>
              <div className="segmented animation-options">
                {animations.map((a) => (
                  <button
                    key={a.id}
                    className={(s.animation ?? "none") === a.id ? "chosen" : ""}
                    onClick={() => update({ animation: a.id })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <small className="block-hint">
                Plays as the section scrolls into view, in preview and on your
                published site. Respects reduced-motion settings.
              </small>
            </div>
            <div className="inspector-group">
              <Field
                label="Section name"
                value={s.name}
                onChange={(name) => update({ name })}
                hint="Only shown in your editor."
              />
              <label className="switch-row">
                Visible on site
                <button
                  className={`switch ${!s.hidden ? "on" : ""}`}
                  role="switch"
                  aria-checked={!s.hidden}
                  aria-label="Section visibility"
                  onClick={() => update({ hidden: !s.hidden })}
                >
                  <span />
                </button>
              </label>
            </div>
          </>
        )}
      </div>
      <div className="inspector-bottom">
        <button
          className="danger-text"
          onClick={() => {
            store.removeSection(s.id);
            notify("Section removed. You can undo this change.");
          }}
        >
          <Icon name="trash" size={14} />
          Remove section
        </button>
        <IconButton
          icon="folder"
          label="Save section to library"
          onClick={() => {
            store.saveSection(s.id);
            notify(`${s.name} saved. Find it in Saved sections.`);
          }}
        />
        <IconButton
          icon="copy"
          label="Duplicate section"
          onClick={() => {
            store.duplicateSection(s.id);
            notify("Section duplicated");
          }}
        />
      </div>
    </aside>
  );
}
