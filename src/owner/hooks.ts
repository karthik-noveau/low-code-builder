import { useCallback, useSyncExternalStore } from "react";

/** Tablet and below: the sidebar becomes a drawer. */
export const MOBILE_NAV_QUERY = "(max-width: 860px)";
/** Phones: bottom tabs replace the sidebar. */
export const PHONE_QUERY = "(max-width: 640px)";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (change: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener?.("change", change);
      return () => list?.removeEventListener?.("change", change);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}
