/** The app builder's Tables tab: one table's names, fields, steps and totals. */
import { useState, type ReactNode } from "react";
import { Icon } from "../studio/Icon";
import { Field, IconButton, type Notify } from "../studio/ui";
import { useStudio } from "../studio/store";
import {
  APP_FIELD_TYPES,
  MAX_APP_FIELDS,
  fieldOf,
  statusOf,
  tableOf,
  type App,
  type AppAction,
  type AppCapacity,
  type AppField,
  type AppFieldType,
  type AppTable,
  type AppTotal,
  type StatusTone,
} from "./model";
import {
  actionSentence,
  addAction,
  addField,
  addStatus,
  addSteps,
  addTotal,
  addCapacity,
  canBeUnique,
  canGroup,
  capacitySentence,
  changeFieldCollection,
  changeFieldType,
  changeFieldTypeCheck,
  changeLinkTarget,
  changeLinkTargetCheck,
  hasRange,
  isCatalog,
  isNumeric,
  linksTo,
  moveField,
  numericFields,
  prefixNeededBy,
  removeCapacity,
  removeField,
  removeFieldCheck,
  removeStatus,
  removeStatusCheck,
  removeTable,
  removeTableCheck,
  removeTotal,
  removeTotalCheck,
  setOwnerOnly,
  setOwnerOnlyCheck,
  setPrefix,
  setUnique,
  totalSentence,
  uniqueNeededBy,
  updateCapacity,
  updateField,
} from "./edit";
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
import {
  blueprints,
  type Blueprint,
  type Collection,
} from "../studio/collections";

const TONES: Record<StatusTone, string> = {
  neutral: "Grey",
  waiting: "Amber — waiting",
  good: "Green — done or approved",
  bad: "Red — refused or cancelled",
};
const NOTES: Record<AppAction["note"], string> = {
  none: "Don’t ask for a note",
  optional: "Ask for a note (optional)",
  required: "Ask for a note (required)",
};
const num = (value: string) =>
  value.trim() === "" || !Number.isFinite(Number(value))
    ? undefined
    : Number(value);
/** A character limit: a whole number from 0 to 2000, or none. */
const length = (value: string) => {
  const n = num(value);
  return n === undefined
    ? undefined
    : Math.min(2000, Math.max(0, Math.round(n)));
};

