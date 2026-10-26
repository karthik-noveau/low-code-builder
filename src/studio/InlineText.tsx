import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type TextField = "title" | "body" | "eyebrow" | "buttonLabel";
export type TextEditTarget = {
  section: string;
  field: TextField;
  /** Typing into a block of a "blocks" section. */
  node?: string;
};

export function InlineText({
  as: Tag = "span",
  value,
  className,
  enabled = false,
  editing = false,
  label,
  onCommit,
  onActivate,
  onStartEdit,
  onFinishEdit,
  onDraft,
  attrs,
  render,
}: {
  as?: "span" | "div" | "h1" | "h2" | "h3" | "h4" | "p";
  value: string;
  className?: string;
  enabled?: boolean;
  editing?: boolean;
  label: string;
  onCommit: (text: string) => void;
  onActivate?: () => void;
  onStartEdit?: () => void;
  onFinishEdit?: () => void;
  onDraft?: (text: string) => void;
  /** Extra attributes for the element (a block's data-node-id). */
  attrs?: Record<string, unknown>;
  /** How the value looks while not being typed into (e.g. *accent* words). */
  render?: (value: string) => ReactNode;
}) {
  const element = useRef<HTMLElement | null>(null);
  const original = useRef(value);
  const cancelled = useRef(false);
  const pointerRange = useRef<Range | null>(null);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  useLayoutEffect(() => {
    if (!editing || !element.current) return;
    original.current = valueRef.current;
    cancelled.current = false;
    const el = element.current;
    el.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = pointerRange.current ?? document.createRange();
    if (!pointerRange.current) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
    pointerRange.current = null;
  }, [editing]);
  if (!enabled) return <Tag className={className}>{value}</Tag>;
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (!editing && (e.key === "Enter" || e.key === "F2")) {
      e.preventDefault();
      e.stopPropagation();
      onStartEdit?.();
    } else if (editing && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelled.current = true;
      e.currentTarget.textContent = original.current;
      e.currentTarget.blur();
    } else if (editing && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  return (
    <Tag
      {...attrs}
      ref={(node) => {
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
          ? "Escape cancels. Command or Control Enter saves."
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
        if (!editing) {
          e.preventDefault();
          const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
          if (range && e.currentTarget.contains(range.startContainer)) {
            const node = range.startContainer;
            const text = node.textContent ?? "";
            if (node.nodeType === Node.TEXT_NODE) {
              let start = range.startOffset;
              let end = start;
              while (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1]))
                start--;
              while (end < text.length && /[\p{L}\p{N}_]/u.test(text[end]))
                end++;
              range.setStart(node, start);
              range.setEnd(node, end);
            }
            pointerRange.current = range;
          }
          onStartEdit?.();
        }
      }}
      onInput={(e) => {
        if (editing)
          onDraft?.(
            e.currentTarget.innerText ?? e.currentTarget.textContent ?? "",
          );
      }}
      onKeyDown={key}
      onBlur={(e) => {
        if (!editing) return;
        if (!cancelled.current) {
          const text =
            e.currentTarget.innerText ?? e.currentTarget.textContent ?? "";
          if (text !== original.current) onCommit(text);
        }
        onFinishEdit?.();
      }}
      onPaste={(e) => {
        if (!editing) return;
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        onDraft?.(
          e.currentTarget.innerText ?? e.currentTarget.textContent ?? "",
        );
      }}
    >
      {render && !editing ? render(value) : value}
    </Tag>
  );
}
