import type { Project } from "./model";
import { hasOrbits } from "../blocks/project";

/**
 * The few things a published page does that CSS can't: remember a visitor's
 * light/dark choice, and pause the moving "orbits" background while it's
 * offscreen or the tab is hidden. Served as part of app.js (published sites
 * only run scripts Forma writes), so it must stand alone and never throw.
 */
export const SITE_SCRIPT = `;(function () {
  var root = document.querySelector(".website");
  if (!root) return;
  var toggles = document.querySelectorAll("[data-site-theme-toggle]");
  if (root.classList.contains("site-themes")) {
    var key = "forma-theme:" + new URL(".", document.baseURI).pathname;
    var stored = null;
    try { stored = localStorage.getItem(key); } catch (e) {}
    var query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    var current = function () {
      return root.getAttribute("data-theme") || (query && query.matches ? "dark" : "light");
    };
    var sync = function () {
      var dark = current() === "dark";
      for (var i = 0; i < toggles.length; i++) {
        toggles[i].setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
        toggles[i].setAttribute("aria-pressed", String(dark));
      }
    };
    if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);
    sync();
    for (var t = 0; t < toggles.length; t++)
      toggles[t].addEventListener("click", function () {
        var next = current() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem(key, next); } catch (e) {}
        sync();
      });
    if (query && query.addEventListener) query.addEventListener("change", sync);
  }
  var scenes = document.querySelectorAll("[data-ambient]");
  for (var s = 0; s < scenes.length; s++)
    (function (scene) {
      var visible = true;
      var update = function () {
        scene.setAttribute("data-active", String(visible && !document.hidden));
      };
      if ("IntersectionObserver" in window)
        new IntersectionObserver(function (entries) {
          visible = entries[0] ? entries[0].isIntersecting : false;
          update();
        }).observe(scene);
      document.addEventListener("visibilitychange", update);
      update();
    })(scenes[s]);
})();
`;

/** A published page needs SITE_SCRIPT when visitors can switch themes or a hero moves. */
export function needsSiteScript(project: Project) {
  return (
    !!project.theme.darkToggle || hasOrbits(project)
  );
}
