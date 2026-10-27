/**
 * The logic script (logic.js) published pages with clicks, conditions or
 * page values load. It reads the page's config, a non-executable
 * `<script type="application/json" id="forma-logic">` (project.ts), and:
 * - runs clicks on `[data-act]` (in order): go somewhere, open or close a
 *   dialog, copy text (with a "Copied" note), set or switch a page value;
 * - keeps `[data-when]` blocks shown or hidden as page values, the address
 *   (?ref=…), the theme and the day say, and `[data-var]` text and
 *   `aria-pressed` tabs up to date;
 * - opens dialogs as modals: focus moves in and is kept there, Esc or a
 *   click outside closes, focus returns to what opened it.
 *
 * DOM writes are textContent, setAttribute, hidden and classList only;
 * addresses are re-checked before use. No eval, no HTML strings, no inline
 * handlers: it runs under `script-src 'self'`. `logicWidget` must stay
 * self-contained (its source text is the script); the condition check is
 * passed in, as the source of `evaluateCondition` (model.ts).
 */
import { evaluateCondition, type Condition, type LogicEnv } from "./model";

function logicWidget(evaluate: (c: Condition, env: LogicEnv) => boolean) {
  type Run =
    | { do: "go"; href: string; newTab?: boolean }
    | { do: "open"; dialog: string }
    | { do: "close" }
    | { do: "copy"; text: string; toast: string }
    | { do: "set"; name: string; value: string }
    | { do: "toggle"; name: string };
  type Config = {
    vars: Record<string, { type: string; value: string; remember?: boolean }>;
    act: Record<string, Run[]>;
    when: Record<string, Condition>;
  };
  const source = document.getElementById("forma-logic");
  if (!source || (window as unknown as { formaLogic?: boolean }).formaLogic)
    return;
  (window as unknown as { formaLogic?: boolean }).formaLogic = true;
  let config: Config;
  try {
    config = JSON.parse(source.textContent || "{}");
  } catch {
    return;
  }
  const own = (o: unknown, k: string) =>
    !!o && Object.prototype.hasOwnProperty.call(o, k);
  const vars: Record<string, string> = {};
  const types: Record<string, string> = {};
  const fits = (type: string, v: unknown) =>
    typeof v === "string" &&
    v.length <= 200 &&
    (type === "number"
      ? /^-?\d{1,12}(?:\.\d{1,4})?$/.test(v)
      : type === "yesno"
        ? v === "yes" || v === "no"
        : true);
  const storeKey = (name: string) => `forma-value:${location.pathname}:${name}`;
  for (const name in config.vars || {}) {
    if (!own(config.vars, name)) continue;
    const v = config.vars[name];
    types[name] = v.type;
    vars[name] = fits(v.type, v.value) ? v.value : "";
    if (v.remember)
      try {
        const kept = localStorage.getItem(storeKey(name));
        if (kept !== null && fits(v.type, kept)) vars[name] = kept;
      } catch {
        /* storage blocked: the starting value */
      }
  }
  const query: Record<string, string> = {};
  try {
    new URLSearchParams(location.search).forEach((v, k) => {
      if (/^[A-Za-z0-9_-]{1,40}$/.test(k)) query[k] = v.slice(0, 200);
    });
  } catch {
    /* no readable query */
  }
  const site = document.querySelector(".website") as HTMLElement | null;
  const media = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  const isDark = () => {
    if (!site || !site.classList.contains("site-themes")) return false;
    const chosen = site.getAttribute("data-theme");
    return chosen ? chosen === "dark" : !!(media && media.matches);
  };
  const day = () => {
    const d = new Date();
    const pad = (n: number) => (n < 10 ? "0" : "") + n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const all = (sel: string) =>
    Array.prototype.slice.call(document.querySelectorAll(sel)) as HTMLElement[];
  const shown = (name: string) => {
    const v = vars[name] || "";
    if (types[name] === "yesno") return v === "yes" ? "Yes" : "No";
    return v;
  };
  const norm = (v: string) => v.trim().toLowerCase();

  /** Brings every hook on the page in line with the current state. */
  function apply() {
    const env: LogicEnv = { vars, query, dark: isDark(), today: day() };
    for (const el of all("[data-when]")) {
      const cond =
        config.when && config.when[el.getAttribute("data-when") || ""];
      if (!cond) continue;
      const show = evaluate(cond, env);
      if (el.hidden === show) el.hidden = !show;
    }
    for (const el of all("[data-var]")) {
      const name = el.getAttribute("data-var") || "";
      if (!own(vars, name)) continue;
      const text = shown(name);
      if (el.textContent !== text) el.textContent = text;
    }
    // A tab or switch (one set / switch click) shows whether it's on.
    for (const el of all("[data-act]")) {
      const list = config.act && config.act[el.getAttribute("data-act") || ""];
      if (!list || list.length !== 1) continue;
      const a = list[0];
      let on: boolean | undefined;
      if (a.do === "set") on = norm(vars[a.name] || "") === norm(a.value);
      if (a.do === "toggle") on = vars[a.name] === "yes";
      if (on === undefined) continue;
      el.setAttribute("aria-pressed", String(on));
      el.classList.toggle("is-on", on);
      el.classList.toggle("is-off", !on);
    }
  }
  function remember(name: string) {
    if (!config.vars[name] || !config.vars[name].remember) return;
    try {
      localStorage.setItem(storeKey(name), vars[name]);
    } catch {
      /* storage blocked: kept for this visit */
    }
  }

  /* Dialogs */
  const openers: { dialog: HTMLDialogElement; from: HTMLElement | null }[] = [];
  const focusable = (root: HTMLElement) =>
    (
      Array.prototype.slice.call(
        root.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[]
    ).filter((el) => !el.hidden && !el.closest("[hidden]"));
  function openDialog(id: string, from: HTMLElement | null) {
    const d = document.getElementById(id) as HTMLDialogElement | null;
    if (!d || d.tagName !== "DIALOG" || d.open) return;
    openers.push({ dialog: d, from });
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.classList.add("is-open");
    const first = focusable(d).find(
      (el) => !el.classList.contains("blk-dialog-close"),
    );
    (first || focusable(d)[0] || d).focus();
  }
  function closeDialog(d: HTMLDialogElement | null) {
    if (!d) return;
    if (d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
    closed(d);
  }
  /** After any close (button, Esc, outside): focus goes back to the opener. */
  function closed(d: HTMLDialogElement) {
    d.classList.remove("is-open");
    const at = openers.map((o) => o.dialog).lastIndexOf(d);
    if (at < 0) return;
    const [{ from }] = openers.splice(at, 1);
    if (from && from.isConnected) from.focus();
  }
  const top = () =>
    openers.length ? openers[openers.length - 1].dialog : null;

  /* Clicks */
  const safeHref = (v: string) =>
    /^(?:https?:\/\/|\/(?![/\\])|#[A-Za-z]|tel:|mailto:|[\w-]+\.html(?:[#?]|$))/i.test(
      v,
    ) && !/[\s<>"']/.test(v)
      ? v
      : "";
  let toast: HTMLElement | null = null;
  let toastTimer = 0;
  function note(text: string) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "blk-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
    }
    // Inside an open dialog, so the note shows above its backdrop.
    const host = top() || site || document.body;
    if (toast.parentNode !== host) host.appendChild(toast);
    toast.textContent = text;
    toast.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => toast && toast.classList.remove("is-shown"),
      2200,
    );
  }
  function copy(text: string, done: string) {
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      area.remove();
      note(ok ? done : "Couldn’t copy. Select the text to copy it.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(text).then(() => note(done), fallback);
    else fallback();
  }
  function run(list: Run[], el: HTMLElement) {
    let changed = false;
    for (const a of list) {
      if (a.do === "set" && own(types, a.name)) {
        if (fits(types[a.name], a.value)) {
          vars[a.name] = a.value;
          remember(a.name);
          changed = true;
        }
      } else if (a.do === "toggle" && own(types, a.name)) {
        vars[a.name] = vars[a.name] === "yes" ? "no" : "yes";
        remember(a.name);
        changed = true;
      } else if (a.do === "open") openDialog(a.dialog, el);
      else if (a.do === "close")
        closeDialog(
          (el.closest("dialog") as HTMLDialogElement | null) || top(),
        );
      else if (a.do === "copy") copy(String(a.text), a.toast || "Copied");
      else if (a.do === "go") {
        const href = safeHref(String(a.href));
        if (!href) continue;
        if (href.charAt(0) === "#") {
          const target = document.getElementById(href.slice(1));
          if (target) {
            const open = top();
            if (open && !open.contains(target)) closeDialog(open);
            target.scrollIntoView({
              behavior:
                window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              block: "start",
            });
          }
        } else if (a.newTab) window.open(href, "_blank", "noopener");
        else location.href = href;
      }
    }
    if (changed) apply();
  }
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !target.closest) return;
    const closer = target.closest("[data-dialog-close]");
    if (closer) {
      event.preventDefault();
      closeDialog(closer.closest("dialog") as HTMLDialogElement | null);
      return;
    }
    // A click on a dialog's dimmed backdrop (outside its box) closes it.
    if (target.tagName === "DIALOG" && (target as HTMLDialogElement).open) {
      const r = target.getBoundingClientRect();
      const e = event as MouseEvent;
      if (
        r.width &&
        (e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom)
      ) {
        closeDialog(target as HTMLDialogElement);
        return;
      }
    }
    const el = target.closest("[data-act]") as HTMLElement | null;
    const list =
      el && config.act && config.act[el.getAttribute("data-act") || ""];
    if (!el || !list) return;
    const mouse = event as MouseEvent;
    // Leave modified clicks (new tab, new window) on real links to the browser.
    if (
      el.tagName === "A" &&
      (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button > 0)
    )
      return;
    event.preventDefault();
    run(list, el);
  });
  document.addEventListener("keydown", (event) => {
    const d = top();
    if (event.key === "Escape" && d) {
      event.preventDefault();
      closeDialog(d);
      return;
    }
    // Focus stays inside the open dialog.
    if (event.key === "Tab" && d) {
      const items = focusable(d);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !d.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !d.contains(active))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    // Clickable cards (role="button" / "link" boxes) answer Enter and Space.
    const el = event.target as HTMLElement | null;
    if (
      el &&
      el.hasAttribute &&
      el.hasAttribute("data-act") &&
      el.tagName === "DIV" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      el.click();
    }
  });
  for (const d of all("dialog[data-dialog]"))
    d.addEventListener("close", () => closed(d as HTMLDialogElement));
  // The theme switch, the device theme and lists the data script fills.
  if (site && "MutationObserver" in window) {
    new MutationObserver(apply).observe(site, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        apply();
      }, 0);
    }).observe(site, { childList: true, subtree: true });
  }
  if (media && media.addEventListener) media.addEventListener("change", apply);
  apply();
}

export const LOGIC_SCRIPT = `;(${logicWidget.toString()})(${evaluateCondition.toString()});\n`;
