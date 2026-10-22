import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Modal } from "../studio/ui";
import { Icon } from "../studio/Icon";
import { useStudio } from "../studio/store";
import { validateProject } from "../studio/model";
import { createProject } from "../studio/templates";
import * as cloud from "./client";
import "./cloud.css";

export function CloudWorkspace({
  initialSiteId,
}: { initialSiteId?: string } = {}) {
  const project = useStudio((s) => s.project);
  const [config, setConfig] = useState<cloud.CloudConfig>({ enabled: false });
  const [account, setAccount] = useState<cloud.Account>();
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sites, setSites] = useState<cloud.Site[]>([]);
  const [active, setActive] = useState<cloud.Site>();
  const [history, setHistory] = useState<cloud.Release[]>([]);
  const [pendingOpen, setPendingOpen] = useState<cloud.Site>();
  const [busy, setBusy] = useState(false);
  const [openingProject, setOpeningProject] = useState(!!initialSiteId);
  const [error, setError] = useState("");
  const [sync, setSync] = useState("Saved in browser");
  const activeRef = useRef<cloud.Site | undefined>(undefined);
  const lastSaved = useRef("");
  const paused = useRef(false);
  const working = useRef(false);
  const generation = useRef(0);
  const bind = useCallback((site?: cloud.Site) => {
    activeRef.current = site;
    setActive(site);
    if (location.pathname === "/editor") {
      const url = new URL(location.href);
      if (site) url.searchParams.set("site", site.id);
      else url.searchParams.delete("site");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);
  const report = useCallback((error: unknown) => {
    setError(
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.",
    );
    if (error instanceof cloud.ApiError && [409, 401].includes(error.status))
      paused.current = true;
  }, []);
  useEffect(() => {
    let alive = true;
    cloud
      .initializeCloud()
      .then((result) => {
        if (alive) {
          setConfig(result.config);
          setAccount(result.account);
          if (initialSiteId && !result.account) {
            setOpen(true);
            setOpeningProject(false);
          }
        }
      })
      .catch((error) => {
        if (alive) {
          report(error);
          setOpeningProject(false);
          if (initialSiteId) setOpen(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [report, initialSiteId]);
  useEffect(() => {
    if (!account || !initialSiteId) return;
    if (
      location.pathname === "/editor" &&
      new URLSearchParams(location.search).get("site") !== initialSiteId
    )
      return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!/^[a-f0-9-]{36}$/i.test(initialSiteId))
          throw new Error(
            "This website link is invalid. Open a site from Your websites.",
          );
        const latest = (await cloud.siteStatus(initialSiteId)).site;
        // A site whose first save never landed starts from its template and is
        // saved on the next autosave, instead of stopping on an error.
        const draft = await cloud.loadDraft(initialSiteId).catch((error) => {
          if (!(error instanceof cloud.ApiError) || error.status !== 404)
            throw error;
          const project = createProject(latest.template ?? "blank");
          return {
            project: { ...project, name: latest.name || project.name },
            version: latest.version,
            fresh: true,
          };
        });
        if (cancelled) return;
        if (latest.version !== draft.version)
          throw new Error(
            "The draft changed while opening. Refresh to try again.",
          );
        const current = JSON.stringify(useStudio.getState().project);
        const incoming = JSON.stringify(draft.project);
        if (current !== incoming) {
          try {
            localStorage.setItem("forma-workspace-recovery", current);
          } catch {
            throw new Error(
              "There is no room for a browser backup. Export your current draft before opening another site.",
            );
          }
        }
        generation.current++;
        lastSaved.current = "fresh" in draft ? "" : incoming;
        paused.current = false;
        useStudio.getState().importProject(draft.project);
        bind(latest);
        setSync("Saved to workspace");
      } catch (error) {
        if (!cancelled) {
          report(error);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setOpeningProject(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [account, initialSiteId, bind, report]);
  const refresh = useCallback(async () => {
    const result = await cloud.listSites();
    setSites(result.sites);
    if (activeRef.current) {
      const current = result.sites.find((s) => s.id === activeRef.current?.id);
      // A status refresh must not silently adopt a newer draft version and overwrite it.
      if (current && current.version === activeRef.current.version)
        bind(current);
      const published = await cloud.releases(activeRef.current.id);
      setHistory(published.releases);
    }
  }, [bind]);
  useEffect(() => {
    if (open && account) void refresh().catch(report);
  }, [open, account, refresh, report]);
  const save = useCallback(async () => {
    const site = activeRef.current;
    if (!site) throw new Error("Save this draft as a site first.");
    const snapshot = useStudio.getState().project;
    const text = JSON.stringify(snapshot);
    if (lastSaved.current === text) return site;
    setSync("Saving…");
    const result = await cloud.saveDraft(site, snapshot);
    bind(result.site);
    lastSaved.current = text;
    paused.current = false;
    setSync(
      config.mode === "local"
        ? "Saved to local workspace"
        : "Saved to workspace",
    );
    return result.site;
  }, [bind, config.mode]);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      setError("");
      try {
        await action();
      } catch (error) {
        report(error);
        setSync("Edits kept in browser");
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [report],
  );
  useEffect(() => {
    if (
      !account ||
      !active ||
      paused.current ||
      ["queued", "publishing"].includes(active.status)
    )
      return;
    if (JSON.stringify(project) === lastSaved.current) return;
    const timer = setTimeout(() => {
      if (!working.current && !paused.current)
        void run(async () => {
          await save();
        });
    }, 10000);
    return () => clearTimeout(timer);
  }, [project, active, account, save, run]);
  const activeId = active?.id;
  const activeStatus = active?.status;
  useEffect(() => {
    if (
      !activeId ||
      !activeStatus ||
      !["queued", "publishing"].includes(activeStatus)
    )
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const id = activeId;
    const turn = generation.current;
    const poll = async () => {
      if (stopped || generation.current !== turn) return;
      if (document.hidden) {
        timer = setTimeout(poll, 10000);
        return;
      }
      try {
        const result = await cloud.siteStatus(id);
        if (stopped || generation.current !== turn) return;
        bind(result.site);
        if (!["queued", "publishing"].includes(result.site.status)) {
          if (result.site.error) setError(result.site.error);
          await refresh();
          return;
        }
      } catch (error) {
        report(error);
      }
      if (++count < 30)
        timer = setTimeout(
          poll,
          Math.min(10000, 2000 * 2 ** Math.min(count, 3)),
        );
      else
        setError(
          "Publishing is taking longer than usual. Use Refresh to check its status.",
        );
    };
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeId, activeStatus, bind, refresh, report]);
  const authenticate = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const user = await cloud.signIn(authMode, email, password);
      setPassword("");
      if (user) setAccount(user);
    });
  };
  const create = () =>
    run(async () => {
      const result = await cloud.createSite(useStudio.getState().project.name);
      bind(result.site);
      lastSaved.current = "";
      paused.current = false;
      generation.current++;
      await save();
      await refresh();
    });
  const openSite = (site: cloud.Site) =>
    run(async () => {
      const draft = await cloud.loadDraft(site.id);
      const latest = (await cloud.siteStatus(site.id)).site;
      if (latest.version !== draft.version)
        throw new Error("The draft changed while opening. Please try again.");
      try {
        localStorage.setItem(
          "forma-workspace-recovery",
          JSON.stringify(useStudio.getState().project),
        );
      } catch {
        throw new Error(
          "There is no room for a browser backup. Export your current draft before switching sites.",
        );
      }
      generation.current++;
      lastSaved.current = JSON.stringify(draft.project);
      paused.current = false;
      useStudio.getState().importProject(draft.project);
      bind(latest);
      setPendingOpen(undefined);
      setSync(
        config.mode === "local"
          ? "Saved to local workspace"
          : "Saved to workspace",
      );
      await refresh();
    });
  const publish = (
    action: "publish" | "rollback" | "unpublish",
    releaseId?: string,
  ) =>
    run(async () => {
      const site = action === "publish" ? await save() : activeRef.current;
      if (!site) throw new Error("Save this draft as a site first.");
      bind((await cloud.publish(site, action, releaseId)).site);
    });
  const publishing = active && ["queued", "publishing"].includes(active.status);
  return (
    <>
      {openingProject && (
        <div className="brand-open-project" role="status">
          Opening your website…
        </div>
      )}
      <button
        className="preview-button workspace-trigger"
        onClick={() => setOpen(true)}
        title={sync}
        aria-label="Open workspace"
      >
        <Icon name="globe" size={16} />
        <span>Workspace</span>
        {active && <i className={error ? "has-error" : ""} />}
      </button>
      <button
        className="primary-button cloud-publish-trigger"
        onClick={() => setOpen(true)}
      >
        <Icon name="arrowUpRight" size={15} />
        Publish
      </button>
      {open && (
        <Modal
          title={account ? "Your workspace" : "A home for your websites"}
          subtitle={
            config.mode === "local"
              ? "Local development · Your data stays on this computer"
              : "Save your work. Publish when you’re ready."
          }
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          wide
        >
          <div className="cloud-workspace">
            {error && (
              <div className="cloud-error" role="alert">
                {error}
              </div>
            )}
            {!config.enabled ? (
              <div className="cloud-empty">
                <Icon name="globe" size={30} />
                <h3>Connect your workspace</h3>
                <p>
                  Start the local workspace to save sites and publish previews
                  on this computer.
                </p>
                <code>
                  npm run local:setup
                  <br />
                  npm run dev:local
                </code>
                <p>Your current draft stays saved in this browser.</p>
              </div>
            ) : !account ? (
              <form className="cloud-auth" onSubmit={authenticate}>
                <h3>
                  {authMode === "login"
                    ? "Welcome back"
                    : "Create your workspace"}
                </h3>
                <p>
                  {config.mode === "local"
                    ? "Use a local account to try the complete editing and publishing flow."
                    : "Continue securely to your account."}
                </p>
                {config.mode === "local" && (
                  <>
                    <label>
                      Email
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        autoComplete={
                          authMode === "login"
                            ? "current-password"
                            : "new-password"
                        }
                        minLength={10}
                        maxLength={128}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                  </>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : authMode === "login"
                      ? "Sign in"
                      : "Create local account"}
                </button>
                {config.mode === "local" && (
                  <button
                    type="button"
                    className="cloud-text-button"
                    onClick={() => {
                      setAuthMode(authMode === "login" ? "register" : "login");
                      setError("");
                    }}
                  >
                    {authMode === "login"
                      ? "New here? Create a local account"
                      : "Already have an account? Sign in"}
                  </button>
                )}
              </form>
            ) : (
              <>
                <div className="cloud-account">
                  <span>
                    <span className="cloud-avatar">
                      {account.email.slice(0, 1).toUpperCase()}
                    </span>
                    {account.email}
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await cloud.signOut();
                        generation.current++;
                        bind(undefined);
                        setAccount(undefined);
                        setSites([]);
                        setHistory([]);
                        setSync("Saved in browser");
                      })
                    }
                  >
                    Sign out
                  </button>
                </div>
                <section className="cloud-current">
                  <div className="cloud-section-heading">
                    <div>
                      <span className="cloud-eyebrow">CURRENT DRAFT</span>
                      <h3>{project.name}</h3>
                    </div>
                    <span
                      className={`cloud-status ${active?.publishedRelease ? "is-live" : ""}`}
                    >
                      {publishing
                        ? "Publishing…"
                        : active?.publishedRelease
                          ? "Live"
                          : "Draft"}
                    </span>
                  </div>
                  <p aria-live="polite">
                    {sync}
                    {active
                      ? ` · Version ${active.version}`
                      : " · Not linked to a workspace site"}
                  </p>
                  {active && (
                    <a
                      className="cloud-live-link"
                      href={`/domains?site=${active.id}`}
                    >
                      Domains & publishing{" "}
                      <Icon name="arrowUpRight" size={14} />
                    </a>
                  )}
                  {active?.url && (
                    <a
                      className="cloud-live-link"
                      href={active.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit published website{" "}
                      <Icon name="arrowUpRight" size={14} />
                    </a>
                  )}
                  <div className="cloud-actions">
                    {active ? (
                      <>
                        <button
                          disabled={busy || !!publishing}
                          onClick={() =>
                            void run(async () => {
                              await save();
                              await refresh();
                            })
                          }
                        >
                          Save now
                        </button>
                        <button
                          className="primary-button"
                          disabled={busy || !!publishing}
                          onClick={() => void publish("publish")}
                        >
                          {publishing ? "Publishing…" : "Publish changes"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void create()}
                      >
                        Save as a new site
                      </button>
                    )}
                    {active && (
                      <button
                        disabled={busy || !!publishing}
                        onClick={() => void create()}
                      >
                        Save as new site
                      </button>
                    )}
                    <button disabled={busy} onClick={() => void run(refresh)}>
                      Refresh
                    </button>
                  </div>
                  {active && (
                    <small>
                      Edits save after 10 seconds of inactivity. Publishing is
                      always your choice.
                    </small>
                  )}
                </section>
                {pendingOpen && (
                  <div className="cloud-confirm">
                    <p>
                      Open “{pendingOpen.name}”? Your current draft will be kept
                      as a browser recovery copy.
                    </p>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void openSite(pendingOpen)}
                    >
                      Keep backup & open
                    </button>
                    <button onClick={() => setPendingOpen(undefined)}>
                      Cancel
                    </button>
                  </div>
                )}
                <section>
                  <div className="cloud-section-heading">
                    <h3>Saved sites</h3>
                    <span>{sites.length} / 10</span>
                  </div>
                  {sites.length === 0 ? (
                    <p className="cloud-muted">
                      Your first saved site will appear here.
                    </p>
                  ) : (
                    <div className="cloud-site-list">
                      {sites.map((site) => (
                        <div key={site.id}>
                          <span className="cloud-site-icon">
                            <Icon name="globe" size={20} />
                          </span>
                          <div>
                            <strong>{site.name}</strong>
                            <small>
                              Version {site.version} ·{" "}
                              {site.publishedRelease ? "Published" : "Draft"}
                            </small>
                          </div>
                          <button
                            disabled={busy || !!publishing}
                            onClick={() => setPendingOpen(site)}
                          >
                            {site.id === active?.id ? "Reload saved" : "Open"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                {!!history.length && active && (
                  <section>
                    <div className="cloud-section-heading">
                      <h3>Release history</h3>
                      <span>Last 3 releases</span>
                    </div>
                    <p className="cloud-muted">
                      Rollback changes the live website. Your editable draft
                      stays as it is.
                    </p>
                    <div className="cloud-release-list">
                      {history.map((release) => (
                        <div key={release.id}>
                          <div>
                            <strong>Draft version {release.version}</strong>
                            <small>
                              {new Date(release.createdAt).toLocaleString()}
                            </small>
                          </div>
                          {release.id === active.publishedRelease ? (
                            <span className="cloud-status is-live">Live</span>
                          ) : (
                            <button
                              disabled={busy || !!publishing}
                              onClick={() =>
                                void publish("rollback", release.id)
                              }
                            >
                              Restore release
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {active.publishedRelease && (
                      <details className="cloud-unpublish">
                        <summary>Take this website offline</summary>
                        <p>
                          The live URL will stop serving pages. Your draft and
                          retained releases remain available.
                        </p>
                        <button
                          disabled={busy || !!publishing}
                          onClick={() => void publish("unpublish")}
                        >
                          Unpublish website
                        </button>
                      </details>
                    )}
                  </section>
                )}
                <button
                  className="cloud-text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const saved = localStorage.getItem(
                        "forma-workspace-recovery",
                      );
                      if (!saved)
                        throw new Error("No recovery copy is available yet.");
                      const value: unknown = JSON.parse(saved);
                      if (!validateProject(value))
                        throw new Error("The recovery copy is invalid.");
                      generation.current++;
                      bind(undefined);
                      lastSaved.current = "";
                      useStudio.getState().importProject(value);
                      setSync("Recovered browser draft");
                    })
                  }
                >
                  Recover previous browser draft
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
