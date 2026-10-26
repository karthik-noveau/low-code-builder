/**
 * Reads an app definition as the owner app needs it. Any app works:
 * - a "workflow" table has statuses and actions (the rewards app's
 *   Purchases — the Submissions page, with Approve / Reject);
 * - a "people" table is anything else (the rewards app's Customers — a
 *   list with a profile page per record).
 * For the rewards app every role is found, so pages read exactly like the
 * Dhanlaxmi owner app; for other apps the missing roles simply drop out.
 */
import {
  fieldOf,
  recordTitle,
  statusOf,
  tableOf,
  type App,
  type AppAction,
  type AppCard,
  type AppChart,
  type AppField,
  type AppList,
  type AppRecord,
  type AppStatus,
  type AppTable,
  type AppTotal,
} from "../apps/model";
import type { LinkTitles } from "../apps/api-types";

export interface Workflow {
  table: AppTable;
  /** The link to the person who sent it, e.g. Purchase → Customer. */
  person?: { table: AppTable; field: AppField };
  /** The figure a reward is limited by, e.g. the purchase amount. */
  amount?: AppField;
  /** The figure the owner sets when approving, e.g. the reward. */
  reward?: AppField;
  description?: AppField;
  approve?: AppAction;
  reject?: AppAction;
  /** Visitors add these with a form: they read as "submissions". */
  submitted: boolean;
  /** "submission" or the table's singular, lower case. */
  noun: string;
  waiting: AppStatus[];
  good: AppStatus[];
  bad: AppStatus[];
}
export interface People {
  table: AppTable;
  phone?: AppField;
  email?: AppField;
  address?: AppField;
  paused?: AppField;
  /** Workflow tables that link here, e.g. a customer's purchases. */
  workflows: { workflow: Workflow; field: AppField }[];
  /** e.g. Total reward; the first money total. */
  moneyTotal?: AppTotal;
  /** e.g. Total purchases: a money total summing the workflow's amount. */
  spentTotal?: AppTotal;
  /** e.g. Waiting for review: a count of waiting records. */
  waitingTotal?: AppTotal;
}
export interface OwnerModel {
  app: App;
  workflows: Workflow[];
  people: People[];
  /** Nav order: workflow tables first (they hold the queue), then the rest. */
  order: AppTable[];
  /** The table the topbar's "New …" button adds to. */
  primaryPeople?: People;
  primaryWorkflow?: Workflow;
}

const isWorkflow = (t: AppTable) =>
  t.statuses.length > 0 && t.actions.length > 0;

function workflowOf(app: App, table: AppTable): Workflow {
  const waiting = table.statuses.filter((s) => s.tone === "waiting");
  const good = table.statuses.filter((s) => s.tone === "good");
  const bad = table.statuses.filter((s) => s.tone === "bad");
  const fromWaiting = (a: AppAction) =>
    !waiting.length || a.from.some((id) => waiting.some((s) => s.id === id));
  const approve =
    table.actions.find(
      (a) => a.tone === "primary" && fromWaiting(a) && a.set.length,
    ) ?? table.actions.find((a) => a.tone === "primary" && fromWaiting(a));
  const reject = table.actions.find(
    (a) => a.tone === "danger" && fromWaiting(a),
  );
  const limit = approve?.limits[0];
  const reward =
    (limit && fieldOf(table, limit.field)) ||
    approve?.set
      .map((id) => fieldOf(table, id))
      .find((f) => f?.type === "money" || f?.type === "number");
  const setByActions = new Set(table.actions.flatMap((a) => a.set));
  const amount =
    (limit && fieldOf(table, limit.atMost)) ||
    table.fields.find((f) => f.type === "money" && !setByActions.has(f.id)) ||
    table.fields.find(
      (f) =>
        f.type === "items" || (f.type === "number" && !setByActions.has(f.id)),
    );
  const link = table.fields.find(
    (f) => f.type === "link" && f.table && tableOf(app, f.table),
  );
  const submitted = app.forms.some(
    (f) => f.kind === "submit" && f.table === table.id,
  );
  return {
    table,
    person: link
      ? { table: tableOf(app, link.table!)!, field: link }
      : undefined,
    amount,
    reward: reward ?? undefined,
    description:
      table.fields.find((f) => f.type === "longText") ??
      fieldOf(table, table.titleField),
    approve,
    reject,
    submitted,
    noun: submitted ? "submission" : table.singular.toLowerCase(),
    waiting,
    good,
    bad,
  };
}

