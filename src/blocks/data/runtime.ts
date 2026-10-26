/**
 * The data script published pages load (appended to app.js). It fills the
 * app data blocks the publisher left as skeletons (blocks.tsx):
 * - repeat and table blocks (`[data-view]`): pages of a public view from
 *   GET {api}/views/:id, a copy of the `<template>` per row with its markers
 *   swapped for the row's values, "Load more", empty and error states;
 * - stat blocks (`[data-metric]`) and charts (`[data-chart]`): public
 *   dashboard figures from GET {api}/metrics, read once per page.
 *
 * Values go in as text (textContent / setAttribute), links and images only
 * when they're http(s) or site-relative. No eval, no inline handlers, no
 * HTML strings: it runs under `script-src 'self'`. Safe to load twice.
 * `dataWidget` must stay self-contained: its source text is the script.
 */
function dataWidget() {
  type Row = Record<string, string>;
  type ViewPage = { rows: Row[]; more: boolean };
  type Bar = { label: string; long: string; value: number; shown: string };
  type Metrics = {
    cards: { id: string; shown: string }[];
    charts: { id: string; name: string; bars: Bar[] }[];
  };
  const MARK = "https://bind.invalid/";
  const OPEN = "⟦";
  const markers = /⟦([^⟧]{1,80})⟧/g;
  const requests: Record<string, Promise<unknown>> = {};

  const all = (root: ParentNode, sel: string) =>
    Array.prototype.slice.call(root.querySelectorAll(sel)) as HTMLElement[];
  function getJson(url: string, shared: boolean) {
    if (shared && url in requests) return requests[url];
    const p = fetch(url, { credentials: "omit" }).then((r) =>
      r
        .json()
        .catch(() => ({}))
        .then((body: { message?: string }) => {
          if (!r.ok) {
            const e = new Error(
              (r.status === 429 && body && body.message) ||
                "Couldn’t load this. Check your connection and try again.",
            );
            throw e;
          }
          return body;
        }),
    );
    if (shared) {
      requests[url] = p;
      p.catch(() => delete requests[url]);
    }
    return p;
  }
  const safeHref = (v: string) =>
    /^(https?:\/\/|mailto:|tel:|\/|\.\/|#)/i.test(v) ? v : "";
  const safeSrc = (v: string) => (/^(https:\/\/|\/)/i.test(v) ? v : "");

  /** Swaps a template copy's markers for one row's values. */
  function fill(root: HTMLElement, row: Row, index: number) {
    const value = (source: string) => {
      if (source === "item:index") return String(index + 1);
      if (source.indexOf("field:") === 0) {
        const v = row[source.slice(6)];
        return typeof v === "string" ? v : "";
      }
      return "";
    };
    const swap = (text: string) =>
      text.replace(markers, (_m, source: string) => value(source));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    for (const t of texts) if (t.data.indexOf(OPEN) >= 0) t.data = swap(t.data);
    for (const el of [root].concat(all(root, "*")))
      for (const attr of ["href", "src", "alt", "title", "aria-label"]) {
        const v = el.getAttribute(attr);
        if (!v) continue;
        const at = v.indexOf(MARK);
        if (at >= 0 && (attr === "href" || attr === "src")) {
          let source = "";
          try {
            source = decodeURIComponent(v.slice(at + MARK.length));
          } catch {
            source = "";
          }
          const url =
            attr === "href" ? safeHref(value(source)) : safeSrc(value(source));
          if (url) el.setAttribute(attr, url);
          else {
            // No usable address: no link, or no image (never a request to the marker).
            el.removeAttribute(attr);
            if (attr === "src") el.hidden = true;
          }
        } else if (v.indexOf(OPEN) >= 0) el.setAttribute(attr, swap(v));
      }
  }

  function list(root: HTMLElement) {
    const api = (root.getAttribute("data-app-api") || "").replace(/\/+$/, "");
    const view = root.getAttribute("data-view") || "";
    const size = Number(root.getAttribute("data-size")) || 12;
    const paged = root.getAttribute("data-more") === "1";
    const table = root.classList.contains("blk-table");
    const body = root.querySelector(
      table ? "tbody" : ".blk-repeat-items",
    ) as HTMLElement | null;
    const template = root.querySelector(
      "template.blk-repeat-template",
    ) as HTMLTemplateElement | null;
    const empty = root.querySelector(
      table ? ".blk-table-empty" : ".blk-repeat-empty",
    ) as HTMLElement | null;
    const error = root.querySelector(".blk-data-error") as HTMLElement | null;
    const more = root.querySelector(
      ".blk-repeat-more",
    ) as HTMLButtonElement | null;
    const live = root.querySelector("[data-live]") as HTMLElement | null;
    const columns = all(root, "th[data-col]").map((th) => ({
      id: th.getAttribute("data-col") || "",
      name: th.textContent || "",
      number: th.classList.contains("is-number"),
      status: th.hasAttribute("data-status"),
    }));
    if (!api || !view || !body || (!table && !template)) return;
    let page = 0;
    let shown = 0;
    const row = (data: Row, index: number) => {
      if (table) {
        const tr = document.createElement("tr");
        for (const c of columns) {
          const td = document.createElement("td");
          td.setAttribute("data-label", c.name);
          if (c.number) td.className = "is-number";
          const text = data[c.id] || "";
          if (c.status && text) {
            const span = document.createElement("span");
            span.className = "blk-table-status";
            span.textContent = text;
            td.appendChild(span);
          } else td.textContent = text;
          tr.appendChild(td);
        }
        return tr;
      }
      const copy = template!.content.firstElementChild!.cloneNode(
        true,
      ) as HTMLElement;
      fill(copy, data, index);
      return copy;
    };
    const load = () => {
      body.setAttribute("aria-busy", "true");
      if (error) error.hidden = true;
      if (more) more.disabled = true;
      getJson(
        `${api}/views/${encodeURIComponent(view)}?page=${page}&size=${size}`,
        false,
      ).then(
        (value) => {
          const data = value as ViewPage;
          const rows = Array.isArray(data.rows) ? data.rows : [];
          if (page === 0) body.textContent = "";
          const first = body.children.length;
          rows.forEach((r, i) => body.appendChild(row(r, shown + i)));
          shown += rows.length;
          body.removeAttribute("aria-busy");
          body.hidden = shown === 0 && !table;
          if (empty) empty.hidden = shown > 0;
          if (more) {
            more.hidden = !(paged && data.more);
            more.disabled = false;
          }
          if (live)
            live.textContent =
              page === 0
                ? shown
                  ? `${shown} ${shown === 1 ? "item" : "items"} shown`
                  : "Nothing to show yet"
                : `${rows.length} more shown`;
          // After "Load more", keyboard users continue from the first new row.
          if (page > 0) {
            const next = body.children[first] as HTMLElement | undefined;
            const target =
              next && (next.querySelector("a, button") as HTMLElement | null);
            if (target) target.focus();
          }
          page += 1;
        },
        (e: Error) => {
          body.removeAttribute("aria-busy");
          if (page === 0) {
            body.textContent = "";
            body.hidden = !table;
          }
          if (more) more.disabled = false;
          if (error) {
            const text = error.querySelector("span");
            if (text && e && e.message) text.textContent = e.message;
            error.hidden = false;
          }
        },
      );
    };
    if (more) more.addEventListener("click", load);
    const retry = root.querySelector(".blk-data-retry");
    if (retry) retry.addEventListener("click", load);
    load();
  }

  function figures(root: HTMLElement) {
    const api = (root.getAttribute("data-app-api") || "").replace(/\/+$/, "");
    const card = root.getAttribute("data-metric");
    const chart = root.getAttribute("data-chart");
    const error = root.querySelector(".blk-data-error") as HTMLElement | null;
    const live = root.querySelector("[data-live]") as HTMLElement | null;
    const run = () => {
      if (error) error.hidden = true;
      getJson(`${api}/metrics`, true).then(
        (value) => {
          const data = value as Metrics;
          if (card) {
            const found = (data.cards || []).filter((c) => c.id === card)[0];
            const slot = root.querySelector(".blk-stat-value .blk-skel");
            if (slot)
              slot.replaceWith(
                document.createTextNode(found ? found.shown : "—"),
              );
            return;
          }
          const found = (data.charts || []).filter((c) => c.id === chart)[0];
          const plot = root.querySelector(
            ".blk-chart-plot",
          ) as HTMLElement | null;
          if (!plot) return;
          if (!found) {
            root.hidden = true;
            return;
          }
          draw(
            plot,
            found.bars,
            root.getAttribute("data-kind") || "bar",
            found.name,
          );
          if (live) live.textContent = `${found.name} loaded`;
        },
        () => {
          if (error) error.hidden = false;
          const slot = root.querySelector(".blk-stat-value .blk-skel");
          if (slot) slot.replaceWith(document.createTextNode("—"));
        },
      );
    };
    const retry = root.querySelector(".blk-data-retry");
    if (retry) retry.addEventListener("click", run);
    run();
  }
  /** The same markup as ChartView in blocks.tsx. */
  function draw(plot: HTMLElement, bars: Bar[], kind: string, name: string) {
    const max = Math.max(0, ...bars.map((b) => b.value));
    const h = (v: number) => (max ? Math.round((v / max) * 100) : 0);
    plot.textContent = "";
    plot.classList.remove("is-loading");
    plot.removeAttribute("aria-busy");
    plot.setAttribute("role", "img");
    plot.setAttribute(
      "aria-label",
      `${name}: ${bars.map((b) => `${b.long} ${b.shown}`).join(", ")}`,
    );
    const span = (cls: string, text = "") => {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      return s;
    };
    if (kind === "line") {
      plot.classList.add("is-line");
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      const line = document.createElementNS(ns, "polyline");
      const w = 100 / Math.max(1, bars.length - 1);
      line.setAttribute(
        "points",
        bars
          .map(
            (b, i) => `${(i * w).toFixed(2)},${(100 - h(b.value)).toFixed(2)}`,
          )
          .join(" "),
      );
      line.setAttribute("fill", "none");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(line);
      plot.appendChild(svg);
      const labels = span("blk-chart-labels");
      labels.setAttribute("aria-hidden", "true");
      for (const b of bars) labels.appendChild(span("", b.label));
      plot.appendChild(labels);
      return;
    }
    for (const b of bars) {
      const col = document.createElement("div");
      col.className = "blk-chart-col";
      col.setAttribute("aria-hidden", "true");
      col.appendChild(span("blk-chart-value", b.value ? b.shown : ""));
      const bar = span("blk-chart-bar");
      bar.style.setProperty("--h", `${h(b.value)}%`);
      col.appendChild(bar);
      col.appendChild(span("blk-chart-label", b.label));
      plot.appendChild(col);
    }
  }

  const start = () => {
    for (const root of all(document, "[data-app-api][data-view]"))
      if (!root.hasAttribute("data-ready")) {
        root.setAttribute("data-ready", "");
        list(root);
      }
    for (const root of all(
      document,
      "[data-app-api][data-metric], [data-app-api][data-chart]",
    ))
      if (!root.hasAttribute("data-ready")) {
        root.setAttribute("data-ready", "");
        figures(root);
      }
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
}

export const DATA_SCRIPT = `;(${dataWidget.toString()})();\n`;
