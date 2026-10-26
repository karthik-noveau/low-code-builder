import { useEffect, useRef, useId, type ReactNode } from "react";
import { Icon } from "./Icon";
export function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
  className = "",
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = "",
  hint,
  type = "text",
  disabled = false,
  editorField,
  highlighted = false,
  onEditCanvas,
  editingOnCanvas = false,
  maxLength,
}: {
  maxLength?: number;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  disabled?: boolean;
  editorField?: string;
  highlighted?: boolean;
  onEditCanvas?: () => void;
  editingOnCanvas?: boolean;
}) {
  const id = useId();
  return (
    <div
      className={`field ${highlighted ? "is-targeted" : ""}`}
      data-editor-field={editorField}
    >
      <div className="field-label-row">
        <label htmlFor={id}>{label}</label>
        {editingOnCanvas ? (
          <span className="field-editing-note">Editing on canvas</span>
        ) : (
          onEditCanvas &&
          value && (
            <button
              type="button"
              className="field-canvas-edit"
              aria-label={`Edit ${label.toLowerCase()} on canvas`}
              onClick={onEditCanvas}
            >
              <Icon name="edit" size={12} />
              Edit on canvas
            </button>
          )
        )}
      </div>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={editingOnCanvas}
          maxLength={maxLength}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={editingOnCanvas}
          maxLength={maxLength}
        />
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function ColorField({
  label,
  value,
  onChange,
  fallback = "#ffffff",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback?: string;
}) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return (
    <label className="color-field">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={`${label} color`}
          value={hex}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{value ? value.toUpperCase() : "Theme default"}</span>
        {value && (
          <button
            title={`Reset ${label}`}
            aria-label={`Reset ${label}`}
            onClick={(e) => {
              e.preventDefault();
              onChange("");
            }}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
    </label>
  );
}
export function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 120,
  unit = "px",
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <span>
          {value}
          <em>{unit}</em>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = dialog.current;
    if (!root?.contains(document.activeElement)) root?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const focusable = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.getClientRects().length);
        const first = focusable[0],
          last = focusable.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === root)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === root)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    root?.addEventListener("keydown", key);
    return () => {
      root?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`studio-modal ${wide ? "wide" : ""}`}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon="x" label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}
/** A button on a notification, e.g. Undo after a delete. */
export interface NotifyAction {
  label: string;
  run: () => void;
}
export type Notify = (text: string, action?: NotifyAction) => void;
/** Asks before something that can't be taken back, in place instead of a browser dialog. */
export function InlineConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="inline-confirm" role="group" aria-label={message}>
      <p>{message}</p>
      <div>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="subtle-button"
          disabled={busy}
          autoFocus
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
