/**
 * The owner app's address: /owner?site=<id>&page=dashboard|submissions|
 * customers|customer|settings&record=<id>&status=<status>. `table=<id>` names
 * any table directly (push notifications open /…?table=…&record=…).
 */
import type { OwnerModel } from "./roles";

export type Route =
  | { page: "dashboard" }
  | { page: "settings" }
  | { page: "table"; table: string; record?: string; status?: string };

export interface RawRoute {
  page: string;
  table: string;
  record: string;
  status: string;
}
export function readRaw(search = location.search): RawRoute {
  const q = new URLSearchParams(search);
  return {
    page:
      q.get("page") ||
      (q.get("section") === "notifications" ? "settings" : "") ||
      "",
    table: q.get("table") || "",
    record: q.get("record") || "",
    status: q.get("status") || "",
  };
}
/** Turns the address into a page of this app; unknown pages open the dashboard. */
export function resolveRoute(raw: RawRoute, model: OwnerModel): Route {
  const extra = {
    ...(raw.record ? { record: raw.record } : {}),
    ...(raw.status ? { status: raw.status } : {}),
  };
  if (raw.page === "settings" || raw.page === "notifications")
    return { page: "settings" };
  if (raw.table && model.order.some((t) => t.id === raw.table))
    return { page: "table", table: raw.table, ...extra };
  const alias =
    raw.page === "submissions"
      ? model.primaryWorkflow?.table
      : raw.page === "customers" || raw.page === "customer"
        ? model.primaryPeople?.table
        : undefined;
  if (alias) return { page: "table", table: alias.id, ...extra };
  return { page: "dashboard" };
}
export function hrefFor(siteId: string, route: Route, model?: OwnerModel) {
  const q = new URLSearchParams();
  q.set("site", siteId);
  if (route.page === "settings") q.set("page", "settings");
  if (route.page === "table") {
    const page =
      model?.primaryWorkflow?.table.id === route.table
        ? "submissions"
        : model?.primaryPeople?.table.id === route.table
          ? route.record
            ? "customer"
            : "customers"
          : "";
    if (page) q.set("page", page);
    else q.set("table", route.table);
    if (route.record) q.set("record", route.record);
    if (route.status) q.set("status", route.status);
  }
  return `/owner?${q.toString()}`;
}
export const sameRoute = (a: Route, b: Route) =>
  JSON.stringify(a) === JSON.stringify(b);
