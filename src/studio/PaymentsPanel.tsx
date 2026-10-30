import { useCallback, useEffect, useState } from "react";
import { useStudio } from "./store";
import { Field, InlineConfirm } from "./ui";
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
          and these options. UPI, bank transfer and in-person payments go
          straight to you with nothing to connect; card payments need a Stripe
          or Razorpay account. Mark requests paid in your Inbox.
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
            : "Turn on “Ask visitors to pay” in Data: choose a collection, then Settings."}
        </p>
      )}
    </div>
  );
}

interface Connection {
  provider: "stripe" | "razorpay";
  mode: "test" | "live";
  hint: string;
  via?: "oauth";
  account?: string;
}
type SignIn = Record<Connection["provider"], boolean>;
const PROVIDERS = { stripe: "Stripe", razorpay: "Razorpay" } as const;
/** The cloud site open in the editor, if any (CloudWorkspace keeps it in the URL). */
const activeSiteId = () =>
  new URLSearchParams(location.search).get("site") ?? undefined;
/** The sign-in this tab started, so only it can finish it. */
const PENDING_KEY = "forma-payments-sign-in";
/** How signing in with the provider ended, from the URL it sent us back to. */
const RETURN_MESSAGES: Record<string, string> = {
  cancelled: "You didn’t finish signing in, so nothing changed.",
  failed: "The provider didn’t connect your account. Try again.",
  expired: "That sign-in expired. Connect again.",
};
let finishing: Promise<Connection | null> | undefined;
/** Finishes a sign-in once, however many panels are open. */
function finishSignIn(siteId: string) {
  finishing ??= (async () => {
    let state = "";
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "{}");
      if (pending.site === siteId) state = pending.state;
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // No storage: the server refuses the empty state below.
    }
    return (
      await cloud.request<{ connection: Connection | null }>(
        `/sites/${siteId}/payments/sign-in/finish`,
        { method: "POST", body: JSON.stringify({ state }) },
      )
    ).connection;
  })();
  return finishing;
}
const accountLabel = (c: Connection) =>
  c.via
    ? c.provider === "razorpay"
      ? `account ${c.account}`
      : `account ending ${c.hint}`
    : `key ending ${c.hint}`;

/**
 * Card payments through the owner's own Stripe or Razorpay account: sign in
 * with the provider (when Forma has a platform app for it) or paste API keys.
 * Keys go straight to the server, which checks and stores them encrypted; the
 * project only remembers which provider is connected.
 */
