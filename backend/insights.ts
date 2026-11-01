/**
 * Insights: how many people visit a published site, where they come from,
 * what they read, and what they buy.
 *
 * Page views arrive from insights.js on published pages (POST /track/{id}),
 * without cookies. A visitor is counted once a day from a hash of their
 * address and browser with that day's random salt; salts expire after two
 * days, so the hashes can't be traced back to anyone. Everything is kept as
 * one counter row per day (STATS#yyyy-mm-dd): views, visitors, and views or
 * visitors per page, referring site, campaign (utm_*), device, and store
 * event (commerce-data.ts adds those as they're recorded).
 */
import { createHash, randomBytes } from "node:crypto";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, idPattern, isConditional } from "./config";
import { db, getItem } from "./database";
import { allow, siteAccess } from "./access";
import { key, list, partition, read } from "./commerce-data";
import type { ApiRequest } from "./api";
import { countryOf } from "./timezones";
import type { Order, StoreSettings } from "../src/commerce/types";

const DAY_SECONDS = 86400;
const KEEP_DAYS = 400;
const today = () => new Date().toISOString().slice(0, 10);

/** What a site's published release measures (written at publish). */
export function trackingKey(siteId: string) {
  return key(siteId, "TRACKING");
}
/** The website's Google Analytics and Pixel, for the store's own events. */
export async function storeTracking(siteId: string) {
  const t = await getItem<{ ga4?: string; pixel?: string; consent?: boolean }>(
    partition(siteId),
    "TRACKING#",
  );
  return t && (t.ga4 || t.pixel)
    ? { ga4: t.ga4 ?? "", pixel: t.pixel ?? "", consent: t.consent !== false }
    : undefined;
}
async function salt(day: string) {
  const found = await getItem<{ value: string }>("INSIGHTS", `SALT#${day}`);
  if (found) return found.value;
  try {
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: {
          pk: "INSIGHTS",
          sk: `SALT#${day}`,
          value: randomBytes(32).toString("hex"),
          expires: Math.floor(Date.now() / 1000) + 2 * DAY_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (error) {
    if (!isConditional(error)) throw error;
  }
  return (await getItem<{ value: string }>("INSIGHTS", `SALT#${day}`))!.value;
}
const BOTS =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|curl|wget|python-requests/i;
const clean = (value: unknown, pattern: RegExp, max: number) => {
  const v =
    typeof value === "string" ? value.trim().toLowerCase().slice(0, max) : "";
  return pattern.test(v) ? v : "";
};
export const device = (width: number) =>
  width <= 0
    ? "unknown"
    : width < 640
      ? "mobile"
      : width < 1024
        ? "tablet"
        : "desktop";

/** One page view from a published page. Quietly ignored when it can't be counted. */
export async function track(request: ApiRequest, siteId: string) {
  if (!idPattern.test(siteId) || request.body.length > 2048) return;
  const agent = request.headers["user-agent"] || "";
  if (!agent || BOTS.test(agent)) return;
  const setting = await getItem<{ counts?: boolean }>(
    partition(siteId),
    "TRACKING#",
  );
  if (!setting || setting.counts === false) return;
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(request.body.toString() || "{}");
  } catch {
    return;
  }
  const path =
    clean(input.p, /^\/[a-z0-9\-/._~%]{0,100}$/, 101).replace(/(.)\/$/, "$1") ||
    "/";
  const referrer = clean(input.r, /^[a-z0-9.-]{3,80}$/, 80);
  const source = clean(input.s, /^[\w .+-]{1,40}$/, 40);
  const medium = clean(input.m, /^[\w .+-]{1,40}$/, 40);
  const campaign = clean(input.c, /^[\w .+-]{1,60}$/, 60);
  const width = Number(input.w) || 0;
  const country = countryOf(input.z);
  const day = today();
  const visitor = createHash("sha256")
    .update(`${await salt(day)}|${siteId}|${request.ip ?? ""}|${agent}`)
    .digest("hex")
    .slice(0, 32);
  let fresh = true;
  try {
    await db.send(
      new PutCommand({
        TableName: config.table,
        Item: {
          ...key(siteId, "VISITOR", `${day}#${visitor}`),
          expires: Math.floor(Date.now() / 1000) + 2 * DAY_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (error) {
    if (!isConditional(error)) throw error;
    fresh = false;
  }
  // Views count every load; where people came from counts once a visit.
  const counts: Record<string, number> = { pv: 1, [`p:${path}`]: 1 };
  if (fresh) {
    counts.v = 1;
    counts[`r:${referrer || (source ? "" : "(direct)")}`] = 1;
    if (source) counts[`s:${source}`] = 1;
    if (medium) counts[`m:${medium}`] = 1;
    if (campaign) counts[`c:${campaign}`] = 1;
    counts[`d:${device(width)}`] = 1;
    counts[`k:${country || "unknown"}`] = 1;
    if (input.t === "a" || input.t === "b")
      counts[`t:${campaign}:${input.t}`] = 1;
    delete counts["r:"];
  }
  await addCounts(siteId, day, counts).catch((error) =>
    console.error("track_failed", siteId, String(error).slice(0, 200)),
  );
}
/** Adds to a day's counters (and keeps the row a little over a year). */
export function countsUpdate(
  siteId: string,
  day: string,
  counts: Record<string, number>,
) {
  const names: Record<string, string> = {};
  const values: Record<string, number> = {
    ":expires": Math.floor(Date.now() / 1000) + KEEP_DAYS * DAY_SECONDS,
  };
  const adds = Object.entries(counts).map(([name, n], i) => {
    names[`#a${i}`] = name;
    values[`:a${i}`] = n;
    return `#a${i} :a${i}`;
  });
  return {
    TableName: config.table,
    Key: key(siteId, "STATS", day),
    UpdateExpression: `SET expires = :expires ADD ${adds.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}
const addCounts = (
  siteId: string,
  day: string,
  counts: Record<string, number>,
) => db.send(new UpdateCommand(countsUpdate(siteId, day, counts)));

type Row = Record<string, number | string>;
const top = (rows: Row[], prefix: string, limit = 10) => {
  const totals = new Map<string, number>();
  for (const row of rows)
    for (const [name, value] of Object.entries(row))
      if (name.startsWith(prefix) && typeof value === "number")
        totals.set(
          name.slice(prefix.length),
          (totals.get(name.slice(prefix.length)) ?? 0) + value,
        );
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
};
const paid = (o: Order) =>
  o.status === "paid" || o.status === "fulfilled" || o.status === "refunded";

/** The owner's view of the last `days` days (Insights page). */
export async function insights(actor: string, siteId: string, query = "") {
  const access = await siteAccess(actor, siteId);
  allow(access, "read");
  const days = Math.min(
    365,
    Math.max(1, Number(new URLSearchParams(query).get("days")) || 30),
  );
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * DAY_SECONDS * 1000);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const rows: Row[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: config.table,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": partition(siteId),
          ":from": `STATS#${from}`,
          ":to": `STATS#${to}`,
        },
        ExclusiveStartKey: cursor,
      }),
    );
    rows.push(...((page.Items ?? []) as Row[]));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  const settings = await read<StoreSettings>(siteId, "SETTINGS");
  const currency = settings?.currency ?? "USD";
  const orders = settings
    ? (await list<Order>(siteId, "ORDER")).filter(
        (o) => o.createdAt.slice(0, 10) >= from,
      )
    : [];
  const sold = orders.filter((o) => paid(o) && o.currency === currency);
  const byDay = new Map(rows.map((r) => [String(r.sk).slice(6), r]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY_SECONDS * 1000)
      .toISOString()
      .slice(0, 10);
    const row = byDay.get(day) ?? {};
    const dayOrders = sold.filter((o) => o.createdAt.slice(0, 10) === day);
    return {
      day,
      visitors: Number(row.v ?? 0),
      views: Number(row.pv ?? 0),
      orders: dayOrders.length,
      revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
    };
  });
  const sum = (k: "visitors" | "views" | "orders" | "revenue") =>
    series.reduce((n, d) => n + d[k], 0);
  // Sales by where the shopper came from (orders.attribution).
  const channels = new Map<
    string,
    {
      source: string;
      medium: string;
      campaign: string;
      orders: number;
      revenue: number;
    }
  >();
  for (const o of sold) {
    const a = o.attribution;
    const source = a?.source || (a?.referrer ? a.referrer : "direct");
    const id = `${source}|${a?.medium ?? ""}|${a?.campaign ?? ""}`;
    const row = channels.get(id) ?? {
      source,
      medium: a?.medium ?? "",
      campaign: a?.campaign ?? "",
      orders: 0,
      revenue: 0,
    };
    row.orders++;
    row.revenue += o.total;
    channels.set(id, row);
  }
  // A/B campaigns: orders and sales for each version.
  const variantSales: Record<string, { orders: number; revenue: number }> = {};
  for (const o of sold) {
    const a = o.attribution;
    if (!a?.campaign || (a.content !== "a" && a.content !== "b")) continue;
    const id = `${a.campaign}:${a.content}`;
    variantSales[id] = variantSales[id] ?? { orders: 0, revenue: 0 };
    variantSales[id].orders++;
    variantSales[id].revenue += o.total;
  }
  const events = Object.fromEntries(top(rows, "e:", 50));
  const setting = await getItem<{ counts?: boolean }>(
    partition(siteId),
    "TRACKING#",
  );
  const tracking = !!setting && setting.counts !== false;
  return {
    days,
    from,
    to,
    currency,
    tracking,
    store: !!settings?.enabled,
    series,
    totals: {
      visitors: sum("visitors"),
      views: sum("views"),
      orders: sum("orders"),
      revenue: sum("revenue"),
    },
    pages: top(rows, "p:"),
    referrers: top(rows, "r:"),
    sources: top(rows, "s:"),
    mediums: top(rows, "m:"),
    campaigns: top(rows, "c:"),
    devices: top(rows, "d:"),
    countries: top(rows, "k:", 15),
    variants: top(rows, "t:", 40),
    variantSales,
    funnel: {
      visits: events["store.visit"] ?? 0,
      productViews: events["product.view"] ?? 0,
      carts: events["cart.created"] ?? 0,
      checkouts: events["checkout.started"] ?? 0,
      paid: events["order.paid"] ?? 0,
    },
    channels: [...channels.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20),
    abandoned: orders.filter(
      (o) => o.status === "cancelled" || (o.status === "pending" && o.expired),
    ).length,
  };
}
