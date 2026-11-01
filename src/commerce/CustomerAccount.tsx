import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../cloud/client";
import { shopperToken, storeRequest } from "./client";
import { money, type Address, type Order } from "./types";
import { orderNumber, returnLabel, statusLabel } from "./labels";
import "./commerce.css";
import "./storefront.css";

interface Profile {
  email: string;
  revision: number;
  addresses: Address[];
  orders: Order[];
}
export function CustomerAccount({ siteId }: { siteId: string }) {
  // Shoppers sign in to this store only, with a code sent to their email.
  const [token, setToken] = useState(() => shopperToken.get(siteId));
  const [profile, setProfile] = useState<Profile>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  // Sign-in: the email a code went to, and (local preview stores) the code.
  const [codeFor, setCodeFor] = useState(""),
    [preview, setPreview] = useState("");
  // The saved address waiting on "Remove this address?" to be answered.
  const [removing, setRemoving] = useState<number>();
  // A store that can't email codes doesn't offer accounts (the store says so).
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let active = true;
    storeRequest<{ accounts?: boolean }>(siteId)
      .then((store) => {
        if (active) setClosed(store.accounts === false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [siteId]);
  const signedOut = useCallback(() => {
    shopperToken.set(siteId, "");
    setToken("");
    setProfile(undefined);
  }, [siteId]);
  /** A store call as the signed-in shopper; an expired sign-in signs out. */
  const call = useCallback(
    async <T,>(path: string, input: Record<string, unknown> = {}) => {
      try {
        return await storeRequest<T>(siteId, path, { ...input, token });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signedOut();
        throw e;
      }
    },
    [siteId, token, signedOut],
  );
  const refresh = useCallback(
    () =>
      call<Profile>("account/read")
        .then(setProfile)
        .catch((e) => setError(e.message)),
    [call],
  );
  useEffect(() => {
    if (token && !closed) void refresh();
  }, [token, closed, refresh]);
  const saveAddresses = async (addresses: Address[], message: string) => {
    if (!profile) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call("account", { revision: profile.revision, addresses });
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save addresses.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const askForCode = async (email: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const sent = await storeRequest<{ preview?: string }>(
        siteId,
        "account/code",
        { email },
      );
      setCodeFor(email);
      setPreview(sent.preview || "");
      if (!sent.preview)
        setNotice(`We emailed a six-digit code to ${email}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  };
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const session = await storeRequest<{ token: string }>(
        siteId,
        "account/session",
        { email: codeFor, code },
      );
      shopperToken.set(siteId, session.token);
      setToken(session.token);
      setCodeFor("");
      setPreview("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="commerce-app storefront">
      <div className="store-shell">
        <header className="store-header">
          <a href={`/store?site=${siteId}`} className="store-logo store-back">
            ← Back to store
          </a>
          {token && !closed && (
            <button
              className="commerce-link"
              onClick={() => {
                void storeRequest(siteId, "account/sign-out", { token })
                  .catch(() => undefined)
                  .finally(signedOut);
              }}
            >
              Sign out
            </button>
          )}
        </header>
        <main className="store-cart store-account">
          <h1>Your account</h1>
          {error && (
            <p className="commerce-notice error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="commerce-notice" role="status">
              {notice}
            </p>
          )}
          {closed ? (
            <section className="commerce-panel commerce-form">
              <h2>Customer accounts aren’t open yet</h2>
              <p className="commerce-muted">
                This store doesn’t have customer accounts yet. For an order you
                placed, contact the store with your order number.
              </p>
              <div className="commerce-actions">
                <a className="commerce-button" href={`/store?site=${siteId}`}>
                  Back to store
                </a>
              </div>
            </section>
          ) : !token && codeFor ? (
            <form
              key="code"
              className="commerce-panel commerce-form"
              onSubmit={(e) => void signIn(e)}
            >
              <h2>Enter your code</h2>
              {preview && (
                <p className="commerce-notice">
                  Local preview: this store can’t send email, so here’s the
                  code: <strong>{preview}</strong>
                </p>
              )}
              <label className="commerce-field">
                Six-digit code
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoFocus
                />
              </label>
              <div className="commerce-actions">
                <button className="commerce-button" disabled={busy}>
                  Sign in
                </button>
                <button
                  type="button"
                  className="commerce-button secondary"
                  disabled={busy}
                  onClick={() => void askForCode(codeFor)}
                >
                  Send a new code
                </button>
                <button
                  type="button"
                  className="commerce-link"
                  onClick={() => {
                    setCodeFor("");
                    setPreview("");
                    setNotice("");
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          ) : !token ? (
            <form
              key="email"
              className="commerce-panel commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                void askForCode(
                  String(new FormData(e.currentTarget).get("email") || ""),
                );
              }}
            >
              <h2>Welcome back</h2>
              <p className="commerce-muted">
                See purchases made with your email address and manage delivery
                addresses. We’ll email you a code to sign in; no password
                needed.
              </p>
              <label className="commerce-field">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                />
              </label>
              <div className="commerce-actions">
                <button className="commerce-button" disabled={busy}>
                  Email me a code
                </button>
              </div>
            </form>
          ) : profile ? (
            <>
              <p className="commerce-muted">{profile.email}</p>
              <section className="commerce-panel">
                <h2>Your orders</h2>
                {profile.orders.length ? (
                  profile.orders
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((order) => (
                      <details
                        key={order.id}
                        className="commerce-panel"
                        style={{ marginTop: 18 }}
                      >
                        <summary>
                          {orderNumber(order.id)} ·{" "}
                          {money(order.total, order.currency)} ·{" "}
                          {statusLabel(order.status)}
                        </summary>
                        <div className="commerce-order-lines">
                          {order.lines.map((line) => (
                            <div key={line.variantId}>
                              <span>
                                {line.title} · {line.variant} × {line.quantity}
                              </span>
                              <strong>
                                {money(line.total, order.currency)}
                              </strong>
                            </div>
                          ))}
                        </div>
                        {order.tracking && (
                          <p className="commerce-muted">
                            Tracking: {order.tracking}
                          </p>
                        )}
                        <p className="commerce-muted">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                        {order.returnRequest ? (
                          <p className="commerce-notice">
                            {returnLabel(order.returnRequest.status)}:{" "}
                            {order.returnRequest.reason}
                          </p>
                        ) : (
                          ["paid", "fulfilled"].includes(order.status) && (
                            <form
                              className="commerce-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const fields = new FormData(e.currentTarget);
                                setBusy(true);
                                setError("");
                                setNotice("");
                                void call(`account/orders/${order.id}/return`, {
                                  reason: fields.get("reason"),
                                })
                                  .then(refresh)
                                  .then(() =>
                                    setNotice(
                                      "Return request sent. The store will email you.",
                                    ),
                                  )
                                  .catch((e) => setError(e.message))
                                  .finally(() => setBusy(false));
                              }}
                            >
                              <label className="commerce-field">
                                Reason for return
                                <textarea
                                  name="reason"
                                  required
                                  maxLength={1000}
                                />
                              </label>
                              <button
                                className="commerce-button secondary"
                                disabled={busy}
                              >
                                Request return
                              </button>
                            </form>
                          )
                        )}
                      </details>
                    ))
                ) : (
                  <p className="commerce-muted">
                    Orders placed with this email address will appear here.
                  </p>
                )}
              </section>
              <section className="commerce-panel">
                <h2>Saved delivery addresses</h2>
                {!profile.addresses.length && (
                  <p className="commerce-muted">
                    Addresses you save here are offered at checkout.
                  </p>
                )}
                {profile.addresses.map((address, index) => (
                  <div className="commerce-step" key={index}>
                    <div className="commerce-article">
                      {address.name}
                      {"\n"}
                      {address.line1}
                      {"\n"}
                      {address.city}, {address.postalCode} · {address.country}
                    </div>
                    {removing === index ? (
                      <div
                        className="commerce-confirm"
                        role="group"
                        aria-label="Remove address"
                      >
                        <span>Remove this address?</span>
                        <button
                          className="commerce-button danger"
                          disabled={busy}
                          onClick={() => {
                            setRemoving(undefined);
                            void saveAddresses(
                              profile.addresses.filter((_, i) => i !== index),
                              "Address removed.",
                            );
                          }}
                        >
                          Remove
                        </button>
                        <button
                          className="commerce-button secondary"
                          onClick={() => setRemoving(undefined)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="commerce-link"
                        disabled={busy}
                        onClick={() => setRemoving(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </section>
              {profile.addresses.length < 5 && (
                <form
                  className="commerce-panel commerce-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const values = new FormData(form);
                    const address = Object.fromEntries(
                      ["name", "line1", "city", "postalCode", "country"].map(
                        (key) => [key, String(values.get(key))],
                      ),
                    ) as unknown as Address;
                    void saveAddresses(
                      [...profile.addresses, address],
                      "Address saved.",
                    ).then((ok) => {
                      if (ok) form.reset();
                    });
                  }}
                >
                  <h2>Add an address</h2>
                  <div className="commerce-form-grid">
                    {[
                      ["name", "Full name"],
                      ["line1", "Street address"],
                      ["city", "City"],
                      ["postalCode", "Postal code"],
                      ["country", "Country code"],
                    ].map(([name, label]) => (
                      <label className="commerce-field" key={name}>
                        {label}
                        <input
                          required
                          name={name}
                          maxLength={name === "country" ? 2 : 200}
                          pattern={name === "country" ? "[A-Z]{2}" : undefined}
                          placeholder={name === "country" ? "US" : undefined}
                          onChange={
                            name === "country"
                              ? (e) => {
                                  e.target.value = e.target.value.toUpperCase();
                                }
                              : undefined
                          }
                        />
                        {name === "country" && (
                          <small>Two-letter code, e.g. US, GB, IN</small>
                        )}
                      </label>
                    ))}
                  </div>
                  <button className="commerce-button" disabled={busy}>
                    Save address
                  </button>
                </form>
              )}
            </>
          ) : (
            <p role="status">Loading your account…</p>
          )}
        </main>
      </div>
    </div>
  );
}
