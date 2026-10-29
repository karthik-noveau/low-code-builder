/**
 * Draws form blocks (see model.ts). The published markup follows the app
 * widget's contract (src/apps/AppSection.tsx, widget.ts), so APP_SCRIPT
 * drives a form built from blocks exactly like the classic App form:
 *
 * - the form block is `.app-form[data-app-api][data-form][data-blocks-form]`;
 * - its questions are one `<form data-step="fields">` (each "Questions" step
 *   a `[data-page]` in it), the "who are you" step `<form data-step=
 *   "identify">`, "Is this you?" `[data-step=confirm]`, a lookup's questions
 *   `<form data-step="lookup">` and its result `[data-step=result]`;
 * - after sending `[data-step=done]` holds the owner's success blocks, and
 *   `[data-form-error]` the failure blocks; text with {ref}, {message},
 *   {status} or {name} is filled in by the widget;
 * - steps the owner didn't build (unknown account, paused, offline, payment,
 *   loading) are the classic ones.
 *
 * In the editor every step shows, labelled, with inputs that don't take
 * focus. In the studio preview and ZIP exports only the first step shows,
 * with disabled inputs and a note saying where it works.
 */
import type { ReactNode } from "react";
import { Icon } from "../../studio/Icon";
import { InlineText } from "../../studio/InlineText";
import {
  ErrorLine,
  FlowResult,
  IdentityCard,
  IdentifyScreens,
  ItemChoice,
  LookupLoading,
  LookupScreens,
  Offline,
  PayStep,
  Picker,
  PlainResult,
} from "../../apps/AppSection";
import { currencySymbol, makeCatalog, type Catalog } from "../../apps/catalog";
import { appLinks, type AppLinks } from "../../apps/links";
import {
  fieldOf,
  REF_KEY,
  tableOf,
  type App,
  type AppField,
  type AppForm,
  type AppTable,
} from "../../apps/model";
import { walk, type Node, type PropValue } from "../model";
import { BLOCKS } from "../registry";
import { Nodes, Placeholder, type RenderContext } from "../render";
import { identityField, IDENTITY, stepKind, type StepKind } from "./model";
import { recipeById, recipePreview } from "./recipes";
import { formChildren } from "./sync";
import { ClassicForm, InboxForm } from "./classic";
import { isClassicForm, isInboxForm } from "./inbox";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");

/** What blocks inside a form know about it (RenderContext.form). */
export interface FormScope {
  app: App;
  form: AppForm;
  table: AppTable;
  /** Published with the app API: the widget drives it. */
  live: boolean;
  /** The editor canvas: every step shows. */
  editing: boolean;
  /** Makes element ids unique on the page (the form block's id). */
  prefix: string;
  catalog: Catalog;
  /** Which part of the form a block is in. */
  part:
    | "questions"
    | "identify"
    | "confirm"
    | "lookup"
    | "result"
    | "done"
    | "error"
    | "outside";
  /** Field ids under which "N places left" shows (capacity). */
  placesAfter: Set<string>;
  /** The steps, for the step indicator: [widget key, label]. */
  steps: [string, string][];
  links: AppLinks;
  /** A step-by-step lookup (one record with a highlighted total). */
  flow: boolean;
}

/** Classes and editor attributes for a form part drawn by the form block. */
function partProps(n: Node, ctx: RenderContext, ...extra: (string | false)[]) {
  const edit = ctx.edit;
  return {
    className: [
      "blk",
      `blk-${n.type}`,
      `n-${n.id}`,
      edit?.selected === n.id && "is-node-selected",
      n.hidden && "is-node-hidden",
      ...extra,
    ]
      .filter(Boolean)
      .join(" "),
    ...(edit ? { "data-node-id": n.id, "data-node-type": n.type } : {}),
  };
}
const shown = (nodes: Node[] | undefined, ctx: RenderContext) =>
  (nodes ?? []).filter((n) => !n.hidden || ctx.edit?.selected === n.id);
