/**
 * The Inspector's Data tab: what a data block lists or counts, and which
 * fields of the current item a block inside a repeat shows. Setting up an
 * app list here is where the owner decides what is public: a view names the
 * only fields visitors get ("Show on your website: these fields only"),
 * starts as a draft, and asks before showing phone numbers or emails.
 */
import { useId } from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import type { Section } from "../../studio/model";
import {
  appId,
  MAX_VIEWS,
  showsContact,
  tableOf,
  VIEW_STATUS,
  type App,
  type AppView,
  type AppViewFilter,
} from "../../apps/model";
import { walk, type Node, type PropValue } from "../model";
import {
  BINDABLE,
  enclosingRepeat,
  fieldsForProp,
  parseSource,
  sourceFields,
  type SourceField,
} from "../data/bind";
import { viewWarnings } from "../data/views";
import { useStoreCatalog } from "../data/live";
import { storeCategories } from "../data/store";
import { suggestedView } from "../data/presets";
import { Switch } from "./fields";
import "../data/data-panel.css";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
const PROP_LABELS: Record<string, string> = {
  text: "Text",
  label: "Button label",
  url: "Button link",
  src: "Photo",
  alt: "Photo description",
  link: "Link",
};
const OPS: [AppViewFilter["op"], string][] = [
  ["is", "is"],
  ["not", "is not"],
  ["contains", "contains"],
  ["atLeast", "is at least"],
  ["atMost", "is at most"],
  ["set", "is filled in"],
  ["empty", "is empty"],
];

function Select({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; group?: string }[];
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const known = options.some((o) => o.value === value);
  const render = (list: typeof options) =>
    list.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={known ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {(!known || placeholder) && (
          <option value="">{placeholder ?? "Choose…"}</option>
        )}
        {groups.length > 1
          ? groups.map((g) => (
              <optgroup key={g} label={g}>
                {render(options.filter((o) => (o.group ?? "") === g))}
              </optgroup>
            ))
          : render(options)}
      </select>
      {hint && <small className="block-hint">{hint}</small>}
    </div>
  );
}

