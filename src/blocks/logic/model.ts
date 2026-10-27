/**
 * Logic (phase 5): what a block does when clicked (`node.on.click`), when it
 * shows (`node.when`) and the page values both read (`page.variables`). See
 * docs/blocks-builder.md, "Logic".
 *
 * Everything here is data: a short, typed list of actions and rules that the
 * editor's preview (React) and the published page's script
 * (./runtime.ts) carry out. Nothing is ever evaluated as code. Addresses
 * are checked here (`safeLink`) and again when published.
 */
import { walk, type Node } from "../model";

export const MAX_ACTIONS = 3;
export const MAX_RULES = 4;
export const MAX_VARIABLES = 20;
/** A page value, a rule's value, a text to copy or send. */
export const MAX_VALUE = 200;
export const MAX_TEXT = 500;
export const VAR_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/** What a click does. One to three, run in order. */
export type Action =
  | { do: "page"; page: string }
  | { do: "link"; url: string; newTab?: boolean }
  | { do: "scroll"; target: string }
  | { do: "openDialog"; dialog: string }
  | { do: "closeDialog" }
  | { do: "call"; phone: string }
  | { do: "whatsapp"; phone: string; text?: string }
  | { do: "email"; to: string; subject?: string }
  | { do: "copy"; text: string; toast?: string }
  | { do: "setVar"; name: string; value: string }
  | { do: "toggleVar"; name: string };
export type ActionKind = Action["do"];
export interface On {
  click?: Action[];
}

export type Op = "is" | "not" | "set" | "empty" | "gt" | "lt";
/** One "show only when" rule. */
export type Rule =
  | { if: "var"; name: string; op: Op; value?: string }
  | {
      if: "query";
      param: string;
      op: "is" | "not" | "set" | "empty";
      value?: string;
    }
  | { if: "theme"; is: "light" | "dark" }
  /** Between two days (YYYY-MM-DD, both included); either end may be open. */
  | { if: "date"; from?: string; to?: string }
  /** Inside a repeat: a field of the current item (a binding source). */
  | { if: "item"; field: string; op: Op; value?: string };
export interface Condition {
  match: "all" | "any";
  rules: Rule[];
}

/** A value the page remembers while someone is on it: the chosen tab, plan… */
export interface PageVariable {
  name: string;
  type: "text" | "number" | "yesno";
  /** The starting value: text, a number, or "yes" / "no". */
  value: string;
  /** Kept on the visitor's device (a dismissed announcement stays dismissed). */
  remember?: boolean;
}

/** Blocks that can be clicked. Cards in a repeat are boxes. */
export const CLICKABLE = new Set<Node["type"]>([
  "button",
  "image",
  "icon",
  "box",
  "text",
  "heading",
  "badge",
]);
/** Actions that go somewhere: drawn as a real link, so they work without the script. */
export const NAVIGATION = new Set<ActionKind>([
  "page",
  "link",
  "scroll",
  "call",
  "whatsapp",
  "email",
]);

/* Checking */

/** Control characters (tabs, new lines, NUL…) never belong in these values. */
const CONTROL = {
  test: (v: string) => {
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i);
      if (c < 32 || c === 127) return true;
    }
    return false;
  },
};
const ID = /^[\w-]{1,64}$/;
const PHONE = /^\+?[0-9][0-9 ()-]{2,19}$/;
const EMAIL = /^[^\s@<>"'()]{1,64}@[^\s@<>"'()]{1,190}\.[a-z]{2,24}$/i;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PARAM = /^[A-Za-z0-9_-]{1,40}$/;
const ITEM_FIELD = /^(?:field:[\w-]{1,64}|item:(?:title|index))$/;
const NUMBER = /^-?\d{1,12}(?:\.\d{1,4})?$/;

/**
 * An address a click may open: http(s), a page of this site (/menu), a
 * section on the page (#offers), tel:, mailto: (wa.me is https). Never
 * javascript:, data: or protocol-relative (//host).
 */
export function safeLink(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 1000 || CONTROL.test(url))
    return false;
  return /^(?:https?:\/\/[^\s"'<>\\]+|\/(?![/\\])[^\s"'<>\\]*|#[A-Za-z][\w-]{0,63}|tel:\+?[0-9 ()-]{3,20}|mailto:[^\s"'<>\\]{3,254})$/i.test(
    url,
  );
}
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max && !CONTROL.test(v);
const optional = (v: unknown, max: number) => v === undefined || text(v, max);
const keys = (o: object, allowed: string[]) =>
  Object.keys(o).every((k) => allowed.includes(k));

