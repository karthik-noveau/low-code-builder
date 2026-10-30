/**
 * Logic while drawing blocks (render.tsx): whether a block shows, what its
 * click does, page values in text, and the dialog block. The same markup
 * serves three places:
 * - the editor: conditions follow "Preview as" (blocks that don't show are
 *   left out unless selected, then faded); clicks only select;
 * - the editor's Preview: React runs the clicks (useLogicPreview);
 * - the published page: the default state as HTML, with `data-act`,
 *   `data-when` and `data-var` hooks plus a JSON config for the logic
 *   script (runtime.ts). Going-somewhere clicks are real links.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Icon } from "../../studio/Icon";
import type { Page, Project, Section } from "../../studio/model";
import { contains, walk, type Node, type PropValue } from "../model";
import type { RenderContext } from "../render";
import type { DataItem } from "../data/bind";
import { anchorsOf } from "./project";
import {
  anchorId,
  dialogId,
  evaluateCondition,
  hasVars,
  NAVIGATION,
  runActions,
  shownValue,
  splitCondition,
  startValues,
  today,
  VAR_PATTERN,
  type Action,
  type LogicEnv,
  type PageVariable,
} from "./model";

/** What drawing needs to know about the page's logic (RenderContext.logic). */
export interface LogicContext {
  env: LogicEnv;
  variables: PageVariable[];
  /** Blocks a "scroll to" click jumps to: they get an id. */
  anchors: Set<string>;
  /** Preview: the open dialog (a dialog node id). */
  open?: string | null;
  /** Preview: the open dialog closed itself (Esc, close button). */
  onClose?: () => void;
  /** Preview: the "Copied" note (drawn in the open dialog, if any). */
  toast?: ReactNode;
}

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
/** Attributes added to a block's element (React reads "hidden" as on). */
type Attrs = Record<string, string | undefined>;

/** The page's starting state: what visitors without the script see. */
export function defaultLogic(page: Page | undefined): LogicContext {
  const variables = page?.variables ?? [];
  return {
    env: {
      vars: startValues(variables),
      query: {},
      dark: false,
      today: today(),
    },
    variables,
    anchors: new Set(),
  };
}
export const logicOf = (ctx: RenderContext) =>
  ctx.logic ?? defaultLogic(ctx.page);

/** A repeat item's shown values by binding source (item rules read them). */
export function itemValues(item: DataItem): Record<string, string> {
  const out: Record<string, string> = {
    "item:index": String(item.index + 1),
    "item:title": item.title ?? "",
  };
  for (const [k, v] of Object.entries(item.values)) out[`field:${k}`] = v;
  for (const [k, v] of Object.entries(item.paths ?? {})) out[`item:${k}`] = v;
  return out;
}

/**
 * Whether a block is drawn, and the attributes its "show only when" adds.
 * Null: not drawn.
 */
export function gate(
  n: Node,
  ctx: RenderContext,
): { attrs: Attrs; faded?: boolean } | null {
  const logic = logicOf(ctx);
  const attrs: Attrs = {};
  if (!ctx.edit && logic.anchors.has(n.id)) attrs.id = anchorId(n.id);
  if (!n.when) return { attrs };
  const template = !!ctx.item?.marker;
  const part = splitCondition(
    n.when,
    ctx.item && !template ? itemValues(ctx.item) : undefined,
    template,
  );
  let shown = part.decided !== false;
  if (shown && part.runtime) shown = evaluateCondition(part.runtime, logic.env);
  if (ctx.edit) {
    if (shown) return { attrs };
    // Selected (or holding the selection): shown faded so it can be edited.
    return ctx.edit.selected && contains(n, ctx.edit.selected)
      ? { attrs, faded: true }
      : null;
  }
  if (part.decided === false) return null;
  if (ctx.exporting) {
    // Published: the starting state, re-checked by the logic script.
    if (part.runtime) {
      attrs["data-when"] = n.id;
      if (!shown) attrs.hidden = "hidden";
    }
    if (part.item) attrs["data-item-when"] = JSON.stringify(part.item);
    return { attrs };
  }
  return shown ? { attrs } : null;
}

