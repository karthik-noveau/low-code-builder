/**
 * "Preview as" (src/blocks/editor/PreviewAs.tsx): the page values, address,
 * theme and day the editor draws the page in, so owners can see every state
 * of tabs, offers and conditions. Editor-only: never saved, never undone.
 */
import { create } from "zustand";
import { NO_PREVIEW, type PreviewAs } from "./blocks";

export const usePreviewAs = create<
  PreviewAs & {
    set: (patch: Partial<PreviewAs>) => void;
    setVar: (name: string, value: string | undefined) => void;
    reset: () => void;
  }
>((set) => ({
  ...NO_PREVIEW,
  set: (patch) => set(patch),
  setVar: (name, value) =>
    set((s) => {
      const vars = { ...s.vars };
      if (value === undefined) delete vars[name];
      else vars[name] = value;
      return { vars };
    }),
  reset: () => set({ ...NO_PREVIEW }),
}));
/** The "Preview as" values alone (what Website reads). */
export const previewState = (s: PreviewAs): PreviewAs => ({
  vars: s.vars,
  query: s.query,
  theme: s.theme,
  date: s.date,
});
