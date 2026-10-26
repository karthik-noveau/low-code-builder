/**
 * Business apps: the working part of a site. An owner describes tables of
 * records (customers, claims, tickets, members…), the steps a record moves
 * through, the totals that roll up from linked records, the forms visitors
 * use on the published site, and the dashboard the owner watches. One engine
 * builds a rewards scheme, a service desk, a punch card or a warranty register.
 *
 * The definition lives in the project (`project.app`) and is published with
 * the site; the records live in the backend. Shared by the editor, the owner's
 * app page, the published-site widget and the backend so all four agree.
 */

export type AppFieldType =
  | "text"
  | "longText"
  | "number"
  | "money"
  | "phone"
  | "email"
  | "date"
  | "choice"
  | "yesNo"
  /** Points at a record of another table (`table`). */
  | "link"
  /** One item of a site collection (`collection`), e.g. a service, event or role. */
  | "item"
  /**
   * Several items of a site collection with quantities: a cart, e.g. dishes
   * from a menu. The value is the priced total; the lines are on the record.
   */
  | "items";
export interface AppField {
  id: string;
  name: string;
  type: AppFieldType;
  required: boolean;
  /** Choices for a "choice" field. */
  options: string[];
  /** The table a "link" field points at. */
  table?: string;
  /** The site collection (Collection id) an "item" or "items" field chooses from. */
  collection?: string;
  /** No two records share a value (text, phone, email). Phone sign-ins rely on it. */
  unique?: boolean;
  /** Lowest allowed value for number and money (money is in whole currency units). */
  min?: number;
  max?: number;
  /** Filled by the owner while taking an action, never by visitors (e.g. a reward). */
  ownerOnly?: boolean;
  /** Help under the input, e.g. "The total on your bill, in rupees." */
  hint?: string;
  placeholder?: string;
  /** Text length limits (text and long text); long text shows a counter when set. */
  minLength?: number;
  maxLength?: number;
}
export type StatusTone = "neutral" | "waiting" | "good" | "bad";
export interface AppStatus {
  id: string;
  name: string;
  tone: StatusTone;
}
/** A check made when an action runs: `field` may not exceed `atMost` (another field). */
export interface AppLimit {
  field: string;
  atMost: string;
}
/**
 * Places that run out: records sharing the values of `group` compete for
 * `max` places (or, when `group[0]` is an item field and `maxField` is set,
 * the number in that field of the chosen collection item, e.g. an event's
 * seats). Each record takes 1 place, or the number in its `size` field (e.g.
 * guests). Only records in `statuses` hold places, so cancelling frees them.
 */
export interface AppCapacity {
  id: string;
  name: string;
  group: string[];
  max: number;
  maxField?: string;
  size?: string;
  statuses: string[];
  /** What visitors are told when it's full, e.g. "That time is fully booked." */
  message: string;
}
/** A step the owner takes on a record, e.g. Approve or Reject. */
export interface AppAction {
  id: string;
  name: string;
  /** Statuses the action is offered from. */
  from: string[];
  to: string;
  /** Fields the owner fills while taking it, each required for this action (e.g. the reward on Approve). */
  set: string[];
  /** Ask for a note; it's shown to the visitor on lookup pages (e.g. a rejection reason). */
  note: "none" | "optional" | "required";
  limits: AppLimit[];
  tone: "primary" | "danger";
  /** Email the visitor (the table's first email field) that their record moved on. */
  tellVisitor?: boolean;
}
/** A figure rolled up from linked records, e.g. a customer's total reward. */
export interface AppTotal {
  id: string;
  name: string;
  /** The table whose records are counted or summed. */
  table: string;
  /** The link field on that table pointing back at this one. */
  via: string;
  op: "count" | "sum";
  /** The number or money field summed (op "sum"). */
  field?: string;
  /** Only records in these statuses; empty counts every record. */
  statuses: string[];
  money?: boolean;
}
export interface AppTable {
  id: string;
  /** Plural, e.g. "Customers". */
  name: string;
  /** e.g. "Customer". */
  singular: string;
  fields: AppField[];
  /** The field that names a record in lists, e.g. the customer's name. */
  titleField: string;
  /** Empty means records have no workflow. */
  statuses: AppStatus[];
  /** Status new records start in. */
  initial: string;
  actions: AppAction[];
  totals: AppTotal[];
  /** Human references, e.g. "ESR" gives ESR-1001, ESR-1002… Empty for none. */
  prefix: string;
  /** Tell the owner (push and email) when a visitor adds a record. */
  notify: boolean;
  /**
   * A yes/no field that pauses a record: paused customers or members can't
   * identify themselves or look themselves up, but keep their history.
   */
  pausedField?: string;
  /** Limits on places, slots or seats. */
  capacity?: AppCapacity[];
  /** Owner-side only: records can't be added from the published site. */
  private?: boolean;
}
/**
 * A form on the published site, placed with an "app" section.
 * - submit: visitors add a record to `table`, optionally after identifying as
 *   a record of another table (e.g. type your phone, confirm "Is this you?").
 * - lookup: visitors type a unique value and see that record, its totals and
 *   its history (e.g. "My rewards").
 */
