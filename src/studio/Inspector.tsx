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
  FEATURE_ICONS,
  OWNER_LINK,
  SECTION_VARIANTS,
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
/** Plain names for each section look (SECTION_VARIANTS). */
const variantNames: Record<string, string> = {
  brand: "Logo, pill links and dark switch",
  badge: "Centred, with a badge",
  cards: "Numbered cards",
  notice: "Information box",
  centered: "Centred links",
};
const iconName = (name: string) => name[0].toUpperCase() + name.slice(1);
const blankItem = () => ({
  id: uid(),
  title: "",
  body: "",
  image: "",
  price: "",
  url: "",
});
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
  onOpenApp,
}: {
  onManageData?: (collection?: string) => void;
  /** Opens the App builder, at a form when given. */
  onOpenApp?: (form?: string) => void;
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
              hint="Shown in your menu."
              onChange={(name) => store.updatePage(page.id, { name })}
            />
            <Field
              label="Page title"
              value={page.title}
              hint="Shown in the browser tab and search results."
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
  const hasButton =
    ["hero", "imageText", "products", "cta", "text", "header"].includes(
      s.type,
    ) ||
    (s.type === "footer" && s.variant === "centered");
  const brandHeader = s.type === "header" && s.variant === "brand";
  const hasItems =
    ["products", "gallery", "features", "testimonials", "faq"].includes(
      s.type,
    ) || brandHeader;
  const variants = SECTION_VARIANTS[s.type];
  /** A link picker: a page, the owner's sign-in, or a custom address. */
  const linkTo = (
    label: string,
    value: string,
    onChange: (url: string) => void,
  ) => (
    <label className="field">
      {label}
      <select
        value={
          value === OWNER_LINK ||
          store.project.pages.some((p) => `/${p.slug}` === value)
            ? value
            : "custom"
        }
        onChange={(e) =>
          onChange(e.target.value === "custom" ? "#" : e.target.value)
        }
      >
        {store.project.pages.map((p) => (
          <option value={`/${p.slug}`} key={p.id}>
            {p.name}
          </option>
        ))}
        <option value={OWNER_LINK}>Owner sign-in (your app)</option>
        <option value="custom">Custom link</option>
      </select>
    </label>
  );
  const itemIcon = (index: number) => s.items[index]?.icon ?? "";
  const setItemIcon = (index: number, icon: string) => {
    const items = [...s.items];
    while (items.length <= index) items.push(blankItem());
    const next = { ...items[index] };
    if (icon) next.icon = icon;
    else delete next.icon;
    items[index] = next;
    update({ items });
  };
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
            {s.type === "app" && (
              <div className="inspector-group">
                <h4>APP FORM</h4>
                {store.project.app?.forms.length ? (
                  <label className="field">
                    Show
                    <select
                      value={s.appForm ?? ""}
                      onChange={(e) => {
                        const form = store.project.app?.forms.find(
                          (f) => f.id === e.target.value,
                        );
                        if (form)
                          update({
                            appForm: form.id,
                            title: form.title.slice(0, 200),
                          });
                      }}
                    >
                      {!store.project.app.forms.some(
                        (f) => f.id === s.appForm,
                      ) && <option value="">Choose a form</option>}
                      {store.project.app.forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.kind === "lookup" ? "lookup" : "form"})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <small className="block-hint">
                    {store.project.app
                      ? "Your app has no forms yet."
                      : "Set up your business app to show its forms here."}
                  </small>
                )}
                <small className="block-hint">
                  The heading, introduction and fields come from the form. It
                  works on your published site.
                </small>
                {onOpenApp && (
                  <button
                    className="subtle-button full-width"
                    onClick={() =>
                      onOpenApp(
                        store.project.app?.forms.some((f) => f.id === s.appForm)
                          ? s.appForm
                          : undefined,
                      )
                    }
                  >
                    <Icon name="activity" size={15} />
                    {store.project.app
                      ? "Edit forms in App"
                      : "Set up your app"}
                  </button>
                )}
              </div>
            )}
            {s.type !== "app" && (
              <div className="inspector-group">
                <h4>
                  {["header", "footer"].includes(s.type) ? "BRAND" : "TEXT"}
                </h4>
                {(!["header", "footer", "announcement", "features"].includes(
                  s.type,
                ) ||
                  brandHeader) && (
                  <Field
                    label={
                      brandHeader
                        ? "Second line"
                        : s.type === "hero" && s.variant === "badge"
                          ? "Badge"
                          : "Eyebrow"
                    }
                    editorField="eyebrow"
                    highlighted={focusField === "eyebrow"}
                    onEditCanvas={
                      onEditText ? () => onEditText("eyebrow") : undefined
                    }
                    value={draft?.field === "eyebrow" ? draft.text : s.eyebrow}
                    editingOnCanvas={draft?.field === "eyebrow"}
                    onChange={(eyebrow) => update({ eyebrow })}
                    placeholder={
                      brandHeader
                        ? "Shown small under the name"
                        : "A short introduction"
                    }
                  />
                )}
                <Field
                  label={
                    s.type === "footer" && s.variant === "centered"
                      ? "Site name line"
                      : ["header", "footer"].includes(s.type)
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
            )}
            {hasMedia && s.variant !== "badge" && (
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
                {linkTo("Link to", s.buttonUrl, (buttonUrl) =>
                  update({ buttonUrl }),
                )}
                {s.buttonUrl !== OWNER_LINK && (
                  <Field
                    label="Link URL"
                    value={s.buttonUrl}
                    onChange={(buttonUrl) => update({ buttonUrl })}
                    placeholder="https://example.com"
                  />
                )}
              </div>
            )}
            {["hero", "cta"].includes(s.type) && (
              <div className="inspector-group">
                <h4>SECOND BUTTON</h4>
                <Field
                  label="Button label"
                  value={s.secondaryLabel ?? ""}
                  onChange={(secondaryLabel) => update({ secondaryLabel })}
                  placeholder="Leave empty to hide"
                />
                {s.secondaryLabel && (
                  <>
                    {linkTo("Link to", s.secondaryUrl ?? "", (secondaryUrl) =>
                      update({ secondaryUrl }),
                    )}
                    {s.secondaryUrl !== OWNER_LINK && (
                      <Field
                        label="Link URL"
                        value={s.secondaryUrl ?? ""}
                        onChange={(secondaryUrl) => update({ secondaryUrl })}
                        placeholder="https://example.com"
                      />
                    )}
                  </>
                )}
              </div>
            )}
            {s.type === "hero" && (
              <div className="inspector-group">
                <Field
                  label="Small note under the buttons"
                  value={s.note ?? ""}
                  onChange={(note) => update({ note })}
                  placeholder="No sign-up needed."
                  hint="Leave empty to hide."
                />
                {s.variant === "badge" &&
                  (
                    [
                      [0, "Main button icon"],
                      [1, "Second button icon"],
                    ] as const
                  ).map(([index, label]) => (
                    <label className="field" key={index}>
                      {label}
                      <select
                        value={itemIcon(index)}
                        onChange={(e) => setItemIcon(index, e.target.value)}
                      >
                        <option value="">None</option>
                        {FEATURE_ICONS.map((name) => (
                          <option key={name} value={name}>
                            {iconName(name)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
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
                  {s.type === "products"
                    ? "PRODUCTS"
                    : brandHeader
                      ? "PHONE TABS"
                      : "ITEMS"}
                  <span>{s.items.length}</span>
                </h4>
                {brandHeader && (
                  <small className="block-hint">
                    On phones the page links move to a bar at the bottom of the
                    screen. Add tabs to give them short names and icons; with
                    none, every page gets a tab.
                  </small>
                )}
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
                      {!brandHeader && (
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
                      )}
                      {brandHeader &&
                        linkTo("Opens", item.url, (url) =>
                          update({
                            items: s.items.map((i) =>
                              i.id === item.id ? { ...i, url } : i,
                            ),
                          }),
                        )}
                      {(s.type === "features" || brandHeader) && (
                        <label className="field">
                          Icon
                          <select
                            value={item.icon ?? ""}
                            onChange={(e) =>
                              update({
                                items: s.items.map((i) => {
                                  if (i.id !== item.id) return i;
                                  const next = { ...i };
                                  if (e.target.value)
                                    next.icon = e.target.value;
                                  else delete next.icon;
                                  return next;
                                }),
                              })
                            }
                          >
                            <option value="">Automatic</option>
                            {FEATURE_ICONS.map((name) => (
                              <option key={name} value={name}>
                                {iconName(name)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
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
                        brandHeader
                          ? {
                              ...blankItem(),
                              title: "New tab",
                              url: `/${store.project.pages[0].slug}`,
                            }
                          : {
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
                  label="Send messages to (optional)"
                  value={s.formAction}
                  onChange={(formAction) => update({ formAction })}
                  placeholder="https://formspree.io/f/…"
                  hint="Leave empty and messages arrive in your Inbox once published. Or paste a form service link."
                />
              </div>
            )}
          </>
        ) : (
          <>
            {(variants || s.type === "hero") && (
              <div className="inspector-group">
                <h4>STYLE</h4>
                {variants && (
                  <label className="field">
                    Look
                    <select
                      value={s.variant ?? ""}
                      onChange={(e) =>
                        update({ variant: e.target.value || undefined })
                      }
                    >
                      <option value="">Standard</option>
                      {variants.map((v) => (
                        <option key={v} value={v}>
                          {variantNames[v] ?? iconName(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {s.type === "hero" && (
                  <label className="field">
                    Moving background
                    <select
                      value={s.effect ?? "none"}
                      onChange={(e) =>
                        update({
                          effect: e.target.value as Section["effect"],
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="orbits">
                        Orbits with travelling lights
                      </option>
                    </select>
                  </label>
                )}
                {s.variant && (
                  <small className="block-hint">
                    This look sets its own spacing, fonts and colours from your
                    theme’s accent.
                  </small>
                )}
              </div>
            )}
            {hasMedia && s.variant !== "badge" && (
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
              {!s.variant && (
                <>
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
                </>
              )}
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
              {s.type === "hero" && s.variant !== "badge" && (
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
                published site, in browsers that support scroll-driven
                animations (Chrome, Edge, Safari 26+). Others show the section
                without motion. Respects reduced-motion settings.
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
