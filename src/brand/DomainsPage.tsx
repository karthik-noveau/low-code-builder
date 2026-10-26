import { useEffect, useState, useRef, type FormEvent } from "react";
import { AppShell, PageHeading } from "./AppShell";
import { Arrow } from "./Brand";
import { useSession } from "./useSession";
import * as cloud from "../cloud/client";
import { Icon } from "../studio/Icon";
import "./domains.css";

const labels: Record<cloud.DomainConnection["status"], string> = {
  ownership: "Verify ownership",
  certificate: "Securing (HTTPS)",
  deploying: "Getting your domain ready",
  dns: "Point your domain here",
  connected: "Connected",
  disconnected: "Disconnected",
  failed: "Needs attention",
  removing: "Removing connection",
  removed: "Removed",
};
const steps = [
  "Add domain",
  "Verify ownership",
  "Secure with HTTPS",
  "Point your domain",
  "Publish",
];

/** How far setup has come: the index of the step being worked on. */
const STEP_FOR: Record<string, number> = {
  ownership: 1,
  certificate: 2,
  deploying: 2,
  dns: 3,
  connected: 4,
};
function progress(domains: cloud.DomainConnection[], site?: cloud.Site) {
  const at = Math.max(0, ...domains.map((d) => STEP_FOR[d.status] ?? 0));
  return at === 4 && site?.publishedRelease ? 5 : at;
}
export function DomainsPage({ siteId }: { siteId: string }) {
  const session = useSession();
  const [site, setSite] = useState<cloud.Site>();
  const [domains, setDomains] = useState<cloud.DomainConnection[]>([]);
  const [releases, setReleases] = useState<cloud.Release[]>([]);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState("");
  const working = useRef(false);
  const refresh = async () => {
    const [saved, connections, history] = await Promise.all([
      cloud.siteStatus(siteId),
      cloud.listDomains(siteId),
      cloud.releases(siteId),
    ]);
    setSite(saved.site);
    setDomains(connections.domains);
    setReleases(history.releases);
  };
  useEffect(() => {
    if (!session.account || !siteId) return;
    let active = true;
    Promise.all([
      cloud.siteStatus(siteId),
      cloud.listDomains(siteId),
      cloud.releases(siteId),
    ])
      .then(([saved, connections, history]) => {
        if (active) {
          setSite(saved.site);
          setDomains(connections.domains);
          setReleases(history.releases);
        }
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load this website.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.account, siteId]);
  const status = site?.status;
  useEffect(() => {
    if (!siteId || !status || !["queued", "publishing"].includes(status))
      return;
    let stopped = false,
      count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const result = await cloud.siteStatus(siteId);
          if (stopped) return;
          setSite(result.site);
          if (!["queued", "publishing"].includes(result.site.status)) {
            const result = await cloud.releases(siteId);
            if (!stopped) setReleases(result.releases);
            return;
          }
        } catch (error) {
          if (!stopped)
            setError(
              error instanceof Error
                ? error.message
                : "Could not check publishing.",
            );
        }
      }
      if (++count < 30)
        timer = setTimeout(
          poll,
          Math.min(15000, 2000 * 2 ** Math.min(count, 3)),
        );
    };
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [siteId, status]);
  const run = async (name: string, action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setConfirm("");
    } catch (error) {
      setNotice("");
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      working.current = false;
      setBusy("");
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    void run("add", async () => {
      // People paste whole addresses; keep just the hostname.
      const clean = hostname
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase();
      await cloud.addDomain(siteId, clean);
      setHostname("");
    });
  };
  const action = (
    domain: cloud.DomainConnection,
    operation: "check" | "retry" | "disconnect" | "primary" | "remove",
  ) =>
    run(domain.id, async () => {
      await cloud.domainAction(siteId, domain.id, operation);
    });
  const publish = (
    operation: "publish" | "rollback" | "unpublish",
    releaseId?: string,
  ) =>
    run("publish", async () => {
      if (!site) return;
      setSite((await cloud.publish(site, operation, releaseId)).site);
    });
  const exportDns = (domain: cloud.DomainConnection) => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { hostname: domain.hostname, records: domain.records },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forma-dns-${domain.hostname}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Clipboard is unavailable. Select and copy the value directly.");
    }
  };
  const publishing = !!site && ["queued", "publishing"].includes(site.status);
  return (
    <AppShell
      area="websites"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        ...(site ? [{ label: site.name }] : []),
        { label: "Domains & publishing" },
      ]}
    >
      <div className="domain-page">
        <PageHeading
          kicker={site?.name}
          title="Domains & publishing"
          description="Manage your domain, publish updates, and keep track of releases."
          action={
            site && (
              <a
                className="brand-button brand-button-outline"
                href={`/editor?site=${site.id}`}
              >
                Back to the editor <Arrow />
              </a>
            )
          }
        />
        <ol className="domain-steps" aria-label="Setup progress">
          {steps.map((step, index) => {
            const at = progress(domains, site);
            const state =
              index < at ? "done" : index === at ? "current" : "upcoming";
            return (
              <li
                key={step}
                className={`is-${state}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span>
                  {state === "done" ? (
                    <Icon name="check" size={13} />
                  ) : (
                    index + 1
                  )}
                </span>
                {step}
              </li>
            );
          })}
        </ol>
        {(error || session.error || site?.error) && (
          <div className="brand-form-error" role="alert">
            {error || session.error || site?.error}
          </div>
        )}
        {notice && (
          <p className="domain-notice" role="status">
            {notice}
          </p>
        )}
        {session.loading ? (
          <div className="brand-loading">Opening your workspace…</div>
        ) : !session.account ? (
          <section className="domain-panel">
            <h2>Log in to manage your domains.</h2>
            <p>Your domains belong to the workspace that owns the website.</p>
            <a
              className="brand-button"
              href={`/login?next=${encodeURIComponent(`/domains?site=${siteId}`)}`}
            >
              Log in <Arrow />
            </a>
          </section>
        ) : !siteId ? (
          <section className="domain-panel">
            <h2>Choose a website first.</h2>
            <a className="brand-button" href="/workspace">
              Your websites <Arrow />
            </a>
          </section>
        ) : loading ? (
          <div className="brand-loading">Loading domain settings…</div>
        ) : !site ? (
          <a className="brand-button" href="/workspace">
            Back to your websites
          </a>
        ) : (
          <>
            {session.config.mode === "local" && (
              <aside className="domain-local-banner">
                <strong>Practice mode</strong>
                <p>
                  This is a safe rehearsal. Nothing changes on the real
                  internet and your domain provider isn’t contacted. Follow the
                  steps to see exactly how connecting a domain works.
                </p>
              </aside>
            )}
            <div className="domain-layout">
              <div className="domain-connections">
                <section className="domain-panel">
                  <div className="domain-panel-heading">
                    <div>
                      <h2>Connect your domain</h2>
                    </div>
                    <span>{domains.length} of 2 domains</span>
                  </div>
                  <p>
                    Use your main domain (mybakery.com) or a subdomain such as
                    www.mybakery.com. Add each one separately if you want both.
                  </p>
                  <form onSubmit={add} className="domain-add">
                    <label className="brand-field">
                      Domain name
                      <input
                        name="hostname"
                        placeholder="www.yourdomain.com"
                        required
                        maxLength={253}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={hostname}
                        onChange={(event) => setHostname(event.target.value)}
                        disabled={!!busy || domains.length >= 2}
                        aria-describedby="domain-hint"
                      />
                    </label>
                    <button
                      className="brand-button"
                      disabled={!!busy || domains.length >= 2}
                    >
                      {busy === "add" ? "Adding…" : "Add domain"}
                      <Arrow />
                    </button>
                  </form>
                  <p id="domain-hint" className="domain-small">
                    Just the address, like www.mybakery.com. No https:// or
                    slash needed.
                  </p>
                  <p className="domain-small">
                    Keep DNS with your existing provider. Domain registration
                    and renewal are separate from hosting.
                  </p>
                </section>
                {domains.map((domain) => (
                  <section
                    className="domain-panel domain-connection"
                    key={domain.id}
                  >
                    <div className="domain-panel-heading">
                      <h2>{domain.hostname}</h2>
                      <span className={`domain-status is-${domain.status}`}>
                        {labels[domain.status]}
                      </span>
                    </div>
                    {site.primaryDomain === domain.hostname && (
                      <p className="domain-primary">Primary website address</p>
                    )}
                    {domain.message && <p role="status">{domain.message}</p>}
                    <button
                      className="brand-text-link domain-export"
                      onClick={() => exportDns(domain)}
                    >
                      Download DNS records <Arrow />
                    </button>
                    <div className="domain-dns-list">
                      {domain.records.map((record) => (
                        <div className="domain-dns-record" key={record.purpose}>
                          <header>
                            <strong>
                              {record.purpose === "ownership"
                                ? "1. Prove you own this domain"
                                : record.purpose === "certificate"
                                  ? "2. Secure your site with HTTPS"
                                  : "3. Send visitors to your website"}
                            </strong>
                            <span title="Choose this in your domain provider’s record type menu">
                              Type: {record.type}
                            </span>
                          </header>
                          <dl>
                            <div>
                              <dt>Name / host</dt>
                              <dd>
                                <code>{record.name}</code>
                                <button
                                  onClick={() => void copy(record.name)}
                                  aria-label={`Copy ${record.purpose} DNS name`}
                                >
                                  Copy
                                </button>
                              </dd>
                            </div>
                            <div>
                              <dt>Value / target</dt>
                              <dd>
                                <code>{record.value}</code>
                                <button
                                  onClick={() => void copy(record.value)}
                                  aria-label={`Copy ${record.purpose} DNS value`}
                                >
                                  Copy
                                </button>
                              </dd>
                            </div>
                          </dl>
                          {record.type === "ALIAS" && (
                            <>
                              <p>
                                Your main domain (without www) needs an ALIAS
                                record. Some providers call it ANAME or “CNAME
                                flattening”. If yours doesn’t offer it, connect
                                www.yourdomain.com instead.
                              </p>
                              <details>
                                <summary>Using Amazon Route 53?</summary>
                                <p>
                                  Create an A and an AAAA alias record pointing
                                  to the value above, with hosted zone ID{" "}
                                  <code>Z2FDTNDATAQYW2</code>.
                                </p>
                              </details>
                            </>
                          )}
                          {record.purpose === "certificate" && (
                            <p>
                              Leave this record in place: it keeps your HTTPS
                              certificate renewing automatically. If your
                              provider has a proxy option (an orange cloud on
                              Cloudflare), turn it off for this record.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {domain.local && (
                      <details className="domain-simulator">
                        <summary>Practice: add these records for me</summary>
                        <p>
                          In practice mode, this stands in for adding the
                          records at your domain provider. Then choose Check
                          connection. Repeat when new records appear.
                        </p>
                        <button
                          className="brand-button brand-button-outline"
                          disabled={!!busy}
                          onClick={() =>
                            void run(domain.id, async () => {
                              await cloud.saveLocalDns(
                                siteId,
                                domain.id,
                                domain.records,
                              );
                              setNotice(
                                "Records added. Choose Check connection to continue.",
                              );
                            })
                          }
                        >
                          Pretend I’ve added these records
                        </button>
                        <button
                          className="brand-text-link"
                          disabled={!!busy}
                          onClick={() =>
                            void run(domain.id, async () => {
                              await cloud.saveLocalDns(siteId, domain.id, []);
                              setNotice("Practice records removed.");
                            })
                          }
                        >
                          Remove practice records
                        </button>
                      </details>
                    )}
                    <div className="domain-actions">
                      <button
                        className="brand-button"
                        disabled={!!busy}
                        onClick={() =>
                          void action(
                            domain,
                            domain.status === "failed" ? "retry" : "check",
                          )
                        }
                      >
                        {busy === domain.id
                          ? "Checking…"
                          : domain.status === "failed"
                            ? "Try again"
                            : domain.status === "disconnected"
                              ? "Reconnect domain"
                              : "Check connection"}
                        <Arrow />
                      </button>
                      {domain.status === "connected" && (
                        <>
                          <button
                            className="brand-button brand-button-outline"
                            disabled={
                              !!busy || site.primaryDomain === domain.hostname
                            }
                            onClick={() => void action(domain, "primary")}
                          >
                            {site.primaryDomain === domain.hostname
                              ? "Primary address"
                              : "Make primary"}
                          </button>
                          {site.publishedRelease && (
                            <a
                              className="brand-text-link"
                              href={domain.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {domain.local
                                ? "Preview on this domain"
                                : "Visit website"}{" "}
                              <Arrow diagonal />
                            </a>
                          )}
                        </>
                      )}
                      {!["disconnected", "ownership", "removing"].includes(
                        domain.status,
                      ) && (
                        <button
                          className="brand-text-link"
                          disabled={!!busy}
                          onClick={() => setConfirm(`disconnect:${domain.id}`)}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    {confirm === `disconnect:${domain.id}` && (
                      <div className="domain-confirm">
                        <p>
                          Visitors to {domain.hostname} won’t see your website
                          until you reconnect it. Your website stays live at
                          its default address.
                        </p>
                        <button
                          className="brand-button"
                          disabled={!!busy}
                          onClick={() => void action(domain, "disconnect")}
                        >
                          Disconnect domain
                        </button>
                        <button
                          className="brand-text-link"
                          onClick={() => setConfirm("")}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <details className="domain-remove">
                      <summary>Remove this domain</summary>
                      <p>
                        Removes {domain.hostname} from this website for good
                        (Disconnect only pauses it). Your website and its
                        published versions stay saved. Afterwards, delete the
                        records you added at your domain provider.
                      </p>
                      <button
                        className="brand-button brand-button-outline"
                        disabled={!!busy}
                        onClick={() => void action(domain, "remove")}
                      >
                        Remove {domain.hostname}
                      </button>
                    </details>
                    {domain.checkedAt && (
                      <p className="domain-small">
                        Last checked{" "}
                        {new Date(domain.checkedAt).toLocaleString()}. Changes
                        at your domain provider can take from a few minutes to
                        a few hours to show up. Check again any time.
                      </p>
                    )}
                  </section>
                ))}
                <section className="domain-panel domain-help">
                  <h3>A little help with DNS</h3>
                  <p>
                    Some providers add the zone name automatically. Enter only
                    the host prefix when their form requires it. Keep your
                    existing email records unchanged.
                  </p>
                  <a className="brand-text-link" href="/help/domains">
                    Read the domain guide <Arrow />
                  </a>
                </section>
              </div>
              <aside className="domain-publishing">
                <section className="domain-panel">
                  <div className="domain-panel-heading">
                    <h2>Publishing</h2>
                    <span
                      className={`dashboard-site-status ${site.publishedRelease && !publishing ? "is-live" : ""}`}
                    >
                      {publishing
                        ? "Publishing…"
                        : site.publishedRelease
                          ? "Published"
                          : "Not published"}
                    </span>
                  </div>
                  <p>
                    Publishing puts your last saved changes live. Edits the
                    editor hasn’t saved yet won’t be included.
                  </p>
                  <dl className="domain-publish-facts">
                    <div>
                      <dt>Address</dt>
                      <dd>
                        {site.primaryDomain ||
                          (session.config.mode === "local"
                            ? "Preview on this computer"
                            : "Default hosting address")}
                      </dd>
                    </div>
                    <div>
                      <dt>Last published</dt>
                      <dd>
                        {site.publishedAt
                          ? new Date(site.publishedAt).toLocaleString()
                          : "Not published yet"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="brand-button"
                    disabled={!!busy || publishing || site.version < 1}
                    onClick={() => void publish("publish")}
                  >
                    {publishing
                      ? "Publishing…"
                      : site.publishedRelease
                        ? "Publish latest draft"
                        : "Publish website"}
                    <Arrow />
                  </button>
                  {site.url && (
                    <a
                      className="brand-text-link"
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit published website <Arrow diagonal />
                    </a>
                  )}
                  <button
                    className="brand-text-link"
                    disabled={!!busy}
                    onClick={() =>
                      void run("refresh", async () =>
                        setNotice("Status is up to date."),
                      )
                    }
                  >
                    Refresh publish status
                  </button>
                  {session.config.mode === "local" && (
                    <p className="domain-small">
                      Published previews are visible on this computer only.
                    </p>
                  )}
                </section>
                {releases.length > 0 && (
                  <section className="domain-panel">
                    <h2>Published versions</h2>
                    <p>
                      Put an earlier version back live if something went wrong.
                      Your draft in the editor isn’t changed.
                    </p>
                    <div className="domain-releases">
                      {releases.map((release) => (
                        <div key={release.id}>
                          <span>
                            <strong>Published version {release.version}</strong>
                            <small>
                              {new Date(release.createdAt).toLocaleString()}
                            </small>
                          </span>
                          {release.id === site.publishedRelease ? (
                            <span className="domain-status is-connected">
                              Live
                            </span>
                          ) : (
                            <button
                              className="brand-text-link"
                              disabled={!!busy || publishing}
                              onClick={() =>
                                setConfirm(`rollback:${release.id}`)
                              }
                            >
                              Put back live
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {confirm.startsWith("rollback:") && (
                      <div className="domain-confirm">
                        <p>
                          Replace your live website with the version published{" "}
                          {new Date(
                            releases.find((r) => r.id === confirm.slice(9))
                              ?.createdAt ?? "",
                          ).toLocaleString()}
                          ? Your draft isn’t changed.
                        </p>
                        <button
                          className="brand-button"
                          disabled={!!busy || publishing}
                          onClick={() =>
                            void publish("rollback", confirm.slice(9))
                          }
                        >
                          Put this version live
                        </button>
                        <button
                          className="brand-text-link"
                          onClick={() => setConfirm("")}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {site.publishedRelease && (
                      <details>
                        <summary>Take website offline</summary>
                        <p>
                          Visitors will see nothing at any of your addresses
                          until you publish again. Your draft and published
                          versions stay saved.
                        </p>
                        <button
                          className="brand-button brand-button-outline"
                          disabled={!!busy || publishing}
                          onClick={() => void publish("unpublish")}
                        >
                          Take it offline now
                        </button>
                      </details>
                    )}
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
