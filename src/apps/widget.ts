/**
 * The script published sites load as app.js. It turns each "app" section
 * (`.app-form[data-app-api][data-form]`) into a working form or lookup that
 * talks to the public app API. Plain JavaScript in a string: published sites
 * run no framework and allow only scripts Forma itself writes.
 *
 * The section's markup (src/apps/AppSection.tsx) already holds every step, so
 * this only switches steps, fills in what the API returns (with textContent,
 * never HTML) and sends. No eval, no inline handlers, no inline styles: it
 * runs under `script-src 'self'`. Safe to load more than once.
 *
 * What it does beyond sending fields:
 * - a cart for "items" fields: Add → − 1 + on the menu, a sticky bar with the
 *   count and a preview total, and the order's lines on the details step
 *   (sent as `{ slug: quantity }`; the server prices it);
 * - places that run out: loads `/availability`, marks full choices and says
 *   how many places are left, and reloads after a 409;
 * - lookups with a second value (`verify`), the record's progress, lines and
 *   note, a list of the visitor's records, and Refresh;
 * - a payment step after sending (UPI, online checkout, instructions) with
 *   "I’ve paid — check status";
 * - step-by-step forms (`data-flow`): a step indicator, "Is this you?" with
 *   initials and totals, screens for unknown and paused accounts and for no
 *   connection (with Retry), loading skeletons, a highlighted total with
 *   tiles, and a timeline of the visitor's records with relative times;
 * - character counters on long text with a limit.
 *
 * `appWidget` must stay self-contained (no imports or outer variables): its
 * source text is the published script.
 */
