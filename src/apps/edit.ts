/**
 * Safe edits to a business app. Every helper returns a new App that still
 * passes validateApp: removing or changing something other parts depend on
 * either cleans those parts up (and says so in plain words first, through the
 * matching `…Check`) or is refused with the reason.
 */
import {
  appId,
  createAppField,
  createTable,
  fieldOf,
  formatMoney,
  statusOf,
  tableOf,
  MAX_APP_FIELDS,
  MAX_FORMS,
  MAX_TABLES,
  REF_KEY,
  type App,
  type AppAction,
  type AppCapacity,
  type AppCard,
  type AppField,
  type AppFieldType,
  type AppForm,
  type AppList,
  type AppStatus,
  type AppTable,
  type AppTotal,
} from "./model";

/** What an edit would do: `blocked` reasons stop it; `cleaned` are side effects to confirm. */
export interface Check {
  blocked: string[];
  cleaned: string[];
}
const quote = (name: string) => `“${name || "Untitled"}”`;
const lower = (name: string) => name.toLowerCase();

/** Only these types can be unique (and so be typed by visitors to find a record). */
export const canBeUnique = (type: AppFieldType) =>
  type === "text" || type === "phone" || type === "email";
/** Fields holding a figure that can be added up or limited (an order's total is one). */
export const isNumeric = (type: AppFieldType) =>
  type === "number" || type === "money" || type === "items";
/** Fields with a lowest and highest allowed value. */
export const hasRange = (type: AppFieldType) =>
  type === "number" || type === "money";
/** Fields that choose from a site collection. */
export const isCatalog = (type: AppFieldType) =>
  type === "item" || type === "items";
/** Fields visitors can be asked to pay: an amount, or an order's total. */
export const canPay = (type: AppFieldType) =>
  type === "money" || type === "items";
/** Fields places can be counted per, e.g. a date, a time slot or an event. */
export const canGroup = (type: AppFieldType) =>
  type === "item" ||
  type === "date" ||
  type === "choice" ||
  type === "text" ||
  type === "number" ||
  type === "yesNo";
/** Fields visitors can fill on a submit form: not the owner's, not links. */
export const visitorFields = (table: AppTable) =>
  table.fields.filter((f) => !f.ownerOnly && f.type !== "link");
export const uniqueFields = (table: AppTable) =>
  table.fields.filter((f) => f.unique && canBeUnique(f.type));
export const numericFields = (table: AppTable) =>
  table.fields.filter((f) => isNumeric(f.type));
/** Link fields of other tables (or this one) pointing at `tableId`. */
export function linksTo(app: App, tableId: string) {
  return app.tables.flatMap((table) =>
    table.fields
      .filter((f) => f.type === "link" && f.table === tableId)
      .map((field) => ({ table, field })),
  );
}

function mapTable(app: App, tableId: string, fn: (t: AppTable) => AppTable) {
  return {
    ...app,
    tables: app.tables.map((t) => (t.id === tableId ? fn(t) : t)),
  };
}
/** `{ capacity }` when there is any, for spreading into a table. */
const withCapacity = (capacity: AppCapacity[] | undefined) =>
  capacity ? { capacity } : {};
/** One form changed by `fn`; the same app when `fn` changes nothing, so refusals are visible. */
function mapForm(app: App, formId: string, fn: (f: AppForm) => AppForm): App {
  const form = app.forms.find((f) => f.id === formId);
  const next = form && fn(form);
  return !form || next === form
    ? app
    : { ...app, forms: app.forms.map((f) => (f.id === formId ? next! : f)) };
}
function mapForms(app: App, fn: (f: AppForm) => AppForm | null): App {
  return {
    ...app,
    forms: app.forms.map(fn).filter((f): f is AppForm => !!f),
  };
}
/** Removes totals and everything that shows or sorts by them. */
function dropTotals(app: App, ids: string[]): App {
  if (!ids.length) return app;
  const gone = new Set(ids);
  return {
    ...mapForms(app, (f) => {
      const next = { ...f, totals: f.totals.filter((t) => !gone.has(t)) };
      if (f.confirmTotals) {
        const kept = f.confirmTotals.filter((t) => !gone.has(t));
        if (kept.length) next.confirmTotals = kept;
        else delete next.confirmTotals;
      }
      if (f.highlight && gone.has(f.highlight)) delete next.highlight;
      return next;
    }),
    tables: app.tables.map((t) => ({
      ...t,
      totals: t.totals.filter((x) => !gone.has(x.id)),
    })),
    dashboard: {
      ...app.dashboard,
      lists: app.dashboard.lists.map((l) =>
        gone.has(l.sort) ? { ...l, sort: "" } : l,
      ),
    },
  };
}
const allTotals = (app: App) =>
  app.tables.flatMap((t) => t.totals.map((total) => ({ owner: t, total })));

/** Forms that need this field to be unique (lookups by it, sign-ins with it). */
export function uniqueNeededBy(app: App, tableId: string, fieldId: string) {
  const reasons: string[] = [];
  for (const f of app.forms) {
    if (f.kind === "lookup" && f.table === tableId && f.key === fieldId)
      reasons.push(`${quote(f.name)} finds records by it.`);
    if (f.identify?.table === tableId && f.identify.field === fieldId)
      reasons.push(
        `${quote(f.name)} asks visitors for it to know who they are.`,
      );
  }
  return reasons;
}
/** Parts that rely on a link field pointing where it points. */
function linkNeededBy(app: App, tableId: string, fieldId: string) {
  const reasons: string[] = [];
  for (const f of app.forms)
    if (f.identify && f.table === tableId && f.identify.link === fieldId)
      reasons.push(
        `${quote(f.name)} uses it to connect each new record to the visitor.`,
      );
  return reasons;
}