export function ownerModel(app: App): OwnerModel {
  const workflows = app.tables
    .filter(isWorkflow)
    .map((t) => workflowOf(app, t));
  const people = app.tables
    .filter((t) => !isWorkflow(t))
    .map((table): People => {
      const links = workflows.flatMap((w) =>
        w.person?.table.id === table.id
          ? [{ workflow: w, field: w.person.field }]
          : [],
      );
      const main = links[0]?.workflow;
      const sums = (t: AppTotal, field?: AppField) =>
        !!field && t.op === "sum" && t.field === field.id;
      return {
        table,
        phone: table.fields.find((f) => f.type === "phone"),
        email: table.fields.find((f) => f.type === "email"),
        address: table.fields.find(
          (f) => f.type === "longText" && /address/i.test(f.name),
        ),
        paused: table.pausedField
          ? fieldOf(table, table.pausedField)
          : undefined,
        workflows: links,
        moneyTotal:
          table.totals.find((t) => sums(t, main?.reward)) ??
          table.totals.find((t) => t.money && t.op === "sum"),
        spentTotal: table.totals.find((t) => sums(t, main?.amount)),
        waitingTotal: table.totals.find(
          (t) =>
            t.op === "count" &&
            t.statuses.length > 0 &&
            t.statuses.every((id) => main?.waiting.some((s) => s.id === id)),
        ),
      };
    });
  const order = [
    ...workflows.map((w) => w.table),
    ...people.map((p) => p.table),
  ];
  return {
    app,
    workflows,
    people,
    order,
    primaryWorkflow: workflows[0],
    primaryPeople:
      people.find((p) => p.workflows.length) ??
      people.find((p) => p.table.private) ??
      people[0],
  };
}

export const workflowFor = (model: OwnerModel, tableId: string) =>
  model.workflows.find((w) => w.table.id === tableId);
export const peopleFor = (model: OwnerModel, tableId: string) =>
  model.people.find((p) => p.table.id === tableId);

/** "Waiting for review" reads "Pending" on tabs and badges, like the reference. */
export const statusLabel = (status: AppStatus | undefined, fallback = "") =>
  !status
    ? fallback
    : status.tone === "waiting" && /^waiting\b/i.test(status.name)
      ? "Pending"
      : status.name;
export const statusTone = (status: AppStatus | undefined) =>
  status?.tone === "waiting"
    ? "pending"
    : status?.tone === "good"
      ? "approved"
      : status?.tone === "bad"
        ? "rejected"
        : "neutral";

export const isWaiting = (w: Workflow, record: AppRecord) =>
  w.waiting.some((s) => s.id === record.status);
/** Actions offered from the record's status. */
export const actionsFor = (w: Workflow, record: AppRecord) =>
  w.table.actions.filter((a) => a.from.includes(record.status));

/** When the record reached its current status (approval time), else its creation. */
export function reachedAt(record: AppRecord) {
  for (let i = record.history.length - 1; i >= 0; i--)
    if (record.history[i].status === record.status) return record.history[i].at;
  return record.createdAt;
}
/** When the owner last acted on it, for the Reviewed column. */
export const reviewedAt = (record: AppRecord) =>
  record.history.length ? record.history[record.history.length - 1].at : "";

/* ---------- people ---------- */

export const isPaused = (p: People, record: AppRecord) =>
  !!p.paused && record.values[p.paused.id] === true;
export const personName = (table: AppTable, record: AppRecord) =>
  recordTitle(table, record);
