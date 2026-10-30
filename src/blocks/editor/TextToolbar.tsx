/**
 * The small toolbar over text being typed on the canvas. In headings and
 * text, Bold, Italic, Link (and a heading's accent colour) apply to the
 * selected words (src/blocks/richtext.tsx); with nothing selected, bold and
 * italic apply to the whole block, as do size and alignment, for the screen
 * size being edited. ⌘B, ⌘I and ⌘K while typing press the same buttons.
 * Buttons keep the typing focus (mousedown is cancelled). Words a
 * classic-look form draws in its own type (src/blocks/forms/classic.tsx)
 * only get Done.
 */
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import type { Device } from "../../studio/model";
import { safeLink } from "../logic/model";
import { FONT_SIZES, mergeStyle, type Node, type Style } from "../model";
import { RICH_PROPS, type InlineLink } from "../richtext";
import { linkFromInput, richBus, richEditing } from "./richDom";

const STEPS = FONT_SIZES as readonly string[];
const PX: Record<string, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 36,
  "4xl": 48,
};

export function TextToolbar({
  section,
  node,
  device,
  style: position,
  onDone,
  wordsOnly = false,
}: {
  section: string;
  node: Node;
  device: Device;
  style: CSSProperties;
  onDone: () => void;
  /** Only the words are typed (no formatting, size or alignment). */
  wordsOnly?: boolean;
}) {
  const updateNode = useStudio((s) => s.updateNode);
  const pages = useStudio((s) => s.project.pages);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [linkBox, setLinkBox] = useState<InlineLink | null>(null);
  const [boxAt, setBoxAt] = useState<CSSProperties>({});
  const slot = device === "desktop" ? "style" : device;
  const get = <K extends keyof Style>(k: K): Style[K] =>
    device === "desktop"
      ? node.style?.[k]
      : device === "tablet"
        ? (node.tablet?.[k] ?? node.style?.[k])
        : (node.mobile?.[k] ?? node.tablet?.[k] ?? node.style?.[k]);
  const write = (patch: Partial<Style>) =>
    updateNode(section, node.id, (n) => ({
      ...n,
      [slot]: mergeStyle(n[slot], patch),
    }));
  const heading = node.type === "heading";
  const rich = !wordsOnly && !!RICH_PROPS[node.type];
  const typing = rich ? richEditing.current : null;
  const words = !!typing?.hasSelection();
  const marks = typing?.state();
  const weight = get("fontWeight") ?? (heading ? 700 : 400);
  const size = get("fontSize") ?? (heading ? "2xl" : "md");
  const step = (by: -1 | 1) => {
    const px = STEPS.includes(size) ? PX[size] : Number(size) || 16;
    const at = STEPS.findIndex((s) => PX[s] >= px);
    const i = Math.max(0, Math.min(STEPS.length - 1, (at < 0 ? 7 : at) + by));
    write({ fontSize: STEPS[i] });
  };
  const bold = () => {
    const t = richEditing.current;
    if (rich && t?.hasSelection()) t.toggle("b");
    else write({ fontWeight: weight >= 600 ? 400 : 700 });
  };
  const italic = () => {
    const t = richEditing.current;
    if (rich && t?.hasSelection()) t.toggle("i");
    else write({ italic: !get("italic") || undefined });
  };
  const openLink = () => {
    const t = richEditing.current;
    if (!rich || !t?.prepareLink()) return;
    // The box opens where it doesn't cover the words being linked.
    const tools = document
      .querySelector("[data-text-tools]")
      ?.getBoundingClientRect();
    const words = t.element.getBoundingClientRect();
    setBoxAt(
      !tools || tools.top >= words.top
        ? {}
        : tools.top > 260
          ? { top: "auto", bottom: "calc(100% + 6px)" }
          : { top: words.bottom - tools.top + 8 },
    );
    setLinkBox(t.state().link ?? { href: "" });
  };
  const latest = useRef({ bold, italic, openLink });
  useEffect(() => {
    latest.current = { bold, italic, openLink };
  });
  useEffect(() => {
    const shortcut = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name === "b") latest.current.bold();
      else if (name === "i") latest.current.italic();
      else latest.current.openLink();
    };
    richBus.addEventListener("change", refresh);
    richBus.addEventListener("shortcut", shortcut);
    return () => {
      richBus.removeEventListener("change", refresh);
      richBus.removeEventListener("shortcut", shortcut);
    };
  }, []);
  const align = get("textAlign");
  const tool = (
    label: string,
    icon: string,
    run: () => void,
    pressed?: boolean,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      className="blocks-tool"
      aria-label={label}
      data-tip={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon name={icon} size={15} />
    </button>
  );
  const canLink = words || !!marks?.link;

  return (
    <div
      className="blocks-toolbar text-toolbar"
      role="toolbar"
      aria-label="Text tools"
      data-text-tools=""
      style={position}
    >
      {wordsOnly ? null : (
        <>
          {heading &&
            tool(
              "Accent colour for the selected words",
              "sparkles",
              () => richEditing.current?.toggle("accent"),
              words && marks?.accent,
              !words,
            )}
          {tool(
            words ? "Bold the selected words (⌘B)" : "Bold (⌘B)",
            "bold",
            bold,
            words ? marks?.b : weight >= 600,
          )}
          {tool(
            words ? "Italic for the selected words (⌘I)" : "Italic (⌘I)",
            "italic",
            italic,
            words ? marks?.i : !!get("italic"),
          )}
          {rich &&
            tool(
              canLink ? "Link (⌘K)" : "Select words to link",
              "link",
              openLink,
              !!marks?.link || !!linkBox,
              !canLink,
            )}
          <span className="blocks-tool-gap" />
          {tool("Smaller text", "textSmaller", () => step(-1))}
          {tool("Bigger text", "textBigger", () => step(1))}
          <span className="blocks-tool-gap" />
          {tool(
            "Align left",
            "alignLeft",
            () => write({ textAlign: "left" }),
            align === "left",
          )}
          {tool(
            "Align centre",
            "alignCenter",
            () => write({ textAlign: "center" }),
            align === "center",
          )}
          {tool(
            "Align right",
            "alignRight",
            () => write({ textAlign: "right" }),
            align === "right",
          )}
          <span className="blocks-tool-gap" />
        </>
      )}
      <button
        type="button"
        className="blocks-tool-text"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (linkBox) {
            setLinkBox(null);
            richEditing.current?.focus();
          }
          onDone();
        }}
      >
        <Icon name="check" size={14} />
        Done
      </button>
      {linkBox && (
        <LinkBox
          initial={linkBox}
          style={boxAt}
          pages={pages.map((p) => ({ name: p.name, href: `/${p.slug}` }))}
          onClose={(link) => {
            const t = richEditing.current;
            const error = link === undefined ? undefined : t?.applyLink(link);
            if (error) return error;
            setLinkBox(null);
            if (link === undefined) t?.focus();
          }}
          onLeave={() => {
            setLinkBox(null);
            richEditing.current?.finish();
          }}
        />
      )}
    </div>
  );
}