export interface AppForm {
  id: string;
  name: string;
  kind: "submit" | "lookup";
  table: string;
  /**
   * submit: who is submitting. Visitors type `field` (a unique field of
   * `table`), see `confirm` fields to check it's them, and the new record's
   * link field `link` points at the match. Unknown values are refused.
   */
  identify?: { table: string; field: string; link: string; confirm: string[] };
  /** submit: fields visitors fill. lookup: fields of the found record shown. */
  fields: string[];
  /**
   * lookup: what visitors type. A unique field shows that one record; a field
   * that isn't unique lists the visitor's records (e.g. "My bookings" by
   * phone); REF_KEY finds one record by its reference.
   */
  key?: string;
  /** lookup: a second field visitors must also type, and that must match (e.g. phone with a reference). */
  verify?: string;
  /** submit: ask visitors to pay the amount in this money or items field after sending. */
  payment?: { field: string };
  /** lookup: totals of the found record shown. */
  totals: string[];
  /** lookup: linked records shown as a history. */
  history?: { table: string; via: string; fields: string[] };
  title: string;
  intro: string;
  button: string;
  /** Shown after a successful submit, with the record's reference. */
  success: string;
  /**
   * submit with identify: show a step indicator with these three labels
   * (identify, confirm, details), e.g. ["Phone", "Confirm", "Purchase"].
   */
  steps?: [string, string, string];
  /** submit with identify: totals of the visitor's record shown on "Is this you?". */
  confirmTotals?: string[];
  /** lookup: the total shown as the big highlighted figure; the rest become tiles. */
  highlight?: string;
  /** lookup: show when the record was added, e.g. "customer since March 2025". */
  since?: boolean;
  /** Words for each part of the form; anything left out uses the defaults. */
  copy?: Partial<Record<FormCopyKey, string>>;
}
/** Parts of a form whose words the owner can change. */
export type FormCopyKey =
  | "identifyTitle"
  | "identifyIntro"
  | "confirmTitle"
  | "confirmIntro"
  | "fieldsTitle"
  | "fieldsIntro"
  | "doneTitle"
  | "historyTitle"
  | "emptyTitle"
  | "emptyBody"
  | "notFoundTitle"
  | "notFoundBody"
  | "pausedTitle"
  | "pausedBody"
  /** Can't reach the server (network down). */
  | "offlineTitle"
  | "offlineBody"
  /** A small line under the first step's button, e.g. "Nothing is stored on this device." */
  | "identifyNote"
  /** A note under the details step's button, e.g. who decides the reward. */
  | "fieldsNote"
  /** The badge on the success screen; the new record's status by default. */
  | "doneBadge";
export const FORM_COPY_KEYS: FormCopyKey[] = [
  "identifyTitle",
  "identifyIntro",
  "confirmTitle",
  "confirmIntro",
  "fieldsTitle",
  "fieldsIntro",
  "doneTitle",
  "historyTitle",
  "emptyTitle",
  "emptyBody",
  "notFoundTitle",
  "notFoundBody",
  "pausedTitle",
  "pausedBody",
  "offlineTitle",
  "offlineBody",
  "identifyNote",
  "fieldsNote",
  "doneBadge",
];
export interface AppCard {
  id: string;
  name: string;
  table: string;
  op: "count" | "sum";
  field?: string;
  statuses: string[];
  money?: boolean;
  /** Card colour on the owner's dashboard. */
  tone?: "plain" | "accent" | "slate" | "dark";
  /** A short line under the figure, e.g. "Waiting for you". */
  caption?: string;
  /** Its figure (a number only) may be shown on the website by a stat block. */
  public?: boolean;
}
/** A figure per month on the owner's dashboard, e.g. rewards approved by month. */
export interface AppChart {
  id: string;
  name: string;
  table: string;
  op: "count" | "sum";
  field?: string;
  statuses: string[];
  money?: boolean;
  /** How many months back, including this one. */
  months: number;
  /** Its monthly figures (numbers only) may be shown on the website by a chart block. */
  public?: boolean;
}
export interface AppList {
  id: string;
  name: string;
  table: string;
  /** A field or a total id of the table; largest/newest first. Empty sorts by newest. */
  sort: string;
  statuses: string[];
  limit: number;
  /** Offer the records' next steps (e.g. Approve / Reject) right in the list. */
  actions?: boolean;
}
/** A view's fixed condition on one field, set by the owner (visitors can't change it). */
export interface AppViewFilter {
  field: string;
  op: "is" | "not" | "contains" | "atLeast" | "atMost" | "set" | "empty";
  value: string;
}
/**
 * Records shown on the website ("Show on your website: these fields only").
 * Nothing in an app is public by default: a view names the only fields
 * visitors get, which records (statuses, a filter), in what order and how
 * many. Record ids and references are never sent. See src/blocks/data/views.ts.
 */
