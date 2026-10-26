/** Small view helpers shared by the owner app's pages. */
import {
  fieldOf,
  recordTitle,
  statusOf,
  type App,
  type AppAction,
  type AppField,
  type AppRecord,
} from "../apps/model";
import { showValue, type LinkTitle } from "../apps/app-helpers";
import type { OwnerContextValue } from "./context";
import { formatPhone } from "./format";
import type { Workflow } from "./roles";

export interface PersonInfo {
  id: string;
  name: string;
  phone: string;
  record?: AppRecord;
}
/** Who sent a workflow record: name and phone from the linked person. */
export function personOf(
  ctx: Pick<OwnerContextValue, "records" | "linkTitle">,
  w: Workflow,
  record: AppRecord,
): PersonInfo {
  if (!w.person)
    return {
      id: "",
      name: recordTitle(w.table, record),
      phone: record.ref,
    };
  const id = String(record.values[w.person.field.id] ?? "");
  const found = ctx.records(w.person.table.id).find((r) => r.id === id);
  const phone = w.person.table.fields.find((f) => f.type === "phone");
  return {
    id,
    name: found
      ? recordTitle(w.person.table, found)
      : id
        ? ctx.linkTitle(w.person.table.id, id)
        : "—",
    phone:
      found && phone ? formatPhone(String(found.values[phone.id] ?? "")) : "",
    record: found,
  };
}
export const amountOf = (field: AppField | undefined, record: AppRecord) =>
  field ? Number(record.values[field.id] ?? 0) || 0 : 0;

/** "₹" for INR: the symbol money is typed after. */
export function currencySymbol(currency: string) {
  try {
    const parts = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "Rejecting", "Approving", "Cancelling" as a sentence starts. */
export const gerund = (verb: string) =>
  /e$/i.test(verb) ? `${verb.slice(0, -1)}ing` : `${verb}ing`;
const REASONS: Record<string, string> = {
  reject: "Reason for rejection",
  decline: "Reason for declining",
  cancel: "Reason for cancelling",
  refuse: "Reason for refusing",
};
export const reasonLabel = (action: AppAction) =>
  REASONS[action.name.toLowerCase()] ?? "Reason";

/** Can a record in `status` ever leave it? If not, the step can't be undone. */
export const isFinal = (w: Workflow, status: string) =>
  !w.table.actions.some((a) => a.from.includes(status));

export const statusNameOf = (w: Workflow, id: string) =>
  statusOf(w.table, id)?.name ?? id;

/** A field's value as the owner reads it; empty shows nothing. */
export const valueText = (
  app: App,
  w: { table: Workflow["table"] },
  fieldId: string,
  record: AppRecord,
  linkTitle: LinkTitle,
) => {
  const field = fieldOf(w.table, fieldId);
  return field ? showValue(app, field, record, linkTitle) : "";
};
export const cap = (text: string) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
