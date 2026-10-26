/**
 * Business app records: storage, the owner's API and the public form API.
 *
 * Records live in the site's commerce partition (so site deletion and the
 * lifecycle guard cover them) under these sort keys:
 *   APPREC#<table>#<id>            a record; `linked` counts records pointing at it
 *   APPUNIQ#<table>#<field>#<value> claims a unique value, written with the record
 *   APPCOUNT#<table>               records in the table (bounded by MAX_RECORDS)
 *   APPREF#<table>                 the last reference number handed out
 *   APPIDEM#<form>#<key>           a visitor submit's result, so a double tap adds one record
 *   APPDAY#<date>                  visitor submits per UTC day
 *   APPLOOKUP#<ip hash>#<minute>   lookups per IP per minute
 *   APPDEVICE#<id>                 the owner's devices for push notifications
 *   APPCFG#                        which release's app config is live
 *   APPREFX#<table>#<REF>          reference → record id, for reference lookups
 *   APPCAP#<table>#<capacity>#<group> places taken in one group of a capacity
 *                                  (`taken`), changed in the record's transaction
 *   APPAVAIL#<ip hash>#<minute>    availability reads per IP per minute
 *   APPVIEW#<ip hash>#<minute>     public view and metric reads per IP per minute
 * Totals are rolled up on read, never stored, so they can't drift.
 *
 * The owner's routes work on the latest saved draft's app, so customers can
 * be added before the site goes live; the public routes use only the live
 * release's config, written at publish.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { config, epoch, HttpError, idPattern, insist } from "./config";
import {
  key,
  message,
  now,
  partition,
  read,
  type Write,
} from "./commerce-data";
import { db, deleteItem, getItem, putItem } from "./database";
import { readObject, writeObject } from "./objects";
import { decodeProject, digest } from "./project";
import { publicKey, sendPush, validSubscription } from "./push";
import {
  checkoutPaid,
  createCheckout,
  currencyCode,
  getConnection,
} from "./payments";
import type { ApiRequest, ApiResponse } from "./api";
import type { Site } from "./types";
import type { Project } from "../src/studio/model";
import { liveAppForms } from "../src/studio/export";
import { itemTitle } from "../src/studio/collections";
import {
  parseAmount,
  upiLink,
  usablePayments,
  type PaymentSettings,
} from "../src/studio/payments";
import {
  cardValue,
  checkLimits,
  computeTotals,
  DAILY_SUBMISSIONS,
  describeLines,
  fieldOf,
  formatAppValue,
  formatMoney,
  LOOKUPS_PER_MINUTE,
  maskValue,
  MAX_RECORDS,
  normalizePhone,
  parseValues,
  placesTaken,
  recordTitle,
  REF_KEY,
  statusOf,
  tableOf,
  type App,
  type AppCapacity,
  type AppField,
  type AppForm,
  type AppLine,
  type AppPayment,
  type AppRecord,
  type AppTable,
  type AppTotal,
  type AppValue,
  type CatalogItem,
} from "../src/apps/model";
import type {
  AppInfo,
  Availability,
  FindResult,
  LinkTitles,
  PushDevice,
  RecordList,
  ShownValue,
  SubmitResult,
  Summary,
  TotalValue,
  PublicView,
} from "../src/apps/api-types";
import { VIEW_READS_PER_MINUTE } from "../src/apps/api-types";
import {
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  publicMetrics,
  publicViews,
  selectRecords,
  shownRow,
  viewColumns,
} from "../src/blocks/data/views";

/** A validation problem that belongs to one input. */
export class FieldError extends HttpError {
  constructor(
    status: number,
    message: string,
    public field: string,
  ) {
    super(status, message);
  }
}
const MAX_DEVICES = 20;
const MAX_HISTORY = 100;
const HISTORY_SHOWN = 50;

// ---------------------------------------------------------------- config

/** Collection id → the items app forms can choose, for item and items fields. */
export type Catalogs = Record<string, CatalogItem[]>;
type Catalog = (collectionId: string) => CatalogItem[] | undefined;
/**
 * The visible items of the collections the app's item fields choose from:
 * slug, title, price (whole currency units) and number fields (e.g. seats).
 */
export function appCatalogs(project: Project): Catalogs {
  const used = new Set(
    (project.app?.tables ?? []).flatMap((t) =>
      t.fields
        .filter(
          (f) => (f.type === "item" || f.type === "items") && f.collection,
        )
        .map((f) => f.collection!),
    ),
  );
  const catalogs: Catalogs = {};
  for (const c of project.collections ?? []) {
    if (!used.has(c.id)) continue;
    const numbers = c.fields.filter((f) => f.type === "number");
    catalogs[c.id] = c.items
      .filter((item) => !item.hidden)
      .map((item) => {
        const cents = c.display.price
          ? parseAmount(item.values[c.display.price])
          : null;
        const found: Record<string, number> = {};
        for (const f of numbers) {
          const raw = (item.values[f.id] ?? "").replace(/,/g, "").trim();
          const n = Number(raw);
          if (raw && Number.isFinite(n)) found[f.id] = n;
        }
        return {
          slug: item.slug,
          title: itemTitle(c, item).slice(0, 120),
          price: cents === null ? null : cents / 100,
          ...(Object.keys(found).length ? { numbers: found } : {}),
        };
      });
  }
  return catalogs;
}
const catalogOf =
  (catalogs: Catalogs | undefined): Catalog =>
  (id) =>
    catalogs && Object.hasOwn(catalogs, id) ? catalogs[id] : undefined;

/** What one release's forms accept: the app, with only forms placed on the site. */
export interface AppConfig {
  app: App;
  site: { name: string; accent: string };
  /** The live items item fields choose from (public: they're on the site). */
  catalogs?: Catalogs;
  /** How visitors pay; only methods that are correctly filled in. */
  payments?: PaymentSettings | null;
}
export function appConfig(project: Project): AppConfig | null {
  if (!project.app) return null;
  return {
    // Only public views are published; drafts never reach the public API.
    app: {
      ...project.app,
      forms: liveAppForms(project),
      views: publicViews(project.app),
    },
    site: { name: project.name.slice(0, 120), accent: project.theme.accent },
    catalogs: appCatalogs(project),
    payments: usablePayments(project.payments),
  };
}
const configKey = (siteId: string, releaseId: string) =>
  `apps/${siteId}/${releaseId}.json`;
export async function writeAppConfig(
  siteId: string,
  releaseId: string,
  value: AppConfig | null,
) {
  if (!value) return;
  await writeObject(
    "drafts",
    configKey(siteId, releaseId),
    Buffer.from(JSON.stringify(value)),
    "application/json",
  );
}
/** Points the public API at a release's app; no release closes every form. */
export async function activateApp(
  owner: string,
  siteId: string,
  releaseId?: string,
) {
  await putItem({
    ...key(siteId, "APPCFG"),
    owner,
    releaseId: releaseId ?? "",
  });
}
// Configs never change once written, so each instance keeps the few it reads.
const configs = new Map<string, AppConfig | null>();
async function liveApp(siteId: string) {
  const pointer = await read<{ owner: string; releaseId: string }>(
    siteId,
    "APPCFG",
  );
  if (!pointer?.releaseId) return undefined;
  const cacheKey = configKey(siteId, pointer.releaseId);
  if (!configs.has(cacheKey)) {
    let value: AppConfig | null = null;
    try {
      value = JSON.parse(
        (await readObject("drafts", cacheKey)).toString(),
      ) as AppConfig;
    } catch {
      // The release has no app (or predates apps).
    }
    if (configs.size > 500) configs.clear();
    configs.set(cacheKey, value);
  }
  const value = configs.get(cacheKey);
  return value
    ? { owner: pointer.owner, releaseId: pointer.releaseId, ...value }
    : undefined;
}
const drafts = new Map<string, { app: App | null; catalogs: Catalogs }>();
/** The app in the site's latest saved draft, and its collections' items. */
async function draft(site: Site) {
  if (!site.draftKey) return { app: null, catalog: catalogOf(undefined) };
  if (!drafts.has(site.draftKey)) {
    const { project } = decodeProject(
      await readObject("drafts", site.draftKey),
    );
    if (drafts.size > 200) drafts.clear();
    drafts.set(site.draftKey, {
      app: project.app ?? null,
      catalogs: appCatalogs(project),
    });
  }
  const value = drafts.get(site.draftKey)!;
  return { app: value.app, catalog: catalogOf(value.catalogs) };
}

// ---------------------------------------------------------------- storage

/** `payKey` is a hash of the visitor's submit key, which lets them check their payment. */
type Stored = AppRecord & { linked?: number; payKey?: string };
const recordKey = (siteId: string, tableId: string, id: string) =>
  key(siteId, `APPREC#${tableId}`, id);
function toRecord(item: object): AppRecord {
  const {
    pk: _pk,
    sk: _sk,
    linked: _linked,
    payKey: _payKey,
    ...data
  } = item as Record<string, unknown>;
  void _pk;
  void _sk;
  void _linked;
  void _payKey;
  return data as unknown as AppRecord;
}
async function getRecord(siteId: string, tableId: string, id: string) {
  if (!idPattern.test(id)) return undefined;
  const k = recordKey(siteId, tableId, id);
  return getItem<Stored & { pk: string; sk: string }>(k.pk, k.sk);
}
/** Every record of a table, newest first. Bounded by MAX_RECORDS. */
async function listRecords(siteId: string, tableId: string) {
  const rows: AppRecord[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":prefix": `APPREC#${tableId}#`,
        },
        ConsistentRead: true,
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of page.Items ?? []) rows.push(toRecord(item));
    cursor = page.LastEvaluatedKey;
  } while (cursor && rows.length < MAX_RECORDS);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Reads tables once per request; totals and link titles share them. */
