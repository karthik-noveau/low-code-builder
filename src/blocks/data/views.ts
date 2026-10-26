/**
 * Public views: what a website may show of an app's records. Shared by the
 * backend (GET /apps/:site/views/:view, from the live release only), the
 * editor (the same rows from the owner's records, so the canvas shows what
 * visitors will) and the Data tab (warnings while the owner sets one up).
 *
 * The rules, all enforced here so every caller agrees:
 * - only fields on the view's allow-list are read; everything else on a
 *   record (ids, references, history, notes, payments, other fields) never
 *   leaves this module;
 * - values are formatted text (money, dates, link titles), never raw objects;
 * - phone and email fields need the owner's explicit `contact` consent
 *   (validateApp refuses them otherwise);
 * - rows carry no ids, so visitors can't walk records one by one, and paging
 *   stops at the view's `limit`.
 */
import type {
  LinkTitles,
  PublicMetrics,
  PublicView,
} from "../../apps/api-types";
import {
  CONTACT_TYPES,
  cardValue,
  showsContact,
  fieldOf,
  formatAppValue,
  formatMoney,
  statusOf,
  tableOf,
  VIEW_STATUS,
  type App,
  type AppChart,
  type AppRecord,
  type AppTable,
  type AppView,
  type AppViewFilter,
} from "../../apps/model";
import { chartBars } from "../../owner/roles";

/** Rows per page when a block doesn't say; the most a page may ask for. */
export const PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 24;

export interface ViewColumn {
  id: string;
  name: string;
  /** A field type, "total" or "status": how blocks lay the value out. */
  type: string;
  money?: boolean;
}
/** The allow-listed columns of a view, in the owner's order, named for visitors. */
export function viewColumns(app: App, view: AppView): ViewColumn[] {
  const table = tableOf(app, view.table);
  if (!table) return [];
  return view.fields.flatMap((id): ViewColumn[] => {
    if (id === VIEW_STATUS) return [{ id, name: "Status", type: "status" }];
    const field = fieldOf(table, id);
    if (field)
      return [
        {
          id,
          name: field.name,
          type: field.type,
          ...(field.type === "money" || field.type === "items"
            ? { money: true }
            : {}),
        },
      ];
    const total = table.totals.find((t) => t.id === id);
    if (total)
      return [
        {
          id,
          name: total.name,
          type: "total",
          ...(total.money ||
          (total.op === "sum" &&
            fieldOf(tableOf(app, total.table) ?? table, total.field ?? "")
              ?.type === "money")
            ? { money: true }
            : {}),
        },
      ];
    return [];
  });
}

/** "Priya Sharma" → "Priya S." */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const valueOf = (table: AppTable, record: AppRecord, id: string) =>
  id === VIEW_STATUS
    ? (statusOf(table, record.status)?.name ?? "")
    : table.totals.some((t) => t.id === id)
      ? (record.totals?.[id] ?? 0)
      : record.values[id];

function matches(table: AppTable, record: AppRecord, f: AppViewFilter) {
  const raw = f.field === VIEW_STATUS ? record.status : record.values[f.field];
  const text = String(raw ?? "").toLowerCase();
  const want = f.value.trim().toLowerCase();
  const field = fieldOf(table, f.field);
  // Statuses compare by id or name; yes/no by "yes"/"no".
  const same =
    f.field === VIEW_STATUS
      ? text === want ||
        statusOf(table, record.status)?.name.toLowerCase() === want
      : field?.type === "yesNo"
        ? (raw === true) === ["yes", "true", "1"].includes(want)
        : text === want;
  switch (f.op) {
    case "is":
      return same;
    case "not":
      return !same;
    case "contains":
      return text.includes(want);
    case "atLeast":
      return Number(raw ?? 0) >= Number(f.value);
    case "atMost":
      return Number(raw ?? 0) <= Number(f.value);
    case "set":
      return text !== "" && raw !== false;
    case "empty":
      return text === "" || raw === false;
  }
}

/**
 * The records a view selects, in its order, at most `limit` of them. Records
 * need their totals (computeTotals) when the view sorts or shows a total.
 */
export function selectRecords(
  app: App,
  view: AppView,
  records: AppRecord[],
): AppRecord[] {
  const table = tableOf(app, view.table);
  if (!table) return [];
  const sort = view.sort;
  const dir = view.order === "asc" ? -1 : 1;
  return records
    .filter(
      (r) =>
        (!view.statuses.length || view.statuses.includes(r.status)) &&
        (!view.filter || matches(table, r, view.filter)),
    )
    .sort((a, b) => {
      if (!sort) return dir * b.createdAt.localeCompare(a.createdAt);
      const x = valueOf(table, a, sort),
        y = valueOf(table, b, sort);
      if (typeof x === "number" || typeof y === "number")
        return dir * (Number(y ?? 0) - Number(x ?? 0));
      return dir * String(y ?? "").localeCompare(String(x ?? ""));
    })
    .slice(0, view.limit);
}

