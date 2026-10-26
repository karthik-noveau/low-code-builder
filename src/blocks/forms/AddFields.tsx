/**
 * The Add panel's "Form fields" group: while a form block (or something in
 * it) is selected, the fields of its table that it doesn't ask yet. A click
 * adds the field after the form's last question and selects it.
 */
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import { findSection } from "../../studio/model";
import { tableOf, type AppField } from "../../apps/model";
import { findNode, pathTo, type Node } from "../model";
import { askable, fieldKind, placedFields } from "./model";
import { arrangeFields } from "./sync";
import "./settings.css";

const ICONS: Partial<Record<AppField["type"], string>> = {
  phone: "phone",
  email: "mail",
  money: "wallet",
  number: "percent",
  date: "activity",
  choice: "checklist",
  yesNo: "check",
  longText: "alignLeft",
  item: "tag",
  items: "receipt",
};

export function FormFieldsGroup({
  search,
  onBlock,
}: {
  search: string;
  onBlock: (section: string, node: string) => void;
}) {
  const { project, selected, selectedBlock } = useStudio();
  const section = findSection(project, selected);
  const root = section?.root;
  const node =
    root && selectedBlock ? findNode([root], selectedBlock) : undefined;
  const form =
    root && node
      ? [...pathTo([root], node.id)].reverse().find((n) => n.type === "form")
      : undefined;
  const bound =
    form && project.app?.forms.find((f) => f.id === form.props.form);
  const table =
    bound && project.app ? tableOf(project.app, bound.table) : undefined;
  if (!section || !form || !bound || bound.kind !== "submit" || !table)
    return null;
  const placed = placedFields(form, table);
  const fields = askable(table).filter(
    (f) =>
      !placed.includes(f.id) &&
      (!search ||
        `${f.name} ${fieldKind(f)} form field`.toLowerCase().includes(search)),
  );
  return (
    <section className="add-group">
      <h3>Form fields · {table.name}</h3>
      {fields.length ? (
        <div className="add-blocks">
          {fields.map((f) => (
            <button
              key={f.id}
              className="add-block"
              aria-label={`Add ${f.name} (${fieldKind(f)}) to the form`}
              onClick={() => {
                const studio = useStudio.getState();
                studio.updateNode(section.id, form.id, (n) =>
                  arrangeFields(n, [...placedFields(n, table), f.id], table),
                );
                const now = findSection(
                  useStudio.getState().project,
                  section.id,
                )?.root;
                const made = now && findFieldBlock(now, form.id, f.id);
                if (made) {
                  studio.select(section.id, made);
                  onBlock(section.id, made);
                }
              }}
            >
              <span className="add-block-icon add-field-icon">
                <Icon name={ICONS[f.type] ?? "edit"} size={18} />
              </span>
              <strong>{f.name}</strong>
              <small>
                {fieldKind(f)}
                {f.required ? " · required" : ""}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="add-hint">Every field of {table.name} is on this form.</p>
      )}
    </section>
  );
}

/** The id of the field block asking for `field` in the form block `formId`. */
function findFieldBlock(root: Node, formId: string, field: string) {
  const form = findNode([root], formId);
  const visit = (n: Node): string | undefined => {
    if (n.type === "field" && n.props.field === field) return n.id;
    for (const c of n.children ?? []) {
      const found = visit(c);
      if (found) return found;
    }
  };
  return form && visit(form);
}
