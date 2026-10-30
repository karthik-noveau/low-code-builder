/**
 * Form blocks that keep a classic look (converted from the classic smart
 * blocks by src/blocks/legacy.ts):
 *
 * - `look: "classic"`: an app form drawn with the classic App form markup
 *   (src/apps/AppSection.tsx), so published pages look and behave exactly as
 *   before. The words come from the form's blocks: the title and intro
 *   (`part: "title" | "intro"`), the field blocks' labels, examples and help,
 *   the buttons' labels and the steps' headings and notes. Blocks the owner
 *   adds inside are drawn in their step. Choosing the "Blocks" look lays the
 *   same blocks out freely instead (FormBlocks.tsx).
 * - `target: "inbox"`: a Contact or Email signup form posting to the Forma
 *   inbox (or the owner's own endpoint) with the classic markup: a hidden
 *   `form` kind, the honeypot, and boxes named name, email and message.
 */
import { useRef, useState, type ReactNode } from "react";
import type { FormCustom } from "../../apps/AppSection";
import { appSectionProblem } from "../../apps/issues";
import { tableOf, type App, type AppForm } from "../../apps/model";
import { InlineText } from "../../studio/InlineText";
import { AppFormArea, SiteForm } from "../../studio/siteParts";
import { inboxKind, INBOX_FIELDS, type InboxField } from "./inbox";
import type { Node, PropValue } from "../model";
import { BLOCKS } from "../registry";
import { Nodes, Placeholder, type RenderContext } from "../render";
import { classicPart, readClassic, type Classic } from "./classicWords";
import { identityField } from "./model";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
type Attrs = Record<string, string | undefined>;
const TYPING_LABELS: Record<string, string> = {
  label: "Edit field label",
  hint: "Edit field help",
};

/** The app with the field blocks' labels, examples and help on its fields. */
function withLabels(app: App, form: AppForm, classic: Classic): App {
  const relabel = (tableId: string, ids: Map<string, string>) =>
    app.tables.map((t) =>
      t.id !== tableId
        ? t
        : {
            ...t,
            fields: t.fields.map((f) => {
              const key = ids.get(f.id);
              const n = key ? classic.fields.get(key) : undefined;
              if (!n) return f;
              return {
                ...f,
                name: str(n.props.label).trim() || f.name,
                hint: str(n.props.hint).trim() || f.hint,
                placeholder: str(n.props.placeholder).trim() || f.placeholder,
              };
            }),
          },
    );
  const ids = new Map<string, string>();
  for (const key of classic.fields.keys())
    if (!["identity", "value", "verify"].includes(key)) ids.set(key, key);
  if (form.kind === "lookup") {
    if (form.key) ids.set(form.key, "value");
    if (form.verify) ids.set(form.verify, "verify");
  }
  let next: App = { ...app, tables: relabel(form.table, ids) };
  const who = identityField(app, form);
  if (who && form.identify)
    next = {
      ...next,
      tables: next.tables.map((t) =>
        t.id === form.identify!.table
          ? (relabel(t.id, new Map([[who.id, "identity"]])).find(
              (x) => x.id === t.id,
            ) ?? t)
          : t,
      ),
    };
  return next;
}