export interface AppView {
  id: string;
  name: string;
  table: string;
  /** The allow-list: field ids, total ids of the table, or VIEW_STATUS. */
  fields: string[];
  /** Text or link fields shown as a first name and initial, e.g. "Priya S." (leaderboards). */
  initials?: string[];
  /** Only records in these statuses; empty: every record. */
  statuses: string[];
  filter?: AppViewFilter;
  /** A field or total id; empty: newest first. */
  sort: string;
  order?: "desc" | "asc";
  /** The most records visitors can ever page through, 1–100. */
  limit: number;
  /** Off: the view is a draft and the public API refuses it. */
  public: boolean;
  /** The owner agreed to show phone numbers or email addresses. */
  contact?: boolean;
}
/** A view field meaning "the record's status". */
export const VIEW_STATUS = "status";
export const MAX_VIEWS = 12;
export const MAX_VIEW_LIMIT = 100;
export interface App {
  tables: AppTable[];
  forms: AppForm[];
  dashboard: { cards: AppCard[]; lists: AppList[]; charts?: AppChart[] };
  /** What the website may show of the records (data blocks). */
  views?: AppView[];
  /** Money is shown in this currency (ISO code, e.g. INR). */
  currency: string;
  /** The published site installs to a phone's home screen. */
  install: { enabled: boolean; name: string; shortName: string };
}

/** A lookup form's key meaning "the record's reference number". */
export const REF_KEY = "ref";
/** A collection item as app forms see it: what it's called and costs. */
export interface CatalogItem {
  slug: string;
  title: string;
  /** In whole currency units; null when the item has no price. */
  price: number | null;
  /** Number fields of the item by field id, e.g. seats (for capacity). */
  numbers?: Record<string, number>;
}
/** A priced line of an "item" or "items" field, snapshotted when sent. */
export interface AppLine {
  slug: string;
  title: string;
  price: number;
  quantity: number;
}
/** Payment asked for after a visitor sends a form. */
export interface AppPayment {
  amount: number;
  currency: string;
  status: "unpaid" | "paid";
  reference: string;
  checkout?: {
    provider: "stripe" | "razorpay";
    id: string;
    url: string;
    createdAt: string;
  };
  confirmedBy?: "provider" | "owner";
  paidAt?: string;
}
/** A record as stored and as the owner's app page sees it. */
export type AppValue = string | number | boolean;
export interface AppRecord {
  id: string;
  table: string;
  /** e.g. ESR-1042; empty when the table has no prefix. */
  ref: string;
  values: Record<string, AppValue>;
  /** Empty for tables without a workflow. */
  status: string;
  /** The last action's note, shown to the visitor on lookups. */
  note: string;
  history: {
    action: string;
    status: string;
    by: string;
    at: string;
    note?: string;
  }[];
  source: "owner" | "visitor";
  createdAt: string;
  updatedAt: string;
  revision: number;
  /** Chosen collection items by field id ("item" and "items" fields). */
  lines?: Record<string, AppLine[]>;
  payment?: AppPayment;
  /** Rolled-up totals by total id; computed on read, never stored. */
  totals?: Record<string, number>;
}

