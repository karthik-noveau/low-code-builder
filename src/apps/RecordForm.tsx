/** The add and edit form for a record, generated from the table's fields. */
import { useId, useMemo, useState, type FormEvent } from "react";
import {
  formatMoney,
  MAX_QUANTITY,
  parseValues,
  type AppField,
  type AppLine,
  type AppRecord,
  type AppTable,
  type AppValue,
} from "./model";
import type { LinkTitles } from "./api-types";
import {
  errorField,
  errorText,
  isStale,
  linesTotal,
  type Catalog,
} from "./app-helpers";

/**
 * A form value as typed: text for inputs, a boolean for yes/no. An order
 * ("items") is "slug:2,slug:1", the form the server also accepts.
 */
type Draft = Record<string, string | boolean>;
const draftOf = (table: AppTable, record?: AppRecord): Draft =>
  Object.fromEntries(
    table.fields.map((f) => {
      const value = record?.values[f.id];
      if (f.type === "items")
        return [f.id, cartText(record?.lines?.[f.id] ?? [])];
      return [
        f.id,
        f.type === "yesNo"
          ? value === true
          : value === undefined
            ? ""
            : String(value),
      ];
    }),
  );
const cartText = (lines: { slug: string; quantity: number }[]) =>
  lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.slug}:${l.quantity}`)
    .join(",");
const cartOf = (text: string) =>
  new Map(
    text
      .split(",")
      .filter(Boolean)
      .map((part) => {
        const [slug, n] = part.split(":");
        return [slug, Number(n ?? 1) || 0] as const;
      }),
  );

const inputType: Partial<Record<AppField["type"], string>> = {
  phone: "tel",
  email: "email",
  date: "date",
};

/** One field's input. Link fields are a searchable list of the other table's records. */
export function FieldInput({
  field,
  value,
  error,
  links,
  catalog,
  lines,
  currency = "INR",
  onChange,
  autoFocus,
}: {
  field: AppField;
  value: string | boolean;
  error?: string;
  links: LinkTitles;
  /** Collections item fields choose from; undefined while loading. */
  catalog?: Catalog;
  /** The record's saved lines, so items no longer listed still have names. */
  lines?: AppLine[];
  currency?: string;
  onChange: (value: string | boolean) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [search, setSearch] = useState("");
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    "data-field": field.id,
    "data-autofocus": autoFocus ? true : undefined,
  };
  const label = (
    <label htmlFor={id} id={`${id}-label`}>
      {field.name}
      {field.required ? (
        ""
      ) : (
        <small className="app-optional"> (optional)</small>
      )}
    </label>
  );
  const message = error && (
    <small id={errorId} className="app-field-error" role="alert">
      {error}
    </small>
  );
  if (field.type === "yesNo")
    return (
      <div className="commerce-field app-field-wide">
        <label className="commerce-check">
          <input
            type="checkbox"
            {...common}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.name}
        </label>
        {message}
      </div>
    );
  const text = typeof value === "string" ? value : "";
  let control;
  if (field.type === "longText")
    control = (
      <textarea
        {...common}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  else if (field.type === "choice")
    control = (
      <select
        {...common}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {field.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  else if (field.type === "item" || field.type === "items") {
    const items = catalog?.[field.collection ?? ""];
    const price = (n: number | null) =>
      n === null ? "" : formatMoney(n, currency);
    if (!catalog)
      control = (
        <p className="commerce-muted" role="status" {...common}>
          Loading items…
        </p>
      );
    else if (!items?.length && !lines?.length)
      control = (
        <p className="commerce-muted" {...common}>
          Nothing to choose yet. Add items to the collection in the editor.
        </p>
      );
    else if (field.type === "item")
      control = (
        <select
          {...common}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {(items ?? []).map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.title}
              {i.price !== null ? ` — ${price(i.price)}` : ""}
            </option>
          ))}
        </select>
      );
    else {
      const cart = cartOf(text);
      const known = items ?? [];
      // Saved lines whose item has gone stay visible, so the owner can remove them.
      const gone = (lines ?? [])
        .filter(
          (l) => cart.has(l.slug) && !known.some((i) => i.slug === l.slug),
        )
        .map((l) => ({ slug: l.slug, title: l.title, price: l.price }));
      const q = search.trim().toLowerCase();
      const rows = [...known, ...gone].filter(
        (i) => cart.get(i.slug) || !q || i.title.toLowerCase().includes(q),
      );
      const set = (slug: string, n: number) => {
        const next = new Map(cart);
        if (n > 0) next.set(slug, Math.min(n, MAX_QUANTITY));
        else next.delete(slug);
        onChange(
          cartText([...next].map(([s, quantity]) => ({ slug: s, quantity }))),
        );
      };
      const chosen = [...known, ...gone]
        .filter((i) => cart.get(i.slug))
        .map((i) => ({
          ...i,
          price: i.price ?? 0,
          quantity: cart.get(i.slug)!,
        }));
      control = (
        <div
          className="app-cart"
          role="group"
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? errorId : undefined}
          data-field={field.id}
          tabIndex={-1}
        >
          {known.length > 8 && (
            <input
              type="search"
              aria-label={`Search ${field.name.toLowerCase()}`}
              placeholder="Type to search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <ul>
            {rows.map((i) => {
              const n = cart.get(i.slug) ?? 0;
              return (
                <li key={i.slug} className={n ? "is-chosen" : undefined}>
                  <span>
                    <strong>{i.title}</strong>
                    <small>{price(i.price)}</small>
                  </span>
                  <span className="app-stepper">
                    <button
                      type="button"
                      aria-label={`Remove one ${i.title}`}
                      disabled={!n}
                      onClick={() => set(i.slug, n - 1)}
                    >
                      −
                    </button>
                    <output aria-label={`${i.title} quantity`}>{n}</output>
                    <button
                      type="button"
                      aria-label={`Add one ${i.title}`}
                      disabled={n >= MAX_QUANTITY}
                      onClick={() => set(i.slug, n + 1)}
                    >
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="app-cart-total" aria-live="polite">
            {chosen.length
              ? `${chosen.reduce((s, l) => s + l.quantity, 0)} items · ${formatMoney(linesTotal(chosen), currency)}`
              : "Nothing added yet"}
          </p>
        </div>
      );
    }
  } else if (field.type === "link") {
    const options = Object.entries(links[field.table ?? ""] ?? {}).sort(
      (a, b) => a[1].localeCompare(b[1]),
    );
    const q = search.trim().toLowerCase();
    const shown = options
      .filter(
        ([key, title]) => key === text || !q || title.toLowerCase().includes(q),
      )
      .slice(0, 200);
    control = (
      <div className="app-link-picker">
        {options.length > 8 && (
          <input
            type="search"
            aria-label={`Search ${field.name.toLowerCase()}`}
            placeholder="Type to search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <select
          {...common}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {options.length ? "Choose…" : "Nothing to choose yet"}
          </option>
          {shown.map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </div>
    );
  } else
    control = (
      <input
        {...common}
        type={inputType[field.type] ?? "text"}
        inputMode={
          field.type === "money"
            ? "decimal"
            : field.type === "number"
              ? "numeric"
              : undefined
        }
        value={text}
        min={field.type === "date" ? undefined : field.min}
        max={field.type === "date" ? undefined : field.max}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <div
      className={`commerce-field ${field.type === "longText" || field.type === "items" ? "app-field-wide" : ""}`}
    >
      {label}
      {control}
      {message}
    </div>
  );
}

/**
 * Add or edit a record. New records skip owner-only fields (they're filled by
 * actions); editing shows every field. The values are checked here first, and
 * the server checks them again.
 */
export function RecordForm({
  table,
  record,
  links,
  catalog,
  currency,
  onSave,
  onCancel,
}: {
  table: AppTable;
  record?: AppRecord;
  links: LinkTitles;
  catalog?: Catalog;
  currency?: string;
  onSave: (values: Record<string, AppValue>) => Promise<void>;
  onCancel: () => void;
}) {
  const fields = useMemo(
    () => table.fields.filter((f) => record || !f.ownerOnly),
    [table, record],
  );
  const [draft, setDraft] = useState<Draft>(() => draftOf(table, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const focusField = (fieldId: string) =>
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-field="${CSS.escape(fieldId)}"]`)
        ?.focus(),
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const parsed = parseValues(
      table,
      fields.map((f) => f.id),
      draft,
      { catalog: (id) => catalog?.[id] },
    );
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error });
      focusField(parsed.field);
      return;
    }
    setErrors({});
    // Cleared fields are sent empty so editing can remove a value.
    const values: Record<string, AppValue> = {
      ...(record ? Object.fromEntries(fields.map((f) => [f.id, ""])) : {}),
      ...parsed.values,
    };
    // Items go as chosen (slugs and quantities); the server prices them.
    for (const f of fields)
      if ((f.type === "item" || f.type === "items") && parsed.lines[f.id])
        values[f.id] = String(draft[f.id]);
    setBusy(true);
    try {
      await onSave(values);
    } catch (error) {
      const field = errorField(error);
      const message =
        isStale(error) && record
          ? `Someone else changed this ${table.singular.toLowerCase()} while you were editing. We've loaded their changes — check your edits and save again.`
          : errorText(error, "This could not be saved. Try again.");
      if (field && fields.some((f) => f.id === field)) {
        setErrors({ [field]: message });
        focusField(field);
      } else setFormError(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="commerce-form app-record-form"
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <div className="commerce-form-grid">
        {fields.map((f, i) => (
          <FieldInput
            key={f.id}
            field={f}
            value={draft[f.id]}
            error={errors[f.id]}
            links={links}
            catalog={catalog}
            currency={currency}
            lines={record?.lines?.[f.id]}
            autoFocus={i === 0}
            onChange={(value) => {
              setDraft((d) => ({ ...d, [f.id]: value }));
              if (errors[f.id]) setErrors({});
            }}
          />
        ))}
      </div>
      {formError && (
        <p className="commerce-notice error" role="alert">
          {formError}
        </p>
      )}
      <div className="commerce-form-footer">
        <button
          type="button"
          className="commerce-button secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="commerce-button" disabled={busy}>
          {busy
            ? "Saving…"
            : record
              ? "Save changes"
              : `Add ${table.singular.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
