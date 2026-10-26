/**
 * The branded owner app (/owner?site=<id>): a full-screen app for running a
 * site's business app, without Forma's chrome — the shop's name, logo and
 * colour, a sidebar per table, and the Dhanlaxmi Rewards owner screens.
 *
 * Deep links: &page=dashboard|submissions|customers|customer|settings,
 * &record=<id>, &status=<status>, and &table=<tableId> for any table (push
 * notifications open …&table=…&record=…).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../brand/useSession";
import {
  listSites,
  signOut as cloudSignOut,
  siteStatus,
  type Account,
  type Site,
} from "../cloud/client";
import {
  formatMoney,
  type AppAction,
  type AppRecord,
  type AppTable,
} from "../apps/model";
import { linkTitler } from "../apps/app-helpers";
import {
  OwnerContext,
  useOwner,
  type OwnerContextValue,
  type ThemePref,
} from "./context";
import { personOf } from "./view";
import {
  accentVariables,
  displayNameOf,
  formatRelativeTime,
  initialsOf,
  readStored,
  writeStored,
} from "./format";
import {
  DARK_QUERY,
  MOBILE_NAV_QUERY,
  PHONE_QUERY,
  useMediaQuery,
} from "./hooks";
import { Icon, ShopMark, type IconName } from "./Icon";
import { listenForInstall } from "./install";
import {
  isWaiting,
  mergeLinks,
  ownerModel,
  peopleFor,
  workflowFor,
  type OwnerModel,
} from "./roles";
import {
  hrefFor,
  readRaw,
  resolveRoute,
  type RawRoute,
  type Route,
} from "./route";
import { clearOwnerCache, useOwnerData } from "./useOwnerData";
import { ActionDialog } from "./ActionDialog";
import { Dashboard } from "./Dashboard";
import { PeoplePage } from "./PeoplePage";
import { PersonDetail } from "./PersonDetail";
import { RecordFormDrawer } from "./RecordFormDrawer";
import { Settings } from "./Settings";
import { SignIn } from "./SignIn";
import { WorkflowPage } from "./WorkflowPage";
import {
  Button,
  ButtonLink,
  Dropdown,
  EmptyState,
  ErrorState,
  ToastProvider,
} from "./ui";
import * as api from "../apps/api";
import "./owner.css";

const THEME_KEY = "forma-owner-theme";
const COLLAPSED_KEY = "forma-owner-sidebar";
const LAST_SITE_KEY = "forma-owner-site";
const brandKey = (siteId: string) => `forma-owner-brand:${siteId}`;
const seenKey = (siteId: string) => `forma-owner-seen:${siteId}`;

interface Brand {
  name: string;
  appName: string;
  logo?: string;
  accent: string;
  url?: string;
}
function readBrand(siteId: string): Brand | undefined {
  try {
    const raw = readStored(brandKey(siteId));
    return raw ? (JSON.parse(raw) as Brand) : undefined;
  } catch {
    return undefined;
  }
}

listenForInstall();

export function OwnerApp({ siteId: initialSiteId }: { siteId: string }) {
  const session = useSession();
  const [signedIn, setSignedIn] = useState<Account | null>();
  const account = signedIn === null ? undefined : (signedIn ?? session.account);
  const [siteId, setSiteId] = useState(
    () => initialSiteId || readStored(LAST_SITE_KEY) || "",
  );
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const saved = readStored(THEME_KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  });
  const systemDark = useMediaQuery(DARK_QUERY);
  const resolved = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    writeStored(THEME_KEY, next);
  }, []);

  const { data, ...actions } = useOwnerData(siteId, !!account);
  const [site, setSite] = useState<Site>();
  const project = data.project;
  const cached = useMemo(() => readBrand(siteId), [siteId]);
  const app = data.info?.app ?? undefined;
  const brand: Brand = {
    name: site?.name || project?.name || cached?.name || "Your shop",
    appName: app?.install.name || cached?.appName || "",
    logo: project ? project.theme.logo : cached?.logo,
    accent: project?.theme.accent || cached?.accent || "#e07400",
    url: site?.url || site?.defaultUrl || cached?.url,
  };

  // The site's name and address, for the header and "Back to the customer app".
  useEffect(() => {
    if (!account || !siteId || data.status !== "ready") return;
    let live = true;
    Promise.resolve(siteStatus(siteId))
      .then((r) => live && r && setSite(r.site))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account, siteId, data.status]);
  // Remember the brand, so the sign-in screen is the shop's next time.
  const brandText = JSON.stringify(brand);
  useEffect(() => {
    if (data.status === "ready") {
      writeStored(brandKey(siteId), brandText);
      writeStored(LAST_SITE_KEY, siteId);
    }
  }, [data.status, siteId, brandText]);
  // "<Shop> — Shop owner"; after the app's own title effect has run.
  useEffect(() => {
    void Promise.resolve().then(() => {
      document.title = `${brand.name} — Shop owner`;
    });
  }, [brand.name]);
  // Installable as its own app, opening on /owner.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/owner-manifest.webmanifest";
    document.head.append(link);
    const meta = document.querySelector('meta[name="theme-color"]');
    const before = meta?.getAttribute("content");
    meta?.setAttribute("content", resolved === "dark" ? "#151c26" : "#ffffff");
    return () => {
      link.remove();
      if (before) meta?.setAttribute("content", before);
    };
  }, [resolved]);

  const signOut = useCallback(() => {
    void Promise.resolve(cloudSignOut())
      .catch(() => {})
      .finally(() => {
        clearOwnerCache();
        setSignedIn(null);
      });
  }, []);

  const style = accentVariables(brand.accent) as React.CSSProperties;
  const frame = (children: React.ReactNode) => (
    <div className="ow" data-theme={resolved} style={style}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );

  if (session.loading && signedIn === undefined)
    return frame(<Splash label="Opening your shop…" />);
  if (!account)
    return frame(
      <SignIn
        shopName={brand.name}
        appName={brand.appName}
        logo={brand.logo}
        siteUrl={brand.url}
        config={session.config}
        onSignedIn={(a) => setSignedIn(a)}
      />,
    );
  if (!siteId)
    return frame(
      <SitePicker
        onPick={(id) => {
          history.replaceState(
            null,
            "",
            `/owner?site=${encodeURIComponent(id)}`,
          );
          setSiteId(id);
        }}
      />,
    );
  if (data.status === "denied")
    return frame(
      <Notice
        icon="lock"
        title="This account can't manage this shop"
        text={`${account.email} doesn't have edit access to this website. Sign in with the shop's owner account, or ask the owner to add you to the website's team as an editor.`}
        brand={brand}
        action={
          <Button variant="primary" icon="logOut" onClick={signOut}>
            Sign in with another account
          </Button>
        }
      />,
    );
  if (data.status === "noapp")
    return frame(
      <Notice
        icon="box"
        title={`${brand.name} doesn't have an app yet`}
        text="The owner app runs a website's business app — records, steps and totals. Add one from a template in the Forma editor, then come back here."
        brand={brand}
        action={
          <ButtonLink
            variant="primary"
            href={`/editor?site=${encodeURIComponent(siteId)}`}
          >
            Open the editor
          </ButtonLink>
        }
      />,
    );
  if (data.status === "error" && !app)
    return frame(
      <div className="ow-publicShell">
        <main className="ow-login">
          <div className="ow-card">
            <ErrorState
              title="Couldn't open the shop"
              description={
                data.error || "The request failed. Nothing was changed."
              }
              onRetry={() => void actions.reload()}
            />
          </div>
        </main>
      </div>,
    );
  if (!app) return frame(<Splash label="Opening your shop…" brand={brand} />);
  return frame(
    <Shell
      siteId={siteId}
      brand={brand}
      account={account}
      data={data}
      actions={actions}
      signOut={signOut}
      theme={{ pref, resolved, setPref }}
    />,
  );
}

function Splash({ label, brand }: { label: string; brand?: Brand }) {
  return (
    <div className="ow-splash" role="status">
      {brand && <ShopMark logo={brand.logo} name={brand.name} size={48} />}
      <span className="ow-spinner ow-spinnerLg" aria-hidden="true" />
      <span className="ow-srOnly">{label}</span>
    </div>
  );
}
function Notice({
  icon,
  title,
  text,
  brand,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  brand: Brand;
  action: React.ReactNode;
}) {
  return (
    <div className="ow-publicShell">
      <main className="ow-login" id="main">
        <div className="ow-loginBrand">
          <span className="ow-loginMark">
            <ShopMark logo={brand.logo} name={brand.name} size={48} />
          </span>
          <p className="ow-muted">{brand.name}</p>
        </div>
        <div className="ow-card">
          <EmptyState
            icon={icon}
            tone="neutral"
            title={title}
            description={text}
            action={action}
          />
        </div>
      </main>
    </div>
  );
}
function SitePicker({ onPick }: { onPick: (id: string) => void }) {
  const [sites, setSites] = useState<Site[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.resolve(listSites())
      .then((r) => {
        setSites(r.sites);
        if (r.sites.length === 1) onPick(r.sites[0].id);
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Your shops could not be loaded.",
        ),
      );
  }, [onPick]);
  return (
    <div className="ow-publicShell">
      <main className="ow-login" id="main">
        <h1 className="ow-pageTitle ow-textCenter">Choose a shop</h1>
        <div className="ow-card">
          {error ? (
            <ErrorState title="Couldn't load your shops" description={error} />
          ) : !sites ? (
            <Splash label="Loading your shops…" />
          ) : !sites.length ? (
            <EmptyState
              icon="box"
              title="No shops yet"
              description="Create a website in Forma first."
            />
          ) : (
            <ul className="ow-siteList">
              {sites.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="ow-siteItem"
                    onClick={() => onPick(s.id)}
                  >
                    <span className="ow-avatar ow-avatar-md" aria-hidden="true">
                      {initialsOf(s.name)}
                    </span>
                    <span className="ow-grow">{s.name}</span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function Shell({
  siteId,
  brand,
  account,
  data,
  actions,
  signOut,
  theme,
}: {
  siteId: string;
  brand: Brand;
  account: Account;
  data: OwnerContextValue["data"];
  actions: OwnerContextValue["actions"];
  signOut: () => void;
  theme: OwnerContextValue["theme"];
}) {
  const app = data.info!.app!;
  const model = useMemo(() => ownerModel(app), [app]);
  const [raw, setRaw] = useState<RawRoute>(() => readRaw());
  const route = resolveRoute(raw, model);
  const [collapsed, setCollapsed] = useState(
    () => readStored(COLLAPSED_KEY) === "true",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const isMobile = useMediaQuery(MOBILE_NAV_QUERY);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [adding, setAdding] = useState<AppTable>();
  const [editing, setEditing] = useState<AppRecord>();
  const [review, setReview] = useState<{
    record: AppRecord;
    action: AppAction;
  }>();
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setRaw(readRaw());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!isMobile || !mobileNav) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setMobileNav(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile, mobileNav]);
  useEffect(() => {
    Promise.resolve(api.listDevices(siteId))
      .then((r) => r && setDeviceCount(r.devices.length))
      .catch(() => {});
  }, [siteId]);

  const href = useCallback(
    (r: Route) => hrefFor(siteId, r, model),
    [siteId, model],
  );
  const go = useCallback(
    (r: Route) => {
      const next = hrefFor(siteId, r, model);
      if (next !== location.pathname + location.search)
        history.pushState(null, "", next);
      setRaw(readRaw(next.slice(next.indexOf("?"))));
      setMobileNav(false);
      window.scrollTo?.(0, 0);
    },
    [siteId, model],
  );
  const links = useMemo(
    () => mergeLinks(Object.values(data.lists)),
    [data.lists],
  );
  const value: OwnerContextValue = {
    siteId,
    shopName: brand.name,
    logo: brand.logo,
    model,
    data,
    actions,
    account,
    records: (tableId) => data.lists[tableId]?.records ?? [],
    linkTitle: linkTitler(links),
    money: (v) => formatMoney(v, app.currency),
    go,
    href,
    openNew: setAdding,
    review: (record, action) => setReview({ record, action }),
    edit: setEditing,
    signOut,
    theme,
    deviceCount,
    setDeviceCount,
  };

  const pendingOf = (tableId: string) => {
    const w = workflowFor(model, tableId);
    return w ? value.records(tableId).filter((r) => isWaiting(w, r)).length : 0;
  };
  const title =
    route.page === "settings"
      ? "Settings"
      : route.page === "table"
        ? peopleFor(model, route.table) && route.record
          ? (model.app.tables.find((t) => t.id === route.table)?.singular ?? "")
          : (model.app.tables.find((t) => t.id === route.table)?.name ?? "")
        : "Dashboard";
  const toggleCollapse = () =>
    setCollapsed((c) => {
      writeStored(COLLAPSED_KEY, String(!c));
      return !c;
    });
  const primary = model.primaryPeople?.table;

  const nav: { route: Route; label: string; icon: IconName; count?: number }[] =
    [
      { route: { page: "dashboard" }, label: "Dashboard", icon: "dashboard" },
      ...model.order.map((t) => ({
        route: { page: "table", table: t.id } as Route,
        label: t.name,
        icon: (workflowFor(model, t.id)
          ? "inbox"
          : peopleFor(model, t.id)?.phone
            ? "users"
            : "folder") as IconName,
        count: pendingOf(t.id) || undefined,
      })),
      { route: { page: "settings" }, label: "Settings", icon: "settings" },
    ];
  const isCurrent = (r: Route) =>
    r.page === route.page &&
    (r.page !== "table" || (route.page === "table" && route.table === r.table));

  const page = () => {
    if (route.page === "settings") return <Settings />;
    if (route.page === "table") {
      const w = workflowFor(model, route.table);
      if (w)
        return (
          <WorkflowPage w={w} status={route.status} recordId={route.record} />
        );
      const p = peopleFor(model, route.table)!;
      if (route.record) return <PersonDetail p={p} recordId={route.record} />;
      return <PeoplePage p={p} />;
    }
    return <Dashboard />;
  };

  return (
    <OwnerContext.Provider value={value}>
      <a className="ow-skipLink" href="#ow-main">
        Skip to main content
      </a>
      <div
        className="ow-shell"
        data-collapsed={String(collapsed && !isMobile)}
        data-mobile-nav={mobileNav ? "open" : "closed"}
        data-phone={isPhone ? "true" : undefined}
      >
        {!isPhone && (
          <>
            <button
              className="ow-sidebarBackdrop"
              type="button"
              tabIndex={-1}
              aria-label="Close navigation"
              onClick={() => setMobileNav(false)}
            />
            <aside className="ow-sidebar">
              <div className="ow-sidebarBrand">
                <span className="ow-sidebarMark">
                  <ShopMark logo={brand.logo} name={brand.name} size={36} />
                </span>
                <BrandText name={brand.name} sub={brand.appName} />
              </div>
              <nav className="ow-sidebarNav" aria-label="Main navigation">
                <p className="ow-sidebarGroupLabel" id="ow-nav-label">
                  Shop
                </p>
                <ul aria-labelledby="ow-nav-label">
                  {nav.map((item) => (
                    <li key={item.label}>
                      <a
                        className="ow-navItem"
                        href={href(item.route)}
                        aria-current={
                          isCurrent(item.route) ? "page" : undefined
                        }
                        title={collapsed ? item.label : undefined}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          go(item.route);
                        }}
                      >
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                        {item.count ? (
                          <span
                            className="ow-navItemCount"
                            aria-label={`${item.count} pending`}
                          >
                            {item.count}
                          </span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="ow-sidebarFooter">
                <button
                  className="ow-sidebarUser"
                  type="button"
                  onClick={signOut}
                >
                  <span
                    className="ow-avatar ow-avatar-sm ow-avatarChrome"
                    aria-hidden="true"
                  >
                    {initialsOf(displayNameOf(account.email))}
                  </span>
                  <span className="ow-sidebarUserMeta">
                    <span className="ow-sidebarUserName">
                      {displayNameOf(account.email)}
                    </span>
                    <span className="ow-sidebarUserRole">Sign out</span>
                  </span>
                </button>
              </div>
            </aside>
          </>
        )}

        <div className="ow-mainColumn">
          <header className="ow-topbar">
            {isPhone ? (
              <span className="ow-topbarMark">
                <ShopMark logo={brand.logo} name={brand.name} size={30} />
              </span>
            ) : isMobile ? (
              <button
                className="ow-btn ow-btn-ghost ow-btn-icon"
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileNav}
                onClick={() => setMobileNav((o) => !o)}
              >
                <Icon name="menu" />
              </button>
            ) : (
              <button
                className="ow-btn ow-btn-ghost ow-btn-icon"
                type="button"
                aria-label={
                  collapsed ? "Expand navigation" : "Collapse navigation"
                }
                aria-expanded={!collapsed}
                onClick={toggleCollapse}
              >
                <Icon name="panelLeft" />
              </button>
            )}
            <h1 className="ow-topbarTitle">{title}</h1>
            <div className="ow-spacer" />
            <div className="ow-topbarActions">
              <button
                className="ow-btn ow-btn-ghost ow-btn-icon"
                type="button"
                aria-label={
                  theme.resolved === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                onClick={() =>
                  theme.setPref(theme.resolved === "dark" ? "light" : "dark")
                }
              >
                <Icon name={theme.resolved === "dark" ? "sun" : "moon"} />
              </button>
              <Bell model={model} />
              {primary && (
                <Button
                  variant="primary"
                  size="sm"
                  icon="plus"
                  aria-label={
                    isPhone
                      ? `New ${primary.singular.toLowerCase()}`
                      : undefined
                  }
                  onClick={() => setAdding(primary)}
                >
                  {isPhone
                    ? undefined
                    : `New ${primary.singular.toLowerCase()}`}
                </Button>
              )}
            </div>
          </header>

          <main className="ow-pageBody" id="ow-main" data-page={route.page}>
            {page()}
          </main>
          {isPhone && (
            <nav className="ow-tabBar" aria-label="Shop navigation">
              {nav.map((item) => (
                <a
                  key={item.label}
                  className="ow-tabItem"
                  href={href(item.route)}
                  aria-current={isCurrent(item.route) ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(item.route);
                  }}
                >
                  <span className="ow-tabIcon">
                    <Icon name={item.icon} size={20} />
                    {item.count ? (
                      <span className="ow-tabBadge">{item.count}</span>
                    ) : null}
                  </span>
                  <span className="ow-tabLabel">{item.label}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>

      {adding && (
        <RecordFormDrawer table={adding} onClose={() => setAdding(undefined)} />
      )}
      {editing && (
        <RecordFormDrawer
          table={model.app.tables.find((t) => t.id === editing.table)!}
          record={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {review && (
        <ActionDialog
          key={`${review.record.id}-${review.action.id}`}
          record={review.record}
          action={review.action}
          onClose={() => setReview(undefined)}
        />
      )}
    </OwnerContext.Provider>
  );
}

/** "DHANLAXMI / ELECTRICALS": the wordmark's two lines from the shop's name. */
function BrandText({ name, sub }: { name: string; sub: string }) {
  const words = name.trim().split(/\s+/);
  const title = words.length > 1 ? words.slice(0, -1).join(" ") : name;
  const second =
    words.length > 1 ? words[words.length - 1] : sub || "Shop owner";
  return (
    <span className="ow-sidebarBrandText">
      <span className="ow-sidebarBrandTitle">{title.toUpperCase()}</span>
      <span className="ow-sidebarBrandSub">{second.toUpperCase()}</span>
    </span>
  );
}