export const APP_FIELD_TYPES: Record<AppFieldType, string> = {
  text: "Text",
  longText: "Long text",
  number: "Number",
  money: "Money",
  phone: "Phone",
  email: "Email",
  date: "Date",
  choice: "Choice",
  yesNo: "Yes / no",
  link: "Link to another table",
  item: "Choose from a collection",
  items: "Order from a collection",
};
/** Most of one item a visitor can order, and most different items in one order. */
export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;
export const MAX_TABLES = 12;
export const MAX_APP_FIELDS = 30;
export const MAX_FORMS = 12;
/** Records per table: totals are computed on read, so this bounds a read. */
export const MAX_RECORDS = 5000;
/** Records visitors may add per site per UTC day. */
export const DAILY_SUBMISSIONS = 300;
/** Lookups per IP per minute; stops a lookup form enumerating a phone list. */
export const LOOKUPS_PER_MINUTE = 30;

const id = () => crypto.randomUUID().slice(0, 8);
export const appId = id;

export function emptyApp(name = "My app"): App {
  return {
    tables: [],
    forms: [],
    dashboard: { cards: [], lists: [] },
    currency: "INR",
    install: { enabled: false, name, shortName: name.slice(0, 12) },
  };
}
export function createAppField(
  name: string,
  type: AppFieldType,
  extra: Partial<AppField> = {},
): AppField {
  return { id: id(), name, type, required: false, options: [], ...extra };
}
export function createTable(name: string, singular: string): AppTable {
  const title = createAppField("Name", "text", { required: true });
  return {
    id: id(),
    name,
    singular,
    fields: [title],
    titleField: title.id,
    statuses: [],
    initial: "",
    actions: [],
    totals: [],
    prefix: "",
    notify: false,
  };
}

export const tableOf = (app: App, tableId: string) =>
  app.tables.find((t) => t.id === tableId);
export const fieldOf = (table: AppTable, fieldId: string) =>
  table.fields.find((f) => f.id === fieldId);
export const statusOf = (table: AppTable, statusId: string) =>
  table.statuses.find((s) => s.id === statusId);
export const recordTitle = (table: AppTable, record: AppRecord) =>
  String(record.values[table.titleField] ?? "") || record.ref || "Untitled";

/** Phones are kept as digits only, so "+91 98765-43210" and "9876543210" match. */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  // An Indian number typed with its country code still matches the ten digits.
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
/** What a visitor sees of a value on "Is this you?" and lookup pages. */
export function maskValue(field: AppField, value: AppValue | undefined) {
  const text = String(value ?? "");
  if (!text) return "";
  if (field.type === "phone") return `•••••${text.slice(-4)}`;
  if (field.type === "email") {
    const [user, domain] = text.split("@");
    return `${user.slice(0, 1)}•••@${domain}`;
  }
  return text;
}

const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Checks and cleans values for `fields` of a table. Money and numbers become
 * numbers (money keeps at most two decimals), phones become digits, yes/no
 * becomes a boolean. Returns the first problem in words a visitor understands.
 */
