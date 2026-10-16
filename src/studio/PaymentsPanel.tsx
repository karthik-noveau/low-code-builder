import { useEffect, useState } from "react";
import { useStudio } from "./store";
import { Field } from "./ui";
import * as cloud from "../cloud/client";
import {
  emptyPayments,
  PAYMENT_LIMITS,
  paymentProblems,
  type PaymentSettings,
} from "./payments";

/** Site-wide payment options for visitor actions (Settings → Get paid). */
export function PaymentsPanel({ inData = false }: { inData?: boolean }) {
  const project = useStudio((s) => s.project);
  const commit = useStudio((s) => s.commit);
  const payments = project.payments ?? emptyPayments();
  const problems = paymentProblems(payments);
  const asking = (project.collections ?? []).filter((c) => c.request?.collect);
  const set = (key: keyof typeof PAYMENT_LIMITS) => (value: string) =>
    commit(
      (p) => ({
        ...p,
        payments: {
          ...(p.payments ?? emptyPayments()),
          [key]: value.slice(0, PAYMENT_LIMITS[key]),
        },
      }),
      `payments:${key}`,
    );
  return (
    <div className="payments-panel">
      {!inData && (
        <p className="muted-note">
          After an order, booking or RSVP, visitors see the total, a reference
          and these options. Money goes straight to you: no fees, nothing to
          connect. Mark requests paid in your Inbox.
        </p>
      )}
      <OnlinePayments />
      <Field
        label="UPI ID"
        value={payments.upi}
        placeholder="yourname@okbank"
        maxLength={PAYMENT_LIMITS.upi}
        hint={problems.upi}
        onChange={set("upi")}
      />
      {payments.upi && (
        <Field
          label="Name shown in UPI apps"
          value={payments.payee}
          placeholder={project.name}
          maxLength={PAYMENT_LIMITS.payee}
          onChange={set("payee")}
        />
      )}
      <Field
        label="Payment link"
        value={payments.link}
        placeholder="https://buy.stripe.com/… or https://rzp.io/…"
        maxLength={PAYMENT_LIMITS.link}
        hint={
          problems.link ??
          "A link from Stripe, Razorpay, PayPal or any provider you use."
        }
        onChange={set("link")}
      />
      <Field
        label="Bank transfer details"
        multiline
        value={payments.bank}
        placeholder={"Account name\nAccount number\nIFSC / sort code"}
        maxLength={PAYMENT_LIMITS.bank}
        onChange={set("bank")}
      />
      <Field
        label="Pay in person"
        value={payments.inPerson}
        placeholder="Pay at the counter or on delivery"
        maxLength={PAYMENT_LIMITS.inPerson}
        onChange={set("inPerson")}
      />
      <Field
        label="Note for visitors"
        value={payments.note}
        placeholder="We confirm your booking once payment arrives."
        maxLength={PAYMENT_LIMITS.note}
        onChange={set("note")}
      />
      {!inData && (
        <p className="muted-note">
          {asking.length
            ? `Asking for payment: ${asking.map((c) => c.name).join(", ")}.`
            : "Turn on “Ask visitors to pay” in Data → a collection → Settings."}
        </p>
      )}
    </div>
  );
}

interface Connection {
  provider: "stripe" | "razorpay";
  mode: "test" | "live";
  hint: string;
}
const PROVIDERS = { stripe: "Stripe", razorpay: "Razorpay" } as const;
/** The cloud site open in the editor, if any (CloudWorkspace keeps it in the URL). */
const activeSiteId = () =>
  new URLSearchParams(location.search).get("site") ?? undefined;

/**
 * Card payments through the owner's own Stripe or Razorpay account. The key
 * goes straight to the server, which checks it and stores it encrypted; the
 * project only remembers which provider is connected.
 */
function OnlinePayments() {
  const commit = useStudio((s) => s.commit);
  const siteId = activeSiteId();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<Connection["provider"]>("stripe");
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remember = (online: PaymentSettings["online"]) =>
    commit((p) => ({
      ...p,
      payments: { ...(p.payments ?? emptyPayments()), online },
    }));
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    cloud
      .request<{ connection: Connection | null }>(`/sites/${siteId}/payments`)
      .then(({ connection }) => {
        if (!active) return;
        setConnection(connection);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [siteId]);
  const save = async (path: string, body?: object) => {
    setBusy(true);
    setError("");
    try {
      const result = await cloud.request<{ connection: Connection | null }>(
        `/sites/${siteId}/${path}`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      );
      setConnection(result.connection);
      remember(result.connection?.provider ?? "");
      setSecret("");
      setKeyId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="online-payments">
      <strong>Card payments</strong>
      {!siteId ? (
        <small>
          Save this site to your Forma account (Workspace) to take card payments
          through your own Stripe or Razorpay account.
        </small>
      ) : !loaded ? (
        <small>Checking…</small>
      ) : connection ? (
        <>
          <small>
            {PROVIDERS[connection.provider]} connected
            {connection.mode === "test" ? " in test mode" : ""} · key ending{" "}
            {connection.hint}. Visitors pay the exact total and requests are
            marked paid automatically.
          </small>
          <button
            className="subtle-button"
            disabled={busy}
            onClick={() => void save("payments/disconnect")}
          >
            Disconnect {PROVIDERS[connection.provider]}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              "payments",
              provider === "stripe"
                ? { provider, secret }
                : { provider, keyId, secret },
            );
          }}
        >
          <small>
            Visitors pay the exact total by card
            {provider === "razorpay" ? ", UPI or netbanking" : ""}; money goes
            to your account and requests are marked paid automatically. Only the
            site owner can connect one.
          </small>
          <div className="segmented" role="radiogroup" aria-label="Provider">
            {(Object.keys(PROVIDERS) as Connection["provider"][]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={provider === p}
                className={provider === p ? "chosen" : ""}
                onClick={() => setProvider(p)}
              >
                {PROVIDERS[p]}
              </button>
            ))}
          </div>
          {provider === "razorpay" && (
            <Field
              label="Key ID"
              value={keyId}
              placeholder="rzp_live_…"
              maxLength={60}
              onChange={setKeyId}
            />
          )}
          <Field
            label={provider === "stripe" ? "Restricted key" : "Key secret"}
            type="password"
            value={secret}
            placeholder={provider === "stripe" ? "rk_live_…" : ""}
            maxLength={220}
            hint={
              provider === "stripe"
                ? "In Stripe → Developers → API keys, create a restricted key with Checkout Sessions: Write."
                : "In Razorpay → Account & Settings → API keys."
            }
            onChange={setSecret}
          />
          {error && (
            <small className="online-payments-error" role="alert">
              {error}
            </small>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !secret || (provider === "razorpay" && !keyId)}
          >
            {busy ? "Checking…" : `Connect ${PROVIDERS[provider]}`}
          </button>
        </form>
      )}
    </div>
  );
}