function OnlinePayments() {
  const commit = useStudio((s) => s.commit);
  // The draft is in the editor, so remembering the provider won't be overwritten.
  const opened = useStudio((s) => !!s.cloud);
  const siteId = activeSiteId();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [signIn, setSignIn] = useState<SignIn>({
    stripe: false,
    razorpay: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [provider, setProvider] = useState<Connection["provider"]>("stripe");
  const [useKeys, setUseKeys] = useState(false);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const remember = useCallback(
    (online: PaymentSettings["online"]) =>
      commit((p) => ({
        ...p,
        payments: { ...(p.payments ?? emptyPayments()), online },
      })),
    [commit],
  );
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    cloud
      .request<{ connection: Connection | null; signIn?: SignIn }>(
        `/sites/${siteId}/payments`,
      )
      .then(({ connection, signIn }) => {
        if (!active) return;
        setConnection(connection);
        if (signIn) setSignIn(signIn);
        setCheckFailed(false);
        setLoaded(true);
      })
      // Not knowing isn't the same as not connected: don't offer to connect again.
      .catch(() => {
        if (!active) return;
        setCheckFailed(true);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [siteId, attempt]);
  useEffect(() => {
    const result = new URLSearchParams(location.search).get("payments");
    if (!siteId || !result || !opened) return;
    const url = new URL(location.href);
    url.searchParams.delete("payments");
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url.pathname + url.search);
    if (result !== "finish") {
      sessionStorage.removeItem(PENDING_KEY);
      setError(RETURN_MESSAGES[result] ?? RETURN_MESSAGES.failed);
      return;
    }
    setBusy(true);
    finishSignIn(siteId)
      .then((connected) => {
        setConnection(connected);
        setCheckFailed(false);
        setLoaded(true);
        remember(connected?.provider ?? "");
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "That didn’t work. Try again.",
        ),
      )
      .finally(() => setBusy(false));
  }, [siteId, opened, remember]);
  const save = async (path: string, body?: object) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await cloud.request<{
        connection: Connection | null;
        revoked?: false;
      }>(`/sites/${siteId}/${path}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      if (result.revoked === false && connection)
        setNotice(
          `Disconnected. Forma may still be listed in your ${PROVIDERS[connection.provider]} account; you can remove it there.`,
        );
      setConnection(result.connection);
      remember(result.connection?.provider ?? "");
      setSecret("");
      setKeyId("");
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const startSignIn = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { state, url } = await cloud.request<{
        state: string;
        url: string;
      }>(`/sites/${siteId}/payments/sign-in`, {
        method: "POST",
        body: JSON.stringify({ provider, editor: location.origin }),
      });
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ site: siteId, state }),
      );
      location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
      setBusy(false);
    }
  };
  const keysForm = !signIn[provider] || useKeys;
  const messages = (
    <>
      {notice && <small role="status">{notice}</small>}
      {error && (
        <small className="online-payments-error" role="alert">
          {error}
        </small>
      )}
    </>
  );
  return (
    <div className="online-payments">
      <strong>Card payments</strong>
      {!siteId ? (
        <small>
          Save this site to your Forma account (My sites) to take card payments
          through your own Stripe or Razorpay account.
        </small>
      ) : !loaded ? (
        <small>Checking…</small>
      ) : checkFailed ? (
        <>
          <small className="online-payments-error" role="alert">
            Couldn’t check your payment connection.
          </small>
          <button
            className="subtle-button"
            onClick={() => {
              setLoaded(false);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </>
      ) : connection ? (
        <>
          <small>
            {PROVIDERS[connection.provider]} connected
            {connection.mode === "test" ? " in test mode" : ""} ·{" "}
            {accountLabel(connection)}. Visitors pay the exact total and
            requests are marked paid automatically.
          </small>
          {messages}
          {confirming ? (
            <InlineConfirm
              message={`Disconnect ${PROVIDERS[connection.provider]}? Visitors won’t be able to pay by card.`}
              confirmLabel={busy ? "Disconnecting…" : "Disconnect"}
              busy={busy}
              onConfirm={() => void save("payments/disconnect")}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <button
              className="subtle-button"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Disconnect {PROVIDERS[connection.provider]}
            </button>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!keysForm) return void startSignIn();
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
          {!keysForm ? (
            <small>
              You’ll sign in to {PROVIDERS[provider]} and choose the account to
              connect, then come back here.
            </small>
          ) : (
            <>
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
                    ? "In Stripe → Developers → API keys, create a restricted key with Checkout Sessions: Write and Refunds: Write (so you can refund from the Inbox)."
                    : "In Razorpay → Account & Settings → API keys."
                }
                onChange={setSecret}
              />
            </>
          )}
          {messages}
          {keysForm ? (
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !secret || (provider === "razorpay" && !keyId)}
            >
              {busy ? "Checking…" : `Connect ${PROVIDERS[provider]}`}
            </button>
          ) : (
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Opening…" : `Connect with ${PROVIDERS[provider]}`}
            </button>
          )}
          {signIn[provider] && (
            <button
              type="button"
              className="text-button online-payments-switch"
              onClick={() => {
                setUseKeys(!useKeys);
                setError("");
              }}
            >
              {useKeys
                ? `Sign in with ${PROVIDERS[provider]} instead`
                : "Use API keys instead"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
