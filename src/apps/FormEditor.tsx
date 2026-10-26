/** The app builder's Forms tab: what a form on the site asks or shows. */
import { useState } from "react";
import { Icon } from "../studio/Icon";
import { Field, type Notify } from "../studio/ui";
import { useStudio } from "../studio/store";
import {
  fieldOf,
  tableOf,
  REF_KEY,
  type App,
  type AppForm,
  type AppTable,
  type FormCopyKey,
} from "./model";
import { sectionAppForms } from "../blocks/project";
import {
  canPay,
  changeFormTable,
  createForm,
  linksTo,
  setIdentify,
  setLookupKey,
  setPayment,
  setVerify,
  suggestIdentify,
  uniqueFields,
  visitorFields,
} from "./edit";
import { usablePayments } from "../studio/payments";
import {
  Checks,
  Group,
  IssueList,
  Select,
  Toggle,
  PendingNote,
} from "./builderUi";
import {
  undoAction,
  useAppEdit,
  useAppIssues,
  usePending,
} from "./builderHooks";

/** What visitors can type on a lookup of `table`: a unique field, its reference, or a value that lists their records. */
function lookupKeys(table: AppTable) {
  return [
    ...uniqueFields(table).map((f) => ({
      id: f.id,
      label: f.name || "Untitled field",
    })),
    ...(table.prefix
      ? [
          {
            id: REF_KEY,
            label: `Reference number (like ${table.prefix}-1001)`,
          },
        ]
      : []),
    ...table.fields
      .filter(
        (f) =>
          !f.unique &&
          !f.ownerOnly &&
          (f.type === "phone" || f.type === "email"),
      )
      .map((f) => ({
        id: f.id,
        label: `${f.name} — lists all their ${table.name.toLowerCase()}`,
      })),
  ];
}

/** The words a form's screens use, with the defaults the site shows. */
const COPY: Record<FormCopyKey, { label: string; fallback: string }> = {
  identifyTitle: {
    label: "First step’s heading",
    fallback: "What’s your phone number?",
  },
  identifyIntro: { label: "First step’s line", fallback: "" },
  identifyNote: { label: "Small print under the button", fallback: "" },
  confirmTitle: { label: "“Is this you?” heading", fallback: "Is this you?" },
  confirmIntro: {
    label: "“Is this you?” line",
    fallback: "Confirm it’s you before you continue.",
  },
  fieldsTitle: { label: "Details step’s heading", fallback: "Your details" },
  fieldsIntro: { label: "Before their name", fallback: "Sending as" },
  fieldsNote: { label: "Note under the button", fallback: "" },
  doneTitle: { label: "After sending, heading", fallback: "Sent" },
  doneBadge: { label: "After sending, badge", fallback: "The record’s step" },
  historyTitle: { label: "History heading", fallback: "" },
  emptyTitle: { label: "No history yet, heading", fallback: "Nothing yet" },
  emptyBody: { label: "No history yet, line", fallback: "" },
  notFoundTitle: {
    label: "Unknown number, heading",
    fallback: "This number isn’t registered",
  },
  notFoundBody: {
    label: "Unknown number, line",
    fallback: "Our standard message",
  },
  pausedTitle: {
    label: "Paused account, heading",
    fallback: "This account is paused",
  },
  pausedBody: {
    label: "Paused account, line",
    fallback: "Our standard message",
  },
  offlineTitle: {
    label: "No connection, heading",
    fallback: "Can’t reach the server",
  },
  offlineBody: {
    label: "No connection, line",
    fallback: "Check your connection and try again.",
  },
};
/** Which words a form shows: step-by-step forms have every screen. */
function copyKeys(f: AppForm): FormCopyKey[] {
  const states: FormCopyKey[] = [
    "notFoundTitle",
    "notFoundBody",
    "pausedTitle",
    "pausedBody",
    "offlineTitle",
    "offlineBody",
  ];
  if (f.kind === "submit")
    return f.identify && f.steps
      ? [
          "identifyTitle",
          "identifyIntro",
          "identifyNote",
          "confirmTitle",
          "confirmIntro",
          "fieldsTitle",
          "fieldsIntro",
          "fieldsNote",
          "doneTitle",
          "doneBadge",
          ...states,
        ]
      : f.identify
        ? ["confirmTitle"]
        : [];
  return f.highlight && f.key !== REF_KEY
    ? [
        "identifyTitle",
        "identifyIntro",
        "identifyNote",
        "historyTitle",
        "emptyTitle",
        "emptyBody",
        ...states,
      ]
    : ["historyTitle", "emptyTitle"];
}