export function TableEditor({
  app,
  table,
  notify,
  onDeleted,
}: {
  app: App;
  table: AppTable;
  notify: Notify;
  onDeleted: () => void;
}) {
  const edit = useAppEdit(notify);
  const { attempt, pending, clear } = usePending();
  const note = (at: string) => (
    <PendingNote pending={pending} at={at} onDone={clear} />
  );
  const [open, setOpen] = useState<string | null>(null);
  /** A field becoming "item"/"items" while the owner picks its collection. */
  const [choosing, setChoosing] = useState<{
    field: string;
    type: AppFieldType;
  } | null>(null);
  const issues = useAppIssues(app);
  const addCollection = useStudio((s) => s.addCollection);
  const collections = useStudio((s) => s.project.collections) ?? [];
  const collectionOf = (id?: string) => collections.find((c) => c.id === id);
  const t = table;
  /** Changes a field's type; "item"/"items" need a collection, so ask for one first when it's not obvious. */
  const changeType = (f: AppField, type: AppFieldType, collection?: string) => {
    const chosen =
      collection ??
      (isCatalog(type) && !f.collection && collections.length === 1
        ? collections[0].id
        : undefined);
    if (isCatalog(type) && !f.collection && !chosen) {
      clear();
      setChoosing({ field: f.id, type });
      return;
    }
    setChoosing(null);
    attempt(
      `field-${f.id}`,
      "Change type",
      changeFieldTypeCheck(app, t.id, f.id, type, chosen),
      () => {
        if (edit((a) => changeFieldType(a, t.id, f.id, type, chosen)))
          if (isCatalog(type)) setOpen(f.id);
      },
    );
  };
  const update = (fn: (t: AppTable) => AppTable, coalesce?: string) =>
    edit(
      (a) => ({
        ...a,
        tables: a.tables.map((x) => (x.id === t.id ? fn(x) : x)),
      }),
      coalesce,
    );
  const updateAction = (id: string, values: Partial<AppAction>, key?: string) =>
    update(
      (t) => ({
        ...t,
        actions: t.actions.map((a) => (a.id === id ? { ...a, ...values } : a)),
      }),
      key && `action:${id}:${key}`,
    );
  const updateTotal = (id: string, values: Partial<AppTotal>, key?: string) =>
    update(
      (t) => ({
        ...t,
        totals: t.totals.map((x) => (x.id === id ? { ...x, ...values } : x)),
      }),
      key && `total:${id}:${key}`,
    );
  const fieldOptions = (fields: AppField[]) =>
    fields.map((f) => ({ id: f.id, label: f.name || "Untitled field" }));
  const statusOptions = (tableId: string) =>
    (tableOf(app, tableId)?.statuses ?? []).map((s) => ({
      id: s.id,
      label: s.name || "Untitled step",
    }));
  const sources = linksTo(app, t.id);
  const email = t.fields.find((f) => f.type === "email");

  const fieldSettings = (f: AppField) => (
    <div className="app-field-settings">
      <Toggle
        label="Required"
        checked={f.required}
        onChange={(required) =>
          edit((a) => updateField(a, t.id, f.id, { required }))
        }
      />
      {canBeUnique(f.type) && (
        <Toggle
          label="No two can be the same"
          checked={!!f.unique}
          hint={
            f.unique && uniqueNeededBy(app, t.id, f.id).length
              ? `Needed: ${uniqueNeededBy(app, t.id, f.id).join(" ")}`
              : "Turn on for phone numbers or codes visitors type to find themselves."
          }
          disabled={!!f.unique && uniqueNeededBy(app, t.id, f.id).length > 0}
          onChange={(on) => edit((a) => setUnique(a, t.id, f.id, on))}
        />
      )}
      {hasRange(f.type) && (
        <div className="app-inline">
          <Field
            label="Lowest allowed"
            type="number"
            value={f.min === undefined ? "" : String(f.min)}
            placeholder="No limit"
            onChange={(v) =>
              edit(
                (a) => updateField(a, t.id, f.id, { min: num(v) }),
                `field:${f.id}:min`,
              )
            }
          />
          <Field
            label="Highest allowed"
            type="number"
            value={f.max === undefined ? "" : String(f.max)}
            placeholder="No limit"
            onChange={(v) =>
              edit(
                (a) => updateField(a, t.id, f.id, { max: num(v) }),
                `field:${f.id}:max`,
              )
            }
          />
        </div>
      )}
      {(f.type === "text" || f.type === "longText") && (
        <div className="app-inline">
          <Field
            label="Fewest characters"
            type="number"
            value={f.minLength === undefined ? "" : String(f.minLength)}
            placeholder="No limit"
            onChange={(v) =>
              edit(
                (a) => updateField(a, t.id, f.id, { minLength: length(v) }),
                `field:${f.id}:minLength`,
              )
            }
          />
          <Field
            label="Most characters"
            type="number"
            value={f.maxLength === undefined ? "" : String(f.maxLength)}
            placeholder="No limit"
            hint={
              f.type === "longText"
                ? "Visitors see a counter, like 0 / 500."
                : undefined
            }
            onChange={(v) =>
              edit(
                (a) => updateField(a, t.id, f.id, { maxLength: length(v) }),
                `field:${f.id}:maxLength`,
              )
            }
          />
        </div>
      )}
      {!f.ownerOnly && f.type !== "link" && f.type !== "yesNo" && (
        <>
          <Field
            label="Help under the box"
            maxLength={200}
            value={f.hint ?? ""}
            placeholder="e.g. The total on your bill, in rupees."
            onChange={(v) =>
              edit(
                (a) => updateField(a, t.id, f.id, { hint: v || undefined }),
                `field:${f.id}:hint`,
              )
            }
          />
          {!isCatalog(f.type) && f.type !== "choice" && f.type !== "date" && (
            <Field
              label="Example in the box"
              maxLength={100}
              value={f.placeholder ?? ""}
              placeholder="Shown greyed out until they type"
              onChange={(v) =>
                edit(
                  (a) =>
                    updateField(a, t.id, f.id, {
                      placeholder: v || undefined,
                    }),
                  `field:${f.id}:placeholder`,
                )
              }
            />
          )}
        </>
      )}
      {f.type === "choice" && (
        <Field
          label="Choices"
          hint="Separate choices with commas."
          value={f.options.join(", ")}
          onChange={(v) =>
            edit(
              (a) =>
                updateField(a, t.id, f.id, {
                  options: v
                    .split(",")
                    .map((o) => o.trimStart().slice(0, 200))
                    .slice(0, 60),
                }),
              `field:${f.id}:options`,
            )
          }
        />
      )}
      {isCatalog(f.type) && (
        <Select
          label="Chooses from"
          value={f.collection ?? ""}
          options={[
            ...(collectionOf(f.collection)
              ? []
              : [{ id: f.collection ?? "", label: "A deleted collection" }]),
            ...collections.map((c) => ({ id: c.id, label: c.name })),
          ]}
          hint={
            f.type === "items"
              ? "Visitors see its published items with photos and prices, add what they want and see the total. Edit the items in Data."
              : "Visitors pick one of its published items. Edit the items in Data."
          }
          onChange={(collection) =>
            edit((a) => changeFieldCollection(a, t.id, f.id, collection))
          }
        />
      )}
      {f.type === "link" && (
        <>
          <Select
            label="Points at"
            value={f.table ?? ""}
            options={app.tables.map((x) => ({ id: x.id, label: x.name }))}
            hint={`Each ${t.singular.toLowerCase()} is connected to one of these.`}
            onChange={(target) =>
              attempt(
                `link-${f.id}`,
                "Change",
                changeLinkTargetCheck(app, t.id, f.id),
                () => edit((a) => changeLinkTarget(a, t.id, f.id, target)),
              )
            }
          />
          {note(`link-${f.id}`)}
        </>
      )}
      {f.type !== "link" && (
        <Toggle
          label="Filled by you when taking a step"
          checked={!!f.ownerOnly}
          hint="Visitors never see or fill it, e.g. a reward you add when approving."
          onChange={(on) =>
            attempt(
              `owner-${f.id}`,
              "Change",
              on
                ? setOwnerOnlyCheck(app, t.id, f.id)
                : { blocked: [], cleaned: [] },
              () => edit((a) => setOwnerOnly(a, t.id, f.id, on)),
            )
          }
        />
      )}
      {note(`owner-${f.id}`)}
    </div>
  );

  return (
    <div className="app-editor">
      <IssueList issues={issues.filter((i) => i.target.id === t.id)} />
      <Group title="NAMES">
        <div className="app-inline">
          <Field
            label="Table name"
            hint="Plural, e.g. Customers"
            maxLength={60}
            value={t.name}
            onChange={(name) =>
              update((t) => ({ ...t, name }), `table:${t.id}:name`)
            }
          />
          <Field
            label="One is called"
            hint="e.g. Customer"
            maxLength={60}
            value={t.singular}
            onChange={(singular) =>
              update((t) => ({ ...t, singular }), `table:${t.id}:singular`)
            }
          />
        </div>
        <div className="app-inline">
          <Select
            label="Name each one by"
            value={t.titleField}
            options={fieldOptions(t.fields)}
            hint="Shown in lists and on your app page."
            onChange={(titleField) => update((t) => ({ ...t, titleField }))}
          />
          <Field
            label="Reference prefix"
            maxLength={8}
            placeholder="None"
            value={t.prefix}
            hint={
              t.prefix
                ? `Each new ${t.singular.toLowerCase()} gets a reference like ${t.prefix}-1001.${prefixNeededBy(app, t.id).length ? ` Needed: ${prefixNeededBy(app, t.id).join(" ")}` : ""}`
                : "Add letters like ESR to give each one a reference."
            }
            onChange={(v) => {
              if (!v.trim() && prefixNeededBy(app, t.id).length)
                return notify(
                  `${prefixNeededBy(app, t.id).join(" ")} Choose another way to look them up first.`,
                );
              edit((a) => setPrefix(a, t.id, v), `table:${t.id}:prefix`);
            }}
          />
        </div>
        <Toggle
          label="Visitors can add these"
          checked={!t.private}
          hint={
            t.private
              ? `Only you add ${t.name.toLowerCase()}, on your app page. Visitors can still look them up.`
              : `A form on your site can add ${t.name.toLowerCase()}.`
          }
          onChange={(on) =>
            update((t) => {
              const next = { ...t };
              if (on) delete next.private;
              else next.private = true;
              return next;
            })
          }
        />
        {!t.private && (
          <Toggle
            label="Tell me when a visitor adds one"
            checked={t.notify}
            hint="By email and on phones where you turned on notifications."
            onChange={(notify) => update((t) => ({ ...t, notify }))}
          />
        )}
        {t.fields.some((f) => f.type === "yesNo") && (
          <Select
            label="Pause records with"
            value={t.pausedField ?? ""}
            options={[
              { id: "", label: "Nothing (never paused)" },
              ...t.fields
                .filter((f) => f.type === "yesNo")
                .map((f) => ({ id: f.id, label: f.name })),
            ]}
            hint={`When it’s ticked, that ${t.singular.toLowerCase()} can’t use your site’s forms or look themselves up. Their history stays.`}
            onChange={(v) =>
              update((t) => {
                const next = { ...t };
                if (v) next.pausedField = v;
                else delete next.pausedField;
                return next;
              })
            }
          />
        )}
      </Group>

      <Group
        title="FIELDS"
        intro={`The details each ${t.singular.toLowerCase()} has.`}
      >
        <ul className="app-field-list">
          {t.fields.map((f, index) => (
            <li key={f.id} className={open === f.id ? "open" : ""}>
              <div className="app-field-row">
                <input
                  aria-label={`Field ${index + 1} name`}
                  value={f.name}
                  maxLength={60}
                  onChange={(e) =>
                    edit(
                      (a) =>
                        updateField(a, t.id, f.id, { name: e.target.value }),
                      `field:${f.id}:name`,
                    )
                  }
                />
                <select
                  aria-label={`${f.name || `Field ${index + 1}`} type`}
                  value={f.type}
                  onChange={(e) =>
                    changeType(f, e.target.value as AppFieldType)
                  }
                >
                  {(Object.keys(APP_FIELD_TYPES) as AppFieldType[]).map(
                    (type) => (
                      <option key={type} value={type}>
                        {APP_FIELD_TYPES[type]}
                      </option>
                    ),
                  )}
                </select>
                <span className="app-field-badges">
                  {f.required && <b>Required</b>}
                  {f.unique && <b>Unique</b>}
                  {f.ownerOnly && <b>Filled by you</b>}
                  {f.type === "link" && (
                    <b>→ {tableOf(app, f.table ?? "")?.name ?? "?"}</b>
                  )}
                  {isCatalog(f.type) && (
                    <b>→ {collectionOf(f.collection)?.name ?? "?"}</b>
                  )}
                </span>
                <IconButton
                  icon="settings"
                  label={`${f.name || "Field"} settings`}
                  active={open === f.id}
                  onClick={() => setOpen(open === f.id ? null : f.id)}
                />
                <IconButton
                  icon="up"
                  label={`Move ${f.name || "field"} up`}
                  disabled={index === 0}
                  onClick={() => edit((a) => moveField(a, t.id, f.id, -1))}
                />
                <IconButton
                  icon="down"
                  label={`Move ${f.name || "field"} down`}
                  disabled={index === t.fields.length - 1}
                  onClick={() => edit((a) => moveField(a, t.id, f.id, 1))}
                />
                <IconButton
                  icon="trash"
                  label={`Delete ${f.name || "field"}`}
                  onClick={() =>
                    attempt(
                      `field-${f.id}`,
                      "Delete field",
                      removeFieldCheck(app, t.id, f.id),
                      () => {
                        if (edit((a) => removeField(a, t.id, f.id)))
                          notify(`${f.name || "Field"} deleted.`, undoAction);
                      },
                    )
                  }
                />
              </div>
              {choosing?.field === f.id && (
                <CollectionChooser
                  type={choosing.type}
                  collections={collections}
                  onChoose={(id) => changeType(f, choosing.type, id)}
                  onCreate={(blueprint) => {
                    const id = addCollection(blueprint);
                    if (!id)
                      return notify(
                        "Your site has as many collections as it can hold.",
                      );
                    changeType(f, choosing.type, id);
                    notify(
                      `${blueprints[blueprint].name} added to your site’s Data with a few samples. Replace them with your own.`,
                    );
                  }}
                  onCancel={() => setChoosing(null)}
                />
              )}
              {note(`field-${f.id}`)}
              {open === f.id && fieldSettings(f)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="subtle-button"
          disabled={t.fields.length >= MAX_APP_FIELDS}
          onClick={() => {
            const before = new Set(t.fields.map((f) => f.id));
            edit((a) => addField(a, t.id));
            const added = currentTable(t.id)?.fields.find(
              (f) => !before.has(f.id),
            );
            if (added) setOpen(added.id);
          }}
        >
          <Icon name="plus" size={15} />
          Add field
        </button>
      </Group>

      <Group
        title="STEPS"
        intro={
          t.statuses.length
            ? `Where each ${t.singular.toLowerCase()} is, and the actions you take to move it on.`
            : `Give ${t.name.toLowerCase()} steps if you check them, e.g. Waiting → Approved or Rejected.`
        }
      >
        {!t.statuses.length ? (
          <button
            type="button"
            className="subtle-button"
            onClick={() => edit((a) => addSteps(a, t.id))}
          >
            <Icon name="plus" size={15} />
            Add steps
          </button>
        ) : (
          <>
            <ul className="app-status-list" aria-label="Steps">
              {t.statuses.map((s, index) => (
                <li key={s.id}>
                  <div className="app-status-row">
                    <i
                      className={`app-dot tone-${s.tone}`}
                      aria-hidden="true"
                    />
                    <input
                      aria-label={`Step ${index + 1} name`}
                      value={s.name}
                      maxLength={40}
                      onChange={(e) =>
                        update(
                          (t) => ({
                            ...t,
                            statuses: t.statuses.map((x) =>
                              x.id === s.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          }),
                          `status:${s.id}:name`,
                        )
                      }
                    />
                    <select
                      aria-label={`${s.name || "Step"} colour`}
                      value={s.tone}
                      onChange={(e) =>
                        update((t) => ({
                          ...t,
                          statuses: t.statuses.map((x) =>
                            x.id === s.id
                              ? { ...x, tone: e.target.value as StatusTone }
                              : x,
                          ),
                        }))
                      }
                    >
                      {(Object.keys(TONES) as StatusTone[]).map((tone) => (
                        <option key={tone} value={tone}>
                          {TONES[tone]}
                        </option>
                      ))}
                    </select>
                    <label className="app-radio">
                      <input
                        type="radio"
                        name={`initial-${t.id}`}
                        checked={t.initial === s.id}
                        onChange={() =>
                          update((t) => ({ ...t, initial: s.id }))
                        }
                      />
                      New ones start here
                    </label>
                    <IconButton
                      icon="trash"
                      label={`Delete step ${s.name}`}
                      onClick={() =>
                        attempt(
                          `status-${s.id}`,
                          "Delete step",
                          removeStatusCheck(app, t.id, s.id),
                          () => edit((a) => removeStatus(a, t.id, s.id)),
                        )
                      }
                    />
                  </div>
                  {note(`status-${s.id}`)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="subtle-button"
              disabled={t.statuses.length >= 12}
              onClick={() => edit((a) => addStatus(a, t.id))}
            >
              <Icon name="plus" size={15} />
              Add step
            </button>
            <h5 className="app-subhead">Actions you take</h5>
            <div className="app-cards">
              {t.actions.map((action) => (
                <div className="app-card" key={action.id}>
                  <p className="app-sentence">{actionSentence(t, action)}</p>
                  <div className="app-inline">
                    <Field
                      label="Action name"
                      maxLength={40}
                      value={action.name}
                      placeholder="e.g. Approve"
                      onChange={(name) =>
                        updateAction(action.id, { name }, "name")
                      }
                    />
                    <Select
                      label="Moves it to"
                      value={action.to}
                      options={statusOptions(t.id)}
                      onChange={(to) => updateAction(action.id, { to })}
                    />
                  </div>
                  <Checks
                    label="Offered when it’s"
                    options={statusOptions(t.id)}
                    value={action.from}
                    onChange={(from) => updateAction(action.id, { from })}
                  />
                  <Checks
                    label="You fill in"
                    options={fieldOptions(
                      t.fields.filter((f) => f.type !== "link"),
                    )}
                    value={action.set}
                    onChange={(set) => updateAction(action.id, { set })}
                  />
                  {numericFields(t).length > 1 && (
                    <div className="app-limits">
                      <span className="app-legend">Limits</span>
                      {action.limits.map((l, i) => (
                        <div className="app-limit" key={i}>
                          <select
                            aria-label="Value"
                            value={l.field}
                            onChange={(e) =>
                              updateAction(action.id, {
                                limits: action.limits.map((x, j) =>
                                  j === i ? { ...x, field: e.target.value } : x,
                                ),
                              })
                            }
                          >
                            {numericFields(t).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <span>can’t be more than</span>
                          <select
                            aria-label="Limit"
                            value={l.atMost}
                            onChange={(e) =>
                              updateAction(action.id, {
                                limits: action.limits.map((x, j) =>
                                  j === i
                                    ? { ...x, atMost: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          >
                            {numericFields(t).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <IconButton
                            icon="x"
                            label="Remove limit"
                            onClick={() =>
                              updateAction(action.id, {
                                limits: action.limits.filter((_, j) => j !== i),
                              })
                            }
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="app-text-button"
                        disabled={action.limits.length >= 6}
                        onClick={() => {
                          const [a, b] = numericFields(t);
                          updateAction(action.id, {
                            limits: [
                              ...action.limits,
                              {
                                field:
                                  action.set.find((x) =>
                                    isNumeric(fieldOf(t, x)?.type ?? "text"),
                                  ) ?? b.id,
                                atMost: a.id,
                              },
                            ],
                          });
                        }}
                      >
                        <Icon name="plus" size={13} />
                        Add a limit
                      </button>
                    </div>
                  )}
                  <div className="app-inline">
                    <Select
                      label="Note"
                      value={action.note}
                      options={(Object.keys(NOTES) as AppAction["note"][]).map(
                        (id) => ({ id, label: NOTES[id] }),
                      )}
                      hint="Visitors see the note when they look up their record, e.g. why it was rejected."
                      onChange={(v) =>
                        updateAction(action.id, {
                          note: v as AppAction["note"],
                        })
                      }
                    />
                    <Select
                      label="Button colour"
                      value={action.tone}
                      options={[
                        { id: "primary", label: "Normal" },
                        { id: "danger", label: "Red, for refusing" },
                      ]}
                      onChange={(v) =>
                        updateAction(action.id, {
                          tone: v as AppAction["tone"],
                        })
                      }
                    />
                  </div>
                  {(email || action.tellVisitor) && (
                    <Toggle
                      label="Email the visitor"
                      checked={!!action.tellVisitor}
                      hint={
                        email
                          ? `We email the address in ${email.name} that their ${t.singular.toLowerCase()} is now ${statusOf(t, action.to)?.name ?? "moved on"}${action.note === "none" ? "" : ", with your note"}.`
                          : `${t.name} has no email field, so nobody can be told.`
                      }
                      onChange={(tellVisitor) => {
                        const next = { ...action };
                        if (tellVisitor) next.tellVisitor = true;
                        else delete next.tellVisitor;
                        update((t) => ({
                          ...t,
                          actions: t.actions.map((a) =>
                            a.id === action.id ? next : a,
                          ),
                        }));
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      if (
                        update((t) => ({
                          ...t,
                          actions: t.actions.filter((a) => a.id !== action.id),
                        }))
                      )
                        notify(
                          `${action.name || "Action"} deleted.`,
                          undoAction,
                        );
                    }}
                  >
                    <Icon name="trash" size={13} />
                    Delete action
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="subtle-button"
              disabled={t.actions.length >= 12}
              onClick={() => edit((a) => addAction(a, t.id))}
            >
              <Icon name="plus" size={15} />
              Add action
            </button>
          </>
        )}
      </Group>

      <CapacityGroup
        app={app}
        table={t}
        collections={collections}
        edit={edit}
        attemptRemove={(c) =>
          attempt(
            `capacity-${c.id}`,
            "Delete limit",
            {
              blocked: [],
              cleaned: [
                `${t.name} will no longer run out of places for ${c.name || "this limit"}.`,
              ],
            },
            () => {
              if (edit((a) => removeCapacity(a, t.id, c.id)))
                notify(`${c.name || "Limit"} deleted.`, undoAction);
            },
          )
        }
        note={note}
      />

      <Group
        title="TOTALS"
        intro={
          sources.length
            ? `Figures added up for each ${t.singular.toLowerCase()} from records connected to it.`
            : `Totals add up records of another table that point here, e.g. a customer’s total reward from their purchases. Give another table a “${APP_FIELD_TYPES.link}” field pointing at ${t.name} first.`
        }
      >
        <div className="app-cards">
          {t.totals.map((total) => {
            const source = tableOf(app, total.table);
            return (
              <div className="app-card" key={total.id}>
                <p className="app-sentence">{totalSentence(app, total)}</p>
                <div className="app-inline">
                  <Field
                    label="Name"
                    maxLength={60}
                    value={total.name}
                    onChange={(name) => updateTotal(total.id, { name }, "name")}
                  />
                  <Select
                    label="From"
                    value={`${total.table}:${total.via}`}
                    options={sources.map((s) => ({
                      id: `${s.table.id}:${s.field.id}`,
                      label:
                        sources.filter((x) => x.table.id === s.table.id)
                          .length > 1
                          ? `${s.table.name} (by ${s.field.name})`
                          : s.table.name,
                    }))}
                    onChange={(v) => {
                      const [table, via] = v.split(":");
                      const next = tableOf(app, table);
                      const field = next && numericFields(next)[0];
                      updateTotal(total.id, {
                        table,
                        via,
                        statuses: [],
                        ...(table === total.table
                          ? {}
                          : field
                            ? {
                                field: field.id,
                                money: field.type !== "number",
                              }
                            : { op: "count", field: undefined, money: false }),
                      });
                    }}
                  />
                </div>
                <div className="app-inline">
                  <Select
                    label="Add up"
                    value={total.op === "count" ? "" : (total.field ?? "")}
                    options={[
                      {
                        id: "",
                        label: `Count ${source?.name.toLowerCase() ?? "records"}`,
                      },
                      ...(source ? numericFields(source) : []).map((f) => ({
                        id: f.id,
                        label: `Sum of ${f.name}`,
                      })),
                    ]}
                    onChange={(v) => {
                      const f = source && fieldOf(source, v);
                      updateTotal(
                        total.id,
                        f
                          ? {
                              op: "sum",
                              field: f.id,
                              money: f.type !== "number",
                            }
                          : { op: "count", field: undefined, money: false },
                      );
                    }}
                  />
                </div>
                <Checks
                  label="Only count those that are"
                  options={statusOptions(total.table)}
                  value={total.statuses}
                  empty={`${source?.name ?? "That table"} has no steps, so every one counts.`}
                  onChange={(statuses) => updateTotal(total.id, { statuses })}
                />
                <small className="app-hint">
                  Leave all unticked to count every one.
                </small>
                <button
                  type="button"
                  className="danger-text"
                  onClick={() =>
                    attempt(
                      `total-${total.id}`,
                      "Delete total",
                      removeTotalCheck(app, total.id),
                      () => {
                        if (edit((a) => removeTotal(a, total.id)))
                          notify(
                            `${total.name || "Total"} deleted.`,
                            undoAction,
                          );
                      },
                    )
                  }
                >
                  <Icon name="trash" size={13} />
                  Delete total
                </button>
                {note(`total-${total.id}`)}
              </div>
            );
          })}
        </div>
        {sources.length > 0 && (
          <button
            type="button"
            className="subtle-button"
            disabled={t.totals.length >= 12}
            onClick={() => edit((a) => addTotal(a, t.id))}
          >
            <Icon name="plus" size={15} />
            Add total
          </button>
        )}
      </Group>

      <Group title="DELETE">
        <button
          type="button"
          className="danger-text"
          onClick={() =>
            attempt(
              "table",
              "Delete table",
              {
                ...removeTableCheck(app, t.id),
                cleaned: [
                  `${t.name} and every ${t.singular.toLowerCase()} kept in it will be deleted.`,
                  ...removeTableCheck(app, t.id).cleaned,
                ],
              },
              () => {
                if (edit((a) => removeTable(a, t.id).app)) {
                  onDeleted();
                  notify(`${t.name} deleted.`, undoAction);
                }
              },
            )
          }
        >
          <Icon name="trash" size={13} />
          Delete {t.name.toLowerCase() || "this table"}
        </button>
        {note("table")}
      </Group>
    </div>
  );
}

/** The table as it is in the store right now (after an edit in the same handler). */
function currentTable(id: string) {
  const app = useStudio.getState().project.app;
  return app && tableOf(app, id);
}

/** Collections suggested when the site has none for an "item"/"items" field. */
const STARTERS: Blueprint[] = ["menu", "products", "services", "events"];
/** Asks which collection an "item"/"items" field picks from, or offers to start one. */
function CollectionChooser({
  type,
  collections,
  onChoose,
  onCreate,
  onCancel,
}: {
  type: AppFieldType;
  collections: Collection[];
  onChoose: (id: string) => void;
  onCreate: (blueprint: Blueprint) => void;
  onCancel: () => void;
}) {
  const starters = (
    <div className="app-chooser-options">
      {STARTERS.map((b) => (
        <button
          key={b}
          type="button"
          className="app-chooser-option"
          onClick={() => onCreate(b)}
        >
          <strong>New {blueprints[b].label.toLowerCase()}</strong>
          <small>{blueprints[b].description}</small>
        </button>
      ))}
    </div>
  );
  return (
    <div
      className="app-pending app-chooser"
      role="group"
      aria-label="Choose a collection"
    >
      {collections.length ? (
        <>
          <strong>
            {type === "items"
              ? "Which collection do visitors order from?"
              : "Which collection do visitors choose from?"}
          </strong>
          <div className="app-chooser-options">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                className="app-chooser-option"
                onClick={() => onChoose(c.id)}
              >
                <strong>{c.name}</strong>
                <small>
                  {c.items.filter((i) => !i.hidden).length} published{" "}
                  {c.items.filter((i) => !i.hidden).length === 1
                    ? "item"
                    : "items"}
                </small>
              </button>
            ))}
          </div>
          <details>
            <summary>Start a new collection instead</summary>
            {starters}
          </details>
        </>
      ) : (
        <>
          <strong>Your site has no collections yet</strong>
          <p>
            {type === "items"
              ? "Orders are made from a collection of things with prices, like a menu or products."
              : "Visitors choose one item of a collection, like a service, an event or a course."}{" "}
            Start one here; it comes with a few samples you can replace in Data.
          </p>
          {starters}
        </>
      )}
      <button type="button" className="subtle-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** "Places that run out": slots, seats or tables a table's records compete for. */
function CapacityGroup({
  table: t,
  collections,
  edit,
  attemptRemove,
  note,
}: {
  app: App;
  table: AppTable;
  collections: Collection[];
  edit: (fn: (app: App) => App, coalesce?: string) => boolean;
  attemptRemove: (c: AppCapacity) => void;
  note: (at: string) => ReactNode;
}) {
  const caps = t.capacity ?? [];
  const groupable = t.fields.filter((f) => canGroup(f.type));
  const numbers = t.fields.filter((f) => f.type === "number");
  const update = (
    c: AppCapacity,
    values: Partial<Omit<AppCapacity, "id">>,
    key?: string,
  ) =>
    edit(
      (a) => updateCapacity(a, t.id, c.id, values),
      key && `capacity:${c.id}:${key}`,
    );
  return (
    <Group
      title="PLACES THAT RUN OUT"
      intro={
        caps.length
          ? "Visitors are turned away when there’s no room left, and see how many places are left while they choose."
          : `For time slots, tables or seats: limit how many ${t.name.toLowerCase()} can share a date and time, or an event.`
      }
    >
      <div className="app-cards">
        {caps.map((c) => {
          const first = fieldOf(t, c.group[0]);
          const source =
            first?.type === "item"
              ? collections.find((x) => x.id === first.collection)
              : undefined;
          const counts =
            source?.fields.filter((f) => f.type === "number") ?? [];
          return (
            <div className="app-card" key={c.id}>
              <p className="app-sentence">
                {capacitySentence(
                  t,
                  c,
                  counts.find((f) => f.id === c.maxField)?.name,
                )}
              </p>
              <div className="app-inline">
                <Field
                  label="Name"
                  maxLength={60}
                  value={c.name}
                  placeholder="e.g. Tables"
                  onChange={(name) => update(c, { name }, "name")}
                />
                {first?.type === "item" ? (
                  <Select
                    label="At most"
                    value={c.maxField ?? ""}
                    options={[
                      { id: "", label: "The same number for each" },
                      ...counts.map((f) => ({
                        id: f.id,
                        label: `Each ${first.name.toLowerCase()}’s ${f.name}`,
                      })),
                    ]}
                    hint={
                      counts.length
                        ? undefined
                        : `Add a number field like Seats to ${source?.name ?? "the collection"} in Data to give each its own number.`
                    }
                    onChange={(v) => update(c, { maxField: v || undefined })}
                  />
                ) : (
                  <Field
                    label="At most"
                    type="number"
                    value={String(c.max)}
                    onChange={(v) => update(c, { max: Number(v) || 0 }, "max")}
                  />
                )}
              </div>
              <div className="app-inline">
                {first?.type === "item" && c.maxField === undefined && (
                  <Field
                    label="How many"
                    type="number"
                    value={String(c.max)}
                    onChange={(v) => update(c, { max: Number(v) || 0 }, "max")}
                  />
                )}
                <Select
                  label="Each one takes"
                  value={c.size ?? ""}
                  options={[
                    { id: "", label: "One place" },
                    ...numbers.map((f) => ({
                      id: f.id,
                      label: `The number in ${f.name}`,
                    })),
                  ]}
                  hint="e.g. a table for 4 takes 4 of the places."
                  onChange={(v) => update(c, { size: v || undefined })}
                />
              </div>
              <Checks
                label="Counted per"
                options={groupable.map((f) => ({
                  id: f.id,
                  label: f.name || "Untitled field",
                }))}
                value={c.group}
                onChange={(group) => {
                  if (group.length) update(c, { group });
                }}
              />
              {t.statuses.length > 0 && (
                <Checks
                  label="Holds a place while it’s"
                  options={t.statuses.map((s) => ({
                    id: s.id,
                    label: s.name || "Untitled step",
                  }))}
                  value={c.statuses}
                  onChange={(statuses) => update(c, { statuses })}
                />
              )}
              <Field
                label="When it’s full, visitors see"
                maxLength={200}
                value={c.message}
                onChange={(message) => update(c, { message }, "message")}
              />
              <button
                type="button"
                className="danger-text"
                onClick={() => attemptRemove(c)}
              >
                <Icon name="trash" size={13} />
                Delete limit
              </button>
              {note(`capacity-${c.id}`)}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="subtle-button"
        disabled={!groupable.length || caps.length >= 6}
        onClick={() => edit((a) => addCapacity(a, t.id))}
      >
        <Icon name="plus" size={15} />
        Add a limit
      </button>
      {!groupable.length && (
        <small className="app-hint">
          Add a date, choice or “{APP_FIELD_TYPES.item}” field to count places
          per.
        </small>
      )}
    </Group>
  );
}