/** What clicking a block does, as drawn. Undefined: it has no click. */
export interface Click {
  /** Where it goes, for a real link (the first going-somewhere action). */
  href?: string;
  newTab?: boolean;
  /** Needs the script (not only a link): carries `data-act`. */
  run: boolean;
  /** Its state as a tab or switch: on when its page value matches. */
  on?: boolean;
  attrs: Attrs;
  /** A name for icon-only and image clicks. */
  label: string;
}
export function pageLink(ctx: RenderContext) {
  return (page: string) => {
    const p = ctx.project.pages.find((x) => x.id === page);
    return p ? ctx.href(`/${p.slug}`) : undefined;
  };
}
/** Plain words for an action ("Open Contact", "Call +91…"). */
export function actionLabel(a: Action, project: Project, root?: Node): string {
  switch (a.do) {
    case "page": {
      const p = project.pages.find((x) => x.id === a.page);
      return p ? `Open ${p.name}` : "Open a page";
    }
    case "link":
      return "Open link";
    case "scroll":
      return "Go to section";
    case "openDialog": {
      const d = root && [...walk([root])].find((x) => x.id === a.dialog);
      return d ? `Open ${str(d.props.title) || "dialog"}` : "Open dialog";
    }
    case "closeDialog":
      return "Close";
    case "call":
      return `Call ${a.phone}`;
    case "whatsapp":
      return "Message on WhatsApp";
    case "email":
      return `Email ${a.to}`;
    case "copy":
      return `Copy ${a.text}`;
    case "setVar":
      return `Show ${a.value}`;
    case "toggleVar":
      return "Switch";
  }
}
export function clickOf(n: Node, ctx: RenderContext): Click | undefined {
  const list = n.on?.click;
  if (!list?.length) return;
  const logic = logicOf(ctx);
  const nav = list.find((a) => NAVIGATION.has(a.do));
  const [first] = runActions(nav ? [nav] : [], pageLink(ctx));
  const href = first?.do === "go" ? first.href : undefined;
  const run = list.length > 1 || !nav;
  const attrs: Attrs = {};
  if (run && !ctx.edit && !ctx.miniature) attrs["data-act"] = n.id;
  const dialog = list.find((a) => a.do === "openDialog");
  if (dialog && !ctx.edit) {
    attrs["aria-haspopup"] = "dialog";
    attrs["aria-controls"] = dialogId(dialog.dialog);
  }
  // One "set" or "switch" click is a tab or a switch: it shows when it's on.
  let on: boolean | undefined;
  if (list.length === 1 && list[0].do === "setVar")
    on =
      (logic.env.vars[list[0].name] ?? "").trim().toLowerCase() ===
      list[0].value.trim().toLowerCase();
  if (list.length === 1 && list[0].do === "toggleVar")
    on = logic.env.vars[list[0].name] === "yes";
  if (on !== undefined && !ctx.edit) attrs["aria-pressed"] = String(on);
  return {
    href,
    newTab:
      (nav?.do === "link" && nav.newTab) || nav?.do === "whatsapp" || undefined,
    run,
    on,
    attrs,
    label: n.name || actionLabel(list[0], ctx.project),
  };
}
/** Link attributes for a click that goes somewhere. */
export function linkAttrs(click: Click, ctx: RenderContext): Attrs {
  return {
    href: click.href,
    ...(click.newTab && !ctx.edit ? { target: "_blank", rel: "noopener" } : {}),
  };
}

/** Text with "{var:name}" showing page values (kept up to date on the site). */
export function withVars(
  value: string,
  ctx: RenderContext,
  render: (s: string) => ReactNode = (s) => s,
): ReactNode {
  if (!hasVars(value)) return render(value);
  const logic = logicOf(ctx);
  const parts = value.split(VAR_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <span key={i}>{render(part)}</span>;
    const v = logic.variables.find((x) => x.name === part);
    const shown = shownValue(v, logic.env.vars[part] ?? "");
    return ctx.edit ? (
      <span key={i} className="blk-var" title={`Page value “${part}”`}>
        {shown || part}
      </span>
    ) : (
      <span key={i} data-var={part}>
        {shown}
      </span>
    );
  });
}

