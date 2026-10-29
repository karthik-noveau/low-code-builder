/**
 * Inspector controls for form blocks (registry field kinds "form" and
 * "formField", drawn by ../editor/fields.tsx): which app form a form block
 * shows, with "New form…" on an existing or new table and the table's
 * questions to add; which field a field block asks for, with "New field…",
 * how it's drawn and whether it's required.
 *
 * The block and the app change in one commit (one undo step); syncForms
 * keeps the form's fields in line with the blocks afterwards.
 */
import { useId, useState } from "react";
import { Icon } from "../../studio/Icon";
import { Field } from "../../studio/ui";
import { useStudio } from "../../studio/store";
import { findSection, type Project } from "../../studio/model";
import {
  addField,
  addTable,
  setPrefix,
  uniqueFields,
  updateField,
  visitorFields,
} from "../../apps/edit";
import {
  appId,
  emptyApp,
  fieldOf,
  MAX_APP_FIELDS,
  MAX_FORMS,
  REF_KEY,
  tableOf,
  type App,
  type AppFieldType,
  type AppForm,
} from "../../apps/model";
import { findNode, mapNode, pathTo, type Node } from "../model";
import { Switch } from "../editor/fields";
import {
  askable,
  fieldKind,
  identityField,
  placedFields,
  stepKind,
} from "./model";
import { arrangeFields } from "./sync";
import "./settings.css";

