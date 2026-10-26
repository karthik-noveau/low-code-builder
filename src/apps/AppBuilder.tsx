/**
 * The editor's App window: build the site's business app from a template,
 * then shape its tables (with steps and totals), the forms visitors use and
 * the owner's dashboard. Every change goes through store.updateApp, which
 * refuses anything that would leave the app invalid.
 */
import { useState } from "react";
import { Icon } from "../studio/Icon";
import { Field, InlineConfirm, Modal, type Notify } from "../studio/ui";
import { useStudio } from "../studio/store";
import { APP_TEMPLATES, type AppTemplate } from "./templates";
import {
  MAX_FORMS,
  MAX_TABLES,
  fieldOf,
  tableOf,
  type App,
  type AppCard,
  type AppList,
} from "./model";
import {
  addForm,
  addTable,
  cardSentence,
  createCard,
  createList,
  numericFields,
} from "./edit";
import { Checks, Group, IssueList, Select, Toggle } from "./builderUi";
import { undoAction, useAppEdit, useAppIssues } from "./builderHooks";
import { TableEditor } from "./TableEditor";
import { FormEditor } from "./FormEditor";
import { type AppTab, type AppTarget } from "./issues";
import { sectionAppForms } from "../blocks/project";
import "./builder.css";

const TABS: { id: AppTab; label: string }[] = [
  { id: "tables", label: "Tables" },
  { id: "forms", label: "Forms" },
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Settings" },
];
/** The page a template's forms go on. */
const CURRENCIES: { id: string; label: string }[] = [
  { id: "INR", label: "Indian rupee (₹)" },
  { id: "USD", label: "US dollar ($)" },
  { id: "EUR", label: "Euro (€)" },
  { id: "GBP", label: "British pound (£)" },
  { id: "AED", label: "UAE dirham" },
  { id: "SGD", label: "Singapore dollar" },
  { id: "AUD", label: "Australian dollar" },
  { id: "CAD", label: "Canadian dollar" },
  { id: "LKR", label: "Sri Lankan rupee" },
  { id: "NPR", label: "Nepalese rupee" },
  { id: "BDT", label: "Bangladeshi taka" },
  { id: "MYR", label: "Malaysian ringgit" },
  { id: "ZAR", label: "South African rand" },
  { id: "KES", label: "Kenyan shilling" },
  { id: "NGN", label: "Nigerian naira" },
  { id: "SAR", label: "Saudi riyal" },
  { id: "JPY", label: "Japanese yen" },
];

function Gallery({
  notify,
  onInstalled,
  storeUrl,
}: {
  notify: Notify;
  onInstalled: () => void;
  /** The site's online store (cloud sites only). */
  storeUrl?: string;
}) {
  const store = useStudio();
  const hasSections = store.project.pages.some((p) =>
    p.sections.some((s) => sectionAppForms(s).length > 0),
  );
  const [addPage, setAddPage] = useState(!hasSections);
  const use = (template: AppTemplate) => {
    // Apps that choose from a menu or services bring that collection along.
    const { app, collections } = template.create(store.project.name, {
      taken: (store.project.collections ?? []).map((c) => c.slug),
    });
    const name = template.page;
    // One step, so a single Undo takes the app and its collections away.
    const page =
      addPage && app.forms.length
        ? store.installApp(app, name, collections)
        : undefined;
    if (!page) store.installApp(app, undefined, collections);
    if (!useStudio.getState().project.app)
      return notify("The app couldn’t be set up. Please try again.");
    onInstalled();
    notify(
      template.id === "blank"
        ? "Your app is ready. Start with a table."
        : `${template.name} is ready.${page ? ` Its forms are on a new page, ${name}.` : " Add its forms to a page from Forms."}`,
      undoAction,
    );
  };
  return (
    <div className="app-gallery">
      <h3>What do you want to run on your site?</h3>
      <p className="data-note">
        Pick a starting point. You can rename, add or remove anything
        afterwards; nothing is fixed.
      </p>
      <div className="app-template-grid">
        {storeUrl && (
          // Selling online is the store's job: catalogue, cart, checkout and orders.
          <div className="app-template">
            <strong>Online store</strong>
            <small>Any shop selling products online</small>
            <p>
              Products, cart, checkout, orders and customers. It’s built in, so
              it opens in Store management rather than here.
            </p>
            <a className="primary-button" href={storeUrl}>
              Open the store
            </a>
          </div>
        )}
        {APP_TEMPLATES.map((t) => (
          <div className="app-template" key={t.id}>
            <strong>{t.name}</strong>
            <small>{t.examples}</small>
            <p>{t.description}</p>
            <button
              type="button"
              className={t.id === "blank" ? "subtle-button" : "primary-button"}
              aria-label={`Use ${t.name}`}
              onClick={() => use(t)}
            >
              Use this
            </button>
          </div>
        ))}
      </div>
      {!hasSections && (
        <label className="app-gallery-page">
          <input
            type="checkbox"
            checked={addPage}
            onChange={(e) => setAddPage(e.target.checked)}
          />
          Add its forms to a new page
        </label>
      )}
    </div>
  );
}

