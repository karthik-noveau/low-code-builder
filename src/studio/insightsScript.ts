/**
 * insights.js, loaded by published pages when tracking is on (src/studio/seo.ts).
 *
 * - Forma's own counts (data-api): one anonymous page view per load, with
 *   the page, the site that sent the visitor and the campaign (utm_*), and
 *   the screen width for the device. No cookies or stored identifiers;
 *   the API counts unique visitors from a daily hash it never keeps.
 * - The campaign a visitor arrived with is remembered for the tab and added
 *   to links into the store, so a sale there is credited to it.
 * - Google Analytics (data-ga) and the Meta Pixel (data-pixel), when the
 *   owner set them, load only after the visitor agrees if data-consent is
 *   set, and never for visitors asking not to be tracked.
 *
 * Published sites only run scripts Forma writes, so it stands alone and never throws.
 */
export const INSIGHTS_SCRIPT = `;(function () {
  try {
    var me = document.currentScript;
    if (!me) return;
    var api = me.getAttribute("data-api"), ga = me.getAttribute("data-ga"),
      pixel = me.getAttribute("data-pixel"), ask = me.getAttribute("data-consent") === "1";
    var params = new URLSearchParams(location.search);
    var utm = null;
    try { utm = JSON.parse(sessionStorage.getItem("forma-utm") || "null"); } catch (e) {}
    var landed = {
      s: params.get("utm_source") || (params.get("gclid") ? "google" : params.get("fbclid") ? "facebook" : ""),
      m: params.get("utm_medium") || (params.get("gclid") ? "cpc" : params.get("fbclid") ? "social" : ""),
      c: params.get("utm_campaign") || ""
    };
    if (landed.s) {
      utm = landed;
      try { sessionStorage.setItem("forma-utm", JSON.stringify(utm)); } catch (e) {}
    }
    if (api) {
      var path = location.pathname
        .replace(/^\\/__domains\\/[^/]+/, "")
        .replace(/^\\/sites\\/[0-9a-f-]{36}/, "")
        .replace(/^\\/releases\\/[0-9a-f-]{36}/, "")
        .replace(/\\.html$/, "")
        .replace(/\\/index$/, "/") || "/";
      var ref = "";
      try {
        var r = document.referrer ? new URL(document.referrer) : null;
        if (r && r.host !== location.host) ref = r.host.replace(/^www\\./, "");
      } catch (e) {}
      var hit = JSON.stringify({ p: path, r: ref, s: landed.s, m: landed.m, c: landed.c, w: window.innerWidth || 0 });
      if (navigator.sendBeacon) navigator.sendBeacon(api, hit);
      else fetch(api, { method: "POST", body: hit, keepalive: true }).catch(function () {});
    }
    // Store links carry the campaign the visitor came with.
    if (utm && utm.s)
      document.addEventListener("click", function (event) {
        var link = event.target && event.target.closest ? event.target.closest("a[href*='/store?site=']") : null;
        if (!link) return;
        try {
          var url = new URL(link.href);
          if (url.searchParams.has("utm_source")) return;
          url.searchParams.set("utm_source", utm.s);
          if (utm.m) url.searchParams.set("utm_medium", utm.m);
          if (utm.c) url.searchParams.set("utm_campaign", utm.c);
          link.href = url.toString();
        } catch (e) {}
      }, true);
    if (!ga && !pixel) return;
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    var load = function () {
      if (ga) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        window.gtag("config", ga);
        var g = document.createElement("script");
        g.async = true;
        g.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga);
        document.head.appendChild(g);
      }
      if (pixel && !window.fbq) {
        var fbq = window.fbq = function () {
          fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
        };
        window._fbq = fbq; fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
        var f = document.createElement("script");
        f.async = true;
        f.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(f);
        fbq("init", pixel);
        fbq("track", "PageView");
      }
    };
    var choice = null;
    try { choice = localStorage.getItem("forma-consent"); } catch (e) {}
    if (!ask || choice === "yes") return load();
    if (choice === "no") return;
    var bar = document.createElement("div");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie choice");
    bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 16px;border-radius:14px;background:#1c1c1c;color:#fff;font:14px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.25)";
    var text = document.createElement("span");
    text.style.cssText = "flex:1 1 240px";
    text.textContent = "This site uses cookies to understand visits and improve its ads. Is that OK?";
    var button = function (label, value, solid) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "border:1px solid #fff;border-radius:999px;padding:7px 14px;font:inherit;font-weight:600;cursor:pointer;" + (solid ? "background:#fff;color:#1c1c1c" : "background:transparent;color:#fff");
      b.addEventListener("click", function () {
        try { localStorage.setItem("forma-consent", value); } catch (e) {}
        bar.remove();
        if (value === "yes") load();
      });
      return b;
    };
    bar.appendChild(text);
    bar.appendChild(button("No thanks", "no", false));
    bar.appendChild(button("Accept", "yes", true));
    document.body.appendChild(bar);
  } catch (e) {}
})();
`;
