import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface MenuAction {
  label: string;
  icon: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function ActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const show = () => {
    setPortal(
      trigger.current?.closest<HTMLElement>(".studio") ?? document.body,
    );
    setOpen(true);
  };
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight;
    setPosition({
      top: Math.max(
        8,
        Math.min(rect.bottom + 5, window.innerHeight - height - 8),
      ),
      left: Math.max(8, Math.min(rect.right - 218, window.innerWidth - 226)),
    });
    menu.current
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const reposition = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target))
        return;
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      setPosition({
        top: Math.max(
          8,
          Math.min(
            rect.bottom + 5,
            window.innerHeight - menu.current.offsetHeight - 8,
          ),
        ),
        left: Math.max(8, Math.min(rect.right - 218, window.innerWidth - 226)),
      });
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`icon-button action-menu-trigger ${open ? "active" : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
          }
        }}
      >
        <Icon name="more" size={17} />
      </button>
      {open &&
        portal &&
        createPortal(
          <div
            ref={menu}
            className="studio-action-menu"
            role="menu"
            aria-label={label}
            style={position}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (event.key === "Tab") close(true);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const current = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (current +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
            }}
          >
            {actions.map((action) => (
              <button
                type="button"
                role="menuitem"
                key={action.label}
                className={action.danger ? "is-danger" : ""}
                disabled={action.disabled}
                onClick={() => {
                  close(true);
                  action.run();
                }}
              >
                <Icon name={action.icon} size={15} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>,
          portal,
        )}
    </>
  );
}