/**
 * What a field leaving (`type` null) or changing type does to its table's
 * places-that-run-out limits: the new limits, and what changed in words.
 */
function capacityAfter(
  table: AppTable,
  fieldId: string,
  type: AppFieldType | null,
): { capacity: AppCapacity[] | undefined; cleaned: string[] } {
  if (!table.capacity) return { capacity: undefined, cleaned: [] };
  const name = lower(fieldOf(table, fieldId)?.name ?? "it");
  const typeOf = (id: string) =>
    id === fieldId ? type : (fieldOf(table, id)?.type ?? null);
  const cleaned: string[] = [];
  const capacity: AppCapacity[] = [];
  for (const c of table.capacity) {
    const next: AppCapacity = { ...c };
    const leaves =
      c.group.includes(fieldId) && (type === null || !canGroup(type));
    if (leaves) {
      if (c.group.length === 1) {
        cleaned.push(`The limit ${quote(c.name)} will be removed.`);
        continue;
      }
      next.group = c.group.filter((g) => g !== fieldId);
      cleaned.push(
        `The limit ${quote(c.name)} will stop counting per ${name}.`,
      );
    }
    if (next.maxField !== undefined && typeOf(next.group[0]) !== "item") {
      delete next.maxField;
      cleaned.push(
        `The limit ${quote(c.name)} will allow ${c.max} instead of each item’s own number.`,
      );
    }
    if (c.size === fieldId && type !== "number") {
      delete next.size;
      cleaned.push(
        `The limit ${quote(c.name)} will count each one as one place.`,
      );
    }
    capacity.push(next);
  }
  return { capacity, cleaned };
}
/** Forms of `tableId` that pay with or check a field, and what happens to them. */
function formUsesCleaned(
  app: App,
  tableId: string,
  fieldId: string,
  type: AppFieldType | null,
) {
  const cleaned: string[] = [];
  for (const f of app.forms) {
    if (f.table !== tableId) continue;
    if (f.verify === fieldId && type === null)
      cleaned.push(
        `${quote(f.name)} will stop asking for it to check it’s them.`,
      );
    if (f.payment?.field === fieldId && (type === null || !canPay(type)))
      cleaned.push(`${quote(f.name)} will stop asking visitors to pay.`);
  }
  return cleaned;
}
function dropFormUses(
  app: App,
  tableId: string,
  fieldId: string,
  type: AppFieldType | null,
): App {
  return mapForms(app, (f) => {
    if (f.table !== tableId) return f;
    const form = { ...f };
    if (f.verify === fieldId && type === null) delete form.verify;
    if (f.payment?.field === fieldId && (type === null || !canPay(type)))
      delete form.payment;
    return form;
  });
}

// ── Fields ──────────────────────────────────────────────────────────────────

export function removeFieldCheck(
  app: App,
  tableId: string,
  fieldId: string,
): Check {
  const table = tableOf(app, tableId);
  const field = table && fieldOf(table, fieldId);
  if (!table || !field) return { blocked: [], cleaned: [] };
  const blocked = [
    ...(table.fields.length === 1 ? ["A table needs at least one field."] : []),
    ...(table.titleField === fieldId
      ? [
          `It names each ${lower(table.singular)} in lists. Choose another title field first.`,
        ]
      : []),
    ...uniqueNeededBy(app, tableId, fieldId),
    ...linkNeededBy(app, tableId, fieldId),
  ];
  const cleaned: string[] = [];
  for (const f of app.forms) {
    if (f.table === tableId && f.fields.includes(fieldId))
      cleaned.push(
        f.kind === "submit"
          ? `${quote(f.name)} will stop asking for it.`
          : `${quote(f.name)} will stop showing it.`,
      );
    if (f.identify?.table === tableId && f.identify.confirm.includes(fieldId))
      cleaned.push(`${quote(f.name)} will stop showing it on “Is this you?”.`);
    if (f.history?.table === tableId) {
      if (f.history.via === fieldId)
        cleaned.push(`${quote(f.name)} will stop showing a history.`);
      else if (f.history.fields.includes(fieldId))
        cleaned.push(`${quote(f.name)} will stop showing it in the history.`);
    }
  }
  for (const a of table.actions) {
    if (a.set.includes(fieldId))
      cleaned.push(`${quote(a.name)} will stop asking you for it.`);
    if (a.limits.some((l) => l.field === fieldId || l.atMost === fieldId))
      cleaned.push(`The limit on ${quote(a.name)} will be removed.`);
  }
  for (const { total } of allTotals(app))
    if (
      total.table === tableId &&
      (total.via === fieldId || total.field === fieldId)
    )
      cleaned.push(`The total ${quote(total.name)} will be removed.`);
  for (const c of app.dashboard.cards)
    if (c.table === tableId && c.op === "sum" && c.field === fieldId)
      cleaned.push(`The dashboard figure ${quote(c.name)} will be removed.`);
  for (const l of app.dashboard.lists)
    if (l.table === tableId && l.sort === fieldId)
      cleaned.push(`${quote(l.name)} will list the newest first instead.`);
  cleaned.push(
    ...capacityAfter(table, fieldId, null).cleaned,
    ...formUsesCleaned(app, tableId, fieldId, null),
  );
  return { blocked, cleaned };
}

