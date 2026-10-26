/**
 * Keeps form blocks and their AppForms equal (see model.ts for which side
 * owns what). `syncForms(before, after)` runs on every change the studio
 * commits:
 *
 * 1. A preset's form block (`recipe`, no form yet) gets its table and form.
 * 2. A form block bound to a form but still empty gets the form's blocks.
 * 3. For each submit form placed as blocks, whichever side changed wins:
 *    - the App builder changed `form.fields` → field blocks are added
 *      (after the last field), removed, and reordered in their places;
 *    - a form block's field blocks changed → `form.fields` follows them,
 *      and any other block for the same form is brought in line.
 *    Fields visitors can't fill (owner-only, links) stay on the form.
 *
 * Lookup forms aren't synced: their key, verify and shown fields are set in
 * the App builder, and their field blocks only arrange the key inputs.
 */
import {
  fieldOf,
  REF_KEY,
  tableOf,
  type App,
  type AppForm,
  type AppTable,
} from "../../apps/model";
import type { Project, Section } from "../../studio/model";
import type { Node, Props, Style } from "../model";
import { createNode } from "../registry";
import {
  identityField,
  IDENTITY,
  placeable,
  placedFields,
  questionNodes,
  stepKind,
} from "./model";
import { applyRecipe, recipeById } from "./recipes";
import { appLinks } from "../../apps/links";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** A block with props, style and children in one call. */
export function make(
  type: Node["type"],
  props: Props = {},
  style?: Style,
  children?: Node[],
): Node {
  const node = createNode(type, props);
  if (style) node.style = { ...node.style, ...style };
  if (children) node.children = children;
  return node;
}
export const fieldBlock = (field: string, props: Props = {}) =>
  make("field", { field, ...props });
const heading = (text: string, style?: Style) =>
  make("heading", { text, level: "3" }, { fontSize: "xl", ...style });
const text = (value: string, variant = "body", style?: Style) =>
  make("text", { text: value, variant }, style);
const button = (label: string, action = "submit", props: Props = {}) =>
  make("submit", { label, action, ...props });

/** What's shown after sending: today's success screen, in blocks. */
export function successBlocks(
  form: AppForm,
  again = "Send another",
  lookup?: Link,
): Node {
  const done = form.copy?.doneTitle?.trim() || "Thank you";
  const another = button(again, "again", { variant: "secondary" });
  return make(
    "formSuccess",
    {},
    { align: "center", textAlign: "center", gap: 12 },
    [
      make("icon", { icon: "check", variant: "circle", size: 26 }),
      heading(done),
      text("{message}", "body", { color: "muted" }),
      lookup
        ? make("row", {}, { gap: 12, justify: "center" }, [
            make("button", { label: lookup.label, url: lookup.url }),
            another,
          ])
        : another,
    ],
  );
}
/** A page link for the success blocks, e.g. "View my rewards". */
type Link = { url: string; label: string };
/** What's shown when sending fails: the reason. */
export const errorBlocks = () =>
  make("formError", {}, undefined, [text("{message}", "small")]);

/**
 * A form's blocks as a new form block starts: its questions, steps and
 * screens worded from the form (copy, steps, button, success).
 */