export function DataPanel({ section, node }: { section: Section; node: Node }) {
  const store = useStudio();
  const project = store.project;
  const app = project.app;
  const root = section.root!;
  const repeat = enclosingRepeat(root, node);
  const setProps = (patch: Record<string, PropValue>, coalesce?: string) =>
    store.updateNode(
      section.id,
      node.id,
      (n) => ({ ...n, props: { ...n.props, ...patch } }),
      coalesce,
    );
  const ref = parseSource(node.props.source);

  return (
    <>
      {node.type === "repeat" && (
        <RepeatSource
          section={section}
          node={node}
          app={app}
          setProps={setProps}
        />
      )}
      {node.type === "table" && (
        <div className="inspector-group dp-group">
          <h4>ROWS FROM YOUR APP</h4>
          <ViewPicker node={node} app={app} setProps={setProps} />
        </div>
      )}
      {(node.type === "repeat" || node.type === "table") &&
        ref.kind === "view" &&
        app && <ViewEditor app={app} viewId={ref.id} />}
      {node.type === "stat" && <StatSource node={node} setProps={setProps} />}
      {node.type === "chart" && <ChartSource node={node} setProps={setProps} />}
      {repeat && BINDABLE[node.type] && (
        <Bindings
          section={section}
          node={node}
          fields={sourceFields(project, repeat.props.source)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- repeat

function RepeatSource({
  section,
  node,
  app,
  setProps,
}: {
  section: Section;
  node: Node;
  app: App | undefined;
  setProps: (p: Record<string, PropValue>, c?: string) => void;
}) {
  const store = useStudio();
  const project = store.project;
  const ref = parseSource(node.props.source);
  const catalog = useStoreCatalog();
  const options = [
    ...(catalog.open || ref.kind === "store"
      ? [
          {
            value: "store:products",
            label: catalog.open
              ? `Store products (${catalog.products.length})`
              : "Store products",
            group: "Your store",
          },
        ]
      : []),
    ...(project.collections ?? []).map((c) => ({
      value: `collection:${c.id}`,
      label: `${c.name} (${c.items.filter((i) => !i.hidden).length})`,
      group: "Collections",
    })),
    ...(app?.views ?? []).map((v) => ({
      value: `view:${v.id}`,
      label: `${v.name}${v.public ? "" : " (draft)"}`,
      group: "App lists",
    })),
  ];
  const choose = (value: string) => {
    if (value === "new") {
      const view = newView(store);
      if (view) choose(`view:${view.id}`);
      return;
    }
    setProps({ source: value });
    autoBind(section, node, value);
  };
  /** Binds the card's title, photo, line and link to fitting fields. */
  const autoBind = (s: Section, n: Node, source: string) => {
    const fields = sourceFields(useStudio.getState().project, source);
    const template = n.children?.find((c) => c.props.slot !== "empty");
    if (!template || !fields.length) return;
    const pick = (types: string[], skip: string[] = []) =>
      fields.find((f) => types.includes(f.type) && !skip.includes(f.source))
        ?.source;
    const title =
      fields.find((f) => f.source === "item:title")?.source ?? pick(["text"]);
    const image = pick(["image"]);
    const link = fields.find((f) => f.source === "item:link")?.source;
    // Lines take the remaining fields in order: details, then figures.
    const used = new Set<string>([
      title ?? "",
      "item:index",
      "item:link",
      "item:title",
    ]);
    const nextLine = () => {
      const f = fields.find(
        (x) => !used.has(x.source) && !["image", "link"].includes(x.type),
      );
      if (f) used.add(f.source);
      return f?.source;
    };
    let headingDone = false;
    for (const child of walk([template])) {
      // Blocks already bound by the owner (or a preset) keep their choice.
      if (child.bind && child.id !== template.id) continue;
      const bind: Record<string, string> = {};
      if (child.type === "heading" && !headingDone && title) {
        bind.text = title;
        headingDone = true;
      } else if (child.type === "text") {
        const line = nextLine();
        if (line) bind.text = line;
      } else if (child.type === "image" && image) {
        bind.src = image;
        if (title) bind.alt = title;
      } else if (child.type === "button" && link) bind.url = link;
      if (Object.keys(bind).length)
        store.updateNode(s.id, child.id, (c) => ({ ...c, bind: { ...bind } }));
    }
    // A card that links to the item's page.
    if (link && template.type === "box")
      store.updateNode(s.id, template.id, (c) => ({
        ...c,
        bind: { ...c.bind, link },
      }));
  };
  const collection =
    ref.kind === "collection"
      ? project.collections?.find((c) => c.id === ref.id)
      : undefined;
  const suggestion =
    ref.kind === "none" && app
      ? suggestedView(app, str(node.props.suggest))
      : undefined;
  return (
    <div className="inspector-group dp-group">
      <h4>WHAT TO LIST</h4>
      {suggestion && (
        <button
          type="button"
          className="dp-suggest"
          onClick={() => {
            if (
              store.updateApp((a) => ({
                ...a,
                views: [...(a.views ?? []), suggestion],
              }))
            )
              choose(`view:${suggestion.id}`);
          }}
        >
          <Icon name="sparkles" size={14} />
          <span>
            <strong>{`Create “${suggestion.name}”`}</strong>
            <small>
              A draft list with safe fields only. You choose when it goes live.
            </small>
          </span>
        </button>
      )}
      <Select
        label="Items from"
        value={str(node.props.source)}
        options={[
          ...options,
          ...(app && (app.views?.length ?? 0) < MAX_VIEWS && app.tables.length
            ? [
                {
                  value: "new",
                  label: "New list from your app…",
                  group: "App lists",
                },
              ]
            : []),
        ]}
        onChange={choose}
        placeholder={
          options.length ? undefined : "Add a collection or an app first"
        }
        hint={
          ref.kind === "store"
            ? "Your Forma Store’s active products, written into the page when you publish. Publish again after changing products."
            : "Collections are written into the page when you publish. App lists load live, and show only the fields you allow."
        }
      />
      {ref.kind === "store" && (
        <Select
          label="Category"
          value={str(node.props.category)}
          placeholder="Every product"
          options={[
            ...new Set([
              ...storeCategories(catalog.products),
              ...(str(node.props.category) ? [str(node.props.category)] : []),
            ]),
          ].map((c) => ({ value: c, label: c }))}
          onChange={(v) => setProps({ category: v })}
        />
      )}
      {ref.kind === "store" && catalog.open && !catalog.website && (
        <small className="block-hint">
          Your store doesn’t fill the website’s product blocks yet, so visitors
          see “When there are no products”. Turn it on in Store management.
        </small>
      )}
      {collection && (
        <>
          <div className="dp-row">
            <Select
              label="Only items where"
              value={str(node.props.filterField)}
              placeholder="Every item"
              options={collection.fields.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
              onChange={(v) =>
                setProps({
                  filterField: v,
                  filterOp: v ? str(node.props.filterOp) || "is" : "",
                })
              }
            />
            {str(node.props.filterField) && (
              <Select
                label="Condition"
                value={str(node.props.filterOp) || "is"}
                options={OPS.map(([value, label]) => ({ value, label }))}
                onChange={(v) => setProps({ filterOp: v })}
              />
            )}
          </div>
          {str(node.props.filterField) &&
            !["set", "empty"].includes(str(node.props.filterOp)) && (
              <TextInput
                label="Value"
                value={str(node.props.filterValue)}
                onChange={(v) =>
                  setProps({ filterValue: v }, `filter:${node.id}`)
                }
              />
            )}
          <div className="dp-row">
            <Select
              label="Order by"
              value={str(node.props.sortField)}
              placeholder="As in your collection"
              options={collection.fields.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
              onChange={(v) => setProps({ sortField: v })}
            />
            {str(node.props.sortField) && (
              <Select
                label="Direction"
                value={str(node.props.sortDir) || "asc"}
                options={[
                  { value: "asc", label: "Lowest / A first" },
                  { value: "desc", label: "Highest / Z first" },
                ]}
                onChange={(v) => setProps({ sortDir: v })}
              />
            )}
          </div>
        </>
      )}
      {ref.kind !== "none" && (
        <button
          type="button"
          className="dp-link-button"
          onClick={() => autoBind(section, node, str(node.props.source))}
        >
          <Icon name="sparkles" size={14} />
          Fill the card from the fields
        </button>
      )}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <small className="block-hint">{hint}</small>}
    </div>
  );
}

/** A new draft view of the first table: its title only (nothing public yet). */
function newView(
  store: ReturnType<typeof useStudio.getState>,
): AppView | undefined {
  const app = store.project.app;
  const table = app?.tables.find((t) => !t.private) ?? app?.tables[0];
  if (!app || !table) return;
  const money =
    table.fields.find((f) => f.type === "money")?.id ??
    table.totals.find((t) => t.op === "sum")?.id;
  const view: AppView = {
    id: appId(),
    name: `${table.name} on the website`,
    table: table.id,
    fields: [table.titleField, ...(money ? [money] : [])],
    statuses: [],
    sort: "",
    limit: 12,
    public: false,
  };
  return store.updateApp((a) => ({ ...a, views: [...(a.views ?? []), view] }))
    ? view
    : undefined;
}

function ViewPicker({
  node,
  app,
  setProps,
}: {
  node: Node;
  app: App | undefined;
  setProps: (p: Record<string, PropValue>) => void;
}) {
  const store = useStudio();
  if (!app || !app.tables.length)
    return (
      <p className="node-empty-note">
        Set up your business app first (App in the left panel).
      </p>
    );
  const suggestion =
    parseSource(node.props.source).kind === "none"
      ? suggestedView(app, str(node.props.suggest))
      : undefined;
  return (
    <>
      {suggestion && (
        <button
          type="button"
          className="dp-suggest"
          onClick={() => {
            if (
              store.updateApp((a) => ({
                ...a,
                views: [...(a.views ?? []), suggestion],
              }))
            )
              setProps({ source: `view:${suggestion.id}` });
          }}
        >
          <Icon name="sparkles" size={14} />
          <span>
            <strong>{`Create “${suggestion.name}”`}</strong>
            <small>
              A draft list without phone numbers or emails. You choose when it
              goes live.
            </small>
          </span>
        </button>
      )}
      <Select
        label="Rows from"
        value={str(node.props.source)}
        options={[
          ...(app.views ?? []).map((v) => ({
            value: `view:${v.id}`,
            label: `${v.name}${v.public ? "" : " (draft)"}`,
          })),
          ...((app.views?.length ?? 0) < MAX_VIEWS
            ? [{ value: "new", label: "New list from your app…" }]
            : []),
        ]}
        onChange={(v) => {
          if (v === "new") {
            const view = newView(store);
            if (view) setProps({ source: `view:${view.id}` });
          } else setProps({ source: v });
        }}
      />
    </>
  );
}

/** "Show on your website: these fields only" — the view's allow-list and rules. */
function ViewEditor({ app, viewId }: { app: App; viewId: string }) {
  const store = useStudio();
  const view = app.views?.find((v) => v.id === viewId);
  const table = view && tableOf(app, view.table);
  if (!view || !table) return null;
  const tables = new Map(app.tables.map((t) => [t.id, t]));
  const update = (patch: Partial<AppView>, coalesce?: string) =>
    store.updateApp(
      (a) => ({
        ...a,
        views: (a.views ?? []).map((v) => {
          if (v.id !== viewId) return v;
          const next = { ...v, ...patch };
          // Settings that no longer apply are dropped, so the view stays valid.
          next.initials = next.initials?.filter((f) => next.fields.includes(f));
          if (!next.initials?.length) delete next.initials;
          if (!next.contact)
            next.fields = next.fields.filter(
              (f) => !showsContact(table, f, tables),
            );
          return next;
        }),
      }),
      coalesce && `view:${viewId}:${coalesce}`,
    );
  const columns = [
    ...table.fields.map((f) => ({
      id: f.id,
      name: f.name,
      contact: showsContact(table, f.id, tables),
      text: f.type === "text" || f.type === "link",
    })),
    ...table.totals.map((t) => ({
      id: t.id,
      name: `${t.name} (total)`,
      contact: false,
      text: false,
    })),
    ...(table.statuses.length
      ? [{ id: VIEW_STATUS, name: "Status", contact: false, text: false }]
      : []),
  ];
  const toggle = (id: string, on: boolean) => {
    const fields = on
      ? [...view.fields, id]
      : view.fields.filter((f) => f !== id);
    if (fields.length && fields.length <= 12) update({ fields });
  };
  const warnings = viewWarnings(app, view);
  const hasContact = columns.some((c) => c.contact);
  return (
    <div className="inspector-group dp-group dp-view">
      <h4>SHOW ON YOUR WEBSITE</h4>
      <Switch
        label="Visitors can see this list"
        checked={view.public}
        onChange={(on) => update({ public: on })}
        hint={
          view.public
            ? "Live once you publish. Only the fields ticked below are sent."
            : "Draft: only you see it here until you turn this on and publish."
        }
      />
      <TextInput
        label="List name"
        value={view.name}
        onChange={(v) => update({ name: v.slice(0, 60) || view.name }, "name")}
      />
      <Select
        label="Records from"
        value={view.table}
        options={app.tables.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(id) => {
          const t = tableOf(app, id);
          if (t)
            update({
              table: id,
              fields: [t.titleField],
              statuses: [],
              sort: "",
              filter: undefined,
              initials: undefined,
              contact: undefined,
            });
        }}
      />
      <fieldset className="dp-fields">
        <legend>These fields only</legend>
        {columns.map((c) => {
          const on = view.fields.includes(c.id);
          const locked = c.contact && !view.contact;
          return (
            <div key={c.id} className="dp-field-row">
              <label className={locked ? "is-locked" : undefined}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked || (on && view.fields.length === 1)}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                />
                <span>{c.name}</span>
                {c.contact && <Icon name="lock" size={12} />}
              </label>
              {on && c.text && (
                <label className="dp-initials">
                  <input
                    type="checkbox"
                    checked={!!view.initials?.includes(c.id)}
                    onChange={(e) =>
                      update({
                        initials: e.target.checked
                          ? [...(view.initials ?? []), c.id]
                          : (view.initials ?? []).filter((x) => x !== c.id),
                      })
                    }
                  />
                  as “Priya S.”
                </label>
              )}
            </div>
          );
        })}
      </fieldset>
      {hasContact && (
        <label className="dp-consent">
          <input
            type="checkbox"
            checked={!!view.contact}
            onChange={(e) => update({ contact: e.target.checked })}
          />
          <span>
            Allow phone numbers and emails. They’ll be visible to anyone, so
            only do this for details people agreed to make public.
          </span>
        </label>
      )}
      {table.statuses.length > 0 && (
        <fieldset className="dp-fields">
          <legend>Only records that are</legend>
          {table.statuses.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={view.statuses.includes(s.id)}
                onChange={(e) =>
                  update({
                    statuses: e.target.checked
                      ? [...view.statuses, s.id]
                      : view.statuses.filter((x) => x !== s.id),
                  })
                }
              />
              <span>{s.name}</span>
            </label>
          ))}
          <small className="block-hint">None ticked: every record.</small>
        </fieldset>
      )}
      <div className="dp-row">
        <Select
          label="Only where"
          value={view.filter?.field ?? ""}
          placeholder="No condition"
          options={table.fields.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(field) =>
            update({
              filter: field
                ? {
                    field,
                    op: view.filter?.op ?? "is",
                    value: view.filter?.value ?? "",
                  }
                : undefined,
            })
          }
        />
        {view.filter && (
          <Select
            label="Condition"
            value={view.filter.op}
            options={OPS.map(([value, label]) => ({ value, label }))}
            onChange={(op) =>
              update({
                filter: { ...view.filter!, op: op as AppViewFilter["op"] },
              })
            }
          />
        )}
      </div>
      {view.filter && !["set", "empty"].includes(view.filter.op) && (
        <TextInput
          label="Value"
          value={view.filter.value}
          onChange={(value) =>
            update(
              { filter: { ...view.filter!, value: value.slice(0, 120) } },
              "filter",
            )
          }
        />
      )}
      <div className="dp-row">
        <Select
          label="Order by"
          value={view.sort}
          placeholder="Newest first"
          options={[
            ...table.fields
              .filter((f) =>
                ["text", "number", "money", "date", "choice"].includes(f.type),
              )
              .map((f) => ({ value: f.id, label: f.name })),
            ...table.totals.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(sort) => update({ sort })}
        />
        {view.sort && (
          <Select
            label="Direction"
            value={view.order ?? "desc"}
            options={[
              { value: "desc", label: "Largest / Z first" },
              { value: "asc", label: "Smallest / A first" },
            ]}
            onChange={(order) => update({ order: order as "asc" | "desc" })}
          />
        )}
      </div>
      <TextInput
        label="At most (records visitors can see)"
        value={String(view.limit)}
        onChange={(v) => {
          const n = Math.round(Number(v));
          if (Number.isFinite(n) && n >= 1 && n <= 100)
            update({ limit: n }, "limit");
        }}
        hint="1 to 100. Record numbers and anything not ticked above never leave Forma."
      />
      {warnings.map((w) => (
        <p key={w} className="dp-warning" role="note">
          <Icon name="eyeOff" size={14} />
          {w}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- stat and chart

function StatSource({
  node,
  setProps,
}: {
  node: Node;
  setProps: (p: Record<string, PropValue>) => void;
}) {
  const store = useStudio();
  const { project } = store;
  const app = project.app;
  const ref = parseSource(node.props.source);
  const card =
    ref.kind === "card"
      ? app?.dashboard.cards.find((c) => c.id === ref.id)
      : undefined;
  return (
    <div className="inspector-group dp-group">
      <h4>WHAT TO COUNT</h4>
      <Select
        label="Number from"
        value={str(node.props.source)}
        options={[
          ...(app?.dashboard.cards ?? []).map((c) => ({
            value: `card:${c.id}`,
            label: c.name,
            group: "Your app’s dashboard",
          })),
          ...(project.collections ?? []).map((c) => ({
            value: `collection:${c.id}`,
            label: `How many ${c.name.toLowerCase()}`,
            group: "Collections",
          })),
        ]}
        onChange={(source) => setProps({ source })}
      />
      {card && (
        <Switch
          label="Show this figure on your website"
          checked={!!card.public}
          onChange={(on) =>
            store.updateApp((a) => ({
              ...a,
              dashboard: {
                ...a.dashboard,
                cards: a.dashboard.cards.map((c) =>
                  c.id === card.id ? { ...c, public: on } : c,
                ),
              },
            }))
          }
          hint="Only the number is sent, never the records behind it."
        />
      )}
    </div>
  );
}
function ChartSource({
  node,
  setProps,
}: {
  node: Node;
  setProps: (p: Record<string, PropValue>) => void;
}) {
  const store = useStudio();
  const app = store.project.app;
  const ref = parseSource(node.props.source);
  const chart =
    ref.kind === "chart"
      ? app?.dashboard.charts?.find((c) => c.id === ref.id)
      : undefined;
  return (
    <div className="inspector-group dp-group">
      <h4>WHAT TO DRAW</h4>
      <Select
        label="Chart"
        value={str(node.props.source)}
        options={(app?.dashboard.charts ?? []).map((c) => ({
          value: `chart:${c.id}`,
          label: c.name,
        }))}
        placeholder={
          app?.dashboard.charts?.length
            ? undefined
            : "Your app has no charts yet"
        }
        onChange={(source) => setProps({ source })}
      />
      {chart && (
        <Switch
          label="Show this chart on your website"
          checked={!!chart.public}
          onChange={(on) =>
            store.updateApp((a) => ({
              ...a,
              dashboard: {
                ...a.dashboard,
                charts: (a.dashboard.charts ?? []).map((c) =>
                  c.id === chart.id ? { ...c, public: on } : c,
                ),
              },
            }))
          }
          hint="Only the monthly totals are sent, never the records behind them."
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bindings

function Bindings({
  section,
  node,
  fields,
}: {
  section: Section;
  node: Node;
  fields: SourceField[];
}) {
  const store = useStudio();
  const props = BINDABLE[node.type] ?? [];
  if (!fields.length)
    return (
      <div className="inspector-group dp-group">
        <h4>FILL FROM THE LIST</h4>
        <p className="node-empty-note">
          Choose what the repeat lists first; then its fields can fill this
          block.
        </p>
      </div>
    );
  const set = (prop: string, source: string) =>
    store.updateNode(section.id, node.id, (n) => {
      const bind = { ...n.bind };
      if (source) bind[prop] = source;
      else delete bind[prop];
      return { ...n, bind: Object.keys(bind).length ? bind : undefined };
    });
  return (
    <div className="inspector-group dp-group">
      <h4>FILL FROM THE LIST</h4>
      <p className="node-empty-note">
        Each item fills these from its own fields. Unset ones keep what you
        typed.
      </p>
      {props.map((prop) => {
        const options = fieldsForProp(fields, prop);
        return (
          <Select
            key={prop}
            label={PROP_LABELS[prop] ?? prop}
            value={node.bind?.[prop] ?? ""}
            placeholder="What I typed (same for every item)"
            options={options.map((f) => ({ value: f.source, label: f.name }))}
            onChange={(v) => set(prop, v)}
          />
        );
      })}
    </div>
  );
}
