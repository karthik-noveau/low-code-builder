/**
 * A block's look, per screen size: `part="layout"` is how a layout block
 * arranges what's inside it (the Layout tab), `part="style"` everything else
 * (the Style tab). Desktop writes `node.style`; tablet and phone write
 * `node.tablet` / `node.mobile`, which only hold what differs (phone falls
 * back to tablet, then desktop). Each row resets on its own, and cleared
 * values fall back again (mergeStyle drops them). Group open/closed state is
 * remembered in this browser.
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import type { Device, Section } from "../../studio/model";
import { FONT_SIZES, mergeStyle, type Node, type Style } from "../model";
import { BLOCKS } from "../registry";
import type { MediaTarget } from "../../studio/Inspector";
import {
  ColorInput,
  ImageField,
  NumberInput,
  Segmented,
  SliderInput,
  SpacingBox,
  StyleRow,
  Switch,
} from "./fields";

type Slot = "style" | "tablet" | "mobile";
const deviceNames = { desktop: "Desktop", tablet: "Tablet", mobile: "Phone" };
const SIZE_NAMES: Record<string, string> = {
  xs: "Tiny",
  sm: "Small",
  md: "Normal",
  lg: "Large",
  xl: "Extra large",
  "2xl": "Big",
  "3xl": "Huge",
  "4xl": "Giant",
};
/** Blocks that show text (or hold blocks that do). */
const NO_TEXT = new Set(["image", "spacer", "divider", "video", "map"]);

/** Which style groups are open, remembered per browser. */
const GROUPS_KEY = "forma-style-groups";
function readGroups(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}
export function Group({
  id,
  title,
  open: defaultOpen = true,
  badge,
  children,
}: {
  /** Remembers the open state under this name. */
  id: string;
  title: string;
  open?: boolean;
  /** How many of its settings differ on this screen size. */
  badge?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readGroups()[id] ?? defaultOpen);
  return (
    <details
      className="sp-group"
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now === open) return;
        setOpen(now);
        try {
          localStorage.setItem(
            GROUPS_KEY,
            JSON.stringify({ ...readGroups(), [id]: now }),
          );
        } catch {
          /* storage blocked: remembered for this visit only */
        }
      }}
    >
      <summary>
        <Icon name="down" size={12} />
        <span>{title}</span>
        {!!badge && (
          <em
            className="sp-group-badge"
            title={`${badge} changed for this screen size`}
          >
            {badge}
          </em>
        )}
      </summary>
      <div className="sp-group-body">{children}</div>
    </details>
  );
}

