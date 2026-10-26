import { useState, type ReactNode } from "react";
import { useSession } from "../brand/useSession";
import { request } from "../cloud/client";
import { Brand } from "../brand/Brand";
import { AppShell, PageHeading } from "../brand/AppShell";
import "./commerce.css";

export function AccountPage() {
  const session = useSession();
  const params = new URLSearchParams(location.search);
  const reset = params.get("reset"),
    forgot = params.has("forgot");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  /** `logout` names the notice the login page shows after signing out. */
  const submit = async (path: string, input: unknown, logout = "") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ message?: string }>(path, {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (logout) {
        sessionStorage.removeItem("forma-local-session");
        location.assign(`/login?notice=${logout}`);
      } else setNotice(result.message || "Your account was updated.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this request.",
      );
    } finally {
      setBusy(false);
    }
  };
  // Signed in, this is a workspace page; reset and recovery stay standalone.
  const inShell = !!session.account && !reset && !forgot;
  const content = (
    <>
      {(error || session.error) && (
        <div className="commerce-notice error" role="alert">
          {error || session.error}
        </div>
      )}
      {notice && (
        <div className="commerce-notice" role="status">
          {notice}
        </div>
      )}
      {session.loading ? (
        <p role="status">Loading…</p>
      ) : session.config.mode !== "local" ? (
        <div className="commerce-panel">
          <p>
            Your password and sign-in are managed by your organisation’s sign-in
            service. Change them there.
          </p>
          <a href="/workspace">Back to your websites</a>
        </div>
      ) : reset ? (
        <form
          className="commerce-panel commerce-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            void submit("/auth/reset", {
              token: reset,
              password: fields.get("password"),
            });
          }}
        >
          <label className="commerce-field">
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
            <small>At least 10 characters.</small>
          </label>
          <button className="commerce-button" disabled={busy}>
            Reset password
          </button>
          <a href="/login">Back to sign in</a>
        </form>
      ) : forgot ? (
        <form
          className="commerce-panel commerce-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            void submit("/auth/forgot", { email: fields.get("email") });
          }}
        >
          <p className="commerce-muted">
            We’ll create a link to reset your password. On this computer no
            email is sent: the link is saved privately in Forma’s mail folder
            (.local/data/mail) for you to open.
          </p>
          <label className="commerce-field">
            Account email
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <button className="commerce-button" disabled={busy}>
            Get reset link
          </button>
          <a href="/login">Back to sign in</a>
        </form>
      ) : !session.account ? (
        <div className="commerce-panel">
          <a className="commerce-button" href="/login?next=%2Faccount">
            Sign in
          </a>
        </div>
      ) : (
        <>
          {!inShell && (
            <p className="commerce-muted">{session.account.email}</p>
          )}
          <SettingsSection
            title="Password"
            description="Use at least 10 characters. Changing your password signs out all existing sessions."
          >
            <form
              className="commerce-panel commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                void submit(
                  "/account/password",
                  {
                    currentPassword: fields.get("current"),
                    password: fields.get("password"),
                  },
                  "password-changed",
                );
              }}
            >
              <label className="commerce-field">
                Current password
                <input
                  type="password"
                  name="current"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="commerce-field">
                New password
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
              <div className="commerce-form-actions">
                <button className="commerce-button" disabled={busy}>
                  Update password
                </button>
              </div>
            </form>
          </SettingsSection>
          <SettingsSection
            title="Sessions"
            description="Signed in somewhere you don’t recognise? Sign out on every device, including this one."
          >
            <form
              className="commerce-panel commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                void submit(
                  "/account/logout-all",
                  { currentPassword: fields.get("current") },
                  "signed-out",
                );
              }}
            >
              <label className="commerce-field">
                Confirm your password
                <input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="commerce-form-actions">
                <button className="commerce-button secondary" disabled={busy}>
                  Sign out all sessions
                </button>
              </div>
            </form>
          </SettingsSection>
          <SettingsSection
            title="Delete account"
            description="First delete your websites (Your websites → Delete on each website), and export any records you want to keep."
            danger
          >
            <details className="commerce-panel settings-danger">
              <summary>Delete my account</summary>
              <form
                className="commerce-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fields = new FormData(e.currentTarget);
                  void submit(
                    "/account/delete",
                    {
                      currentPassword: fields.get("current"),
                      confirmation: fields.get("confirmation"),
                    },
                    "account-deleted",
                  );
                }}
              >
                <p className="commerce-muted">
                  Account deletion revokes sessions and collaborator access.
                  This can’t be undone.
                </p>
                <label className="commerce-field">
                  Current password
                  <input
                    name="current"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="commerce-field">
                  Type DELETE {session.account.email}
                  <input name="confirmation" required autoComplete="off" />
                </label>
                <div className="commerce-form-actions">
                  <button className="commerce-button danger" disabled={busy}>
                    Permanently delete local account
                  </button>
                </div>
              </form>
            </details>
          </SettingsSection>
        </>
      )}
    </>
  );
  if (inShell)
    return (
      <AppShell
        area="account"
        crumbs={[
          { label: "Workspace", href: "/workspace" },
          { label: "Account settings" },
        ]}
      >
        <PageHeading
          title="Account settings"
          description={session.account?.email}
        />
        <div className="commerce-app commerce-embedded account-settings">
          {content}
        </div>
      </AppShell>
    );
  return (
    <div className="commerce-app">
      <div className="store-shell">
        <header className="store-header">
          <a href="/workspace" aria-label="Forma workspace">
            <Brand />
          </a>
          <a href="/workspace">Back to workspace</a>
        </header>
        <main className="store-cart">
          <h1>
            {reset
              ? "Reset your password"
              : forgot
                ? "Forgot your password?"
                : "Account settings"}
          </h1>
          {content}
        </main>
      </div>
    </div>
  );
}

/** A settings row: what it is on the left, the card that changes it on the right. */
function SettingsSection({
  title,
  description,
  danger,
  children,
}: {
  title: string;
  description: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`settings-section ${danger ? "is-danger" : ""}`}>
      <div className="settings-section-intro">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
