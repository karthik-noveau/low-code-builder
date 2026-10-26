import { useState, type ChangeEvent } from "react";
import { Icon } from "./Icon";
import { Field, IconButton, InlineConfirm, Modal, type Notify } from "./ui";
import { MAX_COLLECTIONS, useStudio } from "./store";
import { safeImage } from "./model";
import { REQUEST_KINDS, type RequestKind } from "./requests";
import { canCollect, usablePayments } from "./payments";
import { PaymentsPanel } from "./PaymentsPanel";
import { collectionUsedBy } from "../apps/edit";
import {
  blueprints,
  createField,
  createItem,
  FIELD_TYPES,
  formatValue,
  importCsv,
  itemTitle,
  MAX_FIELDS,
  MAX_ITEMS,
  uniqueSlug,
  slugify,
  type Blueprint,
  type Collection,
  type CollectionDisplay,
  type CollectionField,
  type CollectionItem,
  type FieldType,
} from "./collections";

const displaySlots: {
  key: keyof CollectionDisplay;
  label: string;
  types?: FieldType[];
}[] = [
  { key: "title", label: "Title" },
  { key: "image", label: "Image", types: ["image"] },
  { key: "price", label: "Price", types: ["price", "number", "text"] },
  { key: "subtitle", label: "Subtitle" },
  { key: "summary", label: "Card text" },
  { key: "body", label: "Page text" },
  { key: "action", label: "Button link", types: ["link"] },
];

/** A URL part that is cleaned up when you leave the field, so hyphens can be typed. */
function SlugField({
  label,
  value,
  hint,
  onCommit,
}: {
  label: string;
  value: string;
  hint: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field">
      {label}
      <input
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft.trim()) onCommit(draft);
          setDraft(null);
        }}
      />
      <small>{hint}</small>
    </label>
  );
}

function ValueInput({
  collection: c,
  field,
  value,
  onChange,
}: {
  collection: Collection;
  field: CollectionField;
  value: string;
  onChange: (value: string) => void;
}) {
  const assets = useStudio((s) => s.project.assets);
  const id = `value-${field.id}`;
  if (field.type === "longText")
    return (
      <Field
        label={field.name}
        value={value}
        multiline
        maxLength={20000}
        onChange={onChange}
      />
    );
  if (field.type === "choice")
    return (
      <label className="field">
        {field.name}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {[...new Set(["", ...field.options])].map((o) => (
            <option key={o} value={o}>
              {o || "—"}
            </option>
          ))}
        </select>
      </label>
    );
  if (field.type === "image")
    return (
      <div className="field data-image-field">
        <label htmlFor={id}>{field.name}</label>
        <div>
          {safeImage(value) ? (
            <img src={safeImage(value)} alt="" />
          ) : (
            <span className="data-image-empty">
              <Icon name="image" size={18} />
            </span>
          )}
          <select
            aria-label={`${field.name} from media`}
            value={assets.some((a) => a.url === value) ? value : ""}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          >
            <option value="">Choose from media…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.url}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <input
          id={id}
          value={value}
          placeholder="Or paste an image URL"
          maxLength={20000}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  return (
    <Field
      label={field.name}
      value={value}
      maxLength={field.type === "link" ? 2000 : 1000}
      type={
        field.type === "date"
          ? "date"
          : field.type === "number"
            ? "number"
            : field.type === "link"
              ? "url"
              : "text"
      }
      placeholder={
        field.type === "price"
          ? `e.g. 24 (shown as ${formatValue(c, field.id, "24")})`
          : field.type === "link"
            ? "https://…"
            : ""
      }
      onChange={onChange}
    />
  );
}

const undo = { label: "Undo", run: () => useStudio.getState().undo() };

