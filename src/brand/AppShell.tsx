import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Arrow, Brand } from "./Brand";
import { useSession } from "./useSession";
import { Icon } from "../studio/Icon";
import * as cloud from "../cloud/client";
import { GlobalSearch, Notifications, type SearchItem } from "./ShellTools";
import { loadSites } from "./activity";
import { ThemeSwitch } from "../design/ThemeSwitch";
import "./brand.css";
import "./admin.css";
import "./polish.css";

export type ShellArea = "websites" | "templates" | "store" | "app" | "account";
/** The app page's sections for the sidebar, given by the app page itself. */
export interface AppNav {
  siteId: string;
  items: { id: string; label: string; icon: string }[];
  current: string;
  onSelect: (id: string) => void;
}
/** The address of an app page section; ids other than these two are tables. */
const appSectionHref = (siteId: string, id: string) =>
  `/apps?site=${encodeURIComponent(siteId)}${
    id === "dashboard"
      ? ""
      : id === "notifications"
        ? "&section=notifications"
        : `&table=${encodeURIComponent(id)}`
  }`;
export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Store sections, always listed in the sidebar so every part of the store is
 * one click away. Labels match the store page's own section names.
 */
const STORE_NAV: { label: string; items: [string, string][] }[] = [
  {
    label: "Store",
    items: [
      ["Overview", "chart"],
      ["Products", "tag"],
      ["Orders", "receipt"],
      ["Customers", "users"],
      ["Discounts", "percent"],
      ["Content", "type"],
      ["Inbox", "mail"],
    ],
  },
  {
    label: "Store settings",
    items: [
      ["Markets", "globe"],
      ["Team", "lock"],
      ["Integrations", "plug"],
      ["Usage & activity", "activity"],
    ],
  },
];
/** Recent websites listed under "Your websites". */
const SIDEBAR_SITES = 4;

/**
 * The frame every signed-in page shares: a top bar with the trail and the
 * account menu, the workspace sidebar, and a grey canvas the page's cards sit
 * on. Pages put their content inside it, so the workspace, store, domains and
 * account pages look like one product. On phones the sidebar is a drawer.
 */
