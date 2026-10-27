/**
 * Inputs for the blocks Inspector: the Content tab's registry fields (text,
 * links, images, icons, toggles, numbers, choices, lines) and the small
 * controls the Style tab is made of. Labels are plain words for shop owners.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Icon, ICON_NAMES } from "../../studio/Icon";
import { Field, Range } from "../../studio/ui";
import { useStudio } from "../../studio/store";
import { OWNER_LINK, safeImage } from "../../studio/model";
import type { PropValue } from "../model";
import type { FieldSpec } from "../registry";
import { FormChoice, FormFieldChoice } from "../forms/FormSettings";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");

/** A page, the owner's sign-in, a web address, or nothing. */
export function LinkField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const pages = useStudio((s) => s.project.pages);
  const id = useId();
  const choice =
    value === "" ||
    value === OWNER_LINK ||
    pages.some((p) => `/${p.slug}` === value)
      ? value
      : "custom";
  return (
    <>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={choice}
          onChange={(e) =>
            onChange(e.target.value === "custom" ? "https://" : e.target.value)
          }
        >
          <option value="">Nowhere (no link)</option>
          {pages.map((p) => (
            <option value={`/${p.slug}`} key={p.id}>
              Page: {p.name}
            </option>
          ))}
          <option value={OWNER_LINK}>Owner sign-in (your app)</option>
          <option value="custom">A web address, phone or email…</option>
        </select>
      </div>
      {choice === "custom" && (
        <Field
          label="Web address"
          value={value}
          onChange={onChange}
          placeholder="https://, tel:+91… or mailto:…"
        />
      )}
    </>
  );
}

