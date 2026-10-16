import { useCallback, useEffect, useState } from "react";
import { useSession } from "../brand/useSession";
import { request, signOut } from "../cloud/client";
import { money, type Address, type Order } from "./types";
import "./commerce.css";

interface Profile {
  email: string;
  revision: number;
  addresses: Address[];
  orders: Order[];
}
export function CustomerAccount({ siteId }: { siteId: string }) {
  const session = useSession();
  const [profile, setProfile] = useState<Profile>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = `/store/${siteId}/account`;
  const refresh = useCallback(
    () =>
      request<Profile>(endpoint)
        .then(setProfile)
        .catch((e) => setError(e.message)),
    [endpoint],
  );
  useEffect(() => {
    if (session.account) void refresh();
  }, [session.account, refresh]);
  const saveAddresses = async (addresses: Address[]) => {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ revision: profile.revision, addresses }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save addresses.");
    } finally {
      setBusy(false);
    }
  };
  const next = encodeURIComponent(`/customer?site=${siteId}`);
  return (
    <div className="commerce-app">
      <div className="store-shell">
        <header className="store-header">
          <a href={`/store?site=${siteId}`} className="store-logo">
            ← Back to store
          </a>
          {session.account && (
            <button
              className="commerce-link"
              onClick={() => {
                void signOut()
                  .then(() => location.assign(`/customer?site=${siteId}`))
                  .catch((e) => setError(e.message));
              }}
            >
              Sign out
            </button>
          )}
        </header>
        <main className="store-cart">
          <h1>Your account</h1>
          {(error || session.error) && (
            <p className="commerce-notice error" role="alert">
              {error || session.error}
            </p>
          )}
          {session.loading ? (
            <p role="status">Loading…</p>
          ) : !session.account ? (
            <section className="commerce-panel commerce-form">
              <h2>Welcome back</h2>
              <p className="commerce-muted">
                Sign in to see purchases made with your email address and manage
                delivery addresses.
              </p>
              <div className="commerce-actions">
                <a className="commerce-button" href={`/login?next=${next}`}>
                  Sign in
                </a>
                <a
                  className="commerce-button secondary"
                  href={`/signup?next=${next}`}
                >
                  Create account
                </a>
              </div>
            </section>
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
                          #{order.id.slice(0, 8)} ·{" "}
                          {money(order.total, order.currency)} · {order.status}
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
                            Return {order.returnRequest.status}:{" "}
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
                                void request(
                                  `/store/${siteId}/account/orders/${order.id}/return`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      reason: fields.get("reason"),
                                    }),
                                  },
                                )
                                  .then(refresh)
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
                {profile.addresses.map((address, index) => (
                  <div className="commerce-step" key={index}>
                    <div className="commerce-article">
                      {address.name}
                      {"\n"}
                      {address.line1}
                      {"\n"}
                      {address.city}, {address.postalCode} · {address.country}
                    </div>
                    <button
                      className="commerce-link"
                      disabled={busy}
                      onClick={() =>
                        void saveAddresses(
                          profile.addresses.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
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
                    void saveAddresses([...profile.addresses, address]);
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
                        />
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
