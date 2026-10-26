/**
 * The owner's side of the business app API (see api-types.ts for the routes).
 * Requests go through the workspace client, so they carry the signed-in
 * session and fail with an ApiError ({ status, message, field }).
 */
import { loadDraft, request } from "../cloud/client";
import type { AppRecord, AppValue } from "./model";
import type { AppInfo, PushDevice, RecordList, Summary } from "./api-types";
import { catalogOf, type Catalog } from "./app-helpers";

const site = (siteId: string) => `/sites/${encodeURIComponent(siteId)}/app`;
const post = (body: unknown = {}) => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const loadAppInfo = (siteId: string) => request<AppInfo>(site(siteId));
export const loadSummary = (siteId: string) =>
  request<Summary>(`${site(siteId)}/summary`);
export const listRecords = (siteId: string, tableId: string) =>
  request<RecordList>(
    `${site(siteId)}/records?table=${encodeURIComponent(tableId)}`,
  );
export const createRecord = (
  siteId: string,
  table: string,
  values: Record<string, AppValue>,
) =>
  request<{ record: AppRecord }>(
    `${site(siteId)}/records`,
    post({ table, values }),
  );
export const updateRecord = (
  siteId: string,
  recordId: string,
  values: Record<string, AppValue>,
  revision: number,
) =>
  request<{ record: AppRecord }>(
    `${site(siteId)}/records/${encodeURIComponent(recordId)}`,
    { method: "PUT", body: JSON.stringify({ values, revision }) },
  );
/** POST, since browsers' CORS rules here allow only GET, POST and PUT. */
export const deleteRecord = (siteId: string, recordId: string) =>
  request<{ deleted: true }>(
    `${site(siteId)}/records/${encodeURIComponent(recordId)}/delete`,
    post(),
  );
export const runAction = (
  siteId: string,
  recordId: string,
  actionId: string,
  input: { values: Record<string, AppValue>; note: string; revision: number },
) =>
  request<{ record: AppRecord }>(
    `${site(siteId)}/records/${encodeURIComponent(recordId)}/actions/${encodeURIComponent(actionId)}`,
    post(input),
  );

/** Marks a record's payment paid (cash, UPI or bank transfer the owner saw arrive). */
export const markPaid = (siteId: string, recordId: string, revision: number) =>
  request<{ record: AppRecord }>(
    `${site(siteId)}/records/${encodeURIComponent(recordId)}/paid`,
    post({ revision }),
  );
/**
 * The site collections item fields choose from, as the owner's forms and the
 * places panel need them. AppInfo doesn't carry them, so they come from the
 * saved draft — the same draft the app definition comes from.
 */
export async function loadCatalog(siteId: string): Promise<Catalog> {
  const { project } = await loadDraft(siteId);
  return catalogOf(project.collections ?? []);
}

export const listDevices = (siteId: string) =>
  request<{ devices: PushDevice[] }>(`${site(siteId)}/devices`);
export const addDevice = (
  siteId: string,
  subscription: PushSubscriptionJSON,
  label: string,
) =>
  request<{ device: PushDevice }>(
    `${site(siteId)}/devices`,
    post({ subscription, label }),
  );
export const removeDevice = (siteId: string, deviceId: string) =>
  request<{ deleted: true }>(
    `${site(siteId)}/devices/${encodeURIComponent(deviceId)}/delete`,
    post(),
  );
export const sendTestPush = (siteId: string) =>
  request<{ sent: number }>(`${site(siteId)}/devices/test`, post());
/** The public VAPID key browsers subscribe with. */
export const loadPushKey = () => request<{ publicKey: string }>("/push/key");
