import {
  Fragment,
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useState,
} from "react";
import { PublicSite } from "./brand/PublicSite";
import { metadataFor, navigate, opensInApp } from "./brand/navigation";

const CommercePage = lazy(() =>
  import("./commerce/CommercePage").then((module) => ({
    default: module.CommercePage,
  })),
);
const AppPage = lazy(() =>
  import("./apps/AppPage").then((module) => ({
    default: module.AppPage,
  })),
);
const OwnerApp = lazy(() =>
  import("./owner/OwnerApp").then((module) => ({
    default: module.OwnerApp,
  })),
);
const Storefront = lazy(() =>
  import("./commerce/Storefront").then((module) => ({
    default: module.Storefront,
  })),
);
const CustomerAccount = lazy(() =>
  import("./commerce/CustomerAccount").then((module) => ({
    default: module.CustomerAccount,
  })),
);
const AccountPage = lazy(() =>
  import("./commerce/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
);

const DomainsPage = lazy(() =>
  import("./brand/DomainsPage").then((module) => ({
    default: module.DomainsPage,
  })),
);
const Studio = lazy(() =>
  import("./studio/Studio").then((module) => ({ default: module.Studio })),
);
const AuthPage = lazy(() =>
  import("./brand/WorkspacePages").then((module) => ({
    default: module.AuthPage,
  })),
);
const Dashboard = lazy(() =>
  import("./brand/WorkspacePages").then((module) => ({
    default: module.Dashboard,
  })),
);
const WorkspaceTemplates = lazy(() =>
  import("./brand/WorkspaceTemplates").then((module) => ({
    default: module.WorkspaceTemplates,
  })),
);
const NewWebsite = lazy(() =>
  import("./brand/WorkspacePages").then((module) => ({
    default: module.NewWebsite,
  })),
);
const TemplatePreview = lazy(() =>
  import("./brand/TemplatePreview").then((module) => ({
    default: module.TemplatePreview,
  })),
);

/**
 * Follows plain clicks on in-app links without reloading the page. Links that
 * open elsewhere, in a new tab, or are handled by their own click keep the
 * browser's behaviour.
 */
function followLink(e: MouseEvent) {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  )
    return;
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (
    !(link instanceof HTMLAnchorElement) ||
    (link.target && link.target !== "_self") ||
    link.hasAttribute("download")
  )
    return;
  const url = new URL(link.href);
  // Same page with a #fragment: let the browser scroll to it.
  if (
    url.hash &&
    url.pathname === location.pathname &&
    url.search === location.search
  )
    return;
  if (!opensInApp(url)) return;
  e.preventDefault();
  navigate(url.href);
}

export default function App() {
  // Re-render on in-app navigation and the back/forward buttons.
  const [address, setAddress] = useState(location.pathname + location.search);
  useEffect(() => {
    const changed = () => {
      // A transition keeps the current page up while the next one's code loads.
      startTransition(() => setAddress(location.pathname + location.search));
      if (!location.hash) window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", changed);
    document.addEventListener("click", followLink);
    return () => {
      window.removeEventListener("popstate", changed);
      document.removeEventListener("click", followLink);
    };
  }, []);
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(location.search);
  const callback =
    path === "/" &&
    query.has("state") &&
    (query.has("code") || query.has("error"));
  useEffect(() => {
    const meta = metadataFor(path);
    document.title = meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", meta.description);
  }, [path]);
  let page;
  if (callback || path === "/login" || path === "/signup")
    page = <AuthPage signup={path === "/signup"} callback={callback} />;
  else if (path === "/workspace") page = <Dashboard />;
  else if (path === "/workspace/templates") page = <WorkspaceTemplates />;
  else if (path === "/commerce")
    page = <CommercePage initialSiteId={query.get("site") || ""} />;
  else if (path === "/apps")
    page = <AppPage siteId={query.get("site") || ""} />;
  else if (path === "/owner")
    page = <OwnerApp siteId={query.get("site") || ""} />;
  else if (path === "/store")
    page = <Storefront siteId={query.get("site") || ""} />;
  else if (path === "/customer")
    page = <CustomerAccount siteId={query.get("site") || ""} />;
  else if (path === "/account") page = <AccountPage />;
  else if (path === "/domains")
    page = <DomainsPage siteId={query.get("site") || ""} />;
  else if (path === "/new") page = <NewWebsite />;
  else if (path === "/editor")
    page = <Studio initialSiteId={query.get("site") || undefined} />;
  else if (path.startsWith("/templates/"))
    page = <TemplatePreview id={path.slice("/templates/".length)} />;
  else page = <PublicSite path={path} />;
  return (
    <Suspense
      fallback={
        <div className="brand-app brand-route-loading" role="status">
          Opening Forma…
        </div>
      }
    >
      {/* Each address starts its page fresh, as a full load did. */}
      <Fragment key={address}>{page}</Fragment>
    </Suspense>
  );
}