/** The chosen image, or a button to choose one from the media library. */
export function ImageField({
  label,
  value,
  onPick,
  onClear,
  compact = false,
}: {
  label: string;
  value: string;
  onPick: () => void;
  onClear: () => void;
  /** One control-high row (the Style tab), labelled by its row. */
  compact?: boolean;
}) {
  if (compact)
    return (
      <span className="sp-image">
        <button
          type="button"
          className="sp-color-trigger"
          aria-label={
            value
              ? `Change ${label.toLowerCase()}`
              : `Choose ${label.toLowerCase()}`
          }
          onClick={onPick}
        >
          {value ? (
            <img className="sp-chip" src={safeImage(value)} alt="" />
          ) : (
            <span className="sp-chip is-image" aria-hidden="true">
              <Icon name="image" size={12} />
            </span>
          )}
          <span className="sp-color-name">
            {value ? "Change image" : "Choose image"}
          </span>
        </button>
        {value && (
          <button
            type="button"
            className="sp-reset"
            aria-label={`Remove ${label.toLowerCase()}`}
            title="Remove"
            onClick={onClear}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </span>
    );
  return (
    <div className="field node-image-field">
      <span className="field-label-row">
        <span>{label}</span>
        {value && (
          <button type="button" className="field-canvas-edit" onClick={onClear}>
            <Icon name="x" size={12} />
            Remove
          </button>
        )}
      </span>
      <button type="button" className="media-picker" onClick={onPick}>
        {value ? (
          <img src={safeImage(value)} alt="" />
        ) : (
          <span className="media-placeholder">
            <Icon name="image" size={25} />
          </span>
        )}
        <span>
          <Icon name="image" size={14} />
          {value
            ? `Change ${label.toLowerCase()}`
            : `Choose ${label.toLowerCase()}`}
          <Icon name="chevron" size={13} />
        </span>
      </button>
    </div>
  );
}

/** A grid of every icon; optional ones can be cleared. */
export function IconField({
  label,
  value,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  optional: boolean;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <span className="field-label-row">
        <span id={id}>{label}</span>
      </span>
      <button
        type="button"
        className="node-icon-current"
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen(!open)}
      >
        <span className="node-icon-swatch">
          {value ? (
            <Icon name={value} size={16} />
          ) : (
            <Icon name="x" size={12} />
          )}
        </span>
        <span>
          {value ? `${value[0].toUpperCase()}${value.slice(1)}` : "No icon"}
        </span>
        <Icon name={open ? "up" : "down"} size={12} />
      </button>
      {open && (
        <div className="node-icon-grid" role="group" aria-labelledby={id}>
          {optional && (
            <button
              type="button"
              aria-label="No icon"
              aria-pressed={!value}
              title="No icon"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
          {ICON_NAMES.map((name) => (
            <button
              type="button"
              key={name}
              aria-label={name}
              aria-pressed={value === name}
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              <Icon name={name} size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  hint?: string;
}) {
  return (
    <>
      <label className="switch-row">
        {label}
        <button
          type="button"
          className={`switch ${checked ? "on" : ""}`}
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
        >
          <span />
        </button>
      </label>
      {hint && <small className="block-hint">{hint}</small>}
    </>
  );
}

/** One of the business app's forms, or one of the site's collections. */
function ChoiceField({
  id,
  label,
  value,
  kind,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  kind: "appForm" | "collection";
  onChange: (value: string) => void;
}) {
  const project = useStudio((s) => s.project);
  const options =
    kind === "appForm"
      ? (project.app?.forms ?? []).map((f) => ({ value: f.id, label: f.name }))
      : (project.collections ?? []).map((c) => ({
          value: c.id,
          label: `${c.name} (${c.items.length})`,
        }));
  const known = options.some((o) => o.value === value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={known ? value : ""}
        disabled={!options.length}
        onChange={(e) => onChange(e.target.value)}
      >
        {!known && (
          <option value="">
            {options.length
              ? `Choose a ${kind === "appForm" ? "form" : "collection"}`
              : kind === "appForm"
                ? "Your app has no forms yet"
                : "No collections yet (add one in Data)"}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One registry field (see FieldSpec) as an input. */
export function ContentField({
  spec,
  value,
  onChange,
  onPickImage,
  optionalIcon,
  draft,
  onEditCanvas,
}: {
  spec: FieldSpec;
  value: PropValue | undefined;
  onChange: (value: PropValue) => void;
  onPickImage: () => void;
  optionalIcon: boolean;
  /** The text being typed on the canvas, shown read-only. */
  draft?: string;
  onEditCanvas?: () => void;
}) {
  const id = useId();
  switch (spec.kind) {
    case "text":
    case "longText":
      return (
        <Field
          label={spec.label}
          value={draft ?? str(value)}
          multiline={spec.kind === "longText"}
          placeholder={spec.placeholder}
          hint={spec.kind === "longText" ? spec.hint : undefined}
          editingOnCanvas={draft !== undefined}
          onEditCanvas={onEditCanvas}
          maxLength={5000}
          onChange={onChange}
        />
      );
    case "link":
      return (
        <LinkField label={spec.label} value={str(value)} onChange={onChange} />
      );
    case "image":
      return (
        <ImageField
          label={spec.label}
          value={str(value)}
          onPick={onPickImage}
          onClear={() => onChange("")}
        />
      );
    case "icon":
      return (
        <IconField
          label={spec.label}
          value={str(value)}
          optional={optionalIcon}
          onChange={onChange}
        />
      );
    case "toggle":
      return (
        <Switch
          label={spec.label}
          checked={value === true}
          hint={spec.hint}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <Range
          label={spec.label}
          value={typeof value === "number" ? value : spec.min}
          min={spec.min}
          max={spec.max}
          unit={spec.unit ?? ""}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <div className="field">
          <label htmlFor={id}>{spec.label}</label>
          <select
            id={id}
            value={str(value) || spec.options[0]?.value}
            onChange={(e) => onChange(e.target.value)}
          >
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    // Form blocks (src/blocks/forms/FormSettings.tsx).
    case "form":
      return <FormChoice label={spec.label} />;
    case "formField":
      return (
        <FormFieldChoice
          label={spec.label}
          value={str(value)}
          onChange={onChange}
        />
      );
    case "appForm":
    case "collection":
      return (
        <ChoiceField
          id={id}
          label={spec.label}
          value={str(value)}
          kind={spec.kind}
          onChange={onChange}
        />
      );
    case "lines":
      return (
        <Field
          label={spec.label}
          multiline
          hint={spec.hint}
          value={
            draft ?? (Array.isArray(value) ? value.join("\n") : str(value))
          }
          editingOnCanvas={draft !== undefined}
          onEditCanvas={onEditCanvas}
          onChange={(text) => onChange(text.split("\n").slice(0, 100))}
        />
      );
  }
}

/* Style tab controls */

/** Buttons for a few choices (alignment, shadow…). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  withText = false,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string; icon?: string }[];
  onChange: (value: T) => void;
  /** Show the label beside the icon. */
  withText?: boolean;
}) {
  return (
    <div className="segmented sp-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={value === o.value ? "chosen" : ""}
          aria-pressed={value === o.value}
          aria-label={o.icon && !withText ? o.label : undefined}
          title={o.icon && !withText ? o.label : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={withText ? 13 : 15} />}
          {(!o.icon || withText) && o.label}
        </button>
      ))}
    </div>
  );
}

/** Reads "24", "24px" or "1.5×" as a number; NaN otherwise. */
const parseNumber = (text: string) =>
  Number(text.trim().replace(/\s*(px|%|×|x|em)$/i, ""));
const round = (n: number, step: number) =>
  Number((Math.round(n / step) * step).toFixed(step < 1 ? 2 : 0));

/**
 * A number that may be left empty (unset), with its unit. Arrow keys step
 * it (Shift: ten steps); dragging the unit or the short label sideways
 * scrubs it. "24px" is understood. Out-of-range values aren't saved; the
 * field shows the saved value again when it loses focus.
 */
export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  placeholder = "Auto",
  prefix,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** A short label inside the field ("W", "Max"), which can be dragged to scrub. */
  prefix?: string;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, round(n, step)));
  const scrub = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value ?? 0;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const by = Math.round((ev.clientX - startX) / 2) * step;
      onChange(clamp(start + by * (ev.shiftKey ? 10 : 1)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    <span className={`sp-number ${prefix ? "has-prefix" : ""}`}>
      {prefix && (
        <b className="sp-scrub" aria-hidden="true" onPointerDown={scrub}>
          {prefix}
        </b>
      )}
      <input
        type="text"
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={draft ?? value ?? ""}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          if (text.trim() === "") return onChange(undefined);
          const n = parseNumber(text);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const by =
            (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
          const n = clamp(
            (value ??
              (Number.isFinite(parseNumber(placeholder))
                ? parseNumber(placeholder)
                : 0)) + by,
          );
          setDraft(null);
          onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      {unit && (
        <em
          className={prefix ? undefined : "sp-scrub"}
          aria-hidden="true"
          onPointerDown={prefix ? undefined : scrub}
        >
          {unit}
        </em>
      )}
    </span>
  );
}

/** A slider with its number beside it (opacity, darkening, space between). */
export function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  placeholder,
  fallback,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** Where the slider sits while the value is unset. */
  fallback: number;
  onChange: (value: number | undefined) => void;
}) {
  const shown = value ?? fallback;
  return (
    <span className="sp-slider">
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={shown}
        style={
          {
            "--fill": `${((shown - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <NumberInput
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        unit={unit}
        placeholder={placeholder ?? String(fallback)}
        onChange={onChange}
      />
    </span>
  );
}

/* Colours */

/** "#abc" / "#aabbcc" as [r, g, b], or undefined. */
function rgb(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return;
  const h =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
const toHex = (c: [number, number, number]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** `a` mixed into `b` (share of a, 0–1), like CSS color-mix. */
const mix = (a: string, b: string, share: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return x && y
    ? toHex(
        x.map((v, i) => v * share + y[i] * (1 - share)) as [
          number,
          number,
          number,
        ],
      )
    : a;
};
const luminance = (hex: string) => {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two hex colours. */
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Theme colours as swatches, plus any colour of your own. */
const COLOR_CHOICES: { token: string; label: string }[] = [
  { token: "accent", label: "Accent" },
  { token: "accentText", label: "On accent" },
  { token: "text", label: "Text" },
  { token: "muted", label: "Soft text" },
  { token: "background", label: "Background" },
  { token: "surface", label: "Soft background" },
  { token: "line", label: "Line" },
];
/** The theme's colours as hex, for swatches and the contrast hint. */
function useThemeColors() {
  const theme = useStudio((s) => s.project.theme);
  const accentText =
    contrast("#ffffff", theme.accent) >= contrast("#111111", theme.accent)
      ? "#ffffff"
      : "#111111";
  return {
    accent: theme.accent,
    accentText,
    text: theme.color,
    muted: mix(theme.color, theme.background, 0.64),
    background: theme.background,
    surface: mix(theme.color, theme.background, 0.04),
    line: mix(theme.color, theme.background, 0.13),
  } as Record<string, string>;
}

/**
 * A colour: the trigger shows the swatch and its name; the picker holds the
 * theme's colours, your own colour (with a hex field) and how readable it is
 * against what it sits on (`against`: "background" for text, "text" for
 * backgrounds).
 */
export function ColorInput({
  label,
  value,
  onChange,
  against,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  against?: "background" | "text";
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector(".sp-color-pop")
      ?.scrollIntoView?.({ block: "nearest" });
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const custom = value && value.startsWith("#") ? value : "";
  const resolved = value ? (colors[value] ?? custom) : "";
  const name = value
    ? (COLOR_CHOICES.find((c) => c.token === value)?.label ??
      custom.toUpperCase())
    : "Default";
  const base = against ? colors[against] : undefined;
  const ratio = resolved && base ? contrast(resolved, base) : undefined;
  const readable =
    ratio === undefined
      ? null
      : ratio >= 4.5
        ? { tone: "good", text: "Easy to read" }
        : ratio >= 3
          ? { tone: "fair", text: "Big text only" }
          : { tone: "poor", text: "Hard to read" };
  return (
    <div
      className="sp-color"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="sp-color-trigger"
        aria-label={`${label}: ${name}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span
          className={`sp-chip ${resolved ? "" : "is-empty"}`}
          style={resolved ? { background: resolved } : undefined}
        />
        <span className="sp-color-name">{name}</span>
        {readable && (
          <i
            className={`sp-contrast-dot is-${readable.tone}`}
            title={readable.text}
          />
        )}
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div className="sp-color-pop" id={id} role="group" aria-label={label}>
          <div className="sp-color-head">
            <span>Theme colours</span>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                Use default
              </button>
            )}
          </div>
          <div className="sp-swatches">
            {COLOR_CHOICES.map((c) => (
              <button
                type="button"
                key={c.token}
                className="sp-swatch"
                aria-label={`${c.label} colour`}
                aria-pressed={value === c.token}
                title={c.label}
                onClick={() => onChange(c.token)}
              >
                <span style={{ background: colors[c.token] }} />
              </button>
            ))}
          </div>
          <div className="sp-color-head">
            <span>Your own colour</span>
          </div>
          <div className="sp-color-custom">
            <label
              className={`sp-color-well ${custom ? "chosen" : ""}`}
              style={{ background: resolved || "transparent" }}
              title="Pick any colour"
            >
              <input
                type="color"
                aria-label={`${label}: pick your own colour`}
                value={rgb(resolved) ? toHex(rgb(resolved)!) : "#888888"}
                onChange={(e) => onChange(e.target.value)}
              />
            </label>
            <span className="sp-hex-wrap">
              <b aria-hidden="true">#</b>
              <input
                className="sp-hex"
                aria-label={`${label} hex code`}
                placeholder="1a2b3c"
                maxLength={7}
                spellCheck={false}
                value={hex ?? custom.replace(/^#/, "")}
                onChange={(e) => {
                  const text = e.target.value.trim().replace(/^#/, "");
                  setHex(text);
                  if (/^([0-9a-f]{6}|[0-9a-f]{3})$/i.test(text))
                    onChange(`#${text.toLowerCase()}`);
                }}
                onBlur={() => setHex(null)}
              />
            </span>
          </div>
          {readable && ratio !== undefined && (
            <p className={`sp-contrast is-${readable.tone}`}>
              <i aria-hidden="true" />
              {readable.text} on your{" "}
              {against === "background" ? "background" : "text colour"}
              <span>{ratio.toFixed(1)} : 1</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* Spacing */

type Sides = [number, number, number, number];
const SIDE_NAMES = ["top", "right", "bottom", "left"] as const;

/** One side's value in the spacing box. */
function SideInput({
  label,
  value,
  min,
  side,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min: number;
  side: (typeof SIDE_NAMES)[number];
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`sp-box-input is-${side}`}
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="0"
      value={draft ?? (value ? String(value) : "")}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (text.trim() === "") return onChange(undefined);
        const n = parseNumber(text);
        if (Number.isFinite(n) && n >= min && n <= 800) onChange(Math.round(n));
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const by = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
        setDraft(null);
        onChange(Math.max(min, Math.min(800, (value ?? 0) + by)));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/**
 * Space outside (margin) and inside (padding) the block as a box, like a
 * design tool: each side has its own number; with "same on all sides" on,
 * typing one side sets all four.
 */
export function SpacingBox({
  padding,
  margin,
  onPadding,
  onMargin,
  paddingSet,
  marginSet,
  paddingOverride,
  marginOverride,
}: {
  padding: Sides | undefined;
  margin: Sides | undefined;
  onPadding: (value: Sides | undefined) => void;
  onMargin: (value: Sides | undefined) => void;
  /** Set on the screen size being edited (shows its reset). */
  paddingSet?: boolean;
  marginSet?: boolean;
  /** Tablet or phone: differs from the bigger screen. */
  paddingOverride?: boolean;
  marginOverride?: boolean;
}) {
  const [linked, setLinked] = useState({
    padding:
      !!padding && padding.every((n) => n === padding[0]) && padding[0] > 0,
    margin: !!margin && margin.every((n) => n === margin[0]) && margin[0] > 0,
  });
  const ring = (
    kind: "padding" | "margin",
    value: Sides | undefined,
    onChange: (v: Sides | undefined) => void,
  ) => {
    const name = kind === "padding" ? "Padding" : "Margin";
    const set = (i: number, n: number | undefined) => {
      if (linked[kind])
        return onChange(n === undefined ? undefined : [n, n, n, n]);
      const next = [...(value ?? [0, 0, 0, 0])] as Sides;
      next[i] = n ?? 0;
      onChange(next.every((x) => x === 0) ? undefined : next);
    };
    return SIDE_NAMES.map((side, i) => (
      <SideInput
        key={`${kind}-${side}`}
        side={side}
        label={`${name} ${side}`}
        value={value?.[i]}
        min={kind === "margin" ? -400 : 0}
        onChange={(n) => set(i, n)}
      />
    ));
  };
  const head = (
    kind: "padding" | "margin",
    title: string,
    set?: boolean,
    override?: boolean,
    reset?: () => void,
  ) => (
    <>
      <span
        className={`sp-box-label is-${kind} ${override ? "is-override" : ""}`}
      >
        {title}
        {override && (
          <i className="sp-dot" title="Changed for this screen size" />
        )}
      </span>
      <span className={`sp-box-tools is-${kind}`}>
        {set && reset && (
          <button
            type="button"
            className="sp-box-link"
            aria-label={`Reset ${kind === "padding" ? "padding" : "margin"}`}
            title="Reset"
            onClick={reset}
          >
            <Icon name="undo" size={11} />
          </button>
        )}
        <button
          type="button"
          className={`sp-box-link ${linked[kind] ? "chosen" : ""}`}
          aria-pressed={linked[kind]}
          aria-label={`Same ${kind === "padding" ? "padding" : "margin"} on all sides`}
          title="Same on all sides"
          onClick={() => setLinked({ ...linked, [kind]: !linked[kind] })}
        >
          <Icon name="link" size={11} />
        </button>
      </span>
    </>
  );
  return (
    <div className="sp-box" role="group" aria-label="Spacing">
      <div className="sp-box-margin">
        {head("margin", "Outside", marginSet, marginOverride, () =>
          onMargin(undefined),
        )}
        {ring("margin", margin, onMargin)}
        <div className="sp-box-padding">
          {head("padding", "Inside", paddingSet, paddingOverride, () =>
            onPadding(undefined),
          )}
          {ring("padding", padding, onPadding)}
          <div className="sp-box-core" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** A labelled Style tab row with its own reset. */
export function StyleRow({
  label,
  set,
  overridden,
  resetLabel,
  onReset,
  stacked = false,
  children,
}: {
  label: string;
  /** Has a value on the device being edited. */
  set: boolean;
  /** Tablet or phone: differs from the bigger screen. */
  overridden: boolean;
  resetLabel: string;
  onReset: () => void;
  /** Label above the control (half-width cells and wide controls). */
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`sp-row ${stacked ? "is-stacked" : ""} ${overridden ? "is-override" : ""}`}
    >
      <div className="sp-label">
        <span>
          {label}
          {overridden && (
            <i className="sp-dot" title="Changed for this screen size" />
          )}
        </span>
        {set && (
          <button
            type="button"
            className="sp-reset"
            aria-label={`${resetLabel}: ${label}`}
            title={resetLabel}
            onClick={onReset}
          >
            <Icon name="undo" size={11} />
          </button>
        )}
      </div>
      <div className="sp-control">{children}</div>
    </div>
  );
}