export function formChildren(app: App, form: AppForm, lookup?: Link): Node[] {
  const table = tableOf(app, form.table);
  if (!table) return [];
  const copy = (key: keyof NonNullable<AppForm["copy"]>, fallback = "") =>
    form.copy?.[key]?.trim() || fallback;
  if (form.kind === "lookup") {
    const out: Node[] = [];
    if (copy("identifyTitle")) out.push(heading(copy("identifyTitle")));
    if (copy("identifyIntro"))
      out.push(text(copy("identifyIntro"), "body", { color: "muted" }));
    out.push(fieldBlock(form.key === REF_KEY ? REF_KEY : (form.key ?? "")));
    if (form.verify && form.verify !== form.key)
      out.push(fieldBlock(form.verify, { width: "half" }));
    out.push(
      errorBlocks(),
      button(
        form.button || (form.key === REF_KEY ? "Track" : "Look up"),
        "submit",
        {
          icon: "search",
        },
      ),
    );
    if (copy("identifyNote")) out.push(text(copy("identifyNote"), "small"));
    out.push(make("formSuccess", {}, { gap: 16 }, [make("formRecord")]));
    return out;
  }
  const questions = form.fields
    .filter((id) => placeable(fieldOf(table, id)))
    .map((id) => fieldBlock(id));
  const send = button(form.button || "Send", "submit", { icon: "arrow" });
  const who = identityField(app, form);
  if (!who)
    return [
      ...questions,
      errorBlocks(),
      send,
      successBlocks(form, undefined, lookup),
    ];
  const word = who.type === "phone" ? "number" : who.name.toLowerCase();
  const [one, two, three] = form.steps ?? ["You", "Confirm", "Details"];
  const step = (kind: string, label: string, children: Node[]) =>
    make("formStep", { kind, label }, { gap: 16 }, children);
  const note = (value: string) =>
    value ? [text(value, "small", { color: "muted" })] : [];
  return [
    ...(form.steps ? [make("formSteps")] : []),
    step("identify", one, [
      heading(
        copy(
          "identifyTitle",
          who.type === "phone"
            ? "What’s your phone number?"
            : `What’s your ${who.name.toLowerCase()}?`,
        ),
      ),
      ...note(copy("identifyIntro")),
      fieldBlock(IDENTITY),
      errorBlocks(),
      button("Continue", "submit", { full: true, icon: "arrow" }),
      ...note(copy("identifyNote")),
    ]),
    step("confirm", two, [
      heading(copy("confirmTitle", "Is this you?")),
      ...note(copy("confirmIntro", "Confirm it’s you before you continue.")),
      make("formRecord"),
      button("Yes, continue", "confirm", { full: true }),
      button(`Use a different ${word}`, "change", {
        full: true,
        variant: "ghost",
      }),
    ]),
    step("details", three, [
      heading(copy("fieldsTitle", "Your details")),
      text(`${copy("fieldsIntro", "Sending as")} {name}`, "body", {
        color: "muted",
      }),
      ...questions,
      errorBlocks(),
      { ...send, props: { ...send.props, full: true } },
      ...note(copy("fieldsNote")),
    ]),
    successBlocks(form, "Record another", lookup),
  ];
}

/** Applies `fn` to every node of a tree, children first (returns the same object when nothing changes). */
function rebuild(n: Node, fn: (n: Node) => Node): Node {
  let kids = n.children;
  if (kids) {
    const next = kids.map((c) => rebuild(c, fn));
    if (next.some((c, i) => c !== kids![i])) kids = next;
  }
  return fn(kids === n.children ? n : { ...n, children: kids });
}

/** Ids of the field blocks among a form's questions (see questionNodes). */
const questionIds = (form: Node) =>
  new Set(
    questionNodes(form)
      .filter((n) => n.type === "field")
      .map((n) => n.id),
  );

/**
 * A form block brought in line with `target` (the field ids it should ask,
 * in order): field blocks for other fields go, missing ones are added after
 * the last field (or before the send button), and the field blocks are
 * reordered in the places they occupy, so the layout stays the owner's.
 */