const NEW = "__new";
const FIELD_TYPES: [AppFieldType, string][] = [
  ["text", "Short text"],
  ["longText", "Long text"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["number", "Number"],
  ["money", "Money"],
  ["date", "Date"],
  ["choice", "Choice"],
  ["yesNo", "Yes / no"],
];

/** The selected block, its section and the form block it's in (or is). */
function useSelection() {
  const { project, selected, selectedBlock } = useStudio();
  const section = findSection(project, selected);
  const root = section?.root;
  const node =
    root && selectedBlock ? findNode([root], selectedBlock) : undefined;
  const path = root && node ? pathTo([root], node.id) : [];
  const form = [...path].reverse().find((n) => n.type === "form");
  return { project, section, node, path, form };
}
/** Changes the project's app and one block together. */
function commitBoth(
  section: string,
  nodeId: string,
  app: (a: App | undefined, p: Project) => App | undefined,
  node: (n: Node, app: App | undefined) => Node,
) {
  useStudio.getState().commit((p) => {
    const nextApp = app(p.app, p);
    const map = (list: Project["pages"][number]["sections"]) =>
      list.map((s) =>
        s.id === section && s.root
          ? {
              ...s,
              root: mapNode([s.root], nodeId, (n) => node(n, nextApp))[0],
            }
          : s,
      );
    return {
      ...p,
      ...(nextApp ? { app: nextApp } : {}),
      header: map(p.header),
      footer: map(p.footer),
      pages: p.pages.map((pg) => ({ ...pg, sections: map(pg.sections) })),
    };
  });
}

/** "Contact form" → a new form on `tableId` (a submit form, or a lookup with a key). */
function makeForm(
  app: App,
  tableId: string,
  kind: AppForm["kind"],
  name: string,
) {
  let next = app;
  let table = tableOf(next, tableId)!;
  let key: string | undefined;
  if (kind === "lookup") {
    key = uniqueFields(table)[0]?.id;
    if (!key) {
      if (!table.prefix) {
        const prefix =
          table.name
            .replace(/[^a-z]/gi, "")
            .slice(0, 3)
            .toUpperCase() || "REF";
        next = setPrefix(next, table.id, prefix);
        table = tableOf(next, tableId)!;
      }
      key = REF_KEY;
    }
  }
  const title =
    name.trim() ||
    (kind === "lookup"
      ? `Find your ${table.singular.toLowerCase()}`
      : table.singular);
  const form: AppForm = {
    id: appId(),
    name: title,
    kind,
    table: table.id,
    fields:
      kind === "lookup"
        ? [table.titleField]
        : visitorFields(table).map((f) => f.id),
    totals: [],
    title,
    intro: "",
    button:
      kind === "lookup" ? (key === REF_KEY ? "Track" : "Look up") : "Send",
    success:
      kind === "lookup"
        ? ""
        : table.prefix
          ? "Thanks — we’ve received it. Your reference is {ref}."
          : "Thanks — we’ve received it.",
    ...(key ? { key } : {}),
  };
  return { app: { ...next, forms: [...next.forms, form] }, form };
}

/** The form block's "Form" setting: which app form, "New form…", its questions. */
export function FormChoice({ label }: { label: string }) {
  const id = useId();
  const { project, section, node } = useSelection();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<AppForm["kind"]>("submit");
  const [table, setTable] = useState("");
  const [name, setName] = useState("");
  const [tableName, setTableName] = useState("");
  const [newQuestion, setNewQuestion] = useState<{
    name: string;
    type: AppFieldType;
  } | null>(null);
  if (!section || !node || node.type !== "form") return null;
  const setProps = (props: Record<string, string | undefined>) =>
    useStudio.getState().updateNode(section.id, node.id, (n) => {
      const next = { ...n.props };
      for (const [k, v] of Object.entries(props))
        if (v === undefined) delete next[k];
        else next[k] = v;
      return { ...n, props: next };
    });
  // Contact and Email signup forms post to the inbox (src/blocks/forms/classic.tsx).
  if (node.props.target === "inbox")
    return (
      <div className="form-settings">
        <p className="block-hint">
          {node.props.kind === "newsletter"
            ? "An email signup: addresses arrive in your Inbox."
            : "A contact form: messages arrive in your Inbox."}{" "}
          Change the boxes’ labels and the button by selecting them.
        </p>
        <Field
          label="Send to another address (optional)"
          value={typeof node.props.action === "string" ? node.props.action : ""}
          placeholder="https://… your own form endpoint"
          onChange={(v) => setProps({ action: v })}
        />
      </div>
    );
  const app = project.app;
  const forms = app?.forms ?? [];
  const current = forms.find((f) => f.id === node.props.form);
  const currentTable = current && app ? tableOf(app, current.table) : undefined;
  const choose = (formId: string) =>
    commitBoth(
      section.id,
      node.id,
      (a) => a,
      (n) => ({
        ...n,
        props: { ...n.props, form: formId },
        // syncForms fills an empty form block with the form's blocks.
        children: [],
      }),
    );
  const tables = (app?.tables ?? []).filter(
    (t) => kind === "lookup" || !t.private,
  );
  const create = () => {
    commitBoth(
      section.id,
      node.id,
      (a, p) => {
        let next = a ?? emptyApp(p.name);
        let target = table;
        if (!target || target === NEW) {
          const plural = tableName.trim() || name.trim() || "Requests";
          next = addTable(next, plural, plural.replace(/s$/i, "") || plural);
          const made = next.tables.at(-1)!;
          target = made.id;
          next = addField(next, target, "phone", "Phone");
          next = addField(next, target, "email", "Email");
        }
        if (next.forms.length >= MAX_FORMS) return a;
        return makeForm(next, target, kind, name).app;
      },
      (n, nextApp) => {
        const made = nextApp?.forms.at(-1);
        if (
          !made ||
          made.id === n.props.form ||
          forms.some((f) => f.id === made.id)
        )
          return n;
        return { ...n, props: { ...n.props, form: made.id }, children: [] };
      },
    );
    setCreating(false);
    setName("");
    setTableName("");
  };
  const placed = currentTable ? placedFields(node, currentTable) : [];
  const unplaced =
    current?.kind === "submit" && currentTable
      ? askable(currentTable).filter((f) => !placed.includes(f.id))
      : [];
  const place = (fieldId: string) => {
    if (!currentTable) return;
    useStudio
      .getState()
      .updateNode(section.id, node.id, (n) =>
        arrangeFields(
          n,
          [...placedFields(n, currentTable), fieldId],
          currentTable,
        ),
      );
  };
  const addQuestion = () => {
    if (!newQuestion || !currentTable) return;
    const tableId = currentTable.id;
    commitBoth(
      section.id,
      node.id,
      (a) =>
        a
          ? addField(
              a,
              tableId,
              newQuestion.type,
              newQuestion.name.trim() || "New question",
            )
          : a,
      (n, nextApp) => {
        const t = nextApp && tableOf(nextApp, tableId);
        const made = t?.fields.at(-1);
        if (!t || !made || currentTable.fields.some((f) => f.id === made.id))
          return n;
        return arrangeFields(n, [...placedFields(n, t), made.id], t);
      },
    );
    setNewQuestion(null);
  };

  return (
    <div className="form-settings">
      {current && (
        <div className="field">
          <label htmlFor={`${id}-look`}>Look</label>
          <select
            id={`${id}-look`}
            value={node.props.look === "classic" ? "classic" : ""}
            onChange={(e) =>
              setProps({
                look: e.target.value === "classic" ? "classic" : undefined,
              })
            }
          >
            <option value="classic">Ready-made layout</option>
            <option value="">Your own layout (blocks)</option>
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={creating ? NEW : current ? current.id : ""}
          onChange={(e) => {
            if (e.target.value === NEW) {
              setCreating(true);
              setTable(app?.tables[0]?.id ?? NEW);
            } else {
              setCreating(false);
              if (e.target.value) choose(e.target.value);
            }
          }}
        >
          {!current && !creating && <option value="">Choose a form</option>}
          {forms.some((f) => f.kind === "submit") && (
            <optgroup label="Forms visitors fill in">
              {forms
                .filter((f) => f.kind === "submit")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </optgroup>
          )}
          {forms.some((f) => f.kind === "lookup") && (
            <optgroup label="Lookups">
              {forms
                .filter((f) => f.kind === "lookup")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </optgroup>
          )}
          <option value={NEW} disabled={forms.length >= MAX_FORMS}>
            New form…
          </option>
        </select>
      </div>
      {creating && (
        <div className="form-settings-new" role="group" aria-label="New form">
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Kind of form"
          >
            {(
              [
                ["submit", "Visitors fill it in"],
                ["lookup", "Visitors look something up"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                className={kind === value ? "chosen" : ""}
                onClick={() => setKind(value)}
              >
                {text}
              </button>
            ))}
          </div>
          <Field
            label="Form name"
            value={name}
            placeholder={
              kind === "lookup" ? "e.g. Track your order" : "e.g. Book a table"
            }
            maxLength={60}
            onChange={setName}
          />
          <div className="field">
            <label htmlFor={`${id}-table`}>Saves to</label>
            <select
              id={`${id}-table`}
              value={table || NEW}
              onChange={(e) => setTable(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={NEW}>A new table…</option>
            </select>
          </div>
          {(table === NEW || !table) && (
            <Field
              label="New table’s name"
              value={tableName}
              placeholder="e.g. Bookings"
              hint="Starts with Name, Phone and Email; add more questions after."
              maxLength={60}
              onChange={setTableName}
            />
          )}
          <div className="form-settings-actions">
            <button
              type="button"
              className="subtle-button"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={create}>
              Create form
            </button>
          </div>
        </div>
      )}
      {current && currentTable && !creating && (
        <>
          {current.kind === "submit" ? (
            <div className="form-settings-fields">
              <h4>Questions</h4>
              <p className="block-hint">
                {placed.length
                  ? `Asks ${placed.length} of the ${askable(currentTable).length} ${currentTable.name} fields. Drag them on the page to change the order.`
                  : `No questions yet. Add fields of ${currentTable.name} below.`}
              </p>
              {unplaced.length > 0 && (
                <div
                  className="form-settings-chips"
                  aria-label="Add a question"
                >
                  {unplaced.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="form-chip"
                      onClick={() => place(f.id)}
                    >
                      <Icon name="plus" size={13} />
                      {f.name}
                      <small>{fieldKind(f)}</small>
                    </button>
                  ))}
                </div>
              )}
              {newQuestion ? (
                <div
                  className="form-settings-new"
                  role="group"
                  aria-label="New question"
                >
                  <Field
                    label="Question"
                    value={newQuestion.name}
                    placeholder="e.g. Your city"
                    maxLength={60}
                    onChange={(v) =>
                      setNewQuestion({ ...newQuestion, name: v })
                    }
                  />
                  <div className="field">
                    <label htmlFor={`${id}-type`}>Answer</label>
                    <select
                      id={`${id}-type`}
                      value={newQuestion.type}
                      onChange={(e) =>
                        setNewQuestion({
                          ...newQuestion,
                          type: e.target.value as AppFieldType,
                        })
                      }
                    >
                      {FIELD_TYPES.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-settings-actions">
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => setNewQuestion(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={addQuestion}
                    >
                      Add question
                    </button>
                  </div>
                </div>
              ) : (
                currentTable.fields.length < MAX_APP_FIELDS && (
                  <button
                    type="button"
                    className="add-more"
                    onClick={() => setNewQuestion({ name: "", type: "text" })}
                  >
                    <Icon name="plus" size={14} />
                    New question…
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="block-hint">
              Visitors type{" "}
              {current.key === REF_KEY
                ? "their reference number"
                : (fieldOf(
                    currentTable,
                    current.key ?? "",
                  )?.name.toLowerCase() ?? "a value")}
              {current.verify
                ? ` and ${fieldOf(currentTable, current.verify)?.name.toLowerCase()}`
                : ""}{" "}
              to see their {currentTable.singular.toLowerCase()}.
            </p>
          )}
          <p className="block-hint">
            Who-are-you steps, payment, the thank-you message and what a lookup
            shows are set in App → Forms → {current.name}.
          </p>
        </>
      )}
    </div>
  );
}

/** A field block's "Asks for" setting, with how the field is drawn and whether it's required. */
export function FormFieldChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { project, section, node, path, form } = useSelection();
  const [adding, setAdding] = useState<{
    name: string;
    type: AppFieldType;
  } | null>(null);
  if (!section || !node || node.type !== "field") return null;
  const app = project.app;
  const bound = form && app?.forms.find((f) => f.id === form.props.form);
  const table = bound && app ? tableOf(app, bound.table) : undefined;
  if (form?.props.target === "inbox")
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={value}
          onChange={(e) =>
            useStudio.getState().updateNode(section.id, node.id, (n) => ({
              ...n,
              props: { ...n.props, field: e.target.value },
            }))
          }
        >
          <option value="name">Name</option>
          <option value="email">Email address</option>
          <option value="message">Message</option>
        </select>
      </div>
    );
  if (!form || !bound || !table || !app)
    return (
      <p className="block-hint">
        Put this field inside a form block that shows one of your app’s forms.
      </p>
    );
  const inIdentify = path.some(
    (n) => n.type === "formStep" && stepKind(n) === "identify",
  );
  if (inIdentify) {
    const who = identityField(app, bound);
    return (
      <p className="block-hint">
        Asks visitors for their {who?.name.toLowerCase() ?? "details"} to find
        who they are (set in App → Forms → {bound.name}).
      </p>
    );
  }
  const setProp = (key: string, v: string) =>
    useStudio
      .getState()
      .updateNode(
        section.id,
        node.id,
        (n) => ({ ...n, props: { ...n.props, [key]: v } }),
        `prop:${node.id}:${key}`,
      );
  const field = fieldOf(table, value);
  const placed = placedFields(form, table);
  const options =
    bound.kind === "lookup"
      ? [
          bound.key === REF_KEY
            ? { id: REF_KEY, name: "Reference number", used: false }
            : {
                id: bound.key ?? "",
                name: fieldOf(table, bound.key ?? "")?.name ?? "",
                used: false,
              },
          ...(bound.verify
            ? [
                {
                  id: bound.verify,
                  name: fieldOf(table, bound.verify)?.name ?? "",
                  used: false,
                },
              ]
            : []),
        ]
      : askable(table).map((f) => ({
          id: f.id,
          name:
            f.name.toLowerCase() === fieldKind(f).toLowerCase()
              ? f.name
              : `${f.name} · ${fieldKind(f)}`,
          used: f.id !== value && placed.includes(f.id),
        }));
  const editField = (values: Parameters<typeof updateField>[3]) =>
    field &&
    useStudio
      .getState()
      .updateApp(
        (a) => updateField(a, table.id, field.id, values),
        `field:${field.id}`,
      );
  const create = () => {
    if (!adding) return;
    commitBoth(
      section.id,
      node.id,
      (a) =>
        a
          ? addField(
              a,
              table.id,
              adding.type,
              adding.name.trim() || "New question",
            )
          : a,
      (n, nextApp) => {
        const made = nextApp && tableOf(nextApp, table.id)?.fields.at(-1);
        return made && !table.fields.some((f) => f.id === made.id)
          ? { ...n, props: { ...n.props, field: made.id } }
          : n;
      },
    );
    setAdding(null);
  };
  const display =
    typeof node.props.display === "string" ? node.props.display : "";
  return (
    <>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={adding ? NEW : field || value === REF_KEY ? value : ""}
          onChange={(e) => {
            if (e.target.value === NEW) setAdding({ name: "", type: "text" });
            else {
              setAdding(null);
              onChange(e.target.value);
            }
          }}
        >
          {!field && value !== REF_KEY && (
            <option value="">Choose a field</option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id} disabled={o.used}>
              {o.used ? `${o.name} (already asked)` : o.name}
            </option>
          ))}
          {bound.kind === "submit" && table.fields.length < MAX_APP_FIELDS && (
            <option value={NEW}>New field…</option>
          )}
        </select>
      </div>
      {adding && (
        <div className="form-settings-new" role="group" aria-label="New field">
          <Field
            label="Question"
            value={adding.name}
            placeholder="e.g. Your city"
            maxLength={60}
            onChange={(v) => setAdding({ ...adding, name: v })}
          />
          <div className="field">
            <label htmlFor={`${id}-type`}>Answer</label>
            <select
              id={`${id}-type`}
              value={adding.type}
              onChange={(e) =>
                setAdding({ ...adding, type: e.target.value as AppFieldType })
              }
            >
              {FIELD_TYPES.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-settings-actions">
            <button
              type="button"
              className="subtle-button"
              onClick={() => setAdding(null)}
            >
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={create}>
              Add field
            </button>
          </div>
        </div>
      )}
      {field && bound.kind === "submit" && (
        <>
          {field.type === "choice" && (
            <>
              <div className="field">
                <label htmlFor={`${id}-display`}>Show choices as</label>
                <select
                  id={`${id}-display`}
                  value={display || "select"}
                  onChange={(e) => setProp("display", e.target.value)}
                >
                  <option value="select">A dropdown</option>
                  <option value="radio">A list to tick</option>
                  <option value="chips">Buttons (chips)</option>
                </select>
              </div>
              <Field
                label="Choices"
                multiline
                hint="One per line. Changes the field everywhere it’s used."
                value={field.options.join("\n")}
                onChange={(text) =>
                  editField({
                    options: text
                      .split("\n")
                      .map((o) => o.slice(0, 200))
                      .slice(0, 60),
                  })
                }
              />
            </>
          )}
          {field.type === "yesNo" && (
            <div className="field">
              <label htmlFor={`${id}-display`}>Show as</label>
              <select
                id={`${id}-display`}
                value={display || "checkbox"}
                onChange={(e) => setProp("display", e.target.value)}
              >
                <option value="checkbox">A checkbox</option>
                <option value="switch">A switch</option>
              </select>
            </div>
          )}
          {field.type === "phone" && app.currency === "INR" && (
            <div className="field">
              <label htmlFor={`${id}-display`}>Numbers</label>
              <select
                id={`${id}-display`}
                value={display || "mobile"}
                onChange={(e) => setProp("display", e.target.value)}
              >
                <option value="mobile">Indian mobile (+91, 10 digits)</option>
                <option value="any">Any phone number</option>
              </select>
            </div>
          )}
          {field.type !== "yesNo" && (
            <Switch
              label="Required"
              checked={field.required}
              hint="Visitors must fill it in. Applies wherever this field is asked."
              onChange={(on) => editField({ required: on })}
            />
          )}
        </>
      )}
    </>
  );
}
