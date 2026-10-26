/** Small pieces the owner's app page shares between its sections. */
import { useState, type ReactNode } from "react";
import { Icon } from "../studio/Icon";
import { formatMoney, statusOf, type AppPayment, type AppTable } from "./model";

/** Unpaid or Paid with the amount; the title says how it was paid. */
export function PaymentBadge({ payment }: { payment: AppPayment }) {
  const paid = payment.status === "paid";
  return (
    <span
      className={`app-status app-pay ${paid ? "is-good" : "is-waiting"}`}
      title={
        paid
          ? payment.confirmedBy === "owner"
            ? "Marked paid by you"
            : "Paid online"
          : "Not paid yet"
      }
    >
      <i aria-hidden="true" />
      {paid ? "Paid" : "Unpaid"} {formatMoney(payment.amount, payment.currency)}
    </span>
  );
}

export function StatusPill({
  table,
  status,
}: {
  table: AppTable;
  status: string;
}) {
  const found = statusOf(table, status);
  if (!found) return null;
  return (
    <span className={`app-status is-${found.tone}`}>
      <i aria-hidden="true" />
      {found.name}
    </span>
  );
}

export function Empty({
  title,
  icon = "sparkles",
  children,
}: {
  title: string;
  icon?: string;
  children?: ReactNode;
}) {
  return (
    <div className="commerce-panel commerce-empty">
      <span className="commerce-empty-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** A failed load with a way to try again. */
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="commerce-notice error app-load-error" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="commerce-button secondary"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

/**
 * A button for an action that can't be undone. Pressing it shows the question
 * with a final button and a way back, in place of the button.
 */
export function ConfirmButton({
  label,
  question,
  confirm,
  disabled,
  className = "commerce-button secondary",
  tone = "danger",
  onConfirm,
}: {
  label: string;
  question: string;
  confirm: string;
  disabled?: boolean;
  className?: string;
  /** The final button's colour: red for deletes, the accent for e.g. "Mark as paid". */
  tone?: "danger" | "primary";
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  return (
    <div className="commerce-confirm" role="group" aria-label={label}>
      <span>{question}</span>
      <button
        type="button"
        className={`commerce-button ${tone === "danger" ? "danger" : ""}`}
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirm}
      </button>
      <button
        type="button"
        className="commerce-button secondary"
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
    </div>
  );
}
