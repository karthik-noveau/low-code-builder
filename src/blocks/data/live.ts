/**
 * App records in the editor: data blocks show the owner's real records,
 * read with the owner's session through the owner API (the same records the
 * app page shows), then reduced by the same view rules visitors get
 * (views.ts). One read per table per editor session, shared by every block.
 * Without a workspace site (a local draft) blocks show sample rows instead.
 */
import { useEffect, useState } from "react";
import { request } from "../../cloud/client";
import type { LinkTitles, RecordList } from "../../apps/api-types";
import type { AppRecord } from "../../apps/model";

export interface TableData {
  status: "none" | "loading" | "ready" | "error";
  records: AppRecord[];
  links: LinkTitles;
}
const NONE: TableData = { status: "none", records: [], links: {} };
const LOADING: TableData = { status: "loading", records: [], links: {} };

/** The workspace site open in the editor, if any. */
export function editorSite(): string | null {
  if (typeof window === "undefined" || typeof location === "undefined")
    return null;
  // Only the editor and its preview read records (never a published page).
  if (location.pathname.replace(/\/+$/, "") !== "/editor") return null;
  return new URLSearchParams(location.search).get("site");
}

const cache = new Map<string, TableData>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

function load(site: string, table: string, again = false) {
  const key = `${site}:${table}`;
  if (cache.has(key) && !again) return;
  // Reading again keeps what's shown until the new records arrive.
  if (!cache.has(key)) cache.set(key, LOADING);
  // GET /sites/:id/app/records (the owner API; src/apps/api.ts listRecords).
  request<RecordList>(
    `/sites/${encodeURIComponent(site)}/app/records?table=${encodeURIComponent(table)}`,
  ).then(
    (list) => {
      cache.set(key, {
        status: "ready",
        records: list.records,
        links: list.links,
      });
      changed();
    },
    () => {
      if (!again) cache.set(key, { ...NONE, status: "error" });
      changed();
    },
  );
}
let readAt = Date.now();
/** Reads every table again (records may have changed on the app page). */
export function refreshTables() {
  readAt = Date.now();
  for (const key of cache.keys()) {
    const [site, table] = key.split(":");
    load(site, table, true);
  }
}
// Coming back to the editor (e.g. from the app page) shows new records.
if (typeof window !== "undefined")
  window.addEventListener("focus", () => {
    if (Date.now() - readAt > 15_000) refreshTables();
  });

/** The owner's records of `table` (with totals and link titles), read once. */
export function useTableData(table: string | undefined, enabled = true) {
  const site = enabled && table ? editorSite() : null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!site || !table) return;
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    load(site, table);
    return () => {
      listeners.delete(listener);
    };
  }, [site, table]);
  if (!site || !table) return NONE;
  return cache.get(`${site}:${table}`) ?? LOADING;
}