export function AppShell({
  area,
  crumbs,
  children,
  siteCount,
  storeSection,
  onStoreSection,
  appNav,
  headerExtra,
  contentRef,
  searchItems,
}: {
  area: ShellArea;
  crumbs: Crumb[];
  children: ReactNode;
  /** Shown next to "Your websites" when the page already knows it. */
  siteCount?: number;
  /** The store page's open section; with `onStoreSection`, store links switch in place. */
  storeSection?: string;
  onStoreSection?: (section: string) => void;
  /**
   * The app page's sections (Dashboard, each table, Notifications); they switch
   * in place. Other pages show a single "App" link instead, so the sidebar
   * never loads an app definition itself.
   */
  appNav?: AppNav;
  /** Controls placed after the breadcrumbs, such as a website switcher. */
  headerExtra?: ReactNode;
  contentRef?: Ref<HTMLDivElement>;
  /** Page-specific results for the top bar search, listed first. */
  searchItems?: SearchItem[];
}) {
  const session = useSession();
  const [error, setError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const [sites, setSites] = useState<cloud.Site[]>([]);
  useEffect(() => {
    if (!session.account) return;
    let live = true;
    loadSites()
      .then((list) => live && setSites(list))
      // The sidebar still works without the list; the dashboard reports errors.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [session.account]);
  const recent = [...sites]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, SIDEBAR_SITES);
  const current = new URLSearchParams(location.search).get("site");
  // The account menu closes on any click outside it, like a real menu.
  useEffect(() => {
    const close = (event: MouseEvent) => {
      const menu = accountRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  useEffect(() => {
    if (!navOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navOpen]);
  const logout = async () => {
    try {
      await cloud.signOut();
      if (session.config.mode !== "aws") location.assign("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign out.");
    }
  };
  const link = (
    to: ShellArea | null,
    href: string,
    icon: string,
    label: string,
    extra?: ReactNode,
  ) => (
    <a href={href} aria-current={to && area === to ? "page" : undefined}>
      <span>
        <Icon name={icon} size={16} />
      </span>
      {label}
      {extra}
    </a>
  );
  return (
    <div
      className={`brand-app dashboard-app admin-ui ${navOpen ? "is-nav-open" : ""}`}
    >
      <header className="admin-topbar">
        <button
          className="admin-menu-button"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen(!navOpen)}
        >
          <Icon name={navOpen ? "x" : "menu"} size={18} />
        </button>
        <a href="/" className="admin-logo" aria-label="Forma home">
          <Brand />
        </a>
        <nav className="dashboard-crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, i) => (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 && (
                <span className="crumb-sep" aria-hidden="true">
                  /
                </span>
              )}
              {i === crumbs.length - 1 ? (
                <strong aria-current="page">{crumb.label}</strong>
              ) : crumb.href ? (
                <a className="crumb" href={crumb.href}>
                  {crumb.label}
                </a>
              ) : (
                <span className="crumb">{crumb.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
        {headerExtra && <div className="admin-topbar-extra">{headerExtra}</div>}
        {session.account && (
          <div className="admin-topbar-tools">
            <GlobalSearch extra={searchItems} />
            <ThemeSwitch variant="button" className="admin-theme" />
            <Notifications account={session.account.email} />
          </div>
        )}
        {session.account ? (
          <details className="admin-account" ref={accountRef}>
            <summary aria-label="Account menu">
              <span className="dashboard-avatar">
                {session.account.email[0].toUpperCase()}
              </span>
              <span
                className="dashboard-account-email"
                title={session.account.email}
              >
                {session.account.email}
              </span>
              <Icon name="down" size={14} />
            </summary>
            <div className="admin-account-menu">
              <p>
                Signed in as
                <strong>{session.account.email}</strong>
              </p>
              <div className="admin-account-theme">
                <span>Theme</span>
                <ThemeSwitch />
              </div>
              <a href="/account">
                <Icon name="settings" size={15} /> Account settings
              </a>
              <a href="/help">
                <Icon name="help" size={15} /> Guides & help
              </a>
              <button onClick={() => void logout()}>
                <Icon name="arrow" size={15} /> Log out
              </button>
            </div>
          </details>
        ) : (
          <a href="/login" className="admin-login">
            Log in <Arrow />
          </a>
        )}
      </header>
      <button
        className="admin-scrim"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="dashboard-sidebar">
        <nav aria-label="Workspace navigation">
          <p className="dashboard-nav-label">Workspace</p>
          {link(
            "websites",
            "/workspace",
            "grid",
            "Your websites",
            (siteCount ?? (session.account ? sites.length : undefined)) !==
              undefined && (
              <small className="dashboard-nav-count">
                {siteCount ?? sites.length}
              </small>
            ),
          )}
          {recent.length > 0 && (
            <div className="dashboard-nav-sites">
              {recent.map((site) => (
                <a
                  key={site.id}
                  href={`/editor?site=${site.id}`}
                  aria-current={current === site.id ? "true" : undefined}
                  title={`Open ${site.name} in the editor`}
                >
                  <i
                    className={site.publishedRelease ? "is-live" : ""}
                    aria-label={site.publishedRelease ? "Live" : "Draft"}
                  />
                  {site.name}
                </a>
              ))}
            </div>
          )}
          {link("templates", "/workspace/templates", "panel", "Templates")}
          {link(null, "/editor", "edit", "Browser draft")}
          <p className="dashboard-nav-label">App</p>
          {appNav
            ? appNav.items.map((item) => (
                <a
                  key={item.id}
                  href={appSectionHref(appNav.siteId, item.id)}
                  aria-current={appNav.current === item.id ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    appNav.onSelect(item.id);
                    setNavOpen(false);
                  }}
                >
                  <span>
                    <Icon name={item.icon} size={16} />
                  </span>
                  {item.label}
                </a>
              ))
            : link(
                "app",
                `/apps${current ? `?site=${encodeURIComponent(current)}` : ""}`,
                "layers",
                "Business app",
              )}
          {STORE_NAV.map((group) => (
            <Fragment key={group.label}>
              <p className="dashboard-nav-label">{group.label}</p>
              {group.items.map(([label, icon]) => {
                const active = area === "store" && storeSection === label;
                const href = `/commerce?${current ? `site=${current}&` : ""}section=${label.split(" ")[0].toLowerCase()}`;
                return (
                  <a
                    key={label}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => {
                      // On the store page, switch sections without a reload.
                      if (!onStoreSection) return;
                      event.preventDefault();
                      onStoreSection(label);
                      setNavOpen(false);
                    }}
                  >
                    <span>
                      <Icon name={icon} size={16} />
                    </span>
                    {label}
                  </a>
                );
              })}
            </Fragment>
          ))}
        </nav>
        <div className="dashboard-sidebar-bottom">
          {link("account", "/account", "settings", "Settings")}
          <a href="/help">
            <span>
              <Icon name="help" size={16} />
            </span>
            Guides & help
          </a>
        </div>
      </aside>
      <div ref={contentRef} className="dashboard-content">
        {error && (
          <p role="alert" className="brand-form-error dashboard-shell-error">
            {error}
          </p>
        )}
        <main id="main" className="dashboard-main">
          {children}
        </main>
      </div>
    </div>
  );
}

/** The title block every shell page starts with: context, heading, summary, actions. */
export function PageHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dashboard-heading">
      <div>
        {kicker && <span className="brand-kicker">{kicker}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="dashboard-heading-actions">{action}</div>}
    </div>
  );
}