export function removeField(app: App, tableId: string, fieldId: string): App {
  if (removeFieldCheck(app, tableId, fieldId).blocked.length) return app;
  const goneTotals = allTotals(app)
    .filter(
      ({ total }) =>
        total.table === tableId &&
        (total.via === fieldId || total.field === fieldId),
    )
    .map(({ total }) => total.id);
  let next = dropTotals(app, goneTotals);
  next = dropFormUses(next, tableId, fieldId, null);
  next = mapTable(next, tableId, (t) => ({
    ...t,
    ...withCapacity(capacityAfter(t, fieldId, null).capacity),
    pausedField: t.pausedField === fieldId ? undefined : t.pausedField,
    fields: t.fields.filter((f) => f.id !== fieldId),
    actions: t.actions.map((a) => ({
      ...a,
      set: a.set.filter((f) => f !== fieldId),
      limits: a.limits.filter(
        (l) => l.field !== fieldId && l.atMost !== fieldId,
      ),
    })),
  }));
  next = mapForms(next, (f) => {
    const form = { ...f };
    if (f.table === tableId)
      form.fields = f.fields.filter((x) => x !== fieldId);
    if (f.identify?.table === tableId)
      form.identify = {
        ...f.identify,
        confirm: f.identify.confirm.filter((x) => x !== fieldId),
      };
    if (f.history?.table === tableId) {
      if (f.history.via === fieldId) delete form.history;
      else
        form.history = {
          ...f.history,
          fields: f.history.fields.filter((x) => x !== fieldId),
        };
    }
    return form;
  });
  return {
    ...next,
    dashboard: {
      cards: next.dashboard.cards.filter(
        (c) => !(c.table === tableId && c.op === "sum" && c.field === fieldId),
      ),
      lists: next.dashboard.lists.map((l) =>
        l.table === tableId && l.sort === fieldId ? { ...l, sort: "" } : l,
      ),
    },
  };
}

export function addField(
  app: App,
  tableId: string,
  type: AppFieldType = "text",
  name = "New field",
): App {
  const table = tableOf(app, tableId);
  if (!table || table.fields.length >= MAX_APP_FIELDS) return app;
  const field = createAppField(name, type);
  return mapTable(app, tableId, (t) => ({
    ...t,
    fields: [...t.fields, shapeField(app, t, field, type)],
  }));
}

export function updateField(
  app: App,
  tableId: string,
  fieldId: string,
  values: Partial<
    Pick<
      AppField,
      | "name"
      | "required"
      | "options"
      | "min"
      | "max"
      | "hint"
      | "placeholder"
      | "minLength"
      | "maxLength"
    >
  >,
): App {
  return mapTable(app, tableId, (t) => ({
    ...t,
    fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...values } : f)),
  }));
}

export function moveField(
  app: App,
  tableId: string,
  fieldId: string,
  offset: number,
): App {
  return mapTable(app, tableId, (t) => {
    const from = t.fields.findIndex((f) => f.id === fieldId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= t.fields.length) return t;
    const fields = [...t.fields];
    const [f] = fields.splice(from, 1);
    fields.splice(to, 0, f);
    return { ...t, fields };
  });
}

/** Gives a field the settings its type needs (a link target, no stray limits…). */
function shapeField(
  app: App,
  table: AppTable,
  field: AppField,
  type: AppFieldType,
  collection?: string,
): AppField {
  const next: AppField = { ...field, type };
  if (!canBeUnique(type)) delete next.unique;
  if (!hasRange(type)) {
    delete next.min;
    delete next.max;
  }
  if (isCatalog(type)) next.collection = collection ?? field.collection;
  else delete next.collection;
  if (type !== "choice") next.options = [];
  else if (!next.options.length) next.options = ["Option 1", "Option 2"];
  if (type === "link") {
    if (!next.table || !tableOf(app, next.table))
      next.table = app.tables.find((t) => t.id !== table.id)?.id ?? table.id;
  } else delete next.table;
  return next;
}

export function changeFieldTypeCheck(
  app: App,
  tableId: string,
  fieldId: string,
  type: AppFieldType,
  collection?: string,
): Check {
  const table = tableOf(app, tableId);
  const field = table && fieldOf(table, fieldId);
  if (!table || !field || field.type === type)
    return { blocked: [], cleaned: [] };
  const blocked: string[] = [];
  if (isCatalog(type) && !(collection || field.collection))
    blocked.push(
      "Choose the collection it picks from, like your menu or services.",
    );
  if (!canBeUnique(type))
    blocked.push(...uniqueNeededBy(app, tableId, fieldId));
  if (field.type === "link") {
    blocked.push(...linkNeededBy(app, tableId, fieldId));
    for (const { owner, total } of allTotals(app))
      if (total.table === tableId && total.via === fieldId)
        blocked.push(
          `The total ${quote(total.name)} on ${owner.name} adds up through it.`,
        );
    for (const f of app.forms)
      if (f.history?.table === tableId && f.history.via === fieldId)
        blocked.push(`${quote(f.name)} shows a history through it.`);
  }
  const cleaned: string[] = [];
  if (!isNumeric(type)) {
    for (const { total } of allTotals(app))
      if (total.table === tableId && total.field === fieldId)
        cleaned.push(`The total ${quote(total.name)} will be removed.`);
    for (const c of app.dashboard.cards)
      if (c.table === tableId && c.op === "sum" && c.field === fieldId)
        cleaned.push(`The dashboard figure ${quote(c.name)} will be removed.`);
    for (const a of table.actions)
      if (a.limits.some((l) => l.field === fieldId || l.atMost === fieldId))
        cleaned.push(`The limit on ${quote(a.name)} will be removed.`);
  }
  if (type === "link")
    for (const f of app.forms)
      if (
        f.kind === "submit" &&
        f.table === tableId &&
        f.fields.includes(fieldId)
      )
        cleaned.push(
          `${quote(f.name)} will stop asking for it (visitors can’t pick linked records).`,
        );
  cleaned.push(
    ...capacityAfter(table, fieldId, type).cleaned,
    ...formUsesCleaned(app, tableId, fieldId, type),
  );
  return { blocked, cleaned };
}