/** Records of `workflow` that link to `person`. */
export const historyOf = (
  link: { workflow: Workflow; field: AppField },
  personId: string,
  records: AppRecord[],
) => records.filter((r) => String(r.values[link.field.id] ?? "") === personId);
export const countIn = (records: AppRecord[], statuses: AppStatus[]) =>
  records.filter((r) => statuses.some((s) => s.id === r.status)).length;

/* ---------- dashboard ---------- */

export type CardTone = "plain" | "accent" | "slate" | "dark";
/**
 * The card's colour: as set in the builder, else read from what it counts —
 * people white, a waiting queue burnt accent, approved sales slate, and a
 * figure the owner awards (a field set by an action) charcoal.
 */
export function cardTone(model: OwnerModel, card: AppCard): CardTone {
  if (card.tone) return card.tone;
  const table = tableOf(model.app, card.table);
  if (!table || !table.statuses.length) return "plain";
  const statuses = card.statuses
    .map((id) => statusOf(table, id))
    .filter((s): s is AppStatus => !!s);
  if (
    card.op === "count" &&
    statuses.length &&
    statuses.every((s) => s.tone === "waiting")
  )
    return "accent";
  if (card.op === "sum") {
    const awarded = table.actions.some((a) => a.set.includes(card.field ?? ""));
    return awarded ? "dark" : "slate";
  }
  return statuses.some((s) => s.tone === "good") ? "slate" : "plain";
}
export const cardIcon = (tone: CardTone) =>
  tone === "accent"
    ? "clock"
    : tone === "slate"
      ? "checkCircle"
      : tone === "dark"
        ? "wallet"
        : "users";

/** Charts as defined, else "<Reward> by month" from the charcoal money card. */
export function chartsOf(model: OwnerModel): AppChart[] {
  if (model.app.dashboard.charts) return model.app.dashboard.charts;
  const card = model.app.dashboard.cards.find(
    (c) => c.op === "sum" && cardTone(model, c) === "dark",
  );
  const table = card && tableOf(model.app, card.table);
  const field = card && table && fieldOf(table, card.field ?? "");
  if (!card || !field) return [];
  return [
    {
      id: `${card.id}-month`,
      name: `${field.name} by month`,
      table: card.table,
      op: "sum",
      field: card.field,
      statuses: card.statuses,
      money: card.money,
      months: 6,
    },
  ];
}
export interface ChartBar {
  key: string;
  label: string;
  long: string;
  value: number;
}
/** One bar per month, oldest first, counted by when records reached their status. */
export function chartBars(
  chart: AppChart,
  records: AppRecord[],
  now = new Date(),
): ChartBar[] {
  const months = Math.max(1, Math.min(24, chart.months || 6));
  const bars: ChartBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    bars.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
      long: d.toLocaleString("en-IN", { month: "long" }),
      value: 0,
    });
  }
  for (const r of records) {
    if (chart.statuses.length && !chart.statuses.includes(r.status)) continue;
    const at = new Date(chart.statuses.length ? reachedAt(r) : r.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    const bar = bars.find(
      (b) => b.key === `${at.getFullYear()}-${at.getMonth()}`,
    );
    if (!bar) continue;
    bar.value +=
      chart.op === "count" ? 1 : Number(r.values[chart.field ?? ""] ?? 0) || 0;
  }
  for (const b of bars) b.value = Math.round(b.value * 100) / 100;
  return bars;
}

/** A dashboard list that offers its records' next steps right in the list. */
export const isActionList = (model: OwnerModel, list: AppList) => {
  if (list.actions !== undefined) return list.actions;
  const w = workflowFor(model, list.table);
  return (
    !!w &&
    list.statuses.length > 0 &&
    list.statuses.every((id) => w.waiting.some((s) => s.id === id))
  );
};

/** Record id → title for every table, merged from every loaded list. */
export function mergeLinks(lists: (undefined | { links: LinkTitles })[]) {
  const merged: LinkTitles = {};
  for (const list of lists)
    for (const [tableId, titles] of Object.entries(list?.links ?? {}))
      merged[tableId] = { ...merged[tableId], ...titles };
  return merged;
}