/** The topbar's bell: the latest waiting records, with an unread dot. */
function Bell({ model }: { model: OwnerModel }) {
  const ctx = useOwner();
  const [seen, setSeen] = useState(() => readStored(seenKey(ctx.siteId)) ?? "");
  const items = model.workflows
    .flatMap((w) =>
      ctx
        .records(w.table.id)
        .filter((r) => isWaiting(w, r))
        .map((r) => ({ w, r })),
    )
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt));
  const unread = items.filter((i) => i.r.createdAt > seen).length;
  const w = model.primaryWorkflow;
  return (
    <Dropdown
      label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      wide
      onOpen={() => {
        // Opening the menu reads them.
        const latest = items[0]?.r.createdAt;
        if (latest && latest > seen) {
          writeStored(seenKey(ctx.siteId), latest);
          setSeen(latest);
        }
      }}
      trigger={
        <>
          <Icon name="bell" />
          {unread > 0 && <span className="ow-bellDot" aria-hidden="true" />}
        </>
      }
    >
      {(close) => (
        <>
          <p className="ow-dropdownLabel">Notifications</p>
          {items.length === 0 && (
            <p className="ow-dropdownEmpty">You're all caught up.</p>
          )}
          {items.slice(0, 3).map(({ w, r }) => (
            <a
              key={r.id}
              role="menuitem"
              className="ow-dropdownItem"
              href={ctx.href({
                page: "table",
                table: w.table.id,
                record: r.id,
              })}
              onClick={(e) => {
                e.preventDefault();
                close();
                ctx.go({ page: "table", table: w.table.id, record: r.id });
              }}
            >
              <span className="ow-warningIcon">
                <Icon name="receipt" size={16} />
              </span>
              <span>
                <strong>{personOf(ctx, w, r).name}</strong>
                {w.amount
                  ? ` submitted ${ctx.money(Number(r.values[w.amount.id] ?? 0))}`
                  : ` sent ${r.ref || "a record"}`}
                <br />
                <span className="ow-subtle">
                  {formatRelativeTime(r.createdAt)}
                </span>
              </span>
            </a>
          ))}
          {w && (
            <>
              <div className="ow-dropdownDivider" />
              <a
                role="menuitem"
                className="ow-dropdownItem"
                href={ctx.href({ page: "table", table: w.table.id })}
                onClick={(e) => {
                  e.preventDefault();
                  close();
                  ctx.go({ page: "table", table: w.table.id });
                }}
              >
                {`View all ${w.submitted ? "submissions" : w.table.name.toLowerCase()}`}
                <Icon name="chevronRight" size={14} className="ow-pushRight" />
              </a>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
