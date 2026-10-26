/** Small pieces shared by the app builder's tabs. Editor only. */
import { useId, type ReactNode } from "react";
import { Icon } from "../studio/Icon";
import { InlineConfirm } from "../studio/ui";
import type { Pending } from "./builderHooks";
import type { AppIssue } from "./issues";

/** Explains a pending change at `at`: why it can't be done, or what else changes. */
export function PendingNote({
  pending,
  at,
  onDone,
}: {
  pending: Pending | null;
  at: string;
  onDone: () => void;
}) {
  if (pending?.at !== at) return null;
  const { blocked, cleaned } = pending.check;
  if (blocked.length)
    return (
      <div className="app-pending is-blocked" role="alert">
        <strong>This can’t be done yet</strong>
        <ul>
          {blocked.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <button type="button" className="subtle-button" onClick={onDone}>
          OK
        </button>
      </div>
    );
  return (
    <div className="app-pending">
      <ul>
        {cleaned.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <InlineConfirm
        message="Go ahead?"
        confirmLabel={pending.label}
        onCancel={onDone}
        onConfirm={() => {
          pending.run();
          onDone();
        }}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="app-toggle">
      <label className="switch-row">
        {label}
        <button
          type="button"
          className={`switch ${checked ? "on" : ""}`}
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span />
        </button>
      </label>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** A list of checkboxes, keeping the options' order. */
export function Checks({
  label,
  options,
  value,
  onChange,
  empty = "Nothing to choose yet.",
}: {
  label: string;
  options: { id: string; label: string; hint?: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  empty?: string;
}) {
  return (
    <fieldset className="app-checks">
      <legend>{label}</legend>
      {options.length ? (
        options.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={value.includes(o.id)}
              onChange={(e) =>
                onChange(
                  options
                    .map((x) => x.id)
                    .filter((id) =>
                      id === o.id ? e.target.checked : value.includes(id),
                    ),
                )
              }
            />
            <span>{o.label}</span>
            {o.hint && <small>{o.hint}</small>}
          </label>
        ))
      ) : (
        <small>{empty}</small>
      )}
    </fieldset>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Group({
  title,
  intro,
  children,
  id,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="app-group" id={id} aria-label={title}>
      <h4>{title}</h4>
      {intro && <p className="data-note">{intro}</p>}
      {children}
    </section>
  );
}

export function IssueList({ issues }: { issues: AppIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="app-issues" aria-label="Worth fixing">
      {issues.map((i) => (
        <li key={i.id}>
          <Icon name="help" size={14} />
          <span>
            <strong>{i.title}</strong> {i.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
