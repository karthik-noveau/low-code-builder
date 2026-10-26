/**
 * The owner's app page (/apps): the business app a site runs, as the owner
 * defined it in the editor — a dashboard, one section per table, and phone
 * notifications. Everything is generic: tables, fields, statuses, actions,
 * totals and dashboard come from the app definition.
 *
 * Deep links: /apps?site=<id>&table=<tableId>&record=<recordId>, and
 * &section=notifications. Notification clicks open the record this way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeading, type AppNav } from "../brand/AppShell";
import { useSession } from "../brand/useSession";
import { Icon } from "../studio/Icon";
import { listSites, type Site } from "../cloud/client";
import {
  recordTitle,
  tableOf,
  type App,
  type AppAction,
  type AppRecord,
  type AppTable,
  type AppValue,
} from "./model";
import type { AppInfo, LinkTitles, RecordList, Summary } from "./api-types";
import { APP_TEMPLATES } from "./templates";
import * as api from "./api";
import { Empty, LoadError } from "./AppUi";
import {
  errorText,
  recordSummary,
  recordTitleOrRef,
  linkTitler,
  type Catalog,
} from "./app-helpers";
import { AppDashboard } from "./AppDashboard";
import { AppRecords } from "./AppRecords";
import { RecordDrawer } from "./RecordDrawer";
import { RecordForm } from "./RecordForm";
import { PushSettings } from "./PushSettings";
import "../commerce/commerce.css";
import "./app-page.css";

const DASHBOARD = "dashboard";
const NOTIFICATIONS = "notifications";
/** Sites checked for an app to order the site picker; more would be slow. */
const SCAN_LIMIT = 20;
/** How often an open table checks for new records while the page is visible. */
export const REFRESH_MS = 30_000;

function readUrl() {
  const q = new URLSearchParams(location.search);
  return {
    section:
      q.get("table") ||
      (q.get("section") === NOTIFICATIONS ? NOTIFICATIONS : DASHBOARD),
    record: q.get("record") || "",
  };
}
function appHref(siteId: string, section: string, record = "") {
  const q = new URLSearchParams();
  if (siteId) q.set("site", siteId);
  if (section === NOTIFICATIONS) q.set("section", NOTIFICATIONS);
  else if (section !== DASHBOARD) q.set("table", section);
  if (record) q.set("record", record);
  const text = q.toString();
  return `/apps${text ? `?${text}` : ""}`;
}
const tableIcon = (table: AppTable) =>
  table.statuses.length ? "checklist" : table.private ? "users" : "folder";
