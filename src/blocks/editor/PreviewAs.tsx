/**
 * "Preview as", above the canvas on pages with page values or "show only
 * when" rules: see the page with a page value set, as a visitor arriving
 * from a link with ?ref=…, in the dark theme, or on another day. It changes
 * only what the editor shows (and where Preview starts), never the site.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../studio/Icon";
import type { Page, Project } from "../../studio/model";
import { shownValue, today } from "../logic/model";
import { usePreviewAs } from "../logic/preview";
import { Segmented } from "./fields";
import "./actions-panel.css";

export function PreviewAsControl({
  project,
  page,
}: {
  project: Project;
  page: Page;
}) {
  const state = usePreviewAs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const variables = page.variables ?? [];
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const set = variables.filter((v) => state.vars[v.name] !== undefined);
  const parts = [
    ...set.map((v) => `${v.name}: ${shownValue(v, state.vars[v.name])}`),
    ...(state.query ? [`?${state.query.replace(/^\?/, "")}`] : []),
    ...(state.theme ? [state.theme === "dark" ? "Dark" : "Light"] : []),
    ...(state.date
      ? [
          new Date(`${state.date}T12:00:00`).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          }),
        ]
      : []),
  ];
  return (
    <div className="preview-as" ref={box}>
      <button
        type="button"
        className={`preview-as-trigger ${parts.length ? "is-set" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon name="eye" size={14} />
        Preview as
        <span className="preview-as-summary">
          {parts.length ? parts.join(" · ") : "a first-time visitor"}
        </span>
        <Icon name={open ? "up" : "down"} size={12} />
      </button>
      {open && (
        <div
          className="preview-as-panel"
          id={id}
          role="dialog"
          aria-label="Preview as"
        >
          <h3>Preview as</h3>
          <p>
            See each state of this page. Only the editor changes; visitors start
            with the starting values.
          </p>
          {variables.map((v) => {
            const value = state.vars[v.name];
            return (
              <div className="preview-as-row" key={v.name}>
                <span title={v.name}>{v.name}</span>
                {v.type === "yesno" ? (
                  <Segmented
                    label={v.name}
                    value={value ?? v.value}
                    withText
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                    onChange={(next) =>
                      state.setVar(v.name, next === v.value ? undefined : next)
                    }
                  />
                ) : (
                  <input
                    aria-label={`Preview ${v.name} as`}
                    type={v.type === "number" ? "number" : "text"}
                    value={value ?? ""}
                    placeholder={v.value || "(empty)"}
                    maxLength={200}
                    onChange={(e) =>
                      state.setVar(v.name, e.target.value || undefined)
                    }
                  />
                )}
              </div>
            );
          })}
          <div className="preview-as-row">
            <span className="is-label">Arriving from</span>
            <input
              aria-label="Arriving from a link with"
              value={state.query}
              placeholder="?ref=instagram"
              maxLength={200}
              onChange={(e) => state.set({ query: e.target.value })}
            />
          </div>
          <div className="preview-as-row">
            <span className="is-label">Theme</span>
            {project.theme.darkToggle ? (
              <Segmented
                label="Theme"
                value={state.theme || "light"}
                withText
                options={[
                  { value: "light", label: "Light", icon: "sun" },
                  { value: "dark", label: "Dark", icon: "moon" },
                ]}
                onChange={(theme) =>
                  state.set({ theme: theme === "light" ? "" : theme })
                }
              />
            ) : (
              <small className="block-hint">
                Always light (turn on “Light and dark” in Site styles).
              </small>
            )}
          </div>
          <div className="preview-as-row">
            <span className="is-label">On the day</span>
            <input
              aria-label="Preview on the day"
              type="date"
              value={state.date || today()}
              onChange={(e) =>
                state.set({
                  date:
                    !e.target.value || e.target.value === today()
                      ? ""
                      : e.target.value,
                })
              }
            />
          </div>
          <div className="preview-as-foot">
            <button
              type="button"
              disabled={!parts.length}
              onClick={state.reset}
            >
              Back to the starting state
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