export function parseValues(
  table: AppTable,
  fields: string[],
  input: Record<string, unknown>,
  options: {
    partial?: boolean;
    /** The live items of a collection; item fields are refused without it. */
    catalog?: (collectionId: string) => CatalogItem[] | undefined;
  } = {},
):
  | {
      ok: true;
      values: Record<string, AppValue>;
      lines: Record<string, AppLine[]>;
    }
  | { ok: false; error: string; field: string } {
  const values: Record<string, AppValue> = {};
  const lines: Record<string, AppLine[]> = {};
  for (const fieldId of fields) {
    const field = fieldOf(table, fieldId);
    if (!field) continue;
    const raw = input[fieldId];
    if (options.partial && raw === undefined) continue;
    const fail = (error: string) =>
      ({ ok: false, error, field: fieldId }) as const;
    if (field.type === "yesNo") {
      values[fieldId] = raw === true || raw === "true" || raw === "on";
      continue;
    }
    if (field.type === "item" || field.type === "items") {
      const items = options.catalog?.(field.collection ?? "");
      // "items" arrives as { slug: quantity } (JSON) or "slug:2,slug:1" (a form post).
      const wanted: [string, number][] =
        field.type === "item"
          ? typeof raw === "string" && raw.trim()
            ? [[raw.trim(), 1]]
            : []
          : typeof raw === "string"
            ? raw
                .split(",")
                .filter(Boolean)
                .map((part) => {
                  const [slug, n] = part.split(":");
                  return [slug.trim(), Number(n ?? 1)] as [string, number];
                })
            : raw && typeof raw === "object" && !Array.isArray(raw)
              ? Object.entries(raw as Record<string, unknown>).map(
                  ([slug, n]) => [slug, Number(n)] as [string, number],
                )
              : [];
      const chosen = wanted.filter(([, n]) => n !== 0);
      if (!chosen.length) {
        if (field.required)
          return fail(
            field.type === "item"
              ? `Choose ${field.name.toLowerCase()}.`
              : "Add at least one item.",
          );
        continue;
      }
      if (!items) return fail(`${field.name} isn’t available right now.`);
      if (chosen.length > MAX_LINES) return fail("That’s too many items.");
      const picked: AppLine[] = [];
      for (const [slug, quantity] of chosen) {
        const item = items.find((i) => i.slug === slug);
        if (!item) return fail("Something you chose is no longer available.");
        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > MAX_QUANTITY
        )
          return fail(`Choose between 1 and ${MAX_QUANTITY} of ${item.title}.`);
        if (picked.some((l) => l.slug === slug)) continue;
        picked.push({
          slug,
          title: item.title,
          price: item.price ?? 0,
          quantity,
        });
      }
      lines[fieldId] = picked;
      values[fieldId] =
        field.type === "item"
          ? picked[0].slug
          : Math.round(
              picked.reduce((sum, l) => sum + l.price * 100 * l.quantity, 0),
            ) / 100;
      continue;
    }
    const text =
      typeof raw === "number"
        ? String(raw)
        : typeof raw === "string"
          ? raw.trim()
          : "";
    if (!text) {
      if (field.required) return fail(`Add ${field.name.toLowerCase()}.`);
      continue;
    }
    if (field.type === "number" || field.type === "money") {
      const n = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(n)) return fail(`${field.name} must be a number.`);
      if (field.type === "money" && Math.round(n * 100) !== n * 100)
        return fail(`${field.name} can have at most two decimals.`);
      if (field.type === "number" && !Number.isInteger(n))
        return fail(`${field.name} must be a whole number.`);
      if (field.min !== undefined && n < field.min)
        return fail(`${field.name} must be at least ${field.min}.`);
      if (field.max !== undefined && n > field.max)
        return fail(`${field.name} can be at most ${field.max}.`);
      values[fieldId] = n;
      continue;
    }
    if (text.length > (field.type === "longText" ? 2000 : 200))
      return fail(`${field.name} is too long.`);
    if (field.maxLength !== undefined && text.length > field.maxLength)
      return fail(
        `${field.name} can be at most ${field.maxLength} characters.`,
      );
    if (field.minLength !== undefined && text.length < field.minLength)
      return fail(
        `${field.name} needs at least ${field.minLength} characters.`,
      );
    if (field.type === "phone") {
      const digits = normalizePhone(text);
      if (digits.length < 7 || digits.length > 15)
        return fail("Add a valid phone number.");
      values[fieldId] = digits;
    } else if (field.type === "email") {
      if (!emailPattern.test(text)) return fail("Add a valid email address.");
      values[fieldId] = text.toLowerCase();
    } else if (field.type === "date") {
      if (!datePattern.test(text) || Number.isNaN(Date.parse(text)))
        return fail(`${field.name} must be a date.`);
      values[fieldId] = text;
    } else if (field.type === "choice") {
      if (!field.options.includes(text))
        return fail(
          `Choose one of the options for ${field.name.toLowerCase()}.`,
        );
      values[fieldId] = text;
    } else values[fieldId] = text;
  }
  return { ok: true, values, lines };
}
/** Checks an action's limits against a record's values after the owner's input. */
export function checkLimits(
  table: AppTable,
  action: AppAction,
  values: Record<string, AppValue>,
) {
  for (const limit of action.limits) {
    const value = Number(values[limit.field] ?? 0);
    const most = Number(values[limit.atMost] ?? 0);
    if (value > most) {
      const a = fieldOf(table, limit.field)?.name ?? "This value";
      const b = fieldOf(table, limit.atMost)?.name.toLowerCase() ?? "the limit";
      return `${a} can't be more than the ${b}.`;
    }
  }
  return "";
}
/** Rolls up a table's totals for each of its records from linked records. */
export function computeTotals(
  app: App,
  table: AppTable,
  records: AppRecord[],
  linked: (tableId: string) => AppRecord[],
) {
  for (const record of records) record.totals = {};
  for (const total of table.totals) {
    const sums = new Map<string, number>();
    for (const child of linked(total.table)) {
      if (total.statuses.length && !total.statuses.includes(child.status))
        continue;
      const parent = String(child.values[total.via] ?? "");
      if (!parent) continue;
      const add =
        total.op === "count" ? 1 : Number(child.values[total.field ?? ""] ?? 0);
      sums.set(
        parent,
        (sums.get(parent) ?? 0) + (Number.isFinite(add) ? add : 0),
      );
    }
    for (const record of records)
      record.totals![total.id] =
        Math.round((sums.get(record.id) ?? 0) * 100) / 100;
  }
  void app;
  return records;
}
/** A dashboard card's figure. */
export function cardValue(card: AppCard, records: AppRecord[]) {
  let value = 0;
  for (const r of records) {
    if (card.statuses.length && !card.statuses.includes(r.status)) continue;
    value +=
      card.op === "count" ? 1 : Number(r.values[card.field ?? ""] ?? 0) || 0;
  }
  return Math.round(value * 100) / 100;
}
/** Money with Indian grouping for INR (₹8,62,300), whole units or two decimals. */
export function formatMoney(value: number, currency: string) {
  const locale = currency === "INR" ? "en-IN" : "en";
  const whole = Number.isInteger(value);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(whole ? 0 : 2)}`;
  }
}
export function formatAppValue(
  app: App,
  field: AppField,
  value: AppValue | undefined,
  linkTitle?: (tableId: string, recordId: string) => string,
  lines?: AppLine[],
) {
  if (value === undefined || value === "") return "";
  if (field.type === "item") return lines?.[0]?.title ?? String(value);
  if (field.type === "items") return formatMoney(Number(value), app.currency);
  if (field.type === "money") return formatMoney(Number(value), app.currency);
  if (field.type === "yesNo") return value ? "Yes" : "No";
  if (field.type === "link" && field.table && linkTitle)
    return linkTitle(field.table, String(value));
  if (field.type === "date")
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return String(value);
}

const str = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;
const strs = (v: unknown) =>
  Array.isArray(v) && v.length <= 60 && v.every((x) => str(x));
const idOk = (v: unknown) =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
/** "2 × Paneer tikka, 1 × Naan" */
export const describeLines = (lines: AppLine[] = []) =>
  lines.map((l) => `${l.quantity} × ${l.title}`).join(", ");
/** Places a record takes under a capacity rule. */
export const placesTaken = (
  capacity: AppCapacity,
  values: Record<string, AppValue>,
) => {
  if (!capacity.size) return 1;
  const n = Number(values[capacity.size] ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
};
/**
 * Structural check of a project's app; references between parts are checked
 * too. `collections` are the project's collection ids, when known.
 */
export function validateApp(
  value: unknown,
  collections?: string[],
): value is App {
  const a = value as App;
  if (
    !a ||
    typeof a !== "object" ||
    !Array.isArray(a.tables) ||
    !Array.isArray(a.forms)
  )
    return false;
  if (a.tables.length > MAX_TABLES || a.forms.length > MAX_FORMS) return false;
  if (
    !str(a.currency, 8) ||
    !a.install ||
    typeof a.install.enabled !== "boolean"
  )
    return false;
  if (!str(a.install.name, 60) || !str(a.install.shortName, 20)) return false;
  const tables = new Map(a.tables.map((t) => [t.id, t]));
  for (const t of a.tables) {
    if (
      !idOk(t.id) ||
      !str(t.name, 60) ||
      !str(t.singular, 60) ||
      !str(t.prefix, 8)
    )
      return false;
    if (
      !Array.isArray(t.fields) ||
      t.fields.length < 1 ||
      t.fields.length > MAX_APP_FIELDS
    )
      return false;
    for (const f of t.fields) {
      if (!idOk(f.id) || !str(f.name, 60) || !(f.type in APP_FIELD_TYPES))
        return false;
      if (typeof f.required !== "boolean" || !strs(f.options)) return false;
      if (f.type === "link" && !(f.table && tables.has(f.table))) return false;
      if (
        (f.type === "item" || f.type === "items") &&
        !(
          typeof f.collection === "string" &&
          f.collection &&
          (!collections || collections.includes(f.collection))
        )
      )
        return false;
      for (const n of [f.min, f.max])
        if (n !== undefined && !Number.isFinite(n)) return false;
      for (const n of [f.minLength, f.maxLength])
        if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 2000))
          return false;
      if (
        (f.hint !== undefined && !str(f.hint, 200)) ||
        (f.placeholder !== undefined && !str(f.placeholder, 100))
      )
        return false;
    }
    if (!fieldOf(t, t.titleField)) return false;
    if (
      t.pausedField !== undefined &&
      fieldOf(t, t.pausedField)?.type !== "yesNo"
    )
      return false;
    if (!Array.isArray(t.statuses) || t.statuses.length > 12) return false;
    for (const s of t.statuses)
      if (
        !idOk(s.id) ||
        !str(s.name, 40) ||
        !["neutral", "waiting", "good", "bad"].includes(s.tone)
      )
        return false;
    if (t.statuses.length && !statusOf(t, t.initial)) return false;
    if (!Array.isArray(t.actions) || t.actions.length > 12) return false;
    for (const action of t.actions) {
      if (!idOk(action.id) || !str(action.name, 40) || !statusOf(t, action.to))
        return false;
      if (!action.from.every((s) => statusOf(t, s))) return false;
      if (!action.set.every((f) => fieldOf(t, f))) return false;
      if (!["none", "optional", "required"].includes(action.note)) return false;
      if (
        !action.limits.every((l) => fieldOf(t, l.field) && fieldOf(t, l.atMost))
      )
        return false;
    }
    if (t.capacity !== undefined) {
      if (!Array.isArray(t.capacity) || t.capacity.length > 6) return false;
      for (const c of t.capacity) {
        if (!idOk(c.id) || !str(c.name, 60) || !str(c.message, 200))
          return false;
        if (!Array.isArray(c.group) || !c.group.length || c.group.length > 4)
          return false;
        if (!c.group.every((g) => fieldOf(t, g))) return false;
        if (!Number.isInteger(c.max) || c.max < 0 || c.max > 100000)
          return false;
        if (c.maxField !== undefined && fieldOf(t, c.group[0])?.type !== "item")
          return false;
        if (c.size !== undefined && fieldOf(t, c.size)?.type !== "number")
          return false;
        if (!c.statuses.every((s) => statusOf(t, s))) return false;
      }
    }
    if (!Array.isArray(t.totals) || t.totals.length > 12) return false;
    for (const total of t.totals) {
      const child = tables.get(total.table);
      if (!idOk(total.id) || !str(total.name, 60) || !child) return false;
      const via = fieldOf(child, total.via);
      if (via?.type !== "link" || via.table !== t.id) return false;
      if (total.op === "sum" && !fieldOf(child, total.field ?? ""))
        return false;
    }
  }
  for (const f of a.forms) {
    const t = tables.get(f.table);
    if (
      !idOk(f.id) ||
      !str(f.name, 60) ||
      !t ||
      !["submit", "lookup"].includes(f.kind)
    )
      return false;
    if (
      ![f.title, f.button, f.success].every((x) => str(x)) ||
      !str(f.intro, 600)
    )
      return false;
    if (
      !f.fields.every((x) => fieldOf(t, x)) ||
      !f.totals.every((x) => t.totals.some((y) => y.id === x))
    )
      return false;
    if (f.kind === "lookup" && f.key !== REF_KEY && !fieldOf(t, f.key ?? ""))
      return false;
    if (f.kind === "lookup" && f.key === REF_KEY && !t.prefix) return false;
    if (f.verify !== undefined && !fieldOf(t, f.verify)) return false;
    if (f.payment) {
      const paid = fieldOf(t, f.payment.field);
      if (
        f.kind !== "submit" ||
        !(paid?.type === "money" || paid?.type === "items")
      )
        return false;
    }
    if (f.identify) {
      const parent = tables.get(f.identify.table);
      if (!parent || !fieldOf(parent, f.identify.field)?.unique) return false;
      if (fieldOf(t, f.identify.link)?.table !== parent.id) return false;
      if (!f.identify.confirm.every((x) => fieldOf(parent, x))) return false;
    }
    if (f.history) {
      const h = tables.get(f.history.table);
      if (!h || fieldOf(h, f.history.via)?.table !== t.id) return false;
      if (!f.history.fields.every((x) => fieldOf(h, x))) return false;
    }
  }
  for (const f of a.forms) {
    const t = tables.get(f.table)!;
    if (
      f.steps !== undefined &&
      !(
        Array.isArray(f.steps) &&
        f.steps.length === 3 &&
        f.steps.every((x) => str(x, 30))
      )
    )
      return false;
    if (
      f.highlight !== undefined &&
      !t.totals.some((x) => x.id === f.highlight)
    )
      return false;
    if (f.since !== undefined && typeof f.since !== "boolean") return false;
    if (f.confirmTotals !== undefined) {
      const parent = f.identify && tables.get(f.identify.table);
      if (
        !parent ||
        !f.confirmTotals.every((x) => parent.totals.some((y) => y.id === x))
      )
        return false;
    }
    if (f.copy !== undefined) {
      if (!f.copy || typeof f.copy !== "object") return false;
      for (const [k, v] of Object.entries(f.copy))
        if (!(FORM_COPY_KEYS as string[]).includes(k) || !str(v, 300))
          return false;
    }
  }
  if (a.views !== undefined && !viewsValid(a.views, tables)) return false;
  const d = a.dashboard;
  if (!d || !Array.isArray(d.cards) || !Array.isArray(d.lists)) return false;
  if (d.charts !== undefined) {
    if (!Array.isArray(d.charts) || d.charts.length > 6) return false;
    for (const c of d.charts)
      if (
        !idOk(c.id) ||
        !str(c.name, 60) ||
        !tables.has(c.table) ||
        !Number.isInteger(c.months) ||
        c.months < 1 ||
        c.months > 24
      )
        return false;
  }
  for (const c of [...d.cards, ...(d.charts ?? [])])
    if (c.public !== undefined && typeof c.public !== "boolean") return false;
  for (const c of d.cards)
    if (
      (c.tone !== undefined &&
        !["plain", "accent", "slate", "dark"].includes(c.tone)) ||
      (c.caption !== undefined && !str(c.caption, 80))
    )
      return false;
  if (
    !d.cards.every((c) => idOk(c.id) && str(c.name, 60) && tables.has(c.table))
  )
    return false;
  if (
    !d.lists.every(
      (l) =>
        idOk(l.id) &&
        str(l.name, 60) &&
        tables.has(l.table) &&
        Number.isInteger(l.limit) &&
        l.limit >= 1 &&
        l.limit <= 50,
    )
  )
    return false;
  return true;
}

/** Field types that reach a person: shown publicly only with `contact`. */
export const CONTACT_TYPES: AppFieldType[] = ["phone", "email"];
/**
 * Whether a view field shows a phone number or email: a contact field, or a
 * link whose target is named by one (the link shows the target's title).
 */
export function showsContact(
  table: AppTable,
  fieldId: string,
  tables: Map<string, AppTable>,
) {
  const field = fieldOf(table, fieldId);
  if (!field) return false;
  if (CONTACT_TYPES.includes(field.type)) return true;
  const target =
    field.type === "link" ? tables.get(field.table ?? "") : undefined;
  return (
    !!target &&
    CONTACT_TYPES.includes(fieldOf(target, target.titleField)?.type ?? "text")
  );
}
const VIEW_OPS = ["is", "not", "contains", "atLeast", "atMost", "set", "empty"];
/**
 * Views: the allow-list names only fields, totals or the status of the
 * view's table, at most 12; phone and email fields need `contact`.
 */
function viewsValid(views: unknown, tables: Map<string, AppTable>) {
  if (!Array.isArray(views) || views.length > MAX_VIEWS) return false;
  const ids = new Set<string>();
  for (const v of views as AppView[]) {
    if (!v || typeof v !== "object" || !idOk(v.id) || ids.has(v.id))
      return false;
    ids.add(v.id);
    const t = tables.get(v.table);
    if (!t || !str(v.name, 60) || typeof v.public !== "boolean") return false;
    if (v.contact !== undefined && typeof v.contact !== "boolean") return false;
    const known = (id: string) =>
      id === VIEW_STATUS
        ? t.statuses.length > 0
        : !!fieldOf(t, id) || t.totals.some((x) => x.id === id);
    if (
      !Array.isArray(v.fields) ||
      !v.fields.length ||
      v.fields.length > 12 ||
      new Set(v.fields).size !== v.fields.length ||
      !v.fields.every((f) => idOk(f) && known(f))
    )
      return false;
    if (!v.contact && v.fields.some((f) => showsContact(t, f, tables)))
      return false;
    if (
      v.initials !== undefined &&
      !(
        Array.isArray(v.initials) &&
        v.initials.every(
          (f) =>
            v.fields.includes(f) &&
            ["text", "link"].includes(fieldOf(t, f)?.type ?? ""),
        )
      )
    )
      return false;
    if (!Array.isArray(v.statuses) || !v.statuses.every((s) => statusOf(t, s)))
      return false;
    if (v.filter !== undefined) {
      const f = v.filter;
      if (
        !f ||
        !(f.field === VIEW_STATUS ? t.statuses.length : fieldOf(t, f.field)) ||
        !VIEW_OPS.includes(f.op) ||
        !str(f.value, 120)
      )
        return false;
    }
    if (typeof v.sort !== "string" || (v.sort && !known(v.sort))) return false;
    if (v.order !== undefined && !["asc", "desc"].includes(v.order))
      return false;
    if (!Number.isInteger(v.limit) || v.limit < 1 || v.limit > MAX_VIEW_LIMIT)
      return false;
  }
  return true;
}