export function FormEditor({
  app,
  form,
  notify,
  onDeleted,
  onPlaced,
}: {
  app: App;
  form: AppForm;
  notify: Notify;
  onDeleted: () => void;
  /** After adding the form to a page, e.g. to close the builder and show it. */
  onPlaced?: (section: string) => void;
}) {
  const store = useStudio();
  const edit = useAppEdit(notify);
  const issues = useAppIssues(app);
  const { attempt, pending, clear } = usePending();
  const note = (at: string) => (
    <PendingNote pending={pending} at={at} onDone={clear} />
  );
  const [placeOn, setPlaceOn] = useState(store.activePage);
  const f = form;
  const table = tableOf(app, f.table);
  const update = (values: Partial<AppForm>, key?: string) =>
    edit(
      (a) => ({
        ...a,
        forms: a.forms.map((x) => (x.id === f.id ? { ...x, ...values } : x)),
      }),
      key && `form:${f.id}:${key}`,
    );
  if (!table) return null;
  const pages = store.project.pages.filter((p) =>
    p.sections.some((s) => sectionAppForms(s).includes(f.id)),
  );
  const options = (fields: { id: string; name: string }[]) =>
    fields.map((x) => ({ id: x.id, label: x.name || "Untitled field" }));
  const parent = f.identify && tableOf(app, f.identify.table);
  const identifyLinks = table.fields.filter((x) => {
    const target = x.type === "link" && tableOf(app, x.table ?? "");
    return !!target && uniqueFields(target).length > 0;
  });
  const historySources = linksTo(app, table.id).filter(
    (l) => l.table.id !== table.id || l.field.id !== f.key,
  );
  const history = f.history && tableOf(app, f.history.table);

  return (
    <div className="app-editor">
      <IssueList issues={issues.filter((i) => i.target.id === f.id)} />
      <Group title="ON YOUR SITE">
        <p className="data-note">
          {pages.length
            ? `Shown on ${pages.map((p) => p.name).join(", ")}.`
            : "Not on any page yet, so visitors can’t use it."}
        </p>
        <div className="app-place">
          <select
            aria-label="Page to add the form to"
            value={placeOn}
            onChange={(e) => setPlaceOn(e.target.value)}
          >
            {store.project.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="subtle-button"
            onClick={() => {
              const page = placeOn;
              const section = store.addAppSection(f.id, page);
              if (!section) return;
              notify(
                `${f.name} added to ${store.project.pages.find((p) => p.id === page)?.name ?? "the page"}.`,
                onPlaced
                  ? { label: "Show", run: () => onPlaced(section) }
                  : undoAction,
              );
            }}
          >
            <Icon name="plus" size={15} />
            Add to page
          </button>
        </div>
      </Group>
      <Group title="FORM">
        <div className="app-inline">
          <Field
            label="Form name"
            hint="Only you see this."
            maxLength={60}
            value={f.name}
            onChange={(name) => update({ name }, "name")}
          />
          <Select
            label="Visitors"
            value={f.kind}
            options={[
              { id: "submit", label: "Add something (a form)" },
              { id: "lookup", label: "Look something up" },
            ]}
            onChange={(v) => {
              const kind = v as AppForm["kind"];
              const next = createForm(app, kind);
              if (!next)
                return notify(
                  kind === "lookup"
                    ? "Lookups find a record by a field where no two can be the same, like a phone number, or by its reference number. Turn one of those on in Tables first."
                    : "Add a table first.",
                );
              update({
                ...next,
                id: f.id,
                name: f.name,
                ...(kind === "lookup"
                  ? { identify: undefined }
                  : { key: undefined, history: undefined }),
              });
            }}
          />
        </div>
        <Select
          label={f.kind === "submit" ? "Adds a record to" : "Finds a record in"}
          value={f.table}
          options={app.tables
            .filter((t) => f.kind === "submit" || lookupKeys(t).length)
            .map((t) => ({
              id: t.id,
              label:
                f.kind === "submit" && t.private
                  ? `${t.name} (only you can add these)`
                  : t.name,
            }))}
          onChange={(tableId) => edit((a) => changeFormTable(a, f.id, tableId))}
        />
      </Group>

      {f.kind === "submit" ? (
        <>
          <Group
            title="WHO IS SENDING"
            intro={`Visitors type something only they know, like their phone number, and confirm “Is this you?”. Each ${table.singular.toLowerCase()} is then connected to them. Unknown numbers are turned away.`}
          >
            <Toggle
              label="Visitors identify themselves first"
              checked={!!f.identify}
              disabled={!f.identify && !suggestIdentify(app, table)}
              hint={
                !f.identify && !suggestIdentify(app, table)
                  ? `${table.name} needs a “Link to another table” field pointing at a table with a field where no two can be the same (like Customers by phone).`
                  : undefined
              }
              onChange={(on) => edit((a) => setIdentify(a, f.id, on))}
            />
            {f.identify && parent && (
              <>
                <div className="app-inline">
                  <Select
                    label="Find them in"
                    value={f.identify.link}
                    options={identifyLinks.map((x) => ({
                      id: x.id,
                      label: `${tableOf(app, x.table ?? "")?.name} (${x.name})`,
                    }))}
                    onChange={(link) => {
                      const target = tableOf(
                        app,
                        fieldOf(table, link)?.table ?? "",
                      );
                      const key = target && uniqueFields(target)[0];
                      if (target && key)
                        update({
                          identify: {
                            table: target.id,
                            link,
                            field: key.id,
                            confirm: [...new Set([target.titleField, key.id])],
                          },
                          confirmTotals: undefined,
                        });
                    }}
                  />
                  <Select
                    label="They type their"
                    value={f.identify.field}
                    options={options(uniqueFields(parent))}
                    onChange={(field) =>
                      update({ identify: { ...f.identify!, field } })
                    }
                  />
                </div>
                <Checks
                  label="“Is this you?” shows"
                  options={options(parent.fields)}
                  value={f.identify.confirm}
                  onChange={(confirm) =>
                    update({ identify: { ...f.identify!, confirm } })
                  }
                />
                <small className="app-hint">
                  Phone numbers and emails are partly hidden, like •••••3210.
                </small>
                {parent.totals.length > 0 && (
                  <Checks
                    label="“Is this you?” also says"
                    options={parent.totals.map((t) => ({
                      id: t.id,
                      label: t.name || "Untitled total",
                    }))}
                    value={f.confirmTotals ?? []}
                    onChange={(confirmTotals) =>
                      update({
                        confirmTotals: confirmTotals.length
                          ? confirmTotals
                          : undefined,
                      })
                    }
                  />
                )}
                <Toggle
                  label="Show the steps (1 · 2 · 3)"
                  checked={!!f.steps}
                  hint="Each step on its own card, with screens for unknown numbers, paused accounts and no connection."
                  onChange={(on) =>
                    update({
                      steps: on
                        ? [
                            fieldOf(parent, f.identify!.field)?.name.slice(
                              0,
                              30,
                            ) || "Identify",
                            "Confirm",
                            "Details",
                          ]
                        : undefined,
                    })
                  }
                />
                {f.steps && (
                  <div className="app-inline">
                    {f.steps.map((label, n) => (
                      <Field
                        key={n}
                        label={`Step ${n + 1}`}
                        maxLength={30}
                        value={label}
                        onChange={(v) => {
                          const steps = [...f.steps!] as [
                            string,
                            string,
                            string,
                          ];
                          steps[n] = v;
                          update({ steps }, `steps:${n}`);
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </Group>
          <PaymentGroup
            app={app}
            form={f}
            table={table}
            paymentsReady={!!usablePayments(store.project.payments)}
            onChange={(field) => edit((a) => setPayment(a, f.id, field))}
          />
          <Group title="WHAT VISITORS FILL IN">
            <Checks
              label="Fields"
              options={visitorFields(table).map((x) => ({
                id: x.id,
                label: x.name || "Untitled field",
                hint: x.required ? "required" : undefined,
              }))}
              value={f.fields}
              empty={`${table.name} has no fields visitors can fill.`}
              onChange={(fields) => update({ fields })}
            />
            {table.fields.some((x) => x.ownerOnly) && (
              <small className="app-hint">
                {table.fields
                  .filter((x) => x.ownerOnly)
                  .map((x) => x.name)
                  .join(", ")}{" "}
                {table.fields.filter((x) => x.ownerOnly).length === 1
                  ? "is"
                  : "are"}{" "}
                filled by you, so{" "}
                {table.fields.filter((x) => x.ownerOnly).length === 1
                  ? "it isn’t"
                  : "they aren’t"}{" "}
                listed.
              </small>
            )}
          </Group>
        </>
      ) : (
        <>
          <Group title="WHAT VISITORS TYPE">
            <Select
              label="They find their record by"
              value={f.key ?? ""}
              options={lookupKeys(table)}
              hint={
                f.key === REF_KEY
                  ? `The reference they got after sending, like ${table.prefix}-1001. They see its steps as a timeline.`
                  : fieldOf(table, f.key ?? "")?.unique
                    ? "No two can be the same, so this finds one record."
                    : `Shows every one of their ${table.name.toLowerCase()}, newest first.${table.prefix ? "" : ` Give ${table.name} a reference prefix in Tables to track by reference number.`}`
              }
              onChange={(key) => edit((a) => setLookupKey(a, f.id, key))}
            />
            <Select
              label="Also ask for"
              value={f.verify ?? ""}
              options={[
                { id: "", label: "Nothing else" },
                ...table.fields
                  .filter(
                    (x) =>
                      x.id !== f.key &&
                      !x.ownerOnly &&
                      ["text", "phone", "email", "date", "number"].includes(
                        x.type,
                      ),
                  )
                  .map((x) => ({
                    id: x.id,
                    label: x.name || "Untitled field",
                  })),
              ]}
              hint="Both must match, so someone who guesses a reference sees nothing. A phone number works well."
              onChange={(verify) => edit((a) => setVerify(a, f.id, verify))}
            />
          </Group>
          <Group title="WHAT THEY SEE">
            <Checks
              label="Details"
              options={options(table.fields)}
              value={f.fields}
              onChange={(fields) => update({ fields })}
            />
            <Checks
              label="Totals, shown as big figures"
              options={table.totals.map((t) => ({
                id: t.id,
                label: t.name || "Untitled total",
              }))}
              value={f.totals}
              empty={`${table.name} has no totals yet. Add them in Tables.`}
              onChange={(totals) => update({ totals })}
            />
            {f.key !== REF_KEY &&
              fieldOf(table, f.key ?? "")?.unique &&
              table.totals.length > 0 && (
                <>
                  <Select
                    label="The big figure"
                    value={f.highlight ?? ""}
                    options={[
                      { id: "", label: "None: every total looks the same" },
                      ...table.totals.map((t) => ({
                        id: t.id,
                        label: t.name || "Untitled total",
                      })),
                    ]}
                    hint="Shown large in your colour, with the other totals as tiles under it and a timeline of their history."
                    onChange={(highlight) =>
                      update({ highlight: highlight || undefined })
                    }
                  />
                  {f.highlight && (
                    <Toggle
                      label={`Say when they joined (“${table.singular.toLowerCase()} since March 2025”)`}
                      checked={!!f.since}
                      onChange={(on) => update({ since: on || undefined })}
                    />
                  )}
                </>
              )}
            <Select
              label="History"
              value={f.history ? `${f.history.table}:${f.history.via}` : ""}
              options={[
                { id: "", label: "Don’t show a history" },
                ...historySources.map((s) => ({
                  id: `${s.table.id}:${s.field.id}`,
                  label: `Their ${s.table.name.toLowerCase()}`,
                })),
              ]}
              hint="Newest first, each with its step and any note you added."
              onChange={(v) => {
                if (!v) {
                  update({ history: undefined });
                  return;
                }
                const [tableId, via] = v.split(":");
                const source = tableOf(app, tableId);
                update({
                  history: {
                    table: tableId,
                    via,
                    fields: (source?.fields ?? [])
                      .filter((x) => x.id !== via && x.type !== "link")
                      .slice(0, 3)
                      .map((x) => x.id),
                  },
                });
              }}
            />
            {f.history && history && (
              <Checks
                label={`Each of their ${history.name.toLowerCase()} shows`}
                options={options(
                  history.fields.filter((x) => x.id !== f.history!.via),
                )}
                value={f.history.fields}
                onChange={(fields) =>
                  update({ history: { ...f.history!, fields } })
                }
              />
            )}
          </Group>
        </>
      )}

      <Group title="WORDING">
        <Field
          label="Title"
          maxLength={200}
          value={f.title}
          onChange={(title) => update({ title }, "title")}
        />
        <Field
          label="Introduction"
          multiline
          maxLength={600}
          value={f.intro}
          placeholder="A sentence telling visitors what this is for"
          onChange={(intro) => update({ intro }, "intro")}
        />
        <Field
          label="Button"
          maxLength={40}
          value={f.button}
          onChange={(button) => update({ button }, "button")}
        />
        {f.kind === "submit" && (
          <Field
            label="After sending, show"
            maxLength={200}
            value={f.success}
            hint={
              table.prefix
                ? `{ref} becomes the reference, like ${table.prefix}-1042.`
                : `Add a reference prefix to ${table.name} in Tables to use {ref}.`
            }
            onChange={(success) => update({ success }, "success")}
          />
        )}
      </Group>

      {copyKeys(f).length > 0 && (
        <details className="app-words">
          <summary>Words on each screen</summary>
          <p className="data-note">
            Leave a box empty to use the words shown in grey.
          </p>
          {copyKeys(f).map((k) => (
            <Field
              key={k}
              label={COPY[k].label}
              maxLength={300}
              value={f.copy?.[k] ?? ""}
              placeholder={COPY[k].fallback}
              onChange={(v) => {
                const copy = { ...f.copy };
                if (v) copy[k] = v;
                else delete copy[k];
                update(
                  { copy: Object.keys(copy).length ? copy : undefined },
                  `copy:${k}`,
                );
              }}
            />
          ))}
        </details>
      )}

      <Group title="DELETE">
        <button
          type="button"
          className="danger-text"
          onClick={() =>
            attempt(
              "form",
              "Delete form",
              {
                blocked: [],
                cleaned: [
                  pages.length
                    ? `${f.name} will be deleted and removed from ${pages.map((p) => p.name).join(", ")}.`
                    : `${f.name} will be deleted.`,
                ],
              },
              () => {
                if (
                  edit((a) => ({
                    ...a,
                    forms: a.forms.filter((x) => x.id !== f.id),
                  }))
                ) {
                  onDeleted();
                  notify(`${f.name} deleted.`, undoAction);
                }
              },
            )
          }
        >
          <Icon name="trash" size={13} />
          Delete form
        </button>
        {note("form")}
      </Group>
    </div>
  );
}

/** "Ask visitors to pay": the amount in a money or order field, after they send. */
function PaymentGroup({
  form: f,
  table,
  paymentsReady,
  onChange,
}: {
  app: App;
  form: AppForm;
  table: AppTable;
  paymentsReady: boolean;
  onChange: (field: string) => void;
}) {
  const payable = f.fields
    .map((id) => fieldOf(table, id))
    .filter((x) => !!x && canPay(x.type));
  if (!payable.length && !f.payment) return null;
  const options = [
    { id: "", label: "Don’t ask for payment" },
    ...payable.map((x) => ({
      id: x!.id,
      label:
        x!.type === "items"
          ? `The total of ${x!.name}`
          : `The amount in ${x!.name}`,
    })),
  ];
  return (
    <Group
      title="PAYMENT"
      intro="After sending, visitors see the amount and your ways to get paid: UPI, an online checkout or your bank details. You can mark it paid on your app page."
    >
      <Select
        label="Ask visitors to pay"
        value={f.payment?.field ?? ""}
        options={options}
        onChange={onChange}
        hint={
          f.payment && !paymentsReady
            ? "You haven’t set up a way to get paid yet. Add a UPI ID, payment link or bank details in Settings → Get paid, or visitors won’t see how to pay."
            : undefined
        }
      />
    </Group>
  );
}
