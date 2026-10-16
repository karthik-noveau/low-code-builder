import { useSyncExternalStore } from "react";

/**
 * The app's light/dark theme. Light is the default; "system" follows the
 * device. The choice is a per-browser convenience kept in localStorage, and
 * applied as <html data-theme="light|dark"> before the first render.
 */
export type ThemePreference = "light" | "dark" | "system";
const KEY = "forma-theme";
const listeners = new Set<() => void>();
const media = () =>
  typeof matchMedia === "function"
    ? matchMedia("(prefers-color-scheme: dark)")
    : undefined;

export function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "dark" || value === "system" || value === "light")
      return value;
  } catch {
    /* storage blocked: use the default */
  }
  return "light";
}
const resolve = (preference: ThemePreference) =>
  preference === "system" ? (media()?.matches ? "dark" : "light") : preference;

export function applyTheme(preference = readPreference()) {
  const theme = resolve(preference);
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b0b0d" : "#ffffff");
}
export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    /* the choice lasts for this page only */
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

let watching = false;
/** Applies the saved theme and keeps "system" in step with the device. */
export function startTheme() {
  applyTheme();
  if (watching) return;
  watching = true;
  media()?.addEventListener?.("change", () => {
    if (readPreference() === "system") {
      applyTheme("system");
      listeners.forEach((listener) => listener());
    }
  });
}

export function useThemePreference() {
  const preference = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readPreference,
    () => "light" as ThemePreference,
  );
  return [preference, setThemePreference] as const;
}
