/**
 * One record in a side panel: its values, totals and status, what's happened
 * to it, the records of other tables that point at it (e.g. a customer's
 * purchases), and the actions, edit and delete the owner can take.
 */
import { useId, useRef, useState } from "react";
import { Icon } from "../studio/Icon";
import {
  formatMoney,
  recordTitle,
  statusOf,
  type App,
  type AppAction,
  type AppRecord,
  type AppTable,
  type AppValue,
} from "./model";
import type { LinkTitles, RecordList } from "./api-types";
import { ConfirmButton, PaymentBadge, StatusPill } from "./AppUi";
import {
  childLinks,
  errorText,
  isConflict,
  linesTotal,
  linkTitler,
  recordSummary,
  showTotal,
  showValue,
  useDialog,
  when,
  type Catalog,
} from "./app-helpers";
import { RecordForm } from "./RecordForm";
import { ActionDialog } from "./ActionDialog";

export function RecordDrawer({
  app,
  table,
  record,
  links,
  lists,
  catalog,
  me,
  onSave,
  onMarkPaid,
  onDelete,
  onAction,
  onConflict,
  onOpen,
  onClose,
}: {
  app: App;
  table: AppTable;
  record: AppRecord;
  links: LinkTitles;
  /** Loaded tables, for the linked records; missing ones show as loading. */
  lists: Record<string, RecordList | undefined>;
  /** Collections for item fields in the edit form; undefined while loading. */
  catalog?: Catalog;
  /** The signed-in owner's id and email; their history entries say "You". */
  me?: string[];
  onSave: (values: Record<string, AppValue>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Marks the record's payment paid; rejects with 409 when it changed first. */
  onMarkPaid: () => Promise<void>;
  onAction: (
    action: AppAction,
    values: Record<string, AppValue>,
    note: string,
  ) => Promise<void>;
  /** The record changed elsewhere: reload it and explain why. */
  onConflict: (message: string) => void;
  onOpen: (tableId: string, recordId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [acting, setActing] = useState<AppAction>();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const onKeyDown = useDialog(ref, () =>
    editing ? setEditing(false) : onClose(),
  );
  const titleId = useId();
  const linkTitle = linkTitler(links);
  const title = recordTitle(table, record);
  const actions = table.actions.filter((a) => a.from.includes(record.status));
  const children = childLinks(app, table);
  const actionName = (id: string) =>
    table.actions.find((a) => a.id === id)?.name ??
    (
      {
        created: "Added",
        create: "Added",
        edited: "Edited",
        edit: "Edited",
        updated: "Edited",
      } as Record<string, string>
    )[id] ??
    id.charAt(0).toUpperCase() + id.slice(1);
  const byName = (by: string) =>
    me?.includes(by)
      ? "You"
      : by === "visitor"
        ? "Visitor"
        : by === "owner"
          ? "Owner"
          : by;
  const remove = async () => {
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (e) {
      setError(
        errorText(
          e,
          `This ${table.singular.toLowerCase()} could not be deleted.`,
        ),
      );
    } finally {
      setDeleting(false);
    }
  };

  const markPaid = async () => {
    setPaying(true);
    setError("");
    try {
      await onMarkPaid();
    } catch (e) {
      if (isConflict(e)) {
        const message = `Someone else changed this ${table.singular.toLowerCase()} first, so it wasn't marked paid. We've loaded the latest version — check it before trying again.`;
        setError(message);
        onConflict(message);
      } else setError(errorText(e, "The payment could not be marked paid."));
    } finally {
      setPaying(false);
    }
  };
  const orders = table.fields.filter(
    (f) => f.type === "items" && record.lines?.[f.id]?.length,
  );
  const payment = record.payment;

  return (
    <div
      className="app-drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        ref={ref}
        className="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="app-drawer-head">
          <div>
            <span className="app-drawer-kicker">
              {table.singular}
              {record.ref && ` · ${record.ref}`}
            </span>
            <h2 id={titleId}>
              {editing ? `Edit ${table.singular.toLowerCase()}` : title}
            </h2>
            {!editing && (
              <div className="app-drawer-pills">
                <StatusPill table={table} status={record.status} />
                {payment && <PaymentBadge payment={payment} />}
              </div>
            )}
          </div>
          <button
            type="button"
            className="app-icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="app-drawer-body" inert={acting ? true : undefined}>
          {editing ? (
            <RecordForm
              table={table}
              record={record}
              links={links}
              catalog={catalog}
              currency={app.currency}
              onCancel={() => setEditing(false)}
              onSave={async (values) => {
                await onSave(values);
                setEditing(false);
              }}
            />
          ) : (
            <>
              {error && (
                <div className="commerce-notice error" role="alert">
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setError("")}
                  >
                    ×
                  </button>
                  {error}
                </div>
              )}
              {record.note && (
                <p className="app-record-note">
                  <strong>Note:</strong> {record.note}
                </p>
              )}
              {actions.length > 0 && (
                <div
                  className="app-drawer-actions"
                  role="group"
                  aria-label="Actions"
                >
                  {actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`commerce-button ${a.tone === "danger" ? "danger" : ""}`}
                      onClick={() => setActing(a)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
              {table.totals.length > 0 && (
                <div className="app-drawer-totals">
                  {table.totals.map((t) => (
                    <div key={t.id}>
                      <span>{t.name}</span>
                      <strong>
                        {showTotal(app, t, record.totals?.[t.id])}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              {orders.map((f) => {
                const lines = record.lines![f.id];
                return (
                  <section
                    key={f.id}
                    className="app-drawer-section app-order"
                    aria-label={f.name}
                  >
                    <h3>{f.name}</h3>
                    <div className="commerce-scroll">
                      <table className="commerce-table app-order-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th className="app-num">Qty</th>
                            <th className="app-num">Price</th>
                            <th className="app-num">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((l) => (
                            <tr key={l.slug}>
                              <td>{l.title}</td>
                              <td className="app-num">{l.quantity}</td>
                              <td className="app-num">
                                {formatMoney(l.price, app.currency)}
                              </td>
                              <td className="app-num">
                                {formatMoney(linesTotal([l]), app.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={3}>Subtotal</th>
                            <td className="app-num">
                              <strong>
                                {formatMoney(
                                  Number(
                                    record.values[f.id] ?? linesTotal(lines),
                                  ),
                                  app.currency,
                                )}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                );
              })}
              {payment && (
                <section
                  className={`app-payment is-${payment.status}`}
                  aria-label="Payment"
                >
                  <div>
                    <span>Payment</span>
                    <strong>
                      {formatMoney(payment.amount, payment.currency)}{" "}
                      {payment.status === "paid" ? "paid" : "not paid yet"}
                    </strong>
                    <small>
                      {[
                        payment.status === "paid"
                          ? payment.confirmedBy === "owner"
                            ? "Marked paid by you"
                            : "Paid online"
                          : payment.checkout
                            ? "Online checkout started, not finished"
                            : "Waiting for cash, UPI or bank transfer",
                        payment.paidAt && when(payment.paidAt, true),
                        payment.reference && `Reference ${payment.reference}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  {payment.status !== "paid" && (
                    <ConfirmButton
                      label="Mark as paid"
                      question={`Mark ${formatMoney(payment.amount, payment.currency)} as received?`}
                      confirm="Yes, mark paid"
                      tone="primary"
                      disabled={paying}
                      onConfirm={() => void markPaid()}
                    />
                  )}
                </section>
              )}
              <section aria-label="Details">
                <dl className="app-values">
                  {table.fields
                    .filter((f) => !orders.includes(f))
                    .map((f) => {
                      const value = showValue(app, f, record, linkTitle);
                      const target =
                        f.type === "link" && f.table && record.values[f.id];
                      return (
                        <div key={f.id}>
                          <dt>{f.name}</dt>
                          <dd>
                            {!value ? (
                              <span className="commerce-muted">—</span>
                            ) : target ? (
                              <button
                                type="button"
                                className="commerce-link"
                                onClick={() => onOpen(f.table!, String(target))}
                              >
                                {value}
                              </button>
                            ) : f.type === "phone" ? (
                              <a href={`tel:${value}`}>{value}</a>
                            ) : f.type === "email" ? (
                              <a href={`mailto:${value}`}>{value}</a>
                            ) : (
                              value
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  <div>
                    <dt>Added</dt>
                    <dd>
                      {when(record.createdAt, true)}
                      {record.source === "visitor" ? " · from the website" : ""}
                    </dd>
                  </div>
                </dl>
              </section>
              {children.map(({ table: child, field }) => {
                const list = lists[child.id];
                const rows =
                  list?.records.filter(
                    (r) => r.values[field.id] === record.id,
                  ) ?? [];
                return (
                  <section
                    key={`${child.id}-${field.id}`}
                    className="app-drawer-section"
                  >
                    <h3>
                      {child.name}
                      {list && <small> {rows.length}</small>}
                    </h3>
                    {!list ? (
                      <p className="commerce-muted" role="status">
                        Loading {child.name.toLowerCase()}…
                      </p>
                    ) : !rows.length ? (
                      <p className="commerce-muted">
                        No {child.name.toLowerCase()} yet.
                      </p>
                    ) : (
                      <ul className="app-mini-list">
                        {rows.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => onOpen(child.id, r.id)}
                            >
                              <span className="app-mini-title">
                                <strong>{recordTitle(child, r)}</strong>
                                <small>
                                  {[
                                    r.ref,
                                    recordSummary(
                                      app,
                                      {
                                        ...child,
                                        fields: child.fields.filter(
                                          (x) => x.id !== field.id,
                                        ),
                                      },
                                      r,
                                      linkTitle,
                                      3,
                                    ),
                                    when(r.createdAt),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              </span>
                              {child.totals.slice(0, 2).map((t) => (
                                <span key={t.id} className="app-mini-total">
                                  {t.name}:{" "}
                                  {showTotal(app, t, r.totals?.[t.id])}
                                </span>
                              ))}
                              <StatusPill table={child} status={r.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
              {record.history.length > 0 && (
                <section className="app-drawer-section">
                  <h3>History</h3>
                  <ol className="app-timeline">
                    {[...record.history].reverse().map((h, i) => (
                      <li key={`${h.at}-${i}`}>
                        <strong>{actionName(h.action)}</strong>
                        {statusOf(table, h.status) && (
                          <span className="commerce-muted">
                            {" "}
                            → {statusOf(table, h.status)!.name}
                          </span>
                        )}
                        <small>
                          {byName(h.by)} · {when(h.at, true)}
                        </small>
                        {h.note && <p>“{h.note}”</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              <div className="app-drawer-footer">
                <button
                  type="button"
                  className="commerce-button secondary"
                  onClick={() => setEditing(true)}
                >
                  <Icon name="edit" size={15} /> Edit
                </button>
                <ConfirmButton
                  label={`Delete ${table.singular.toLowerCase()}`}
                  question={`Delete “${title}” for good? This can't be undone.`}
                  confirm="Delete"
                  disabled={deleting}
                  onConfirm={() => void remove()}
                />
              </div>
            </>
          )}
        </div>
        {acting && (
          <ActionDialog
            app={app}
            table={table}
            action={acting}
            record={record}
            links={links}
            onClose={() => setActing(undefined)}
            onConflict={(message) => {
              setActing(undefined);
              setError(message);
              onConflict(message);
            }}
            onRun={async (values, note) => {
              await onAction(acting, values, note);
              setActing(undefined);
            }}
          />
        )}
      </aside>
    </div>
  );
}