export function actionValid(a: unknown): a is Action {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const x = a as Record<string, unknown>;
  switch (x.do) {
    case "page":
      return (
        keys(x, ["do", "page"]) && typeof x.page === "string" && ID.test(x.page)
      );
    case "link":
      return (
        keys(x, ["do", "url", "newTab"]) &&
        safeLink(x.url) &&
        (x.newTab === undefined || typeof x.newTab === "boolean")
      );
    case "scroll":
      return (
        keys(x, ["do", "target"]) &&
        typeof x.target === "string" &&
        ID.test(x.target)
      );
    case "openDialog":
      return (
        keys(x, ["do", "dialog"]) &&
        typeof x.dialog === "string" &&
        ID.test(x.dialog)
      );
    case "closeDialog":
      return keys(x, ["do"]);
    case "call":
      return (
        keys(x, ["do", "phone"]) &&
        typeof x.phone === "string" &&
        PHONE.test(x.phone)
      );
    case "whatsapp":
      return (
        keys(x, ["do", "phone", "text"]) &&
        typeof x.phone === "string" &&
        PHONE.test(x.phone) &&
        optional(x.text, MAX_TEXT)
      );
    case "email":
      return (
        keys(x, ["do", "to", "subject"]) &&
        typeof x.to === "string" &&
        EMAIL.test(x.to) &&
        optional(x.subject, MAX_VALUE)
      );
    case "copy":
      return (
        keys(x, ["do", "text", "toast"]) &&
        text(x.text, MAX_TEXT) &&
        (x.text as string).length > 0 &&
        optional(x.toast, 60)
      );
    case "setVar":
      return (
        keys(x, ["do", "name", "value"]) &&
        typeof x.name === "string" &&
        VAR_NAME.test(x.name) &&
        text(x.value, MAX_VALUE)
      );
    case "toggleVar":
      return (
        keys(x, ["do", "name"]) &&
        typeof x.name === "string" &&
        VAR_NAME.test(x.name)
      );
  }
  return false;
}
export function onValid(on: unknown, type: Node["type"]): boolean {
  if (on === undefined) return true;
  if (!on || typeof on !== "object" || Array.isArray(on)) return false;
  const o = on as On;
  return (
    keys(o, ["click"]) &&
    CLICKABLE.has(type) &&
    (o.click === undefined ||
      (Array.isArray(o.click) &&
        o.click.length >= 1 &&
        o.click.length <= MAX_ACTIONS &&
        o.click.every(actionValid)))
  );
}
const OPS = ["is", "not", "set", "empty", "gt", "lt"];
function ruleValid(r: unknown): r is Rule {
  if (!r || typeof r !== "object" || Array.isArray(r)) return false;
  const x = r as Record<string, unknown>;
  switch (x.if) {
    case "var":
      return (
        keys(x, ["if", "name", "op", "value"]) &&
        typeof x.name === "string" &&
        VAR_NAME.test(x.name) &&
        OPS.includes(x.op as string) &&
        optional(x.value, MAX_VALUE)
      );
    case "query":
      return (
        keys(x, ["if", "param", "op", "value"]) &&
        typeof x.param === "string" &&
        PARAM.test(x.param) &&
        ["is", "not", "set", "empty"].includes(x.op as string) &&
        optional(x.value, MAX_VALUE)
      );
    case "theme":
      return keys(x, ["if", "is"]) && (x.is === "light" || x.is === "dark");
    case "date":
      return (
        keys(x, ["if", "from", "to"]) &&
        (x.from === undefined ||
          (typeof x.from === "string" && DAY.test(x.from))) &&
        (x.to === undefined || (typeof x.to === "string" && DAY.test(x.to))) &&
        (x.from === undefined ||
          x.to === undefined ||
          (x.from as string) <= (x.to as string))
      );
    case "item":
      return (
        keys(x, ["if", "field", "op", "value"]) &&
        typeof x.field === "string" &&
        ITEM_FIELD.test(x.field) &&
        OPS.includes(x.op as string) &&
        optional(x.value, MAX_VALUE)
      );
  }
  return false;
}
export function conditionValid(c: unknown): boolean {
  if (c === undefined) return true;
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const x = c as Condition;
  return (
    keys(x, ["match", "rules"]) &&
    (x.match === "all" || x.match === "any") &&
    Array.isArray(x.rules) &&
    x.rules.length >= 1 &&
    x.rules.length <= MAX_RULES &&
    x.rules.every(ruleValid)
  );
}
/** A value fits its kind: any short text, a number, or yes / no. */
export function valueFits(type: PageVariable["type"], value: unknown) {
  if (!text(value, MAX_VALUE)) return false;
  if (type === "number") return NUMBER.test(value as string);
  if (type === "yesno") return value === "yes" || value === "no";
  return true;
}
export function variablesValid(list: unknown): boolean {
  if (list === undefined) return true;
  if (!Array.isArray(list) || list.length > MAX_VARIABLES) return false;
  const ok = list.every(
    (v: PageVariable) =>
      v &&
      typeof v === "object" &&
      keys(v, ["name", "type", "value", "remember"]) &&
      typeof v.name === "string" &&
      VAR_NAME.test(v.name) &&
      ["text", "number", "yesno"].includes(v.type) &&
      valueFits(v.type, v.value) &&
      (v.remember === undefined || typeof v.remember === "boolean"),
  );
  return (
    ok && new Set(list.map((v: PageVariable) => v.name)).size === list.length
  );
}

