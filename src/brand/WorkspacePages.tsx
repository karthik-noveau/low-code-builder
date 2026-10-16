import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { Website } from "../studio/Website";
import { slugify, type TemplateId, type Project } from "../studio/model";
import "./brand.css";
import "./public.css";

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
    <div ref={motionRef} className="brand-app brand-public pub-auth">
      <aside className="pub-auth-story">
        <a href="/" aria-label="Forma home">
          <Brand />
        </a>
        <div className="pub-auth-copy">
          <span className="pub-eyebrow">
            <i /> Your website workspace
          </span>
          <h1 style={{ marginTop: 24 }}>
            Everything you need.
            <br />
            <span className="pub-gradient-text">Room to create.</span>
          </h1>
          <p>
            Design, manage, and publish your website from one connected
            workspace.
          </p>
          <div className="pub-auth-points">
            <span>
              <Icon name="check" size={14} /> Visual editor
            </span>
            <span>
              <Icon name="check" size={14} /> Store & inbox
            </span>
            <span>
              <Icon name="check" size={14} /> Your own domain
            </span>
          </div>
        </div>
        <div className="pub-auth-art">
          <TemplateArt template="studio" />
        </div>
      </aside>
      <main className="pub-auth-main" id="main">
        <div className="pub-auth-top">
          <a className="pub-auth-mobile-brand" href="/" aria-label="Forma home">
            <Brand />
          </a>
          <a href="/">← Back to Forma</a>
        </div>
        <div className="pub-auth-card">
          <h2>
            {callback
              ? "Welcome to Forma"
              : signup
                ? "Create your workspace"
                : "Log in to your workspace"}
          </h2>
          <p>
            {signup
              ? "Create a workspace for your ideas, drafts, and websites."
              : "Manage your websites and pick up where you left off."}
          </p>
          {(error || session.error) && (
            <div className="pub-error" role="alert">
              {error || session.error}
            </div>
          )}
          {session.loading ||
          (callback && !!session.account && !session.error) ? (
            <div className="pub-loading" role="status">
              <span />
              Opening your workspace…
            </div>
          ) : !session.config.enabled ? (
            <div className="pub-offline">
              <h3>Your browser is a good place to begin.</h3>
              <p>
                The account service isn't connected right now. You can still
                create, edit, and export a website in this browser.
              </p>
              <a className="pub-btn pub-btn-primary" href="/new">
                Start a browser draft <Arrow />
              </a>
              {session.error && (
                <button className="pub-link" onClick={() => location.reload()}>
                  Try connecting again
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {session.config.mode === "local" ? (
                <>
                  <label className="pub-field">
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
                  <div className="pub-field">
                    <span className="pub-field-row">
                      <label htmlFor="workspace-password">Password</label>
                      {!signup && !callback && (
                        <a href="/account?forgot">Forgot password?</a>
                      )}
                    </span>
                    <span className="pub-password">
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
                  <p className="pub-auth-note">
                    <i />
                    Local workspace · Saved on this computer
                  </p>
                </>
              ) : (
                <p className="pub-auth-note">
                  Continue to secure sign-in. Cloud workspace access is
                  currently by invitation.
                </p>
              )}
              <button className="pub-btn pub-btn-accent" disabled={busy}>
                {busy
                  ? "One moment…"
                  : session.config.mode === "aws"
                    ? "Continue to sign in"
                    : signup
                      ? "Create your workspace"
                      : "Log in"}
                <Arrow />
              </button>
              <p className="pub-auth-switch">
                {signup ? "Already have a workspace?" : "New to Forma?"}{" "}
                <a
                  href={`${signup ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`}
                >
                  {signup ? "Log in" : "Create an account"}
                </a>
              </p>
            </form>
          )}
          <div className="pub-auth-bottom">
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
  const options = [
    ...collections,
    {
      id: "blank" as const,
      name: "Blank",
      category: "Start fresh",
      subtitle: "An empty page and your own ideas.",
      palette: ["#f4f4f5", "#d4d4d8", "#71717a"],
    },
  ];
  const chosen = options.find((item) => item.id === template) ?? options[0];
  const address = name.trim() ? slugify(name.trim()) : "your-website";
  return (
    <AppShell
      area="websites"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: "New website" },
      ]}
    >
      <div className="ns">
        <form className="ns-panel" onSubmit={(event) => void create(event)}>
          <span className="ns-eyebrow">
            <Icon name="sparkles" size={13} /> New website
          </span>
          <h1>Create a website</h1>
          <p className="ns-lede">
            Name it and pick a starting point. You can change both later.
          </p>
          {(error || session.error) && (
            <div role="alert" className="brand-form-error ns-error">
              {error || session.error}
              {browserReady && (
                <a href="/editor">Continue with your browser draft →</a>
              )}
            </div>
          )}
          <label className="ns-name">
            <span>Website name</span>
            <input
              autoFocus
              name="site-name"
              required
              maxLength={120}
              placeholder="e.g. Acme Studio"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                  event.currentTarget.form?.requestSubmit();
              }}
            />
            <small>Shown in the browser tab and your site’s footer.</small>
          </label>
          <div className="ns-choice">
            <span className="ns-choice-label">Starting point</span>
            <div className="ns-choice-head">
              <strong>{chosen.name}</strong>
              <span className="ns-tag">{chosen.category}</span>
            </div>
            <p>{chosen.subtitle}</p>
            <div className="ns-palette" aria-hidden="true">
              {chosen.palette.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </div>
          </div>
          <ul className="ns-includes">
            <li>
              <Icon name="check" size={14} /> Every page and section editable
            </li>
            <li>
              <Icon name="check" size={14} /> Looks right on phones and tablets
            </li>
            <li>
              <Icon name="check" size={14} /> Publish on your own domain
            </li>
          </ul>
          <div className="ns-actions">
            <button
              className="brand-button ns-create"
              disabled={busy || session.loading}
            >
              {busy ? "Creating…" : "Create your website"}
              {!busy && (
                <kbd aria-hidden="true">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"} ↵
                </kbd>
              )}
            </button>
            <p className="ns-note">
              {session.account
                ? "Saved to your workspace."
                : "Starts in your browser. You can connect a workspace later."}{" "}
              Your current browser draft is kept as a recovery copy.
            </p>
          </div>
        </form>
        <section className="ns-stage" aria-label="Preview">
          <div className="ns-browser">
            <div className="ns-browser-bar">
              <span className="ns-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="ns-url">
                <Icon name="lock" size={11} />
                {address}.com
              </span>
              <span className="ns-tab-title">{name.trim() || chosen.name}</span>
            </div>
            <LivePreview template={template} />
          </div>
          <fieldset className="ns-picker">
            <legend>Choose a starting point</legend>
            <div className="ns-picker-row">
              {options.map((item) => (
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
                  <span className="ns-thumb">
                    <TemplateArt template={item.id} eager />
                  </span>
                  <span className="ns-thumb-name">{item.name}</span>
                  <span className="ns-thumb-cat">{item.category}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      </div>
    </AppShell>
  );
}

/**
 * The chosen template rendered for real, scaled to fit, as a still picture:
 * it can't be focused or clicked, and screen readers skip it.
 */
function LivePreview({ template }: { template: TemplateId }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const project = useMemo(() => createProject(template), [template]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  return (
    <div className="ns-viewport" ref={frame} aria-hidden="true" inert>
      {template === "blank" ? (
        <TemplateArt template="blank" eager />
      ) : (
        <div
          key={template}
          className="ns-canvas"
          style={{ transform: `scale(${scale})` }}
        >
          <Website project={project} page={project.pages[0]} preview />
        </div>
      )}
    </div>
  );
}
