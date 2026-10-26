/**
 * Taking a step on a record. For the rewards app this is exactly the
 * reference's Approve dialog (typed reward, presets that only FILL the
 * field, the limit, a read-back of what will be awarded) and its Reject
 * dialog (a required reason, "awards no reward"). Other actions get the
 * same frame with their own fields.
 */
import { useMemo, useState } from "react";
import { ApiError } from "../cloud/client";
import {
  checkLimits,
  fieldOf,
  parseValues,
  statusOf,
  type AppAction,
  type AppRecord,
  type AppValue,
} from "../apps/model";
import { errorText } from "../apps/app-helpers";
import { useOwner } from "./context";
import {
  parseAmount,
  presetAmountFor,
  presetLabel,
  readRewardPresets,
} from "./format";
import { FieldInput, type FormValue } from "./FieldInput";
import { workflowFor, type Workflow } from "./roles";
import { useToast } from "./toast";
import {
  Button,
  DefinitionList,
  Field,
  IconTile,
  InlineAlert,
  Input,
  Modal,
  Segmented,
} from "./ui";
import {
  amountOf,
  cap,
  currencySymbol,
  gerund,
  isFinal,
  personOf,
  reasonLabel,
} from "./view";

const REASON_MAX = 300;

export function ActionDialog({
  record,
  action,
  onClose,
  onDone,
}: {
  record: AppRecord;
  action: AppAction;
  onClose: () => void;
  onDone?: () => void;
}) {
  const ctx = useOwner();
  const w = workflowFor(ctx.model, record.table);
  if (!w) return null;
  const rewardAction =
    !!w.reward && action.set.includes(w.reward.id) && w.reward.type === "money";
  return rewardAction ? (
    <ApproveDialog
      w={w}
      record={record}
      action={action}
      onClose={onClose}
      onDone={onDone}
    />
  ) : (
    <StepDialog
      w={w}
      record={record}
      action={action}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

interface Props {
  w: Workflow;
  record: AppRecord;
  action: AppAction;
  onClose: () => void;
  onDone?: () => void;
}

/** Shared state for both dialogs: submitting, the 409 conflict, other errors. */
function useSubmit({ record, action, onClose, onDone }: Props) {
  const ctx = useOwner();
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState("");
  const [failure, setFailure] = useState("");
  const submit = async (
    values: Record<string, AppValue>,
    note: string,
    success: () => void,
  ) => {
    // The in-flight guard: a double tap can't award twice (the server's
    // revision check is the backstop).
    if (busy) return;
    setBusy(true);
    setConflict("");
    setFailure("");
    try {
      await ctx.actions.runAction(record, action, values, note);
      success();
      onDone?.();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        setConflict(errorText(error, "This record changed."));
      else setFailure(errorText(error, "That didn't work. Try again."));
      setBusy(false);
    }
  };
  return { busy, conflict, failure, submit };
}

function ConflictAlert({
  conflict,
  failure,
}: {
  conflict: string;
  failure: string;
}) {
  return (
    <>
      {conflict && (
        <InlineAlert tone="danger" title={conflict}>
          The queue has been refreshed with what the server has.
        </InlineAlert>
      )}
      {failure && <InlineAlert tone="danger">{failure}</InlineAlert>}
    </>
  );
}

function ApproveDialog(props: Props) {
  const { w, record, action, onClose } = props;
  const ctx = useOwner();
  const toast = useToast();
  const reward = w.reward!;
  const currency = ctx.model.app.currency;
  // Read when the dialog opens, so presets saved in Settings apply at once.
  const presets = useMemo(() => readRewardPresets(ctx.siteId), [ctx.siteId]);
  const [amount, setAmount] = useState("");
  const [preset, setPreset] = useState("");
  const [error, setError] = useState<string>();
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState<Record<string, FormValue>>({});
  const [extraError, setExtraError] = useState<{
    field: string;
    error: string;
  }>();
  const { busy, conflict, failure, submit } = useSubmit(props);

  const person = personOf(ctx, w, record);
  const purchase = amountOf(w.amount, record);
  const limited =
    !!w.amount && action.limits.some((l) => l.field === reward.id);
  const parsed = parseAmount(amount);
  const min = reward.min ?? 0.01;
  const valid =
    parsed !== null &&
    parsed >= min &&
    parsed > 0 &&
    (!limited || parsed <= purchase);
  const singular = w.table.singular.toLowerCase();
  const rewardWord = reward.name.toLowerCase();
  const amountWord = (w.amount?.name ?? "purchase amount").toLowerCase();
  const others = action.set
    .filter((id) => id !== reward.id)
    .map((id) => fieldOf(w.table, id))
    .filter((f) => !!f);

  const applyPreset = (value: string) => {
    setPreset(value);
    setAmount(String(presetAmountFor(value, presets.mode, purchase)));
    setError(undefined);
  };
  const approve = () => {
    if (amount.trim() === "")
      return setError(`Enter the ${rewardWord} you are awarding`);
    if (parsed === null)
      return setError("Enter an amount with at most two decimals");
    if (parsed <= 0 || parsed < min)
      return setError(`${cap(rewardWord)} must be greater than zero`);
    if (limited && parsed > purchase)
      return setError(`${cap(rewardWord)} cannot exceed the ${amountWord}`);
    if (reward.max !== undefined && parsed > reward.max)
      return setError(
        `${cap(rewardWord)} can be at most ${ctx.money(reward.max)}`,
      );
    const rest = parseValues(
      w.table,
      others.map((f) => f.id),
      extra,
    );
    if (!rest.ok)
      return setExtraError({ field: rest.field, error: rest.error });
    if (action.note === "required" && !note.trim())
      return setExtraError({ field: "note", error: "Add a note." });
    const values = { ...rest.values, [reward.id]: parsed };
    const limit = checkLimits(w.table, action, { ...record.values, ...values });
    if (limit) return setError(limit);
    void submit(values, note.trim(), () => {
      const to = statusOf(w.table, action.to)?.name ?? action.name;
      toast(
        "success",
        `${to} · ${ctx.money(parsed)} ${rewardWord}`,
        `${record.ref ? `${record.ref} for ` : ""}${person.name}`,
      );
    });
  };

  return (
    <Modal
      title={`${action.name} ${w.noun}`}
      description={`Set the ${rewardWord} you're awarding for this ${singular}.`}
      icon={<IconTile icon="checkCircle" tone="success" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" loading={busy} onClick={approve}>
            {`${action.name} and award`}
          </Button>
        </>
      }
    >
      <DefinitionList
        items={[
          ...(record.ref
            ? [
                {
                  term: "Reference",
                  value: <span className="ow-mono">{record.ref}</span>,
                },
              ]
            : []),
          ...(w.person
            ? [
                {
                  term: w.person.table.singular,
                  value: person.phone
                    ? `${person.name} · ${person.phone}`
                    : person.name,
                },
              ]
            : []),
          ...(w.amount
            ? [
                {
                  term: w.amount.name,
                  value: (
                    <span className="ow-amount">{ctx.money(purchase)}</span>
                  ),
                },
              ]
            : []),
          ...(w.description && w.description.id !== w.amount?.id
            ? [
                {
                  term: "Description",
                  value: (
                    <span className="ow-ddPlain">
                      {String(record.values[w.description.id] ?? "")}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Field
        label={`${reward.name} amount`}
        error={error}
        hint={
          limited
            ? `Required. Greater than zero and no more than ${ctx.money(purchase)}.`
            : "Required. Greater than zero."
        }
      >
        {(field) => (
          <Input
            {...field}
            large
            inputMode="decimal"
            prefix={currencySymbol(currency)}
            placeholder="0"
            data-autofocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setPreset("");
              setError(undefined);
            }}
          />
        )}
      </Field>

      <div className="ow-rowWrap">
        <span className="ow-subtle">Quick set</span>
        <Segmented
          label="Reward preset"
          value={preset}
          options={presets.values.map((value) => ({
            value,
            label: presetLabel(value, presets.mode, currency),
          }))}
          onChange={applyPreset}
        />
      </div>

      {others.map((f) => (
        <FieldInput
          key={f.id}
          field={f}
          value={extra[f.id]}
          error={extraError?.field === f.id ? extraError.error : undefined}
          onChange={(v) => {
            setExtra((x) => ({ ...x, [f.id]: v }));
            setExtraError(undefined);
          }}
        />
      ))}
      {action.note !== "none" && (
        <NoteField
          label="Note"
          required={action.note === "required"}
          value={note}
          error={extraError?.field === "note" ? extraError.error : undefined}
          onChange={(v) => {
            setNote(v);
            setExtraError(undefined);
          }}
        />
      )}

      {valid && parsed !== null && (
        <InlineAlert tone="success" icon="wallet">
          {`${person.name} will be awarded ${ctx.money(parsed)} for this ${singular}.`}
        </InlineAlert>
      )}
      <ConflictAlert conflict={conflict} failure={failure} />
    </Modal>
  );
}

function NoteField({
  label,
  required,
  value,
  error,
  hint,
  placeholder,
  onChange,
}: {
  label: string;
  required: boolean;
  value: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label={label}
      optional={!required}
      error={error}
      hint={hint}
      counter={`${value.length} / ${REASON_MAX}`}
    >
      {(field) => (
        <textarea
          {...field}
          className="ow-textarea"
          rows={3}
          maxLength={REASON_MAX}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** Reject, and any other step: its fields, its note, the same frame. */
function StepDialog(props: Props) {
  const { w, record, action, onClose } = props;
  const ctx = useOwner();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [error, setError] = useState<{ field: string; error: string }>();
  const { busy, conflict, failure, submit } = useSubmit(props);
  const person = personOf(ctx, w, record);
  const danger = action.tone === "danger";
  const fields = action.set
    .map((id) => fieldOf(w.table, id))
    .filter((f) => !!f);
  const personWord = w.person?.table.singular.toLowerCase() ?? "visitor";
  const lookup = ctx.model.app.forms.find(
    (f) => f.kind === "lookup" && f.history?.table === w.table.id,
  );
  const page = lookup?.title.replace(/^my\s+/i, "").toLowerCase();
  const final = isFinal(w, action.to);
  const to = statusOf(w.table, action.to);

  const run = () => {
    const parsed = parseValues(
      w.table,
      fields.map((f) => f.id),
      values,
    );
    if (!parsed.ok)
      return setError({ field: parsed.field, error: parsed.error });
    if (fields.length) {
      const limit = checkLimits(w.table, action, {
        ...record.values,
        ...parsed.values,
      });
      if (limit) return setError({ field: fields[0].id, error: limit });
    }
    const text = note.trim();
    if (action.note === "required" && !text)
      return setError({
        field: "note",
        error: w.person
          ? `Give a reason so the ${personWord} can correct it`
          : "Give a reason.",
      });
    if (text.length > REASON_MAX)
      return setError({
        field: "note",
        error: `Keep the reason under ${REASON_MAX} characters`,
      });
    void submit(parsed.values, text, () => {
      const status = to?.name.toLowerCase() ?? "done";
      if (danger)
        toast(
          "warning",
          `${cap(w.noun)} ${status}`,
          `${record.ref || person.name}${w.reward ? ` · no ${w.reward.name.toLowerCase()} awarded` : ""}`,
        );
      else
        toast("success", `${cap(w.noun)} ${status}`, record.ref || person.name);
    });
  };

  return (
    <Modal
      title={`${action.name} ${w.noun}`}
      description={
        action.note !== "none" && lookup && w.person
          ? `The ${personWord} sees this reason on their ${page} page.`
          : action.note !== "none"
            ? "The note is kept with the record."
            : `Moves it to ${to?.name ?? action.to}.`
      }
      icon={
        <IconTile
          icon={danger ? "xCircle" : "checkCircle"}
          tone={danger ? "danger" : "success"}
        />
      }
      urgent={danger}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "success"}
            loading={busy}
            onClick={run}
          >
            {`${action.name} ${w.noun}`}
          </Button>
        </>
      }
    >
      <DefinitionList
        items={[
          ...(record.ref
            ? [
                {
                  term: "Reference",
                  value: <span className="ow-mono">{record.ref}</span>,
                },
              ]
            : []),
          ...(w.person
            ? [{ term: w.person.table.singular, value: person.name }]
            : []),
          ...(w.amount
            ? [
                {
                  term: w.amount.name,
                  value: (
                    <span className="ow-amount">
                      {ctx.money(amountOf(w.amount, record))}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      {fields.map((f, i) => (
        <FieldInput
          key={f.id}
          field={f}
          autoFocus={i === 0}
          value={values[f.id]}
          error={error?.field === f.id ? error.error : undefined}
          onChange={(v) => {
            setValues((x) => ({ ...x, [f.id]: v }));
            setError(undefined);
          }}
        />
      ))}
      {action.note !== "none" && (
        <NoteField
          label={reasonLabel(action)}
          required={action.note === "required"}
          value={note}
          error={error?.field === "note" ? error.error : undefined}
          hint={
            w.person
              ? `Keep it specific, so the ${personWord} knows what to fix.`
              : undefined
          }
          placeholder={
            w.reward ? "No matching bill found for this date" : undefined
          }
          onChange={(v) => {
            setNote(v);
            setError(undefined);
          }}
        />
      )}
      {danger && w.reward ? (
        <InlineAlert tone="warning">
          {`${gerund(action.name)} awards no ${w.reward.name.toLowerCase()}${
            final
              ? `, and cannot be undone — the ${personWord} would have to record the ${w.table.singular.toLowerCase()} again.`
              : "."
          }`}
        </InlineAlert>
      ) : danger && final ? (
        <InlineAlert tone="warning">This cannot be undone.</InlineAlert>
      ) : null}
      <ConflictAlert conflict={conflict} failure={failure} />
    </Modal>
  );
}