/** "Preview as": the state the editor draws the page in (not saved). */
export interface PreviewAs {
  vars: Record<string, string>;
  /** e.g. "ref=instagram". */
  query: string;
  theme: "" | "light" | "dark";
  /** A day to preview, YYYY-MM-DD; "" for today. */
  date: string;
}
export const NO_PREVIEW: PreviewAs = {
  vars: {},
  query: "",
  theme: "",
  date: "",
};
export function queryValues(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    new URLSearchParams(query.replace(/^\?/, "")).forEach((v, k) => {
      out[k] = v.slice(0, 200);
    });
  } catch {
    /* unreadable: no values */
  }
  return out;
}

/**
 * The editor's page logic. While editing it is "Preview as"; in Preview it
 * starts there and then follows the visitor's clicks: page values change,
 * dialogs open and close (focus returns to what opened them), copies show
 * "Copied".
 */
export function usePageLogic({
  page,
  sections,
  previewAs,
  preview,
  dark,
  onNavigate,
}: {
  page: Page;
  sections: Section[];
  previewAs: PreviewAs;
  preview: boolean;
  dark: boolean;
  onNavigate?: (page: string) => void;
}) {
  const variables = page.variables ?? [];
  const start = { ...startValues(variables) };
  for (const v of variables)
    if (previewAs.vars[v.name] !== undefined)
      start[v.name] = previewAs.vars[v.name];
  const [state, setState] = useState<{
    key: string;
    vars: Record<string, string>;
    open: string | null;
  }>();
  const key = `${page.id}:${preview}:${JSON.stringify(start)}`;
  const live = state?.key === key ? state : { key, vars: start, open: null };
  const [toast, setToast] = useState<{ text: string; at: number }>();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(undefined), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);
  const env: LogicEnv = {
    vars: live.vars,
    query: queryValues(previewAs.query),
    dark,
    today: previewAs.date || today(),
  };
  const close = () => {
    setState({ ...live, open: null });
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) window.setTimeout(() => back.focus(), 0);
  };
  const note =
    preview && toast ? (
      <div className="blk-toast is-shown" role="status" key={toast.at}>
        <Icon name="check" size={15} />
        {toast.text}
      </div>
    ) : null;
  const logic: LogicContext = {
    env,
    variables,
    anchors: anchorsOf(sections),
    open: live.open,
    onClose: close,
    toast: note,
  };
  /** Preview: runs a click on a block with `data-act`; true when it did. */
  const handle = (event: ReactMouseEvent) => {
    if (!preview) return false;
    const target = event.target as HTMLElement;
    if (target.closest("[data-dialog-close]")) {
      event.preventDefault();
      close();
      return true;
    }
    const el = target.closest<HTMLElement>("[data-act]");
    const id = el?.getAttribute("data-act");
    if (!el || !id) return false;
    let node: Node | undefined;
    for (const s of sections)
      if (s.root) for (const n of walk([s.root])) if (n.id === id) node = n;
    const list = node?.on?.click;
    if (!list) return false;
    event.preventDefault();
    let vars = live.vars;
    let open = live.open;
    for (const a of list)
      switch (a.do) {
        case "setVar":
          vars = { ...vars, [a.name]: a.value };
          break;
        case "toggleVar":
          vars = { ...vars, [a.name]: vars[a.name] === "yes" ? "no" : "yes" };
          break;
        case "openDialog":
          opener.current = el;
          open = a.dialog;
          break;
        case "closeDialog":
          open = null;
          break;
        case "copy":
          navigator.clipboard?.writeText(a.text).catch(() => {});
          setToast({ text: a.toast || "Copied", at: Date.now() });
          break;
        case "page":
          onNavigate?.(a.page);
          break;
        case "scroll":
          document
            .getElementById(anchorId(a.target))
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        default: {
          // Links, calls, WhatsApp and email leave the editor: a new tab.
          const [go] = runActions([a], () => undefined);
          if (go?.do === "go") window.open(go.href, "_blank", "noopener");
        }
      }
    if (open === null && live.open) {
      const back = opener.current;
      opener.current = null;
      if (back?.isConnected) window.setTimeout(() => back.focus(), 0);
    }
    setState({ key, vars, open });
    return true;
  };
  // The note goes in the open dialog when there is one.
  return { logic, handle, toast: live.open ? null : note };
}
