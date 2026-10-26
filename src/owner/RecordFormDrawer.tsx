/**
 * Adding or editing a record, as the reference's customer form drawer:
 * the table's fields, a unique phone checked before saving ("This number is
 * already registered to Ravi Kumar"), and a confirmation before discarding.
 */
import { useMemo, useState } from "react";
import { ApiError } from "../cloud/client";
import {
  normalizePhone,
  parseValues,
  recordTitle,
  type AppField,
  type AppRecord,
  type AppTable,
} from "../apps/model";
import { errorText } from "../apps/app-helpers";
import { useOwner } from "./context";
import { FieldInput, type FormValue } from "./FieldInput";
import { useToast } from "./toast";
import { Button, Drawer, IconTile, InlineAlert } from "./ui";

const editable = (table: AppTable) =>
  table.fields.filter((f) => f.id !== table.pausedField && f.type !== "items");
const initial = (table: AppTable, record?: AppRecord) =>
  Object.fromEntries(
    editable(table).map((f) => {
      const v = record?.values[f.id];
      return [
        f.id,
        f.type === "yesNo" ? v === true : v === undefined ? "" : String(v),
      ];
    }),
  ) as Record<string, FormValue>;

/** "This phone is already used by Ravi Kumar." → the reference's wording. */
function duplicateText(field: AppField, holder: string) {
  const noun = field.type === "phone" ? "number" : field.name.toLowerCase();
  return holder
    ? `This ${noun} is already registered to ${holder}`
    : `This ${noun} is already registered`;
}

export function RecordFormDrawer({
  table,
  record,
  onClose,
  onSaved,
}: {
  table: AppTable;
  record?: AppRecord;
  onClose: () => void;
  onSaved?: (record: AppRecord) => void;
}) {
  const ctx = useOwner();
  const toast = useToast();
  const start = useMemo(() => initial(table, record), [table, record]);
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fields = editable(table);
  const dirty = JSON.stringify(values) !== JSON.stringify(start);
  const editing = !!record;
  const identify = ctx.model.app.forms.find(
    (f) => f.identify?.table === table.id,
  )?.identify?.field;
  const name = recordTitle(
    table,
    record ?? ({ values: {}, ref: "" } as unknown as AppRecord),
  );

  const close = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };
  const submit = async () => {
    if (saving) return;
    const parsed = parseValues(
      table,
      fields.map((f) => f.id),
      values,
    );
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error });
      return;
    }
    // A unique value already on another record is refused here, before the round trip.
    for (const f of fields.filter((f) => f.unique)) {
      const mine = parsed.values[f.id];
      if (mine === undefined || mine === "") continue;
      const same = (v: unknown) =>
        f.type === "phone"
          ? normalizePhone(String(v ?? "")) === normalizePhone(String(mine))
          : String(v ?? "").toLowerCase() === String(mine).toLowerCase();
      const holder = ctx
        .records(table.id)
        .find((r) => r.id !== record?.id && same(r.values[f.id]));
      if (holder) {
        setErrors({ [f.id]: duplicateText(f, recordTitle(table, holder)) });
        return;
      }
    }
    const out = { ...parsed.values };
    // An emptied optional field is cleared on the server.
    if (editing)
      for (const f of fields)
        if (out[f.id] === undefined && record.values[f.id] !== undefined)
          out[f.id] = "";
    setSaving(true);
    setFailure("");
    try {
      const saved = editing
        ? await ctx.actions.updateRecord(record, out)
        : await ctx.actions.createRecord(table.id, out);
      toast(
        "success",
        editing ? `${table.singular} updated` : `${table.singular} added`,
        recordTitle(table, saved),
      );
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setSaving(false);
      const field = error instanceof ApiError ? error.field : undefined;
      const target = fields.find((f) => f.id === field);
      if (target) {
        const holder = /already used by (.+?)\.?$/.exec(
          error instanceof Error ? error.message : "",
        )?.[1];
        setErrors({
          [target.id]:
            target.unique && /already/.test((error as Error).message)
              ? duplicateText(target, holder ?? "")
              : errorText(error, "Check this field."),
        });
      } else setFailure(errorText(error, "That didn't save. Try again."));
    }
  };

  return (
    <Drawer
      title={
        editing
          ? `Edit ${table.singular.toLowerCase()}`
          : `New ${table.singular.toLowerCase()}`
      }
      description={
        editing
          ? name
          : table.private
            ? `Only you can register a ${table.singular.toLowerCase()}.`
            : `Add a ${table.singular.toLowerCase()} yourself.`
      }
      icon={<IconTile icon={editing ? "edit" : "userPlus"} />}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={() => void submit()}
          >
            {editing ? "Save changes" : `Add ${table.singular.toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form
        className="ow-stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {confirmDiscard && (
          <InlineAlert tone="warning" title="Discard your changes?">
            <div className="ow-discardRow">
              <span>Closing now loses what you have typed.</span>
              <Button variant="dangerQuiet" size="sm" onClick={onClose}>
                Discard
              </Button>
            </div>
          </InlineAlert>
        )}
        {fields.map((f, i) => (
          <FieldInput
            key={f.id}
            field={f}
            autoFocus={i === 0}
            value={values[f.id]}
            error={errors[f.id]}
            hint={
              f.id === identify && !f.hint
                ? `How the ${table.singular.toLowerCase()} signs in to record a purchase. It must be unique.`
                : f.unique && !f.hint
                  ? "It must be unique."
                  : undefined
            }
            onChange={(v) => {
              setValues((x) => ({ ...x, [f.id]: v }));
              setErrors({});
              setConfirmDiscard(false);
            }}
          />
        ))}
        {failure && <InlineAlert tone="danger">{failure}</InlineAlert>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
