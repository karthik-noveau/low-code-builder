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
import type { ReactNode } from "react";
import type { FormCustom } from "../../apps/AppSection";
import { appSectionProblem } from "../../apps/issues";
import {
  tableOf,
  type App,
  type AppForm,
  type FormCopyKey,
} from "../../apps/model";
import { AppFormArea, SiteForm } from "../../studio/siteParts";
import { inboxKind, INBOX_FIELDS, type InboxField } from "./inbox";
import type { Node, PropValue } from "../model";
import { Nodes, Placeholder, type RenderContext } from "../render";
import { identityField, IDENTITY, stepKind } from "./model";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
type Attrs = Record<string, string | undefined>;
type Zone = "identify" | "confirm" | "fields" | "lookup" | "done";

/** What a classic form block's blocks say, read by where they sit. */
interface Classic {
  title?: Node;
  intro?: Node;
  copy: Partial<Record<FormCopyKey, string>>;
  button?: string;
  words: NonNullable<FormCustom["words"]>;
  /** Field id (or "identity", "value", "verify") → its block. */
  fields: Map<string, Node>;
  buttons: Map<string, Node>;
  extras: Record<"identify" | "fields" | "lookup", Node[]>;
}

function readClassic(form: Node, app: AppForm, editing: string | null) {
  const out: Classic = {
    copy: {},
    words: {},
    fields: new Map(),
    buttons: new Map(),
    extras: { identify: [], fields: [], lookup: [] },
  };
  const visible = (n: Node) => !n.hidden || editing === n.id;
  const zoneOf = (step: Node): Zone => {
    const kind = stepKind(step);
    return kind === "identify"
      ? "identify"
      : kind === "confirm"
        ? "confirm"
        : "fields";
  };
  const heads: Partial<Record<Zone, FormCopyKey>> = {
    identify: "identifyTitle",
    lookup: "identifyTitle",
    confirm: "confirmTitle",
    fields: "fieldsTitle",
    done: "doneTitle",
  };
  const read = (nodes: Node[], zone: Zone) => {
    let pastButton = false;
    let headed = false;
    let introduced = false;
    for (const n of nodes.filter(visible)) {
      const extra = () => {
        if (zone !== "confirm" && zone !== "done") out.extras[zone].push(n);
      };
      switch (n.type) {
        case "field": {
          const id = str(n.props.field);
          const key =
            zone === "identify" || id === IDENTITY
              ? "identity"
              : zone === "lookup"
                ? id === app.key
                  ? "value"
                  : id === app.verify
                    ? "verify"
                    : ""
                : id;
          if (key && !out.fields.has(key)) out.fields.set(key, n);
          break;
        }
        case "submit": {
          const action = str(n.props.action) || "submit";
          const label = str(n.props.label);
          if (action === "submit") {
            pastButton = true;
            if (zone === "identify") {
              out.words.continue = label;
              out.buttons.set("continue", n);
            } else if (zone === "fields" || zone === "lookup") {
              out.button = label;
              out.buttons.set("button", n);
            }
          } else if (
            action === "confirm" ||
            action === "change" ||
            action === "again"
          )
            out.words[action] = label;
          break;
        }
        case "heading": {
          const key = heads[zone];
          if (key && !headed) {
            headed = true;
            out.copy[key] = str(n.props.text);
          } else extra();
          break;
        }
        case "text": {
          const value = str(n.props.text);
          if (zone === "done" && value.includes("{message}")) break;
          if (zone === "fields" && value.includes("{name}")) {
            out.copy.fieldsIntro = value.replace(/\s*\{name\}\s*$/, "");
            break;
          }
          if (zone === "confirm" && !introduced) {
            introduced = true;
            out.copy.confirmIntro = value;
          } else if (
            (zone === "identify" || zone === "lookup") &&
            !pastButton &&
            !introduced
          ) {
            introduced = true;
            out.copy.identifyIntro = value;
          } else if ((zone === "identify" || zone === "lookup") && pastButton)
            out.copy.identifyNote = value;
          else if (zone === "fields" && pastButton) out.copy.fieldsNote = value;
          else extra();
          break;
        }
        case "formRecord":
        case "formError":
        case "formSteps":
          break;
        case "icon":
          if (zone !== "done") extra();
          break;
        default:
          extra();
      }
    }
  };
  const top: Node[] = [];
  for (const c of (form.children ?? []).filter(visible)) {
    if (c.props.part === "title" && c.type === "heading" && !out.title)
      out.title = c;
    else if (c.props.part === "intro" && c.type === "text" && !out.intro)
      out.intro = c;
    else if (c.type === "formStep") read(c.children ?? [], zoneOf(c));
    else if (c.type === "formSuccess") read(c.children ?? [], "done");
    else top.push(c);
  }
  read(top, app.kind === "lookup" ? "lookup" : "fields");
  return out;
}

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
  const editing = !!ctx.edit;
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
  };
  return (
    <div
      {...attrs}
      className={className.replace(/\bblk-form\b/, "blk-appForm")}
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