export function arrangeFields(
  form: Node,
  target: string[],
  table: AppTable,
): Node {
  const questions = questionIds(form);
  const asked = (n: Node) =>
    n.type === "field" &&
    questions.has(n.id) &&
    placeable(fieldOf(table, str(n.props.field)));
  // 1. Drop fields no longer asked, and second copies.
  const seen = new Set<string>();
  let out = rebuild(form, (n) => {
    if (!n.children) return n;
    const kids = n.children.filter((c) => {
      if (!asked(c)) return true;
      const id = str(c.props.field);
      if (!target.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return kids.length === n.children.length ? n : { ...n, children: kids };
  });
  // 2. Add the missing ones next to the last field, or before the button.
  const missing = target.filter((id) => !seen.has(id));
  if (missing.length) {
    const fresh = missing.map((id) => fieldBlock(id));
    const order = questionNodes(out);
    const lastField = [...order].reverse().find(asked);
    const sendButton = order.find(
      (n) =>
        n.type === "submit" && ["", "submit"].includes(str(n.props.action)),
    );
    const steps = (out.children ?? []).filter(
      (c) => c.type === "formStep" && stepKind(c) === "details",
    );
    const put = (anchor: Node | undefined, after: boolean) => {
      if (!anchor) return false;
      let done = false;
      out = rebuild(out, (n) => {
        if (done || !n.children) return n;
        const i = n.children.findIndex((c) => c.id === anchor.id);
        if (i < 0) return n;
        done = true;
        const kids = [...n.children];
        kids.splice(after ? i + 1 : i, 0, ...fresh);
        return { ...n, children: kids };
      });
      return done;
    };
    if (!put(lastField, true) && !put(sendButton, false)) {
      const holder = steps.at(-1);
      out = holder
        ? rebuild(out, (n) =>
            n.id === holder.id
              ? { ...n, children: [...(n.children ?? []), ...fresh] }
              : n,
          )
        : {
            ...out,
            children: (() => {
              const kids = [...(out.children ?? [])];
              const at = kids.findIndex(
                (c) => c.type === "formSuccess" || c.type === "formError",
              );
              kids.splice(at < 0 ? kids.length : at, 0, ...fresh);
              return kids;
            })(),
          };
    }
  }
  // 3. Reorder the field blocks within their places.
  const now = questionIds(out);
  const slots: Node[] = [];
  const walkSlots = (n: Node) => {
    if (
      n.type === "field" &&
      now.has(n.id) &&
      placeable(fieldOf(table, str(n.props.field)))
    )
      slots.push(n);
    for (const c of n.children ?? []) walkSlots(c);
  };
  walkSlots(out);
  const wanted = target
    .map((id) => slots.find((s) => str(s.props.field) === id))
    .filter((s): s is Node => !!s);
  if (wanted.every((s, i) => s === slots[i])) return out;
  const swap = new Map(slots.map((s, i) => [s.id, wanted[i]]));
  const place = (n: Node): Node => {
    const to = swap.get(n.id);
    if (to) return to;
    return n.children ? { ...n, children: n.children.map(place) } : n;
  };
  return place(out);
}

/** Maps every form block of a project (same project when nothing changes). */
function mapFormNodes(project: Project, fn: (form: Node) => Node): Project {
  let changed = false;
  const section = (s: Section): Section => {
    if (s.type !== "blocks" || !s.root) return s;
    const visit = (n: Node): Node => {
      if (n.type === "form") return fn(n);
      if (!n.children) return n;
      const kids = n.children.map(visit);
      return kids.some((c, i) => c !== n.children![i])
        ? { ...n, children: kids }
        : n;
    };
    const root = visit(s.root);
    if (root === s.root) return s;
    changed = true;
    return { ...s, root };
  };
  const list = (l: Section[]) => {
    const next = l.map(section);
    return next.some((s, i) => s !== l[i]) ? next : l;
  };
  const next: Project = {
    ...project,
    header: list(project.header),
    footer: list(project.footer),
    pages: project.pages.map((p) => {
      const sections = list(p.sections);
      return sections === p.sections ? p : { ...p, sections };
    }),
    ...(project.savedSections
      ? { savedSections: list(project.savedSections) }
      : {}),
  };
  return changed ? next : project;
}
/** Every form block of a project. */
function formBlocksOf(project: Project): Node[] {
  const out: Node[] = [];
  mapFormNodes(project, (n) => {
    out.push(n);
    return n;
  });
  return out;
}

/** Field ids a preset's form block names (before it has a table). */
function namedFields(form: Node): string[] {
  const out: string[] = [];
  const visit = (n: Node) => {
    if (n.type === "formSuccess" || n.type === "formError") return;
    if (
      n.type === "field" &&
      str(n.props.field) &&
      !out.includes(str(n.props.field))
    )
      out.push(str(n.props.field));
    for (const c of n.children ?? []) visit(c);
  };
  visit(form);
  return out.filter((f) => f !== IDENTITY);
}

/** Step 1: preset form blocks get their table and form. */
function bindRecipes(project: Project): Project {
  let app = project.app;
  const next = mapFormNodes(project, (n) => {
    const recipe = recipeById(str(n.props.recipe));
    if (!recipe || app?.forms.some((f) => f.id === str(n.props.form))) return n;
    const made = applyRecipe(app, recipe, namedFields(n), project.name);
    if (!made) return n;
    app = made.app;
    const props: Props = { ...n.props, form: made.form.id };
    delete props.recipe;
    // A lookup on another recipe's table names that table's fields.
    return { ...n, props };
  });
  return next === project ? project : { ...next, app };
}

/** Step 2: a bound form block with nothing in it gets the form's blocks. */
function fillEmpty(project: Project): Project {
  const app = project.app;
  if (!app) return project;
  return mapFormNodes(project, (n) => {
    if (n.children?.length) return n;
    const form = app.forms.find((f) => f.id === str(n.props.form));
    if (!form) return n;
    // After sending, a link to the page that looks the visitor up.
    const link = appLinks(app, project.pages, form, (url) => url).lookup;
    return {
      ...n,
      children: formChildren(
        app,
        form,
        link && { url: link.href, label: link.label },
      ),
    };
  });
}

/** Keeps form blocks and AppForms equal after a change (see the top of this file). */
export function syncForms(before: Project, after: Project): Project {
  let project = fillEmpty(bindRecipes(after));
  const app = project.app;
  if (!app) return project;
  const blocks = formBlocksOf(project);
  if (!blocks.length) return project;
  const earlier = new Map(formBlocksOf(before).map((n) => [n.id, n]));
  const targets = new Map<string, { target: string[]; table: AppTable }>();
  let forms = app.forms;
  for (const form of app.forms) {
    if (form.kind !== "submit") continue;
    const table = tableOf(app, form.table);
    const mine = blocks.filter((n) => str(n.props.form) === form.id);
    if (!table || !mine.length) continue;
    const asked = form.fields.filter((id) => placeable(fieldOf(table, id)));
    const was = before.app?.forms.find((f) => f.id === form.id);
    let target: string[] | undefined;
    if (was && !same(was.fields, form.fields)) target = asked;
    else {
      const changed = mine.find((n) => {
        const old = earlier.get(n.id);
        return (
          !old ||
          str(old.props.form) !== form.id ||
          !same(placedFields(old, table), placedFields(n, table))
        );
      });
      const source =
        changed ?? mine.find((n) => !same(placedFields(n, table), asked));
      if (source) target = placedFields(source, table);
    }
    if (!target) continue;
    if (!same(target, asked)) {
      const kept = form.fields.filter((id) => !placeable(fieldOf(table, id)));
      const fields = [...target, ...kept];
      forms = forms.map((f) => (f.id === form.id ? { ...f, fields } : f));
    }
    targets.set(form.id, { target, table });
  }
  if (targets.size) {
    project = mapFormNodes(project, (n) => {
      const t = targets.get(str(n.props.form));
      if (!t || same(placedFields(n, t.table), t.target)) return n;
      return arrangeFields(n, t.target, t.table);
    });
  }
  return forms === app.forms ? project : { ...project, app: { ...app, forms } };
}

/** A fresh form block for `form`, with its blocks. */
export function newFormBlock(app: App, form: AppForm): Node {
  const node = make("form", { form: form.id });
  node.children = formChildren(app, form);
  return node;
}