function tableCache(siteId: string) {
  const cache = new Map<string, Promise<AppRecord[]>>();
  return (tableId: string) => {
    if (!cache.has(tableId)) cache.set(tableId, listRecords(siteId, tableId));
    return cache.get(tableId)!;
  };
}
async function withTotals(
  app: App,
  table: AppTable,
  records: AppRecord[],
  load: (tableId: string) => Promise<AppRecord[]>,
) {
  const children = new Map<string, AppRecord[]>();
  for (const total of table.totals)
    children.set(total.table, await load(total.table));
  return computeTotals(app, table, records, (t) => children.get(t) ?? []);
}
async function linkTitles(
  app: App,
  tables: AppTable[],
  load: (tableId: string) => Promise<AppRecord[]>,
): Promise<LinkTitles> {
  const targets = new Set(
    tables.flatMap((t) =>
      t.fields.filter((f) => f.type === "link" && f.table).map((f) => f.table!),
    ),
  );
  const links: LinkTitles = {};
  for (const tableId of targets) {
    const target = tableOf(app, tableId);
    if (!target) continue;
    links[tableId] = Object.fromEntries(
      (await load(tableId)).map((r) => [r.id, recordTitle(target, r)]),
    );
  }
  return links;
}

/** A unique value's lock key: phones as digits, text and email ignoring case. */
function uniqueValue(field: AppField, value: AppValue | undefined) {
  if (value === undefined || value === "" || typeof value === "boolean")
    return "";
  const text = String(value).trim();
  return field.type === "phone"
    ? normalizePhone(text)
    : text.toLowerCase().slice(0, 200);
}
const lockKey = (siteId: string, table: string, field: string, value: string) =>
  key(siteId, `APPUNIQ#${table}#${field}`, value);

interface Tagged {
  write: Write;
  /** What failed when this write's condition fails. */
  tag: string;
}
class Cancelled extends Error {
  constructor(public tag: string) {
    super(tag);
  }
}
/**
 * Runs writes as one transaction with the site's lifecycle guard. Conflicts
 * with another transaction are retried; a failed condition is reported by tag.
 */
async function run(siteId: string, writes: Tagged[]) {
  const items = [
    ...writes.map((w) => w.write),
    {
      ConditionCheck: {
        TableName: config.table,
        Key: { pk: partition(siteId), sk: "LIFECYCLE#" },
        ConditionExpression: "attribute_not_exists(#state) OR #state = :active",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":active": "active" },
      },
    },
  ];
  for (let attempt = 0; ; attempt++) {
    try {
      await db.send(new TransactWriteCommand({ TransactItems: items }));
      return;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const reasons = (
        (error as { CancellationReasons?: { Code?: string }[] })
          .CancellationReasons ?? []
      ).map((r) => r.Code ?? "None");
      const failed = reasons.indexOf("ConditionalCheckFailed");
      if (name === "TransactionCanceledException" && failed >= 0) {
        if (failed === writes.length)
          throw new HttpError(404, "This website is unavailable.");
        throw new Cancelled(writes[failed]?.tag ?? "unknown");
      }
      const conflict =
        name === "TransactionConflictException" ||
        (name === "TransactionCanceledException" &&
          reasons.includes("TransactionConflict"));
      // Busy counters (a popular slot, the day's submissions) see many
      // conflicts at once; jittered retries let each writer through in turn.
      if (conflict && attempt < 10) {
        await new Promise((r) =>
          setTimeout(r, 20 + Math.random() * 40 * (attempt + 1)),
        );
        continue;
      }
      if (conflict) throw new Cancelled("conflict");
      throw error;
    }
  }
}
const update = (
  k: { pk: string; sk: string },
  expression: string,
  values: Record<string, unknown>,
  condition?: string,
  names?: Record<string, string>,
): Write => ({
  Update: {
    TableName: config.table,
    Key: k,
    UpdateExpression: expression,
    ExpressionAttributeValues: values,
    ...(condition ? { ConditionExpression: condition } : {}),
    ...(names ? { ExpressionAttributeNames: names } : {}),
  },
});

/**
 * The writes that keep locks and link counters in step when a record's values
 * go from `before` to `after` (an empty `before` for a new record).
 */