/* Evaluating */

export interface LogicEnv {
  /** Page values by name (as text: "yes" / "no" for yes-or-no values). */
  vars: Record<string, string>;
  /** The address's ?query values. */
  query: Record<string, string>;
  dark: boolean;
  /** Today, YYYY-MM-DD in the visitor's time zone. */
  today: string;
  /** Inside a repeat: the current item's shown values by binding source. */
  item?: Record<string, string>;
}

/**
 * Whether a condition holds. Self-contained (no imports, no closures): the
 * published script carries this function's source (runtime.ts). Item rules
 * without an item count as met. Values compare as text, ignoring case and
 * outer spaces; "more than" / "less than" compare numbers.
 */
export function evaluateCondition(cond: Condition, env: LogicEnv): boolean {
  const norm = (v: unknown) =>
    (typeof v === "string" ? v : "").trim().toLowerCase();
  const num = (v: string) => {
    const cleaned = v.replace(/[^0-9.-]/g, "");
    return cleaned ? Number(cleaned) : NaN;
  };
  const compare = (actual: string, op: string, wanted: string | undefined) => {
    const a = norm(actual);
    const b = norm(wanted);
    if (op === "set") return a !== "";
    if (op === "empty") return a === "";
    if (op === "not") return a !== b;
    if (op === "gt" || op === "lt") {
      const x = num(a);
      const y = num(b);
      if (x !== x || y !== y) return false;
      return op === "gt" ? x > y : x < y;
    }
    return a === b;
  };
  const one = (r: Rule): boolean => {
    if (r.if === "var") return compare(env.vars[r.name] ?? "", r.op, r.value);
    if (r.if === "query")
      return compare(env.query[r.param] ?? "", r.op, r.value);
    if (r.if === "theme") return (r.is === "dark") === !!env.dark;
    if (r.if === "date")
      return (!r.from || env.today >= r.from) && (!r.to || env.today <= r.to);
    if (r.if === "item")
      return env.item ? compare(env.item[r.field] ?? "", r.op, r.value) : true;
    return false;
  };
  const rules = cond && Array.isArray(cond.rules) ? cond.rules : [];
  if (!rules.length) return true;
  return cond.match === "any" ? rules.some(one) : rules.every(one);
}

