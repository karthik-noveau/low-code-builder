/**
 * The block menu: what you can do with the selected block, opened by
 * right-clicking it on the canvas or in Layers, or from the toolbar's More
 * button. Arrow keys move through it, Enter chooses, Esc closes. Every
 * action is one undo step.
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import { locate } from "../model";
import { BLOCKS, nodeLabel } from "../registry";
import {
  blockSelection,
  canMove,
  canWrap,
  copySelected,
  duplicateSelected,
  moveSibling,
  paste,
  removeSelected,
  selectParent,
  toggleHidden,
  undoAction,
  useBlocksUi,
  wrapSelected,
  type Notify,
} from "./actions";

const mac =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";
const ALT = mac ? "⌥" : "Alt+";

interface Item {
  label: string;
  icon: string;
  keys?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

export function BlockMenu({
  notify,
  onPick,
  onEditText,
}: {
  notify: Notify;
  /** Shows a block's settings after the menu changed the selection. */
  onPick: (section: string, node: string) => void;
  /** Starts typing the block's text on the canvas. */
  onEditText?: (section: string, node: string) => void;
}) {
  const menu = useBlocksUi((s) => s.menu);
  const clipboard = useBlocksUi((s) => s.clipboard);
  // Re-render when the selection changes so the items match it.
  useStudio((s) => `${s.selected}:${s.selectedBlock}`);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => useBlocksUi.setState({ menu: null });

  // Keep the menu on screen (measured once it's drawn), then focus its first item.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    el.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - h - 8))}px`;
    el.style.visibility = "visible";
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) close();
    };
    const blur = () => close();
    // Esc closes the menu before anything else hears it (Esc also selects the parent).
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", esc, true);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("scroll", away, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      window.removeEventListener("keydown", esc, true);
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("scroll", away, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [menu]);

  const sel = blockSelection();
  if (!menu || !sel.root) return null;
  const { section, root, node } = sel;
  const isRoot = node === root;
  const name = isRoot ? section.name : nodeLabel(node);
  const moves = canMove(section, root, node.id);
  const hidden = isRoot ? !!section.hidden : !!node.hidden;
  const reselect = () => {
    const s = useStudio.getState();
    if (s.selected) onPick(s.selected, s.selectedBlock ?? "");
  };
  const inline = BLOCKS[node.type].inline;
  const groups: Item[][] = [
    [
      ...(inline && onEditText
        ? [
            {
              label: "Edit text",
              icon: "edit",
              keys: "Enter",
              run: () => onEditText(section.id, node.id),
            },
          ]
        : []),
      {
        label: "Duplicate",
        icon: "copy",
        keys: `${MOD}D`,
        run: () => {
          duplicateSelected();
          reselect();
          notify(`${name} duplicated`, undoAction);
        },
      },
      {
        label: "Copy",
        icon: "copy",
        keys: `${MOD}C`,
        run: () => {
          copySelected();
          notify("Copied. Select where it should go, then paste.");
        },
      },
      {
        label: "Paste after",
        icon: "paste",
        keys: `${MOD}V`,
        disabled: !clipboard,
        run: () => {
          if (paste()) reselect();
          else notify("That can’t be pasted here.");
        },
      },
    ],
    [
      {
        label: "Move up",
        icon: "up",
        keys: `${ALT}↑`,
        disabled: !moves.up,
        run: () => {
          moveSibling(-1);
          notify(`${name} moved up`, undoAction);
        },
      },
      {
        label: "Move down",
        icon: "down",
        keys: `${ALT}↓`,
        disabled: !moves.down,
        run: () => {
          moveSibling(1);
          notify(`${name} moved down`, undoAction);
        },
      },
      ...(isRoot
        ? []
        : [
            {
              label: "Put in a box",
              icon: "wrap",
              disabled: !canWrap("box"),
              run: () => {
                wrapSelected("box");
                reselect();
                notify(`${name} is now inside a box`, undoAction);
              },
            },
            {
              label: "Put in a row",
              icon: "sideBySide",
              disabled: !canWrap("row"),
              run: () => {
                wrapSelected("row");
                reselect();
                notify(`${name} is now inside a row`, undoAction);
              },
            },
          ]),
    ],
    [
      ...(isRoot
        ? []
        : [
            {
              label: "Select parent",
              icon: "parent",
              keys: "Esc",
              disabled: !locate([root], node.id)?.parent,
              run: () => {
                selectParent();
                reselect();
              },
            },
          ]),
      {
        label: hidden ? "Show on site" : "Hide on site",
        icon: hidden ? "eye" : "eyeOff",
        run: () => {
          const now = toggleHidden();
          notify(
            now ? `${name} is hidden on your site` : `${name} is shown again`,
            undoAction,
          );
        },
      },
    ],
    [
      {
        label: isRoot ? "Delete section" : "Delete",
        icon: "trash",
        keys: "Del",
        danger: true,
        run: () => {
          const label = removeSelected();
          reselect();
          notify(`${label} deleted`, undoAction);
        },
      },
    ],
  ].filter((g) => g.length);

  const move = (e: KeyboardEvent) => {
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) =>
      buttons[(n + buttons.length) % buttons.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(buttons.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className="block-menu"
      role="menu"
      aria-label={`${name} actions`}
      style={{ left: menu.x, top: menu.y, visibility: "hidden" }}
      onKeyDown={move}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="block-menu-title" aria-hidden="true">
        <Icon name={isRoot ? "panel" : BLOCKS[node.type].icon} size={13} />
        <span>{name}</span>
      </div>
      {groups.map((group, g) => (
        <div className="block-menu-group" role="group" key={g}>
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "danger" : ""}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.run();
              }}
            >
              <Icon name={item.icon} size={14} />
              <span>{item.label}</span>
              {item.keys && <kbd>{item.keys}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