/**
 * The link box: an address (or a page of the site), "Open in new tab" and
 * Remove link. Apply checks the address like every other link (safeLink).
 */
function LinkBox({
  initial,
  style,
  pages,
  onClose,
  onLeave,
}: {
  initial: InlineLink;
  style: CSSProperties;
  pages: { name: string; href: string }[];
  /** A link to apply, null to remove it, undefined to just close; returns an error. */
  onClose: (link: InlineLink | null | undefined) => string | undefined;
  /** Focus went somewhere else (not the text, not the tools). */
  onLeave: () => void;
}) {
  const [url, setUrl] = useState(initial.href);
  const [newTab, setNewTab] = useState(!!initial.newTab);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const apply = () => {
    const href = linkFromInput(url);
    if (!safeLink(href)) {
      setError(
        "Use a web address (https://…), a page (/menu), a section (#offers), a phone number or an email.",
      );
      return;
    }
    const problem = onClose({ href, ...(newTab ? { newTab: true } : {}) });
    if (problem) setError(problem);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose(undefined);
    } else if (
      e.key === "Enter" &&
      (e.target as HTMLElement).tagName === "INPUT"
    ) {
      e.preventDefault();
      apply();
    }
  };
  const page = pages.find((p) => p.href === url)?.href ?? "";
  return (
    <div
      className="text-link-box"
      style={style}
      role="dialog"
      aria-label="Link"
      onKeyDown={key}
      onBlur={(e) => {
        const to = e.relatedTarget as HTMLElement | null;
        if (to?.closest("[data-text-tools], .inline-copy.is-editing")) return;
        onLeave();
      }}
    >
      <label className="text-link-field">
        <span>Link to</span>
        <input
          ref={input}
          type="text"
          inputMode="url"
          value={url}
          placeholder="https://… or /page"
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "text-link-error" : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
        />
      </label>
      {pages.length > 0 && (
        <label className="text-link-field">
          <span>Or a page</span>
          <select
            value={page}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
          >
            <option value="">Choose a page…</option>
            {pages.map((p) => (
              <option key={p.href} value={p.href}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-link-check">
        <input
          type="checkbox"
          checked={newTab}
          onChange={(e) => setNewTab(e.target.checked)}
        />
        Open in new tab
      </label>
      {error && (
        <p className="text-link-error" id="text-link-error" role="alert">
          {error}
        </p>
      )}
      <div className="text-link-actions">
        {initial.href && (
          <button
            type="button"
            className="text-link-remove"
            onClick={() => onClose(null)}
          >
            <Icon name="trash" size={13} />
            Remove link
          </button>
        )}
        <button type="button" className="blocks-tool-text" onClick={apply}>
          {initial.href ? "Update" : "Add link"}
        </button>
      </div>
    </div>
  );
}