export function changeFieldType(
  app: App,
  tableId: string,
  fieldId: string,
  type: AppFieldType,
  /** The collection an "item" or "items" field picks from (needed unless it has one). */
  collection?: string,
): App {
  const check = changeFieldTypeCheck(app, tableId, fieldId, type, collection);
  const table = tableOf(app, tableId);
  const field = table && fieldOf(table, fieldId);
  if (!table || !field || check.blocked.length || field.type === type)
    return app;
  let next = app;
  if (!isNumeric(type)) {
    next = dropTotals(
      next,
      allTotals(next)
        .filter(
          ({ total }) => total.table === tableId && total.field === fieldId,
        )
        .map(({ total }) => total.id),
    );
    next = {
      ...next,
      dashboard: {
        ...next.dashboard,
        cards: next.dashboard.cards.filter(
          (c) =>
            !(c.table === tableId && c.op === "sum" && c.field === fieldId),
        ),
      },
    };
  }
  next = dropFormUses(next, tableId, fieldId, type);
  next = mapTable(next, tableId, (t) => ({
    ...t,
    ...withCapacity(capacityAfter(t, fieldId, type).capacity),
    // Only a yes/no field can pause records.
    pausedField:
      t.pausedField === fieldId && type !== "yesNo" ? undefined : t.pausedField,
    fields: t.fields.map((f) =>
      f.id === fieldId ? shapeField(next, t, f, type, collection) : f,
    ),
    actions: isNumeric(type)
      ? t.actions
      : t.actions.map((a) => ({
          ...a,
          limits: a.limits.filter(
            (l) => l.field !== fieldId && l.atMost !== fieldId,
          ),
        })),
  }));
  if (type === "link")
    next = mapForms(next, (f) =>
      f.kind === "submit" && f.table === tableId
        ? { ...f, fields: f.fields.filter((x) => x !== fieldId) }
        : f,
    );
  return next;
}

/** Points a link field at another table; refused while something adds up or signs in through it. */
export function changeLinkTargetCheck(
  app: App,
  tableId: string,
  fieldId: string,
): Check {
  const blocked = [...linkNeededBy(app, tableId, fieldId)];
  for (const { owner, total } of allTotals(app))
    if (total.table === tableId && total.via === fieldId)
      blocked.push(
        `The total ${quote(total.name)} on ${owner.name} adds up through it.`,
      );
  for (const f of app.forms)
    if (f.history?.table === tableId && f.history.via === fieldId)
      blocked.push(`${quote(f.name)} shows a history through it.`);
  return { blocked, cleaned: [] };
}
export function changeLinkTarget(
  app: App,
  tableId: string,
  fieldId: string,
  target: string,
): App {
  if (!tableOf(app, target)) return app;
  if (changeLinkTargetCheck(app, tableId, fieldId).blocked.length) return app;
  return mapTable(app, tableId, (t) => ({
    ...t,
    fields: t.fields.map((f) =>
      f.id === fieldId && f.type === "link" ? { ...f, table: target } : f,
    ),
  }));
}

/** Turning "unique" off is refused while a form finds or signs in visitors by it. */
export function setUnique(
  app: App,
  tableId: string,
  fieldId: string,
  unique: boolean,
): App {
  const table = tableOf(app, tableId);
  const field = table && fieldOf(table, fieldId);
  if (!field || (unique && !canBeUnique(field.type))) return app;
  if (!unique && uniqueNeededBy(app, tableId, fieldId).length) return app;
  return mapTable(app, tableId, (t) => ({
    ...t,
    fields: t.fields.map((f) => {
      if (f.id !== fieldId) return f;
      const next = { ...f };
      if (unique) next.unique = true;
      else delete next.unique;
      return next;
    }),
  }));
}

/** "Filled by you when taking a step": such fields leave visitors' forms. */
export function setOwnerOnly(
  app: App,
  tableId: string,
  fieldId: string,
  ownerOnly: boolean,
): App {
  let next = mapTable(app, tableId, (t) => ({
    ...t,
    fields: t.fields.map((f) => {
      if (f.id !== fieldId) return f;
      const field = { ...f };
      if (ownerOnly) field.ownerOnly = true;
      else delete field.ownerOnly;
      return field;
    }),
  }));
  if (ownerOnly)
    next = mapForms(next, (f) =>
      f.kind === "submit" && f.table === tableId
        ? { ...f, fields: f.fields.filter((x) => x !== fieldId) }
        : f,
    );
  return next;
}
export function setOwnerOnlyCheck(
  app: App,
  tableId: string,
  fieldId: string,
): Check {
  return {
    blocked: [],
    cleaned: app.forms
      .filter(
        (f) =>
          f.kind === "submit" &&
          f.table === tableId &&
          f.fields.includes(fieldId),
      )
      .map((f) => `${quote(f.name)} will stop asking visitors for it.`),
  };
}

// ── Tables ──────────────────────────────────────────────────────────────────

export function addTable(app: App, name = "", singular = ""): App {
  if (app.tables.length >= MAX_TABLES) return app;
  let n = app.tables.length + 1;
  const taken = new Set(app.tables.map((t) => lower(t.name)));
  let plural = name || "Records";
  while (taken.has(lower(plural))) plural = `${name || "Records"} ${n++}`;
  return {
    ...app,
    tables: [...app.tables, createTable(plural, singular || "Record")],
  };
}

