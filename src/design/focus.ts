import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside a modal dialog while it is open. */
export function useFocusTrap(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        element.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (item) =>
          item.getClientRects().length && !item.closest("[inert], [aria-hidden='true']"),
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !element.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (current === last || !element.contains(current))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    element.addEventListener("keydown", key);
    return () => element.removeEventListener("keydown", key);
  }, [root]);
}
