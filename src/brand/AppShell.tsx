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
import { ThemeSwitch } from "../design/ThemeSwitch";
import "./brand.css";
import "./admin.css";

export type ShellArea = "websites" | "store" | "account";
export interface Crumb {
  label: string;
  href?: string;
}

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
  subnav,
  headerExtra,
  contentRef,
  searchItems,
}: {
  area: ShellArea;
  crumbs: Crumb[];
  children: ReactNode;
  /** Shown next to "Your websites" when the page already knows it. */
  siteCount?: number;
  /** Second-level links shown under the active area (e.g. store sections). */
  subnav?: ReactNode;
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
    to: ShellArea,
    href: string,
    icon: string,
    label: string,
    extra?: ReactNode,
  ) => (
    <>
      <a href={href} aria-current={area === to ? "page" : undefined}>
        <span>
          <Icon name={icon} size={16} />
        </span>
        {label}
        {extra}
      </a>
      {area === to && subnav && (
        <div className="dashboard-subnav">{subnav}</div>
      )}
    </>
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
          {link(
            "websites",
            "/workspace",
            "grid",
            "Your websites",
            siteCount !== undefined && (
              <small className="dashboard-nav-count">{siteCount}</small>
            ),
          )}
          {link("store", "/commerce", "store", "Store management")}
          <a href="/templates">
            <span>
              <Icon name="panel" size={16} />
            </span>
            Templates
          </a>
          <a href="/editor">
            <span>
              <Icon name="edit" size={16} />
            </span>
            Browser draft
          </a>
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