function appWidget() {
  type Shown = { name: string; value: string };
  type Total = Shown & {
    id?: string;
    amount?: number;
    money?: boolean;
    tone?: string;
    short?: string;
    phrase?: string;
    across?: Total;
  };
  type Entry = Shown & { type?: string; owner?: boolean };
  type Failure = Error & { field?: string; status?: number };
  type Tone = { name: string; tone: string } | null | undefined;
  type Capacity = {
    id: string;
    group: string[];
    size?: string;
    unit: string;
    message: string;
  };
  type Places = {
    id: string;
    group: string[];
    max: number;
    left: Record<string, number>;
  };
  type Payment = {
    amount?: string;
    status?: string;
    reference?: string;
    upi?: string;
    instructions?: string;
    checkout?: string;
    recordId?: string;
  };
  const NETWORK =
    "Couldn’t reach the server. Check your connection and try again.";
  const GENERIC = "Something went wrong. Please try again.";
  const MAX_QUANTITY = 99;
  const LOW = 5;

  const all = <T extends Element = HTMLElement>(
    root: ParentNode,
    sel: string,
  ) => Array.prototype.slice.call(root.querySelectorAll(sel)) as T[];
  const one = <T extends Element = HTMLElement>(
    root: ParentNode,
    sel: string,
  ) => root.querySelector(sel) as T | null;
  const make = (tag: string, className?: string, text?: string) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const safe = (value: string) => /^[\w-]+$/.test(value);
  const uuid = () =>
    window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const failure = (message: string, field?: string, status?: number) => {
    const error = new Error(message) as Failure;
    error.field = field;
    error.status = status;
    return error;
  };
  const tone = (status: Tone) =>
    status && /^[a-z]+$/.test(status.tone) ? status.tone : "neutral";
  function call(
    url: string,
    init?: RequestInit,
  ): Promise<Record<string, unknown>> {
    return fetch(url, { credentials: "omit", ...init }).then(
      (res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body: Record<string, unknown>) => {
            if (!res.ok)
              throw failure(
                typeof body.message === "string" && body.message
                  ? body.message
                  : res.status === 429
                    ? "Too many tries. Wait a minute and try again."
                    : GENERIC,
                typeof body.field === "string" ? body.field : undefined,
                res.status,
              );
            return body;
          }),
      () => {
        throw failure(NETWORK);
      },
    );
  }
  const get = (url: string) =>
    call(url, { method: "GET", headers: { accept: "application/json" } });
  function fill(list: Element | null, values: unknown) {
    if (!list) return;
    list.textContent = "";
    for (const v of Array.isArray(values) ? (values as Shown[]) : []) {
      if (!v || !v.value) continue;
      const row = make("div");
      row.appendChild(make("dt", "", v.name));
      row.appendChild(make("dd", "", v.value));
      list.appendChild(row);
    }
  }
  function date(value: string, time?: boolean) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return time
      ? `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : day;
  }
  function stamp(value: string, time?: boolean) {
    const node = make("time", "", date(value, time));
    node.setAttribute("datetime", value);
    return node;
  }
  /** Money as the collection shows it: its symbol, then the amount. */
  function money(value: number, symbol: string) {
    const whole = Math.round(value * 100) % 100 === 0;
    return `${symbol}${value.toLocaleString("en-US", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  /** "22 Aug 2026", as the rewards app writes dates. */
  function day(d: Date) {
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  /** "12 minutes ago", "yesterday", "3 days ago", then the date. */
  function ago(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const MINUTE = 60000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const elapsed = Date.now() - d.getTime();
    if (elapsed < 0) return day(d);
    if (elapsed < MINUTE) return "just now";
    if (elapsed < HOUR)
      return `${plural(Math.floor(elapsed / MINUTE), "minute", "minutes")} ago`;
    if (elapsed < DAY)
      return `${plural(Math.floor(elapsed / HOUR), "hour", "hours")} ago`;
    if (elapsed < 2 * DAY) return "yesterday";
    if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;
    return day(d);
  }
  /** "March 2025" */
  function month(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  const arr = <T>(value: unknown) =>
    Array.isArray(value) ? (value as T[]) : [];
  const str = (value: unknown) => (typeof value === "string" ? value : "");

  function enhance(root: HTMLElement) {
    if (root.hasAttribute("data-ready")) return;
    root.setAttribute("data-ready", "");
    const api = (root.getAttribute("data-app-api") || "").replace(/\/+$/, "");
    const base = `${api}/forms/${encodeURIComponent(root.getAttribute("data-form") || "")}`;
    const status = one(root, ".app-status");
    const steps = all(root, "[data-step]");
    const step = (name: string) => one(root, `[data-step="${name}"]`);
    const first = steps[0];
    const fields = step("fields") as HTMLFormElement | null;
    const menu = step("menu");
    const flowing = root.hasAttribute("data-flow");
    // Forms built from blocks (src/blocks/forms): pages inside the details
    // step, a step indicator over every step, owner-written success and
    // failure blocks with {ref}-style placeholders.
    const blocks = root.hasAttribute("data-blocks-form");
    const pages = fields ? all(fields, "[data-page]") : [];
    let page = 0;
    let order: string[] | null = null;
    try {
      const raw = JSON.parse(root.getAttribute("data-steps") || "null");
      order = Array.isArray(raw) ? (raw as string[]) : null;
    } catch {
      order = null;
    }
    /** Text with {ref}, {message}, {status} or {name}, as the owner wrote it. */
    const TOKEN = /\{(ref|message|status|name)\}/g;
    const slots: [Node, string][] = [];
    const known: Record<string, string> = {};
    if (blocks) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue || "";
        if (text.search(TOKEN) >= 0) slots.push([n, text]);
      }
    }
    function tokens(values: Record<string, string>) {
      for (const k of Object.keys(values)) known[k] = values[k];
      for (const [node, text] of slots)
        node.nodeValue = text.replace(TOKEN, (_, k: string) => known[k] || "");
    }
    tokens({});
    let identity = "";
    let key = "";
    let pending = false;
    let lastFind: [string, string] | null = null;
    let pay: { record: string; key: string } | null = null;

    const announce = (text: string) => {
      if (!status) return;
      status.textContent = "";
      window.setTimeout(() => (status.textContent = text), 50);
    };
    function show(name: string) {
      const target = step(name);
      if (!target) return;
      for (const s of steps) s.hidden = s !== target;
      if (target === fields && pages.length) return showPage(0);
      focusIn(target);
      progress(name);
    }
    /** A step's title, or (block forms) a screen's heading, or its first input. */
    function focusIn(target: HTMLElement) {
      const heading =
        blocks && target.tagName !== "FORM" && !target.hasAttribute("data-page")
          ? one(target, "h1, h2, h3, h4, h5, h6")
          : null;
      if (heading && !heading.hasAttribute("tabindex"))
        heading.setAttribute("tabindex", "-1");
      const focus =
        one(target, ".app-step-title, .app-done-text") ||
        heading ||
        one(
          target,
          "input:not([type=hidden]):not([name=website]), select, textarea",
        );
      if (focus) focus.focus();
    }
    /** A page of the details step (block forms with several "Questions" steps). */
    function showPage(n: number) {
      page = Math.max(0, Math.min(pages.length - 1, n));
      pages.forEach((p, i) => (p.hidden = i !== page));
      focusIn(pages[page]);
      progress("fields");
    }
    /** The step indicator: which of identify, confirm and details is current. */
    function progress(name: string) {
      const wizard = one(root, ".app-wizard");
      if (!wizard) return;
      const current =
        name === "fields" || name === "menu"
          ? pages.length
            ? `page-${page}`
            : "fields"
          : name;
      const at = order
        ? order.indexOf(current) + 1
        : name === "identify"
          ? 1
          : name === "confirm"
            ? 2
            : name === "fields" || name === "menu"
              ? 3
              : 0;
      wizard.hidden = !at;
      for (const s of all(wizard, "[data-wizard]")) {
        const n = Number(s.getAttribute("data-wizard"));
        s.setAttribute(
          "data-state",
          n < at ? "done" : n === at ? "active" : "todo",
        );
        if (n === at) s.setAttribute("aria-current", "step");
        else s.removeAttribute("aria-current");
      }
      for (const bar of all(wizard, "[data-wizard-bar]"))
        bar.setAttribute(
          "data-state",
          Number(bar.getAttribute("data-wizard-bar")) <= at ? "done" : "todo",
        );
    }
    function clear(scope: Element) {
      for (const e of all(
        scope,
        ".app-field-error, .app-error, .app-offline",
      )) {
        if (!e.classList.contains("app-offline")) e.textContent = "";
        e.hidden = true;
      }
      for (const i of all(scope, "[aria-invalid]"))
        i.removeAttribute("aria-invalid");
      for (const box of all(root, "[data-form-error]")) box.hidden = true;
    }
    function report(scope: Element, error: Failure) {
      const message = error.message || GENERIC;
      const input =
        error.field && safe(error.field)
          ? one<HTMLElement>(
              root,
              `[name="${error.field}"], [data-field="${error.field}"]`,
            )
          : null;
      const slot = input
        ? (input.getAttribute("aria-describedby") || "")
            .split(/\s+/)
            .map((id) => (id ? document.getElementById(id) : null))
            .find((el) => !!el && el.classList.contains("app-field-error")) ||
          null
        : null;
      if (input && slot) {
        // A problem with something on another step (e.g. the menu) shows there.
        const owner = input.closest("[data-step]") as HTMLElement | null;
        if (owner && owner.hidden) show(owner.getAttribute("data-step") || "");
        const pane = input.closest("[data-page]") as HTMLElement | null;
        if (pane && pane.hidden) showPage(pages.indexOf(pane));
        input.setAttribute("aria-invalid", "true");
        slot.textContent = message;
        slot.hidden = false;
        input.focus();
        announce(message);
        return;
      }
      // An owner's "when sending fails" blocks, in this step or the form.
      const box =
        one(scope, "[data-form-error]") ||
        (one(scope, ".app-error") ? null : one(root, "[data-form-error]"));
      if (box) {
        tokens({ message });
        box.hidden = false;
        announce(message);
        return;
      }
      const line = one(scope, ".app-error");
      if (line) {
        line.textContent = message;
        line.hidden = false;
      }
    }
    function busy(scope: Element, on: boolean) {
      pending = on;
      scope.setAttribute("aria-busy", on ? "true" : "false");
      const button = one<HTMLButtonElement>(scope, "button[type=submit]");
      if (button) {
        button.disabled = on;
        button.classList.toggle("is-busy", on);
      }
    }
    const nameOf = (input: Element) => {
      const label = one(root, `label[for="${input.id}"]`);
      return (
        input.getAttribute("data-label") ||
        label?.childNodes[0]?.textContent ||
        "this"
      )
        .trim()
        .toLowerCase();
    };
    /** Native checks first (required, number ranges, email), shown like server errors. */
    function invalid(form: Element) {
      for (const input of all<HTMLInputElement>(
        form,
        "input, select, textarea",
      )) {
        if (input.name === "website" || input.disabled) continue;
        const typed = input.value.trim();
        // Step-by-step forms: Indian mobiles, typed money and text lengths.
        if (input.hasAttribute("data-mobile")) {
          if (mobile(typed).length !== 10)
            return failure("Enter your 10-digit mobile number", input.name);
          continue;
        }
        if (input.hasAttribute("data-money") && (typed || input.required)) {
          const cleaned = typed.replace(/[,\s]/g, "").replace(/^\D+/, "");
          const n = Number(cleaned);
          if (!/^\d+(\.\d{1,2})?$/.test(cleaned))
            return failure(`Enter the ${nameOf(input)}.`, input.name);
          const low = input.getAttribute("data-min");
          const high = input.getAttribute("data-max");
          if (low && n < Number(low))
            return failure(
              `Enter at least ${Number(low).toLocaleString("en-IN")}.`,
              input.name,
            );
          if (high && n > Number(high))
            return failure(
              `Enter at most ${Number(high).toLocaleString("en-IN")}.`,
              input.name,
            );
          continue;
        }
        const least = Number(input.getAttribute("data-minlength")) || 0;
        if (least && typed && typed.length < least) {
          const most = input.maxLength > 0 ? input.maxLength : 0;
          return failure(
            most && most < 2000
              ? `Use ${least} to ${most} characters.`
              : `Use at least ${least} characters.`,
            input.name,
          );
        }
        if (input.type === "radio") {
          if (
            input.required &&
            !one(form, `[name="${input.name}"]:checked`) &&
            safe(input.name)
          )
            return failure(`Choose ${nameOf(input)}.`, input.name);
          continue;
        }
        if (input.type !== "checkbox" && input.required && !input.value.trim())
          return failure(
            `${input.tagName === "SELECT" ? "Choose" : "Add"} ${nameOf(input)}.`,
            input.name,
          );
        if (!input.checkValidity())
          return failure(
            input.validationMessage || "Check this value.",
            input.name,
          );
      }
      return null;
    }
    const value = (form: Element, name: string) =>
      (one<HTMLInputElement>(form, `[name="${name}"]`)?.value || "").trim();
    function find(text: string, verify?: string) {
      return get(
        `${base}/find?value=${encodeURIComponent(text)}${verify ? `&verify=${encodeURIComponent(verify)}` : ""}`,
      );
    }
    function guard(form: HTMLFormElement, run: () => Promise<unknown>) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (pending) return;
        clear(form);
        // A page of questions before the last: check it, then the next page.
        if (form === fields && page < pages.length - 1) {
          const early = invalid(pages[page]);
          if (early) return report(form, early);
          return showPage(page + 1);
        }
        const problem = invalid(form);
        if (problem) return report(form, problem);
        busy(form, true);
        run()
          .catch((error: Failure) => fail(form, error))
          .then(() => busy(form, false));
      });
    }
    /**
     * Step-by-step forms answer an unknown or paused account and a lost
     * connection with their own screens; everything else shows inline.
     */
    function fail(form: HTMLFormElement, error: Failure) {
      const name = form.getAttribute("data-step");
      if (flowing && (name === "identify" || name === "lookup")) {
        const screen =
          error.status === 404
            ? step("notfound")
            : error.status === 403
              ? step("paused")
              : null;
        if (screen) {
          const line = one(screen, "[data-fallback]");
          if (line) line.textContent = error.message || "";
          show(screen.getAttribute("data-step") || "");
          return;
        }
        if (!error.status) {
          if (step("offline")) return show("offline");
          const box = one(form, ".app-offline");
          if (box) {
            box.hidden = false;
            const retry = one(box, "[data-action=retry]");
            if (retry) retry.focus();
            return announce(box.textContent || "");
          }
        }
        if (form.hidden) show(name);
      }
      report(form, error);
    }
    /** Ten digits from "+91 98400-12210" or "098400 12210". */
    function mobile(typed: string) {
      const digits = typed.replace(/\D/g, "");
      if (digits.length === 12 && digits.indexOf("91") === 0)
        return digits.slice(2);
      if (digits.length === 11 && digits[0] === "0") return digits.slice(1);
      return digits;
    }
    /** "0 / 500" under long text with a limit. */
    function counters() {
      for (const c of all(root, ".app-counter[data-counter]")) {
        const input = document.getElementById(
          c.getAttribute("data-counter") || "",
        ) as HTMLTextAreaElement | null;
        c.textContent = `${input ? input.value.length : 0} / ${c.getAttribute("data-max") || ""}`;
      }
    }
    root.addEventListener("input", (event) => {
      const target = event.target as Element | null;
      if (target && target.tagName === "TEXTAREA") counters();
    });
    counters();
    /** A copy of an icon the section rendered for the script to use. */
    function iconOf(name: string) {
      const svg = one(root, `.app-icons [data-icon="${name}"] svg`);
      return svg ? svg.cloneNode(true) : null;
    }
    function setText(scope: ParentNode, sel: string, value: string) {
      const node = one(scope, sel);
      if (node) node.textContent = value;
      return node;
    }
    /** A status badge; waiting ones get a dot. */
    function badge(className: string, label: string, t: string) {
      const node = make("span", `app-pill ${className} tone-${t}`);
      if (t === "waiting") node.appendChild(make("span", "app-dot"));
      node.appendChild(document.createTextNode(label));
      return node;
    }

    // ── The cart ("items" fields) ──────────────────────────────────────────
    const pickers = all(root, "[data-picker]");
    const carts: Record<string, Record<string, number>> = {};
    const symbol = (picker: Element) =>
      picker.getAttribute("data-currency") || "";
    const itemsOf = (picker: Element) =>
      all(picker, ".app-menu-item[data-slug]");
    function cartTotals() {
      let count = 0;
      let cents = 0;
      for (const picker of pickers) {
        const cart = carts[picker.getAttribute("data-picker") || ""] || {};
        for (const item of itemsOf(picker)) {
          const n = cart[item.getAttribute("data-slug") || ""] || 0;
          count += n;
          cents +=
            Math.round(Number(item.getAttribute("data-price")) * 100) * n;
        }
      }
      return {
        count,
        total: money(cents / 100, pickers[0] ? symbol(pickers[0]) : ""),
      };
    }
    function renderCart() {
      const { count, total } = cartTotals();
      const bar = one(root, ".app-cartbar");
      const required = pickers.some((p) => p.hasAttribute("data-required"));
      if (bar) {
        bar.hidden = !count && required;
        const label = one(bar, ".app-cartbar-count");
        if (label)
          label.textContent = count
            ? plural(count, "item", "items")
            : "Nothing added";
        const sum = one(bar, ".app-cartbar-total");
        if (sum) sum.textContent = count ? total : "";
      }
      const lines = one(root, ".app-cart-lines");
      if (lines) {
        lines.textContent = "";
        for (const picker of pickers) {
          const field = picker.getAttribute("data-picker") || "";
          const cart = carts[field] || {};
          for (const item of itemsOf(picker)) {
            const slug = item.getAttribute("data-slug") || "";
            const n = cart[slug] || 0;
            if (!n) continue;
            const title = item.getAttribute("data-title") || "";
            const line = make("li", "app-cart-line");
            line.setAttribute("data-field", field);
            line.setAttribute("data-slug", slug);
            line.appendChild(make("span", "app-cart-name", title));
            const stepper = make("div", "app-stepper");
            const less = make("button", "", "−");
            less.setAttribute("type", "button");
            less.setAttribute("data-action", "less");
            less.setAttribute("aria-label", `Remove one ${title}`);
            const more = make("button", "", "+");
            more.setAttribute("type", "button");
            more.setAttribute("data-action", "more");
            more.setAttribute("aria-label", `Add one more ${title}`);
            stepper.appendChild(less);
            stepper.appendChild(make("span", "app-count", String(n)));
            stepper.appendChild(more);
            line.appendChild(stepper);
            const price = Number(item.getAttribute("data-price")) || 0;
            line.appendChild(
              make(
                "strong",
                "app-cart-price",
                money(price * n, symbol(picker)),
              ),
            );
            lines.appendChild(line);
          }
        }
        const empty = one(root, ".app-cart-empty");
        if (empty) empty.hidden = count > 0;
      }
      const sum = one(root, ".app-cart-sum");
      if (sum) sum.textContent = total;
    }
    function setQuantity(field: string, slug: string, n: number) {
      if (!safe(field) || !safe(slug)) return;
      const quantity = Math.max(0, Math.min(MAX_QUANTITY, n));
      const cart = (carts[field] = carts[field] || {});
      if (quantity) cart[slug] = quantity;
      else delete cart[slug];
      for (const item of all(
        root,
        `[data-picker="${field}"] [data-slug="${slug}"]`,
      )) {
        item.classList.toggle("is-added", quantity > 0);
        const add = one(item, ".app-add");
        const stepper = one(item, ".app-stepper");
        const count = one(item, ".app-count");
        if (add) add.hidden = quantity > 0;
        if (stepper) stepper.hidden = quantity === 0;
        if (count) count.textContent = String(quantity);
      }
      renderCart();
    }
    function quantityChange(button: Element, by: number) {
      const holder = button.closest("[data-slug]");
      const picker = button.closest("[data-picker]");
      const field =
        (picker && picker.getAttribute("data-picker")) ||
        (holder && holder.getAttribute("data-field")) ||
        "";
      const slug = (holder && holder.getAttribute("data-slug")) || "";
      const was = (carts[field] || {})[slug] || 0;
      setQuantity(field, slug, by ? was + by : 0);
      // Keep focus on the item when its Add button or stepper disappears.
      const now = (carts[field] || {})[slug] || 0;
      if (holder && root.contains(holder)) {
        const target =
          now > 0
            ? one(holder, by > 0 ? "[data-action=more]" : "[data-action=less]")
            : one(holder, ".app-add");
        if (target) target.focus();
      } else {
        const cart = one(root, ".app-cart");
        if (cart) cart.focus();
      }
      announce(now ? `${now} in your order.` : "Removed from your order.");
    }
    function resetCart() {
      for (const field of Object.keys(carts))
        for (const slug of Object.keys(carts[field]))
          setQuantity(field, slug, 0);
      renderCart();
    }
    function emptyCart() {
      for (const picker of pickers) {
        const field = picker.getAttribute("data-picker") || "";
        const cart = carts[field] || {};
        if (picker.hasAttribute("data-required") && !Object.keys(cart).length)
          return failure("Add at least one item.", field);
      }
      return null;
    }
    if (pickers.length) renderCart();

    // ── Places that run out ────────────────────────────────────────────────
    let capacities: Capacity[] = [];
    try {
      const raw = JSON.parse(root.getAttribute("data-capacity") || "[]");
      capacities = Array.isArray(raw) ? (raw as Capacity[]) : [];
    } catch {
      capacities = [];
    }
    let places: Places[] = [];
    const current = (name: string) => {
      if (!fields || !safe(name)) return "";
      const checked = one<HTMLInputElement>(fields, `[name="${name}"]:checked`);
      if (checked) return checked.value;
      const input = one<HTMLInputElement>(fields, `[name="${name}"]`);
      return input && input.type !== "radio" ? input.value.trim() : "";
    };
    function mark(option: HTMLElement, left: number | null, item: boolean) {
      const isOption = option.tagName === "OPTION";
      const input = (
        isOption ? option : one(option, "input")
      ) as HTMLInputElement | null;
      if (isOption && !option.hasAttribute("data-text"))
        option.setAttribute("data-text", option.textContent || "");
      const full = left !== null && left <= 0;
      const low = left !== null && left > 0 && left <= LOW;
      const note = full
        ? item
          ? "Sold out"
          : "Full"
        : low
          ? `Only ${left} left`
          : "";
      if (input) input.disabled = full;
      if (isOption)
        option.textContent = `${option.getAttribute("data-text") || ""}${note ? ` — ${note}` : ""}`;
      else {
        option.classList.toggle("is-full", full);
        const tag = one(option, ".app-left");
        if (tag) {
          tag.textContent = note;
          tag.hidden = !note;
        }
      }
    }
    function applyPlaces() {
      if (!fields) return;
      const line = one(fields, ".app-places");
      const messages: string[] = [];
      for (const cap of capacities) {
        const data = places.find((p) => p.id === cap.id);
        if (!data) continue;
        const values = cap.group.map(current);
        const leftFor = (key: string) =>
          typeof data.left[key] === "number" ? data.left[key] : data.max;
        cap.group.forEach((name, index) => {
          if (!safe(name)) return;
          const others = values.every((v, i) => i === index || v);
          const options = [
            ...all<HTMLOptionElement>(
              fields,
              `select[name="${name}"] option`,
            ).filter((o) => o.value),
            ...all(fields, `input[type=radio][name="${name}"]`).map(
              (r) => (r.closest(".app-choice") as HTMLElement | null) || r,
            ),
          ];
          const item = !!one(fields, `[name="${name}"][data-item]`);
          for (const option of options) {
            const own =
              option.tagName === "OPTION"
                ? (option as HTMLOptionElement).value
                : one<HTMLInputElement>(option, "input")?.value || "";
            mark(
              option,
              others
                ? leftFor(
                    values.map((v, i) => (i === index ? own : v)).join("|"),
                  )
                : null,
              item,
            );
          }
        });
        if (values.every(Boolean)) {
          const left = leftFor(values.join("|"));
          const need = cap.size ? Number(current(cap.size)) || 1 : 1;
          messages.push(
            left <= 0
              ? cap.message || "That’s fully booked."
              : left < need
                ? `Only ${plural(left, cap.unit === "places" ? "place" : cap.unit, cap.unit)} left.`
                : cap.unit === "places"
                  ? `${plural(left, "place", "places")} left.`
                  : `Room for ${left} more ${cap.unit}.`,
          );
        }
      }
      if (line) {
        line.textContent = messages.join(" ");
        line.hidden = !messages.length;
      }
    }
    function loadPlaces() {
      if (!capacities.length) return Promise.resolve();
      return get(`${base}/availability`).then(
        (body) => {
          places = Array.isArray(body.capacities)
            ? (body.capacities as Places[])
            : [];
          applyPlaces();
        },
        () => undefined,
      );
    }
    if (fields && capacities.length) {
      fields.addEventListener("change", applyPlaces);
      fields.addEventListener("input", applyPlaces);
      void loadPlaces();
    }

    // ── Steps ──────────────────────────────────────────────────────────────
    const identify = step("identify") as HTMLFormElement | null;
    if (identify)
      guard(identify, () => {
        const typed = value(identify, "identity");
        return find(typed).then((found) => {
          fill(one(root, ".app-match"), found.fields);
          identity = typed;
          key = "";
          const shown = Array.isArray(found.fields)
            ? (found.fields as Shown[]).find((f) => f && f.value)
            : undefined;
          const title =
            (flowing && str(found.title)) || (shown ? shown.value : "");
          for (const who of all(root, ".app-who-name")) who.textContent = title;
          tokens({ name: title });
          if (flowing) {
            const meta = arr<Shown>(found.fields)
              .filter((f) => f && f.value && f.value !== title)
              .map((f) => f.value)
              .join(" · ");
            const detail = arr<Total>(found.totals)
              .filter((t) => t && (t.phrase || t.value))
              .map((t) => t.phrase || `${t.value} ${t.name.toLowerCase()}`)
              .join(" · ");
            setText(root, ".app-identity .app-avatar", str(found.initials));
            setText(root, ".app-identity-name", title);
            setText(root, ".app-identity-meta", meta);
            const line = setText(root, ".app-identity-detail", detail);
            if (line) line.hidden = !detail;
            for (const who of all(root, ".app-who-meta"))
              who.textContent = meta ? ` · ${meta}` : "";
          }
          show("confirm");
        });
      });

    const payStep = step("pay");
    function paid(on: boolean, text: string) {
      if (!payStep) return;
      const state = one(payStep, ".app-pay-state");
      if (state) {
        state.textContent = text;
        state.className = `app-pay-state ${on ? "is-paid" : text ? "is-waiting" : ""}`;
      }
      const options = one(payStep, ".app-pay-options");
      if (options) options.hidden = on;
      const check = one(payStep, ".app-pay-check");
      if (check) check.hidden = on;
    }
    function showPayment(payment: Payment, ref: string, message: string) {
      if (!payStep) return false;
      const set = (sel: string, text: string) => {
        const node = one(payStep, sel);
        if (node) {
          node.textContent = text;
          node.hidden = !text;
        }
        return node;
      };
      set(".app-pay-message", message);
      set(".app-pay-amount", payment.amount || "");
      set(".app-pay-reference", payment.reference || ref);
      const upi = one<HTMLAnchorElement>(payStep, ".app-pay-upi");
      const upiLink =
        typeof payment.upi === "string" && /^upi:\/\/pay\?/i.test(payment.upi)
          ? payment.upi
          : "";
      const phone =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      if (upi) {
        if (upiLink) upi.setAttribute("href", upiLink);
        upi.hidden = !upiLink;
      }
      const desktop = one(payStep, ".app-pay-desktop");
      const upiId = upiLink
        ? new URLSearchParams(upiLink.slice(upiLink.indexOf("?") + 1)).get(
            "pa",
          ) || ""
        : "";
      if (desktop) desktop.hidden = !upiId || phone;
      set(".app-pay-upi-id", upiId);
      const online = one<HTMLAnchorElement>(payStep, ".app-pay-online");
      const checkout =
        typeof payment.checkout === "string" &&
        /^https:\/\//i.test(payment.checkout)
          ? payment.checkout
          : "";
      if (online) {
        if (checkout) online.setAttribute("href", checkout);
        online.hidden = !checkout;
      }
      set(".app-pay-instructions", payment.instructions || "");
      paid(false, "");
      show("pay");
      if (payment.status === "paid") paid(true, "Payment received. Thank you!");
      return true;
    }

    if (fields)
      guard(fields, () => {
        const problem = emptyCart();
        if (problem) return Promise.reject(problem);
        const values: Record<string, string | Record<string, number>> = {};
        for (const input of all<HTMLInputElement>(
          fields,
          "input[name], select[name], textarea[name]",
        )) {
          if (input.name === "website") continue;
          if (input.type === "radio") {
            if (input.checked) values[input.name] = input.value;
            else if (!(input.name in values)) values[input.name] = "";
            continue;
          }
          values[input.name] =
            input.type === "checkbox"
              ? String(input.checked)
              : input.value.trim();
        }
        for (const picker of pickers) {
          const field = picker.getAttribute("data-picker") || "";
          values[field] = { ...(carts[field] || {}) };
        }
        key = key || uuid();
        const body: Record<string, unknown> = {
          values,
          key,
          website: value(fields, "website"),
        };
        if (identity) body.identity = identity;
        return call(base, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(body),
        }).then(
          (result) => {
            const ref = typeof result.ref === "string" ? result.ref : "";
            const message =
              typeof result.message === "string" && result.message
                ? result.message
                : `Thanks — we’ve received it.${ref ? ` Your reference is ${ref}.` : ""}`;
            const text = one(root, ".app-done-text");
            if (text) {
              // The reference stands out, as on a receipt.
              text.textContent = "";
              const at = ref ? message.indexOf(ref) : -1;
              if (at < 0) text.textContent = message;
              else {
                text.appendChild(document.createTextNode(message.slice(0, at)));
                text.appendChild(make("span", "app-mono", ref));
                text.appendChild(
                  document.createTextNode(message.slice(at + ref.length)),
                );
              }
            }
            const state = result.status as Tone;
            tokens({ ref, message, status: state ? state.name : "" });
            const slot = one(root, ".app-done-badge");
            const label =
              (slot && slot.getAttribute("data-badge")) ||
              (state ? state.name : "");
            if (slot) {
              slot.textContent = "";
              const made = badge("app-done-badge", label, tone(state));
              while (made.firstChild) slot.appendChild(made.firstChild);
              slot.className = made.className;
              slot.hidden = !label;
            }
            const payment =
              result.payment && typeof result.payment === "object"
                ? (result.payment as Payment)
                : null;
            pay =
              payment && payment.recordId
                ? { record: payment.recordId, key }
                : null;
            fields.reset();
            counters();
            resetCart();
            key = "";
            if (!payment || !showPayment(payment, ref, message)) show("done");
            void loadPlaces();
          },
          (error: Failure) => {
            // The server answered, so nothing was added: the next try is a new attempt.
            if (error.status) key = "";
            // Someone took the last place: show what's left now.
            if (error.status === 409) void loadPlaces();
            throw error;
          },
        );
      });

    const lookup = step("lookup") as HTMLFormElement | null;
    function showFound(found: Record<string, unknown>) {
      const result = step("result");
      if (!result) return;
      const title = flowing ? null : one(result, ".app-step-title");
      const ref = typeof found.ref === "string" ? found.ref : "";
      if (title)
        title.textContent = `${title.getAttribute("data-label") || ""}${ref ? ` ${ref}` : ""}`;
      const pill = one(result, ".app-result-status");
      const state = found.status as Tone;
      if (pill) {
        pill.textContent = state ? state.name : "";
        pill.className = `app-pill app-result-status tone-${tone(state)}`;
        pill.hidden = !state;
      }
      const note = one(result, ".app-result-note");
      if (note) {
        note.textContent = typeof found.note === "string" ? found.note : "";
        note.className = `app-result-note tone-${tone(state)}`;
        note.hidden = !note.textContent;
      }
      const progress = one(result, ".app-steps");
      const stepsDone = Array.isArray(found.steps)
        ? (found.steps as { name?: string; at?: string; note?: string }[])
        : [];
      if (progress) {
        progress.textContent = "";
        stepsDone.forEach((s, index) => {
          const last = index === stepsDone.length - 1;
          const item = make("li", `app-progress${last ? " is-current" : ""}`);
          if (last) item.setAttribute("aria-current", "step");
          item.appendChild(make("span", "app-progress-dot"));
          const copy = make("div", "app-progress-copy");
          copy.appendChild(make("strong", "", s.name || ""));
          if (s.at) copy.appendChild(stamp(s.at, true));
          if (s.note) copy.appendChild(make("p", "", s.note));
          item.appendChild(copy);
          progress.appendChild(item);
        });
        progress.hidden = !stepsDone.length;
      }
      const lines = one(result, ".app-lines");
      const ordered = Array.isArray(found.lines)
        ? (found.lines as {
            title?: string;
            quantity?: number;
            price?: string;
          }[])
        : [];
      if (lines) {
        lines.textContent = "";
        for (const l of ordered) {
          const row = make("li");
          row.appendChild(
            make("span", "", `${Number(l.quantity) || 1} × ${l.title || ""}`),
          );
          if (l.price) row.appendChild(make("strong", "", l.price));
          lines.appendChild(row);
        }
        const box = lines.closest(".app-lines-box") as HTMLElement | null;
        if (box) box.hidden = !ordered.length;
      }
      fill(one(result, ".app-record-fields"), found.fields);
      const totals = one(result, ".app-totals");
      if (totals) {
        totals.textContent = "";
        for (const t of Array.isArray(found.totals)
          ? (found.totals as Shown[])
          : []) {
          const card = make("div", "app-total");
          card.appendChild(make("strong", "app-total-value", t.value));
          card.appendChild(make("span", "app-total-name", t.name));
          totals.appendChild(card);
        }
        totals.hidden = !totals.childElementCount;
      }
      const timeline = one(result, ".app-timeline");
      const history = Array.isArray(found.history)
        ? (found.history as {
            ref?: string;
            status?: Tone;
            note?: string;
            createdAt?: string;
            fields?: Shown[];
          }[])
        : [];
      if (flowing) showPerson(result, found);
      if (timeline && flowing) {
        timeline.textContent = "";
        for (const h of history) timeline.appendChild(entry(h));
      } else if (timeline) {
        timeline.textContent = "";
        for (const h of history) {
          const t = tone(h.status);
          const item = make("li", `app-entry tone-${t}`);
          const head = make("div", "app-entry-head");
          if (h.status)
            head.appendChild(make("span", `app-pill tone-${t}`, h.status.name));
          if (h.ref) head.appendChild(make("span", "app-entry-ref", h.ref));
          if (h.createdAt) head.appendChild(stamp(h.createdAt));
          item.appendChild(head);
          const list = make("dl");
          fill(list, h.fields);
          if (list.childElementCount) item.appendChild(list);
          if (h.note) item.appendChild(make("p", "app-entry-note", h.note));
          timeline.appendChild(item);
        }
      }
      const empty = one(result, ".app-history-empty");
      if (empty) empty.hidden = history.length > 0;
    }
    /** The rewards page: who it is, the highlighted total, tiles. */
    function showPerson(result: Element, found: Record<string, unknown>) {
      const name = str(found.title);
      const typed = str(found.key);
      setText(result, ".app-person-name", name);
      setText(result, ".app-person .app-avatar", str(found.initials));
      const meta = one(result, ".app-person-meta");
      if (meta) {
        const since = str(found.since)
          ? `${meta.getAttribute("data-since") || ""} ${month(str(found.since))}`
          : "";
        meta.textContent = [typed, since].filter(Boolean).join(" · ");
      }
      fill(
        one(result, ".app-record-fields"),
        arr<Shown>(found.fields).filter(
          (f) => f && f.value !== name && f.value !== typed,
        ),
      );
      const panel = one(result, ".app-panel");
      const lit =
        found.highlight && typeof found.highlight === "object"
          ? (found.highlight as Total)
          : null;
      if (panel) {
        panel.hidden = !lit;
        setText(panel, ".app-panel-label", lit ? lit.name : "");
        setText(panel, ".app-panel-value", lit ? lit.value : "");
        const across = lit && lit.across ? lit.across.phrase || "" : "";
        const line = setText(
          panel,
          ".app-panel-meta",
          across ? `Across ${across}` : "",
        );
        if (line) line.hidden = !across;
      }
      const tiles = one(result, ".app-tiles");
      if (tiles) {
        tiles.textContent = "";
        for (const t of arr<Total>(found.totals)) {
          if (!t) continue;
          const kind = t.money
            ? "brand"
            : t.tone === "good"
              ? "good"
              : t.tone === "waiting"
                ? "waiting"
                : t.tone === "bad"
                  ? "bad"
                  : "brand";
          const tile = make("div", `app-tile tone-${kind}`);
          const top = make("div", "app-tile-top");
          const icon = make("span", "app-tile-icon");
          icon.setAttribute("aria-hidden", "true");
          const svg = iconOf(
            t.money
              ? "receipt"
              : kind === "good"
                ? "checkCircle"
                : kind === "waiting"
                  ? "clock"
                  : kind === "bad"
                    ? "xCircle"
                    : "chart",
          );
          if (svg) icon.appendChild(svg);
          top.appendChild(icon);
          top.appendChild(make("p", "app-tile-label", t.name));
          tile.appendChild(top);
          tile.appendChild(make("p", "app-tile-value", t.short || t.value));
          tiles.appendChild(tile);
        }
        tiles.hidden = !tiles.childElementCount;
      }
    }
    /** One of the visitor's records on the timeline, as the rewards app shows it. */
    function entry(h: {
      ref?: string;
      status?: Tone;
      note?: string;
      createdAt?: string;
      at?: string;
      fields?: Entry[];
    }) {
      const t = tone(h.status);
      const item = make("li", `app-tl-item tone-${t}`);
      const dot = make("span", "app-tl-dot");
      dot.setAttribute("aria-hidden", "true");
      const svg = iconOf(t === "good" ? "check" : t === "bad" ? "x" : "clock");
      if (svg) dot.appendChild(svg);
      item.appendChild(dot);
      const body = make("div", "app-tl-body");
      const top = make("div", "app-tl-top");
      if (h.ref) top.appendChild(make("span", "app-mono", h.ref));
      const values = arr<Entry>(h.fields).filter((f) => f && f.value);
      const used: Entry[] = [];
      const amount = values.find((f) => f.type === "money" && !f.owner);
      if (amount) {
        used.push(amount);
        top.appendChild(make("span", "app-amount", amount.value));
      }
      if (h.status) top.appendChild(badge("", h.status.name, t));
      const reward = values.find(
        (f) => f.owner && (f.type === "money" || f.type === "number"),
      );
      if (reward) {
        used.push(reward);
        // A reward counts once it's approved.
        if (t === "good")
          top.appendChild(
            make("span", "app-amount is-positive", `+${reward.value}`),
          );
      }
      body.appendChild(top);
      const said = values.find(
        (f) =>
          used.indexOf(f) < 0 && (f.type === "longText" || f.type === "text"),
      );
      if (said) {
        used.push(said);
        body.appendChild(make("p", "app-tl-text", said.value));
      }
      const others = make("dl");
      fill(
        others,
        values.filter((f) => used.indexOf(f) < 0),
      );
      if (others.childElementCount) body.appendChild(others);
      if (h.note && t !== "bad")
        body.appendChild(make("p", "app-tl-text", h.note));
      const meta =
        t === "bad" && h.note
          ? `Reason: ${h.note}`
          : h.at && h.status
            ? `${h.status.name} ${ago(h.at)}`
            : h.createdAt
              ? `Recorded ${ago(h.createdAt)}`
              : "";
      if (meta) body.appendChild(make("p", "app-tl-meta", meta));
      item.appendChild(body);
      return item;
    }
    if (lookup)
      guard(lookup, () => {
        const typed: [string, string] = [
          value(lookup, "value"),
          value(lookup, "verify"),
        ];
        if (flowing) show("loading");
        return find(typed[0], typed[1]).then((found) => {
          lastFind = typed;
          tokens({
            name: str(found.title),
            ref: str(found.ref),
            status: found.status ? (found.status as { name: string }).name : "",
          });
          showFound(found);
          show("result");
        });
      });

    function refresh(button: HTMLButtonElement) {
      if (!lastFind || pending) return;
      pending = true;
      button.disabled = true;
      find(lastFind[0], lastFind[1])
        .then(
          (found) => {
            showFound(found);
            announce("Updated.");
          },
          (error: Failure) => announce(error.message || GENERIC),
        )
        .then(() => {
          pending = false;
          button.disabled = false;
        });
    }
    function checkPayment(button: HTMLButtonElement) {
      if (!pay || pending) return;
      pending = true;
      button.disabled = true;
      button.classList.add("is-busy");
      get(
        `${api}/records/${encodeURIComponent(pay.record)}/pay?key=${encodeURIComponent(pay.key)}`,
      )
        .then(
          (body) => {
            const payment = (
              body.payment && typeof body.payment === "object"
                ? body.payment
                : body
            ) as Payment;
            if (payment.status === "paid")
              paid(true, "Payment received. Thank you!");
            else
              paid(
                false,
                "We haven’t received it yet. If you’ve just paid, wait a minute and check again.",
              );
          },
          (error: Failure) => paid(false, error.message || GENERIC),
        )
        .then(() => {
          pending = false;
          button.disabled = false;
          button.classList.remove("is-busy");
          const state = payStep && one(payStep, ".app-pay-state");
          if (state && state.textContent) announce(state.textContent);
        });
    }
    function startOver(action: string) {
      // Recording another purchase keeps who it's for.
      if (action === "again" && flowing && identity && fields) {
        key = "";
        fields.reset();
        clear(fields);
        counters();
        show("fields");
        return;
      }
      identity = "";
      key = "";
      pay = null;
      for (const s of steps) clear(s);
      if (action === "again") {
        for (const s of steps) if (s instanceof HTMLFormElement) s.reset();
        counters();
        resetCart();
        applyPlaces();
      }
      if (first) show(first.getAttribute("data-step") || "");
      const input =
        first &&
        one<HTMLInputElement>(first, "input[name=identity], input[name=value]");
      if (input && action === "change") input.select();
    }

    root.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const button =
        target && typeof target.closest === "function"
          ? (target.closest("[data-action]") as HTMLButtonElement | null)
          : null;
      if (!button || !root.contains(button) || button.disabled) return;
      const action = button.getAttribute("data-action") || "";
      if (action === "add" || action === "more") quantityChange(button, 1);
      else if (action === "less") quantityChange(button, -1);
      else if (action === "checkout") {
        const problem = emptyCart();
        if (problem) return announce(problem.message);
        if (fields) clear(fields);
        renderCart();
        show("fields");
      } else if (action === "menu") show("menu");
      else if (action === "back") {
        if (pages.length && page > 0) showPage(page - 1);
      } else if (action === "confirm") show(menu ? "menu" : "fields");
      else if (action === "refresh") refresh(button);
      else if (action === "retry") {
        // Send what they typed again.
        const again = (step("lookup") || step("identify")) as HTMLFormElement;
        if (!again) return;
        if (again.hidden) show(again.getAttribute("data-step") || "");
        again.dispatchEvent(new Event("submit", { cancelable: true }));
      } else if (action === "paid") checkPayment(button);
      else if (action === "change" || action === "again") startOver(action);
    });
  }

  function start() {
    for (const root of all(document, ".app-form[data-app-api][data-form]"))
      enhance(root);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
}

export const APP_SCRIPT = `(${appWidget.toString()})();\n`;