function sideWrites(
  siteId: string,
  table: AppTable,
  id: string,
  before: Record<string, AppValue>,
  after: Record<string, AppValue>,
): Tagged[] {
  const writes: Tagged[] = [];
  const deltas = new Map<
    string,
    { table: string; id: string; n: number; field: string }
  >();
  for (const field of table.fields) {
    if (field.unique) {
      const was = uniqueValue(field, before[field.id]);
      const next = uniqueValue(field, after[field.id]);
      if (was !== next) {
        if (next)
          writes.push({
            tag: `unique:${field.id}`,
            write: {
              Put: {
                TableName: config.table,
                Item: {
                  ...lockKey(siteId, table.id, field.id, next),
                  record: id,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          });
        if (was)
          writes.push({
            tag: "lock",
            write: {
              Delete: {
                TableName: config.table,
                Key: lockKey(siteId, table.id, field.id, was),
                ConditionExpression:
                  "attribute_not_exists(pk) OR #record = :id",
                ExpressionAttributeNames: { "#record": "record" },
                ExpressionAttributeValues: { ":id": id },
              },
            },
          });
      }
    }
    if (field.type === "link" && field.table) {
      const was = String(before[field.id] ?? "");
      const next = String(after[field.id] ?? "");
      if (was === next) continue;
      for (const [target, n] of [
        [was, -1],
        [next, 1],
      ] as const) {
        if (!target) continue;
        const k = `${field.table}#${target}`;
        const entry = deltas.get(k) ?? {
          table: field.table,
          id: target,
          n: 0,
          field: field.id,
        };
        entry.n += n;
        if (n > 0) entry.field = field.id;
        deltas.set(k, entry);
      }
    }
  }
  // One counter write per linked record (a transaction can touch an item once).
  // The existence condition is what stops a link to a missing record.
  for (const d of deltas.values())
    if (d.n)
      writes.push({
        tag: `link:${d.field}`,
        write: update(
          recordKey(siteId, d.table, d.id),
          "ADD linked :n",
          { ":n": d.n },
          "attribute_exists(pk)",
        ),
      });
  return writes;
}
async function uniqueOwner(
  siteId: string,
  table: AppTable,
  field: AppField,
  value: AppValue | undefined,
) {
  const k = lockKey(siteId, table.id, field.id, uniqueValue(field, value));
  const lock = await getItem<{ record: string }>(k.pk, k.sk);
  const holder = lock && (await getRecord(siteId, table.id, lock.record));
  return holder ? recordTitle(table, toRecord(holder)) : "";
}
async function claimRef(siteId: string, table: AppTable) {
  if (!table.prefix) return "";
  const result = await db.send(
    new UpdateCommand({
      TableName: config.table,
      Key: key(siteId, "APPREF", table.id),
      UpdateExpression: "ADD #n :one",
      ExpressionAttributeNames: { "#n": "n" },
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  return `${table.prefix}-${1000 + Number(result.Attributes?.n ?? 1)}`;
}
const countWrite = (siteId: string, tableId: string, n: 1 | -1): Tagged => ({
  tag: "count",
  write: update(
    key(siteId, "APPCOUNT", tableId),
    "ADD #count :n",
    n > 0 ? { ":n": 1, ":max": MAX_RECORDS } : { ":n": -1 },
    n > 0 ? "attribute_not_exists(#count) OR #count < :max" : undefined,
    { "#count": "count" },
  ),
});
const refKey = (siteId: string, tableId: string, ref: string) =>
  key(siteId, `APPREFX#${tableId}`, ref.toUpperCase());
/** Indexes a new record's reference so lookups by reference read one item. */
const refPut = (siteId: string, record: AppRecord): Tagged[] =>
  record.ref
    ? [
        {
          tag: "ref",
          write: {
            Put: {
              TableName: config.table,
              Item: {
                ...refKey(siteId, record.table, record.ref),
                record: record.id,
              },
            },
          },
        },
      ]
    : [];

/** Whether a record in `status` holds places; no statuses means every record does. */
const holds = (capacity: AppCapacity, status: string) =>
  !capacity.statuses.length || capacity.statuses.includes(status);
/** The group a record competes in: its group fields' values joined by "|". */
function groupKey(capacity: AppCapacity, values: Record<string, AppValue>) {
  const parts = capacity.group.map((id) =>
    values[id] === undefined ? "" : String(values[id]),
  );
  return parts.some((p) => !p) ? null : parts.join("|");
}
const capacityKey = (
  siteId: string,
  tableId: string,
  capacityId: string,
  group: string,
) =>
  key(
    siteId,
    `APPCAP#${tableId}#${capacityId}`,
    group.length > 300 ? `h:${digest(group)}` : group,
  );
/**
 * Places in one group: the capacity's max, or with `maxField` the chosen
 * item's number (unlimited when the item has none).
 */
function placesIn(
  table: AppTable,
  capacity: AppCapacity,
  slug: string,
  catalog: Catalog,
) {
  if (!capacity.maxField) return capacity.max;
  const field = fieldOf(table, capacity.group[0]);
  const item = catalog(field?.collection ?? "")?.find((i) => i.slug === slug);
  const n = item?.numbers?.[capacity.maxField];
  return n === undefined ? Infinity : Math.max(0, Math.floor(n));
}
interface Holding {
  status: string;
  values: Record<string, AppValue>;
}
/**
 * The counter writes when a record goes from `before` to `after` (missing for
 * a new or deleted record). Taking places is conditional on staying within
 * the group's places, in the same transaction as the record, so two visitors
 * can't take the last seat; giving places back never fails.
 */
function capacityWrites(
  siteId: string,
  table: AppTable,
  catalog: Catalog,
  before: Holding | undefined,
  after: Holding | undefined,
): Tagged[] {
  const writes: Tagged[] = [];
  for (const capacity of table.capacity ?? []) {
    const deltas = new Map<string, { n: number; max: number }>();
    for (const [state, sign] of [
      [before, -1],
      [after, 1],
    ] as const) {
      if (!state || !holds(capacity, state.status)) continue;
      const group = groupKey(capacity, state.values);
      if (group === null) continue;
      const entry = deltas.get(group) ?? { n: 0, max: Infinity };
      entry.n += sign * placesTaken(capacity, state.values);
      if (sign > 0)
        entry.max = placesIn(
          table,
          capacity,
          String(state.values[capacity.group[0]]),
          catalog,
        );
      deltas.set(group, entry);
    }
    const tag = `capacity:${capacity.id}`;
    for (const [group, { n, max }] of deltas) {
      if (!n) continue;
      const k = capacityKey(siteId, table.id, capacity.id, group);
      const names = { "#taken": "taken", "#group": "group" };
      const expression = "ADD #taken :n SET #group = :group";
      if (n < 0 || max === Infinity) {
        writes.push({
          tag,
          write: update(
            k,
            expression,
            { ":n": n, ":group": group },
            undefined,
            names,
          ),
        });
        continue;
      }
      const limit = max - n;
      if (limit < 0) throw new Cancelled(tag);
      writes.push({
        tag,
        write: update(
          k,
          expression,
          { ":n": n, ":group": group, ":limit": limit },
          "attribute_not_exists(#taken) OR #taken <= :limit",
          names,
        ),
      });
    }
  }
  return writes;
}
/** Places taken per group of a capacity. */
async function placesTakenBy(
  siteId: string,
  tableId: string,
  capacityId: string,
) {
  const taken = new Map<string, number>();
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":prefix": `APPCAP#${tableId}#${capacityId}#`,
        },
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of page.Items ?? [])
      if (typeof item.group === "string")
        taken.set(item.group, Number(item.taken ?? 0));
    cursor = page.LastEvaluatedKey;
  } while (cursor && taken.size < 5000);
  return taken;
}
/** Turns a failed condition into a message the owner or visitor understands. */
async function explain(
  error: unknown,
  siteId: string,
  app: App,
  table: AppTable,
  values: Record<string, AppValue>,
  visitor = false,
): Promise<never> {
  if (!(error instanceof Cancelled)) throw error;
  const [kind, fieldId = ""] = error.tag.split(":");
  const field = fieldOf(table, fieldId);
  if (kind === "unique" && field) {
    const holder = visitor
      ? ""
      : await uniqueOwner(siteId, table, field, values[fieldId]);
    throw new FieldError(
      visitor ? 422 : 409,
      holder
        ? `This ${field.name.toLowerCase()} is already used by ${holder}.`
        : `This ${field.name.toLowerCase()} is already in use.`,
      fieldId,
    );
  }
  if (kind === "link")
    throw new FieldError(
      422,
      `The ${(field?.name ?? "linked record").toLowerCase()} no longer exists. Choose another.`,
      fieldId,
    );
  if (kind === "capacity") {
    const capacity = table.capacity?.find((c) => c.id === fieldId);
    throw new FieldError(
      409,
      capacity?.message || "That’s fully booked.",
      capacity?.group[0] ?? "",
    );
  }
  if (kind === "count")
    throw new HttpError(
      409,
      `${table.name} can hold up to ${MAX_RECORDS} records. Delete old ones to add more.`,
    );
  if (kind === "day")
    throw new HttpError(
      429,
      "This website has received too many submissions today. Please try again tomorrow.",
    );
  throw new HttpError(409, "This record changed. Refresh and try again.");
}
function newRecord(
  table: AppTable,
  { values, lines }: Parsed,
  ref: string,
  source: AppRecord["source"],
  by: string,
): AppRecord {
  const at = now();
  const status = table.statuses.length ? table.initial : "";
  return {
    id: randomUUID(),
    table: table.id,
    ref,
    values,
    ...(Object.keys(lines).length ? { lines } : {}),
    status,
    note: "",
    history: [{ action: "Added", status, by, at }],
    source,
    createdAt: at,
    updatedAt: at,
    revision: 1,
  };
}
const recordPut = (
  siteId: string,
  record: AppRecord,
  payKey?: string,
): Tagged => ({
  tag: "record",
  write: {
    Put: {
      TableName: config.table,
      Item: {
        ...recordKey(siteId, record.table, record.id),
        ...record,
        ...(payKey ? { payKey } : {}),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    },
  },
});
/** Writes a changed record (values, status, note, history) if nobody changed it first. */
function recordUpdate(
  siteId: string,
  current: AppRecord,
  next: AppRecord,
  fromStatus?: string,
): Tagged {
  return {
    tag: "record",
    write: update(
      recordKey(siteId, current.table, current.id),
      `SET #values = :values, #status = :status, note = :note, history = :history, updatedAt = :at, revision = :next${next.lines ? ", #lines = :lines" : ""}${next.payment ? ", payment = :payment" : ""}${next.lines ? "" : " REMOVE #lines"}`,
      {
        ":values": next.values,
        ...(next.lines ? { ":lines": next.lines } : {}),
        ...(next.payment ? { ":payment": next.payment } : {}),
        ":status": next.status,
        ":note": next.note,
        ":history": next.history.slice(-MAX_HISTORY),
        ":at": next.updatedAt,
        ":next": next.revision,
        ":revision": current.revision,
        ...(fromStatus !== undefined ? { ":from": fromStatus } : {}),
      },
      `revision = :revision${fromStatus !== undefined ? " AND #status = :from" : ""}`,
      { "#values": "values", "#status": "status", "#lines": "lines" },
    ),
  };
}

// ---------------------------------------------------------------- owner

function objectInput(value: unknown, name: string) {
  insist(
    value === undefined ||
      (value && typeof value === "object" && !Array.isArray(value)),
    422,
    `Expected ${name} as an object.`,
  );
  return (value ?? {}) as Record<string, unknown>;
}
interface Parsed {
  values: Record<string, AppValue>;
  lines: Record<string, AppLine[]>;
}
function parsed(result: ReturnType<typeof parseValues>): Parsed {
  if (!result.ok) throw new FieldError(422, result.error, result.field);
  return { values: result.values, lines: result.lines };
}
/** A record's lines after `changes` to `fields`; lines of emptied fields go. */
function mergeLines(
  table: AppTable,
  current: AppRecord,
  fields: string[],
  changes: Parsed,
) {
  const lines = { ...current.lines, ...changes.lines };
  for (const id of fields) {
    const f = fieldOf(table, id);
    if (
      (f?.type === "item" || f?.type === "items") &&
      changes.values[id] === undefined
    )
      delete lines[id];
  }
  return Object.keys(lines).length ? lines : undefined;
}
async function findRecord(siteId: string, app: App, id: string) {
  insist(idPattern.test(id), 404, "Record not found.");
  const found = await Promise.all(
    app.tables.map((t) => getRecord(siteId, t.id, id)),
  );
  const index = found.findIndex(Boolean);
  insist(index >= 0, 404, "Record not found.");
  return { table: app.tables[index], stored: found[index]! };
}
/** Values of link fields must point at existing records, which the counter write checks. */
function noSelfLinks(
  table: AppTable,
  id: string,
  values: Record<string, AppValue>,
) {
  for (const f of table.fields)
    if (f.type === "link" && values[f.id] === id)
      throw new FieldError(422, "A record can't link to itself.", f.id);
  for (const f of table.fields)
    if (f.type === "link" && values[f.id] !== undefined && values[f.id] !== "")
      insist(
        idPattern.test(String(values[f.id])),
        422,
        `Choose a ${f.name.toLowerCase()} from the list.`,
      );
}
async function createRecord(
  siteId: string,
  app: App,
  catalog: Catalog,
  input: Record<string, unknown>,
  by: string,
) {
  const table = tableOf(app, String(input.table ?? ""));
  insist(table, 404, "Table not found.");
  const result = parsed(
    parseValues(
      table,
      table.fields.map((f) => f.id),
      objectInput(input.values, "values"),
      { catalog },
    ),
  );
  const { values } = result;
  noSelfLinks(table, "", values);
  const ref = await claimRef(siteId, table);
  const record = newRecord(table, result, ref, "owner", by);
  try {
    await run(siteId, [
      recordPut(siteId, record),
      countWrite(siteId, table.id, 1),
      ...refPut(siteId, record),
      ...sideWrites(siteId, table, record.id, {}, values),
      ...capacityWrites(siteId, table, catalog, undefined, record),
    ]);
  } catch (error) {
    await explain(error, siteId, app, table, values);
  }
  return record;
}
async function editRecord(
  siteId: string,
  app: App,
  catalog: Catalog,
  id: string,
  input: Record<string, unknown>,
) {
  const { table, stored } = await findRecord(siteId, app, id);
  const current = toRecord(stored);
  insist(
    Number.isInteger(input.revision),
    422,
    "Refresh the record and try again.",
  );
  if (input.revision !== current.revision)
    throw new HttpError(409, "This record changed. Refresh and try again.");
  const raw = objectInput(input.values, "values");
  const changes = parsed(
    parseValues(
      table,
      table.fields.map((f) => f.id),
      raw,
      { partial: true, catalog },
    ),
  );
  const values = { ...current.values, ...changes.values };
  // An emptied optional field is removed rather than kept from before.
  const sent = table.fields.filter((f) => raw[f.id] !== undefined);
  for (const f of sent)
    if (changes.values[f.id] === undefined) delete values[f.id];
  noSelfLinks(table, id, values);
  const next: AppRecord = {
    ...current,
    values,
    lines: mergeLines(
      table,
      current,
      sent.map((f) => f.id),
      changes,
    ),
    updatedAt: now(),
    revision: current.revision + 1,
  };
  if (!next.lines) delete next.lines;
  try {
    await run(siteId, [
      recordUpdate(siteId, current, next),
      ...sideWrites(siteId, table, id, current.values, values),
      ...capacityWrites(siteId, table, catalog, current, next),
    ]);
  } catch (error) {
    await explain(error, siteId, app, table, values);
  }
  return next;
}
async function deleteRecord(siteId: string, app: App, id: string) {
  const { table, stored } = await findRecord(siteId, app, id);
  const current = toRecord(stored);
  const linked = Number(stored.linked ?? 0);
  const refused = () =>
    new HttpError(
      409,
      `This ${table.singular.toLowerCase()} has ${linked > 1 ? `${linked} linked records` : "a linked record"}, so it can't be deleted — their history would be lost. Mark them inactive instead.`,
    );
  if (linked > 0) throw refused();
  try {
    await run(siteId, [
      {
        tag: "record",
        write: {
          Delete: {
            TableName: config.table,
            Key: recordKey(siteId, table.id, id),
            ConditionExpression:
              "revision = :revision AND (attribute_not_exists(linked) OR linked <= :zero)",
            ExpressionAttributeValues: {
              ":revision": current.revision,
              ":zero": 0,
            },
          },
        },
      },
      countWrite(siteId, table.id, -1),
      ...(current.ref
        ? [
            {
              tag: "ref",
              write: {
                Delete: {
                  TableName: config.table,
                  Key: refKey(siteId, table.id, current.ref),
                },
              },
            },
          ]
        : []),
      ...sideWrites(siteId, table, id, current.values, {}),
      // Giving places back needs no catalog.
      ...capacityWrites(siteId, table, () => undefined, current, undefined),
    ]);
  } catch (error) {
    if (error instanceof Cancelled && error.tag === "record") {
      const again = await getRecord(siteId, table.id, id);
      if (again && Number(again.linked ?? 0) > 0)
        throw new HttpError(
          409,
          `This ${table.singular.toLowerCase()} now has linked records, so it can't be deleted. Mark them inactive instead.`,
        );
    }
    await explain(error, siteId, app, table, current.values);
  }
  return { deleted: true as const };
}
async function takeAction(
  siteId: string,
  app: App,
  catalog: Catalog,
  id: string,
  actionId: string,
  input: Record<string, unknown>,
  by: string,
  siteName: string,
) {
  const { table, stored } = await findRecord(siteId, app, id);
  const current = toRecord(stored);
  const action = table.actions.find((a) => a.id === actionId);
  insist(action, 404, "This action no longer exists.");
  insist(
    Number.isInteger(input.revision),
    422,
    "Refresh the record and try again.",
  );
  const already = () =>
    new HttpError(
      409,
      `This ${table.singular.toLowerCase()} is already ${(statusOf(table, current.status)?.name ?? "changed").toLowerCase()}. Refresh to see the latest.`,
    );
  if (!action.from.includes(current.status)) throw already();
  if (input.revision !== current.revision)
    throw new HttpError(409, "This record changed. Refresh and try again.");
  const changes = parsed(
    parseValues(table, action.set, objectInput(input.values, "values"), {
      catalog,
    }),
  );
  for (const fieldId of action.set) {
    const field = fieldOf(table, fieldId);
    if (field && changes.values[fieldId] === undefined)
      throw new FieldError(422, `Add ${field.name.toLowerCase()}.`, fieldId);
  }
  const values = { ...current.values, ...changes.values };
  const limit = checkLimits(table, action, values);
  if (limit)
    throw new FieldError(
      422,
      limit,
      action.limits.find(
        (l) => Number(values[l.field] ?? 0) > Number(values[l.atMost] ?? 0),
      )?.field ?? "",
    );
  insist(
    input.note === undefined || typeof input.note === "string",
    422,
    "The note must be text.",
  );
  const note = action.note === "none" ? "" : String(input.note ?? "").trim();
  if (action.note === "required" && !note)
    throw new FieldError(422, "Add a note explaining why.", "note");
  if (note.length > 1000)
    throw new FieldError(422, "Keep the note under 1,000 characters.", "note");
  const at = now();
  const next: AppRecord = {
    ...current,
    values,
    lines: mergeLines(table, current, action.set, changes),
    status: action.to,
    note,
    history: [
      ...current.history,
      {
        action: action.name,
        status: action.to,
        by,
        at,
        ...(note ? { note } : {}),
      },
    ],
    updatedAt: at,
    revision: current.revision + 1,
  };
  if (!next.lines) delete next.lines;
  try {
    await run(siteId, [
      recordUpdate(siteId, current, next, current.status),
      ...sideWrites(siteId, table, id, current.values, values),
      ...capacityWrites(siteId, table, catalog, current, next),
    ]);
  } catch (error) {
    if (error instanceof Cancelled && error.tag === "record") {
      // Someone else acted first; say what happened rather than "changed".
      const latest = await getRecord(siteId, table.id, id);
      if (latest && !action.from.includes(latest.status)) {
        current.status = latest.status;
        throw already();
      }
    }
    await explain(error, siteId, app, table, values);
  }
  if (action.tellVisitor)
    await tellVisitor(siteId, siteName, table, next).catch(() =>
      console.warn("app_tell_visitor_failed", { siteId }),
    );
  return next;
}
/** Emails the record's first email field that it moved on, with the note. */
async function tellVisitor(
  siteId: string,
  siteName: string,
  table: AppTable,
  record: AppRecord,
) {
  const field = table.fields.find(
    (f) => f.type === "email" && record.values[f.id],
  );
  const to = field ? String(record.values[field.id]) : "";
  if (!to) return;
  const status = statusOf(table, record.status)?.name ?? record.status;
  const noun = table.singular.toLowerCase();
  const subject =
    `Your ${noun}${record.ref ? ` ${record.ref}` : ""} is now ${status}`.slice(
      0,
      160,
    );
  const body = [
    `${subject}.`,
    record.note ? `Note: ${record.note}` : "",
    `— ${siteName}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  await run(siteId, [
    {
      tag: "mail",
      write: message(
        siteId,
        to,
        `${subject} · ${siteName}`.slice(0, 200),
        body,
      ),
    },
  ]);
}
/** The owner marks a payment received (cash, UPI they checked, and so on). */
async function markPaid(
  siteId: string,
  app: App,
  id: string,
  input: Record<string, unknown>,
) {
  const { table, stored } = await findRecord(siteId, app, id);
  const current = toRecord(stored);
  insist(current.payment, 409, "This record has no payment to mark.");
  insist(
    Number.isInteger(input.revision),
    422,
    "Refresh the record and try again.",
  );
  if (input.revision !== current.revision)
    throw new HttpError(409, "This record changed. Refresh and try again.");
  if (current.payment.status === "paid") return current;
  const next: AppRecord = {
    ...current,
    payment: {
      ...current.payment,
      status: "paid",
      confirmedBy: "owner",
      paidAt: now(),
    },
    updatedAt: now(),
    revision: current.revision + 1,
  };
  try {
    await run(siteId, [recordUpdate(siteId, current, next)]);
  } catch (error) {
    await explain(error, siteId, app, table, current.values);
  }
  return next;
}
function compare(sort: string, table: AppTable) {
  return (a: AppRecord, b: AppRecord) => {
    if (!sort) return b.createdAt.localeCompare(a.createdAt);
    const value = (r: AppRecord) =>
      table.totals.some((t) => t.id === sort)
        ? (r.totals?.[sort] ?? 0)
        : r.values[sort];
    const x = value(a),
      y = value(b);
    if (typeof x === "number" || typeof y === "number")
      return Number(y ?? 0) - Number(x ?? 0);
    return String(y ?? "").localeCompare(String(x ?? ""));
  };
}
async function summary(siteId: string, app: App): Promise<Summary> {
  const load = tableCache(siteId);
  const cards = await Promise.all(
    app.dashboard.cards.map(async (card) => ({
      id: card.id,
      name: card.name,
      value: tableOf(app, card.table)
        ? cardValue(card, await load(card.table))
        : 0,
      money: !!card.money,
    })),
  );
  const lists: Summary["lists"] = [];
  const shown: AppTable[] = [];
  for (const list of app.dashboard.lists) {
    const table = tableOf(app, list.table);
    if (!table) continue;
    shown.push(table);
    const records = structuredClone(await load(table.id)).filter(
      (r) => !list.statuses.length || list.statuses.includes(r.status),
    );
    await withTotals(app, table, records, load);
    lists.push({
      id: list.id,
      name: list.name,
      table: table.id,
      records: records.sort(compare(list.sort, table)).slice(0, list.limit),
    });
  }
  return { cards, lists, links: await linkTitles(app, shown, load) };
}

// ---------------------------------------------------------------- devices

interface StoredDevice extends PushDevice {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}
const listDevices = async (siteId: string) =>
  (
    await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":prefix": "APPDEVICE#",
        },
        ConsistentRead: true,
        Limit: MAX_DEVICES + 5,
      }),
    )
  ).Items?.map((item) => toRecord(item) as unknown as StoredDevice) ?? [];
const showDevice = (d: StoredDevice): PushDevice => ({
  id: d.id,
  label: d.label,
  createdAt: d.createdAt,
});
async function addDevice(siteId: string, input: Record<string, unknown>) {
  insist(
    validSubscription(input.subscription),
    422,
    "This browser’s notification subscription isn’t supported.",
  );
  const label = typeof input.label === "string" ? input.label.trim() : "";
  insist(label.length <= 60, 422, "Use a device name of up to 60 characters.");
  const { endpoint, keys } = input.subscription;
  // The same browser subscribing again replaces its earlier entry.
  const id = digest(endpoint).slice(0, 32);
  const devices = await listDevices(siteId);
  insist(
    devices.length < MAX_DEVICES || devices.some((d) => d.id === id),
    409,
    `Up to ${MAX_DEVICES} devices can get notifications. Remove one first.`,
  );
  const device: StoredDevice = {
    id,
    label: label || "This device",
    createdAt: now(),
    subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  };
  await putItem({ ...key(siteId, "APPDEVICE", id), ...device });
  return showDevice(device);
}
/** Sends to every device; browsers that unsubscribed are forgotten. */
async function notifyDevices(
  siteId: string,
  title: string,
  body: string,
  url: string,
) {
  const devices = await listDevices(siteId);
  const outcomes = await Promise.all(
    devices.map(async (d) => {
      const outcome = await sendPush(d.subscription, { title, body, url });
      if (outcome === "gone") {
        const k = key(siteId, "APPDEVICE", d.id);
        await deleteItem(k.pk, k.sk).catch(() => {});
      }
      return outcome;
    }),
  );
  return outcomes.filter((o) => o === "sent").length;
}
/** The site's branded owner app, opened at a record when there is one. */
const appPage = (siteId: string, tableId?: string, recordId?: string) =>
  `${config.editorOrigin}/owner?site=${siteId}${tableId ? `&table=${encodeURIComponent(tableId)}` : ""}${recordId ? `&record=${encodeURIComponent(recordId)}` : ""}`;

// ---------------------------------------------------------------- owner API

const json = (
  value: unknown,
  status = 200,
  cors = false,
  cache = "no-store",
): ApiResponse => ({
  status,
  headers: {
    "content-type": "application/json",
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    ...(cors ? { "access-control-allow-origin": "*" } : {}),
  },
  body: Buffer.from(JSON.stringify(value)),
});
const failure = (error: unknown, cors = false) => {
  if (!(error instanceof HttpError)) throw error;
  return json(
    {
      error: error.message,
      message: error.message,
      ...(error instanceof FieldError ? { field: error.field } : {}),
    },
    error.status,
    cors,
  );
};
/**
 * /sites/:id/app… — access was already checked by the caller (edit or more).
 * `rest` is the path after /app.
 */
export async function appOwnerApi(
  request: ApiRequest,
  site: Site,
  rest: string,
  input: () => Record<string, unknown>,
): Promise<ApiResponse> {
  try {
    const { method } = request;
    const siteId = site.id;
    const by = request.email || "Owner";
    if (rest === "" && method === "GET") {
      const live = await liveApp(siteId);
      return json({
        app: (await draft(site)).app,
        published: !!live,
      } satisfies AppInfo);
    }
    if (rest === "/devices" && method === "GET")
      return json({ devices: (await listDevices(siteId)).map(showDevice) });
    if (rest === "/devices" && method === "POST")
      return json({ device: await addDevice(siteId, input()) }, 201);
    if (rest === "/devices/test" && method === "POST")
      return json({
        sent: await notifyDevices(
          siteId,
          "Notifications are on",
          `You’ll hear here when visitors send something to ${site.name}.`,
          appPage(siteId),
        ),
      });
    const device = /^\/devices\/([a-f0-9]{32})\/delete$/.exec(rest);
    if (device && method === "POST") {
      const k = key(siteId, "APPDEVICE", device[1]);
      await deleteItem(k.pk, k.sk);
      return json({ deleted: true });
    }
    const { app, catalog } = await draft(site);
    insist(app, 404, "This site has no app yet.");
    if (rest === "/summary" && method === "GET")
      return json(await summary(siteId, app));
    if (rest === "/records" && method === "GET") {
      const table = tableOf(
        app,
        new URLSearchParams(request.query ?? "").get("table") ?? "",
      );
      insist(table, 404, "Table not found.");
      const load = tableCache(siteId);
      const records = structuredClone(await load(table.id));
      await withTotals(app, table, records, load);
      return json({
        records,
        links: await linkTitles(app, [table], load),
      } satisfies RecordList);
    }
    if (rest === "/records" && method === "POST")
      return json(
        { record: await createRecord(siteId, app, catalog, input(), by) },
        201,
      );
    const record =
      /^\/records\/([^/]+)(?:\/(delete|paid)|\/actions\/([^/]+))?$/.exec(rest);
    if (record) {
      const [, id, verb, actionId] = record;
      if (verb === "delete" && method === "POST")
        return json(await deleteRecord(siteId, app, id));
      if (verb === "paid" && method === "POST")
        return json({ record: await markPaid(siteId, app, id, input()) });
      if (actionId && method === "POST")
        return json({
          record: await takeAction(
            siteId,
            app,
            catalog,
            id,
            actionId,
            input(),
            by,
            site.name,
          ),
        });
      if (!verb && !actionId && method === "PUT")
        return json({
          record: await editRecord(siteId, app, catalog, id, input()),
        });
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------- public API

function publicInput(request: ApiRequest) {
  insist(request.body.length <= 16 * 1024, 413, "That request is too large.");
  try {
    const value: unknown = JSON.parse(request.body.toString() || "{}");
    insist(
      value && typeof value === "object" && !Array.isArray(value),
      400,
      "Expected a JSON object.",
    );
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}
const notLive = () =>
  new HttpError(404, "This form isn’t available right now.");
async function liveForm(siteId: string, formId: string) {
  insist(idPattern.test(siteId), 404, "This form isn’t available right now.");
  const live = await liveApp(siteId);
  const form = live?.app.forms.find((f) => f.id === formId);
  if (!live || !form) throw notLive();
  const table = tableOf(live.app, form.table);
  if (!table) throw notLive();
  return { live, form, table };
}
type Live = NonNullable<Awaited<ReturnType<typeof liveApp>>>;
/** Requests per IP per minute under `kind`, e.g. lookups, so a form can't enumerate a phone list. */
async function limitPerMinute(
  siteId: string,
  ip: string,
  kind: string,
  max: number,
  refusal: string,
) {
  const minute = Math.floor(Date.now() / 60000);
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: key(siteId, kind, `${digest(ip).slice(0, 24)}#${minute}`),
        UpdateExpression: "ADD #count :one SET expires = :expires",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :max",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":max": max,
          ":expires": epoch() + 180,
        },
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    )
      throw new HttpError(429, refusal);
    throw error;
  }
}
const limitLookups = (siteId: string, ip: string) =>
  limitPerMinute(
    siteId,
    ip,
    "APPLOOKUP",
    LOOKUPS_PER_MINUTE,
    "Too many lookups. Wait a minute and try again.",
  );
const unknownValue = (field: AppField) =>
  field.type === "phone"
    ? "This number isn’t registered. Ask the shop to register you."
    : `We couldn’t find that ${field.name.toLowerCase()}. Check it and try again.`;
const askFor = (field: AppField, inputName: string) =>
  new FieldError(
    422,
    field.type === "phone"
      ? "Enter your phone number."
      : `Enter your ${field.name.toLowerCase()}.`,
    inputName,
  );
/** Whether what a visitor typed is a stored value: phones by digits, the rest ignoring case. */
function sameValue(
  field: AppField,
  stored: AppValue | undefined,
  typed: string,
) {
  const a = uniqueValue(field, stored);
  return !!a && a === uniqueValue(field, typed);
}
const isPaused = (table: AppTable, record: AppRecord) =>
  !!table.pausedField && record.values[table.pausedField] === true;
const pausedError = (inputName: string) =>
  new FieldError(403, "This account is paused. Please contact us.", inputName);
/**
 * The record of `table` whose unique `field` holds what the visitor typed.
 * `matches` (a lookup's second value) is checked before anything else is
 * said about the record, so a wrong one reads exactly like an unknown value.
 */
async function recordByValue(
  siteId: string,
  table: AppTable,
  field: AppField,
  typed: unknown,
  inputName: string,
  matches: (record: AppRecord) => boolean = () => true,
) {
  const text = typeof typed === "string" ? typed.trim() : "";
  if (!text) throw askFor(field, inputName);
  insist(text.length <= 200, 422, "That value is too long.");
  const value = uniqueValue(field, text);
  const k = lockKey(siteId, table.id, field.id, value);
  const lock = value
    ? await getItem<{ record: string }>(k.pk, k.sk)
    : undefined;
  const stored = lock && (await getRecord(siteId, table.id, lock.record));
  const record = stored && toRecord(stored);
  if (!record || !matches(record))
    throw new FieldError(404, unknownValue(field), inputName);
  // A paused customer or member keeps their history but can't use the forms.
  if (isPaused(table, record)) throw pausedError(inputName);
  return record;
}
async function titlesFor(
  siteId: string,
  app: App,
  pairs: { field: AppField; value: AppValue | undefined }[],
) {
  const titles = new Map<string, string>();
  await Promise.all(
    pairs
      .filter(
        ({ field, value }) => field.type === "link" && field.table && value,
      )
      .slice(0, 100)
      .map(async ({ field, value }) => {
        const k = `${field.table}#${value}`;
        if (titles.has(k)) return;
        titles.set(k, "");
        const target = tableOf(app, field.table!);
        const stored = await getRecord(siteId, field.table!, String(value));
        if (target && stored)
          titles.set(k, recordTitle(target, toRecord(stored)));
      }),
  );
  return (tableId: string, id: string) => titles.get(`${tableId}#${id}`) ?? "";
}
const fieldsOf = (table: AppTable, ids: string[]) =>
  ids.map((id) => fieldOf(table, id)).filter((f): f is AppField => !!f);
/** Values ready to show a visitor: formatted, and phones and emails masked. */
async function shownValues(
  siteId: string,
  app: App,
  table: AppTable,
  fieldIds: string[],
  records: AppRecord[],
): Promise<ShownValue[][]> {
  const fields = fieldsOf(table, fieldIds);
  const title = await titlesFor(
    siteId,
    app,
    records.flatMap((r) =>
      fields.map((f) => ({ field: f, value: r.values[f.id] })),
    ),
  );
  return records.map((r) =>
    fields.map((f) => ({
      name: f.name,
      value:
        f.type === "phone" || f.type === "email"
          ? maskValue(f, r.values[f.id])
          : formatAppValue(app, f, r.values[f.id], title, r.lines?.[f.id]),
    })),
  );
}
type RecordResult = Extract<FindResult, { kind: "record" }>;
async function historyOf(
  siteId: string,
  app: App,
  table: AppTable,
  fieldIds: string[],
  rows: AppRecord[],
): Promise<RecordResult["history"]> {
  const values = await shownValues(siteId, app, table, fieldIds, rows);
  const fields = fieldsOf(table, fieldIds);
  return rows.map((r, i) => {
    const status = statusOf(table, r.status);
    const last = r.history.length > 1 ? r.history[r.history.length - 1] : null;
    return {
      ref: r.ref,
      status: status ? { name: status.name, tone: status.tone } : null,
      note: r.note,
      createdAt: r.createdAt,
      ...(last ? { at: last.at } : {}),
      fields: values[i].map((v, n) => ({
        ...v,
        type: fields[n].type,
        ...(fields[n].ownerOnly ? { owner: true } : {}),
      })),
    };
  });
}
/** "Ravi Kumar" → "RK" */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
/** Money for a small tile: ₹2.4L or ₹1.2Cr in rupees, 120K elsewhere. */
function shortMoney(n: number, currency: string) {
  if (currency === "INR") {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    return formatMoney(n, currency);
  }
  if (Math.abs(n) < 1e5) return formatMoney(n, currency);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return formatMoney(n, currency);
  }
}
/** A total of a record with its raw figure, tone and the figure in words. */
function totalValue(app: App, total: AppTotal, n: number): TotalValue {
  const child = tableOf(app, total.table);
  const statuses = child
    ? total.statuses.map((id) => statusOf(child, id)).filter((x) => !!x)
    : [];
  const tones = [...new Set(statuses.map((x) => x.tone))];
  const money = !!total.money;
  const value = money
    ? formatMoney(n, app.currency)
    : n.toLocaleString("en-IN");
  const noun = child && (n === 1 ? child.singular : child.name).toLowerCase();
  const phrase =
    total.op === "count" && noun && statuses.length <= 1
      ? [value, statuses[0]?.name.toLowerCase(), noun].filter(Boolean).join(" ")
      : `${value} ${total.name.toLowerCase()}`;
  return {
    id: total.id,
    name: total.name,
    value,
    amount: n,
    money,
    ...(tones.length === 1 ? { tone: tones[0] } : {}),
    ...(money ? { short: shortMoney(n, app.currency) } : {}),
    phrase,
  };
}
const totalsOf = (
  app: App,
  table: AppTable,
  record: AppRecord,
  ids: string[],
) =>
  ids
    .map((id) => table.totals.find((t) => t.id === id))
    .filter((t) => !!t)
    .map((t) => totalValue(app, t, record.totals?.[t.id] ?? 0));
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
/** One found record: its fields, totals and linked history; with `own`, its reference, status, lines and steps. */
async function recordResult(
  siteId: string,
  app: App,
  form: AppForm,
  table: AppTable,
  record: AppRecord,
  own: boolean,
): Promise<RecordResult> {
  const load = tableCache(siteId);
  await withTotals(app, table, [record], load);
  const [fields] = await shownValues(siteId, app, table, form.fields, [record]);
  const totals = totalsOf(
    app,
    table,
    record,
    form.totals.filter((id) => id !== form.highlight),
  );
  let history: RecordResult["history"] = [];
  const h = form.history;
  const child = h && tableOf(app, h.table);
  if (h && child) {
    const rows = (await load(child.id))
      .filter((r) => r.values[h.via] === record.id)
      .slice(0, HISTORY_SHOWN);
    history = await historyOf(siteId, app, child, h.fields, rows);
  }
  if (!own) {
    const title = recordTitle(table, record);
    const keyField = fieldOf(table, form.key ?? "");
    const lit = form.highlight
      ? table.totals.find((t) => t.id === form.highlight)
      : undefined;
    // "Across 18 approved submissions": a count of the same statuses,
    // preferring one that isn't already a tile.
    const counts = lit
      ? table.totals.filter(
          (t) =>
            t.id !== lit.id &&
            t.op === "count" &&
            t.table === lit.table &&
            t.via === lit.via &&
            sameSet(t.statuses, lit.statuses),
        )
      : [];
    const across = counts.find((t) => !form.totals.includes(t.id)) ?? counts[0];
    return {
      kind: "record",
      fields,
      totals,
      title,
      initials: initialsOf(title),
      ...(keyField
        ? {
            key:
              keyField.type === "phone" || keyField.type === "email"
                ? maskValue(keyField, record.values[keyField.id])
                : String(record.values[keyField.id] ?? ""),
          }
        : {}),
      ...(form.since ? { since: record.createdAt } : {}),
      ...(lit
        ? {
            highlight: {
              ...totalValue(app, lit, record.totals?.[lit.id] ?? 0),
              ...(across
                ? {
                    across: totalValue(
                      app,
                      across,
                      record.totals?.[across.id] ?? 0,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      history,
    };
  }
  const status = statusOf(table, record.status);
  return {
    kind: "record",
    fields,
    totals,
    ref: record.ref,
    status: status ? { name: status.name, tone: status.tone } : null,
    note: record.note,
    lines: Object.values(record.lines ?? {})
      .flat()
      .map((l) => ({
        title: l.title,
        quantity: l.quantity,
        price: formatMoney(
          Math.round(l.price * 100 * l.quantity) / 100,
          app.currency,
        ),
      })),
    // Status names, dates and the notes visitors are meant to see; never who acted.
    steps: record.history.map((step) => ({
      name: statusOf(table, step.status)?.name ?? step.action,
      at: step.at,
      ...(step.note ? { note: step.note } : {}),
    })),
    history,
  };
}
/** Records a non-unique key lists per lookup (e.g. "My bookings" by phone). */
const LISTED = 20;
async function find(
  siteId: string,
  formId: string,
  value: unknown,
  verify: unknown,
  ip: string,
): Promise<FindResult> {
  const { live, form, table } = await liveForm(siteId, formId);
  const app = live.app;
  if (form.kind === "submit") {
    const identify = form.identify;
    const parent = identify && tableOf(app, identify.table);
    const field = parent && fieldOf(parent, identify.field);
    insist(parent && field, 404, "This form doesn’t look anything up.");
    await limitLookups(siteId, ip);
    const match = await recordByValue(siteId, parent, field, value, "value");
    const [fields] = await shownValues(siteId, app, parent, identify.confirm, [
      match,
    ]);
    const title = recordTitle(parent, match);
    const shown = form.confirmTotals ?? [];
    if (shown.length)
      await withTotals(app, parent, [match], tableCache(siteId));
    return {
      kind: "match",
      fields,
      title,
      initials: initialsOf(title),
      ...(shown.length ? { totals: totalsOf(app, parent, match, shown) } : {}),
    };
  }
  const check = form.verify ? fieldOf(table, form.verify) : undefined;
  if (form.verify && !check) throw notLive();
  const typed = typeof value === "string" ? value.trim() : "";
  const second = typeof verify === "string" ? verify.trim() : "";
  insist(
    typed.length <= 200 && second.length <= 200,
    422,
    "That value is too long.",
  );
  const matches = (record: AppRecord) =>
    !check || sameValue(check, record.values[check.id], second);
  if (form.key === REF_KEY) {
    if (!typed)
      throw new FieldError(422, "Enter your reference number.", "value");
    if (check && !second) throw askFor(check, "verify");
    await limitLookups(siteId, ip);
    const lock = await getItem<{ record: string }>(
      refKey(siteId, table.id, typed).pk,
      refKey(siteId, table.id, typed).sk,
    );
    const stored = lock && (await getRecord(siteId, table.id, lock.record));
    const record = stored && toRecord(stored);
    if (!record || !matches(record))
      throw new FieldError(
        404,
        "We couldn’t find that reference. Check it and try again.",
        "value",
      );
    if (isPaused(table, record)) throw pausedError("value");
    return recordResult(siteId, app, form, table, record, true);
  }
  const field = fieldOf(table, form.key ?? "");
  insist(field, 404, "This form isn’t available right now.");
  if (!typed) throw askFor(field, "value");
  if (check && !second) throw askFor(check, "verify");
  await limitLookups(siteId, ip);
  if (field.unique) {
    const record = await recordByValue(
      siteId,
      table,
      field,
      typed,
      "value",
      matches,
    );
    return recordResult(siteId, app, form, table, record, false);
  }
  // Not unique: the visitor's own records, newest first.
  const rows = (await listRecords(siteId, table.id))
    .filter(
      (r) =>
        sameValue(field, r.values[field.id], typed) &&
        matches(r) &&
        !isPaused(table, r),
    )
    .slice(0, LISTED);
  if (!rows.length)
    throw new FieldError(
      404,
      `We couldn’t find any ${table.name.toLowerCase()} for that ${field.name.toLowerCase()}.`,
      "value",
    );
  return {
    kind: "record",
    fields: [],
    totals: [],
    history: await historyOf(siteId, app, table, form.fields, rows),
  };
}
/** Places left per capacity of the form's table. */
async function availability(
  siteId: string,
  formId: string,
  ip: string,
): Promise<Availability> {
  const { live, table } = await liveForm(siteId, formId);
  await limitPerMinute(
    siteId,
    ip,
    "APPAVAIL",
    120,
    "Too many requests. Wait a minute and try again.",
  );
  const catalog = catalogOf(live.catalogs);
  const capacities = await Promise.all(
    (table.capacity ?? []).map(async (capacity) => {
      const taken = await placesTakenBy(siteId, table.id, capacity.id);
      const left = new Map<string, number>();
      const add = (group: string, n: number) => {
        const max = placesIn(table, capacity, group.split("|")[0], catalog);
        if (max !== Infinity) left.set(group, Math.max(0, max - n));
      };
      if (capacity.maxField && capacity.group.length === 1) {
        const field = fieldOf(table, capacity.group[0]);
        for (const item of catalog(field?.collection ?? "") ?? [])
          add(item.slug, taken.get(item.slug) ?? 0);
      }
      for (const [group, n] of taken) if (!left.has(group)) add(group, n);
      return {
        id: capacity.id,
        group: capacity.group,
        max: capacity.max,
        left: Object.fromEntries(left),
      };
    }),
  );
  return { capacities };
}

// ---------------------------------------------------------------- payments

const toMinor = (amount: number) => Math.round(amount * 100);
const payGone = () => new HttpError(404, "This payment doesn’t exist.");
const keyPattern = /^[A-Za-z0-9_-]{8,64}$/;
/** Asks for payment when the form wants it, the amount is positive and the site can be paid. */
async function askPayment(
  siteId: string,
  live: Live,
  form: AppForm,
  record: AppRecord,
): Promise<AppPayment | undefined> {
  if (!form.payment) return undefined;
  const amount = Number(record.values[form.payment.field] ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const currency = live.app.currency;
  const online = !!currencyCode(currency) && !!(await getConnection(siteId));
  if (!live.payments && !online) return undefined;
  return {
    amount,
    currency,
    status: "unpaid",
    reference: record.ref || record.id.slice(0, 8).toUpperCase(),
  };
}
/** How the visitor can pay, from the live settings. `key` is their submit key. */
async function paymentView(
  siteId: string,
  live: Live,
  recordId: string,
  payment: AppPayment,
  attempt: string,
): Promise<NonNullable<SubmitResult["payment"]>> {
  const p = live.payments;
  const unpaid = payment.status === "unpaid";
  const instructions = [
    p?.bank && `Bank transfer:\n${p.bank}`,
    p?.link && !p.online && `Pay online: ${p.link}`,
    p?.inPerson,
    p?.note,
  ]
    .filter(Boolean)
    .join("\n\n");
  const online =
    unpaid &&
    !!currencyCode(payment.currency) &&
    !!(await getConnection(siteId));
  return {
    amount: formatMoney(payment.amount, payment.currency),
    status: payment.status,
    reference: payment.reference,
    ...(unpaid && p?.upi
      ? {
          upi: upiLink(
            p,
            toMinor(payment.amount),
            payment.currency,
            payment.reference,
          ),
        }
      : {}),
    ...(unpaid && instructions ? { instructions } : {}),
    ...(online
      ? {
          checkout: `${config.apiOrigin}/apps/${siteId}/records/${recordId}/checkout?key=${encodeURIComponent(attempt)}`,
        }
      : {}),
    recordId,
  };
}
/** The record a payment key unlocks; anything else reads as "doesn't exist". */
async function payable(siteId: string, recordId: string, attempt: string) {
  if (!idPattern.test(siteId) || !keyPattern.test(attempt)) throw payGone();
  const live = await liveApp(siteId);
  if (!live) throw payGone();
  const found = await findRecord(siteId, live.app, recordId).catch(() => {
    throw payGone();
  });
  const expected = Buffer.from(found.stored.payKey ?? "");
  const given = Buffer.from(digest(attempt));
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    throw payGone();
  const record = toRecord(found.stored);
  if (!record.payment) throw payGone();
  return { live, table: found.table, record };
}
/** Marks a payment paid when its provider checkout was paid in full. */
async function confirmWithProvider(siteId: string, record: AppRecord) {
  const payment = record.payment;
  if (
    !payment?.checkout ||
    payment.status === "paid" ||
    !(await checkoutPaid(siteId, payment.checkout, toMinor(payment.amount)))
  )
    return record;
  const next: AppRecord = {
    ...record,
    payment: {
      ...payment,
      status: "paid",
      confirmedBy: "provider",
      paidAt: now(),
    },
    revision: record.revision + 1,
  };
  try {
    await run(siteId, [recordUpdate(siteId, record, next)]);
    return next;
  } catch (error) {
    // Someone else updated it at the same time; the stored copy wins.
    if (!(error instanceof Cancelled)) throw error;
    const again = await getRecord(siteId, record.table, record.id);
    return again ? toRecord(again) : record;
  }
}
async function payStatus(siteId: string, recordId: string, attempt: string) {
  const found = await payable(siteId, recordId, attempt);
  const record = await confirmWithProvider(siteId, found.record).catch(
    () => found.record,
  );
  return paymentView(siteId, found.live, record.id, record.payment!, attempt);
}
async function siteUrl(owner: string, siteId: string) {
  const site = await getItem<Site>(`USER#${owner}`, `SITE#${siteId}`);
  return site?.domainUrl || `${config.siteOrigin}/sites/${siteId}/`;
}
const redirect = (location: string): ApiResponse => ({
  status: 303,
  headers: {
    location,
    "cache-control": "no-store",
    // The URL holds the visitor's key; never pass it to payment sites.
    "referrer-policy": "no-referrer",
  },
  body: Buffer.alloc(0),
});
/** Sends the visitor to a checkout for the exact amount, reusing an open one. */
async function startCheckout(
  siteId: string,
  recordId: string,
  attempt: string,
) {
  const { live, table, record } = await payable(siteId, recordId, attempt);
  const payment = record.payment!;
  const back = await siteUrl(live.owner, siteId);
  if (payment.status === "paid") return redirect(back);
  const fresh =
    payment.checkout &&
    Date.now() - Date.parse(payment.checkout.createdAt) < 20 * 3600 * 1000;
  if (fresh && payment.checkout) return redirect(payment.checkout.url);
  const email = table.fields.find(
    (f) => f.type === "email" && record.values[f.id],
  );
  const checkout = await createCheckout(siteId, {
    requestId: record.id,
    reference: payment.reference,
    amount: toMinor(payment.amount),
    currency: payment.currency,
    description:
      `${live.site.name} · ${table.singular} ${payment.reference}`.slice(
        0,
        200,
      ),
    name: recordTitle(table, record).slice(0, 100),
    email: email ? String(record.values[email.id]) : "",
    returnUrl: back,
  });
  insist(
    checkout,
    409,
    "Online payment isn’t available. Use another way to pay.",
  );
  const next: AppRecord = {
    ...record,
    payment: { ...payment, checkout },
    revision: record.revision + 1,
  };
  await run(siteId, [recordUpdate(siteId, record, next)]).catch(() => {
    // A concurrent update keeps its copy; the checkout still works.
  });
  return redirect(checkout.url);
}
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const errorPage = (status: number, text: string): ApiResponse => ({
  status,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  },
  body: Buffer.from(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment unavailable</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1c1c1c}</style></head><body><h1>Payment unavailable</h1><p>${escapeHtml(text)}</p></body></html>`,
  ),
});

// ---------------------------------------------------------------- submit

async function submit(
  siteId: string,
  formId: string,
  input: Record<string, unknown>,
  ip: string,
): Promise<SubmitResult> {
  const { live, form, table } = await liveForm(siteId, formId);
  const app = live.app;
  if (form.kind !== "submit" || table.private) throw notLive();
  // Bots fill every field; people never see this one.
  insist(!input.website, 422, "Your form could not be sent.");
  const attempt = typeof input.key === "string" ? input.key : "";
  insist(keyPattern.test(attempt), 422, "Reload the page and try again.");
  const idem = key(siteId, "APPIDEM", `${form.id}#${attempt}`);
  const replay = async () => {
    const item = await getItem<SubmitResult>(idem.pk, idem.sk);
    return item
      ? {
          ref: item.ref,
          message: item.message,
          ...(item.status ? { status: item.status } : {}),
          ...(item.payment ? { payment: item.payment } : {}),
        }
      : undefined;
  };
  const earlier = await replay();
  if (earlier) return earlier;
  // Visitors fill only the form's own fields: never owner-only ones, the
  // status, or links (the identify step sets the one link they may).
  const allowed = form.fields.filter((id) => {
    const f = fieldOf(table, id);
    return f && !f.ownerOnly && f.type !== "link";
  });
  const catalog = catalogOf(live.catalogs);
  const input_ = parsed(
    parseValues(table, allowed, objectInput(input.values, "values"), {
      catalog,
    }),
  );
  const { values } = input_;
  if (form.identify) {
    const parent = tableOf(app, form.identify.table);
    const field = parent && fieldOf(parent, form.identify.field);
    if (!parent || !field) throw notLive();
    await limitLookups(siteId, ip);
    const who = await recordByValue(
      siteId,
      parent,
      field,
      input.identity,
      "identity",
    ).catch((error) => {
      if (error instanceof FieldError && error.status === 404)
        throw new FieldError(422, error.message, "identity");
      throw error;
    });
    values[form.identify.link] = who.id;
  }
  const ref = await claimRef(siteId, table);
  const record = newRecord(table, input_, ref, "visitor", "Visitor");
  const payment = await askPayment(siteId, live, form, record);
  if (payment) record.payment = payment;
  const status = statusOf(table, record.status);
  const result: SubmitResult = {
    ref,
    ...(status ? { status: { name: status.name, tone: status.tone } } : {}),
    message: (form.success || "Thanks — we’ve received it.").replaceAll(
      "{ref}",
      ref,
    ),
    ...(payment
      ? {
          payment: await paymentView(siteId, live, record.id, payment, attempt),
        }
      : {}),
  };
  try {
    await run(siteId, [
      recordPut(siteId, record, payment ? digest(attempt) : undefined),
      {
        tag: "idem",
        write: {
          Put: {
            TableName: config.table,
            Item: { ...idem, ...result, expires: epoch() + 86400 },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
      },
      {
        tag: "day",
        write: update(
          key(siteId, "APPDAY", record.createdAt.slice(0, 10)),
          "ADD #count :one",
          { ":one": 1, ":max": DAILY_SUBMISSIONS },
          "attribute_not_exists(#count) OR #count < :max",
          { "#count": "count" },
        ),
      },
      countWrite(siteId, table.id, 1),
      ...refPut(siteId, record),
      ...sideWrites(siteId, table, record.id, {}, values),
      ...capacityWrites(siteId, table, catalog, undefined, record),
    ]);
  } catch (error) {
    if (error instanceof Cancelled && error.tag === "idem") {
      const first = await replay();
      if (first) return first;
    }
    if (error instanceof Cancelled && error.tag.startsWith("link:"))
      throw new FieldError(
        422,
        "We couldn’t find your record. Check the number and try again.",
        "identity",
      );
    await explain(error, siteId, app, table, values, true);
  }
  if (table.notify)
    await notifyOwner(siteId, live, form, table, record).catch(() =>
      console.warn("app_notify_failed", { siteId }),
    );
  return result;
}
/** Push to the owner's devices, and an email to the store's contact address when one is set. */
async function notifyOwner(
  siteId: string,
  live: Live,
  form: AppForm,
  table: AppTable,
  record: AppRecord,
) {
  const app = live.app;
  const who =
    form.identify &&
    (
      await titlesFor(siteId, app, [
        {
          field: fieldOf(table, form.identify.link)!,
          value: record.values[form.identify.link],
        },
      ])
    )(form.identify.table, String(record.values[form.identify.link]));
  const fields = fieldsOf(table, form.fields);
  const [shown] = await shownValues(siteId, app, table, form.fields, [record]);
  // A cart reads as what was ordered and its total: "2 × Paneer tikka — ₹634".
  const ordered = fields
    .map((f, i) => {
      const lines = record.lines?.[f.id];
      return f.type === "items" && lines?.length
        ? `${describeLines(lines)} — ${shown[i].value}`
        : "";
    })
    .filter(Boolean);
  const detail = [
    who,
    ...ordered,
    ...shown.filter((_, i) => fields[i].type !== "items").map((v) => v.value),
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);
  const noun = `New ${table.singular.toLowerCase()}${record.ref ? ` ${record.ref}` : ""}`;
  const title = `${noun} · ${live.site.name}`.slice(0, 120);
  const url = appPage(siteId, table.id, record.id);
  await notifyDevices(siteId, title, detail, url);
  const store = await read<{ contactEmail?: string }>(siteId, "SETTINGS");
  if (store?.contactEmail)
    await run(siteId, [
      {
        tag: "mail",
        write: message(
          siteId,
          store.contactEmail,
          title,
          [
            `${noun}${ordered.length ? `: ${ordered.join("; ")}` : ""}`,
            detail,
            record.payment
              ? `Payment: ${formatMoney(record.payment.amount, record.payment.currency)} (reference ${record.payment.reference}), not paid yet.`
              : "",
            `Review it: ${url}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      },
    ]);
}
// ---------------------------------------------------------------- public views

const viewGone = () =>
  new HttpError(404, "This list isn’t available right now.");
/**
 * Reads of a whole table are bounded by MAX_RECORDS but not free, so each
 * instance keeps a view's chosen rows (at most its limit, already reduced to
 * allow-listed text) for a few seconds. Keyed by release, so publishing a
 * changed view never serves the old one.
 */
const viewRows = new Map<string, { at: number; value: Promise<unknown> }>();
const VIEW_TTL = 10_000;
function cached<T>(cacheKey: string, make: () => Promise<T>): Promise<T> {
  const hit = viewRows.get(cacheKey);
  if (hit && Date.now() - hit.at < VIEW_TTL) return hit.value as Promise<T>;
  if (viewRows.size > 500) viewRows.clear();
  const value = make();
  viewRows.set(cacheKey, { at: Date.now(), value });
  value.catch(() => viewRows.delete(cacheKey));
  return value;
}
const limitViewReads = (siteId: string, ip: string) =>
  limitPerMinute(
    siteId,
    ip,
    "APPVIEW",
    VIEW_READS_PER_MINUTE,
    "Too many requests. Wait a minute and try again.",
  );
/**
 * GET /apps/:site/views/:view — a page of a public view from the live
 * release's definition: allow-listed fields only, no ids, within its limit.
 */
async function publicView(
  siteId: string,
  viewId: string,
  page: number,
  size: number,
  ip: string,
) {
  insist(
    idPattern.test(siteId) && /^[\w-]{1,64}$/.test(viewId),
    404,
    "This list isn’t available right now.",
  );
  const live = await liveApp(siteId);
  const view = live && publicViews(live.app).find((v) => v.id === viewId);
  if (!live || !view) throw viewGone();
  await limitViewReads(siteId, ip);
  const table = tableOf(live.app, view.table)!;
  const all = await cached(
    `${siteId}#${live.releaseId}#view#${view.id}`,
    async () => {
      const load = tableCache(siteId);
      const records = structuredClone(await load(table.id));
      // Totals are needed only when shown or sorted by.
      if (
        table.totals.some(
          (t) => view.fields.includes(t.id) || view.sort === t.id,
        )
      )
        await withTotals(live.app, table, records, load);
      // Link titles only for link fields on the allow-list.
      const shownLinks = table.fields.some(
        (f) => f.type === "link" && view.fields.includes(f.id),
      );
      const links = shownLinks ? await linkTitles(live.app, [table], load) : {};
      // Every page from one selection, so paging is consistent within the TTL.
      return {
        name: view.name,
        columns: viewColumns(live.app, view),
        rows: selectRecords(live.app, view, records).map((r) =>
          shownRow(live.app, view, r, links),
        ),
      };
    },
  );
  const per = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Math.floor(size) || PAGE_SIZE),
  );
  const at = Math.max(0, Math.min(100, Math.floor(page) || 0));
  return {
    ...all,
    rows: all.rows.slice(at * per, at * per + per),
    page: at,
    more: all.rows.length > (at + 1) * per,
  } satisfies PublicView;
}
/** GET /apps/:site/metrics — public dashboard cards and charts, numbers only. */
async function metrics(siteId: string, ip: string) {
  insist(idPattern.test(siteId), 404, "Not found.");
  const live = await liveApp(siteId);
  if (!live) throw new HttpError(404, "Not found.");
  await limitViewReads(siteId, ip);
  return cached(`${siteId}#${live.releaseId}#metrics`, () =>
    publicMetrics(live.app, tableCache(siteId)),
  );
}

/** /apps/:siteId/… and /push/key: no sign-in, any origin. */
export async function appsPublic(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const { method, path } = request;
  if (path === "/push/key") {
    if (method !== "GET") return failure(new HttpError(405, "Use GET."), true);
    return json({ publicKey: await publicKey() }, 200, true);
  }
  const query = new URLSearchParams(request.query ?? "");
  const ip = request.ip || "unknown";
  const pay = /^\/apps\/([^/]+)\/records\/([^/]+)\/(pay|checkout)$/.exec(path);
  if (pay) {
    const [, siteId, recordId, verb] = pay;
    const attempt = query.get("key") ?? "";
    if (verb === "checkout")
      try {
        insist(method === "GET", 405, "Use GET.");
        return await startCheckout(siteId, recordId, attempt);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return errorPage(error.status, error.message);
      }
    try {
      insist(method === "GET", 405, "Use GET.");
      return json(await payStatus(siteId, recordId, attempt), 200, true);
    } catch (error) {
      return failure(error, true);
    }
  }
  const data = /^\/apps\/([^/]+)\/(?:views\/([^/]+)|(metrics))$/.exec(path);
  if (data)
    try {
      insist(method === "GET", 405, "Use GET.");
      const [, siteId, viewId] = data;
      const value = viewId
        ? await publicView(
            siteId,
            viewId,
            Number(query.get("page") ?? 0),
            Number(query.get("size") ?? PAGE_SIZE),
            ip,
          )
        : await metrics(siteId, ip);
      return json(value, 200, true, "public, max-age=15");
    } catch (error) {
      return failure(error, true);
    }
  const match =
    /^\/apps\/([^/]+)\/forms\/([^/]+)(?:\/(find|availability))?$/.exec(path);
  if (!match) return undefined;
  const [, siteId, formId, verb] = match;
  try {
    if (verb === "find") {
      insist(method === "GET", 405, "Use GET.");
      return json(
        await find(siteId, formId, query.get("value"), query.get("verify"), ip),
        200,
        true,
      );
    }
    if (verb === "availability") {
      insist(method === "GET", 405, "Use GET.");
      return json(
        await availability(siteId, formId, ip),
        200,
        true,
        "public, max-age=5",
      );
    }
    insist(method === "POST", 405, "Use POST.");
    return json(
      await submit(siteId, formId, publicInput(request), ip),
      201,
      true,
    );
  } catch (error) {
    if (!(error instanceof HttpError))
      console.error(
        "app_public_failed",
        error instanceof Error ? error.name : "Unknown",
      );
    return failure(
      error instanceof HttpError
        ? error
        : new HttpError(500, "Something went wrong. Please try again."),
      true,
    );
  }
}