export function removeTableCheck(app: App, tableId: string): Check {
  const table = tableOf(app, tableId);
  if (!table) return { blocked: [], cleaned: [] };
  const blocked = linksTo(app, tableId)
    .filter(({ table: t }) => t.id !== tableId)
    .map(
      ({ table: t, field }) =>
        `${t.name} has the field ${quote(field.name)} that points here. Delete it or point it elsewhere first.`,
    );
  const cleaned: string[] = [];
  for (const f of app.forms) {
    if (f.table === tableId)
      cleaned.push(
        `The form ${quote(f.name)} will be deleted, with its sections on your pages.`,
      );
    else if (f.history?.table === tableId)
      cleaned.push(`${quote(f.name)} will stop showing a history.`);
  }
  for (const { owner, total } of allTotals(app))
    if (total.table === tableId && owner.id !== tableId)
      cleaned.push(
        `The total ${quote(total.name)} on ${owner.name} will be removed.`,
      );
  for (const c of app.dashboard.cards)
    if (c.table === tableId)
      cleaned.push(`The dashboard figure ${quote(c.name)} will be removed.`);
  for (const l of app.dashboard.lists)
    if (l.table === tableId)
      cleaned.push(`The dashboard list ${quote(l.name)} will be removed.`);
  return { blocked, cleaned };
}
/** Deletes a table and what depends on it. Returns the ids of deleted forms too. */
export function removeTable(
  app: App,
  tableId: string,
): { app: App; forms: string[] } {
  if (removeTableCheck(app, tableId).blocked.length) return { app, forms: [] };
  const forms = app.forms.filter((f) => f.table === tableId).map((f) => f.id);
  let next = dropTotals(
    app,
    allTotals(app)
      .filter(({ total }) => total.table === tableId)
      .map(({ total }) => total.id),
  );
  next = mapForms(next, (f) => {
    if (f.table === tableId) return null;
    if (f.history?.table === tableId) {
      const form = { ...f };
      delete form.history;
      return form;
    }
    return f;
  });
  return {
    forms,
    app: {
      ...next,
      tables: next.tables.filter((t) => t.id !== tableId),
      dashboard: {
        cards: next.dashboard.cards.filter((c) => c.table !== tableId),
        lists: next.dashboard.lists.filter((l) => l.table !== tableId),
      },
    },
  };
}

// ── Steps (statuses and actions) ────────────────────────────────────────────

/** Gives a table its first steps: New → Done, with a "Mark done" action. */
export function addSteps(app: App, tableId: string): App {
  return mapTable(app, tableId, (t) => {
    if (t.statuses.length) return t;
    const waiting: AppStatus = { id: appId(), name: "New", tone: "waiting" };
    const done: AppStatus = { id: appId(), name: "Done", tone: "good" };
    return {
      ...t,
      statuses: [waiting, done],
      initial: waiting.id,
      actions: [
        {
          id: appId(),
          name: "Mark done",
          from: [waiting.id],
          to: done.id,
          set: [],
          note: "none",
          limits: [],
          tone: "primary",
        },
      ],
    };
  });
}
export function addStatus(app: App, tableId: string): App {
  return mapTable(app, tableId, (t) => {
    if (t.statuses.length >= 12) return t;
    const status: AppStatus = {
      id: appId(),
      name: "New step",
      tone: "neutral",
    };
    return {
      ...t,
      statuses: [...t.statuses, status],
      initial: t.initial || status.id,
    };
  });
}
/** Where a status is used outside its table's own list. */
function statusFilters(app: App, tableId: string, statusId: string) {
  const only = (statuses: string[]) =>
    statuses.length === 1 && statuses[0] === statusId;
  const result: { name: string; becomesAll: boolean }[] = [];
  for (const { total } of allTotals(app))
    if (total.table === tableId && total.statuses.includes(statusId))
      result.push({ name: total.name, becomesAll: only(total.statuses) });
  for (const c of [...app.dashboard.cards, ...app.dashboard.lists])
    if (c.table === tableId && c.statuses.includes(statusId))
      result.push({ name: c.name, becomesAll: only(c.statuses) });
  return result;
}
export function removeStatusCheck(
  app: App,
  tableId: string,
  statusId: string,
): Check {
  const table = tableOf(app, tableId);
  const status = table && statusOf(table, statusId);
  if (!table || !status) return { blocked: [], cleaned: [] };
  const cleaned: string[] = [];
  const rest = table.statuses.filter((s) => s.id !== statusId);
  if (table.initial === statusId && rest.length)
    cleaned.push(
      `New ${lower(table.name)} will start as ${quote(rest[0].name)}.`,
    );
  if (!rest.length)
    cleaned.push(
      `${table.name} will have no steps, and every action will be removed.`,
    );
  else
    for (const a of table.actions)
      if (a.to === statusId)
        cleaned.push(
          `The action ${quote(a.name)} moves records here and will be removed.`,
        );
  for (const c of table.capacity ?? [])
    if (c.statuses.includes(statusId))
      cleaned.push(
        c.statuses.length === 1
          ? `The limit ${quote(c.name)} only counts this step; nothing will hold a place.`
          : `The limit ${quote(c.name)} will stop counting this step.`,
      );
  for (const f of statusFilters(app, tableId, statusId))
    cleaned.push(
      f.becomesAll
        ? `${quote(f.name)} only counts this step; it will count every ${lower(table.singular)} instead.`
        : `${quote(f.name)} will stop counting this step.`,
    );
  cleaned.push(
    `${table.name} already in ${quote(status.name)} will show no step until you take an action on them.`,
  );
  return { blocked: [], cleaned };
}
export function removeStatus(app: App, tableId: string, statusId: string): App {
  const strip = (statuses: string[]) => statuses.filter((s) => s !== statusId);
  const next = mapTable(app, tableId, (t) => {
    const statuses = t.statuses.filter((s) => s.id !== statusId);
    return {
      ...t,
      ...withCapacity(
        t.capacity?.map((c) => ({ ...c, statuses: strip(c.statuses) })),
      ),
      statuses,
      initial:
        t.initial === statusId || !statuses.length
          ? (statuses[0]?.id ?? "")
          : t.initial,
      actions: statuses.length
        ? t.actions
            .filter((a) => a.to !== statusId)
            .map((a) => ({ ...a, from: strip(a.from) }))
        : [],
    };
  });
  return {
    ...next,
    tables: next.tables.map((t) => ({
      ...t,
      totals: t.totals.map((x) =>
        x.table === tableId ? { ...x, statuses: strip(x.statuses) } : x,
      ),
    })),
    dashboard: {
      cards: next.dashboard.cards.map((c) =>
        c.table === tableId ? { ...c, statuses: strip(c.statuses) } : c,
      ),
      lists: next.dashboard.lists.map((l) =>
        l.table === tableId ? { ...l, statuses: strip(l.statuses) } : l,
      ),
    },
  };
}
export function addAction(app: App, tableId: string): App {
  return mapTable(app, tableId, (t) => {
    if (!t.statuses.length || t.actions.length >= 12) return t;
    const to = t.statuses.find((s) => s.id !== t.initial) ?? t.statuses[0];
    const action: AppAction = {
      id: appId(),
      name: "New action",
      from: t.initial ? [t.initial] : [],
      to: to.id,
      set: [],
      note: "none",
      limits: [],
      tone: "primary",
    };
    return { ...t, actions: [...t.actions, action] };
  });
}