const slug = (text: string) =>
  text
    .replace(/[^\w-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "app";

export function AppPage({ siteId: initialSiteId }: { siteId: string }) {
  const session = useSession();
  const [sites, setSites] = useState<Site[]>();
  const [sitesError, setSitesError] = useState("");
  const [siteId, setSiteId] = useState(initialSiteId);
  /** App info of other sites, to put sites with apps first in the picker. */
  const [scanned, setScanned] = useState<Record<string, boolean>>({});
  const [info, setInfo] = useState<AppInfo>();
  const [infoError, setInfoError] = useState("");
  const [section, setSection] = useState(() => readUrl().section);
  const [recordId, setRecordId] = useState(() => readUrl().record);
  const [lists, setLists] = useState<Record<string, RecordList | undefined>>(
    {},
  );
  const [listErrors, setListErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Summary>();
  const [summaryError, setSummaryError] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [missing, setMissing] = useState("");
  const [reload, setReload] = useState(0);
  /** Collections item fields choose from; loaded once per site when needed. */
  const [catalog, setCatalog] = useState<Catalog>();
  /** Per table, records that arrived with an automatic refresh and aren't seen yet. */
  const [fresh, setFresh] = useState<Record<string, Set<string>>>({});
  const listsRef = useRef(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);
  /** Requests started for the current site, so each table loads once. */
  const pending = useRef(new Set<string>());
  const generation = useRef(0);

  const app: App | null | undefined = info?.app;
  const table =
    app && section !== DASHBOARD && section !== NOTIFICATIONS
      ? tableOf(app, section)
      : undefined;

  // Sites.
  useEffect(() => {
    if (!session.account) return;
    let live = true;
    listSites()
      .then(({ sites }) => live && setSites(sites))
      .catch(
        (e) =>
          live &&
          setSitesError(errorText(e, "Your websites could not be loaded.")),
      );
    return () => {
      live = false;
    };
  }, [session.account, reload]);
  // Which other sites have an app: they go first, and one opens when no site was chosen.
  useEffect(() => {
    if (!sites || sites.length < 2) return;
    let live = true;
    const others = [...sites]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((s) => s.id !== initialSiteId)
      .slice(0, SCAN_LIMIT);
    void Promise.allSettled(others.map((s) => api.loadAppInfo(s.id))).then(
      (results) => {
        if (!live) return;
        const found: Record<string, boolean> = {};
        results.forEach((r, i) => {
          found[others[i].id] = r.status === "fulfilled" && !!r.value.app;
        });
        setScanned(found);
        setSiteId((current) => {
          if (current) return current;
          return others.find((s) => found[s.id])?.id ?? others[0]?.id ?? "";
        });
      },
    );
    return () => {
      live = false;
    };
  }, [sites, initialSiteId]);
  // One site: it's the one.
  useEffect(() => {
    if (!siteId && sites?.length === 1) setSiteId(sites[0].id);
  }, [sites, siteId]);

  // The chosen site's app.
  useEffect(() => {
    if (!session.account || !siteId) return;
    let live = true;
    const run = ++generation.current;
    pending.current = new Set();
    setCatalog(undefined);
    setFresh({});
    api
      .loadAppInfo(siteId)
      .then((result) => {
        if (!live || run !== generation.current) return;
        setInfo(result);
        setInfoError("");
      })
      .catch(
        (e) =>
          live && setInfoError(errorText(e, "The app could not be loaded.")),
      );
    return () => {
      live = false;
    };
  }, [session.account, siteId, reload]);

  const loadTable = useCallback(
    async (tableId: string, force = false) => {
      if (!force && pending.current.has(tableId)) return;
      pending.current.add(tableId);
      const run = generation.current;
      try {
        const list = await api.listRecords(siteId, tableId);
        if (run !== generation.current) return;
        setLists((all) => ({ ...all, [tableId]: list }));
        setListErrors((all) => ({ ...all, [tableId]: "" }));
      } catch (e) {
        if (run !== generation.current) return;
        pending.current.delete(tableId);
        setListErrors((all) => ({
          ...all,
          [tableId]: errorText(e, "These records could not be loaded."),
        }));
      }
    },
    [siteId],
  );
  const loadSummary = useCallback(async () => {
    if (pending.current.has(DASHBOARD)) return;
    pending.current.add(DASHBOARD);
    const run = generation.current;
    try {
      const result = await api.loadSummary(siteId);
      if (run !== generation.current) return;
      setSummary(result);
      setSummaryError("");
    } catch (e) {
      if (run !== generation.current) return;
      setSummaryError(errorText(e, "The dashboard could not be loaded."));
    } finally {
      pending.current.delete(DASHBOARD);
    }
  }, [siteId]);

  // Item fields and capacity per item need the site's collections.
  const needsCatalog = !!app?.tables.some((t) =>
    t.fields.some((f) => f.type === "item" || f.type === "items"),
  );
  useEffect(() => {
    if (!needsCatalog || !siteId || pending.current.has(":catalog")) return;
    pending.current.add(":catalog");
    const run = generation.current;
    Promise.resolve(api.loadCatalog(siteId))
      .then((found) => run === generation.current && setCatalog(found ?? {}))
      .catch(() => {
        // Item pickers say "Nothing to choose yet"; the server still checks.
        if (run === generation.current) setCatalog({});
      });
  }, [needsCatalog, siteId, info]);

  /**
   * Checks the open table for new records quietly: no loading state, no
   * error flash, and records that weren't there before are marked new.
   */
  const refreshTable = useCallback(
    async (tableId: string) => {
      const run = generation.current;
      try {
        const next = await api.listRecords(siteId, tableId);
        if (run !== generation.current) return;
        const before = listsRef.current[tableId];
        if (before) {
          const known = new Set(before.records.map((r) => r.id));
          const added = next.records.filter((r) => !known.has(r.id));
          if (added.length)
            setFresh((f) => ({
              ...f,
              [tableId]: new Set([
                ...(f[tableId] ?? []),
                ...added.map((r) => r.id),
              ]),
            }));
        }
        setLists((all) => ({ ...all, [tableId]: next }));
      } catch {
        // The next check tries again; the records on screen stay.
      }
    },
    [siteId],
  );
  // Every 30 seconds while the page is visible, and when the owner comes back to it.
  const watching = table && !adding && !recordId ? table.id : "";
  useEffect(() => {
    if (!watching) return;
    const check = () => {
      if (document.visibilityState !== "hidden") void refreshTable(watching);
    };
    const timer = setInterval(check, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watching, refreshTable]);
  const seen = (tableId: string, recordId?: string) =>
    setFresh((f) => {
      if (!f[tableId]?.size) return f;
      const rest = new Set(f[tableId]);
      if (recordId) rest.delete(recordId);
      else rest.clear();
      return { ...f, [tableId]: rest };
    });

  // Load what's on screen: the dashboard, the table, and the tables that point at an open record.
  const drawerTable = table;
  useEffect(() => {
    if (!app) return;
    if (section === DASHBOARD && !summary) void loadSummary();
    if (table) void loadTable(table.id);
    if (drawerTable && recordId)
      for (const other of app.tables)
        if (
          other.fields.some(
            (f) => f.type === "link" && f.table === drawerTable.id,
          )
        )
          void loadTable(other.id);
    // Link fields in the add/edit form need the other tables' names.
    if (table && (adding || recordId))
      for (const f of table.fields)
        if (f.type === "link" && f.table) void loadTable(f.table);
  }, [
    app,
    section,
    table,
    drawerTable,
    recordId,
    adding,
    summary,
    lists,
    loadSummary,
    loadTable,
  ]);

  // Back and forward between sections.
  useEffect(() => {
    const sync = () => {
      const next = readUrl();
      const q = new URLSearchParams(location.search);
      if (location.pathname.replace(/\/+$/, "") !== "/apps") return;
      if (q.get("site") && q.get("site") !== siteId) return;
      setSection(next.section);
      setRecordId(next.record);
      setAdding(false);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [siteId]);

  const go = (next: string, record = "") => {
    const href = appHref(siteId, next, record);
    if (next !== section) history.pushState(null, "", href);
    else history.replaceState(null, "", href);
    setSection(next);
    setRecordId(record);
    setAdding(false);
    setNotice("");
    setMissing("");
    if (next === DASHBOARD) setSummary(undefined);
  };
  const openRecord = (tableId: string, id: string) => {
    seen(tableId, id);
    go(tableId, id);
  };
  const closeRecord = () => {
    history.replaceState(null, "", appHref(siteId, section));
    setRecordId("");
  };
  /** After a change, totals and the dashboard elsewhere may be stale. */
  const changed = async (tableId: string) => {
    pending.current = new Set();
    setSummary(undefined);
    setLists((all) => ({ [tableId]: all[tableId] }));
    await loadTable(tableId, true);
  };

  /** Takes a step on a record, from its panel or the board. */
  const runAction = async (
    t: AppTable,
    target: AppRecord,
    action: AppAction,
    values: Record<string, AppValue>,
    note: string,
  ) => {
    await api.runAction(siteId, target.id, action.id, {
      values,
      note,
      revision: target.revision,
    });
    await changed(t.id);
    setNotice(`${action.name}: “${recordTitle(t, target)}” is done.`);
  };

  const links = useMemo(() => {
    const merged: LinkTitles = {};
    for (const list of [summary, ...Object.values(lists)])
      for (const [tableId, titles] of Object.entries(list?.links ?? {}))
        merged[tableId] = { ...merged[tableId], ...titles };
    return merged;
  }, [lists, summary]);
  const list = table ? lists[table.id] : undefined;
  const record =
    table && recordId
      ? list?.records.find((r) => r.id === recordId)
      : undefined;
  // A deep link to a record that's gone.
  useEffect(() => {
    if (!table || !recordId || !list || record) return;
    setMissing(
      `That ${table.singular.toLowerCase()} isn't here any more — it may have been deleted.`,
    );
    history.replaceState(null, "", appHref(siteId, table.id));
    setRecordId("");
  }, [table, recordId, list, record, siteId]);

  const site = sites?.find((s) => s.id === siteId);
  const siteName = site?.name ?? "";
  const orderedSites = useMemo(
    () =>
      [...(sites ?? [])].sort(
        (a, b) =>
          Number(!!(scanned[b.id] ?? (b.id === siteId && app))) -
            Number(!!(scanned[a.id] ?? (a.id === siteId && app))) ||
          a.name.localeCompare(b.name),
      ),
    [sites, scanned, siteId, app],
  );
  const sectionName =
    section === DASHBOARD
      ? "Dashboard"
      : section === NOTIFICATIONS
        ? "Notifications"
        : (table?.name ?? "App");
  const appNav: AppNav | undefined = app
    ? {
        siteId,
        current: section,
        items: [
          { id: DASHBOARD, label: "Dashboard", icon: "chart" },
          ...app.tables.map((t) => ({
            id: t.id,
            label: t.name,
            icon: tableIcon(t),
          })),
          { id: NOTIFICATIONS, label: "Notifications", icon: "bell" },
        ],
        onSelect: (id) => go(id),
      }
    : undefined;
  const editor = `/editor?site=${siteId}`;

  const body = () => {
    if (session.loading) return <p role="status">Opening your workspace…</p>;
    if (!session.account)
      return (
        <Empty title="Sign in to run your app" icon="lock">
          <p>
            Your app's records hold your customers' details, so they're private
            to your workspace.
          </p>
          <a className="commerce-button" href="/login?next=/apps">
            Sign in
          </a>
        </Empty>
      );
    if (sitesError && !sites)
      return (
        <LoadError
          message={sitesError}
          onRetry={() => {
            setSitesError("");
            setReload((n) => n + 1);
          }}
        />
      );
    if (sites && !sites.length)
      return (
        <Empty title="Create a website first" icon="grid">
          <p>
            An app runs on one of your websites: visitors use its forms, and you
            manage what comes in here.
          </p>
          <a className="commerce-button" href="/new">
            Create website
          </a>
        </Empty>
      );
    if (infoError && !info)
      return (
        <LoadError
          message={infoError}
          onRetry={() => {
            setInfoError("");
            setReload((n) => n + 1);
          }}
        />
      );
    if (!info || !siteId)
      return (
        <p role="status" className="app-loading">
          Loading your app…
        </p>
      );
    if (!app)
      return (
        <Empty
          title={`${siteName || "This website"} doesn't have an app yet`}
          icon="layers"
        >
          <p>
            An app turns your website into a working tool: visitors send forms,
            you review what comes in, and totals add up by themselves. Start
            from a template in the editor —{" "}
            {APP_TEMPLATES.filter((t) => t.id !== "blank")
              .map((t) => t.name)
              .join(", ")}{" "}
            — or build your own.
          </p>
          <a className="commerce-button" href={editor}>
            Build an app
          </a>
        </Empty>
      );
    if (section === NOTIFICATIONS)
      return <PushSettings siteId={siteId} app={app} />;
    if (section !== DASHBOARD && !table)
      return (
        <Empty title="This table isn't in the app any more" icon="folder">
          <p>It may have been renamed or removed in the app builder.</p>
          <button
            type="button"
            className="commerce-button"
            onClick={() => go(DASHBOARD)}
          >
            Go to the dashboard
          </button>
        </Empty>
      );
    if (table)
      return adding ? (
        <section
          className="commerce-panel"
          aria-label={`Add ${table.singular.toLowerCase()}`}
        >
          <h2>Add {table.singular.toLowerCase()}</h2>
          <RecordForm
            table={table}
            links={links}
            catalog={catalog}
            currency={app.currency}
            onCancel={() => setAdding(false)}
            onSave={async (values) => {
              const { record } = await api.createRecord(
                siteId,
                table.id,
                values,
              );
              await changed(table.id);
              setAdding(false);
              setNotice(
                `${table.singular} “${recordTitle(table, record)}” added.`,
              );
            }}
          />
        </section>
      ) : (
        <AppRecords
          key={table.id}
          app={app}
          table={table}
          list={list}
          links={links}
          error={listErrors[table.id] ?? ""}
          fileName={`${slug(siteName)}-${slug(table.name)}.csv`}
          catalog={catalog}
          fresh={fresh[table.id]}
          onSeen={() => seen(table.id)}
          onAction={(target, action, values, note) =>
            runAction(table, target, action, values, note)
          }
          onConflict={() => void changed(table.id)}
          onRetry={() => void loadTable(table.id, true)}
          onOpen={(id) => openRecord(table.id, id)}
          onAdd={() => {
            setNotice("");
            setAdding(true);
          }}
        />
      );
    return (
      <AppDashboard
        app={app}
        summary={summary}
        error={summaryError}
        siteId={siteId}
        onRetry={() => void loadSummary()}
        onOpen={openRecord}
        onTable={(id) => go(id)}
      />
    );
  };

  return (
    <AppShell
      area="app"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: "App", href: siteId ? appHref(siteId, DASHBOARD) : "/apps" },
        { label: sectionName },
      ]}
      appNav={appNav}
      searchItems={
        app
          ? [
              ...(appNav?.items ?? []).map((item) => ({
                id: `app-${item.id}`,
                label: item.label,
                group: "App",
                icon: item.icon,
                run: () => go(item.id),
              })),
              ...app.tables.flatMap((t) =>
                (lists[t.id]?.records ?? []).slice(0, 200).map((r) => ({
                  id: `app-record-${r.id}`,
                  label: recordTitle(t, r),
                  hint: [
                    t.singular,
                    r.ref,
                    recordSummary(app, t, r, linkTitler(links)),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  group: t.name,
                  icon: tableIcon(t),
                  run: () => openRecord(t.id, r.id),
                })),
              ),
            ]
          : undefined
      }
      headerExtra={
        sites &&
        sites.length > 1 && (
          <select
            className="commerce-site-switch"
            aria-label="Website"
            value={siteId}
            onChange={(e) => {
              const next = e.target.value;
              history.replaceState(null, "", appHref(next, DASHBOARD));
              generation.current++;
              setInfo(undefined);
              setInfoError("");
              setLists({});
              setListErrors({});
              setSummary(undefined);
              setSection(DASHBOARD);
              setRecordId("");
              setAdding(false);
              setNotice("");
              setSiteId(next);
            }}
          >
            {!siteId && <option value="">Choose a website…</option>}
            {orderedSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {scanned[s.id] === false ? " (no app yet)" : ""}
              </option>
            ))}
          </select>
        )
      }
    >
      <div className="commerce-app commerce-embedded app-page">
        {appNav && (
          <nav className="commerce-tabs" aria-label="App sections">
            {appNav.items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                ref={(el) => {
                  if (el && section === item.id)
                    el.scrollIntoView?.({
                      block: "nearest",
                      inline: "nearest",
                    });
                }}
                onClick={() => go(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        <PageHeading
          kicker={siteName ? `${siteName} · App` : "Your app"}
          title={sectionName}
          description={
            !app
              ? "Run your website's business app: forms, records, steps and totals."
              : section === DASHBOARD
                ? "Your figures and what needs you, at a glance."
                : section === NOTIFICATIONS
                  ? "Get a notification on your phone or computer when something arrives."
                  : table?.private
                    ? `${table.name} you keep. Only you can add them.`
                    : `${table?.name ?? "Records"} from your website's forms and the ones you add.`
          }
          action={
            app && (
              <div className="commerce-actions">
                {(section === DASHBOARD || table) && (
                  <button
                    type="button"
                    className="commerce-button secondary"
                    onClick={() => {
                      if (section === DASHBOARD) {
                        setSummary(undefined);
                        setSummaryError("");
                      } else if (table) void loadTable(table.id, true);
                    }}
                  >
                    <Icon name="undo" size={15} /> Refresh
                  </button>
                )}
                <a className="commerce-button secondary" href={editor}>
                  Edit app
                </a>
              </div>
            )
          }
        />
        {info && app && !info.published && (
          <div className="commerce-notice app-banner" role="note">
            Visitors can use your forms once you publish the site.{" "}
            <a href={editor}>Open the editor to publish</a>
          </div>
        )}
        {(missing || session.error) && (
          <div className="commerce-notice error" role="alert">
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setMissing("")}
            >
              ×
            </button>
            {missing || session.error}
          </div>
        )}
        {notice && (
          <div className="commerce-notice" role="status">
            {notice}
          </div>
        )}
        {body()}
        {app && table && record && (
          <RecordDrawer
            key={record.id}
            app={app}
            table={table}
            record={record}
            links={links}
            lists={lists}
            catalog={catalog}
            me={
              session.account
                ? [session.account.id, session.account.email]
                : undefined
            }
            onClose={closeRecord}
            onOpen={openRecord}
            onConflict={() => void changed(table.id)}
            onSave={async (values) => {
              try {
                await api.updateRecord(
                  siteId,
                  record.id,
                  values,
                  record.revision,
                );
              } catch (e) {
                // Show the newer version so the owner can redo the edit on it.
                if ((e as { status?: number }).status === 409)
                  await changed(table.id);
                throw e;
              }
              await changed(table.id);
              setNotice(`Saved “${recordTitle(table, record)}”.`);
            }}
            onDelete={async () => {
              await api.deleteRecord(siteId, record.id);
              closeRecord();
              await changed(table.id);
              setNotice(
                `${table.singular} “${recordTitle(table, record)}” deleted.`,
              );
            }}
            onAction={(action, values, note) =>
              runAction(table, record, action, values, note)
            }
            onMarkPaid={async () => {
              await api.markPaid(siteId, record.id, record.revision);
              await changed(table.id);
              setNotice(`${recordTitleOrRef(table, record)} is marked paid.`);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