/** One record as visitors get it: allow-listed values, formatted, nothing else. */
export function shownRow(
  app: App,
  view: AppView,
  record: AppRecord,
  links: LinkTitles,
): Record<string, string> {
  const table = tableOf(app, view.table)!;
  const row: Record<string, string> = {};
  for (const id of view.fields) {
    let value: string;
    if (id === VIEW_STATUS) value = statusOf(table, record.status)?.name ?? "";
    else {
      const field = fieldOf(table, id);
      if (field) {
        if (
          !view.contact &&
          showsContact(table, id, new Map(app.tables.map((t) => [t.id, t])))
        )
          continue;
        value = formatAppValue(
          app,
          field,
          record.values[id],
          (t, r) => links[t]?.[r] ?? "",
          record.lines?.[id],
        );
        if (view.initials?.includes(id)) value = initialsOf(value);
      } else {
        const total = table.totals.find((t) => t.id === id);
        if (!total) continue;
        const n = record.totals?.[id] ?? 0;
        const money =
          total.money ||
          (total.op === "sum" &&
            fieldOf(tableOf(app, total.table) ?? table, total.field ?? "")
              ?.type === "money");
        value = money
          ? formatMoney(n, app.currency)
          : n.toLocaleString("en-IN");
      }
    }
    row[id] = value.slice(0, 500);
  }
  return row;
}

/**
 * A page of a view, as the public API answers it. `records` are every record
 * of the table (with totals); `page` counts from 0.
 */
export function runView(
  app: App,
  view: AppView,
  records: AppRecord[],
  links: LinkTitles,
  page = 0,
  size = PAGE_SIZE,
): PublicView {
  const per = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Math.floor(size) || PAGE_SIZE),
  );
  const at = Math.max(0, Math.floor(page) || 0);
  const chosen = selectRecords(app, view, records);
  const slice = chosen.slice(at * per, at * per + per);
  return {
    name: view.name,
    columns: viewColumns(app, view),
    rows: slice.map((r) => shownRow(app, view, r, links)),
    page: at,
    more: chosen.length > (at + 1) * per,
  };
}

/** A chart's monthly bars as numbers and month names only. */
export function chartPoints(
  app: App,
  chart: AppChart,
  records: AppRecord[],
  now = new Date(),
) {
  const table = tableOf(app, chart.table);
  const money =
    !!chart.money ||
    (chart.op === "sum" &&
      fieldOf(table ?? app.tables[0], chart.field ?? "")?.type === "money");
  return {
    id: chart.id,
    name: chart.name,
    money,
    bars: chartBars(chart, records, now).map((b) => ({
      label: b.label,
      long: b.long,
      value: b.value,
      shown: money
        ? formatMoney(b.value, app.currency)
        : b.value.toLocaleString("en-IN"),
    })),
  };
}

/** The dashboard figures the owner marked public: numbers, never records. */
export async function publicMetrics(
  app: App,
  load: (tableId: string) => Promise<AppRecord[]>,
  now = new Date(),
): Promise<PublicMetrics> {
  const cards = await Promise.all(
    app.dashboard.cards
      .filter((c) => c.public && tableOf(app, c.table))
      .map(async (card) => {
        const value = cardValue(card, await load(card.table));
        const table = tableOf(app, card.table)!;
        const money =
          !!card.money ||
          (card.op === "sum" &&
            fieldOf(table, card.field ?? "")?.type === "money");
        return {
          id: card.id,
          name: card.name,
          value,
          money,
          shown: money
            ? formatMoney(value, app.currency)
            : value.toLocaleString("en-IN"),
        };
      }),
  );
  const charts = await Promise.all(
    (app.dashboard.charts ?? [])
      .filter((c) => c.public && tableOf(app, c.table))
      .map(async (chart) =>
        chartPoints(app, chart, await load(chart.table), now),
      ),
  );
  return { cards, charts };
}

/** Plain-words cautions for the owner about what a view shows. */
export function viewWarnings(app: App, view: AppView): string[] {
  const table = tableOf(app, view.table);
  if (!table) return ["This view’s table no longer exists."];
  const out: string[] = [];
  const contact = view.fields
    .map((id) => fieldOf(table, id))
    .filter((f) => f && CONTACT_TYPES.includes(f.type));
  if (contact.length)
    out.push(
      `Anyone can see ${contact.map((f) => f!.name.toLowerCase()).join(" and ")} on your website. Only show contact details people agreed to share.`,
    );
  const names = view.fields.filter(
    (id) =>
      id === table.titleField &&
      !view.initials?.includes(id) &&
      fieldOf(table, id)?.type === "text",
  );
  if (
    names.length &&
    /customer|member|client|student|patient|people/i.test(table.name)
  )
    out.push(
      `Full ${fieldOf(table, names[0])!.name.toLowerCase()}s are shown. Show them as “Priya S.” to protect your ${table.name.toLowerCase()}.`,
    );
  if (!view.public)
    out.push(
      "Draft: visitors can’t see it until you turn on “Show on website”.",
    );
  return out;
}

/** Views that work on a published site (public, table still there). */
export const publicViews = (app: App | undefined) =>
  (app?.views ?? []).filter((v) => v.public && tableOf(app!, v.table));