// ── Totals ──────────────────────────────────────────────────────────────────

/** A new total for `tableId`, adding up the first table that links to it. */
export function addTotal(app: App, tableId: string): App {
  const source = linksTo(app, tableId)[0];
  if (!source) return app;
  const numeric = numericFields(source.table)[0];
  const total: AppTotal = numeric
    ? {
        id: appId(),
        name: `Total ${lower(numeric.name)}`,
        table: source.table.id,
        via: source.field.id,
        op: "sum",
        field: numeric.id,
        statuses: [],
        money: numeric.type !== "number",
      }
    : {
        id: appId(),
        name: `Number of ${lower(source.table.name)}`,
        table: source.table.id,
        via: source.field.id,
        op: "count",
        statuses: [],
      };
  return mapTable(app, tableId, (t) =>
    t.totals.length >= 12 ? t : { ...t, totals: [...t.totals, total] },
  );
}
export function removeTotalCheck(app: App, totalId: string): Check {
  const cleaned = [
    ...app.forms
      .filter((f) => f.totals.includes(totalId))
      .map((f) => `${quote(f.name)} will stop showing it.`),
    ...app.dashboard.lists
      .filter((l) => l.sort === totalId)
      .map((l) => `${quote(l.name)} will list the newest first instead.`),
  ];
  return { blocked: [], cleaned };
}
export const removeTotal = (app: App, totalId: string) =>
  dropTotals(app, [totalId]);

// ── Forms ───────────────────────────────────────────────────────────────────

/** A sensible "Is this you?" for a table: its required link to a table visitors can be found in. */
export function suggestIdentify(
  app: App,
  table: AppTable,
): AppForm["identify"] | undefined {
  for (const link of table.fields.filter((f) => f.type === "link")) {
    const parent = tableOf(app, link.table ?? "");
    const key = parent && uniqueFields(parent)[0];
    if (parent && key)
      return {
        table: parent.id,
        field: key.id,
        link: link.id,
        confirm: [parent.titleField, key.id].filter(
          (x, i, all) => all.indexOf(x) === i,
        ),
      };
  }
}
export function createForm(
  app: App,
  kind: AppForm["kind"],
): AppForm | undefined {
  if (kind === "submit") {
    const table =
      app.tables.find((t) => !t.private && visitorFields(t).length) ??
      app.tables.find((t) => !t.private) ??
      app.tables[0];
    if (!table) return;
    const identify = suggestIdentify(app, table);
    return {
      id: appId(),
      name: `Add a ${lower(table.singular)}`,
      kind,
      table: table.id,
      ...(identify ? { identify } : {}),
      fields: visitorFields(table).map((f) => f.id),
      totals: [],
      title: `Add a ${lower(table.singular)}`,
      intro: "",
      button: "Send",
      success: table.prefix
        ? "Thanks — we’ve received it. Your reference is {ref}."
        : "Thanks — we’ve received it.",
    };
  }
  const table =
    app.tables.find((t) => uniqueFields(t).length) ??
    app.tables.find((t) => t.prefix);
  if (!table) return;
  const unique = uniqueFields(table)[0];
  if (!unique)
    return {
      id: appId(),
      name: `Track your ${lower(table.singular)}`,
      kind,
      table: table.id,
      key: REF_KEY,
      fields: [table.titleField],
      totals: [],
      title: `Track your ${lower(table.singular)}`,
      intro: "Enter your reference number to see where it’s up to.",
      button: "Track",
      success: "",
    };
  const key = unique;
  const child = linksTo(app, table.id).find((l) => l.table.id !== table.id);
  return {
    id: appId(),
    name: `Find your ${lower(table.singular)}`,
    kind,
    table: table.id,
    key: key.id,
    fields: [table.titleField],
    totals: table.totals.map((t) => t.id),
    ...(child
      ? {
          history: {
            table: child.table.id,
            via: child.field.id,
            fields: child.table.fields
              .filter((f) => f.id !== child.field.id)
              .slice(0, 3)
              .map((f) => f.id),
          },
        }
      : {}),
    title: `Find your ${lower(table.singular)}`,
    intro: `Enter your ${lower(key.name)} to see your details.`,
    button: "Look up",
    success: "",
  };
}
export function addForm(app: App, kind: AppForm["kind"]) {
  const form = app.forms.length < MAX_FORMS && createForm(app, kind);
  return form ? { app: { ...app, forms: [...app.forms, form] }, form } : null;
}
/** Moves a form to another table, resetting what only made sense for the old one. */
export function changeFormTable(
  app: App,
  formId: string,
  tableId: string,
): App {
  const table = tableOf(app, tableId);
  if (!table) return app;
  return mapForms(app, (f) => {
    if (f.id !== formId || f.table === tableId) return f;
    const next: AppForm = { ...f, table: tableId, totals: [] };
    delete next.identify;
    delete next.confirmTotals;
    delete next.highlight;
    delete next.history;
    delete next.key;
    delete next.verify;
    delete next.payment;
    if (f.kind === "submit") {
      next.fields = visitorFields(table).map((x) => x.id);
      const identify = suggestIdentify(app, table);
      if (identify) next.identify = identify;
      return next;
    }
    const key = uniqueFields(table)[0]?.id ?? (table.prefix ? REF_KEY : "");
    if (!key) return f;
    next.key = key;
    next.fields = [table.titleField];
    return next;
  });
}
/** Turns "Visitors identify themselves first" on (with a suggestion) or off. */
export function setIdentify(app: App, formId: string, on: boolean): App {
  return mapForms(app, (f) => {
    if (f.id !== formId || f.kind !== "submit") return f;
    const next = { ...f };
    delete next.confirmTotals;
    if (!on) {
      delete next.identify;
      return next;
    }
    const table = tableOf(app, f.table);
    const identify = table && suggestIdentify(app, table);
    return identify ? { ...next, identify } : f;
  });
}