/**
 * Splits a condition for drawing. Item rules are decided where the item is
 * known (collections and sample rows); the rest ("runtime") is decided by
 * page values, the address, the theme and the date, which change while the
 * visitor is on the page. `item` is the item rules of a published app-data
 * template, checked by the data script per row.
 */
export function splitCondition(
  cond: Condition,
  item: Record<string, string> | undefined,
  template = false,
): { decided?: boolean; runtime?: Condition; item?: Condition } {
  const mine = cond.rules.filter((r) => r.if === "item");
  const rest = cond.rules.filter((r) => r.if !== "item");
  const runtime = rest.length ? { match: cond.match, rules: rest } : undefined;
  if (!mine.length || (!item && !template)) return runtime ? { runtime } : {};
  if (template) return { runtime, item: { match: cond.match, rules: mine } };
  const env: LogicEnv = { vars: {}, query: {}, dark: false, today: "", item };
  const results = mine.map((r) =>
    evaluateCondition({ match: "all", rules: [r] }, env),
  );
  if (cond.match === "all") {
    if (results.includes(false)) return { decided: false };
    return runtime ? { runtime } : { decided: true };
  }
  if (results.includes(true)) return { decided: true };
  return runtime ? { runtime } : { decided: false };
}

/** Today as YYYY-MM-DD, in local time. */
export function today(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** Page values at their starting values. */
export const startValues = (vars: PageVariable[] = []) =>
  Object.fromEntries(vars.map((v) => [v.name, v.value]));
/** How a value reads in text: yes / no as "Yes" / "No". */
export function shownValue(v: PageVariable | undefined, value: string) {
  if (v?.type === "yesno") return value === "yes" ? "Yes" : "No";
  return value;
}
/** "{var:name}" in text shows that page value. */
export const VAR_PATTERN = /\{var:([a-z][a-z0-9_]{0,31})\}/g;
export const hasVars = (s: string) => s.includes("{var:");

/* The site's links for actions */

/** Digits for tel: and wa.me (keeps a leading +). */
export const phoneDigits = (phone: string) =>
  phone.trim().replace(/(?!^\+)[^0-9]/g, "");
/**
 * Where a going-somewhere action leads, or "" when it leads nowhere (a page
 * that was deleted). `pageHref` turns a page id into the site's link.
 */
export function actionHref(
  a: Action,
  pageHref: (page: string) => string | undefined,
): string {
  switch (a.do) {
    case "page":
      return pageHref(a.page) ?? "";
    case "link":
      return safeLink(a.url) ? a.url : "";
    case "scroll":
      return `#${anchorId(a.target)}`;
    case "call":
      return `tel:${phoneDigits(a.phone)}`;
    case "whatsapp":
      return `https://wa.me/${phoneDigits(a.phone).replace("+", "")}${a.text ? `?text=${encodeURIComponent(a.text)}` : ""}`;
    case "email":
      return `mailto:${a.to}${a.subject ? `?subject=${encodeURIComponent(a.subject)}` : ""}`;
    default:
      return "";
  }
}
/** The element id a "scroll to" action jumps to. */
export const anchorId = (node: string) => `b-${node}`;
/** A dialog block's element id. */
export const dialogId = (node: string) => `dlg-${node}`;

/** What the published script runs: the actions with their addresses worked out. */
export type RunAction =
  | { do: "go"; href: string; newTab?: boolean }
  | { do: "open"; dialog: string }
  | { do: "close" }
  | { do: "copy"; text: string; toast: string }
  | { do: "set"; name: string; value: string }
  | { do: "toggle"; name: string };
export function runActions(
  list: Action[],
  pageHref: (page: string) => string | undefined,
): RunAction[] {
  return list.flatMap((a): RunAction[] => {
    if (NAVIGATION.has(a.do)) {
      const href = actionHref(a, pageHref);
      if (!href) return [];
      return [
        {
          do: "go",
          href,
          ...(a.do === "link" && a.newTab ? { newTab: true } : {}),
          ...(a.do === "whatsapp" ? { newTab: true } : {}),
        },
      ];
    }
    switch (a.do) {
      case "openDialog":
        return [{ do: "open", dialog: dialogId(a.dialog) }];
      case "closeDialog":
        return [{ do: "close" }];
      case "copy":
        return [{ do: "copy", text: a.text, toast: a.toast || "Copied" }];
      case "setVar":
        return [{ do: "set", name: a.name, value: a.value }];
      case "toggleVar":
        return [{ do: "toggle", name: a.name }];
    }
    return [];
  });
}

/* Editing helpers */

/** Every page value name a tree mentions (actions, rules, "{var:…}" text). */
export function varsUsed(root: Node | undefined): Set<string> {
  const out = new Set<string>();
  if (!root) return out;
  for (const n of walk([root])) {
    for (const a of n.on?.click ?? [])
      if (a.do === "setVar" || a.do === "toggleVar") out.add(a.name);
    for (const r of n.when?.rules ?? []) if (r.if === "var") out.add(r.name);
    for (const v of Object.values(n.props))
      if (typeof v === "string" && hasVars(v))
        for (const m of v.matchAll(VAR_PATTERN)) out.add(m[1]);
  }
  return out;
}
/** A copy of the tree with the page value `from` called `to` everywhere. */
export function renameVar(root: Node, from: string, to: string): Node {
  const fix = (n: Node): Node => {
    let next = n;
    if (n.on?.click?.some((a) => "name" in a && a.name === from))
      next = {
        ...next,
        on: {
          click: n.on.click.map((a) =>
            "name" in a && a.name === from ? { ...a, name: to } : a,
          ),
        },
      };
    if (n.when?.rules.some((r) => r.if === "var" && r.name === from))
      next = {
        ...next,
        when: {
          ...n.when,
          rules: n.when.rules.map((r) =>
            r.if === "var" && r.name === from ? { ...r, name: to } : r,
          ),
        },
      };
    const props = Object.entries(n.props).filter(
      ([, v]) => typeof v === "string" && v.includes(`{var:${from}}`),
    );
    if (props.length)
      next = {
        ...next,
        props: {
          ...next.props,
          ...Object.fromEntries(
            props.map(([k, v]) => [
              k,
              (v as string).replaceAll(`{var:${from}}`, `{var:${to}}`),
            ]),
          ),
        },
      };
    return n.children ? { ...next, children: n.children.map(fix) } : next;
  };
  return fix(root);
}
/** Whether a tree holds anything the logic script acts on. */
export function treeUsesLogic(root: Node | undefined): boolean {
  if (!root) return false;
  for (const n of walk([root]))
    if (
      n.on?.click?.length ||
      n.when ||
      n.type === "dialog" ||
      Object.values(n.props).some((v) => typeof v === "string" && hasVars(v))
    )
      return true;
  return false;
}
/** A fresh name like `tab`, `tab_2`… not in `taken`. */
export function freeName(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const root = (VAR_NAME.test(base) ? base : "value").slice(0, 28);
  if (!used.has(root)) return root;
  for (let i = 2; ; i++) if (!used.has(`${root}_${i}`)) return `${root}_${i}`;
}