function ItemsTab({
  collection: c,
  notify,
}: {
  collection: Collection;
  notify: Notify;
}) {
  const store = useStudio();
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const update = (fn: (c: Collection) => Collection) =>
    store.updateCollection(c.id, fn);
  const updateItem = (id: string, fn: (i: CollectionItem) => CollectionItem) =>
    update((c) => ({
      ...c,
      items: c.items.map((i) => (i.id === id ? fn(i) : i)),
    }));
  const columns = c.fields.filter((f) => f.type !== "longText").slice(0, 3);
  const q = query.trim().toLowerCase();
  const items = q
    ? c.items.filter((i) =>
        Object.values(i.values).some((v) => v.toLowerCase().includes(q)),
      )
    : c.items;
  return (
    <>
      <div className="data-toolbar">
        <label className="data-search">
          <Icon name="search" size={14} />
          <input
            aria-label={`Search ${c.name}`}
            placeholder={`Search ${c.items.length} ${c.items.length === 1 ? c.singular.toLowerCase() : c.name.toLowerCase()}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="primary-button"
          disabled={c.items.length >= MAX_ITEMS}
          onClick={() => {
            const item = createItem(c);
            update((c) => ({ ...c, items: [item, ...c.items] }));
            setOpen(item.id);
          }}
        >
          <Icon name="plus" size={15} />
          Add {c.singular.toLowerCase()}
        </button>
      </div>
      {c.items.length === 0 ? (
        <div className="data-empty">
          <Icon name="layers" size={26} />
          <strong>No {c.name.toLowerCase()} yet</strong>
          <span>
            Add your first {c.singular.toLowerCase()}, or import a spreadsheet.
          </span>
        </div>
      ) : (
        <div className="data-table" role="table" aria-label={`${c.name} items`}>
          <div className="data-row data-head" role="row">
            {columns.map((f) => (
              <span role="columnheader" key={f.id}>
                {f.name}
              </span>
            ))}
            <span role="columnheader" className="data-status">
              Status
            </span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className={`data-item ${open === item.id ? "open" : ""}`}
            >
              <button
                className="data-row"
                role="row"
                aria-expanded={open === item.id}
                onClick={() => setOpen(open === item.id ? null : item.id)}
              >
                {columns.map((f) => (
                  <span role="cell" key={f.id}>
                    {f.type === "image" ? (
                      safeImage(item.values[f.id]) ? (
                        <img src={safeImage(item.values[f.id])} alt="" />
                      ) : (
                        <i className="data-image-empty small" />
                      )
                    ) : (
                      formatValue(c, f.id, item.values[f.id] ?? "") || (
                        <em>—</em>
                      )
                    )}
                  </span>
                ))}
                <span role="cell" className="data-status">
                  <b className={item.hidden ? "is-hidden" : ""}>
                    {item.hidden ? "Hidden" : "Visible"}
                  </b>
                </span>
              </button>
              {open === item.id && (
                <div className="data-editor">
                  {c.fields.map((f) => (
                    <ValueInput
                      key={f.id}
                      collection={c}
                      field={f}
                      value={item.values[f.id] ?? ""}
                      onChange={(value) =>
                        updateItem(item.id, (i) => ({
                          ...i,
                          values: { ...i.values, [f.id]: value },
                        }))
                      }
                    />
                  ))}
                  {c.itemPages && (
                    <SlugField
                      label="Page URL"
                      value={item.slug}
                      hint={`/${c.slug}/${item.slug}`}
                      onCommit={(value) =>
                        updateItem(item.id, (i) => ({
                          ...i,
                          slug: uniqueSlug(
                            value,
                            c.items
                              .filter((x) => x.id !== i.id)
                              .map((x) => x.slug),
                          ),
                        }))
                      }
                    />
                  )}
                  <div className="data-editor-actions">
                    <label className="switch-row">
                      Visible on site
                      <button
                        className={`switch ${!item.hidden ? "on" : ""}`}
                        role="switch"
                        aria-checked={!item.hidden}
                        aria-label={`Show ${itemTitle(c, item)} on site`}
                        onClick={() =>
                          updateItem(item.id, (i) => ({
                            ...i,
                            hidden: !i.hidden,
                          }))
                        }
                      >
                        <span />
                      </button>
                    </label>
                    <button
                      className="danger-text"
                      onClick={() => setDeleting(item.id)}
                    >
                      <Icon name="trash" size={13} />
                      Delete {c.singular.toLowerCase()}
                    </button>
                  </div>
                  {deleting === item.id && (
                    <InlineConfirm
                      message={`Delete ${itemTitle(c, item) || `this ${c.singular.toLowerCase()}`}?`}
                      confirmLabel="Delete"
                      onCancel={() => setDeleting(null)}
                      onConfirm={() => {
                        // Its own history step, so Undo brings back only this item.
                        store.commit((p) => ({
                          ...p,
                          collections: (p.collections ?? []).map((x) =>
                            x.id === c.id
                              ? {
                                  ...x,
                                  items: x.items.filter(
                                    (i) => i.id !== item.id,
                                  ),
                                }
                              : x,
                          ),
                        }));
                        setDeleting(null);
                        setOpen(null);
                        notify(
                          `${itemTitle(c, item) || `The ${c.singular.toLowerCase()}`} deleted.`,
                          undo,
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FieldsTab({ collection: c }: { collection: Collection }) {
  const store = useStudio();
  const update = (fn: (c: Collection) => Collection) =>
    store.updateCollection(c.id, fn);
  const updateField = (id: string, values: Partial<CollectionField>) =>
    update((c) => ({
      ...c,
      fields: c.fields.map((f) => (f.id === id ? { ...f, ...values } : f)),
    }));
  return (
    <>
      <p className="data-note">
        Fields are the details each {c.singular.toLowerCase()} has. Any business
        works: add a size, a menu category, a square footage, a speaker.
      </p>
      <ul className="data-fields">
        {c.fields.map((f, index) => (
          <li key={f.id}>
            <input
              aria-label={`Field ${index + 1} name`}
              value={f.name}
              maxLength={120}
              onChange={(e) => updateField(f.id, { name: e.target.value })}
            />
            <select
              aria-label={`Field ${index + 1} type`}
              value={f.type}
              onChange={(e) => {
                const type = e.target.value as FieldType;
                // Unbind card/page slots this field no longer fits (e.g. an image that became text).
                update((c) => ({
                  ...c,
                  fields: c.fields.map((x) =>
                    x.id === f.id ? { ...x, type } : x,
                  ),
                  display: Object.fromEntries(
                    Object.entries(c.display).map(([key, value]) => {
                      const slot = displaySlots.find((d) => d.key === key);
                      return [
                        key,
                        value === f.id &&
                        slot?.types &&
                        !slot.types.includes(type)
                          ? ""
                          : value,
                      ];
                    }),
                  ) as CollectionDisplay,
                }));
              }}
            >
              {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPES[t]}
                </option>
              ))}
            </select>
            {f.type === "choice" && (
              <input
                className="data-options"
                aria-label={`${f.name} choices`}
                placeholder="Choices, separated by commas"
                value={f.options.join(", ")}
                onChange={(e) =>
                  updateField(f.id, {
                    options: e.target.value
                      .split(",")
                      .map((o) => o.trim().slice(0, 120))
                      .slice(0, 50),
                  })
                }
              />
            )}
            <IconButton
              icon="trash"
              label={`Remove ${f.name}`}
              disabled={c.fields.length === 1 || c.display.title === f.id}
              onClick={() =>
                update((c) => ({
                  ...c,
                  fields: c.fields.filter((x) => x.id !== f.id),
                  display: Object.fromEntries(
                    Object.entries(c.display).map(([k, v]) => [
                      k,
                      v === f.id ? "" : v,
                    ]),
                  ) as unknown as CollectionDisplay,
                  items: c.items.map((i) => {
                    const values = { ...i.values };
                    delete values[f.id];
                    return { ...i, values };
                  }),
                }))
              }
            />
          </li>
        ))}
      </ul>
      <button
        className="subtle-button"
        disabled={c.fields.length >= MAX_FIELDS}
        onClick={() =>
          update((c) => ({
            ...c,
            fields: [...c.fields, createField("New field", "text")],
          }))
        }
      >
        <Icon name="plus" size={15} />
        Add field
      </button>
    </>
  );
}

function SettingsTab({
  collection: c,
  onDeleted,
  notify,
}: {
  collection: Collection;
  onDeleted: () => void;
  notify: Notify;
}) {
  const store = useStudio();
  const [confirming, setConfirming] = useState(false);
  const update = (fn: (c: Collection) => Collection) =>
    store.updateCollection(c.id, fn);
  const taken = (store.project.collections ?? [])
    .filter((x) => x.id !== c.id)
    .map((x) => x.slug);
  const appUses = collectionUsedBy(store.project.app, c.id);
  const used = store.project.pages.some((p) =>
    p.sections.some((s) => s.listing?.collection === c.id),
  );
  return (
    <div className="data-settings">
      <div className="data-settings-group">
        <h4>NAMING</h4>
        <Field
          label="Collection name"
          maxLength={120}
          value={c.name}
          onChange={(name) => update((c) => ({ ...c, name }))}
        />
        <Field
          label="One item is called"
          maxLength={120}
          value={c.singular}
          onChange={(singular) => update((c) => ({ ...c, singular }))}
        />
        <Field
          label="Currency symbol"
          value={c.currency}
          onChange={(currency) =>
            update((c) => ({ ...c, currency: currency.slice(0, 8) }))
          }
        />
      </div>
      <div className="data-settings-group">
        <h4>ITEM PAGES</h4>
        <label className="switch-row">
          Give every {c.singular.toLowerCase()} its own page
          <button
            className={`switch ${c.itemPages ? "on" : ""}`}
            role="switch"
            aria-checked={c.itemPages}
            aria-label="Item pages"
            onClick={() => update((c) => ({ ...c, itemPages: !c.itemPages }))}
          >
            <span />
          </button>
        </label>
        {c.itemPages && (
          <SlugField
            label="Address"
            value={c.slug}
            hint={`Pages live at /${c.slug}/${c.items[0]?.slug ?? "item"}`}
            onCommit={(value) =>
              update((c) => ({ ...c, slug: uniqueSlug(slugify(value), taken) }))
            }
          />
        )}
      </div>
      <div className="data-settings-group">
        <h4>WHAT CARDS AND PAGES SHOW</h4>
        {displaySlots.map((slot) => (
          <label className="field" key={slot.key}>
            {slot.label}
            <select
              value={c.display[slot.key]}
              onChange={(e) =>
                update((c) => ({
                  ...c,
                  display: { ...c.display, [slot.key]: e.target.value },
                }))
              }
            >
              {slot.key !== "title" && <option value="">Nothing</option>}
              {c.fields
                .filter((f) => !slot.types || slot.types.includes(f.type))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        {c.display.action && (
          <Field
            label="Button label"
            maxLength={120}
            value={c.display.actionLabel}
            onChange={(actionLabel) =>
              update((c) => ({ ...c, display: { ...c.display, actionLabel } }))
            }
          />
        )}
      </div>
      <div className="data-settings-group">
        <h4>VISITOR ACTION</h4>
        <label className="field">
          What visitors can do on {c.itemPages ? "an item page" : "item pages"}
          <select
            aria-label="Visitor action"
            value={c.request?.kind ?? ""}
            onChange={(e) => {
              const kind = e.target.value as RequestKind | "";
              update((c) => {
                const next = { ...c };
                if (kind)
                  next.request = { kind, label: c.request?.label ?? "" };
                else delete next.request;
                return next;
              });
            }}
          >
            <option value="">Nothing — show the button link only</option>
            {(Object.keys(REQUEST_KINDS) as RequestKind[]).map((k) => (
              <option key={k} value={k}>
                {REQUEST_KINDS[k].label}
              </option>
            ))}
          </select>
        </label>
        {c.request && (
          <>
            <small>
              {REQUEST_KINDS[c.request.kind].description} Requests arrive in
              your Inbox once the site is published with Forma.
              {!c.itemPages && " Turn on item pages to show the form."}
            </small>
            <Field
              label="Form button"
              maxLength={40}
              value={c.request.label}
              placeholder={REQUEST_KINDS[c.request.kind].button}
              onChange={(label) =>
                update((c) => ({
                  ...c,
                  request: c.request && {
                    ...c.request,
                    label: label.slice(0, 40),
                  },
                }))
              }
            />
            {canCollect(c.request.kind) && (
              <>
                <label className="switch-row">
                  Ask visitors to pay
                  <button
                    className={`switch ${c.request.collect ? "on" : ""}`}
                    role="switch"
                    aria-checked={!!c.request.collect}
                    aria-label="Ask visitors to pay"
                    onClick={() =>
                      update((c) => ({
                        ...c,
                        request: c.request && {
                          ...c.request,
                          collect: !c.request.collect,
                        },
                      }))
                    }
                  >
                    <span />
                  </button>
                </label>
                {c.request.collect && (
                  <>
                    <small>
                      Visitors see the total (
                      {c.request.kind === "book"
                        ? "the price"
                        : `price × ${c.request.kind === "order" ? "quantity" : "guests"}`}
                      ) and your payment options after sending. You mark it paid
                      in the Inbox.
                    </small>
                    <details
                      className="data-payments"
                      open={!usablePayments(store.project.payments)}
                    >
                      <summary>
                        Payment options
                        <small>Shared by every collection</small>
                      </summary>
                      <PaymentsPanel inData />
                    </details>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="data-settings-group">
        {confirming ? (
          <InlineConfirm
            message={`Delete ${c.name}${c.items.length ? ` and its ${c.items.length} ${c.items.length === 1 ? "item" : "items"}` : ""}?`}
            confirmLabel="Delete"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              if (!store.removeCollection(c.id))
                return notify(
                  `${c.name} is used by your app, so it wasn’t deleted.`,
                );
              onDeleted();
              notify(`${c.name} deleted.`, undo);
            }}
          />
        ) : (
          <button
            className="danger-text"
            disabled={appUses.length > 0}
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" size={13} />
            Delete {c.name.toLowerCase()}
          </button>
        )}
        {appUses.length > 0 && <small>{appUses.join(" ")}</small>}
        {used && (
          <small>
            Sections showing it will ask you to choose another collection.
          </small>
        )}
      </div>
    </div>
  );
}

export function DataManager({
  initial,
  initialTab = "items",
  onClose,
  notify,
}: {
  initial?: string;
  /** Where to start, e.g. Settings when a review item points at a collection. */
  initialTab?: "items" | "fields" | "settings";
  onClose: () => void;
  notify: Notify;
}) {
  const store = useStudio();
  const collections = store.project.collections ?? [];
  const [active, setActive] = useState<string | null>(
    initial ?? collections[0]?.id ?? null,
  );
  const [tab, setTab] = useState(initialTab);
  const current = collections.find((c) => c.id === active);
  const choosing = !current;
  const full = collections.length >= MAX_COLLECTIONS;
  const fullMessage = `A site can have up to ${MAX_COLLECTIONS} collections. Delete one to add another.`;
  const create = (blueprint: Blueprint) => {
    if (full) return notify(fullMessage);
    const id = store.addCollection(blueprint);
    setActive(id);
    setTab("items");
  };
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (full) return notify(fullMessage);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a CSV file under 5 MB.");
      const { collection, source, skipped, truncated } = importCsv(
        await file.text(),
        file.name.replace(/\.csv$/i, "").replace(/[_-]+/g, " "),
        collections.map((c) => c.slug),
      );
      setActive(store.addCollection(collection));
      setTab("items");
      notify(
        `${source === "shopify" ? "Shopify products" : "Spreadsheet"} imported: ${collection.items.length} ${collection.items.length === 1 ? "item" : "items"}${skipped ? `, ${skipped} skipped` : ""}.${truncated ? " Some very long cells were shortened." : ""}`,
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "That file couldn’t be imported.",
      );
    }
  };
  return (
    <Modal
      title="Data"
      subtitle="Everything your business offers, in one place. Show it anywhere on your site."
      onClose={onClose}
      wide
    >
      <div className="data-manager">
        <nav className="data-collections" aria-label="Collections">
          {collections.map((c) => (
            <button
              key={c.id}
              className={c.id === active ? "chosen" : ""}
              aria-current={c.id === active || undefined}
              onClick={() => {
                setActive(c.id);
                setTab("items");
              }}
            >
              <Icon name={blueprints[c.blueprint].icon} size={15} />
              <span>{c.name}</span>
              <small>{c.items.length}</small>
            </button>
          ))}
          <button
            className={`data-new ${choosing ? "chosen" : ""}`}
            onClick={() => setActive(null)}
          >
            <Icon name="plus" size={15} />
            <span>New collection</span>
          </button>
        </nav>
        <div className="data-main">
          {choosing ? (
            <div className="data-blueprints">
              <h3>What do you want to show?</h3>
              <p className="data-note">
                Start from a ready-made list. Each comes with the right fields
                and a few examples you can edit or remove.
              </p>
              <div className="data-blueprint-grid">
                {(Object.keys(blueprints) as Blueprint[]).map((b) => (
                  <button key={b} onClick={() => create(b)}>
                    <Icon name={blueprints[b].icon} size={18} />
                    <strong>{blueprints[b].label}</strong>
                    <span>{blueprints[b].description}</span>
                  </button>
                ))}
              </div>
              <label className="data-import">
                <Icon name="upload" size={18} />
                <span>
                  <strong>Import a spreadsheet</strong>
                  <small>
                    Any CSV, including a Shopify product export, Airtable, or
                    Google Sheets.
                  </small>
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={upload}
                  aria-label="Import CSV"
                />
              </label>
            </div>
          ) : (
            <>
              <div className="data-header">
                <div>
                  <h3>{current.name}</h3>
                  <span>
                    {current.items.length}{" "}
                    {current.items.length === 1
                      ? current.singular.toLowerCase()
                      : "items"}
                    {current.itemPages && ` · pages at /${current.slug}/…`}
                  </span>
                </div>
                <div className="segmented" role="tablist">
                  {(["items", "fields", "settings"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      className={tab === t ? "chosen" : ""}
                      onClick={() => setTab(t)}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {tab === "items" && (
                <ItemsTab collection={current} notify={notify} />
              )}
              {tab === "fields" && <FieldsTab collection={current} />}
              {tab === "settings" && (
                <SettingsTab
                  key={current.id}
                  collection={current}
                  onDeleted={() => setActive(null)}
                  notify={notify}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