/** Lookups that find records by reference, so the table must keep its prefix. */
export function prefixNeededBy(app: App, tableId: string) {
  return app.forms
    .filter(
      (f) => f.kind === "lookup" && f.table === tableId && f.key === REF_KEY,
    )
    .map((f) => `${quote(f.name)} finds them by reference.`);
}
/** Sets a table's reference prefix; clearing it is refused while a lookup tracks by reference. */
export function setPrefix(app: App, tableId: string, prefix: string): App {
  const clean = prefix
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  if (!clean && prefixNeededBy(app, tableId).length) return app;
  return mapTable(app, tableId, (t) => ({ ...t, prefix: clean }));
}
/** What visitors type on a lookup: a field, or REF_KEY (needs a prefix). Drops a verify that matches it. */
export function setLookupKey(app: App, formId: string, key: string): App {
  return mapForm(app, formId, (f) => {
    if (f.kind !== "lookup") return f;
    const table = tableOf(app, f.table);
    if (!table) return f;
    if (key === REF_KEY ? !table.prefix : !fieldOf(table, key)) return f;
    const next = { ...f, key };
    if (next.verify === key) delete next.verify;
    return next;
  });
}
/** "Also ask for" on a lookup: a second value that must match (empty for none). */
export function setVerify(app: App, formId: string, verify: string): App {
  return mapForm(app, formId, (f) => {
    if (f.kind !== "lookup") return f;
    const table = tableOf(app, f.table);
    const next = { ...f };
    if (!verify) delete next.verify;
    else if (table && fieldOf(table, verify) && verify !== f.key)
      next.verify = verify;
    else return f;
    return next;
  });
}
/** "Ask visitors to pay" the amount in a money or order field of the form (empty for no). */
export function setPayment(app: App, formId: string, field: string): App {
  return mapForm(app, formId, (f) => {
    if (f.kind !== "submit") return f;
    const table = tableOf(app, f.table);
    const next = { ...f };
    if (!field) delete next.payment;
    else if (table && canPay(fieldOf(table, field)?.type ?? "text"))
      next.payment = { field };
    else return f;
    return next;
  });
}

// ── Collections used by item fields ─────────────────────────────────────────

/** Fields that pick from a site collection; deleting it is refused while any exist. */
export function collectionUsedBy(app: App | undefined, collectionId: string) {
  if (!app) return [];
  return app.tables.flatMap((t) =>
    t.fields
      .filter((f) => isCatalog(f.type) && f.collection === collectionId)
      .map(
        (f) =>
          `${t.name} chooses ${quote(f.name)} from it. Change that field in your app first.`,
      ),
  );
}
/** Points an item field at another collection; item-based limits switch to a fixed number. */
export function changeFieldCollection(
  app: App,
  tableId: string,
  fieldId: string,
  collection: string,
): App {
  const table = tableOf(app, tableId);
  const field = table && fieldOf(table, fieldId);
  if (!field || !isCatalog(field.type) || !collection) return app;
  if (field.collection === collection) return app;
  return mapTable(app, tableId, (t) => ({
    ...t,
    ...withCapacity(
      t.capacity?.map((c) => {
        if (c.group[0] !== fieldId || c.maxField === undefined) return c;
        const next = { ...c };
        delete next.maxField;
        return next;
      }),
    ),
    fields: t.fields.map((f) => (f.id === fieldId ? { ...f, collection } : f)),
  }));
}

// ── Places that run out (capacity) ──────────────────────────────────────────

