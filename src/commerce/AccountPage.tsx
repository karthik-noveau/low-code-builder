import { useState } from "react";
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
  const submit = async (path: string, input: unknown, logout = false) => {
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
        location.assign("/login");
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
            Account security is managed through your configured identity
            provider.
          </p>
          <a href="/login">Open sign-in</a>
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
            The local environment captures recovery emails in a private mail
            directory. It does not send email.
          </p>
          <label className="commerce-field">
            Account email
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <button className="commerce-button" disabled={busy}>
            Create recovery email preview
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
                true,
              );
            }}
          >
            <h2>Change password</h2>
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
            <p className="commerce-muted">
              Changing your password signs out all existing sessions.
            </p>
            <button className="commerce-button" disabled={busy}>
              Update password
            </button>
          </form>
          <form
            className="commerce-panel commerce-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              void submit(
                "/account/logout-all",
                { currentPassword: fields.get("current") },
                true,
              );
            }}
          >
            <h2>Sign out every session</h2>
            <label className="commerce-field">
              Confirm your password
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="commerce-button secondary" disabled={busy}>
              Sign out all sessions
            </button>
          </form>
          <details className="commerce-panel">
            <summary>Delete local account</summary>
            <form
              className="commerce-form"
              style={{ marginTop: 20 }}
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                void submit(
                  "/account/delete",
                  {
                    currentPassword: fields.get("current"),
                    confirmation: fields.get("confirmation"),
                  },
                  true,
                );
              }}
            >
              <p className="commerce-muted">
                Delete your owned websites first from Store management → Usage &
                activity. Export any records you want to keep. Account deletion
                revokes sessions and collaborator access.
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
              <button className="commerce-button danger" disabled={busy}>
                Permanently delete local account
              </button>
            </form>
          </details>
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
