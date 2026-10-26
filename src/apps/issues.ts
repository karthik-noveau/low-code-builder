/**
 * Problems in an app that validateApp allows but that would confuse visitors
 * or stop forms working, in plain words, each pointing at the place to fix it.
 */
import { fieldOf, tableOf, REF_KEY, type App } from "./model";
import { canPay, isCatalog, isNumeric } from "./edit";

export type AppTab = "tables" | "forms" | "dashboard" | "settings";
export interface AppTarget {
  tab: AppTab;
  /** The table, form or dashboard item to open. */
  id?: string;
}
export interface AppIssue {
  id: string;
  title: string;
  detail: string;
  target: AppTarget;
}

/** What the app's item fields choose from (the site's collections), when known. */
export interface IssueContext {
  collections?: {
    id: string;
    name: string;
    items: { hidden: boolean; values: Record<string, string> }[];
    fields: { id: string; type: string }[];
    display: { price: string };
  }[];
}

export function appIssues(app: App, context: IssueContext = {}): AppIssue[] {
  const issues: AppIssue[] = [];
  for (const t of app.tables) {
    const target: AppTarget = { tab: "tables", id: t.id };
    if (!t.name.trim() || t.fields.some((f) => !f.name.trim()))
      issues.push({
        id: `app-names-${t.id}`,
        title: `Name everything in ${t.name.trim() || "a table"}`,
        detail:
          "Tables and fields need names so visitors and you know what they are.",
        target,
      });
    for (const f of t.fields)
      if (f.type === "choice" && !f.options.some((o) => o.trim()))
        issues.push({
          id: `app-options-${t.id}-${f.id}`,
          title: `Add choices to ${f.name || "a choice field"}`,
          detail: `${t.name} has a choice field with nothing to choose from.`,
          target,
        });
    for (const f of t.fields) {
      if (!isCatalog(f.type) || !context.collections) continue;
      const c = context.collections.find((x) => x.id === f.collection);
      if (!c) continue;
      if (!c.items.some((i) => !i.hidden))
        issues.push({
          id: `app-catalog-empty-${t.id}-${f.id}`,
          title: `${c.name} has nothing to choose`,
          detail: `${f.name} picks from ${c.name}, which has no published items. Add items in Data.`,
          target,
        });
      else if (f.type === "items" && !c.display.price)
        issues.push({
          id: `app-catalog-price-${t.id}-${f.id}`,
          title: `${c.name} has no prices`,
          detail: `${f.name} adds up an order from ${c.name}, but its cards don’t show a price, so every order would be free. Choose a price field for ${c.name} in Data.`,
          target,
        });
    }
    for (const c of t.capacity ?? []) {
      if (c.max === 0 && c.maxField === undefined)
        issues.push({
          id: `app-capacity-zero-${t.id}-${c.id}`,
          title: `“${c.name}” allows nothing`,
          detail: `Its limit is 0, so every ${t.singular.toLowerCase()} would be turned away.`,
          target,
        });
      if (t.statuses.length && !c.statuses.length)
        issues.push({
          id: `app-capacity-statuses-${t.id}-${c.id}`,
          title: `Choose which steps hold a place in “${c.name}”`,
          detail:
            "No step is ticked, so places never run out. Tick the steps a booking keeps its place in, like Requested and Confirmed.",
          target,
        });
      for (const form of app.forms) {
        if (form.kind !== "submit" || form.table !== t.id) continue;
        const missing = c.group.filter((g) => !form.fields.includes(g));
        if (missing.length)
          issues.push({
            id: `app-capacity-form-${form.id}-${c.id}`,
            title: `“${form.name}” can’t check “${c.name}”`,
            detail: `It doesn’t ask for ${missing.map((g) => fieldOf(t, g)?.name ?? "?").join(" and ")}, so places are counted together for everyone. Add ${missing.length === 1 ? "it" : "them"} to the form.`,
            target: { tab: "forms", id: form.id },
          });
      }
    }
    const email = t.fields.some((f) => f.type === "email");
    for (const a of t.actions)
      if (a.tellVisitor && !email)
        issues.push({
          id: `app-tell-${t.id}-${a.id}`,
          title: `“${a.name}” can’t email anyone`,
          detail: `${t.name} has no email field, so there’s no address to tell. Add one, or turn off “Email the visitor”.`,
          target,
        });
    if (t.statuses.length && !t.actions.length)
      issues.push({
        id: `app-actions-${t.id}`,
        title: `Add an action to ${t.name}`,
        detail: `${t.name} has steps but no action like Approve or Mark done, so records can never move on.`,
        target,
      });
    for (const a of t.actions)
      if (!a.from.length)
        issues.push({
          id: `app-from-${t.id}-${a.id}`,
          title: `Choose when “${a.name}” is offered`,
          detail: `Pick the steps ${t.name.toLowerCase()} can be in for you to take this action.`,
          target,
        });
    for (const total of t.totals) {
      const source = tableOf(app, total.table);
      const field = source && fieldOf(source, total.field ?? "");
      if (total.op === "sum" && field && !isNumeric(field.type))
        issues.push({
          id: `app-total-${total.id}`,
          title: `“${total.name}” adds up a field that isn’t a number`,
          detail: `Choose a number or money field of ${source.name} to add up.`,
          target,
        });
    }
  }
  for (const f of app.forms) {
    const table = tableOf(app, f.table);
    if (!table) continue;
    const target: AppTarget = { tab: "forms", id: f.id };
    if (f.kind === "submit") {
      if (!f.fields.length && !f.identify)
        issues.push({
          id: `app-empty-form-${f.id}`,
          title: `Choose what “${f.name}” asks for`,
          detail: "This form has no fields for visitors to fill.",
          target,
        });
      if (table.private)
        issues.push({
          id: `app-private-${f.id}`,
          title: `“${f.name}” can’t add ${table.name.toLowerCase()}`,
          detail: `Only you can add ${table.name.toLowerCase()}. Allow visitors to add them, or use another table.`,
          target,
        });
      const missing = table.fields.filter(
        (x) =>
          x.required &&
          !x.ownerOnly &&
          !f.fields.includes(x.id) &&
          f.identify?.link !== x.id,
      );
      if (missing.length)
        issues.push({
          id: `app-missing-${f.id}`,
          title: `“${f.name}” leaves out required fields`,
          detail: `${missing.map((x) => x.name).join(", ")} ${missing.length === 1 ? "is" : "are"} required, so every visitor would be turned away. Add ${missing.length === 1 ? "it" : "them"} to the form, or make ${missing.length === 1 ? "it" : "them"} optional.`,
          target,
        });
      const owner = f.fields
        .map((x) => fieldOf(table, x))
        .filter((x) => x && (x.ownerOnly || x.type === "link"));
      if (owner.length)
        issues.push({
          id: `app-owner-fields-${f.id}`,
          title: `“${f.name}” asks visitors for something they can’t fill`,
          detail: `${owner.map((x) => x!.name).join(", ")} ${owner.length === 1 ? "is" : "are"} filled by you or connected automatically.`,
          target,
        });
      if (f.payment && !f.fields.includes(f.payment.field))
        issues.push({
          id: `app-payment-field-${f.id}`,
          title: `“${f.name}” asks to pay an amount it doesn’t ask for`,
          detail: `Add ${fieldOf(table, f.payment.field)?.name ?? "the amount"} to the form, or choose another amount to pay.`,
          target,
        });
      else if (
        f.payment &&
        !canPay(fieldOf(table, f.payment.field)?.type ?? "text")
      )
        issues.push({
          id: `app-payment-type-${f.id}`,
          title: `“${f.name}” asks to pay something that isn’t money`,
          detail: "Choose a money or order field to pay.",
          target,
        });
    } else {
      if (f.key === REF_KEY && !f.verify)
        issues.push({
          id: `app-ref-verify-${f.id}`,
          title: `Anyone with a reference can open it on “${f.name}”`,
          detail:
            "References like ORD-1001 are easy to guess. Ask visitors for their phone or email too, under “Also ask for”.",
          target,
        });
    }
    if (
      f.kind === "lookup" &&
      !f.fields.length &&
      !f.totals.length &&
      !f.history
    )
      issues.push({
        id: `app-empty-lookup-${f.id}`,
        title: `Choose what “${f.name}” shows`,
        detail: "Visitors would find their record but see nothing.",
        target,
      });
  }
  for (const c of app.dashboard.cards) {
    const table = tableOf(app, c.table);
    const field = table && fieldOf(table, c.field ?? "");
    if (c.op === "sum" && (!field || !isNumeric(field.type)))
      issues.push({
        id: `app-card-${c.id}`,
        title: `Choose what “${c.name}” adds up`,
        detail: "Pick a number or money field for this dashboard figure.",
        target: { tab: "dashboard", id: c.id },
      });
  }
  return issues;
}

/** What the editor shows when an app section has nothing to show yet. */
export function appSectionProblem(app: App | undefined, formId?: string) {
  if (!app) return "Set up your app to show one of its forms here.";
  if (!app.forms.length) return "Add a form to your app to show it here.";
  if (!app.forms.some((f) => f.id === formId))
    return "Choose which app form this section shows.";
  return "";
}
