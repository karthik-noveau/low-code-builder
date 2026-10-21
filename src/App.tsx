import { lazy, Suspense, useEffect } from "react";
import { PublicSite } from "./brand/PublicSite";
import { metadataFor } from "./brand/navigation";

const CommercePage = lazy(() =>
  import("./commerce/CommercePage").then((module) => ({
    default: module.CommercePage,
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

export default function App() {
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
      {page}
    </Suspense>
  );
}
