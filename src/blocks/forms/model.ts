/**
 * Forms built from blocks: the shapes and questions shared by the renderer,
 * the sync with the business app (sync.ts) and the Inspector.
 *
 * A `form` block is bound to one AppForm (prop `form`); the backend API is
 * the same as for the classic App form. Inside it, `field` blocks ask for one
 * field each, `submit` blocks are its buttons, `formStep` blocks split it into
 * steps (who are you, is this you, questions), `formSuccess` / `formError`
 * hold what's shown after sending or when sending fails, `formSteps` is the
 * step indicator and `formRecord` shows what was found (the visitor on "Is
 * this you?", the record on a lookup's result).
 *
 * Source of truth: the AppForm says WHICH fields are sent and in what order
 * (the backend reads `form.fields`); the block tree says how they are laid
 * out and worded. They are kept equal by `syncForms` on every change.
 */
import {
  fieldOf,
  tableOf,
  type App,
  type AppField,
  type AppForm,
  type AppTable,
} from "../../apps/model";
import type { Project, Section } from "../../studio/model";
import { walk, type Node, type NodeType } from "../model";

export const FORM_TYPES = [
  "form",
  "field",
  "submit",
  "formStep",
  "formSuccess",
  "formError",
  "formSteps",
  "formRecord",
] as const satisfies readonly NodeType[];
export type FormNodeType = (typeof FORM_TYPES)[number];
export const isFormType = (t: NodeType): t is FormNodeType =>
  (FORM_TYPES as readonly string[]).includes(t);

/** A field block in the "who are you" step: the identify field of the form's other table. */
export const IDENTITY = "@identity";
export type StepKind = "identify" | "confirm" | "details";
export type ButtonAction = "submit" | "back" | "confirm" | "change" | "again";

const str = (v: unknown) => (typeof v === "string" ? v : "");
export const stepKind = (n: Node): StepKind =>
  ["identify", "confirm"].includes(str(n.props.kind))
    ? (str(n.props.kind) as StepKind)
    : "details";

/** Fields visitors can be asked for (never owner-only fields or links). */
export const placeable = (f: AppField | undefined): f is AppField =>
  !!f && !f.ownerOnly && f.type !== "link";

/**
 * The blocks among a form's questions, in reading order: everything except
 * the "who are you" and "Is this you?" steps and the success and failure
 * blocks. In a form with steps, only what's inside its steps counts.
 */
export function questionNodes(form: Node): Node[] {
  const stepped = !!form.children?.some((c) => c.type === "formStep");
  const out: Node[] = [];
  const visit = (n: Node, top: boolean) => {
    if (n.type === "formSuccess" || n.type === "formError") return;
    if (n.type === "formStep" && stepKind(n) !== "details") return;
    if (n.type === "form" && n !== form) return;
    if (top && stepped && n.type !== "formStep") return;
    out.push(n);
    for (const c of n.children ?? []) visit(c, n === form);
  };
  visit(form, false);
  return out;
}

/** Field ids a form block asks for, in reading order, each once. */
export function placedFields(
  form: Node,
  table: AppTable | undefined,
): string[] {
  const out: string[] = [];
  for (const n of questionNodes(form)) {
    if (n.type !== "field") continue;
    const id = str(n.props.field);
    if (table && placeable(fieldOf(table, id)) && !out.includes(id))
      out.push(id);
  }
  return out;
}

/** The form an AppForm id names, with its table, when both exist. */
export function boundForm(app: App | undefined, formId: string) {
  const form = app?.forms.find((f) => f.id === formId);
  const table = form && app && tableOf(app, form.table);
  return form && table ? { form, table } : undefined;
}

/** Form blocks in a tree. */
export const formNodes = (root: Node | undefined) =>
  root ? [...walk([root])].filter((n) => n.type === "form") : [];

/** Every "blocks" section of a project: pages, header, footer and saved sections. */
export const allBlockSections = (p: Project): Section[] =>
  [
    ...p.header,
    ...p.pages.flatMap((pg) => pg.sections),
    ...p.footer,
    ...(p.savedSections ?? []),
  ].filter((s) => s.type === "blocks" && !!s.root);

/** The fields of a form's table a field block may ask for, in table order. */
export const askable = (table: AppTable) => table.fields.filter(placeable);

/** Words for a field type, as the field picker shows them. */
export function fieldKind(f: AppField) {
  return (
    {
      text: "Text",
      longText: "Long text",
      number: "Number",
      money: "Money",
      phone: "Phone",
      email: "Email",
      date: "Date",
      choice: "Choice",
      yesNo: "Yes / no",
      link: "Link",
      item: "Pick one item",
      items: "Order items",
    } as const
  )[f.type];
}

/** The identify field (on the other table), when the form identifies visitors. */
export function identityField(app: App, form: AppForm) {
  if (!form.identify) return;
  const parent = tableOf(app, form.identify.table);
  return parent && fieldOf(parent, form.identify.field);
}
