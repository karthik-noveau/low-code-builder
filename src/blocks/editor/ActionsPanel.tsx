/**
 * The Inspector's Actions tab (src/blocks/logic): what happens when a block
 * is clicked ("When clicked", up to three steps run in order), when it shows
 * ("Show only when…", up to four rules), and the page values both use
 * ("Page values": add, rename everywhere, delete). Every change is one undo
 * step; text that isn't usable yet (a half-typed phone number) stays in the
 * panel, with a note, until it is.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../studio/Icon";
import { IconButton } from "../../studio/ui";
import { useStudio } from "../../studio/store";
import type { Page, Project, Section } from "../../studio/model";
import { walk, type Node } from "../model";
import { BLOCKS, createNode, nodeLabel } from "../registry";
import { enclosingRepeat, sourceFields } from "../data/bind";
import { newFormBlock } from "../forms/sync";
import {
  CLICKABLE,
  evaluateCondition,
  freeName,
  MAX_ACTIONS,
  MAX_RULES,
  MAX_VARIABLES,
  renameVar,
  safeLink,
  today,
  valueFits,
  VAR_NAME,
  varsUsed,
  type Action,
  type ActionKind,
  type Condition,
  type Op,
  type PageVariable,
  type Rule,
} from "../logic/model";
import { Group } from "./StylePanel";
import { Segmented, Switch } from "./fields";
import type { Notify } from "./actions";
import "./actions-panel.css";

type Kind = ActionKind | "form";
const KINDS: {
  group: string;
  items: { kind: Kind; icon: string; label: string; hint: string }[];
}[] = [
  {
    group: "Go somewhere",
    items: [
      {
        kind: "page",
        icon: "pages",
        label: "Open a page",
        hint: "Another page of your site",
      },
      {
        kind: "link",
        icon: "link",
        label: "Open a link",
        hint: "Any web address",
      },
      {
        kind: "scroll",
        icon: "scroll",
        label: "Scroll to a section",
        hint: "Somewhere on this page",
      },
    ],
  },
  {
    group: "On this page",
    items: [
      {
        kind: "openDialog",
        icon: "window",
        label: "Open a dialog",
        hint: "A pop-up or side panel",
      },
      {
        kind: "form",
        icon: "checklist",
        label: "Open a form",
        hint: "A form from your app, in a pop-up",
      },
      {
        kind: "closeDialog",
        icon: "x",
        label: "Close the dialog",
        hint: "For a button inside a dialog",
      },
      {
        kind: "setVar",
        icon: "tag",
        label: "Set a page value",
        hint: "Choose a tab, a plan, an option",
      },
      {
        kind: "toggleVar",
        icon: "toggle",
        label: "Switch on or off",
        hint: "Flip a yes-or-no page value",
      },
      {
        kind: "copy",
        icon: "copy",
        label: "Copy text",
        hint: "A coupon code, an address…",
      },
    ],
  },
  {
    group: "Get in touch",
    items: [
      {
        kind: "call",
        icon: "phone",
        label: "Call a number",
        hint: "Opens the phone’s dialler",
      },
      {
        kind: "whatsapp",
        icon: "message",
        label: "Message on WhatsApp",
        hint: "With a message ready to send",
      },
      {
        kind: "email",
        icon: "mail",
        label: "Send an email",
        hint: "Opens their email app",
      },
    ],
  },
];
const KIND_OF = Object.fromEntries(
  KINDS.flatMap((g) => g.items).map((i) => [i.kind, i]),
) as Record<Kind, (typeof KINDS)[number]["items"][number]>;

const PHONE = /^\+?[0-9][0-9 ()-]{2,19}$/;
const EMAIL = /^[^\s@<>"'()]{1,64}@[^\s@<>"'()]{1,190}\.[a-z]{2,24}$/i;

/** Every block on the page (header, page, footer) with its section. */
function pageNodes(project: Project, page: Page) {
  const out: { section: Section; node: Node }[] = [];
  for (const s of [...project.header, ...page.sections, ...project.footer])
    if (s.root)
      for (const n of walk([s.root])) out.push({ section: s, node: n });
  return out;
}
/** The link a block had before it got a click ("Goes to"), as an action. */
function fromLink(node: Node, project: Project): Action[] {
  const url = String(
    node.type === "button" ? (node.props.url ?? "") : (node.props.link ?? ""),
  ).trim();
  if (!url || url === "#") return [];
  const page = project.pages.find((p) => `/${p.slug}` === url);
  if (page) return [{ do: "page", page: page.id }];
  const tel = /^tel:(.+)$/i.exec(url);
  if (tel && PHONE.test(tel[1])) return [{ do: "call", phone: tel[1] }];
  const mail = /^mailto:([^?]+)/i.exec(url);
  if (mail && EMAIL.test(mail[1])) return [{ do: "email", to: mail[1] }];
  if (safeLink(url))
    return [
      {
        do: "link",
        url,
        ...(node.props.newTab === true ? { newTab: true } : {}),
      },
    ];
  return [];
}

/** A text input that saves only usable values and says what's wrong otherwise. */
function CheckedField({
  label,
  value,
  onSave,
  check,
  placeholder,
  hint,
  multiline,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  /** An explanation when the value can't be used, else "". */
  check: (value: string) => string;
  placeholder?: string;
  hint?: ReactNode;
  multiline?: boolean;
  type?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);
  // The value this field last saved, and the saved value last seen.
  const [mine, setMine] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // Saved elsewhere (undo, another field): show the saved value.
    setSeen(value);
    if (value !== mine) {
      setMine(value);
      setDraft(value);
    }
  }
  const problem = check(draft);
  const change = (v: string) => {
    setDraft(v);
    if (!check(v) && v !== mine) {
      setMine(v);
      onSave(v);
    }
  };
  const Input = multiline ? "textarea" : "input";
  return (
    <div
      className={`field ap-field ${touched && problem ? "has-problem" : ""}`}
    >
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type={multiline ? undefined : type}
        rows={multiline ? 3 : undefined}
        value={draft}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={touched && !!problem}
        aria-describedby={touched && problem ? `${id}-problem` : undefined}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {touched && problem ? (
        <small className="ap-problem" id={`${id}-problem`} role="alert">
          <Icon name="help" size={12} />
          {problem}
        </small>
      ) : (
        hint && <small className="block-hint">{hint}</small>
      )}
    </div>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <small className="block-hint">{hint}</small>}
    </div>
  );
}

