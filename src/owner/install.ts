/** Installing the owner app to a home screen (the browser's install prompt). */
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let listening = false;
/** Starts listening early: the browser fires the event once, soon after load. */
export function listenForInstall() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () =>
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent);

export function useInstallPrompt() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const changed = () => setTick((n) => n + 1);
    listeners.add(changed);
    return () => {
      listeners.delete(changed);
    };
  }, []);
  return {
    canPrompt: !!deferred,
    isInstalled: standalone(),
    needsManualInstructions: isIos() && !standalone(),
    promptInstall: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
      deferred = null;
      listeners.forEach((l) => l());
    },
  };
}
