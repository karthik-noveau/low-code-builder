/** State helpers shared by the app builder's tabs. Editor only. */
import { useState } from "react";
import type { Notify } from "../studio/ui";
import { useStudio } from "../studio/store";
import type { App } from "./model";
import type { Check } from "./edit";
import { appIssues } from "./issues";

export const undoAction = {
  label: "Undo",
  run: () => useStudio.getState().undo(),
};

/** Applies an app edit, telling the owner when it was refused. */
export function useAppEdit(notify: Notify) {
  const updateApp = useStudio((s) => s.updateApp);
  return (fn: (app: App) => App, coalesce?: string) => {
    const done = updateApp(fn, coalesce);
    if (!done)
      notify("That change would stop your app working, so it wasn’t made.");
    return done;
  };
}

/** A change that may need a confirmation (side effects) or be refused (blockers). */
export interface Pending {
  at: string;
  label: string;
  check: Check;
  run: () => void;
}
/**
 * Runs `run` straight away when nothing depends on the change; otherwise keeps
 * it pending so `<PendingNote at=…>` can explain and ask.
 */
export function usePending() {
  const [pending, setPending] = useState<Pending | null>(null);
  const attempt = (
    at: string,
    label: string,
    check: Check,
    run: () => void,
  ) => {
    if (!check.blocked.length && !check.cleaned.length) {
      setPending(null);
      run();
    } else setPending({ at, label, check, run });
  };
  return { attempt, pending, clear: () => setPending(null) };
}

/** The app's issues, knowing the site's collections (item fields choose from them). */
export function useAppIssues(app: App | undefined) {
  const collections = useStudio((s) => s.project.collections);
  return app ? appIssues(app, { collections }) : [];
}