/** Desktop / tablet / phone, with a dot where this block differs. */
export function DeviceBar({
  node,
  device,
  onDevice,
  onResetAll,
}: {
  node: Node;
  device: Device;
  onDevice?: (device: Device) => void;
  onResetAll: () => void;
}) {
  const slot: Slot = device === "desktop" ? "style" : device;
  const overrides =
    device !== "desktop" && Object.keys(node[slot] ?? {}).length > 0;
  const differs = (d: "tablet" | "mobile") =>
    Object.keys(node[d] ?? {}).length > 0;
  return (
    <div className="sp-device">
      <span
        className="device-scope"
        role="group"
        aria-label="Screen size to style"
      >
        {(["desktop", "tablet", "mobile"] as const).map((d) => (
          <button
            type="button"
            key={d}
            className={device === d ? "chosen" : ""}
            aria-label={`Style for ${deviceNames[d].toLowerCase()}`}
            aria-pressed={device === d}
            title={
              d !== "desktop" && differs(d)
                ? `${deviceNames[d]}: has its own changes`
                : deviceNames[d]
            }
            onClick={() => onDevice?.(d)}
          >
            <Icon name={d} size={13} />
            <span>{deviceNames[d]}</span>
            {d !== "desktop" && differs(d) && (
              <i className="sp-dot" aria-hidden="true" />
            )}
          </button>
        ))}
      </span>
      {device !== "desktop" && (
        <p className="device-note">
          <span>
            {overrides
              ? `Changes here are for ${deviceNames[device].toLowerCase()} only. Blue rows differ.`
              : `Same as ${device === "mobile" && node.tablet ? "tablet" : "desktop"} until you change something here.`}
          </span>
          {overrides && (
            <button type="button" onClick={onResetAll}>
              Reset all
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Where children sit, as a 3 × 3 grid of choices (like a design tool). */
function AlignMatrix({
  row,
  align,
  justify,
  onChange,
}: {
  /** Side by side (else stacked). */
  row: boolean;
  align: NonNullable<Style["align"]>;
  justify: NonNullable<Style["justify"]>;
  onChange: (patch: Partial<Style>) => void;
}) {
  const spots = ["start", "center", "end"] as const;
  const vertical = ["Top", "Middle", "Bottom"];
  const horizontal = ["left", "centre", "right"];
  return (
    <div
      className={`sp-matrix ${row ? "is-row" : "is-column"}`}
      role="group"
      aria-label="Where blocks sit"
    >
      {spots.map((y, yi) =>
        spots.map((x, xi) => {
          // Stacked: across is align, down is justify; side by side, the reverse.
          const a = row ? y : x;
          const j = row ? x : y;
          const on =
            (align === a || align === "stretch") &&
            (justify === j || justify === "between");
          const exact = align === a && justify === j;
          const name =
            yi === 1 && xi === 1
              ? "Centre"
              : `${vertical[yi]} ${horizontal[xi]}`;
          return (
            <button
              type="button"
              key={`${y}-${x}`}
              className={`${exact ? "chosen" : ""} ${on && !exact ? "covered" : ""}`}
              aria-label={name}
              aria-pressed={exact}
              title={name}
              onClick={() => onChange({ align: a, justify: j })}
            >
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}

export function StylePanel({
  section,
  node,
  device,
  pickMedia,
  part = "style",
}: {
  section: Section;
  node: Node;
  device: Device;
  /** Kept for callers that pass it; the device bar is drawn by the Inspector. */
  onDevice?: (device: Device) => void;
  pickMedia: (target: MediaTarget) => void;
  /** "layout": how the block arranges its blocks; "style": everything else. */
  part?: "layout" | "style";
}) {
  const updateNode = useStudio((s) => s.updateNode);
  const slot: Slot = device === "desktop" ? "style" : device;
  const own: Style = node[slot] ?? {};
  /** What the block shows on this device. */
  const get = <K extends keyof Style>(k: K): Style[K] =>
    device === "desktop"
      ? node.style?.[k]
      : device === "tablet"
        ? (node.tablet?.[k] ?? node.style?.[k])
        : (node.mobile?.[k] ?? node.tablet?.[k] ?? node.style?.[k]);
  const write = (patch: Partial<Style>) =>
    updateNode(
      section.id,
      node.id,
      (n) => ({ ...n, [slot]: mergeStyle(n[slot], patch) }),
      `style:${node.id}:${slot}:${Object.keys(patch).sort().join()}`,
    );
  const isSet = (keys: (keyof Style)[]) =>
    keys.some((k) => own[k] !== undefined);
  const resetLabel =
    device === "desktop"
      ? "Clear"
      : `Same as ${device === "mobile" && node.tablet ? "tablet" : "desktop"}`;
  const row = (
    label: string,
    keys: (keyof Style)[],
    control: ReactNode,
    stacked = false,
  ) => (
    <StyleRow
      key={label}
      label={label}
      set={isSet(keys)}
      overridden={device !== "desktop" && isSet(keys)}
      resetLabel={resetLabel}
      stacked={stacked}
      onReset={() => write(Object.fromEntries(keys.map((k) => [k, undefined])))}
    >
      {control}
    </StyleRow>
  );
  /** How many of `keys` differ on this screen size (the group badge). */
  const changed = (keys: (keyof Style)[]) =>
    device === "desktop" ? 0 : keys.filter((k) => own[k] !== undefined).length;
  const def = BLOCKS[node.type];
  const isGrid = node.type === "grid" || node.type === "columns";
  // A repeat lays its cards out by "Show as": only columns and space apply.
  const isRepeat = node.type === "repeat";
  const hasText = !NO_TEXT.has(node.type);
  const width = get("width");
  const radius = get("radius");
  const fontSize = get("fontSize");
  const customSize =
    !!fontSize && !(FONT_SIZES as readonly string[]).includes(fontSize);

  if (part === "layout") {
    const direction =
      get("direction") ?? (node.type === "row" ? "row" : "column");
    const isRow = direction === "row";
    const align = get("align") ?? (isRow ? "center" : "stretch");
    const justify = get("justify") ?? "start";
    const repeatLayout = ["list", "carousel"].includes(
      String(node.props.layout),
    )
      ? String(node.props.layout)
      : "grid";
    // The space the cards have while it's unset (blocks.css, looks.css).
    const repeatGap =
      node.props.look === "listing" ? (repeatLayout === "list" ? 0 : 28) : 20;
    return (
      <div className="style-panel">
        <Group
          id="layout"
          title="Arrange"
          badge={changed([
            "direction",
            "align",
            "justify",
            "gap",
            "wrap",
            "columns",
            "contentWidth",
          ])}
        >
          {node.type === "section" &&
            row(
              "Content width",
              ["contentWidth"],
              <Segmented
                label="Content width"
                value={get("contentWidth") ?? "normal"}
                options={[
                  { value: "narrow", label: "Narrow" },
                  { value: "normal", label: "Normal" },
                  { value: "wide", label: "Wide" },
                  { value: "full", label: "Full" },
                ]}
                onChange={(contentWidth) => write({ contentWidth })}
              />,
              true,
            )}
          {!isGrid &&
            !isRepeat &&
            row(
              "Direction",
              ["direction"],
              <Segmented
                label="Direction"
                value={direction}
                options={[
                  { value: "column", label: "Stacked", icon: "stacked" },
                  { value: "row", label: "Side by side", icon: "sideBySide" },
                ]}
                onChange={(d) => write({ direction: d })}
                withText
              />,
            )}
          {!isGrid &&
            !isRepeat &&
            row(
              "Position",
              ["align", "justify"],
              <div className="sp-arrange">
                <AlignMatrix
                  row={isRow}
                  align={align}
                  justify={justify}
                  onChange={write}
                />
                <div className="sp-arrange-options">
                  <Switch
                    label={isRow ? "Same height" : "Fill width"}
                    checked={align === "stretch"}
                    onChange={(on) =>
                      write({
                        align: on ? "stretch" : isRow ? "center" : "start",
                      })
                    }
                  />
                  <Switch
                    label="Spread out"
                    checked={justify === "between"}
                    onChange={(on) =>
                      write({ justify: on ? "between" : "start" })
                    }
                  />
                  {isRow && (
                    <Switch
                      label="Wrap"
                      checked={get("wrap") !== false}
                      onChange={(wrap) => write({ wrap })}
                    />
                  )}
                </div>
              </div>,
              true,
            )}
          {node.type === "grid" &&
            row(
              "Per row",
              ["columns"],
              <NumberInput
                label="Cards per row"
                value={get("columns")}
                min={1}
                max={6}
                unit=""
                placeholder="3"
                onChange={(columns) => write({ columns })}
              />,
            )}
          {isRepeat &&
            (repeatLayout === "grid" ||
              (repeatLayout === "carousel" && device === "desktop")) &&
            row(
              "Per row",
              ["columns"],
              <NumberInput
                label="Cards per row"
                value={device === "desktop" ? get("columns") : own.columns}
                min={1}
                max={6}
                unit=""
                placeholder={device === "desktop" ? "3" : "Auto"}
                onChange={(columns) => write({ columns })}
              />,
            )}
          {node.type === "columns" &&
            device !== "desktop" &&
            row(
              "Per row",
              ["columns"],
              <NumberInput
                label="Columns per row"
                value={own.columns}
                min={1}
                max={4}
                unit=""
                placeholder="Auto"
                onChange={(columns) => write({ columns })}
              />,
            )}
          {isGrid &&
            row(
              "Line up",
              ["align"],
              <Segmented
                label="Line up blocks"
                value={get("align")}
                options={[
                  { value: "start", label: "Top" },
                  { value: "center", label: "Middle" },
                  { value: "end", label: "Bottom" },
                  { value: "stretch", label: "Fill" },
                ]}
                onChange={(a) => write({ align: a })}
              />,
            )}
          {row(
            "Space between",
            ["gap"],
            <SliderInput
              label={isRepeat ? "Space between cards" : "Space between blocks"}
              value={get("gap")}
              min={0}
              max={120}
              fallback={isRepeat ? repeatGap : 0}
              onChange={(gap) => write({ gap })}
            />,
          )}
        </Group>
      </div>
    );
  }

  return (
    <div className="style-panel">
      {device !== "desktop" && (
        <div className="sp-device-hide">
          {row(
            "Visibility",
            ["hidden"],
            <Switch
              label={`Hide on ${deviceNames[device].toLowerCase()}`}
              checked={get("hidden") === true}
              onChange={(hidden) =>
                write({
                  hidden:
                    hidden ||
                    (device === "mobile" && node.tablet?.hidden
                      ? false
                      : undefined),
                })
              }
            />,
          )}
        </div>
      )}

      {hasText && (
        <Group
          id={def.container ? "text-inside" : "text"}
          title={def.container ? "Text inside" : "Text"}
          open={!def.container}
          badge={changed([
            "fontSize",
            "fontWeight",
            "textAlign",
            "lineHeight",
            "letterSpacing",
            "uppercase",
            "italic",
            "color",
          ])}
        >
          {row(
            "Size",
            ["fontSize"],
            <span className="sp-inline">
              <select
                aria-label="Text size"
                value={customSize ? "custom" : (fontSize ?? "")}
                onChange={(e) =>
                  write({
                    fontSize:
                      e.target.value === "custom"
                        ? "18"
                        : e.target.value || undefined,
                  })
                }
              >
                <option value="">Default</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {SIZE_NAMES[s]}
                  </option>
                ))}
                <option value="custom">Exact size…</option>
              </select>
              {customSize && (
                <NumberInput
                  label="Text size in pixels"
                  value={Number(fontSize)}
                  min={8}
                  max={200}
                  onChange={(n) =>
                    n !== undefined &&
                    write({ fontSize: String(Math.round(n)) })
                  }
                />
              )}
            </span>,
          )}
          {row(
            "Weight",
            ["fontWeight"],
            <select
              aria-label="Text weight"
              value={get("fontWeight") ?? ""}
              onChange={(e) =>
                write({
                  fontWeight: e.target.value
                    ? (Number(e.target.value) as Style["fontWeight"])
                    : undefined,
                })
              }
            >
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra bold</option>
            </select>,
          )}
          {row(
            "Colour",
            ["color"],
            <ColorInput
              label="Text colour"
              value={get("color")}
              against="background"
              onChange={(color) => write({ color })}
            />,
          )}
          {row(
            "Align",
            ["textAlign"],
            <Segmented
              label="Text alignment"
              value={get("textAlign")}
              options={[
                { value: "left", label: "Align left", icon: "alignLeft" },
                { value: "center", label: "Align centre", icon: "alignCenter" },
                { value: "right", label: "Align right", icon: "alignRight" },
              ]}
              onChange={(textAlign) => write({ textAlign })}
            />,
          )}
          {row(
            "Look",
            ["uppercase", "italic"],
            <div
              className="segmented sp-segmented"
              role="group"
              aria-label="Text look"
            >
              {(
                [
                  ["italic", "Italic", "italic"],
                  ["uppercase", "Capitals", "type"],
                ] as const
              ).map(([key, text, icon]) => (
                <button
                  type="button"
                  key={key}
                  className={get(key) ? "chosen" : ""}
                  aria-pressed={!!get(key)}
                  onClick={() => write({ [key]: !get(key) })}
                >
                  <Icon name={icon} size={13} />
                  {text}
                </button>
              ))}
            </div>,
          )}
          <div className="sp-grid2">
            {row(
              "Line height",
              ["lineHeight"],
              <NumberInput
                label="Line height"
                value={get("lineHeight")}
                min={0.8}
                max={3}
                step={0.05}
                unit=""
                placeholder="Auto"
                onChange={(lineHeight) => write({ lineHeight })}
              />,
              true,
            )}
            {row(
              "Letter spacing",
              ["letterSpacing"],
              <NumberInput
                label="Letter spacing"
                value={get("letterSpacing")}
                min={-10}
                max={20}
                step={0.1}
                placeholder="0"
                onChange={(letterSpacing) => write({ letterSpacing })}
              />,
              true,
            )}
          </div>
        </Group>
      )}

      <Group
        id="size"
        title="Size"
        badge={changed(["width", "maxWidth", "minHeight", "height"])}
      >
        {node.type !== "section" &&
          row(
            "Width",
            ["width"],
            <>
              <Segmented
                label="Width"
                value={typeof width === "number" ? "fixed" : (width ?? "auto")}
                options={[
                  { value: "auto", label: "Fit" },
                  { value: "full", label: "Full" },
                  { value: "fixed", label: "Exact" },
                ]}
                onChange={(w) =>
                  write({
                    width:
                      w === "fixed"
                        ? typeof width === "number"
                          ? width
                          : 320
                        : w,
                  })
                }
              />
              {typeof width === "number" && (
                <NumberInput
                  label="Width in pixels"
                  prefix="W"
                  value={width}
                  min={0}
                  max={4000}
                  onChange={(n) => write({ width: n ?? "auto" })}
                />
              )}
            </>,
          )}
        <div className="sp-grid2">
          {row(
            "Max width",
            ["maxWidth"],
            <NumberInput
              label="Max width"
              value={get("maxWidth")}
              min={0}
              max={4000}
              placeholder="None"
              onChange={(maxWidth) => write({ maxWidth })}
            />,
            true,
          )}
          {row(
            "Height",
            ["height"],
            <NumberInput
              label="Height"
              value={get("height")}
              min={0}
              max={4000}
              onChange={(height) => write({ height })}
            />,
            true,
          )}
          {row(
            "Min height",
            ["minHeight"],
            <NumberInput
              label="Min height"
              value={get("minHeight")}
              min={0}
              max={4000}
              placeholder="None"
              onChange={(minHeight) => write({ minHeight })}
            />,
            true,
          )}
        </div>
      </Group>

      <Group
        id="spacing"
        title="Spacing"
        badge={changed(["padding", "margin"])}
      >
        <SpacingBox
          key={`${node.id}-${slot}`}
          padding={get("padding")}
          margin={get("margin")}
          paddingSet={isSet(["padding"])}
          marginSet={isSet(["margin"])}
          paddingOverride={device !== "desktop" && isSet(["padding"])}
          marginOverride={device !== "desktop" && isSet(["margin"])}
          onPadding={(padding) => write({ padding })}
          onMargin={(margin) => write({ margin })}
        />
      </Group>

      {node.type !== "spacer" && (
        <Group
          id="background"
          title="Background"
          open={def.container}
          badge={changed(["background", "backgroundImage", "overlay"])}
        >
          {row(
            "Colour",
            ["background"],
            <ColorInput
              label="Background colour"
              value={get("background")}
              against="text"
              onChange={(background) => write({ background })}
            />,
          )}
          {row(
            "Image",
            ["backgroundImage"],
            <ImageField
              compact
              label="Background image"
              value={get("backgroundImage") ?? ""}
              onPick={() =>
                pickMedia({ section: section.id, node: node.id, style: slot })
              }
              onClear={() => write({ backgroundImage: undefined })}
            />,
          )}
          {get("backgroundImage") &&
            row(
              "Darken",
              ["overlay"],
              <SliderInput
                label="Darken the image"
                value={get("overlay")}
                min={0}
                max={90}
                unit="%"
                fallback={0}
                onChange={(overlay) => write({ overlay })}
              />,
            )}
        </Group>
      )}

      {node.type !== "spacer" && (
        <Group
          id="border"
          title="Border and corners"
          open={false}
          badge={changed(["borderWidth", "borderColor", "radius"])}
        >
          {row(
            "Border",
            ["borderWidth"],
            <NumberInput
              label="Border width"
              value={get("borderWidth")}
              min={0}
              max={20}
              placeholder="None"
              onChange={(borderWidth) => write({ borderWidth })}
            />,
          )}
          {(get("borderWidth") ?? 0) > 0 &&
            row(
              "Border colour",
              ["borderColor"],
              <ColorInput
                label="Border colour"
                value={get("borderColor")}
                onChange={(borderColor) => write({ borderColor })}
              />,
            )}
          {row(
            "Corners",
            ["radius"],
            <>
              <Segmented
                label="Corners"
                value={
                  typeof radius === "number"
                    ? radius === 0
                      ? "square"
                      : "exact"
                    : radius
                }
                options={[
                  { value: "square", label: "Square" },
                  { value: "theme", label: "Site" },
                  { value: "full", label: "Round" },
                  { value: "exact", label: "Exact" },
                ]}
                onChange={(r) =>
                  write({
                    radius:
                      r === "square"
                        ? 0
                        : r === "exact"
                          ? typeof radius === "number" && radius
                            ? radius
                            : 12
                          : (r as "theme" | "full"),
                  })
                }
              />
              {typeof radius === "number" && radius > 0 && (
                <SliderInput
                  label="Corner radius"
                  value={radius}
                  min={0}
                  max={64}
                  fallback={12}
                  onChange={(n) => write({ radius: n ?? 0 })}
                />
              )}
            </>,
          )}
        </Group>
      )}

      <Group
        id="effects"
        title="Effects"
        open={false}
        badge={changed(["shadow", "opacity"])}
      >
        {row(
          "Shadow",
          ["shadow"],
          <Segmented
            label="Shadow"
            value={get("shadow") ?? "none"}
            options={[
              { value: "none", label: "None" },
              { value: "sm", label: "Soft" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Strong" },
            ]}
            onChange={(shadow) => write({ shadow })}
          />,
        )}
        {row(
          "Opacity",
          ["opacity"],
          <SliderInput
            label="Opacity"
            value={get("opacity")}
            min={0}
            max={100}
            unit="%"
            fallback={100}
            onChange={(opacity) => write({ opacity })}
          />,
        )}
      </Group>
    </div>
  );
}
