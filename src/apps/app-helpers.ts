/** Helpers the owner's app page shares between its sections. */
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { ApiError } from "../cloud/client";
import type { Collection } from "../studio/collections";
import { parseAmount } from "../studio/payments";
import {
  describeLines,
  formatAppValue,
  formatMoney,
  placesTaken,
  statusOf,
  type App,
  type AppCapacity,
  type AppField,
  type AppLine,
  type AppPayment,
  type AppRecord,
  type AppTable,
  type AppTotal,
  type CatalogItem,
} from "./model";
import type { LinkTitles } from "./api-types";

export const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
export const isConflict = (error: unknown) =>
  error instanceof ApiError && error.status === 409;
/**
 * A 409 that means "the record changed first" (reload and retry). A 409 that
 * names a field is about the values instead: a full capacity or a value
 * another record already uses, shown at the field.
 */
export const isStale = (error: unknown) =>
  isConflict(error) && !errorField(error);
/** The field a server error is about, when it names one of `fields`. */
export const errorField = (error: unknown) =>
  error instanceof ApiError ? error.field : undefined;

/** Statuses a board shows as columns: the ones still being worked on. */
export const boardStatuses = (table: AppTable) =>
  table.statuses.filter((s) => s.tone === "waiting" || s.tone === "neutral");
/** "ORD-1004" when the table numbers its records, else the title. */
export const recordTitleOrRef = (table: AppTable, record: AppRecord) =>
  record.ref || String(record.values[table.titleField] ?? "") || "This record";
export const statusName = (table: AppTable, status: string) =>
  statusOf(table, status)?.name ?? status;
/** Turns record ids into names using every list's link titles. */
export function linkTitler(links: LinkTitles) {
  return (tableId: string, recordId: string) =>
    links[tableId]?.[recordId] || "Removed record";
}
export type LinkTitle = ReturnType<typeof linkTitler>;

const isItems = (field: AppField) =>
  field.type === "item" || field.type === "items";
/** Every chosen item of a record, across its item fields. */
export const recordLines = (table: AppTable, record: AppRecord) =>
  table.fields.filter(isItems).flatMap((f) => record.lines?.[f.id] ?? []);
export const linesTotal = (lines: AppLine[]) =>
  Math.round(lines.reduce((sum, l) => sum + l.price * 100 * l.quantity, 0)) /
  100;
/** A value as the owner reads it; an order reads "2 × Paneer tikka, 1 × Naan · ₹520". */
export const showValue = (
  app: App,
  field: AppField,
  record: AppRecord,
  linkTitle: LinkTitle,
) => {
  const lines = record.lines?.[field.id];
  if (field.type === "items" && lines?.length)
    return `${describeLines(lines)} · ${formatMoney(Number(record.values[field.id] ?? linesTotal(lines)), app.currency)}`;
  return formatAppValue(app, field, record.values[field.id], linkTitle, lines);
};
export const showTotal = (app: App, total: AppTotal, value = 0) =>
  total.money ? formatMoney(value, app.currency) : value.toLocaleString();
/** The fields worth showing next to a record's title in a list; what was ordered comes first. */
export const keyFields = (table: AppTable, count: number) =>
  table.fields
    .filter((f) => f.id !== table.titleField && f.type !== "longText")
    .sort((a, b) => Number(isItems(b)) - Number(isItems(a)))
    .slice(0, count);
export const when = (iso: string, withTime = false) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
};

const focusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/**
 * Dialog behaviour for a panel: focus moves in when it opens and back when it
 * closes, Tab stays inside, and Escape closes it. Returns the keydown handler
 * for the panel, so a dialog stacked inside another closes on its own.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const first =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ||
      panel?.querySelector<HTMLElement>(focusable);
    (first || panel)?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, [ref]);
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close.current();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    // A dialog inside another handles its own Tab.
    event.stopPropagation();
    const items = [
      ...ref.current.querySelectorAll<HTMLElement>(focusable),
    ].filter((el) => !el.closest("[inert]"));
    if (!items.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

/** One spreadsheet cell; a leading = + - @ can't run as a formula. */
export const csvCell = (value: string) => {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function downloadCsv(rows: string[][], name: string) {
  const blob = new Blob(
    ["﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** A table's records as spreadsheet rows, values as the owner sees them. */
export function recordRows(
  app: App,
  table: AppTable,
  records: AppRecord[],
  linkTitle: LinkTitle,
) {
  const fields = table.fields;
  const paid = records.some((r) => r.payment);
  return [
    [
      ...(table.prefix ? ["Reference"] : []),
      // An order is two columns: what was ordered, and its total as a number.
      ...fields.flatMap((f) =>
        f.type === "items" ? [f.name, `${f.name} total`] : [f.name],
      ),
      ...table.totals.map((t) => t.name),
      ...(table.statuses.length ? ["Status"] : []),
      ...(paid ? ["Payment", "Payment reference"] : []),
      "Added",
    ],
    ...records.map((r) => [
      ...(table.prefix ? [r.ref] : []),
      ...fields.flatMap((f) =>
        f.type === "items"
          ? [describeLines(r.lines?.[f.id]), String(r.values[f.id] ?? "")]
          : // Spreadsheets want plain numbers for sums.
            f.type === "money" || f.type === "number"
            ? [String(r.values[f.id] ?? "")]
            : [showValue(app, f, r, linkTitle)],
      ),
      ...table.totals.map((t) => String(r.totals?.[t.id] ?? 0)),
      ...(table.statuses.length
        ? [statusOf(table, r.status)?.name ?? r.status]
        : []),
      ...(paid
        ? [r.payment ? paymentText(r.payment) : "", r.payment?.reference ?? ""]
        : []),
      when(r.createdAt, true),
    ]),
  ];
}
/** A short line of a record's key values, e.g. "₹18,400 · Ada Brooks". */
export function recordSummary(
  app: App,
  table: AppTable,
  record: AppRecord,
  linkTitle: LinkTitle,
  count = 2,
) {
  return keyFields(table, count)
    .map((f) => showValue(app, f, record, linkTitle))
    .filter(Boolean)
    .join(" · ");
}
/** The other tables' link fields that point at `table`, e.g. a customer's purchases. */
export function childLinks(app: App, table: AppTable) {
  const out: { table: AppTable; field: AppField }[] = [];
  for (const other of app.tables)
    for (const field of other.fields)
      if (field.type === "link" && field.table === table.id)
        out.push({ table: other, field });
  return out;
}

/** The status a table opens on: the first "waiting" one that has records. */
export function defaultFilter(table: AppTable, records: AppRecord[]) {
  const waiting = table.statuses.find(
    (s) => s.tone === "waiting" && records.some((r) => r.status === s.id),
  );
  return waiting?.id ?? "all";
}

/** "Paid ₹520 · Paid online" or "Unpaid ₹520". */
export function paymentText(payment: AppPayment) {
  const amount = formatMoney(payment.amount, payment.currency);
  if (payment.status !== "paid") return `Unpaid ${amount}`;
  return `Paid ${amount} · ${payment.confirmedBy === "owner" ? "Marked paid by you" : "Paid online"}`;
}

/** "Just now", "12 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Collection id → its live items, as item fields choose from them. */
export type Catalog = Record<string, CatalogItem[]>;
/** The published items of the site's collections, with prices in whole units. */
export function catalogOf(collections: Collection[]): Catalog {
  return Object.fromEntries(
    collections.map((c) => {
      const numbers = c.fields.filter((f) => f.type === "number");
      return [
        c.id,
        c.items
          .filter((item) => !item.hidden)
          .map((item): CatalogItem => {
            const cents = parseAmount(item.values[c.display.price]);
            return {
              slug: item.slug,
              title: item.values[c.display.title] || item.slug,
              price: cents === null ? null : cents / 100,
              numbers: Object.fromEntries(
                numbers
                  .filter((f) => (item.values[f.id] ?? "").trim() !== "")
                  .map((f) => [f.id, Number(item.values[f.id])] as const)
                  .filter(([, n]) => Number.isFinite(n)),
              ),
            };
          }),
      ];
    }),
  );
}

/** Local yyyy-mm-dd, `days` from today. */
export const localDay = (days = 0, now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export interface PlacesRow {
  key: string;
  /** e.g. "2 Nov 2026 · 19:00" */
  label: string;
  taken: number;
  max: number;
}
/**
 * Places taken per group of a capacity, from the records already loaded.
 * Only groups with bookings are listed (any other has every place free).
 * When the group has a date, only today and the next `days` days count.
 */
export function placesRows(
  app: App,
  table: AppTable,
  capacity: AppCapacity,
  records: AppRecord[],
  catalog?: Catalog,
  days = 7,
  now = new Date(),
): PlacesRow[] {
  const fields = capacity.group
    .map((id) => table.fields.find((f) => f.id === id))
    .filter((f) => f !== undefined);
  if (fields.length !== capacity.group.length) return [];
  const dated = fields.find((f) => f.type === "date");
  const from = localDay(0, now),
    to = localDay(days, now);
  const rows = new Map<string, PlacesRow>();
  for (const r of records) {
    if (!capacity.statuses.includes(r.status)) continue;
    const values = fields.map((f) => String(r.values[f.id] ?? ""));
    if (values.some((v) => !v)) continue;
    if (dated) {
      const day = String(r.values[dated.id]);
      if (day < from || day > to) continue;
    }
    const key = values.join("|");
    let row = rows.get(key);
    if (!row) {
      const first = fields[0];
      const item =
        first.type === "item"
          ? catalog?.[first.collection ?? ""]?.find((i) => i.slug === values[0])
          : undefined;
      const max =
        capacity.maxField && item
          ? (item.numbers?.[capacity.maxField] ?? capacity.max)
          : capacity.max;
      row = {
        key,
        label: fields
          .map((f) =>
            f.type === "item"
              ? (r.lines?.[f.id]?.[0]?.title ??
                item?.title ??
                String(r.values[f.id]))
              : formatAppValue(app, f, r.values[f.id]),
          )
          .join(" · "),
        taken: 0,
        max,
      };
      rows.set(key, row);
    }
    row.taken += placesTaken(capacity, r.values);
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
