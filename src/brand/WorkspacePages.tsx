import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../studio/Icon";
import { useMotionSurface } from "./useMotionSurface";
import { MotionTabs } from "./MotionTabs";
import { Brand, Arrow } from "./Brand";
import { AppShell, PageHeading } from "./AppShell";
import { TemplateArt } from "./TemplateArt";
import { collections } from "./content";
import { useSession } from "./useSession";
import * as cloud from "../cloud/client";
import { createProject } from "../studio/templates";
import { type TemplateId, type Project } from "../studio/model";
import "./brand.css";

import { safeDestination } from "./navigation";

export function AuthPage({
  signup = false,
  callback = false,
}: {
  signup?: boolean;
  callback?: boolean;
}) {
  const motionRef = useMotionSurface<HTMLDivElement>();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = safeDestination(
    new URLSearchParams(location.search).get("next"),
  );
  useEffect(() => {
    if (session.account) location.replace(next);
  }, [session.account, next]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const account = await cloud.signIn(
        signup ? "register" : "login",
        email,
        password,
      );
      if (account) location.assign(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      setBusy(false);
    }
  };
  return (
    <div ref={motionRef} className="brand-app brand-auth">
      <aside className="brand-auth-story">
        <a href="/" aria-label="Forma home">
          <Brand />
        </a>
        <div className="auth-story-copy">
          <span className="brand-kicker">YOUR WEBSITE WORKSPACE</span>
          <h1>
            Everything you need.
            <br />
            <em>Room to create.</em>
          </h1>
          <p>
            Design, manage, and publish your website
            <br />
            from one connected workspace.
          </p>
        </div>
        <div className="auth-art">
          <TemplateArt template="studio" />
        </div>
        <span className="auth-story-footer">
          DESIGN WITH PURPOSE. PUBLISH WITH CONFIDENCE.
        </span>
      </aside>
      <main className="brand-auth-main" id="main">
        <div className="auth-top">
          <a className="auth-mobile-brand" href="/" aria-label="Forma home">
            <Brand />
          </a>
          <a href="/">← Back to Forma</a>
        </div>
        <div className="auth-form-wrap">
          <span className="brand-kicker">
            {signup ? "GET STARTED" : "WELCOME BACK"}
          </span>
          <h2>
            {callback
              ? "Welcome to Forma."
              : signup
                ? "Create your workspace."
                : "Log in to your workspace."}
          </h2>
          <p>
            {signup
              ? "Create a workspace for your ideas, drafts, and websites."
              : "Manage your websites and pick up where you left off."}
          </p>
          {(error || session.error) && (
            <div className="brand-form-error" role="alert">
              {error || session.error}
            </div>
          )}
          {session.loading ||
          (callback && !!session.account && !session.error) ? (
            <div className="brand-loading" role="status">
              <span />
              Opening your workspace…
            </div>
          ) : !session.config.enabled ? (
            <div className="auth-offline">
              <h3>Your browser is a good place to begin.</h3>
              <p>
                The account service isn't connected right now. You can still
                create, edit, and export a website in this browser.
              </p>
              <a className="brand-button" href="/new">
                Start a browser draft <Arrow />
              </a>
              {session.error && (
                <button
                  className="brand-text-link"
                  onClick={() => location.reload()}
                >
                  Try connecting again
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {session.config.mode === "local" ? (
                <>
                  <label className="brand-field">
                    Email address
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <div className="brand-field">
                    <span className="brand-field-row">
                      <label htmlFor="workspace-password">Password</label>
                      {!signup && !callback && (
                        <a className="brand-text-link" href="/account?forgot">
                          Forgot password?
                        </a>
                      )}
                    </span>
                    <span className="brand-password-field">
                      <input
                        id="workspace-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete={
                          signup ? "new-password" : "current-password"
                        }
                        minLength={10}
                        maxLength={128}
                        required
                        placeholder={
                          signup
                            ? "At least 10 characters"
                            : "Your workspace password"
                        }
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </span>
                  </div>
                  <p className="auth-local-note">
                    <span />
                    Local workspace · Saved on this computer
                  </p>
                </>
              ) : (
                <p className="auth-local-note">
                  Continue to secure sign-in. Cloud workspace access is
                  currently by invitation.
                </p>
              )}
              <button className="brand-button auth-submit" disabled={busy}>
                {busy
                  ? "One moment…"
                  : session.config.mode === "aws"
                    ? "Continue to sign in"
                    : signup
                      ? "Create your workspace"
                      : "Log in"}
                <Arrow />
              </button>
              <p className="auth-switch">
                {signup ? "Already have a workspace?" : "New to Forma?"}{" "}
                <a
                  href={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`}
                >
                  {signup ? "Log in" : "Create an account"}
                </a>
              </p>
            </form>
          )}
          <div className="auth-bottom-note">
            Your ideas stay yours. <a href="/privacy">Privacy & data →</a>
          </div>
        </div>
        <footer>
          <span>© {new Date().getFullYear()} Forma</span>
          <a href="/help">Need a hand?</a>
        </footer>
      </main>
    </div>
  );
}
export function Dashboard() {
  const motionRef = useMotionSurface<HTMLDivElement>();
  const session = useSession();
  const [sites, setSites] = useState<cloud.Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All websites");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      setSites((await cloud.listSites()).sites);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your sites could not be loaded.",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!session.account) return;
    let active = true;
    cloud
      .listSites()
      .then((result) => {
        if (active) setSites(result.sites);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Your sites could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.account]);
  const visible = sites
    .filter(
      (site) =>
        site.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "All websites" ||
          (filter === "Published"
            ? !!site.publishedRelease
            : !site.publishedRelease)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const published = sites.filter((site) => !!site.publishedRelease).length;
  return (
    <AppShell
      area="websites"
      crumbs={[{ label: "Workspace" }, { label: "Overview" }]}
      siteCount={sites.length}
      contentRef={motionRef}
    >
      <PageHeading
        title="Websites"
        description={
          session.account && !loading
            ? `${sites.length} ${sites.length === 1 ? "website" : "websites"} · ${published} published · ${Math.max(0, 10 - sites.length)} spaces left`
            : "A home for everything you’re building."
        }
        action={
          <a className="brand-button" href="/new">
            <Icon name="plus" size={15} /> Create website
          </a>
        }
      />
      <div className={`dashboard-body ${session.account ? "" : "is-guest"}`}>
        <div className="dashboard-library">
          {(error || session.error) && (
            <div className="brand-form-error" role="alert">
              {error || session.error}
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {session.loading ? (
            <div className="brand-loading">
              <span />
              Opening your workspace…
            </div>
          ) : !session.account ? (
            <section className="dashboard-welcome">
              <div className="dashboard-welcome-art">
                <TemplateArt template="studio" />
              </div>
              <div>
                <span className="brand-kicker">MAKE YOURSELF AT HOME</span>
                <h2>
                  Your websites,
                  <br />
                  all in one place.
                </h2>
                <p>
                  Sign in to pick up a saved site, or keep creating in the
                  browser. Your browser draft stays right where you left it.
                </p>
                <a className="brand-button" href="/login">
                  Log in to your workspace <Arrow />
                </a>
                <a className="brand-text-link" href="/editor">
                  Continue your browser draft <Arrow />
                </a>
              </div>
            </section>
          ) : (
            <>
              <div className="dashboard-site-toolbar">
                <MotionTabs
                  className="brand-filter-tabs"
                  label="Filter websites"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    {
                      id: "All websites",
                      label: "All websites",
                      count: sites.length,
                    },
                    {
                      id: "Published",
                      label: "Published",
                      count: sites.filter((site) => !!site.publishedRelease)
                        .length,
                    },
                    {
                      id: "Drafts",
                      label: "Drafts",
                      count: sites.filter((site) => !site.publishedRelease)
                        .length,
                    },
                  ]}
                />
                <div>
                  <label className="dashboard-search-wrap">
                    <Icon name="search" size={15} />
                    <input
                      className="dashboard-search"
                      aria-label="Search websites"
                      placeholder="Search websites"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Sort websites"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="recent">Recently edited</option>
                    <option value="name">Name A–Z</option>
                  </select>
                  <button
                    className="dashboard-refresh"
                    aria-label="Refresh websites"
                    disabled={refreshing}
                    onClick={() => void refresh()}
                  >
                    <Icon name="redo" size={17} />
                  </button>
                  <div
                    className="dashboard-view-toggle"
                    aria-label="Website view"
                  >
                    <button
                      aria-label="Grid view"
                      aria-pressed={view === "grid"}
                      onClick={() => setView("grid")}
                    >
                      <Icon name="grid" size={16} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={view === "list"}
                      onClick={() => setView("list")}
                    >
                      <Icon name="alignLeft" size={16} />
                    </button>
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="brand-loading">
                  <span />
                  Finding your websites…
                </div>
              ) : !sites.length ? (
                <section className="dashboard-zero">
                  <div className="dashboard-zero-art">
                    <Brand compact />
                    <span>+</span>
                  </div>
                  <h2>Create your first website.</h2>
                  <p>
                    Choose a template, add your content,
                    <br />
                    and make it yours.
                  </p>
                  <a className="brand-button" href="/new">
                    Create your first website <Arrow />
                  </a>
                  <a className="brand-text-link" href="/editor">
                    Already working on a browser draft? Open it here.
                  </a>
                </section>
              ) : (
                <>
                  <div
                    className={`dashboard-site-grid ${view === "list" ? "is-list" : ""}`}
                  >
                    {visible.map((site) => (
                      <article
                        className="dashboard-site-card"
                        key={site.id}
                        data-reveal
                      >
                        <a
                          className="site-card-preview"
                          href={`/editor?site=${site.id}`}
                          aria-label={`Edit ${site.name}`}
                        >
                          {site.template && site.template !== "blank" ? (
                            <TemplateArt template={site.template} />
                          ) : (
                            // No template to show: a calm initial instead of
                            // blank-page art that reads as an "add" button.
                            <span
                              className="site-card-monogram"
                              style={{
                                ["--monogram-hue" as string]: `${[...site.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360}`,
                              }}
                            >
                              {site.name.trim()[0]?.toUpperCase() || "W"}
                            </span>
                          )}
                          <span className="site-card-preview-overlay">
                            Open editor <Arrow diagonal />
                          </span>
                        </a>
                        <div className="dashboard-site-card-body">
                          <div>
                            <h2>
                              <a href={`/editor?site=${site.id}`}>
                                {site.name}
                              </a>
                            </h2>
                            <span
                              className={`dashboard-site-status ${site.publishedRelease ? "is-live" : ""}`}
                            >
                              {["queued", "publishing"].includes(site.status)
                                ? "Publishing"
                                : site.publishedRelease
                                  ? "Published"
                                  : "Draft"}
                            </span>
                          </div>
                          <p>
                            Edited{" "}
                            {new Date(site.updatedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}{" "}
                            <span>·</span> Version {site.version}
                          </p>
                          <div className="dashboard-site-actions">
                            <a
                              className="dashboard-site-primary"
                              href={`/editor?site=${site.id}`}
                            >
                              Open editor
                            </a>
                            <a href={`/domains?site=${site.id}`}>Domains</a>
                            <a href={`/commerce?site=${site.id}`}>Store</a>
                            {site.url && (
                              <a
                                href={site.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Visit <Arrow diagonal />
                              </a>
                            )}
                          </div>
                          {site.error && (
                            <small className="dashboard-site-error">
                              Last publish needs attention. Open the editor to
                              review it.
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  {!visible.length && (
                    <p className="brand-muted">
                      No websites match this search. Try another name or filter.
                    </p>
                  )}
                </>
              )}
              <p className="dashboard-quota">
                {sites.length} of 10 website spaces used <span>·</span> Changes
                stay in your draft until you publish.
              </p>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
export function NewWebsite() {
  const session = useSession();
  const requested = new URLSearchParams(location.search).get("template");
  const initial =
    collections.some((item) => item.id === requested) || requested === "blank"
      ? (requested as TemplateId)
      : "botanical";
  const [template, setTemplate] = useState<TemplateId>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [browserReady, setBrowserReady] = useState(false);
  const created = useRef<cloud.Site | undefined>(undefined);
  const prepared = useRef<{ key: string; project: Project } | undefined>(
    undefined,
  );
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const key = JSON.stringify([template, name.trim()]);
      if (prepared.current?.key !== key) {
        const project = createProject(template);
        project.name = name.trim();
        project.pages.forEach((page) => {
          page.title = `${page.name} — ${project.name}`;
        });
        prepared.current = { key, project };
      }
      const project = prepared.current.project;
      const current = localStorage.getItem("forma-studio-project-v1");
      if (current && !browserReady)
        localStorage.setItem("forma-workspace-recovery", current);
      localStorage.setItem("forma-studio-project-v1", JSON.stringify(project));
      setBrowserReady(true);
      if (session.account) {
        if (!created.current)
          created.current = (await cloud.createSite(project.name)).site;
        const saved = await cloud.saveDraft(created.current, project);
        created.current = saved.site;
        location.assign(`/editor?site=${saved.site.id}`);
      } else location.assign("/editor");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your website could not be created.",
      );
      setBusy(false);
    }
  };
  return (
    <AppShell
      area="websites"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: "New website" },
      ]}
    >
      <PageHeading
        title="Create a website"
        description="Name it and pick a starting point. You can change both later."
      />
      {(error || session.error) && (
        <div role="alert" className="brand-form-error new-site-error">
          {error || session.error}
          {browserReady && (
            <a href="/editor">Continue with your browser draft →</a>
          )}
        </div>
      )}
      <form className="new-site" onSubmit={(event) => void create(event)}>
        <section className="commerce-panel new-site-name">
          <label className="brand-field">
            Website name
            <input
              autoFocus
              name="site-name"
              required
              maxLength={120}
              placeholder="e.g. Acme Studio"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </section>
        <fieldset className="new-site-templates">
          <legend>Starting point</legend>
          <div className="new-site-grid">
            {[
              ...collections,
              {
                id: "blank" as const,
                name: "Blank",
                category: "Start from an empty page",
              },
            ].map((item) => (
              <label
                key={item.id}
                className={template === item.id ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="template"
                  value={item.id}
                  checked={template === item.id}
                  onChange={() => setTemplate(item.id)}
                />
                <span className="new-site-thumb">
                  <TemplateArt template={item.id} eager />
                </span>
                <span className="new-site-caption">
                  <strong>{item.name}</strong>
                  <small>{item.category}</small>
                </span>
                <span className="new-site-check" aria-hidden="true">
                  <Icon name="check" size={13} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <footer className="new-site-footer">
          <p>
            {session.account
              ? "Saved to your workspace."
              : "Starts in your browser. You can connect a workspace later."}{" "}
            Your current browser draft is kept as a recovery copy.
          </p>
          <button className="brand-button" disabled={busy || session.loading}>
            {busy ? "Creating…" : "Create your website"}
          </button>
        </footer>
      </form>
    </AppShell>
  );
}
