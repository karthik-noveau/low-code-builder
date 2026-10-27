/**
 * Heading and text blocks typed in place, with their formatting showing
 * (bold, italic, links, accent). Like InlineText otherwise: click selects,
 * double-click or Enter types, Escape cancels, ⌘Enter or clicking away saves.
 *
 * While typing, the element's content belongs to the browser and to
 * richDom.ts, not React: it is a separate element (keyed), filled from the
 * markup when typing starts and read back into markup when it ends.
 */
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  inlineLinks,
  MAX_INLINE_LINKS,
  normalizeRuns,
  parseInline,
  plainText,
  sameMeaning,
  serializeInline,
  type RichOptions,
  type Run,
} from "../richtext";
import {
  caretOnEdgeLine,
  fillRich,
  linkAt,
  rangeHas,
  rangeOffsets,
  readRich,
  richBus,
  richEditing,
  richShortcut,
  selectionOffsets,
  selectOffsets,
  setLink,
  toggleMark,
  wordRange,
  type RichController,
} from "./richDom";

type Snapshot = { runs: Run[]; sel: [number, number] };
/** One typing session (from double-click to saving). */
type Session = {
  original: string;
  cancelled: boolean;
  finished: boolean;
  /** The last selection inside the text (kept while the link box has focus). */
  sel: [number, number] | null;
  linkRange: readonly [number, number] | null;
  past: Snapshot[];
  future: Snapshot[];
  typedAt: number;
};
export function RichInlineText({
  as: Tag,
  value,
  className,
  editing,
  label,
  options,
  onCommit,
  onActivate,
  onStartEdit,
  onFinishEdit,
  onDraft,
  attrs,
  render,
  caret,
  lineKeys,
}: {
  as: "span" | "div" | "h1" | "h2" | "h3" | "h4" | "p";
  value: string;
  className?: string;
  editing: boolean;
  label: string;
  options: RichOptions;
  onCommit: (text: string) => void;
  onActivate?: () => void;
  onStartEdit?: () => void;
  /** Typing ended: saved (after onCommit) or cancelled, with the typed text. */
  onFinishEdit?: (end: { cancelled: boolean; text: string }) => void;
  onDraft?: (text: string) => void;
  attrs?: Record<string, unknown>;
  /** How the text looks while not being typed into. */
  render: (value: string) => ReactNode;
  /** Where the caret starts when typing begins (default: the end). */
  caret?: number;
  /**
   * One line of a list (a list point): Enter, Backspace at the start and ↑/↓
   * on the first or last line go to this instead of the text (it never holds
   * a line break). True when it took the key: typing here then stops without
   * saving or finishing, as the list carries on in another line.
   */
  lineKeys?: (
    key: "enter" | "backspace" | "up" | "down",
    at: { runs: Run[]; selection: [number, number] },
  ) => boolean;
}) {
  const element = useRef<HTMLElement | null>(null);
  const latest = useRef({
    value,
    options,
    onCommit,
    onFinishEdit,
    onDraft,
    caret,
  });
  useLayoutEffect(() => {
    latest.current = { value, options, onCommit, onFinishEdit, onDraft, caret };
  });
  const pointer = useRef<[number, number] | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const historyRef = useRef<(back: boolean) => void>(() => {});
  const typedRef = useRef<() => void>(() => {});
  /** The typing session (one per editing). */
  const session = useRef<Session | null>(null);

  useLayoutEffect(() => {
    const el = element.current;
    if (!editing || !el) return;
    const o = () => latest.current.options;
    const s: Session = {
      original: latest.current.value,
      cancelled: false,
      finished: false,
      sel: null,
      linkRange: null,
      past: [],
      future: [],
      typedAt: 0,
    };
    session.current = s;
    const start = parseInline(s.original, o());
    fillRich(el, start);
    el.focus({ preventScroll: true });
    const length = plainText(start).length;
    const at = latest.current.caret ?? length;
    const [a, b] = pointer.current ?? [at, at];
    pointer.current = null;
    selectOffsets(el, Math.min(a, length), Math.min(b, length));

    const runs = () => readRich(el, o());
    const current = () =>
      (document.activeElement === el ? selectionOffsets(el, o()) : null) ??
      s.sel;
    const changed = () => richBus.dispatchEvent(new Event("change"));
    const draft = () => latest.current.onDraft?.(serializeInline(runs(), o()));
    const remember = () =>
      s.past.push({ runs: runs(), sel: current() ?? [0, 0] }) > 100 &&
      s.past.shift();
    const show = (next: Run[], from: number, to: number) => {
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      fillRich(el, next);
      selectOffsets(el, from, to);
      s.sel = [from, to];
      draft();
      changed();
    };
    const controller: RichController = {
      element: el,
      options: o(),
      hasSelection: () => {
        const sel = current();
        return !!sel && sel[0] !== sel[1];
      },
      state: () => {
        const sel = current();
        const list = runs();
        if (!sel) return { b: false, i: false, accent: false, link: null };
        const text = plainText(list);
        const [from, to] = wordRange(text, sel[0], sel[1]);
        return {
          b: rangeHas(list, from, to, "b"),
          i: rangeHas(list, from, to, "i"),
          accent: rangeHas(list, from, to, "accent"),
          link: linkAt(list, sel[0], sel[1])?.link ?? null,
        };
      },
      toggle: (key) => {
        const sel = current();
        if (!sel || sel[0] === sel[1]) return;
        remember();
        s.future = [];
        const next = toggleMark(runs(), sel[0], sel[1], key, o());
        show(next.runs, next.range[0], next.range[1]);
      },
      prepareLink: () => {
        const sel = current();
        if (!sel) return false;
        const list = runs();
        const at = sel[0] === sel[1] ? linkAt(list, sel[0], sel[1]) : null;
        const range = at?.range ?? wordRange(plainText(list), sel[0], sel[1]);
        if (range[0] === range[1]) return false;
        s.linkRange = range;
        s.sel = sel;
        return true;
      },
      applyLink: (link) => {
        const range = s.linkRange;
        if (!range) return "Select the words to link first.";
        const next = setLink(runs(), range[0], range[1], link, o());
        if (
          link &&
          inlineLinks(serializeInline(next.runs, o()), o()).length >
            MAX_INLINE_LINKS
        )
          return `A block can hold up to ${MAX_INLINE_LINKS} links.`;
        remember();
        s.future = [];
        show(next.runs, next.range[1], next.range[1]);
        s.linkRange = null;
      },
      focus: () => {
        el.focus({ preventScroll: true });
        if (s.sel) selectOffsets(el, s.sel[0], s.sel[1]);
      },
      finish: () => finish(),
    };
    const finish = () => {
      if (s.finished) return;
      s.finished = true;
      let text = s.original;
      if (!s.cancelled) {
        const typed = runs();
        if (
          !sameMeaning(
            normalizeRuns(typed, o()),
            normalizeRuns(parseInline(s.original, o()), o()),
          )
        ) {
          text = serializeInline(typed, o());
          latest.current.onCommit(text);
        }
      }
      latest.current.onFinishEdit?.({ cancelled: s.cancelled, text });
    };
    finishRef.current = finish;
    historyRef.current = (back) => {
      const from = back ? s.past : s.future;
      const to = back ? s.future : s.past;
      const step = from.pop();
      if (!step) return;
      to.push({ runs: runs(), sel: current() ?? [0, 0] });
      show(step.runs, step.sel[0], step.sel[1]);
    };
    typedRef.current = () => {
      if (Date.now() - s.typedAt > 1000) {
        remember();
        s.future = [];
      }
      s.typedAt = Date.now();
    };
    const track = () => {
      const sel = selectionOffsets(el, o());
      if (sel) s.sel = sel;
      changed();
    };
    richEditing.current = controller;
    document.addEventListener("selectionchange", track);
    changed();
    return () => {
      document.removeEventListener("selectionchange", track);
      if (richEditing.current === controller) richEditing.current = null;
      changed();
    };
  }, [editing]);

  const key = (e: KeyboardEvent<HTMLElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (!editing) {
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        onStartEdit?.();
      }
      return;
    }
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const el = element.current;
    if (lineKeys && el && !mod && !e.altKey) {
      const sel = selectionOffsets(el, options);
      const runs = readRich(el, options);
      const up = e.key === "ArrowUp";
      const name =
        e.key === "Enter"
          ? "enter"
          : e.key === "Backspace" && sel?.[0] === 0 && sel[1] === 0
            ? "backspace"
            : (up || e.key === "ArrowDown") &&
                !e.shiftKey &&
                sel &&
                sel[0] === sel[1] &&
                caretOnEdgeLine(el, up)
              ? up
                ? "up"
                : "down"
              : null;
      const length = plainText(runs).length;
      if (
        name &&
        lineKeys(name, { runs, selection: sel ?? [length, length] })
      ) {
        stop();
        // The list carries on in another line; this one is done.
        if (session.current) session.current.finished = true;
        return;
      }
      // A list point never holds a line break.
      if (e.key === "Enter") return stop();
    }
    if (e.key === "Escape") {
      stop();
      if (session.current) session.current.cancelled = true;
      e.currentTarget.blur();
    } else if (mod && e.key === "Enter") {
      stop();
      e.currentTarget.blur();
    } else if (mod && !e.altKey && (k === "b" || k === "i" || k === "k")) {
      stop();
      richShortcut(k === "k" ? "link" : k);
    } else if (mod && k === "u") {
      stop();
    } else if (mod && (k === "z" || k === "y")) {
      stop();
      historyRef.current(k === "z" && !e.shiftKey);
    } else if (e.key === "Enter") {
      stop();
      typedRef.current();
      document.execCommand("insertLineBreak");
    }
  };

  return (
    <Tag
      key={editing ? "typing" : "shown"}
      {...attrs}
      ref={(node: HTMLElement | null) => {
        element.current = node;
      }}
      className={`${className || ""} inline-copy ${editing ? "is-editing" : ""}`}
      contentEditable={editing}
      suppressContentEditableWarning
      role={editing ? "textbox" : "button"}
      tabIndex={0}
      aria-label={label}
      aria-description={
        editing
          ? "Escape cancels. Command or Control Enter saves. Command B, I and K: bold, italic and link for the selected words."
          : "Click for settings. Double-click or press Enter to edit text."
      }
      aria-multiline={editing || undefined}
      data-edit-field={label}
      spellCheck={editing}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) {
          e.preventDefault();
          onActivate?.();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editing) return;
        e.preventDefault();
        // Typing starts with the double-clicked word selected.
        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (range && e.currentTarget.contains(range.startContainer)) {
          const [at] = rangeOffsets(e.currentTarget, range, options);
          const text = plainText(parseInline(value, options));
          pointer.current = [...wordRange(text, at, at)];
        }
        onStartEdit?.();
      }}
      onBeforeInput={() => editing && typedRef.current()}
      onInput={() => {
        const el = element.current;
        if (editing && el)
          onDraft?.(serializeInline(readRich(el, options), options));
      }}
      onKeyDown={key}
      onBlur={(e) => {
        if (!editing) return;
        // The link box keeps the typing going.
        const to = e.relatedTarget as HTMLElement | null;
        if (to?.closest("[data-text-tools]")) return;
        finishRef.current();
      }}
      onPaste={(e) => {
        if (!editing) return;
        // Pasted text arrives plain: it takes the formatting where it lands.
        e.preventDefault();
        const text = e.clipboardData
          .getData("text/plain")
          .replace(/\r\n?/g, "\n");
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        typedRef.current();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        const el = element.current;
        if (el) onDraft?.(serializeInline(readRich(el, options), options));
      }}
      onDrop={(e) => editing && e.preventDefault()}
    >
      {editing ? null : render(value)}
    </Tag>
  );
}
