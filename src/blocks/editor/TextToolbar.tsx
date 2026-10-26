/**
 * The small toolbar over text being typed on the canvas. Block text is plain
 * (headings colour *starred* words in the accent), so bold, italic, size and
 * alignment apply to the whole block, for the screen size being edited.
 * Buttons keep the typing focus (mousedown is cancelled).
 */
import type { CSSProperties } from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import type { Device } from "../../studio/model";
import { FONT_SIZES, mergeStyle, type Node, type Style } from "../model";

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
}: {
  section: string;
  node: Node;
  device: Device;
  style: CSSProperties;
  onDone: () => void;
}) {
  const updateNode = useStudio((s) => s.updateNode);
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
  const weight = get("fontWeight") ?? (heading ? 700 : 400);
  const size = get("fontSize") ?? (heading ? "2xl" : "md");
  const step = (by: -1 | 1) => {
    const px = STEPS.includes(size) ? PX[size] : Number(size) || 16;
    const at = STEPS.findIndex((s) => PX[s] >= px);
    const i = Math.max(0, Math.min(STEPS.length - 1, (at < 0 ? 7 : at) + by));
    write({ fontSize: STEPS[i] });
  };
  const accent = () => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (!text || text.includes("\n")) return;
    const bare = /^\*.*\*$/.test(text) ? text.slice(1, -1) : `*${text}*`;
    document.execCommand("insertText", false, bare);
  };
  const align = get("textAlign");
  const tool = (
    label: string,
    icon: string,
    run: () => void,
    pressed?: boolean,
  ) => (
    <button
      type="button"
      className="blocks-tool"
      aria-label={label}
      data-tip={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon name={icon} size={15} />
    </button>
  );

  return (
    <div
      className="blocks-toolbar text-toolbar"
      role="toolbar"
      aria-label="Text tools"
      style={position}
    >
      {heading &&
        tool("Accent colour for the selected words", "sparkles", accent)}
      {tool(
        "Bold",
        "bold",
        () => write({ fontWeight: weight >= 600 ? 400 : 700 }),
        weight >= 600,
      )}
      {tool(
        "Italic",
        "italic",
        () => write({ italic: !get("italic") || undefined }),
        !!get("italic"),
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
      <button
        type="button"
        className="blocks-tool-text"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDone}
      >
        <Icon name="check" size={14} />
        Done
      </button>
    </div>
  );
}