function DashboardTab({ app, notify }: { app: App; notify: Notify }) {
  const edit = useAppEdit(notify);
  const issues = useAppIssues(app);
  const tables = app.tables.map((t) => ({ id: t.id, label: t.name }));
  const statusOptions = (tableId: string) =>
    (tableOf(app, tableId)?.statuses ?? []).map((s) => ({
      id: s.id,
      label: s.name,
    }));
  const updateCard = (id: string, values: Partial<AppCard>, key?: string) =>
    edit(
      (a) => ({
        ...a,
        dashboard: {
          ...a.dashboard,
          cards: a.dashboard.cards.map((c) =>
            c.id === id ? { ...c, ...values } : c,
          ),
        },
      }),
      key && `card:${id}:${key}`,
    );
  const updateList = (id: string, values: Partial<AppList>, key?: string) =>
    edit(
      (a) => ({
        ...a,
        dashboard: {
          ...a.dashboard,
          lists: a.dashboard.lists.map((l) =>
            l.id === id ? { ...l, ...values } : l,
          ),
        },
      }),
      key && `list:${id}:${key}`,
    );
  if (!app.tables.length)
    return (
      <div className="data-empty">
        <Icon name="chart" size={26} />
        <strong>Nothing to show yet</strong>
        <span>Add a table first; the dashboard adds up its records.</span>
      </div>
    );
  return (
    <div className="app-editor">
      <IssueList issues={issues.filter((i) => i.target.tab === "dashboard")} />
      <Group
        title="FIGURES"
        intro="Big numbers at the top of your app page, like rewards owed or requests waiting."
      >
        <div className="app-cards">
          {app.dashboard.cards.map((c) => {
            const table = tableOf(app, c.table);
            return (
              <div className="app-card" key={c.id}>
                <p className="app-sentence">{cardSentence(app, c)}</p>
                <div className="app-inline">
                  <Field
                    label="Name"
                    maxLength={60}
                    value={c.name}
                    onChange={(name) => updateCard(c.id, { name }, "name")}
                  />
                  <Select
                    label="From"
                    value={c.table}
                    options={tables}
                    onChange={(tableId) =>
                      updateCard(c.id, {
                        table: tableId,
                        op: "count",
                        field: undefined,
                        statuses: [],
                        money: false,
                      })
                    }
                  />
                </div>
                <Select
                  label="Shows"
                  value={c.op === "count" ? "" : (c.field ?? "")}
                  options={[
                    {
                      id: "",
                      label: `How many ${table?.name.toLowerCase() ?? "records"}`,
                    },
                    ...(table ? numericFields(table) : []).map((f) => ({
                      id: f.id,
                      label: `Sum of ${f.name}`,
                    })),
                  ]}
                  onChange={(v) => {
                    const f = table && fieldOf(table, v);
                    updateCard(
                      c.id,
                      f
                        ? { op: "sum", field: f.id, money: f.type !== "number" }
                        : { op: "count", field: undefined, money: false },
                    );
                  }}
                />
                <Checks
                  label="Only those that are"
                  options={statusOptions(c.table)}
                  value={c.statuses}
                  empty={`${table?.name ?? "This table"} has no steps, so every one counts.`}
                  onChange={(statuses) => updateCard(c.id, { statuses })}
                />
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    if (
                      edit((a) => ({
                        ...a,
                        dashboard: {
                          ...a.dashboard,
                          cards: a.dashboard.cards.filter((x) => x.id !== c.id),
                        },
                      }))
                    )
                      notify(`${c.name || "Figure"} removed.`, undoAction);
                  }}
                >
                  <Icon name="trash" size={13} />
                  Remove figure
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="subtle-button"
          disabled={app.dashboard.cards.length >= 12}
          onClick={() => {
            const card = createCard(app);
            if (card)
              edit((a) => ({
                ...a,
                dashboard: {
                  ...a.dashboard,
                  cards: [...a.dashboard.cards, card],
                },
              }));
          }}
        >
          <Icon name="plus" size={15} />
          Add figure
        </button>
      </Group>
      <Group
        title="LISTS"
        intro="Short lists on your app page, like requests waiting for you or your best customers."
      >
        <div className="app-cards">
          {app.dashboard.lists.map((l) => {
            const table = tableOf(app, l.table);
            return (
              <div className="app-card" key={l.id}>
                <div className="app-inline">
                  <Field
                    label="Name"
                    maxLength={60}
                    value={l.name}
                    onChange={(name) => updateList(l.id, { name }, "name")}
                  />
                  <Select
                    label="From"
                    value={l.table}
                    options={tables}
                    onChange={(tableId) =>
                      updateList(l.id, {
                        table: tableId,
                        sort: "",
                        statuses: [],
                      })
                    }
                  />
                </div>
                <div className="app-inline">
                  <Select
                    label="Order"
                    value={l.sort}
                    options={[
                      { id: "", label: "Newest first" },
                      ...(table?.fields ?? [])
                        .filter((f) =>
                          ["number", "money", "date"].includes(f.type),
                        )
                        .map((f) => ({
                          id: f.id,
                          label: `Highest ${f.name.toLowerCase()} first`,
                        })),
                      ...(table?.totals ?? []).map((t) => ({
                        id: t.id,
                        label: `Highest ${t.name.toLowerCase()} first`,
                      })),
                    ]}
                    onChange={(sort) => updateList(l.id, { sort })}
                  />
                  <Field
                    label="Show up to"
                    type="number"
                    value={String(l.limit)}
                    onChange={(v) => {
                      const limit = Math.round(Number(v));
                      if (limit >= 1 && limit <= 50)
                        updateList(l.id, { limit }, "limit");
                    }}
                    hint="1 to 50"
                  />
                </div>
                <Checks
                  label="Only those that are"
                  options={statusOptions(l.table)}
                  value={l.statuses}
                  empty={`${table?.name ?? "This table"} has no steps.`}
                  onChange={(statuses) => updateList(l.id, { statuses })}
                />
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    if (
                      edit((a) => ({
                        ...a,
                        dashboard: {
                          ...a.dashboard,
                          lists: a.dashboard.lists.filter((x) => x.id !== l.id),
                        },
                      }))
                    )
                      notify(`${l.name || "List"} removed.`, undoAction);
                  }}
                >
                  <Icon name="trash" size={13} />
                  Remove list
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="subtle-button"
          disabled={app.dashboard.lists.length >= 12}
          onClick={() => {
            const list = createList(app);
            if (list)
              edit((a) => ({
                ...a,
                dashboard: {
                  ...a.dashboard,
                  lists: [...a.dashboard.lists, list],
                },
              }));
          }}
        >
          <Icon name="plus" size={15} />
          Add list
        </button>
      </Group>
    </div>
  );
}

function SettingsTab({
  app,
  notify,
  recordsUrl,
  onRemoved,
}: {
  app: App;
  notify: Notify;
  recordsUrl?: string;
  onRemoved: () => void;
}) {
  const store = useStudio();
  const edit = useAppEdit(notify);
  const [confirming, setConfirming] = useState(false);
  const sections = store.project.pages.flatMap((p) =>
    p.sections.filter((s) => sectionAppForms(s).length).map(() => p.name),
  );
  const install = (values: Partial<App["install"]>, key?: string) =>
    edit((a) => ({ ...a, install: { ...a.install, ...values } }), key);
  return (
    <div className="app-editor">
      <Group title="MONEY">
        <Select
          label="Currency"
          value={app.currency}
          options={
            CURRENCIES.some((c) => c.id === app.currency)
              ? CURRENCIES
              : [{ id: app.currency, label: app.currency }, ...CURRENCIES]
          }
          onChange={(currency) => edit((a) => ({ ...a, currency }))}
        />
      </Group>
      <Group title="ON PHONES">
        <Toggle
          label="Install as an app on phones"
          checked={app.install.enabled}
          hint="Visitors can add your site to their home screen and open it like an app."
          onChange={(enabled) => install({ enabled })}
        />
        {app.install.enabled && (
          <div className="app-inline">
            <Field
              label="App name"
              maxLength={60}
              value={app.install.name}
              onChange={(name) => install({ name }, "install:name")}
            />
            <Field
              label="Short name"
              hint="Under the icon; up to 12 letters fit best."
              maxLength={20}
              value={app.install.shortName}
              onChange={(shortName) => install({ shortName }, "install:short")}
            />
          </div>
        )}
      </Group>
      {recordsUrl && (
        <Group title="RECORDS">
          <p className="data-note">
            Customers, purchases, requests and everything else visitors send are
            on your app page, where you approve, reject and add records.
          </p>
          <a className="subtle-button app-records-link" href={recordsUrl}>
            <Icon name="arrowUpRight" size={15} />
            Open app records
          </a>
        </Group>
      )}
      <Group title="REMOVE">
        {confirming ? (
          <InlineConfirm
            message={`Remove the app${sections.length ? ` and its ${sections.length} form ${sections.length === 1 ? "section" : "sections"} on ${[...new Set(sections)].join(", ")}` : ""}? Records already saved stay in your account.`}
            confirmLabel="Remove app"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              store.removeApp();
              onRemoved();
              notify("App removed.", undoAction);
            }}
          />
        ) : (
          <button
            type="button"
            className="danger-text"
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" size={13} />
            Remove app
          </button>
        )}
      </Group>
    </div>
  );
}

export function AppBuilder({
  initial,
  onClose,
  notify,
  recordsUrl,
  onShowSection,
}: {
  /** Where to start, e.g. the form a review item points at. */
  initial?: AppTarget;
  onClose: () => void;
  notify: Notify;
  /** The owner's app page for this site (cloud sites only). */
  recordsUrl?: string;
  /** Closes the builder and selects a section on the canvas. */
  onShowSection?: (id: string) => void;
}) {
  const app = useStudio((s) => s.project.app);
  const edit = useAppEdit(notify);
  const [tab, setTab] = useState<AppTab>(initial?.tab ?? "tables");
  const [tableId, setTableId] = useState<string | undefined>(
    initial?.tab === "tables" ? initial.id : undefined,
  );
  const [formId, setFormId] = useState<string | undefined>(
    initial?.tab === "forms" ? initial.id : undefined,
  );
  const [newForm, setNewForm] = useState(false);
  const table = app && (tableOf(app, tableId ?? "") ?? app.tables[0]);
  const form = app && (app.forms.find((f) => f.id === formId) ?? app.forms[0]);
  const issues = useAppIssues(app);
  const count = (t: AppTab) => issues.filter((i) => i.target.tab === t).length;
  return (
    <Modal
      title="App"
      subtitle={
        app
          ? "What you keep track of, the steps you take, and the forms visitors use."
          : "Let visitors send you things and check on them: purchases, requests, check-ins, warranties."
      }
      onClose={onClose}
      wide
    >
      {!app ? (
        <Gallery
          notify={notify}
          storeUrl={recordsUrl?.replace(/^\/apps\?/, "/commerce?")}
          onInstalled={() => {
            setTab("tables");
            setTableId(undefined);
            setFormId(undefined);
          }}
        />
      ) : (
        <div className="app-builder">
          <div className="app-builder-bar">
            <div className="segmented" role="tablist" aria-label="App">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "chosen" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {count(t.id) > 0 && (
                    <b
                      className="app-tab-count"
                      aria-label={`${count(t.id)} to fix`}
                    >
                      {count(t.id)}
                    </b>
                  )}
                </button>
              ))}
            </div>
            {recordsUrl && (
              <a className="app-records-link" href={recordsUrl}>
                Open app records
                <Icon name="arrowUpRight" size={14} />
              </a>
            )}
          </div>
          {tab === "tables" && (
            <div className="data-manager app-split">
              <nav className="data-collections" aria-label="Tables">
                {app.tables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={t.id === table?.id ? "chosen" : ""}
                    aria-current={t.id === table?.id || undefined}
                    onClick={() => setTableId(t.id)}
                  >
                    <Icon name="layers" size={15} />
                    <span>{t.name || "Untitled table"}</span>
                    <small>{t.fields.length}</small>
                  </button>
                ))}
                <button
                  type="button"
                  className="data-new"
                  disabled={app.tables.length >= MAX_TABLES}
                  onClick={() => {
                    const before = new Set(app.tables.map((t) => t.id));
                    if (edit((a) => addTable(a))) {
                      const added = useStudio
                        .getState()
                        .project.app?.tables.find((t) => !before.has(t.id));
                      setTableId(added?.id);
                    }
                  }}
                >
                  <Icon name="plus" size={15} />
                  <span>New table</span>
                </button>
              </nav>
              <div className="data-main">
                {table ? (
                  <TableEditor
                    key={table.id}
                    app={app}
                    table={table}
                    notify={notify}
                    onDeleted={() => setTableId(undefined)}
                  />
                ) : (
                  <div className="data-empty">
                    <Icon name="layers" size={26} />
                    <strong>No tables yet</strong>
                    <span>
                      A table keeps one kind of record, like customers,
                      purchases or service requests.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "forms" && (
            <div className="data-manager app-split">
              <nav className="data-collections" aria-label="Forms">
                {app.forms.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={f.id === form?.id && !newForm ? "chosen" : ""}
                    aria-current={(f.id === form?.id && !newForm) || undefined}
                    onClick={() => {
                      setFormId(f.id);
                      setNewForm(false);
                    }}
                  >
                    <Icon
                      name={f.kind === "lookup" ? "search" : "send"}
                      size={15}
                    />
                    <span>{f.name || "Untitled form"}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`data-new ${newForm ? "chosen" : ""}`}
                  disabled={app.forms.length >= MAX_FORMS || !app.tables.length}
                  onClick={() => setNewForm(true)}
                >
                  <Icon name="plus" size={15} />
                  <span>New form</span>
                </button>
              </nav>
              <div className="data-main">
                {newForm || !form ? (
                  <div className="app-new-form">
                    <h3>
                      {app.tables.length
                        ? "What should visitors do?"
                        : "Add a table first"}
                    </h3>
                    {app.tables.length > 0 && (
                      <div className="app-template-grid">
                        {(
                          [
                            {
                              kind: "submit",
                              title: "Send you something",
                              text: "A purchase to approve, a service request, a check-in or a registration.",
                            },
                            {
                              kind: "lookup",
                              title: "Look something up",
                              text: "Their reward total and history, their card, or their warranty cover.",
                            },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.kind}
                            type="button"
                            className="app-template"
                            onClick={() => {
                              const added = addForm(app, o.kind);
                              if (!added)
                                return notify(
                                  o.kind === "lookup"
                                    ? "Lookups find a record by a field where no two can be the same, like a phone number. Turn that on for a field in Tables first."
                                    : "Add a table first.",
                                );
                              if (edit(() => added.app)) {
                                setFormId(added.form.id);
                                setNewForm(false);
                              }
                            }}
                          >
                            <Icon
                              name={o.kind === "lookup" ? "search" : "send"}
                              size={18}
                            />
                            <strong>{o.title}</strong>
                            <p>{o.text}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {!app.tables.length && (
                      <p className="data-note">
                        Forms add records to a table or find them in one.
                      </p>
                    )}
                  </div>
                ) : (
                  <FormEditor
                    key={form.id}
                    app={app}
                    form={form}
                    notify={notify}
                    onDeleted={() => setFormId(undefined)}
                    onPlaced={onShowSection}
                  />
                )}
              </div>
            </div>
          )}
          {tab === "dashboard" && (
            <div className="app-pane">
              <DashboardTab app={app} notify={notify} />
            </div>
          )}
          {tab === "settings" && (
            <div className="app-pane">
              <SettingsTab
                app={app}
                notify={notify}
                recordsUrl={recordsUrl}
                onRemoved={() => setTab("tables")}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