/** A first limit for a table: per item (an event), or per date and time slot. */
export function addCapacity(app: App, tableId: string): App {
  const table = tableOf(app, tableId);
  if (!table || (table.capacity?.length ?? 0) >= 6) return app;
  const item = table.fields.find((f) => f.type === "item");
  const date = table.fields.find((f) => f.type === "date");
  const slot = table.fields.find((f) => f.type === "choice");
  const group = item
    ? [item.id]
    : [date, slot].filter((f): f is AppField => !!f).map((f) => f.id);
  if (!group.length) {
    const any = table.fields.find((f) => canGroup(f.type));
    if (!any) return app;
    group.push(any.id);
  }
  const size = table.fields.find(
    (f) =>
      f.type === "number" &&
      /guest|people|seat|ticket|person|qty|quantit/i.test(f.name),
  );
  const holding = table.statuses
    .filter((s) => s.tone !== "bad")
    .map((s) => s.id);
  const capacity: AppCapacity = {
    id: appId(),
    name: item ? `${item.name} places` : "Places",
    group,
    max: 10,
    statuses: holding,
    message: "That’s fully booked. Please choose another.",
  };
  if (size) capacity.size = size.id;
  return mapTable(app, tableId, (t) => ({
    ...t,
    capacity: [...(t.capacity ?? []), capacity],
  }));
}
/** Changes a limit, keeping it valid: at least one group field, an item for per-item numbers, a number for sizes. */
export function updateCapacity(
  app: App,
  tableId: string,
  capacityId: string,
  values: Partial<Omit<AppCapacity, "id">>,
): App {
  const table = tableOf(app, tableId);
  if (!table) return app;
  return mapTable(app, tableId, (t) => ({
    ...t,
    capacity: (t.capacity ?? []).map((c) => {
      if (c.id !== capacityId) return c;
      const next: AppCapacity = { ...c, ...values };
      next.group = next.group
        .filter((g, i, all) => all.indexOf(g) === i)
        .filter((g) => canGroup(fieldOf(t, g)?.type ?? "items"))
        // An item comes first, so a limit can be each item's own number.
        .sort(
          (a, b) =>
            Number(fieldOf(t, b)?.type === "item") -
            Number(fieldOf(t, a)?.type === "item"),
        )
        .slice(0, 4);
      if (!next.group.length) next.group = c.group;
      next.max = Math.max(0, Math.min(100000, Math.round(next.max) || 0));
      if (!next.maxField || fieldOf(t, next.group[0])?.type !== "item")
        delete next.maxField;
      if (!next.size || fieldOf(t, next.size)?.type !== "number")
        delete next.size;
      next.statuses = next.statuses.filter((s) => statusOf(t, s));
      return next;
    }),
  }));
}
export function removeCapacity(app: App, tableId: string, capacityId: string) {
  return mapTable(app, tableId, (t) => {
    const capacity = (t.capacity ?? []).filter((c) => c.id !== capacityId);
    const next: AppTable = { ...t, capacity };
    if (!capacity.length) delete next.capacity;
    return next;
  });
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export function createCard(app: App): AppCard | undefined {
  const table = app.tables[0];
  if (!table) return;
  return {
    id: appId(),
    name: table.name,
    table: table.id,
    op: "count",
    statuses: [],
  };
}
export function createList(app: App): AppList | undefined {
  const table = app.tables[0];
  if (!table) return;
  return {
    id: appId(),
    name: `Newest ${lower(table.name)}`,
    table: table.id,
    sort: "",
    statuses: [],
    limit: 8,
  };
}

// ── Plain-language previews ─────────────────────────────────────────────────

const joinOr = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
const statusNames = (table: AppTable | undefined, ids: string[]) =>
  ids.map((id) => (table && statusOf(table, id)?.name) || "?");

/** "Approve: from Waiting → Approved; you fill Reward; Reward can’t be more than Purchase amount." */
export function actionSentence(table: AppTable, action: AppAction) {
  const from = statusNames(table, action.from);
  const parts = [
    `${action.name || "This action"}: ${from.length ? `from ${joinOr(from)}` : "not offered from any step yet"} → ${statusOf(table, action.to)?.name ?? "?"}`,
  ];
  if (action.set.length)
    parts.push(
      `you fill ${action.set.map((f) => fieldOf(table, f)?.name ?? "?").join(", ")}`,
    );
  for (const l of action.limits)
    parts.push(
      `${fieldOf(table, l.field)?.name ?? "?"} can’t be more than ${lower(fieldOf(table, l.atMost)?.name ?? "?")}`,
    );
  if (action.note === "required") parts.push("you must add a note");
  if (action.note === "optional") parts.push("you can add a note");
  return `${parts.join("; ")}.`;
}
/** "Total reward = sum of Reward from Purchases where the step is Approved." */
export function totalSentence(app: App, total: AppTotal) {
  const source = tableOf(app, total.table);
  const what =
    total.op === "count"
      ? `number of ${lower(source?.name ?? "records")}`
      : `sum of ${(source && fieldOf(source, total.field ?? "")?.name) ?? "?"} from ${source?.name ?? "?"}`;
  const where = total.statuses.length
    ? ` where the step is ${joinOr(statusNames(source, total.statuses))}`
    : "";
  return `${total.name || "Total"} = ${what}${where}.`;
}
export function cardSentence(app: App, card: AppCard) {
  const table = tableOf(app, card.table);
  const what =
    card.op === "count"
      ? `Number of ${lower(table?.name ?? "records")}`
      : `Sum of ${(table && fieldOf(table, card.field ?? "")?.name) ?? "?"} across ${lower(table?.name ?? "records")}`;
  const where = card.statuses.length
    ? ` where the step is ${joinOr(statusNames(table, card.statuses))}`
    : "";
  return `${what}${where}.`;
}
/**
 * "At most 40 guests per Date + Time while Requested or Confirmed."
 * `numberName` names the collection's number field for per-item limits.
 */
export function capacitySentence(
  table: AppTable,
  c: AppCapacity,
  numberName?: string,
) {
  const unit = c.size
    ? lower(fieldOf(table, c.size)?.name ?? "places")
    : lower(table.name || "places");
  const per = c.group.map((g) => fieldOf(table, g)?.name ?? "?").join(" + ");
  const most =
    c.maxField !== undefined
      ? `the ${lower(fieldOf(table, c.group[0])?.name ?? "item")}’s ${lower(numberName ?? "number")}`
      : String(c.max);
  const holding = c.statuses.length
    ? ` while ${joinOr(statusNames(table, c.statuses))}`
    : table.statuses.length
      ? " (no step holds a place yet)"
      : "";
  return `At most ${most} ${unit} per ${per}${holding}.`;
}
/** An example figure for previews. */
export const exampleMoney = (app: App) => formatMoney(1250, app.currency);
