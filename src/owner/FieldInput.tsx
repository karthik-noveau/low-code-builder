/** One app field as an owner form control: text, money, phone, choice, link… */
import { recordTitle, tableOf, type AppField } from "../apps/model";
import { useOwner } from "./context";
import { Field, Input, Switch } from "./ui";
import { currencySymbol } from "./view";

export type FormValue = string | boolean;

export function FieldInput({
  field,
  value,
  error,
  hint,
  onChange,
  autoFocus,
}: {
  field: AppField;
  value: FormValue | undefined;
  error?: string;
  hint?: string;
  onChange: (value: FormValue) => void;
  autoFocus?: boolean;
}) {
  const ctx = useOwner();
  const text = typeof value === "string" ? value : "";
  if (field.type === "yesNo")
    return (
      <Switch
        label={field.name}
        description={hint ?? field.hint}
        checked={value === true}
        onChange={onChange}
      />
    );
  const optional = !field.required;
  return (
    <Field
      label={field.name}
      optional={optional}
      error={error}
      hint={hint ?? field.hint}
    >
      {(props) => {
        const common = {
          ...props,
          autoFocus,
          "data-autofocus": autoFocus ? true : undefined,
          placeholder: field.placeholder,
        };
        if (field.type === "longText")
          return (
            <textarea
              {...common}
              className="ow-textarea"
              rows={3}
              maxLength={field.maxLength ?? 2000}
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          );
        if (field.type === "choice")
          return (
            <select
              {...common}
              className="ow-select"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">Choose…</option>
              {field.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          );
        if (field.type === "link") {
          const table = tableOf(ctx.model.app, field.table ?? "");
          const options = table
            ? ctx
                .records(table.id)
                .map((r) => ({ id: r.id, title: recordTitle(table, r) }))
                .sort((a, b) => a.title.localeCompare(b.title))
            : [];
          return (
            <select
              {...common}
              className="ow-select"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          );
        }
        if (field.type === "money")
          return (
            <Input
              {...common}
              inputMode="decimal"
              prefix={currencySymbol(ctx.model.app.currency)}
              placeholder={field.placeholder ?? "0"}
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          );
        if (field.type === "phone")
          return (
            <Input
              {...common}
              type="tel"
              inputMode="numeric"
              maxLength={16}
              prefix={ctx.model.app.currency === "INR" ? "+91" : undefined}
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          );
        return (
          <Input
            {...common}
            type={
              field.type === "email"
                ? "email"
                : field.type === "date"
                  ? "date"
                  : field.type === "number"
                    ? "number"
                    : "text"
            }
            inputMode={field.type === "number" ? "numeric" : undefined}
            autoComplete={field.type === "email" ? "email" : undefined}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }}
    </Field>
  );
}