/** "When clicked": a menu of plain-language choices with icons. */
function KindPicker({
  value,
  onPick,
  allowNone,
  label,
  quiet,
}: {
  value: Kind | "none";
  onPick: (kind: Kind | "none") => void;
  allowNone: boolean;
  label: string;
  /** The group title already says it: the label is for screen readers. */
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current =
    value === "none"
      ? { icon: "minus", label: "Nothing happens", hint: "" }
      : KIND_OF[value];
  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')
      ?.focus();
    const away = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as globalThis.Node) &&
        !button.current?.contains(e.target as globalThis.Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const choose = (k: Kind | "none") => {
    setOpen(false);
    button.current?.focus();
    if (k !== value) onPick(k);
  };
  const item = (k: Kind | "none", icon: string, text: string, hint: string) => (
    <button
      key={k}
      type="button"
      role="menuitemradio"
      aria-checked={k === value}
      className="ap-kind-item"
      onClick={() => choose(k)}
    >
      <span className="ap-kind-icon">
        <Icon name={icon} size={14} />
      </span>
      <span className="ap-kind-text">
        <strong>{text}</strong>
        {hint && <small>{hint}</small>}
      </span>
      {k === value && <Icon name="check" size={13} className="ap-kind-check" />}
    </button>
  );
  return (
    <div className="ap-kind">
      <span className={quiet ? "sr-only" : "ap-kind-label"} id={id}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        className={`ap-kind-current ${value === "none" ? "is-none" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-labelledby={`${id} ${id}-v`}
        onClick={() => setOpen(!open)}
      >
        <span className="ap-kind-icon">
          <Icon name={current.icon} size={14} />
        </span>
        <span id={`${id}-v`}>{current.label}</span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div
          ref={menu}
          className="ap-kind-menu"
          role="menu"
          aria-labelledby={id}
          onKeyDown={(e) => {
            const items = [
              ...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ??
                []),
            ];
            const at = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next =
                (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
              items[next]?.focus();
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              items[e.key === "Home" ? 0 : items.length - 1]?.focus();
            }
          }}
        >
          {allowNone && item("none", "minus", "Nothing happens", "")}
          {KINDS.map((g) => (
            <div
              key={g.group}
              className="ap-kind-group"
              role="group"
              aria-label={g.group}
            >
              <span className="ap-kind-group-name" aria-hidden="true">
                {g.group}
              </span>
              {g.items.map((i) => item(i.kind, i.icon, i.label, i.hint))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionsPanel({
  section,
  node,
  notify,
  onSelectNode,
}: {
  section: Section;
  node: Node;
  notify: Notify;
  /** Selects a block (in any section of the page). */
  onSelectNode: (section: string, node: string) => void;
}) {
  const store = useStudio();
  const project = store.project;
  const page =
    project.pages.find((p) => p.id === store.activePage) ?? project.pages[0];
  const clickable = CLICKABLE.has(node.type);
  return (
    <div className="ap">
      {clickable && (
        <Group id="actions-click" title="When clicked">
          <ClickEditor
            key={node.id}
            section={section}
            node={node}
            page={page}
            notify={notify}
            onSelectNode={onSelectNode}
          />
        </Group>
      )}
      {node.type === "dialog" && (
        <Group id="actions-opened" title="Opened by">
          <OpenedBy node={node} page={page} onSelectNode={onSelectNode} />
        </Group>
      )}
      <Group
        id="actions-when"
        title="Show only when…"
        badge={node.when?.rules.length}
      >
        <WhenEditor key={node.id} section={section} node={node} page={page} />
      </Group>
      <Group
        id="actions-values"
        title="Page values"
        open={!!page.variables?.length}
      >
        <ValuesEditor
          page={page}
          section={section}
          node={node}
          notify={notify}
        />
      </Group>
    </div>
  );
}

/* When clicked */

function ClickEditor({
  section,
  node,
  page,
  notify,
  onSelectNode,
}: {
  section: Section;
  node: Node;
  page: Page;
  notify: Notify;
  onSelectNode: (section: string, node: string) => void;
}) {
  const store = useStudio();
  const project = store.project;
  const saved = node.on?.click ?? fromLink(node, project);
  // A step chosen but not usable yet (no phone number typed…), by place.
  const [pending, setPending] = useState<{ at: number; kind: Kind } | null>(
    null,
  );
  const all = pageNodes(project, page);
  const dialogs = all.filter((x) => x.node.type === "dialog");
  const variables = page.variables ?? [];
  const forms = project.app?.forms.filter((f) => f.kind === "submit") ?? [];
  const bound = node.bind && ("url" in node.bind || "link" in node.bind);
  // New dialogs go at the end of this section, which a lock keeps as it is.
  const dialogLock = section.root?.locked
    ? `${section.name} is locked. Unlock it in Layers to add a dialog to it.`
    : null;

  /** Saves the steps (one undo step), dropping the block's old "Goes to" link. */
  const save = (
    list: Action[],
    coalesce?: string,
    extra?: (p: Project) => Project,
  ) => {
    const apply = (n: Node): Node => {
      const next: Node = { ...n, props: { ...n.props } };
      if (list.length) next.on = { click: list };
      else delete next.on;
      if (n.type === "button" && list.length) {
        next.props.url = "";
        next.props.newTab = false;
      }
      if (["image", "box"].includes(n.type) && list.length && next.props.link)
        next.props.link = "";
      return next;
    };
    store.commit((p) => {
      const base = extra ? extra(p) : p;
      return mapTree(base, section.id, node.id, apply);
    }, coalesce);
  };
  const setAt = (at: number, action: Action, coalesce?: string) => {
    const list = [...saved];
    list[at] = action;
    save(list, coalesce);
    if (pending?.at === at) setPending(null);
  };
  const removeAt = (at: number) => {
    const list = saved.filter((_, i) => i !== at);
    save(list);
    setPending(null);
    if (!list.length)
      notify("Click removed", { label: "Undo", run: store.undo });
  };
  const move = (at: number, by: -1 | 1) => {
    const list = [...saved];
    const [a] = list.splice(at, 1);
    list.splice(at + by, 0, a);
    save(list);
  };

  /** Picking what a step does: a usable start, or a pending step to fill in. */
  const pick = (at: number, kind: Kind | "none") => {
    if (kind === "none") {
      save([]);
      setPending(null);
      return;
    }
    const others = project.pages.filter((p) => p.id !== page.id);
    const start: Action | null =
      kind === "page"
        ? { do: "page", page: (others[0] ?? page).id }
        : kind === "scroll"
          ? (() => {
              const target = page.sections.find(
                (s) => s.root && s.id !== section.id && !s.hidden,
              );
              return target?.root
                ? { do: "scroll", target: target.root.id }
                : null;
            })()
          : kind === "closeDialog"
            ? { do: "closeDialog" }
            : kind === "openDialog" && dialogs.length
              ? { do: "openDialog", dialog: dialogs[0].node.id }
              : null;
    if (start) {
      setAt(at, start);
      return;
    }
    if (kind === "openDialog") {
      // No dialog on the page yet: one is added to this section.
      if (dialogLock) return notify(dialogLock);
      const dialog = createNode("dialog", { title: "A short title" });
      dialog.name = "Dialog";
      const list = [...saved];
      list[at] = { do: "openDialog", dialog: dialog.id };
      save(list, undefined, (p) => addToRoot(p, section.id, dialog));
      setPending(null);
      notify("Dialog added. Select it in Layers or on the page to fill it in.");
      return;
    }
    if (kind === "setVar" || kind === "toggleVar") {
      const fit = variables.filter(
        (v) => kind === "setVar" || v.type === "yesno",
      );
      if (fit.length) {
        setAt(
          at,
          kind === "setVar"
            ? { do: "setVar", name: fit[0].name, value: firstValue(fit[0]) }
            : { do: "toggleVar", name: fit[0].name },
        );
        return;
      }
      // No page value of the right kind: one is added, named for the job.
      const v: PageVariable =
        kind === "setVar"
          ? {
              name: freeName(
                "tab",
                variables.map((x) => x.name),
              ),
              type: "text",
              value: "one",
            }
          : {
              name: freeName(
                "open",
                variables.map((x) => x.name),
              ),
              type: "yesno",
              value: "no",
            };
      const list = [...saved];
      list[at] =
        kind === "setVar"
          ? { do: "setVar", name: v.name, value: "one" }
          : { do: "toggleVar", name: v.name };
      save(list, undefined, (p) =>
        withVariables(p, page.id, [...variables, v]),
      );
      setPending(null);
      notify(`Page value “${v.name}” added. Rename it under Page values.`);
      return;
    }
    // Needs typing first (address, number, text) or a form choice.
    setPending({ at, kind });
  };

  const steps = saved.length + (pending && pending.at >= saved.length ? 1 : 0);
  const rows = Array.from({ length: Math.max(1, steps) }, (_, i) => i);
  return (
    <div className="ap-click">
      {bound && (
        <p className="ap-note">
          <Icon name="layers" size={13} />
          This block’s link comes from each item (Data tab). A click set here is
          used instead.
        </p>
      )}
      {rows.map((at) => {
        const action = saved[at] as Action | undefined;
        const kind: Kind | "none" =
          pending?.at === at
            ? pending.kind
            : action
              ? action.do === "openDialog" && dialogHasForm(all, action.dialog)
                ? "form"
                : action.do
              : "none";
        const first = at === 0;
        return (
          <div
            key={at}
            className={`ap-step ${kind === "none" ? "is-empty" : ""}`}
          >
            {steps > 1 && (
              <div className="ap-step-head">
                <span className="ap-step-number">{at + 1}</span>
                <span>{first ? "First" : "Then"}</span>
                <span className="ap-step-tools">
                  <IconButton
                    icon="up"
                    label="Do this earlier"
                    disabled={at === 0 || at >= saved.length}
                    onClick={() => move(at, -1)}
                  />
                  <IconButton
                    icon="down"
                    label="Do this later"
                    disabled={at >= saved.length - 1}
                    onClick={() => move(at, 1)}
                  />
                  <IconButton
                    icon="x"
                    label="Remove this step"
                    onClick={() =>
                      at >= saved.length ? setPending(null) : removeAt(at)
                    }
                  />
                </span>
              </div>
            )}
            <KindPicker
              label={first ? "When clicked" : "Then"}
              quiet={first && steps <= 1}
              value={kind}
              allowNone={first && steps <= 1}
              onPick={(k) => pick(at, k)}
            />
            {kind !== "none" && (
              <ActionSettings
                kind={kind}
                action={pending?.at === at ? undefined : action}
                page={page}
                section={section}
                node={node}
                dialogs={dialogs}
                forms={forms}
                onSave={(a, coalesce) => setAt(at, a, coalesce)}
                onAddFormDialog={(formId) => {
                  const app = project.app;
                  const form = app?.forms.find((f) => f.id === formId);
                  if (!app || !form) return;
                  if (dialogLock) return notify(dialogLock);
                  const dialog = createNode("dialog", { title: form.name });
                  dialog.name = `${form.name} (dialog)`;
                  dialog.children = [newFormBlock(app, form)];
                  const list = [...saved];
                  list[at] = { do: "openDialog", dialog: dialog.id };
                  save(list, undefined, (p) =>
                    addToRoot(p, section.id, dialog),
                  );
                  setPending(null);
                  notify(
                    `“${form.name}” opens in a dialog. Select it on the page to change it.`,
                  );
                }}
                onEditDialog={(id) => {
                  const found = dialogs.find((d) => d.node.id === id);
                  if (found) onSelectNode(found.section.id, id);
                }}
              />
            )}
          </div>
        );
      })}
      {saved.length > 0 && steps < MAX_ACTIONS && !pending && (
        <AddStep onPick={(k) => pick(saved.length, k)} />
      )}
      {saved.length > 0 && (
        <p className="ap-note is-quiet">
          <Icon name="eye" size={13} />
          Clicks run on your published site and in Preview, not while you edit.
        </p>
      )}
    </div>
  );
}
/** "Then also…": adds a step (up to three). */
function AddStep({ onPick }: { onPick: (k: Kind) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        className="node-add-inside ap-add"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={14} />
        Then also…
      </button>
    );
  return (
    <div className="ap-step">
      <div className="ap-step-head">
        <span className="ap-step-number">+</span>
        <span>Then</span>
        <span className="ap-step-tools">
          <IconButton
            icon="x"
            label="Don’t add a step"
            onClick={() => setOpen(false)}
          />
        </span>
      </div>
      <KindPicker
        label="Then"
        value="none"
        allowNone={false}
        onPick={(k) => {
          setOpen(false);
          if (k !== "none") onPick(k);
        }}
      />
    </div>
  );
}

function firstValue(v: PageVariable) {
  return v.type === "yesno" ? "yes" : v.value;
}
function dialogHasForm(all: { node: Node }[], id: string) {
  const d = all.find((x) => x.node.id === id)?.node;
  return !!d && [...walk([d])].some((n) => n.type === "form");
}

function ActionSettings({
  kind,
  action,
  page,
  section,
  node,
  dialogs,
  forms,
  onSave,
  onAddFormDialog,
  onEditDialog,
}: {
  kind: Kind;
  /** Undefined while the step is still being filled in. */
  action?: Action;
  page: Page;
  section: Section;
  node: Node;
  dialogs: { section: Section; node: Node }[];
  forms: { id: string; name: string }[];
  onSave: (a: Action, coalesce?: string) => void;
  onAddFormDialog: (form: string) => void;
  onEditDialog: (dialog: string) => void;
}) {
  const project = useStudio((s) => s.project);
  const variables = page.variables ?? [];
  const key = (f: string) => `click:${node.id}:${kind}:${f}`;
  const fresh = !action;
  const phoneCheck = (v: string) =>
    PHONE.test(v.trim()) ? "" : "Type a phone number, like +91 98765 43210.";
  switch (kind) {
    case "page": {
      const a = action?.do === "page" ? action : undefined;
      return (
        <div className="ap-settings">
          <Select
            label="Page"
            value={a?.page ?? ""}
            options={project.pages.map((p) => ({
              value: p.id,
              label: p.id === page.id ? `${p.name} (this page)` : p.name,
            }))}
            onChange={(v) => onSave({ do: "page", page: v })}
          />
        </div>
      );
    }
    case "link": {
      const a = action?.do === "link" ? action : undefined;
      return (
        <div className="ap-settings">
          <CheckedField
            label="Web address"
            value={a?.url ?? ""}
            placeholder="https://"
            autoFocus={fresh}
            check={(v) =>
              safeLink(v.trim())
                ? ""
                : "Start with https://, / for one of your pages, or # for a section."
            }
            onSave={(v) =>
              onSave(
                {
                  do: "link",
                  url: v.trim(),
                  ...(a?.newTab ? { newTab: true } : {}),
                },
                key("url"),
              )
            }
          />
          {a && (
            <Switch
              label="Open in a new tab"
              checked={!!a.newTab}
              onChange={(on) =>
                onSave({
                  do: "link",
                  url: a.url,
                  ...(on ? { newTab: true } : {}),
                })
              }
            />
          )}
        </div>
      );
    }
    case "scroll": {
      const a = action?.do === "scroll" ? action : undefined;
      const targets = page.sections.filter((s) => s.root && !s.hidden);
      if (!targets.length)
        return (
          <p className="ap-note">This page has no sections to scroll to yet.</p>
        );
      return (
        <div className="ap-settings">
          <Select
            label="Section"
            value={a?.target ?? ""}
            options={[
              ...(a
                ? []
                : [{ value: "", label: "Choose a section", disabled: true }]),
              ...targets.map((s) => ({
                value: s.root!.id,
                label:
                  s.id === section.id ? `${s.name} (this section)` : s.name,
              })),
            ]}
            onChange={(v) => onSave({ do: "scroll", target: v })}
          />
        </div>
      );
    }
    case "openDialog": {
      const a = action?.do === "openDialog" ? action : undefined;
      return (
        <div className="ap-settings">
          <Select
            label="Dialog"
            value={a?.dialog ?? ""}
            options={dialogs.map((d) => ({
              value: d.node.id,
              label: String(d.node.props.title || nodeLabel(d.node)),
            }))}
            onChange={(v) => onSave({ do: "openDialog", dialog: v })}
          />
          {a && (
            <button
              type="button"
              className="dp-link-button"
              onClick={() => onEditDialog(a.dialog)}
            >
              <Icon name="edit" size={13} />
              Edit this dialog
            </button>
          )}
        </div>
      );
    }
    case "form": {
      const a = action?.do === "openDialog" ? action : undefined;
      if (a)
        return (
          <div className="ap-settings">
            <p className="ap-note is-quiet">
              <Icon name="window" size={13} />
              Opens “
              {String(
                dialogs.find((d) => d.node.id === a.dialog)?.node.props.title ??
                  "the form",
              )}
              ” in a pop-up.
            </p>
            <button
              type="button"
              className="dp-link-button"
              onClick={() => onEditDialog(a.dialog)}
            >
              <Icon name="edit" size={13} />
              Edit the form’s dialog
            </button>
          </div>
        );
      if (!forms.length)
        return (
          <p className="ap-note">
            <Icon name="help" size={13} />
            Your app has no forms yet. Add a form section from Add (Forms), or
            make one in App, then come back.
          </p>
        );
      return (
        <div className="ap-settings">
          <Select
            label="Form"
            value=""
            options={[
              { value: "", label: "Choose a form", disabled: true },
              ...forms.map((f) => ({ value: f.id, label: f.name })),
            ]}
            onChange={onAddFormDialog}
            hint="It’s added to this section as a dialog you can change."
          />
        </div>
      );
    }
    case "closeDialog":
      return (
        <p className="ap-note is-quiet">
          <Icon name="window" size={13} />
          Closes the dialog this block sits in.
        </p>
      );
    case "call": {
      const a = action?.do === "call" ? action : undefined;
      return (
        <div className="ap-settings">
          <CheckedField
            label="Phone number"
            type="tel"
            value={a?.phone ?? ""}
            placeholder="+91 98765 43210"
            autoFocus={fresh}
            check={phoneCheck}
            onSave={(v) =>
              onSave({ do: "call", phone: v.trim() }, key("phone"))
            }
          />
        </div>
      );
    }
    case "whatsapp": {
      const a = action?.do === "whatsapp" ? action : undefined;
      return (
        <div className="ap-settings">
          <CheckedField
            label="WhatsApp number"
            type="tel"
            value={a?.phone ?? ""}
            placeholder="+91 98765 43210"
            autoFocus={fresh}
            check={phoneCheck}
            hint="With the country code, so it works from anywhere."
            onSave={(v) =>
              onSave(
                {
                  do: "whatsapp",
                  phone: v.trim(),
                  ...(a?.text ? { text: a.text } : {}),
                },
                key("phone"),
              )
            }
          />
          {a && (
            <CheckedField
              label="Message ready to send (optional)"
              value={a.text ?? ""}
              multiline
              placeholder="Hi! I’d like to book a table."
              check={(v) =>
                v.length > 500 ? "Keep it under 500 characters." : ""
              }
              onSave={(v) =>
                onSave(
                  { do: "whatsapp", phone: a.phone, ...(v ? { text: v } : {}) },
                  key("text"),
                )
              }
            />
          )}
        </div>
      );
    }
    case "email": {
      const a = action?.do === "email" ? action : undefined;
      return (
        <div className="ap-settings">
          <CheckedField
            label="Email address"
            type="email"
            value={a?.to ?? ""}
            placeholder="hello@yourshop.in"
            autoFocus={fresh}
            check={(v) =>
              EMAIL.test(v.trim())
                ? ""
                : "Type an email address, like hello@yourshop.in."
            }
            onSave={(v) =>
              onSave(
                {
                  do: "email",
                  to: v.trim(),
                  ...(a?.subject ? { subject: a.subject } : {}),
                },
                key("to"),
              )
            }
          />
          {a && (
            <CheckedField
              label="Subject (optional)"
              value={a.subject ?? ""}
              placeholder="A question about…"
              check={(v) =>
                v.length > 200 ? "Keep it under 200 characters." : ""
              }
              onSave={(v) =>
                onSave(
                  { do: "email", to: a.to, ...(v ? { subject: v } : {}) },
                  key("subject"),
                )
              }
            />
          )}
        </div>
      );
    }
    case "copy": {
      const a = action?.do === "copy" ? action : undefined;
      return (
        <div className="ap-settings">
          <CheckedField
            label="Text to copy"
            value={a?.text ?? ""}
            placeholder="DIWALI20"
            autoFocus={fresh}
            check={(v) =>
              !v
                ? "Type the text visitors copy."
                : v.length > 500
                  ? "Keep it under 500 characters."
                  : ""
            }
            onSave={(v) =>
              onSave(
                {
                  do: "copy",
                  text: v,
                  ...(a?.toast ? { toast: a.toast } : {}),
                },
                key("text"),
              )
            }
          />
          {a && (
            <CheckedField
              label="Note after copying"
              value={a.toast ?? ""}
              placeholder="Copied"
              check={(v) =>
                v.length > 60 ? "Keep it short (60 characters)." : ""
              }
              onSave={(v) =>
                onSave(
                  { do: "copy", text: a.text, ...(v ? { toast: v } : {}) },
                  key("toast"),
                )
              }
            />
          )}
        </div>
      );
    }
    case "setVar": {
      const a = action?.do === "setVar" ? action : undefined;
      const v = variables.find((x) => x.name === a?.name);
      return (
        <div className="ap-settings">
          <Select
            label="Page value"
            value={a?.name ?? ""}
            options={[
              ...(v
                ? []
                : [
                    {
                      value: a?.name ?? "",
                      label: a ? `${a.name} (removed)` : "Choose",
                      disabled: true,
                    },
                  ]),
              ...variables.map((x) => ({ value: x.name, label: x.name })),
            ]}
            onChange={(name) => {
              const next = variables.find((x) => x.name === name);
              if (next) onSave({ do: "setVar", name, value: firstValue(next) });
            }}
          />
          {a && (
            <ValueInput
              label="Set it to"
              variable={v}
              value={a.value}
              onSave={(value) =>
                onSave({ do: "setVar", name: a.name, value }, key("value"))
              }
            />
          )}
          {a && v && v.type !== "yesno" && (
            <small className="block-hint">
              Blocks set to show when “{a.name}” is “{a.value || "…"}” appear
              after this click.
            </small>
          )}
        </div>
      );
    }
    case "toggleVar": {
      const a = action?.do === "toggleVar" ? action : undefined;
      const yesno = variables.filter((x) => x.type === "yesno");
      return (
        <div className="ap-settings">
          <Select
            label="Yes-or-no page value"
            value={a?.name ?? ""}
            options={[
              ...(yesno.some((x) => x.name === a?.name)
                ? []
                : [
                    {
                      value: a?.name ?? "",
                      label: a ? `${a.name} (not yes-or-no)` : "Choose",
                      disabled: true,
                    },
                  ]),
              ...yesno.map((x) => ({ value: x.name, label: x.name })),
            ]}
            onChange={(name) => onSave({ do: "toggleVar", name })}
            hint="Each click flips it between yes and no."
          />
        </div>
      );
    }
  }
}

/** A value of a page value's kind: yes/no buttons, a number, or text. */
function ValueInput({
  label,
  variable,
  value,
  onSave,
}: {
  label: string;
  variable?: PageVariable;
  value: string;
  onSave: (value: string) => void;
}) {
  if (variable?.type === "yesno")
    return (
      <div className="field">
        <span className="ap-label">{label}</span>
        <Segmented
          label={label}
          value={value === "yes" ? "yes" : "no"}
          withText
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          onChange={onSave}
        />
      </div>
    );
  return (
    <CheckedField
      label={label}
      value={value}
      type={variable?.type === "number" ? "number" : "text"}
      placeholder={variable?.type === "number" ? "0" : "e.g. yearly"}
      check={(v) =>
        variable && !valueFits(variable.type, v)
          ? variable.type === "number"
            ? "Type a number."
            : "Keep it under 200 characters."
          : v.length > 200
            ? "Keep it under 200 characters."
            : ""
      }
      onSave={onSave}
    />
  );
}

/* Opened by (dialogs) */

function OpenedBy({
  node,
  page,
  onSelectNode,
}: {
  node: Node;
  page: Page;
  onSelectNode: (section: string, node: string) => void;
}) {
  const project = useStudio((s) => s.project);
  const openers = pageNodes(project, page).filter((x) =>
    x.node.on?.click?.some(
      (a) => a.do === "openDialog" && a.dialog === node.id,
    ),
  );
  if (!openers.length)
    return (
      <p className="ap-note is-warning">
        <Icon name="help" size={13} />
        Nothing opens this dialog yet. Select a button, then in Actions choose
        When clicked → Open a dialog.
      </p>
    );
  return (
    <ul className="node-children" aria-label="Blocks that open this dialog">
      {openers.map(({ section, node: n }) => (
        <li key={n.id}>
          <button type="button" onClick={() => onSelectNode(section.id, n.id)}>
            <Icon name={BLOCKS[n.type].icon} size={13} />
            <span>
              {nodeLabel(n)}
              {typeof n.props.label === "string" && n.props.label
                ? ` · ${n.props.label}`
                : ""}
            </span>
            <Icon name="chevron" size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* Show only when */

const RULE_KINDS: { value: Rule["if"]; label: string }[] = [
  { value: "var", label: "A page value" },
  { value: "query", label: "The web address has" },
  { value: "theme", label: "Light or dark theme" },
  { value: "date", label: "Between two dates" },
  { value: "item", label: "This item’s field" },
];
const OP_LABELS: Record<Op, string> = {
  is: "is",
  not: "is not",
  set: "is filled in",
  empty: "is empty",
  gt: "is more than",
  lt: "is less than",
};
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return today(d);
};
const prettyDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function WhenEditor({
  section,
  node,
  page,
}: {
  section: Section;
  node: Node;
  page: Page;
}) {
  const store = useStudio();
  const project = store.project;
  const when = node.when;
  const variables = page.variables ?? [];
  const repeat = section.root ? enclosingRepeat(section.root, node) : undefined;
  const itemFields = repeat
    ? sourceFields(project, repeat.props.source).filter(
        (f) =>
          f.source !== "item:link" &&
          /^(field:|item:(title|index|price|image|description|category))/.test(
            f.source,
          ),
      )
    : [];
  const save = (next: Condition | undefined, coalesce?: string) =>
    store.updateNode(
      section.id,
      node.id,
      (n) => {
        const copy = { ...n };
        if (next?.rules.length) copy.when = next;
        else delete copy.when;
        return copy;
      },
      coalesce,
    );
  const newRule = (kind: Rule["if"]): Rule => {
    switch (kind) {
      case "var": {
        const v = variables[0];
        return v
          ? { if: "var", name: v.name, op: "is", value: firstValue(v) }
          : { if: "query", param: "ref", op: "is", value: "" };
      }
      case "query":
        return { if: "query", param: "ref", op: "is", value: "" };
      case "theme":
        return { if: "theme", is: "dark" };
      case "date":
        return { if: "date", from: today(), to: addDays(today(), 7) };
      case "item":
        return {
          if: "item",
          field: itemFields[0]?.source ?? "item:title",
          op: "set",
        };
    }
  };
  const kinds = RULE_KINDS.filter(
    (k) =>
      (k.value !== "item" || itemFields.length) &&
      (k.value !== "var" || variables.length),
  );
  if (!when)
    return (
      <div className="ap-when">
        <p className="node-empty-note">
          Always shown. Add a rule to show it only for a page value, a link like
          ?ref=instagram, the dark theme or certain dates.
        </p>
        <button
          type="button"
          className="node-add-inside ap-add"
          onClick={() =>
            save({
              match: "all",
              rules: [
                newRule(
                  variables.length
                    ? "var"
                    : itemFields.length
                      ? "item"
                      : "date",
                ),
              ],
            })
          }
        >
          <Icon name="plus" size={14} />
          Show only when…
        </button>
        <p className="ap-note is-quiet">
          <Icon name="mobile" size={13} />
          To hide it on phones or tablets, use Hide in Style for that screen
          size.
        </p>
      </div>
    );
  const setRule = (i: number, rule: Rule, coalesce?: string) =>
    save(
      { ...when, rules: when.rules.map((r, j) => (j === i ? rule : r)) },
      coalesce,
    );
  const env = {
    vars: Object.fromEntries(variables.map((v) => [v.name, v.value])),
    query: {},
    dark: false,
    today: today(),
  };
  const nowShown = evaluateCondition(
    { ...when, rules: when.rules.filter((r) => r.if !== "item") },
    env,
  );
  return (
    <div className="ap-when">
      {when.rules.length > 1 && (
        <div className="field">
          <span className="ap-label">Show it when</span>
          <Segmented
            label="Show it when"
            value={when.match}
            withText
            options={[
              { value: "all", label: "All of these" },
              { value: "any", label: "Any of these" },
            ]}
            onChange={(match) => save({ ...when, match })}
          />
        </div>
      )}
      {when.rules.map((rule, i) => (
        <div className="ap-rule" key={i}>
          <div className="ap-rule-head">
            {i > 0 && (
              <span className="ap-rule-join">
                {when.match === "all" ? "and" : "or"}
              </span>
            )}
            <select
              aria-label="What it depends on"
              value={rule.if}
              onChange={(e) =>
                setRule(i, newRule(e.target.value as Rule["if"]))
              }
            >
              {RULE_KINDS.filter(
                (k) =>
                  k.value === rule.if || kinds.some((x) => x.value === k.value),
              ).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <IconButton
              icon="x"
              label="Remove this rule"
              onClick={() =>
                save({ ...when, rules: when.rules.filter((_, j) => j !== i) })
              }
            />
          </div>
          <RuleSettings
            rule={rule}
            variables={variables}
            itemFields={itemFields}
            darkToggle={!!project.theme.darkToggle}
            onSave={(r, field) =>
              setRule(i, r, field && `when:${node.id}:${i}:${field}`)
            }
          />
        </div>
      ))}
      {when.rules.length < MAX_RULES && (
        <button
          type="button"
          className="node-add-inside ap-add"
          onClick={() =>
            save({
              ...when,
              rules: [
                ...when.rules,
                newRule(
                  when.rules[when.rules.length - 1].if === "date"
                    ? "query"
                    : "date",
                ),
              ],
            })
          }
        >
          <Icon name="plus" size={14} />
          Add a rule
        </button>
      )}
      <p className={`ap-status ${nowShown ? "is-on" : ""}`}>
        <Icon name={nowShown ? "eye" : "eyeOff"} size={13} />
        {nowShown
          ? "Shown to a visitor arriving today."
          : "Hidden for a visitor arriving today, until a rule is met."}{" "}
        Check other cases with Preview as, above the page.
      </p>
    </div>
  );
}

function RuleSettings({
  rule,
  variables,
  itemFields,
  darkToggle,
  onSave,
}: {
  rule: Rule;
  variables: PageVariable[];
  itemFields: { source: string; name: string; type: string }[];
  darkToggle: boolean;
  onSave: (rule: Rule, field?: string) => void;
}) {
  const ops = (number: boolean): Op[] =>
    number
      ? ["is", "not", "gt", "lt", "set", "empty"]
      : ["is", "not", "set", "empty"];
  const opSelect = (value: Op, list: Op[], onChange: (op: Op) => void) => (
    <select
      aria-label="How it compares"
      value={value}
      onChange={(e) => onChange(e.target.value as Op)}
    >
      {list.map((o) => (
        <option key={o} value={o}>
          {OP_LABELS[o]}
        </option>
      ))}
    </select>
  );
  const needsValue = (op: Op) => op !== "set" && op !== "empty";
  switch (rule.if) {
    case "var": {
      const v = variables.find((x) => x.name === rule.name);
      return (
        <div className="ap-rule-body">
          <div className="ap-inline">
            <select
              aria-label="Page value"
              value={rule.name}
              onChange={(e) => {
                const next = variables.find((x) => x.name === e.target.value);
                if (next)
                  onSave({
                    ...rule,
                    name: next.name,
                    value: firstValue(next),
                    op: "is",
                  });
              }}
            >
              {!v && <option value={rule.name}>{rule.name} (removed)</option>}
              {variables.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
            {v?.type !== "yesno" &&
              opSelect(rule.op, ops(v?.type === "number"), (op) =>
                onSave({ ...rule, op }),
              )}
          </div>
          {needsValue(rule.op) && (
            <ValueInput
              label={v?.type === "yesno" ? "Is" : "Value"}
              variable={v}
              value={rule.value ?? ""}
              onSave={(value) => onSave({ ...rule, value }, "value")}
            />
          )}
        </div>
      );
    }
    case "query":
      return (
        <div className="ap-rule-body">
          <div className="ap-inline">
            <span className="ap-inline-text">?</span>
            <InlineChecked
              label="Name in the address"
              value={rule.param}
              check={(v) => /^[A-Za-z0-9_-]{1,40}$/.test(v)}
              onSave={(param) => onSave({ ...rule, param }, "param")}
            />
            {opSelect(rule.op, ops(false), (op) =>
              onSave({ ...rule, op: op as "is" }),
            )}
          </div>
          {needsValue(rule.op) && (
            <CheckedField
              label="Value"
              value={rule.value ?? ""}
              placeholder="instagram"
              check={(v) =>
                v.length > 200 ? "Keep it under 200 characters." : ""
              }
              onSave={(value) => onSave({ ...rule, value }, "value")}
            />
          )}
          <small className="block-hint">
            For links like{" "}
            <code>
              yoursite.in/?{rule.param || "ref"}={rule.value || "instagram"}
            </code>{" "}
            in an ad or a post.
          </small>
        </div>
      );
    case "theme":
      return (
        <div className="ap-rule-body">
          <Segmented
            label="Theme"
            value={rule.is}
            withText
            options={[
              { value: "light", label: "Light", icon: "sun" },
              { value: "dark", label: "Dark", icon: "moon" },
            ]}
            onChange={(is) => onSave({ if: "theme", is })}
          />
          {!darkToggle && (
            <small className="block-hint">
              Your site is always light. Turn on “Light and dark” in Site styles
              for visitors to switch.
            </small>
          )}
        </div>
      );
    case "date": {
      const t = today();
      const state =
        rule.from && t < rule.from
          ? `Starts ${prettyDay(rule.from)}.`
          : rule.to && t > rule.to
            ? `Ended ${prettyDay(rule.to)}.`
            : "Showing now.";
      return (
        <div className="ap-rule-body">
          <div className="ap-dates">
            <DateInput
              label="From"
              value={rule.from ?? ""}
              max={rule.to}
              onSave={(from) =>
                onSave({
                  if: "date",
                  ...(from ? { from } : {}),
                  ...(rule.to ? { to: rule.to } : {}),
                })
              }
            />
            <DateInput
              label="Until"
              value={rule.to ?? ""}
              min={rule.from}
              onSave={(to) =>
                onSave({
                  if: "date",
                  ...(rule.from ? { from: rule.from } : {}),
                  ...(to ? { to } : {}),
                })
              }
            />
          </div>
          <small className="block-hint">
            Both days included, in the visitor’s time. {state}
          </small>
        </div>
      );
    }
    case "item": {
      const f = itemFields.find((x) => x.source === rule.field);
      const number = ["number", "money", "price"].includes(f?.type ?? "");
      return (
        <div className="ap-rule-body">
          <div className="ap-inline">
            <select
              aria-label="Field"
              value={rule.field}
              onChange={(e) => onSave({ ...rule, field: e.target.value })}
            >
              {!f && <option value={rule.field}>Field (removed)</option>}
              {itemFields.map((x) => (
                <option key={x.source} value={x.source}>
                  {x.name}
                </option>
              ))}
            </select>
            {opSelect(
              rule.op,
              ops(number || rule.op === "gt" || rule.op === "lt"),
              (op) => onSave({ ...rule, op }),
            )}
          </div>
          {needsValue(rule.op) && (
            <CheckedField
              label="Value"
              value={rule.value ?? ""}
              type={rule.op === "gt" || rule.op === "lt" ? "number" : "text"}
              check={(v) =>
                (rule.op === "gt" || rule.op === "lt") && v && isNaN(Number(v))
                  ? "Type a number."
                  : v.length > 200
                    ? "Keep it under 200 characters."
                    : ""
              }
              onSave={(value) => onSave({ ...rule, value }, "value")}
            />
          )}
        </div>
      );
    }
  }
}
function DateInput({
  label,
  value,
  min,
  max,
  onSave,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onSave: (day: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (
            !v ||
            (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
              (!min || v >= min) &&
              (!max || v <= max))
          )
            onSave(v);
        }}
      />
    </div>
  );
}
/** A small inline input that saves only when `check` passes. */
function InlineChecked({
  label,
  value,
  check,
  onSave,
}: {
  label: string;
  value: string;
  check: (v: string) => boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const ok = check(draft);
  return (
    <input
      aria-label={label}
      className={`ap-inline-input ${ok ? "" : "is-bad"}`}
      value={draft}
      aria-invalid={!ok}
      title={ok ? undefined : "Letters, numbers, - and _ only"}
      onChange={(e) => {
        setDraft(e.target.value);
        if (check(e.target.value)) onSave(e.target.value);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}

/* Page values */

function ValuesEditor({
  page,
  section,
  node,
  notify,
}: {
  page: Page;
  section: Section;
  node: Node;
  notify: Notify;
}) {
  const store = useStudio();
  const project = store.project;
  const variables = page.variables ?? [];
  const sections = [...project.header, ...page.sections, ...project.footer];
  const uses = (name: string) =>
    sections.reduce(
      (sum, s) =>
        sum +
        (s.root
          ? [...walk([s.root])].filter((n) =>
              varsUsed({ ...n, children: [] }).has(name),
            ).length
          : 0),
      0,
    );
  const texty = ["heading", "text", "button", "badge"].includes(node.type);
  const textKey = node.type === "button" ? "label" : "text";
  const set = (list: PageVariable[], coalesce?: string) =>
    store.commit((p) => withVariables(p, page.id, list), coalesce);
  const add = () =>
    set([
      ...variables,
      {
        name: freeName(
          "value",
          variables.map((v) => v.name),
        ),
        type: "text",
        value: "",
      },
    ]);
  const rename = (from: string, to: string) =>
    store.commit((p) => {
      const next = withVariables(
        p,
        page.id,
        variables.map((v) => (v.name === from ? { ...v, name: to } : v)),
      );
      const fix = (list: Section[]) =>
        list.map((s) =>
          s.root ? { ...s, root: renameVar(s.root, from, to) } : s,
        );
      return {
        ...next,
        header: fix(next.header),
        footer: fix(next.footer),
        pages: next.pages.map((pg) =>
          pg.id === page.id ? { ...pg, sections: fix(pg.sections) } : pg,
        ),
      };
    });
  return (
    <div className="ap-values">
      <p className="node-empty-note">
        What this page remembers while someone is on it, like the chosen tab or
        plan. Clicks change them; blocks show by them; text shows one with{" "}
        <code>{"{var:name}"}</code>.
      </p>
      {variables.map((v) => {
        const count = uses(v.name);
        return (
          <div className="ap-value" key={v.name}>
            <div className="ap-value-head">
              <NameInput
                value={v.name}
                taken={variables.map((x) => x.name).filter((x) => x !== v.name)}
                onSave={(to) => {
                  rename(v.name, to);
                  notify(`Renamed to “${to}” everywhere on this page`, {
                    label: "Undo",
                    run: store.undo,
                  });
                }}
              />
              {texty && (
                <IconButton
                  icon="type"
                  label={`Show “${v.name}” in this block’s text`}
                  onClick={() =>
                    store.updateNode(section.id, node.id, (n) => ({
                      ...n,
                      props: {
                        ...n.props,
                        [textKey]: `${String(n.props[textKey] ?? "")}{var:${v.name}}`,
                      },
                    }))
                  }
                />
              )}
              <IconButton
                icon="trash"
                label={
                  count
                    ? `Delete “${v.name}” (used by ${count} block${count === 1 ? "" : "s"})`
                    : `Delete “${v.name}”`
                }
                onClick={() => {
                  set(variables.filter((x) => x.name !== v.name));
                  notify(
                    count
                      ? `“${v.name}” deleted. ${count} block${count === 1 ? " still mentions" : "s still mention"} it.`
                      : `“${v.name}” deleted`,
                    { label: "Undo", run: store.undo },
                  );
                }}
              />
            </div>
            <div className="ap-value-body">
              <Select
                label="Kind"
                value={v.type}
                options={[
                  { value: "text", label: "Text" },
                  { value: "number", label: "Number" },
                  { value: "yesno", label: "Yes or no" },
                ]}
                onChange={(t) => {
                  const type = t as PageVariable["type"];
                  const value = valueFits(type, v.value)
                    ? v.value
                    : type === "yesno"
                      ? "no"
                      : type === "number"
                        ? "0"
                        : v.value;
                  set(
                    variables.map((x) =>
                      x.name === v.name ? { ...x, type, value } : x,
                    ),
                  );
                }}
              />
              <ValueInput
                label="Starts as"
                variable={v}
                value={v.value}
                onSave={(value) =>
                  set(
                    variables.map((x) =>
                      x.name === v.name ? { ...x, value } : x,
                    ),
                    `var:${page.id}:${v.name}:value`,
                  )
                }
              />
            </div>
            <Switch
              label="Remember on the visitor’s device"
              checked={!!v.remember}
              onChange={(on) =>
                set(
                  variables.map((x) => {
                    if (x.name !== v.name) return x;
                    const next = { ...x };
                    if (on) next.remember = true;
                    else delete next.remember;
                    return next;
                  }),
                )
              }
            />
            <small className="ap-uses">
              {count
                ? `Used by ${count} block${count === 1 ? "" : "s"}`
                : "Not used yet"}
            </small>
          </div>
        );
      })}
      <button
        type="button"
        className="node-add-inside ap-add"
        disabled={variables.length >= MAX_VARIABLES}
        onClick={add}
      >
        <Icon name="plus" size={14} />
        Add a page value
      </button>
    </div>
  );
}
function NameInput({
  value,
  taken,
  onSave,
}: {
  value: string;
  taken: string[];
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const clean = draft
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const problem = !VAR_NAME.test(clean)
    ? "Start with a letter; letters, numbers and _ only."
    : taken.includes(clean)
      ? "Another page value has this name."
      : "";
  const done = () => {
    if (!problem && clean !== value) onSave(clean);
    else setDraft(value);
  };
  return (
    <span className="ap-name">
      <input
        aria-label="Name"
        value={draft}
        maxLength={32}
        aria-invalid={!!problem}
        title={problem || "Rename: updates every block that uses it"}
        className={problem ? "is-bad" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(value);
          }
        }}
      />
    </span>
  );
}

/* Project edits */

function mapTree(
  p: Project,
  section: string,
  id: string,
  fn: (n: Node) => Node,
): Project {
  const visit = (n: Node): Node =>
    n.id === id
      ? fn(n)
      : n.children
        ? { ...n, children: n.children.map(visit) }
        : n;
  const fix = (list: Section[]) =>
    list.map((s) =>
      s.id === section && s.root ? { ...s, root: visit(s.root) } : s,
    );
  return {
    ...p,
    header: fix(p.header),
    footer: fix(p.footer),
    pages: p.pages.map((pg) => ({ ...pg, sections: fix(pg.sections) })),
  };
}
/** Puts a block at the end of a section (dialogs made from the Actions tab). */
function addToRoot(p: Project, section: string, node: Node): Project {
  const fix = (list: Section[]) =>
    list.map((s) =>
      s.id === section && s.root && !s.root.locked
        ? {
            ...s,
            root: { ...s.root, children: [...(s.root.children ?? []), node] },
          }
        : s,
    );
  return {
    ...p,
    header: fix(p.header),
    footer: fix(p.footer),
    pages: p.pages.map((pg) => ({ ...pg, sections: fix(pg.sections) })),
  };
}
function withVariables(
  p: Project,
  page: string,
  list: PageVariable[],
): Project {
  return {
    ...p,
    pages: p.pages.map((pg) => {
      if (pg.id !== page) return pg;
      const next = { ...pg };
      if (list.length) next.variables = list;
      else delete next.variables;
      return next;
    }),
  };
}
