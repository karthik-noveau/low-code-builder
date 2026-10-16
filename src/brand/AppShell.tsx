import { Fragment, useState, type ReactNode, type Ref } from "react";
import { Arrow, Brand } from "./Brand";
import { useSession } from "./useSession";
import { Icon } from "../studio/Icon";
import * as cloud from "../cloud/client";
import "./brand.css";

export type ShellArea = "websites" | "store" | "account";
export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The frame every signed-in page shares: the workspace sidebar and a top bar
 * with breadcrumbs and the account. Pages put their content inside it, so the
 * workspace, store, domains and account pages look like one product.
 */
export function AppShell({
  area,
  crumbs,
  children,
  siteCount,
  subnav,
  headerExtra,
  contentRef,
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
}) {
  const session = useSession();
  const [error, setError] = useState("");
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
          <Icon name={icon} size={18} />
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
    <div className="brand-app dashboard-app">
      <aside className="dashboard-sidebar">
        <a href="/" aria-label="Forma home">
          <Brand />
        </a>
        <span className="dashboard-nav-label">WORKSPACE</span>
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
          <a href="/templates">
            <span>
              <Icon name="panel" size={18} />
            </span>
            Templates <Arrow diagonal />
          </a>
          {link("store", "/commerce", "store", "Store management")}
          {link("account", "/account", "settings", "Account settings")}
          <a href="/editor">
            <span>
              <Icon name="edit" size={18} />
            </span>
            Browser draft
          </a>
        </nav>
        <div className="dashboard-sidebar-bottom">
          <a href="/help">
            Guides & help <Arrow diagonal />
          </a>
          <a href="/">
            Back to Forma <Arrow diagonal />
          </a>
        </div>
      </aside>
      <div ref={contentRef} className="dashboard-content">
        <header className="dashboard-header">
          <span className="dashboard-crumbs">
            <span className="crumb">
              <Icon name="layers" size={15} />
            </span>
            {crumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <span className="crumb-sep">/</span>}
                {i === crumbs.length - 1 ? (
                  <strong>{crumb.label}</strong>
                ) : crumb.href ? (
                  <a className="crumb" href={crumb.href}>
                    {crumb.label}
                  </a>
                ) : (
                  <span className="crumb">{crumb.label}</span>
                )}
              </Fragment>
            ))}
            {headerExtra}
          </span>
          {session.account ? (
            <div>
              <span className="dashboard-avatar">
                {session.account.email[0].toUpperCase()}
              </span>
              <span
                className="dashboard-account-email"
                title={session.account.email}
              >
                {session.account.email}
              </span>
              <button className="brand-text-link" onClick={() => void logout()}>
                Log out
              </button>
            </div>
          ) : (
            <a href="/login" className="brand-text-link">
              Log in <Arrow />
            </a>
          )}
        </header>
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

/** The title block every shell page starts with: kicker, heading, summary, action. */
export function PageHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dashboard-heading">
      <div>
        <span className="brand-kicker">{kicker}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
