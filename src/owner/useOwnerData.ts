/**
 * Everything the owner app shows for one site: the app definition, the
 * draft project (for the shop's name, logo and colours) and every table's
 * records. Kept in a module cache so a back / forward (which remounts the
 * page) shows the last data straight away while it refreshes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loadDraft } from "../cloud/client";
import type { Project } from "../studio/model";
import type { AppRecord, AppValue, AppAction } from "../apps/model";
import type { AppInfo, RecordList } from "../apps/api-types";
import * as api from "../apps/api";
import { errorText } from "../apps/app-helpers";

export type LoadStatus = "loading" | "ready" | "error" | "denied" | "noapp";
export interface OwnerData {
  status: LoadStatus;
  error: string;
  info?: AppInfo;
  project?: Project;
  lists: Record<string, RecordList | undefined>;
  listErrors: Record<string, string>;
}
const empty: OwnerData = {
  status: "loading",
  error: "",
  lists: {},
  listErrors: {},
};
const cache = new Map<string, OwnerData>();
/** Forget cached sites (sign out, tests). */
export const clearOwnerCache = () => cache.clear();
/** How often the open app checks for new records while visible. */
export const REFRESH_MS = 30_000;

export function useOwnerData(siteId: string, enabled: boolean) {
  const [data, setData] = useState<OwnerData>(() => cache.get(siteId) ?? empty);
  const generation = useRef(0);
  const update = useCallback(
    (change: (d: OwnerData) => OwnerData) =>
      setData((d) => {
        const next = change(d);
        cache.set(siteId, next);
        return next;
      }),
    [siteId],
  );

  const loadLists = useCallback(
    async (tableIds: string[]) => {
      const run = generation.current;
      const results = await Promise.allSettled(
        tableIds.map((id) => api.listRecords(siteId, id)),
      );
      if (run !== generation.current) return;
      update((d) => {
        const lists = { ...d.lists };
        const listErrors = { ...d.listErrors };
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            lists[tableIds[i]] = r.value;
            listErrors[tableIds[i]] = "";
          } else
            listErrors[tableIds[i]] = errorText(
              r.reason,
              "These records could not be loaded.",
            );
        });
        return { ...d, lists, listErrors };
      });
    },
    [siteId, update],
  );

  const load = useCallback(async () => {
    const run = ++generation.current;
    try {
      const [info, draft] = await Promise.all([
        api.loadAppInfo(siteId),
        Promise.resolve(loadDraft(siteId)).catch(() => undefined),
      ]);
      if (run !== generation.current) return;
      if (!info.app) {
        update(() => ({
          ...empty,
          status: "noapp",
          info,
          project: draft?.project,
        }));
        return;
      }
      update((d) => ({
        ...d,
        status: "ready",
        error: "",
        info,
        project: draft?.project ?? d.project,
      }));
      await loadLists(info.app.tables.map((t) => t.id));
    } catch (error) {
      if (run !== generation.current) return;
      const denied =
        error instanceof ApiError &&
        (error.status === 403 || error.status === 404 || error.status === 401);
      update((d) => ({
        ...d,
        status:
          d.status === "ready" && !denied
            ? "ready"
            : denied
              ? "denied"
              : "error",
        error: errorText(error, "The shop could not be loaded."),
      }));
    }
  }, [siteId, update, loadLists]);

  useEffect(() => {
    if (!enabled || !siteId) return;
    void load();
  }, [enabled, siteId, load]);

  const tableIds = data.info?.app?.tables.map((t) => t.id).join(",") ?? "";
  /** Reloads every table: totals and the dashboard depend on all of them. */
  const refresh = useCallback(
    () => (tableIds ? loadLists(tableIds.split(",")) : load()),
    [tableIds, loadLists, load],
  );

  // New records arrive quietly while the app is open and visible.
  useEffect(() => {
    if (!enabled || !tableIds) return;
    const check = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const timer = setInterval(check, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, tableIds, refresh]);

  const runAction = useCallback(
    async (
      record: AppRecord,
      action: AppAction,
      values: Record<string, AppValue>,
      note: string,
    ) => {
      try {
        const result = await api.runAction(siteId, record.id, action.id, {
          values,
          note,
          revision: record.revision,
        });
        await refresh();
        return result.record;
      } catch (error) {
        // Someone (or another tab) got there first: show what the server has.
        if (error instanceof ApiError && error.status === 409) void refresh();
        throw error;
      }
    },
    [siteId, refresh],
  );
  const createRecord = useCallback(
    async (table: string, values: Record<string, AppValue>) => {
      const result = await api.createRecord(siteId, table, values);
      await refresh();
      return result.record;
    },
    [siteId, refresh],
  );
  const updateRecord = useCallback(
    async (record: AppRecord, values: Record<string, AppValue>) => {
      const result = await api.updateRecord(
        siteId,
        record.id,
        values,
        record.revision,
      );
      await refresh();
      return result.record;
    },
    [siteId, refresh],
  );
  const deleteRecord = useCallback(
    async (record: AppRecord) => {
      await api.deleteRecord(siteId, record.id);
      await refresh();
    },
    [siteId, refresh],
  );

  return {
    data,
    reload: load,
    refresh,
    runAction,
    createRecord,
    updateRecord,
    deleteRecord,
  };
}
export type OwnerActions = Omit<ReturnType<typeof useOwnerData>, "data">;
