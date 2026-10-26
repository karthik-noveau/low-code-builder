/**
 * Taking an action on a record, e.g. Approve with a reward or Reject with a
 * reason. The owner types the values (presets only fill the field), sees them
 * read back in a sentence, and confirms. The server checks everything again.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  checkLimits,
  fieldOf,
  formatAppValue,
  formatMoney,
  parseValues,
  recordTitle,
  type App,
  type AppAction,
  type AppRecord,
  type AppTable,
  type AppValue,
} from "./model";
import type { LinkTitles } from "./api-types";
import { Icon } from "../studio/Icon";
import { FieldInput } from "./RecordForm";
import {
  errorField,
  errorText,
  isStale,
  linkTitler,
  statusName,
  useDialog,
} from "./app-helpers";

const PRESETS = [1, 2, 5, 10];
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ActionDialog({
  app,
  table,
  action,
  record,
  links,
  onRun,
  onConflict,
  onClose,
}: {
  app: App;
  table: AppTable;
  action: AppAction;
  record: AppRecord;
  links: LinkTitles;
  onRun: (values: Record<string, AppValue>, note: string) => Promise<void>;
  /** Someone else changed the record first; the page reloads it and explains. */
  onConflict: (message: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialog(ref, onClose);
  const titleId = useId();
  const noteId = useId();
  const linkTitle = linkTitler(links);
  const setFields = action.set
    .map((id) => fieldOf(table, id))
    .filter((f) => f !== undefined);
  // Every field an action sets is required for that action.
  const required: AppTable = {
    ...table,
    fields: table.fields.map((f) =>
      action.set.includes(f.id) ? { ...f, required: true } : f,
    ),
  };
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      setFields.map((f) => [f.id, f.type === "yesNo" ? false : ""]),
    ),
  );
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [review, setReview] = useState<Record<string, AppValue>>();
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Focus follows the step: the confirm button, or back to the first field.
  useEffect(() => {
    if (review) confirmRef.current?.focus();
    else
      formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [review]);
  const title = recordTitle(table, record);
  const danger = action.tone === "danger";
  const limitFor = (fieldId: string) =>
    action.limits
      .filter((l) => l.field === fieldId)
      .map((l) => {
        const most = fieldOf(table, l.atMost);
        const value = Number(record.values[l.atMost] ?? 0);
        return most && { field: most, value };
      })
      .filter((x) => !!x);
  // Who the record is about, from its first link field (e.g. the customer).
  const linkField = table.fields.find(
    (f) => f.type === "link" && record.values[f.id],
  );
  const who = linkField
    ? formatAppValue(app, linkField, record.values[linkField.id], linkTitle)
    : "";
  // Whether the visitor hears about it: the table's first email field.
  const emailField = table.fields.find((f) => f.type === "email");
  const email = emailField ? String(record.values[emailField.id] ?? "") : "";
  const tell = action.tellVisitor
    ? email
      ? `We’ll email ${email} that it’s now ${statusName(table, action.to).toLowerCase()}.`
      : "No email on this record, so they won’t be told."
    : "";

  const check = (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const parsed = parseValues(required, action.set, draft);
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error });
      return;
    }
    const limit = checkLimits(table, action, {
      ...record.values,
      ...parsed.values,
    });
    if (limit) {
      const broken = action.limits.find(
        (l) =>
          Number(parsed.values[l.field] ?? record.values[l.field] ?? 0) >
          Number(record.values[l.atMost] ?? 0),
      );
      setErrors({ [broken?.field ?? action.set[0]]: limit });
      return;
    }
    if (action.note === "required" && !note.trim()) {
      setErrors({ note: danger ? "Add a reason." : "Add a note." });
      return;
    }
    setErrors({});
    setReview(parsed.values);
  };
  const confirm = async () => {
    if (!review) return;
    setBusy(true);
    setFormError("");
    try {
      await onRun(review, note.trim());
    } catch (error) {
      if (isStale(error)) {
        onConflict(
          `Someone else changed this ${table.singular.toLowerCase()} first, so “${action.name}” wasn't done. We've loaded the latest version — check it before trying again.`,
        );
        return;
      }
      const field = errorField(error);
      setReview(undefined);
      // A full capacity names its field, which the action may not set: say it here.
      if (field && action.set.includes(field))
        setErrors({ [field]: errorText(error, "Check this value.") });
      else
        setFormError(
          errorText(error, `“${action.name}” didn't work. Try again.`),
        );
    } finally {
      setBusy(false);
    }
  };
  const readBack =
    review &&
    [
      `${action.name} “${title}”`,
      who && ` for ${who}`,
      setFields.length > 0 &&
        ` with ${setFields
          .map(
            (f) =>
              `${f.name.toLowerCase()} ${formatAppValue(app, f, review[f.id], linkTitle) || "—"}`,
          )
          .join(", ")}`,
      "?",
    ]
      .filter(Boolean)
      .join("");

  return (
    <div
      className="app-dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>
          {action.name} {table.prefix && record.ref ? record.ref : `“${title}”`}
        </h2>
        <p className="commerce-muted">
          {who ? `${who} · ` : ""}
          {table.prefix && record.ref ? title : ""}
        </p>
        {tell && (
          <p className="app-tell">
            <Icon name="mail" size={14} /> {tell}
          </p>
        )}
        {!review ? (
          <form
            ref={formRef}
            className="commerce-form"
            onSubmit={check}
            noValidate
          >
            {setFields.map((f, i) => {
              const limits = limitFor(f.id);
              return (
                <div key={f.id} className="app-action-field">
                  <FieldInput
                    field={{ ...f, required: true }}
                    value={draft[f.id]}
                    error={errors[f.id]}
                    links={links}
                    autoFocus={i === 0}
                    onChange={(value) => {
                      setDraft((d) => ({ ...d, [f.id]: value }));
                      setErrors({});
                    }}
                  />
                  {limits.map(({ field, value }) => (
                    <p key={field.id} className="commerce-hint">
                      {f.name} can't be more than the {field.name.toLowerCase()}
                      :{" "}
                      <strong>
                        {field.type === "money"
                          ? formatMoney(value, app.currency)
                          : value.toLocaleString()}
                      </strong>
                    </p>
                  ))}
                  {f.type === "money" && limits[0] && limits[0].value > 0 && (
                    <div
                      className="app-presets"
                      role="group"
                      aria-label={`Quick fill ${f.name.toLowerCase()}`}
                    >
                      <span>Quick fill:</span>
                      {PRESETS.map((p) => {
                        const amount = round2((limits[0]!.value * p) / 100);
                        return (
                          <button
                            key={p}
                            type="button"
                            disabled={amount <= 0}
                            aria-label={`Fill ${p}% (${formatMoney(amount, app.currency)})`}
                            onClick={() => {
                              setDraft((d) => ({
                                ...d,
                                [f.id]: String(amount),
                              }));
                              setErrors({});
                            }}
                          >
                            {p}%
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {action.note !== "none" && (
              <div className="commerce-field">
                <label htmlFor={noteId}>
                  {danger ? "Reason" : "Note"}
                  {action.note === "optional" && (
                    <small className="app-optional"> (optional)</small>
                  )}
                </label>
                <textarea
                  id={noteId}
                  value={note}
                  rows={3}
                  maxLength={500}
                  data-autofocus={setFields.length ? undefined : true}
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={`${noteId}-hint`}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setErrors({});
                  }}
                />
                <small
                  id={`${noteId}-hint`}
                  className={errors.note ? "app-field-error" : undefined}
                  role={errors.note ? "alert" : undefined}
                >
                  {errors.note ||
                    "The visitor sees this when they look up their record."}
                </small>
              </div>
            )}
            {formError && (
              <p className="commerce-notice error" role="alert">
                {formError}
              </p>
            )}
            <div className="commerce-form-footer">
              <button
                type="button"
                className="commerce-button secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`commerce-button ${danger ? "danger" : ""}`}
              >
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="app-readback">
            <p role="status" className="app-readback-line">
              {readBack}
            </p>
            {note.trim() && (
              <p className="commerce-muted">
                {danger ? "Reason" : "Note"}: {note.trim()}
              </p>
            )}
            {formError && (
              <p className="commerce-notice error" role="alert">
                {formError}
              </p>
            )}
            <div className="commerce-form-footer">
              <button
                type="button"
                className="commerce-button secondary"
                onClick={() => setReview(undefined)}
                disabled={busy}
              >
                Go back
              </button>
              <button
                type="button"
                className={`commerce-button ${danger ? "danger" : ""}`}
                disabled={busy}
                ref={confirmRef}
                onClick={() => void confirm()}
              >
                {busy ? "Working…" : `Yes, ${action.name.toLowerCase()}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
