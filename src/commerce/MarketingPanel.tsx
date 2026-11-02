import { useCallback, useEffect, useState } from "react";
import { Icon } from "../studio/Icon";
import { commerceRequest } from "./client";
import {
  money,
  type Campaign,
  type CampaignAudience,
  type CampaignDesign,
  type CommerceOverview,
  type Order,
} from "./types";

const AUDIENCES: [CampaignAudience, string, string][] = [
  ["subscribers", "All subscribers", "Everyone who opted in to your emails."],
  [
    "customers",
    "Subscribed customers",
    "Subscribers who have bought from you.",
  ],
  [
    "prospects",
    "Subscribers who haven’t bought",
    "Turn interest into a first order.",
  ],
  [
    "lapsed",
    "Customers who haven’t been back",
    "Subscribers whose last order was over 90 days ago.",
  ],
];
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Store → Marketing: email campaigns to subscribers (sent through the
 * store's outbox, tagged for Insights) and reminders for checkouts that ran
 * out unpaid (backend/marketing.ts).
 */
export function MarketingPanel({
  siteId,
  data,
  canManage,
  onChanged,
}: {
  siteId: string;
  data: CommerceOverview;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<CampaignAudience>("subscribers");
  const [discountCode, setDiscountCode] = useState("");
  const [testing, setTesting] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const [look, setLook] = useState<CampaignDesign>({
    heading: "",
    image: "",
    buttonLabel: "",
    buttonUrl: "",
    accent: "#1c1c1c",
  });
  const [preview, setPreview] = useState<{
    body: string;
    html: string;
    count: number;
  }>();
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ queued: number; total: number }>();
  const [history, setHistory] = useState<Campaign[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const input = {
    subject,
    body,
    name: name || subject,
    audience,
    discountCode,
    subjectB: testing ? subjectB : "",
    design: look,
  };
  const ready = subject.trim() && body.trim() && (!testing || subjectB.trim());
  const setLookPart = (part: Partial<CampaignDesign>) =>
    setLook((l) => ({ ...l, ...part }));
  const live = data.hosting.mail;

  const loadHistory = useCallback(async () => {
    const result = await commerceRequest<{ campaigns: Campaign[] }>(
      siteId,
      "campaigns",
      { mode: "list" },
    );
    setHistory(result.campaigns);
  }, [siteId]);
  useEffect(() => {
    if (canManage) void loadHistory().catch(() => {});
  }, [canManage, loadHistory]);
  // A fresh preview whenever the message or audience changes.
  useEffect(() => {
    if (!canManage || !ready) {
      setPreview(undefined);
      return;
    }
    const timer = setTimeout(() => {
      commerceRequest<{ body: string; html: string; count: number }>(
        siteId,
        "campaigns",
        {
          mode: "preview",
          ...input,
        },
      )
        .then((r) => {
          setPreview(r);
          setError("");
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Preview failed."),
        );
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    siteId,
    subject,
    body,
    name,
    audience,
    discountCode,
    canManage,
    testing,
    subjectB,
    look,
  ]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const sendTest = () =>
    run(async () => {
      const r = await commerceRequest<{ sentTo: string }>(siteId, "campaigns", {
        mode: "test",
        ...input,
      });
      setNotice(
        live
          ? `A test is on its way to ${r.sentTo}.`
          : `Test saved to your Inbox’s email previews (${r.sentTo}). Emails send once Skynoveau has an email sender.`,
      );
      await onChanged();
    });
  const send = () =>
    run(async () => {
      setConfirming(false);
      let result = await commerceRequest<{ campaign: Campaign; done: boolean }>(
        siteId,
        "campaigns",
        {
          mode: "send",
          ...input,
        },
      );
      setProgress({
        queued: result.campaign.queued,
        total: result.campaign.total,
      });
      while (!result.done) {
        result = await commerceRequest(siteId, "campaigns", {
          mode: "send",
          id: result.campaign.id,
        });
        setProgress({
          queued: result.campaign.queued,
          total: result.campaign.total,
        });
      }
      setNotice(
        `“${result.campaign.subject}” ${live ? "is sending" : "was saved as previews"} to ${result.campaign.total} ${result.campaign.total === 1 ? "subscriber" : "subscribers"}. Its visits and sales appear in Insights under “${result.campaign.name}”.`,
      );
      setSubject("");
      setBody("");
      setName("");
      setDiscountCode("");
      setSubjectB("");
      setTesting(false);
      setProgress(undefined);
      await Promise.all([loadHistory(), onChanged()]);
    }).finally(() => setProgress(undefined));

  const abandoned = data.orders
    .filter(
      (o) => o.status === "cancelled" || (o.status === "pending" && o.expired),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const discounts = data.discounts.filter((d) => d.active);

  if (!canManage)
    return (
      <div className="commerce-notice">
        Marketing is for the store’s owner and managers.
      </div>
    );
  return (
    <div className="marketing">
      {!live && (
        <div className="commerce-notice">
          Emails are kept as previews in your Inbox until Skynoveau has an email
          sender (SES). Everything else works the same, so you can prepare
          campaigns now.
        </div>
      )}
      {error && (
        <div className="commerce-notice error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="commerce-notice" role="status">
          {notice}
        </div>
      )}
      <div className="marketing-compose">
        <section className="commerce-panel commerce-form">
          <h2>New email campaign</h2>
          <p className="commerce-muted">
            Goes only to people who subscribed. Each email has its own
            unsubscribe link, and links to your site and store are tagged so
            Insights shows the visits and sales the campaign brings.
          </p>
          <label className="commerce-field">
            Who receives it
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as CampaignAudience)}
            >
              {AUDIENCES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <small>{AUDIENCES.find(([v]) => v === audience)![2]}</small>
          </label>
          <label className="commerce-field">
            Subject
            <input
              value={subject}
              maxLength={160}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="marketing-check">
            <input
              type="checkbox"
              role="switch"
              checked={testing}
              onChange={(e) => setTesting(e.target.checked)}
            />
            A/B test the subject line
            <small>
              Half your audience gets each subject. Insights shows which one
              brought more visits and sales.
            </small>
          </label>
          {testing && (
            <label className="commerce-field">
              Subject B
              <input
                value={subjectB}
                maxLength={160}
                onChange={(e) => setSubjectB(e.target.value)}
              />
            </label>
          )}
          <label className="commerce-field">
            Heading
            <input
              value={look.heading}
              maxLength={120}
              placeholder="The big line at the top of the email"
              onChange={(e) => setLookPart({ heading: e.target.value })}
            />
          </label>
          <label className="commerce-field">
            Message
            <textarea
              value={body}
              maxLength={8000}
              rows={8}
              placeholder={`Hi there,\n\nOur new collection is here: ${location.origin}/store?site=${siteId}`}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <details className="marketing-design">
            <summary>Design: image, button and colour</summary>
            <label className="commerce-field">
              Image address
              <input
                value={look.image}
                maxLength={2000}
                placeholder="https://…/banner.jpg"
                onChange={(e) => setLookPart({ image: e.target.value.trim() })}
              />
              <small>A wide picture shown above the message (https).</small>
            </label>
            <div className="marketing-pair">
              <label className="commerce-field">
                Button text
                <input
                  value={look.buttonLabel}
                  maxLength={40}
                  placeholder="Shop the sale"
                  onChange={(e) => setLookPart({ buttonLabel: e.target.value })}
                />
              </label>
              <label className="commerce-field">
                Button link
                <input
                  value={look.buttonUrl}
                  maxLength={2000}
                  placeholder={`${location.origin}/store?site=${siteId}`}
                  onChange={(e) =>
                    setLookPart({ buttonUrl: e.target.value.trim() })
                  }
                />
              </label>
            </div>
            <label className="commerce-field marketing-colour">
              Brand colour
              <span>
                <input
                  type="color"
                  value={look.accent}
                  onChange={(e) => setLookPart({ accent: e.target.value })}
                />
                {look.accent}
              </span>
            </label>
          </details>
          <div className="marketing-pair">
            <label className="commerce-field">
              Offer
              <select
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
              >
                <option value="">No discount</option>
                {discounts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} ·{" "}
                    {d.kind === "percent"
                      ? `${d.value}% off`
                      : `${money(d.value, d.currency)} off`}
                  </option>
                ))}
              </select>
            </label>
            <label className="commerce-field">
              Campaign name
              <input
                value={name}
                maxLength={80}
                placeholder={subject || "spring-sale"}
                onChange={(e) => setName(e.target.value)}
              />
              <small>How it’s labelled in Insights.</small>
            </label>
          </div>
          {progress ? (
            <div className="admin-setup-progress" aria-live="polite">
              <span
                role="progressbar"
                aria-label="Sending"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.queued}
              >
                <i
                  style={{
                    width: `${(progress.queued / Math.max(1, progress.total)) * 100}%`,
                  }}
                />
              </span>
              {progress.queued} of {progress.total} queued
            </div>
          ) : confirming ? (
            <div
              className="commerce-confirm"
              role="group"
              aria-label="Send campaign"
            >
              <span>
                Send “{subject}” to {preview?.count ?? 0}{" "}
                {preview?.count === 1 ? "subscriber" : "subscribers"}? This
                can’t be undone.
              </span>
              <button
                className="commerce-button"
                disabled={busy}
                onClick={() => void send()}
              >
                Send now
              </button>
              <button
                className="commerce-button secondary"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="commerce-actions marketing-send">
              <button
                className="commerce-button secondary"
                disabled={busy || !ready}
                onClick={() => void sendTest()}
              >
                Send me a test
              </button>
              <button
                className="commerce-button"
                disabled={busy || !ready || !preview?.count}
                onClick={() => setConfirming(true)}
              >
                <Icon name="send" size={14} />
                {preview?.count
                  ? `Send to ${preview.count} ${preview.count === 1 ? "subscriber" : "subscribers"}`
                  : ready
                    ? "Nobody to send to yet"
                    : "Send campaign"}
              </button>
            </div>
          )}
        </section>
        <section
          className="commerce-panel marketing-preview"
          aria-label="Email preview"
        >
          <h2>Preview</h2>
          {preview ? (
            <>
              <p className="commerce-muted">
                {preview.count}{" "}
                {preview.count === 1 ? "subscriber" : "subscribers"} in this
                audience.
              </p>
              <div className="marketing-email">
                <strong>{subject}</strong>
                {testing && subjectB && <strong>B: {subjectB}</strong>}
                <small>From {data.settings.name}</small>
                <iframe
                  title="Email preview"
                  className="marketing-frame"
                  sandbox=""
                  srcDoc={preview.html}
                />
              </div>
            </>
          ) : (
            <div className="marketing-email is-empty" aria-hidden="true">
              <span className="marketing-skeleton is-short" />
              <span className="marketing-skeleton is-tiny" />
              <div className="marketing-skeleton-body">
                <span className="marketing-skeleton is-image" />
                <span className="marketing-skeleton is-title" />
                <span className="marketing-skeleton" />
                <span className="marketing-skeleton" />
                <span className="marketing-skeleton is-short" />
                <span className="marketing-skeleton is-button" />
              </div>
            </div>
          )}
          {!preview && (
            <p className="commerce-muted marketing-preview-hint">
              Write a subject and message to see the email and who it reaches.
            </p>
          )}
        </section>
      </div>

      <section className="commerce-panel">
        <h2>Campaigns</h2>
        {history.length ? (
          <div className="commerce-scroll">
            <table className="commerce-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Audience</th>
                  <th>Recipients</th>
                  <th>A/B</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.subject}</strong>
                      <small>
                        {c.name}
                        {c.discountCode && ` · ${c.discountCode}`}
                      </small>
                    </td>
                    <td>{AUDIENCES.find(([v]) => v === c.audience)?.[1]}</td>
                    <td>{c.total}</td>
                    <td>
                      {c.subjectB
                        ? `A ${c.sentA ?? 0} · B ${c.sentB ?? 0}`
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`commerce-badge ${c.status === "sent" ? "" : "neutral"}`}
                      >
                        {c.status === "sent"
                          ? "Sent"
                          : `Sending · ${c.queued}/${c.total}`}
                      </span>
                    </td>
                    <td>{date(c.sentAt ?? c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="commerce-muted">Campaigns you send are listed here.</p>
        )}
        <a
          className="commerce-link"
          href={`/insights?site=${encodeURIComponent(siteId)}`}
        >
          See what campaigns brought in Insights
        </a>
      </section>

      <AutoReminders
        siteId={siteId}
        data={data}
        discounts={discounts.map((d) => d.code)}
        onChanged={onChanged}
      />
      <AbandonedCheckouts
        siteId={siteId}
        orders={abandoned}
        discounts={discounts.map((d) => d.code)}
        live={live}
        onChanged={onChanged}
      />
    </div>
  );
}

/** Reminders sent by themselves, a set time after a checkout runs out unpaid. */
function AutoReminders({
  siteId,
  data,
  discounts,
  onChanged,
}: {
  siteId: string;
  data: CommerceOverview;
  discounts: string[];
  onChanged: () => Promise<void>;
}) {
  const saved = data.settings.autoRemind ?? {
    enabled: false,
    hours: 1,
    discountCode: "",
  };
  const [draft, setDraft] = useState(saved);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await commerceRequest(
        siteId,
        "settings",
        { ...data.settings, autoRemind: draft },
        "PUT",
      );
      await onChanged();
      setMessage(
        draft.enabled
          ? `Shoppers are reminded ${draft.hours} ${draft.hours === 1 ? "hour" : "hours"} after a checkout runs out unpaid.`
          : "Automatic reminders are off.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn’t save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="commerce-panel commerce-form">
      <h2>Automatic reminders</h2>
      <p className="commerce-muted">
        Email each shopper once when they leave a checkout unpaid, without
        lifting a finger. Sent with the store’s next activity after the delay.
      </p>
      <label className="marketing-check">
        <input
          type="checkbox"
          role="switch"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        Remind shoppers automatically
      </label>
      {draft.enabled && (
        <div className="marketing-pair">
          <label className="commerce-field">
            After
            <select
              value={draft.hours}
              onChange={(e) =>
                setDraft({ ...draft, hours: Number(e.target.value) })
              }
            >
              {[1, 3, 6, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? "hour" : "hours"}
                </option>
              ))}
            </select>
          </label>
          <label className="commerce-field">
            Offer
            <select
              value={draft.discountCode}
              onChange={(e) =>
                setDraft({ ...draft, discountCode: e.target.value })
              }
            >
              <option value="">No discount</option>
              {discounts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="commerce-actions marketing-send">
        <button
          className="commerce-button"
          disabled={busy || !changed}
          onClick={() => void save()}
        >
          Save
        </button>
        {message && (
          <span className="commerce-muted" role="status">
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
function AbandonedCheckouts({
  siteId,
  orders,
  discounts,
  live,
  onChanged,
}: {
  siteId: string;
  orders: Order[];
  discounts: string[];
  live: boolean;
  onChanged: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const remind = async (order: Order) => {
    setBusy(order.id);
    setMessage("");
    try {
      await commerceRequest(siteId, `orders/${order.id}`, {
        revision: order.revision,
        action: "remind",
        discountCode: code,
      });
      setMessage(
        live
          ? `Reminder sent to ${order.email}.`
          : `Reminder to ${order.email} saved to your Inbox previews.`,
      );
      await onChanged();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Couldn’t send the reminder.",
      );
    } finally {
      setBusy("");
    }
  };
  const value = orders.reduce(
    (sum, o) => sum + (o.currency === orders[0]?.currency ? o.total : 0),
    0,
  );
  return (
    <section className="commerce-panel">
      <h2>Abandoned checkouts</h2>
      <p className="commerce-muted">
        Shoppers who started paying and didn’t finish. Remind each one once,
        with an offer if you like.
        {orders.length > 0 &&
          ` ${orders.length} worth ${money(value, orders[0].currency)} so far.`}
      </p>
      {orders.length > 0 && (
        <label className="commerce-field marketing-offer">
          Offer in reminders
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">No discount</option>
            {discounts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}
      {message && (
        <p className="commerce-muted" role="status">
          {message}
        </p>
      )}
      {orders.length ? (
        <div className="commerce-scroll">
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Shopper</th>
                <th>Items</th>
                <th>Total</th>
                <th>Started</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 50).map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.address.name || o.email}</strong>
                    <small>{o.email}</small>
                  </td>
                  <td>
                    {o.lines
                      .map(
                        (l) =>
                          `${l.title}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`,
                      )
                      .join(", ")}
                  </td>
                  <td>{money(o.total, o.currency)}</td>
                  <td>{date(o.createdAt)}</td>
                  <td>
                    {o.remindedAt ? (
                      <span className="commerce-badge neutral">
                        Reminded {date(o.remindedAt)}
                      </span>
                    ) : (
                      <button
                        className="commerce-button secondary"
                        disabled={!!busy}
                        onClick={() => void remind(o)}
                      >
                        {busy === o.id ? "Sending…" : "Remind"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="commerce-muted">None so far.</p>
      )}
    </section>
  );
}
