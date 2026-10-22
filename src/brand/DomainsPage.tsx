import { useEffect, useState, useRef, type FormEvent } from "react";
import { AppShell, PageHeading } from "./AppShell";
import { Arrow } from "./Brand";
import { useSession } from "./useSession";
import * as cloud from "../cloud/client";
import { Icon } from "../studio/Icon";
import "./domains.css";

const labels: Record<cloud.DomainConnection["status"], string> = {
  ownership: "Verify ownership",
  certificate: "Set up HTTPS",
  deploying: "Preparing delivery",
  dns: "Point your DNS",
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
  "Connect DNS",
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
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      working.current = false;
      setBusy("");
    }
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    void run("add", async () => {
      await cloud.addDomain(siteId, hostname);
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
                <strong>Local development</strong>
                <p>
                  DNS and HTTPS are simulated here. No public DNS records,
                  certificates, or AWS resources are changed. The live
                  deployment uses real ownership checks and HTTPS certificates.
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
                    Use your root domain or a subdomain such as www. Add each
                    hostname separately if you want both.
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
                                  ? "2. Enable HTTPS and automatic renewal"
                                  : "3. Route visitors to your website"}
                            </strong>
                            <span>{record.type}</span>
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
                            <p>
                              For the root domain, use an ALIAS A/AAAA record in
                              Route 53 (CloudFront zone ID{" "}
                              <code>Z2FDTNDATAQYW2</code>) or your provider’s
                              CNAME flattening. Use www if your provider cannot
                              flatten root records.
                            </p>
                          )}
                          {record.purpose === "certificate" && (
                            <p>
                              Keep this CNAME in place for certificate renewal.
                              Use DNS-only mode for verification records.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {domain.local && (
                      <details className="domain-simulator">
                        <summary>Local DNS simulator</summary>
                        <p>
                          Add the records shown above to the local simulator,
                          then check the connection. Repeat when the certificate
                          and routing records appear.
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
                                "Records saved in the local DNS simulator. Check the connection to continue.",
                              );
                            })
                          }
                        >
                          Apply displayed records locally
                        </button>
                        <button
                          className="brand-text-link"
                          disabled={!!busy}
                          onClick={() =>
                            void run(domain.id, async () => {
                              await cloud.saveLocalDns(siteId, domain.id, []);
                              setNotice("Local DNS records cleared.");
                            })
                          }
                        >
                          Clear simulated records
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
                            ? "Retry provisioning"
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
                                ? "Open local domain preview"
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
                          This pauses delivery on {domain.hostname}. Your draft
                          and published release stay available at the default
                          address.
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
                      <summary>Remove this domain connection</summary>
                      <p>
                        This removes its HTTPS hosting resources after
                        disconnecting the domain. Your website, draft, and
                        releases remain saved. Remove the DNS routing record
                        from your provider when finished.
                      </p>
                      <button
                        className="brand-button brand-button-outline"
                        disabled={!!busy}
                        onClick={() => void action(domain, "remove")}
                      >
                        Remove connection
                      </button>
                    </details>
                    {domain.checkedAt && (
                      <p className="domain-small">
                        Last checked{" "}
                        {new Date(domain.checkedAt).toLocaleString()}. DNS and
                        HTTPS changes can take time. Checks run when you request
                        them.
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
                    Publishing uses saved draft version {site.version}. Save
                    recent editor changes before publishing here.
                  </p>
                  <dl className="domain-publish-facts">
                    <div>
                      <dt>Address</dt>
                      <dd>
                        {site.primaryDomain ||
                          (session.config.mode === "local"
                            ? "Local preview"
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
                    onClick={() => void run("refresh", async () => {})}
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
                    <h2>Release history</h2>
                    <p>
                      Restore a release to change the live website. Your
                      editable draft stays as it is.
                    </p>
                    <div className="domain-releases">
                      {releases.map((release) => (
                        <div key={release.id}>
                          <span>
                            <strong>Version {release.version}</strong>
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
                              Restore
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {confirm.startsWith("rollback:") && (
                      <div className="domain-confirm">
                        <p>
                          Replace the live website with this retained release?
                        </p>
                        <button
                          className="brand-button"
                          disabled={!!busy || publishing}
                          onClick={() =>
                            void publish("rollback", confirm.slice(9))
                          }
                        >
                          Restore release
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
                          All connected domains and the default address stop
                          serving the website. Your draft and retained releases
                          stay saved.
                        </p>
                        <button
                          className="brand-button brand-button-outline"
                          disabled={!!busy || publishing}
                          onClick={() => void publish("unpublish")}
                        >
                          Unpublish website
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