/** The form's blocks as a new form gets them, with ids stable per form block. */
function defaults(app: App, form: AppForm, owner: Node) {
  const nodes = formChildren(app, form);
  let i = 0;
  for (const n of walk(nodes)) n.id = `${owner.id}-d${i++}`;
  return nodes;
}
const STEP_NAMES: Record<StepKind, string> = {
  identify: "Who are you?",
  confirm: "Is this you?",
  details: "Questions",
};

/** The reference-number "field" lookups by reference ask for. */
const refField = (table: AppTable): AppField => ({
  id: REF_KEY,
  name: "Reference number",
  type: "text",
  required: true,
  options: [],
  placeholder: `${table.prefix}-1001`,
});

export function FormBlock({
  node: n,
  ctx,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const editing = !!ctx.edit;
  const hint = (icon: string, title: string, action: string) =>
    editing ? (
      <Placeholder
        icon={icon}
        title={title}
        action={action}
        attrs={attrs}
        className={className}
        compact={n.type !== "form"}
      />
    ) : null;
  const scope = ctx.form;
  switch (n.type) {
    case "form":
      if (scope)
        return hint(
          "checklist",
          "Form inside a form",
          "Move it out: a form can’t hold another form.",
        );
      if (isInboxForm(n))
        return (
          <InboxForm node={n} ctx={ctx} className={className} attrs={attrs} />
        );
      if (isClassicForm(n))
        return (
          <ClassicForm node={n} ctx={ctx} className={className} attrs={attrs} />
        );
      return (
        <FormRoot node={n} ctx={ctx} className={className} attrs={attrs} />
      );
    case "field":
      if (!scope)
        return hint("edit", "Field", "Put fields inside a form block.");
      return (
        <FieldBlock
          node={n}
          scope={scope}
          className={className}
          attrs={attrs}
        />
      );
    case "submit":
      if (!scope)
        return hint(
          "send",
          "Form button",
          "Put form buttons inside a form block.",
        );
      return (
        <FormButton
          node={n}
          ctx={ctx}
          scope={scope}
          className={className}
          attrs={attrs}
        />
      );
    case "formSteps": {
      if (!scope)
        return hint(
          "checklist",
          "Step indicator",
          "Put it inside a form block.",
        );
      if (scope.steps.length < 2)
        return hint(
          "checklist",
          "Step indicator",
          "Add two or more form steps to number them.",
        );
      return (
        <ol
          {...attrs}
          className={`${className} app-wizard`}
          aria-label="Progress"
        >
          {scope.steps.map(([key, label], index) => (
            <li className="app-wizard-item" key={key}>
              {index > 0 && (
                <span
                  className="app-wizard-bar"
                  data-wizard-bar={index + 1}
                  data-state="todo"
                  aria-hidden="true"
                />
              )}
              <span
                className="app-wizard-step"
                data-wizard={index + 1}
                data-state={index === 0 ? "active" : "todo"}
                aria-current={index === 0 ? "step" : undefined}
              >
                <span className="app-wizard-dot" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="app-wizard-label">{label}</span>
              </span>
            </li>
          ))}
        </ol>
      );
    }
    case "formRecord":
      if (!scope)
        return hint("users", "Found record", "Put it inside a form block.");
      return (
        <FoundRecord
          node={n}
          scope={scope}
          className={className}
          attrs={attrs}
        />
      );
    case "formError":
      if (!scope)
        return hint(
          "help",
          "When sending fails",
          "Put it inside a form block.",
        );
      return (
        <div
          {...attrs}
          className={`${className} blk-form-flow`}
          data-form-error=""
          data-form-label={editing ? "When sending fails" : undefined}
          role={editing ? undefined : "alert"}
          hidden={!editing || undefined}
        >
          <Nodes
            nodes={n.children ?? []}
            ctx={{ ...ctx, form: { ...scope, part: "error" } }}
          />
        </div>
      );
    // Steps and the success blocks are drawn by their form (FormRoot).
    default:
      return hint(
        "checklist",
        BLOCKS[n.type].label,
        "Put it inside a form block.",
      );
  }
}

/** The form block: binds to its AppForm and lays out its steps. */
function FormRoot({
  node: n,
  ctx,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const editing = !!ctx.edit;
  const project = ctx.project;
  const recipe = recipeById(str(n.props.recipe));
  const real = project.app?.forms.find((f) => f.id === str(n.props.form));
  const realTable = real && project.app && tableOf(project.app, real.table);
  // A preset not yet placed (the Add panel) draws with a stand-in app.
  const bound =
    real && realTable && project.app
      ? { app: project.app, form: real, table: realTable }
      : recipe && !ctx.exporting
        ? recipePreview(recipe)
        : undefined;
  if (!bound) {
    if (!editing) return null;
    return (
      <Placeholder
        icon="checklist"
        title="Form"
        action={
          project.app?.forms.length
            ? "Choose one of your app’s forms on the right, or make a new one."
            : "Choose “New form…” on the right to make a form for this site."
        }
        attrs={attrs}
        className={className}
      />
    );
  }
  const { app, form, table } = bound;
  const live = ctx.exporting && !!ctx.appApi;
  const kids = shown(n.children, ctx);
  const stepNodes = kids.filter((c) => c.type === "formStep");
  // Capacity: "N places left" under the last field of each rule on the form.
  const caps = (form.kind === "submit" ? (table.capacity ?? []) : [])
    .filter((c) => c.group.some((g) => form.fields.includes(g)))
    .map((c) => ({
      id: c.id,
      group: c.group,
      size: c.size && form.fields.includes(c.size) ? c.size : undefined,
      unit: c.size
        ? (fieldOf(table, c.size)?.name.toLowerCase() ?? "places")
        : "places",
      message: c.message,
    }));
  const placesAfter = new Set(
    caps.map(
      (c) => [...c.group].reverse().find((g) => form.fields.includes(g)) ?? "",
    ),
  );
  // The widget's names for the steps: one "Questions" step is "fields",
  // several are pages of it ("page-0", "page-1"…).
  let page = 0;
  const paged = stepNodes.filter((s) => stepKind(s) === "details").length > 1;
  const steps: [string, string][] = stepNodes.map((s) => {
    const kind = stepKind(s);
    return [
      kind === "details" ? (paged ? `page-${page++}` : "fields") : kind,
      str(s.props.label) || STEP_NAMES[kind],
    ];
  });
  const lookupFlow =
    form.kind === "lookup" &&
    form.key !== REF_KEY &&
    !!fieldOf(table, form.key ?? "")?.unique &&
    !!form.highlight;
  const who = form.kind === "submit" ? identityField(app, form) : undefined;
  const flow = lookupFlow || !!who;
  const scope: FormScope = {
    app,
    form,
    table,
    live,
    editing,
    prefix: `f-${n.id}`,
    catalog: makeCatalog(project.collections ?? []),
    part: "outside",
    placesAfter,
    steps,
    links: appLinks(app, project.pages, form, ctx.href),
    flow: lookupFlow,
  };
  const inner = (part: FormScope["part"]): RenderContext => ({
    ...ctx,
    form: { ...scope, part },
  });
  const note = !live && !editing && (
    <p className="app-preview-note">
      <Icon name="lock" size={13} />
      {ctx.exporting
        ? "Works when published with Forma."
        : "Works on your published site."}
    </p>
  );
  const honeypot = live && (
    <label className="site-request-trap" aria-hidden="true">
      Leave empty
      <input name="website" tabIndex={-1} autoComplete="off" />
    </label>
  );
  const errorLine = (nodes: Node[]) =>
    !nodes.some((c) => [...walk([c])].some((x) => x.type === "formError")) && (
      <ErrorLine />
    );
  /** A step: a <form> when visitors type into it (published), a box otherwise. */
  const step = (
    owner: Node | null,
    name: string,
    body: ReactNode,
    opts: {
      form?: boolean;
      hidden?: boolean;
      label?: string;
      extra?: string;
    } = {},
  ) => {
    const Tag = opts.form && live ? "form" : "div";
    const own = owner
      ? partProps(owner, ctx, "app-step", "blk-form-flow", opts.extra ?? false)
      : { className: `app-step blk-form-flow ${opts.extra ?? ""}` };
    return (
      <Tag
        key={owner?.id ?? name}
        {...own}
        data-step={live ? name : undefined}
        data-form-label={editing ? opts.label : undefined}
        noValidate={Tag === "form" || undefined}
        hidden={(live && opts.hidden) || undefined}
      >
        {body}
      </Tag>
    );
  };
  const done = (owner: Node | undefined) => {
    const node =
      owner ?? defaults(app, form, n).find((c) => c.type === "formSuccess")!;
    return step(
      node,
      form.kind === "lookup" ? "result" : "done",
      <Nodes
        nodes={node.children ?? []}
        ctx={inner(form.kind === "lookup" ? "result" : "done")}
      />,
      {
        hidden: true,
        label: form.kind === "lookup" ? "What was found" : "After sending",
        extra: "blk-form-done",
      },
    );
  };
  const parts: ReactNode[] = [];
  /** Preview and exports: only the first step shows. */
  const firstOnly = !live && !editing;

  if (form.kind === "lookup") {
    const success = kids.find((c) => c.type === "formSuccess");
    const rest = kids.filter((c) => c.type !== "formSuccess");
    parts.push(
      step(
        null,
        "lookup",
        <>
          <Nodes nodes={rest} ctx={inner("lookup")} />
          {errorLine(rest)}
        </>,
        { form: true },
      ),
    );
    if (live && lookupFlow) parts.push(<LookupLoading key="loading" />);
    if (!firstOnly) parts.push(done(success));
    if (live && lookupFlow) {
      const key = fieldOf(table, form.key ?? "");
      if (key)
        parts.push(<LookupScreens key="screens" form={form} keyField={key} />);
    }
  } else {
    // Without steps, everything but the success blocks is the questions.
    const pieces: Node[] = stepNodes.length
      ? kids
      : [
          {
            ...n,
            id: `${n.id}-q`,
            type: "formStep",
            props: { kind: "details" },
            children: kids.filter((c) => c.type !== "formSuccess"),
          },
          ...kids.filter((c) => c.type === "formSuccess"),
        ];
    const implicit = !stepNodes.length;
    const has = (kind: StepKind) =>
      pieces.some((c) => c.type === "formStep" && stepKind(c) === kind);
    // A form that identifies visitors always has its first two steps.
    const extra = defaults(app, form, n);
    const fill = (kind: StepKind) =>
      extra.find((c) => c.type === "formStep" && stepKind(c) === kind)!;
    const list: Node[] = [...pieces];
    if (who && !has("confirm")) list.unshift(fill("confirm"));
    if (who && !has("identify")) list.unshift(fill("identify"));
    if (!has("details")) list.push(fill("details"));
    if (!list.some((c) => c.type === "formSuccess"))
      list.push(extra.find((c) => c.type === "formSuccess")!);
    const pages = list.filter(
      (c) => c.type === "formStep" && stepKind(c) === "details",
    );
    const order = list.filter((c) => c.type === "formStep");
    for (const c of list) {
      if (c.type === "formStep") {
        const kind = stepKind(c);
        const first = order[0] === c;
        if (
          firstOnly &&
          !(first || (kind === "details" && order[0] === pages[0]))
        )
          continue;
        const label = `Step ${order.indexOf(c) + 1} · ${str(c.props.label) || STEP_NAMES[kind]}`;
        if (kind === "identify") {
          parts.push(
            step(
              c,
              "identify",
              <>
                <Nodes nodes={c.children ?? []} ctx={inner("identify")} />
                {errorLine(c.children ?? [])}
                {live && <Offline form={form} />}
              </>,
              { form: true, label },
            ),
          );
          if (live && who)
            parts.push(<IdentifyScreens key="screens" form={form} who={who} />);
        } else if (kind === "confirm") {
          parts.push(
            step(
              c,
              "confirm",
              <Nodes nodes={c.children ?? []} ctx={inner("confirm")} />,
              {
                hidden: true,
                label,
              },
            ),
          );
        } else if (c === pages[0]) {
          // Every "Questions" step is a page of one <form>, sent together.
          const shownPages = firstOnly ? pages.slice(0, 1) : pages;
          const body = (
            <>
              {shownPages.map((pg, i) =>
                implicit ? (
                  <Nodes
                    key={pg.id}
                    nodes={pg.children ?? []}
                    ctx={inner("questions")}
                  />
                ) : (
                  <div
                    key={pg.id}
                    {...partProps(pg, ctx, "blk-form-page", "blk-form-flow")}
                    data-page={live && pages.length > 1 ? i : undefined}
                    data-form-label={
                      editing
                        ? `Step ${order.indexOf(pg) + 1} · ${str(pg.props.label) || "Questions"}`
                        : undefined
                    }
                    hidden={(live && i > 0) || undefined}
                  >
                    <Nodes nodes={pg.children ?? []} ctx={inner("questions")} />
                  </div>
                ),
              )}
              {honeypot}
              {errorLine(pages.flatMap((pg) => pg.children ?? []))}
            </>
          );
          parts.push(
            <form
              key="fields"
              className={`app-step blk-form-flow blk-form-questions${implicit ? "" : " is-paged"}`}
              data-step={live ? "fields" : undefined}
              noValidate
              hidden={(live && !!who) || undefined}
              onSubmit={live ? undefined : (e) => e.preventDefault()}
            >
              {body}
            </form>,
          );
          if (live && form.payment) parts.push(<PayStep key="pay" />);
        }
      } else if (c.type === "formSuccess") {
        if (!firstOnly) parts.push(done(c));
      } else {
        parts.push(<Nodes key={c.id} nodes={[c]} ctx={inner("outside")} />);
      }
    }
  }
  return (
    <div
      {...attrs}
      className={[
        className,
        "app-form",
        !live && "is-preview",
        flow && "is-flow",
      ]
        .filter(Boolean)
        .join(" ")}
      data-blocks-form=""
      data-app-api={live ? ctx.appApi : undefined}
      data-form={live ? form.id : undefined}
      data-kind={form.kind}
      data-identify={form.identify ? "" : undefined}
      data-flow={flow ? "" : undefined}
      data-capacity={live && caps.length ? JSON.stringify(caps) : undefined}
      data-steps={
        live && steps.length ? JSON.stringify(steps.map(([k]) => k)) : undefined
      }
    >
      {parts}
      {note}
      {live && <p className="app-status sr-only" aria-live="polite" />}
    </div>
  );
}

/** How autofill should treat a field, from its type and name. */
function autoFill(field: AppField, mobile: boolean) {
  if (field.type === "email") return "email";
  if (field.type === "phone") return mobile ? "tel-national" : "tel";
  const name = field.name.toLowerCase();
  if (field.type !== "text" && field.type !== "longText") return undefined;
  if (/\b(full )?name\b/.test(name) && !/(company|business|shop)/.test(name))
    return "name";
  if (/address/.test(name)) return "street-address";
  if (/\bcity\b|\btown\b/.test(name)) return "address-level2";
  if (/pin ?code|postal|zip/.test(name)) return "postal-code";
  return undefined;
}

/** A field block: the right input for its field's type, labelled and checked like the classic form. */
function FieldBlock({
  node: n,
  scope,
  className,
  attrs,
}: {
  node: Node;
  scope: FormScope;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const p = n.props;
  const { app, form, table, editing, live } = scope;
  const note = (title: string, action: string) =>
    editing ? (
      <Placeholder
        icon="edit"
        title={title}
        action={action}
        attrs={attrs}
        className={className}
        compact
      />
    ) : null;
  const chosen = str(p.field);
  let field: AppField | undefined;
  /** The input's name when it isn't the field id (identify and lookup steps). */
  let name: string | undefined;
  if (
    scope.part === "done" ||
    scope.part === "result" ||
    scope.part === "error" ||
    scope.part === "confirm"
  )
    return note("Field", "Fields go among the questions, not here.");
  if (scope.part === "outside")
    return note("Field", "Move this field into one of the form’s steps.");
  if (scope.part === "identify") {
    field = identityField(app, form);
    name = "identity";
    if (!field)
      return note(
        "Who are you?",
        "This form doesn’t ask visitors who they are (App → Forms).",
      );
  } else if (form.kind === "lookup") {
    if (chosen && chosen === form.key) {
      field = chosen === REF_KEY ? refField(table) : fieldOf(table, chosen);
      name = "value";
    } else if (chosen && chosen === form.verify) {
      field = fieldOf(table, chosen);
      name = "verify";
    }
    if (!field)
      return note(
        "Field",
        "Choose what visitors type to look up, on the right.",
      );
  } else {
    if (chosen === IDENTITY)
      return note("Who are you?", "Put this in a “Who are you?” step.");
    field = fieldOf(table, chosen);
    if (!field)
      return note("Field", "Choose which field this asks for, on the right.");
    if (field.ownerOnly || field.type === "link")
      return note(
        field.name,
        field.ownerOnly
          ? "Only you fill this in (owner-only), so visitors aren’t asked."
          : "Links are filled in by the form itself.",
      );
  }
  const id = `${scope.prefix}-${name ?? field.id}`;
  const label = str(p.label).trim() || field.name;
  const required = !!name || field.required;
  const help = str(p.hint).trim() || field.hint || "";
  const placeholder =
    str(p.placeholder).trim() || field.placeholder || undefined;
  const width = ["half", "third"].includes(str(p.width))
    ? str(p.width)
    : "full";
  const disabled = !live && !editing ? true : undefined;
  // Editor inputs show what visitors see but never take focus or typing.
  const focusless = editing ? { tabIndex: -1 } : {};
  const ro = editing ? { readOnly: true } : {};
  const describedBy = [help && `${id}-hint`, `${id}-error`]
    .filter(Boolean)
    .join(" ");
  const optional = !required && (
    <span className="blk-optional"> (optional)</span>
  );
  const helpLine = help && (
    <small className="blk-field-hint" id={`${id}-hint`}>
      {help}
    </small>
  );
  const errorSlot = (
    <small
      className="app-field-error blk-field-error"
      id={`${id}-error`}
      hidden
    />
  );
  const places = live && scope.placesAfter.has(field.id) && (
    <p className="app-places blk-field-places" aria-live="polite" hidden />
  );
  const wrap = (extra: string) => `${className} blk-field w-${width} ${extra}`;
  const common = {
    id,
    name: name ?? field.id,
    required: required || undefined,
    disabled,
    "aria-describedby": describedBy,
    "data-label": label,
    ...focusless,
  };

  if (field.type === "items" && !name) {
    return (
      <div {...attrs} className={wrap("is-items")}>
        <Picker
          field={{ ...field, name: label }}
          prefix={scope.prefix}
          disabled={!live}
          catalog={scope.catalog}
        />
        <div
          className="app-cart blk-cart"
          data-field={field.id}
          tabIndex={-1}
          aria-describedby={`${scope.prefix}-${field.id}-error`}
        >
          <div className="app-cart-head">
            <strong className="blk-cart-title">Your order</strong>
          </div>
          <ul className="app-cart-lines" />
          <p className="app-cart-empty">Nothing added yet.</p>
          <div className="app-cart-total">
            <span>Subtotal</span>
            <strong className="app-cart-sum" />
          </div>
          <small
            className="app-field-error"
            id={`${scope.prefix}-${field.id}-error`}
            hidden
          />
        </div>
      </div>
    );
  }
  if (field.type === "item" && !name) {
    return (
      <div {...attrs} className={wrap("is-item")}>
        <ItemChoice
          field={{ ...field, name: label }}
          id={id}
          disabled={!live}
          catalog={scope.catalog}
        />
        {places}
      </div>
    );
  }
  const display = str(p.display);
  if (field.type === "choice" && (display === "radio" || display === "chips")) {
    const options = field.options.filter((o) => o.trim());
    return (
      <fieldset
        {...attrs}
        className={wrap(`is-group is-${display}`)}
        aria-describedby={describedBy}
      >
        <legend className="blk-field-label">
          {label}
          {optional}
        </legend>
        <div className={`blk-options is-${display}`}>
          {options.map((o, i) => (
            <label
              className={display === "chips" ? "blk-chip" : "blk-radio"}
              key={o}
            >
              <input
                type="radio"
                {...common}
                id={i === 0 ? id : undefined}
                value={o}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {helpLine}
        {errorSlot}
        {places}
      </fieldset>
    );
  }
  if (field.type === "yesNo" && !name) {
    const sw = display === "switch";
    return (
      <div {...attrs} className={wrap(`is-check ${sw ? "is-switch" : ""}`)}>
        <label className="blk-check" htmlFor={id}>
          <input
            {...common}
            type="checkbox"
            value="true"
            required={undefined}
            role={sw ? "switch" : undefined}
            className={sw ? "blk-switch" : "blk-checkbox"}
          />
          <span className="blk-check-label">{label}</span>
        </label>
        {helpLine}
        {errorSlot}
      </div>
    );
  }
  const rupees = app.currency === "INR";
  const mobile = field.type === "phone" && rupees && display !== "any";
  const prefix =
    field.type === "money" ? currencySymbol(app.currency) : mobile ? "+91" : "";
  let control: ReactNode;
  switch (field.type) {
    case "longText":
      control = (
        <textarea
          {...common}
          {...ro}
          placeholder={placeholder}
          className="blk-input"
          rows={4}
          maxLength={field.maxLength || 2000}
          data-minlength={field.minLength || undefined}
        />
      );
      break;
    case "choice":
      control = (
        <select {...common} className="blk-input" defaultValue="">
          <option value="" disabled={required || undefined}>
            {placeholder ?? "Choose…"}
          </option>
          {field.options
            .filter((o) => o.trim())
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      );
      break;
    case "money":
      control = (
        <input
          {...common}
          {...ro}
          className="blk-input"
          placeholder={placeholder}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-money=""
          data-min={field.min}
          data-max={field.max}
        />
      );
      break;
    case "number":
      control = (
        <input
          {...common}
          {...ro}
          className="blk-input"
          type="number"
          placeholder={placeholder}
          inputMode="numeric"
          step="1"
          min={field.min}
          max={field.max}
        />
      );
      break;
    case "phone":
      control = (
        <input
          {...common}
          {...ro}
          className="blk-input"
          type="tel"
          inputMode={mobile ? "numeric" : "tel"}
          autoComplete={autoFill(field, mobile)}
          maxLength={mobile ? 16 : 20}
          data-mobile={mobile ? "" : undefined}
          placeholder={placeholder ?? (mobile ? "98765 43210" : undefined)}
        />
      );
      break;
    case "email":
      control = (
        <input
          {...common}
          {...ro}
          className="blk-input"
          type="email"
          autoComplete="email"
          maxLength={200}
          placeholder={placeholder ?? "you@example.com"}
        />
      );
      break;
    case "date":
      control = <input {...common} className="blk-input" type="date" {...ro} />;
      break;
    default:
      control = (
        <input
          {...common}
          {...ro}
          placeholder={placeholder}
          className="blk-input"
          type="text"
          autoComplete={autoFill(field, false)}
          maxLength={field.maxLength || 200}
          data-minlength={field.minLength || undefined}
        />
      );
  }
  const counter = field.type === "longText" && !!field.maxLength && (
    <small
      className="app-counter blk-counter"
      data-counter={id}
      data-max={field.maxLength}
      aria-hidden="true"
    >
      {`0 / ${field.maxLength}`}
    </small>
  );
  return (
    <div {...attrs} className={wrap(`is-${field.type}`)}>
      <label className="blk-field-label" htmlFor={id}>
        {label}
        {optional}
      </label>
      <div
        className={[
          "blk-control",
          prefix && "has-prefix",
          prefix.length > 1 && "is-wide",
          field.type === "choice" && "is-select",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {prefix && (
          <span className="blk-adorn" aria-hidden="true">
            {prefix}
          </span>
        )}
        {control}
      </div>
      {helpLine}
      {errorSlot}
      {counter}
      {places}
    </div>
  );
}

/** A form button: sends, or one of the widget's actions (confirm, change, again, back). */
function FormButton({
  node: n,
  ctx,
  scope,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  scope: FormScope;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const p = n.props;
  const edit = ctx.edit;
  const action = ["back", "confirm", "change", "again"].includes(str(p.action))
    ? str(p.action)
    : "submit";
  const sends = action === "submit";
  const size = ["sm", "md", "lg"].includes(str(p.size)) ? str(p.size) : "md";
  const label =
    str(p.label) || (sends ? scope.form.button || "Send" : "Continue");
  const icon = str(p.icon);
  const classes = [
    className,
    "blk-button",
    `s-${size}`,
    sends && "app-submit",
    p.full === true && "is-full",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {edit ? (
        <InlineText
          as="span"
          value={str(p.label)}
          className="blk-button-label"
          enabled
          editing={edit.typing === n.id}
          label="Edit button text"
          onCommit={(v) => edit.onCommit(n.id, "label", v)}
          onActivate={() => edit.onSelect(n.id)}
          onStartEdit={() => edit.onStartTyping(n.id)}
          onFinishEdit={edit.onFinishTyping}
          onDraft={edit.onDraft}
        />
      ) : (
        <span>{label}</span>
      )}
      {icon && <Icon name={icon} size={16} />}
    </>
  );
  // Only the published form has working buttons; elsewhere (the editor,
  // where its label is typed into, previews and the Add panel's miniatures,
  // drawn inside a button) it's the same look without being one.
  if (!scope.live)
    return (
      <span
        {...attrs}
        className={`${classes} is-inert`}
        aria-disabled={edit ? undefined : "true"}
      >
        {content}
      </span>
    );
  return (
    <button
      {...attrs}
      type={sends ? "submit" : "button"}
      className={classes}
      data-action={sends ? undefined : action}
    >
      {content}
    </button>
  );
}

/** What was found: the visitor on "Is this you?", or a lookup's record. */
function FoundRecord({
  node: n,
  scope,
  className,
  attrs,
}: {
  node: Node;
  scope: FormScope;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const { app, form, table, live, editing } = scope;
  void n;
  if (!live) {
    const lookup = scope.part === "result";
    if (!editing) return null;
    return (
      <div {...attrs} className={`${className} blk-record-sample`}>
        <span className="blk-record-avatar" aria-hidden="true">
          AB
        </span>
        <span className="blk-record-lines" aria-hidden="true">
          <span />
          <span />
        </span>
        <small>
          {scope.part === "confirm"
            ? "The visitor’s name and details show here, so they can check it’s them."
            : lookup
              ? `The ${table.singular.toLowerCase()} that was found shows here${form.history ? ", with its history" : ""}.`
              : "Put this in “Is this you?” or in what a lookup shows."}
        </small>
      </div>
    );
  }
  if (scope.part === "confirm")
    return (
      <div {...attrs} className={`${className} blk-record`}>
        <IdentityCard />
        <dl className="app-match" hidden />
      </div>
    );
  if (scope.part !== "result" || form.kind !== "lookup") return null;
  const byRef = form.key === REF_KEY;
  const key = byRef ? refField(table) : fieldOf(table, form.key ?? "");
  if (!key) return null;
  const history =
    (form.history && tableOf(app, form.history.table)) || undefined;
  return (
    <div
      {...attrs}
      className={`${className} blk-record ${scope.flow ? "app-bare" : ""}`}
    >
      {scope.flow ? (
        <FlowResult
          table={table}
          form={form}
          history={history}
          links={scope.links}
          word={key.type === "phone" ? "number" : key.name.toLowerCase()}
        />
      ) : (
        <PlainResult
          table={table}
          form={form}
          history={history}
          list={!byRef && !key.unique}
          byRef={byRef}
          keyField={key}
        />
      )}
    </div>
  );
}