/** An app form block with the classic look. */
export function ClassicForm({
  node: n,
  ctx,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Attrs;
}) {
  // Which piece is being typed into (a field has its label and its help).
  const [typingKey, setTypingKey] = useState<{
    id: string;
    key: string;
  } | null>(null);
  const press = useRef<{ at: number; target: Element } | null>(null);
  const edit = ctx.edit;
  const editing = !!edit;
  const project = ctx.project;
  const app = project.app;
  const form = app?.forms.find((f) => f.id === str(n.props.form));
  const table = form && app ? tableOf(app, form.table) : undefined;
  if (!app || !form || !table) {
    if (!editing) return null;
    return (
      <Placeholder
        icon="activity"
        title="App form"
        action={
          app?.forms.length
            ? "Choose which form to show in the panel on the right."
            : "Set up your business app first (App in the left panel)."
        }
        attrs={attrs}
        className={className}
      />
    );
  }
  // Published pages show nothing for a form that's gone.
  if (ctx.exporting && appSectionProblem(app, form.id)) return null;
  const classic = readClassic(n, form, ctx.edit?.selected ?? null);
  const shown: AppForm = {
    ...form,
    title: classic.title ? str(classic.title.props.text) : form.title,
    intro: classic.intro ? str(classic.intro.props.text) : "",
    button: classic.button ?? form.button,
    copy: { ...form.copy, ...classic.copy },
  };
  const nextApp = withLabels(
    {
      ...app,
      forms: app.forms.map((f) => (f.id === form.id ? shown : f)),
    },
    shown,
    classic,
  );
  const mark = (node: Node | undefined): Attrs | undefined =>
    editing && node
      ? { "data-node-id": node.id, "data-node-type": node.type }
      : undefined;
  const extras = (list: Node[]): ReactNode =>
    list.length ? <Nodes nodes={list} ctx={ctx} /> : null;
  const custom: FormCustom = {
    words: classic.words,
    extras: {
      identify: extras(classic.extras.identify),
      fields: extras(classic.extras.fields),
      lookup: extras(classic.extras.lookup),
    },
    attrs: (key) => mark(classic.fields.get(key) ?? classic.buttons.get(key)),
    text: edit
      ? (key, shown) => {
          const part = classicPart(classic, key);
          if (!part) return shown;
          const { node, prop } = part;
          const value = str(node.props[prop]);
          const last = typingKey;
          const start = () => {
            setTypingKey({ id: node.id, key });
            edit.onStartTyping(node.id);
          };
          return (
            <InlineText
              as="span"
              value={value.trim() ? value : shown}
              enabled
              editing={
                edit.typing === node.id &&
                (last?.id === node.id ? last.key === key : prop !== "hint")
              }
              label={
                node.type === "submit"
                  ? "Edit button text"
                  : (TYPING_LABELS[prop] ??
                    `Edit ${BLOCKS[node.type].label.toLowerCase()} text`)
              }
              onCommit={(v) => edit.onCommit(node.id, prop, v)}
              onActivate={() => edit.onSelect(node.id)}
              onStartEdit={start}
              onFinishEdit={edit.onFinishTyping}
              onDraft={edit.onDraft}
              attrs={{ ...mark(node), "data-typed": key }}
              render={() => shown}
            />
          );
        }
      : undefined,
  };
  /** Starts typing into a piece's words, from the element it's drawn in. */
  const typeInto = (el: Element | null | undefined) => {
    const id = (el as HTMLElement | null)?.dataset?.typed;
    const part = id ? classicPart(classic, id) : undefined;
    if (!edit || !id || !part || el?.matches(".is-editing")) return;
    setTypingKey({ id: part.node.id, key: id });
    edit.onStartTyping(part.node.id);
  };
  return (
    <div
      {...attrs}
      className={className.replace(/\bblk-form\b/, "blk-appForm")}
      // A block's words are typed into from anywhere around them (a
      // heading's whole line, a field's label row) and in its buttons. The
      // buttons are disabled here and only get pointer events, so a double
      // press counts as a double-click.
      onDoubleClick={
        edit
          ? (e) => {
              for (
                let el = e.target as Element | null;
                el && el !== e.currentTarget;
                el = el.parentElement
              ) {
                const words = Array.from(el.querySelectorAll(".inline-copy"));
                if (!words.length) continue;
                const ids = new Set(
                  words.map((w) => w.getAttribute("data-node-id")),
                );
                if (ids.size === 1 && !words.includes(e.target as Element))
                  typeInto(words[0]);
                return;
              }
            }
          : undefined
      }
      onPointerDown={
        edit
          ? (e) => {
              const target =
                (e.target as Element)
                  .closest("button:disabled")
                  ?.querySelector(".inline-copy:not(.is-editing)") ?? null;
              const last = press.current;
              press.current = target ? { at: e.timeStamp, target } : null;
              if (
                target &&
                last?.target === target &&
                e.timeStamp - last.at < 500
              ) {
                press.current = null;
                typeInto(target);
              }
            }
          : undefined
      }
    >
      <AppFormArea
        project={{ ...project, app: nextApp }}
        formId={form.id}
        prefix={n.id}
        pageName={ctx.page?.name}
        heading={!!classic.title}
        main={str(classic.title?.props.level) === "1"}
        exporting={ctx.exporting}
        appApi={ctx.appApi}
        href={ctx.href}
        custom={custom}
        titleAttrs={mark(classic.title)}
      />
    </div>
  );
}

/** A Contact or Email signup form block (posts to the inbox). */
export function InboxForm({
  node: n,
  ctx,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Attrs;
}) {
  const kind = inboxKind(n);
  const editing = !!ctx.edit;
  const known = INBOX_FIELDS.contact;
  const fields: InboxField[] = [];
  const extras: Node[] = [];
  let button: Node | undefined;
  for (const c of n.children ?? []) {
    if (c.hidden && ctx.edit?.selected !== c.id) continue;
    const name = str(c.props.field);
    const base = known.find((f) => f.name === name);
    if (c.type === "field" && base && !fields.some((f) => f.name === name))
      fields.push({
        name: base.name,
        label: str(c.props.label) || base.label,
        placeholder: str(c.props.placeholder),
        hideLabel: c.props.hideLabel === true,
        attrs: editing
          ? { "data-node-id": c.id, "data-node-type": c.type }
          : undefined,
      });
    else if (c.type === "submit" && !button) button = c;
    else if (c.type !== "field" && c.type !== "submit") extras.push(c);
  }
  // The inbox always needs an email address to answer.
  if (!fields.some((f) => f.name === "email"))
    fields.push(INBOX_FIELDS[kind].find((f) => f.name === "email")!);
  return (
    <SiteForm
      kind={kind}
      buttonLabel={str(button?.props.label)}
      formAction={str(n.props.action)}
      inbox={ctx.inbox}
      editing={editing}
      exporting={ctx.exporting}
      className={className.replace(
        /\bblk-form\b/,
        kind === "contact" ? "blk-contactForm" : "blk-newsletter",
      )}
      attrs={attrs}
      fields={fields}
      extras={extras.length ? <Nodes nodes={extras} ctx={ctx} /> : null}
      buttonAttrs={
        editing && button
          ? { "data-node-id": button.id, "data-node-type": button.type }
          : undefined
      }
    />
  );
}
