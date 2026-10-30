import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { InlineConfirm, Modal } from "./ui";
import { useStudio } from "./store";
import * as cloud from "../cloud/client";
import {
  REQUEST_FIELDS,
  INBOX_KINDS,
  type InboxRequest,
  type RequestFieldId,
} from "./requests";
import { formatAmount, parseAmount, paymentStatusLabel } from "./payments";

/** The cloud site open in the editor, if any (CloudWorkspace keeps it in the URL). */
const activeSiteId = () =>
  new URLSearchParams(location.search).get("site") ?? undefined;

const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** One spreadsheet cell; a leading = + - @ is escaped so spreadsheet apps don't run it as a formula. */
const cell = (value: string) => {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function Inbox({ onClose }: { onClose: () => void }) {
  const project = useStudio((s) => s.project);
  const siteId = activeSiteId();
  const [requests, setRequests] = useState<InboxRequest[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"new" | "unpaid" | "all">("new");
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  /** What the last payment check found, per request. */
  const [checked, setChecked] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  /** Only the site's owner can send money back. */
  const [canRefund, setCanRefund] = useState(false);
  /** The request whose refund is being confirmed, and the amount typed. */
  const [refunding, setRefunding] = useState<{
    id: string;
    amount: string;
  } | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState("");
  const fetchRequests = useCallback(
    () =>
      cloud
        .request<{ requests: InboxRequest[]; canRefund?: boolean }>(
          `/sites/${siteId}/inbox`,
        )
        .then(({ requests, canRefund }) => {
          setCanRefund(!!canRefund);
          return requests;
        }),
    [siteId],
  );
  const load = async () => {
    setRefreshing(true);
    try {
      setRequests(await fetchRequests());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your inbox.");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    fetchRequests()
      .then((list) => {
        if (active) setRequests(list);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load your inbox.",
          );
      });
    return () => {
      active = false;
    };
  }, [siteId, fetchRequests]);
  const mark = async (
    r: InboxRequest,
    change:
      | { status: InboxRequest["status"] }
      | { payment: "paid" | "unpaid" }
      | { sync: true },
  ) => {
    try {
      const { request } = await cloud.request<{ request: InboxRequest }>(
        `/sites/${siteId}/inbox/${r.id}`,
        { method: "POST", body: JSON.stringify(change) },
      );
      setRequests(
        (list) => list?.map((x) => (x.id === r.id ? request : x)) ?? null,
      );
      return request;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the request.",
      );
    }
  };
  const checkPayment = async (r: InboxRequest) => {
    setChecking(r.id);
    const request = await mark(r, { sync: true });
    setChecking(null);
    if (request)
      setChecked((all) => ({
        ...all,
        [r.id]:
          request.payment?.status === "paid"
            ? "Payment confirmed"
            : "Still unpaid — the provider hasn’t confirmed it yet.",
      }));
  };
  const startRefund = (r: InboxRequest) => {
    setRefundError("");
    setRefunding({
      id: r.id,
      amount: r.payment?.amount == null ? "" : String(r.payment.amount / 100),
    });
  };
  const refund = async (r: InboxRequest & { revision?: number }) => {
    if (!siteId || !r.payment) return;
    // A refund already started keeps its amount; the server ignores a new one.
    const amount = r.payment.refund
      ? undefined
      : parseAmount(refunding?.id === r.id ? refunding.amount : "");
    if (!r.payment.refund && amount === null) {
      setRefundError("Enter an amount to refund.");
      return;
    }
    setRefundBusy(true);
    setRefundError("");
    try {
      const { request } = await cloud.request<{ request: InboxRequest }>(
        `/sites/${siteId}/inbox/${r.id}/refund`,
        {
          method: "POST",
          body: JSON.stringify({ revision: r.revision, amount }),
        },
      );
      setRequests(
        (list) => list?.map((x) => (x.id === r.id ? request : x)) ?? null,
      );
      setRefunding(null);
    } catch (e) {
      setRefundError(
        e instanceof Error ? e.message : "Could not refund the payment.",
      );
    } finally {
      setRefundBusy(false);
    }
  };
  const remove = async (r: InboxRequest) => {
    if (!siteId) return;
    setRemoving(true);
    try {
      await cloud.deleteInboxRequest(siteId, r.id);
      setRequests((list) => list?.filter((x) => x.id !== r.id) ?? null);
      setDeleting(null);
      setOpen(null);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not delete the request.",
      );
    } finally {
      setRemoving(false);
    }
  };
  const actions = (project.collections ?? []).filter((c) => c.request);
  const q = query.trim().toLowerCase();
  const shown = (requests ?? []).filter(
    (r) =>
      (filter === "all"
        ? true
        : filter === "unpaid"
          ? r.payment?.status === "unpaid"
          : r.status === "new") &&
      (!q ||
        [r.name, r.email, r.itemTitle].some((v) =>
          v.toLowerCase().includes(q),
        )),
  );
  const unread = (requests ?? []).filter((r) => r.status === "new").length;
  const unpaid = (requests ?? []).filter(
    (r) => r.payment?.status === "unpaid",
  ).length;
  const price = (r: InboxRequest) =>
    r.payment?.amount == null
      ? ""
      : formatAmount(r.payment.amount, r.payment.currency);
  const details = (r: InboxRequest) =>
    INBOX_KINDS[r.kind].fields
      .filter((f): f is RequestFieldId => !!r.fields[f])
      .map((f) => `${REQUEST_FIELDS[f].label}: ${r.fields[f]}`)
      .join("\n");
  /** The requests on screen as a spreadsheet, built in the browser. */
  const downloadCsv = async () => {
    const rows = [
      [
        "Received",
        "Type",
        "Name",
        "Email",
        "Item",
        "Details",
        "Payment",
        "Status",
      ],
      ...shown.map((r) => [
        new Date(r.createdAt).toLocaleString(),
        INBOX_KINDS[r.kind].noun,
        r.name,
        r.email,
        r.itemTitle,
        details(r),
        r.payment
          ? [
              paymentStatusLabel(r.payment),
              price(r),
              r.payment.reference,
            ]
              .filter(Boolean)
              .join(" · ")
          : "",
        r.status === "new" ? "New" : "Done",
      ]),
    ];
    const { downloadBlob } = await import("./export");
    downloadBlob(
      new Blob([rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
      `${project.name.replace(/[^\w-]+/g, "-").toLowerCase() || "site"}-inbox.csv`,
    );
  };
  return (
    <Modal
      title="Inbox"
      subtitle="Messages, signups, bookings, orders, applications and RSVPs from your published site."
      onClose={onClose}
    >
      <div className="inbox">
        {!siteId ? (
          <div className="inbox-empty">
            <Icon name="mail" size={20} />
            <strong>Publish with Forma to receive requests</strong>
            <p>
              Open My sites, save this site to your account and publish it.
              Visitor actions on item pages then send requests here, with no
              form service or app to install.
            </p>
            {!actions.length && (
              <p>
                In Data, choose a collection, open Settings and pick a Visitor
                action, e.g. bookings for services or applications for jobs.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="inbox-bar">
              <div className="segmented" role="tablist" aria-label="Show">
                {(["new", "unpaid", "all"] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    className={filter === f ? "chosen" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f === "new"
                      ? `New${unread ? ` · ${unread}` : ""}`
                      : f === "unpaid"
                        ? `Unpaid${unpaid ? ` · ${unpaid}` : ""}`
                        : "All"}
                  </button>
                ))}
              </div>
              <button
                className="subtle-button"
                disabled={refreshing}
                onClick={() => void load()}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {!!requests?.length && (
              <div className="data-toolbar">
                <label className="data-search">
                  <Icon name="search" size={14} />
                  <input
                    aria-label="Search requests"
                    placeholder="Search by name, email or item"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button
                  className="subtle-button"
                  disabled={!shown.length}
                  onClick={() => void downloadCsv()}
                >
                  <Icon name="export" size={14} />
                  Download CSV
                </button>
              </div>
            )}
            {error && (
              <p className="inbox-error" role="alert">
                {error}
              </p>
            )}
            {requests === null && !error && (
              <p className="inbox-muted">Loading…</p>
            )}
            {requests && !shown.length && (
              <div className="inbox-empty">
                <Icon name="mail" size={20} />
                <strong>
                  {q
                    ? "No requests match your search"
                    : filter === "new"
                      ? "You’re all caught up"
                      : filter === "unpaid"
                        ? "Nothing waiting for payment"
                        : "No requests yet"}
                </strong>
                <p>
                  {q
                    ? "Try a name, an email address or an item."
                    : actions.length
                      ? `Contact form messages and requests from ${actions.map((c) => c.name).join(", ")} pages appear here after you publish.`
                      : "Contact form messages and email signups appear here after you publish. For bookings or orders, open Data, choose a collection and pick a Visitor action in its Settings."}
                </p>
              </div>
            )}
            <ul className="inbox-list">
              {shown.map((r) => (
                <li key={r.id} className={r.status === "new" ? "is-new" : ""}>
                  <button
                    className="inbox-row"
                    aria-expanded={open === r.id}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    <span className="inbox-kind">
                      {INBOX_KINDS[r.kind].noun}
                    </span>
                    <span className="inbox-who">
                      <strong>{r.name || r.email}</strong>
                      <small>
                        {r.itemTitle} · {r.collectionName}
                      </small>
                    </span>
                    {r.payment && (
                      <span className={`inbox-pay is-${r.payment.status}`}>
                        {paymentStatusLabel(r.payment)}
                        {price(r) && ` · ${price(r)}`}
                      </span>
                    )}
                    <time dateTime={r.createdAt}>{when(r.createdAt)}</time>
                  </button>
                  {open === r.id && (
                    <div className="inbox-detail">
                      <dl>
                        <div>
                          <dt>Email</dt>
                          <dd>
                            <a href={`mailto:${r.email}`}>{r.email}</a>
                          </dd>
                        </div>
                        {r.payment && (
                          <div>
                            <dt>Payment</dt>
                            <dd>
                              {price(r) || "Amount not set"} · reference{" "}
                              <strong>{r.payment.reference}</strong>
                              {r.payment.status !== "unpaid" &&
                                (r.payment.confirmedBy === "provider"
                                  ? " · paid online"
                                  : " · marked paid")}
                              {r.payment.status === "unpaid" &&
                                r.payment.checkout &&
                                ` · checkout started with ${r.payment.checkout.provider === "stripe" ? "Stripe" : "Razorpay"}`}
                            </dd>
                          </div>
                        )}
                        {r.payment?.refund && (
                          <div>
                            <dt>Refund</dt>
                            <dd>{refundText(r.payment)}</dd>
                          </div>
                        )}
                        {INBOX_KINDS[r.kind].fields
                          .filter((f): f is RequestFieldId => !!r.fields[f])
                          .map((f) => (
                            <div key={f}>
                              <dt>{REQUEST_FIELDS[f].label}</dt>
                              <dd>{r.fields[f]}</dd>
                            </div>
                          ))}
                      </dl>
                      <div className="inbox-actions">
                        <a
                          className="subtle-button"
                          href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.itemTitle}`)}`}
                        >
                          <Icon name="send" size={14} />
                          Reply
                        </a>
                        {r.payment?.status === "unpaid" &&
                          r.payment.checkout && (
                            <button
                              className="subtle-button"
                              disabled={checking === r.id}
                              onClick={() => void checkPayment(r)}
                            >
                              {checking === r.id
                                ? "Checking…"
                                : "Check payment"}
                            </button>
                          )}
                        {canRefund &&
                          r.payment?.status === "paid" &&
                          r.payment.amount !== null &&
                          refunding?.id !== r.id && (
                            <button
                              className="subtle-button"
                              onClick={() => startRefund(r)}
                            >
                              <Icon name="undo" size={14} />
                              {r.payment.refund
                                ? "Finish refund"
                                : r.payment.confirmedBy === "provider" &&
                                    r.payment.checkout
                                  ? "Refund"
                                  : "Record refund"}
                            </button>
                          )}
                        {r.payment && !r.payment.refund && (
                          <button
                            className="subtle-button"
                            onClick={() =>
                              void mark(r, {
                                payment:
                                  r.payment?.status === "paid"
                                    ? "unpaid"
                                    : "paid",
                              })
                            }
                          >
                            {r.payment.status === "paid"
                              ? "Mark as unpaid"
                              : "Mark as paid"}
                          </button>
                        )}
                        <button
                          className="primary-button"
                          onClick={() =>
                            void mark(r, {
                              status: r.status === "new" ? "done" : "new",
                            })
                          }
                        >
                          {r.status === "new"
                            ? "Mark as done"
                            : "Move back to new"}
                        </button>
                        <button
                          className="danger-text"
                          onClick={() => setDeleting(r.id)}
                        >
                          <Icon name="trash" size={13} />
                          Delete
                        </button>
                      </div>
                      {checked[r.id] && (
                        <p className="inbox-note" role="status">
                          {checked[r.id]}
                        </p>
                      )}
                      {refunding?.id === r.id && r.payment && (
                        <RefundConfirm
                          request={r}
                          amount={refunding.amount}
                          busy={refundBusy}
                          error={refundError}
                          onAmount={(amount) =>
                            setRefunding({ id: r.id, amount })
                          }
                          onConfirm={() => void refund(r)}
                          onCancel={() => {
                            setRefunding(null);
                            setRefundError("");
                          }}
                        />
                      )}
                      {deleting === r.id && (
                        <InlineConfirm
                          message={`Delete this ${INBOX_KINDS[r.kind].noun.toLowerCase()} from ${r.name || r.email}? This can’t be undone.`}
                          confirmLabel={removing ? "Deleting…" : "Delete"}
                          busy={removing}
                          onConfirm={() => void remove(r)}
                          onCancel={() => setDeleting(null)}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

const providerName = (p?: "stripe" | "razorpay") =>
  p === "stripe" ? "Stripe" : "Razorpay";
/** "₹520 through Stripe · Oct 30, 4:12 PM · by you@example.com", or that it's still being made. */
function refundText(payment: NonNullable<InboxRequest["payment"]>) {
  const refund = payment.refund!;
  const amount = formatAmount(refund.amount, payment.currency);
  if (!refund.refundedAt)
    return `${amount} through ${providerName(refund.provider)} · not finished yet. Press Finish refund to check it; it never refunds twice.`;
  return [
    refund.provider
      ? `${amount} through ${providerName(refund.provider)}`
      : `${amount} · recorded, paid back by you`,
    when(refund.refundedAt),
    refund.byEmail && `by ${refund.byEmail}`,
    refund.id,
  ]
    .filter(Boolean)
    .join(" · ");
}
/** Asks before money goes back, with the amount to refund (the whole payment unless changed). */
function RefundConfirm({
  request,
  amount,
  busy,
  error,
  onAmount,
  onConfirm,
  onCancel,
}: {
  request: InboxRequest;
  amount: string;
  busy: boolean;
  error: string;
  onAmount: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const payment = request.payment!;
  const who = request.name || request.email;
  const online = payment.confirmedBy === "provider" && !!payment.checkout;
  const pending = payment.refund;
  const message = pending
    ? `Finish the ${formatAmount(pending.amount, payment.currency)} refund to ${who}? ${providerName(pending.provider)} is asked again with the same refund, so it can’t be paid twice.`
    : online
      ? `Refund ${who} through ${providerName(payment.checkout?.provider)}? The money goes back to the card or account they paid with. This can’t be undone.`
      : `Record that you paid ${who} back? Forma doesn’t move any money for payments you marked paid.`;
  return (
    <div className="inline-confirm refund-confirm" role="group" aria-label="Refund">
      <p>{message}</p>
      {!pending && (
        <label className="refund-amount">
          <span>Amount ({payment.currency || "total"})</span>
          <input
            inputMode="decimal"
            value={amount}
            disabled={busy}
            onChange={(e) => onAmount(e.target.value)}
          />
          <small>
            Paid {formatAmount(payment.amount ?? 0, payment.currency)}. Lower it
            for a partial refund.
          </small>
        </label>
      )}
      {error && (
        <p className="inbox-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy
            ? "Refunding…"
            : pending
              ? "Finish refund"
              : online
                ? "Refund"
                : "Record refund"}
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
