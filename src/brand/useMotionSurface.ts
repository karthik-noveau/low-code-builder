import { useEffect, useRef } from "react";

/** Content stays visible without JavaScript or motion support. */
export function useMotionSurface<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const surface = ref.current;
    if (!surface || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};
    const configure = () => {
      dispose();
      if (preference.matches || typeof IntersectionObserver === "undefined") {
        surface.dataset.motion = "reduced";
        return;
      }
      surface.dataset.motion = "ready";
      const observed = new WeakSet<Element>();
      const reveal = (element: Element) => {
        if (element instanceof HTMLElement)
          element.dataset.revealState = "visible";
      };
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        },
        { root: surface, threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
      );
      const watch = () => {
        for (const element of surface.querySelectorAll<HTMLElement>(
          "[data-reveal]",
        )) {
          if (observed.has(element)) continue;
          observed.add(element);
          element.dataset.revealState = "pending";
          observer.observe(element);
        }
      };
      watch();
      const mutations = new MutationObserver(watch);
      mutations.observe(surface, { childList: true, subtree: true });
      let scrollFrame = 0;
      const updateScroll = () => {
        scrollFrame = 0;
        const max = surface.scrollHeight - surface.clientHeight;
        surface.style.setProperty(
          "--scroll-progress",
          String(max > 0 ? surface.scrollTop / max : 0),
        );
        surface.dataset.scrolled = String(surface.scrollTop > 12);
      };
      const scroll = () => {
        if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
      };
      updateScroll();
      surface.addEventListener("scroll", scroll, { passive: true });
      let pointerFrame = 0;
      let tilted: HTMLElement | null = null;
      const finePointer = window.matchMedia(
        "(hover: hover) and (pointer: fine)",
      );
      const resetTilt = () => {
        if (pointerFrame) cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        tilted?.style.removeProperty("--tilt-x");
        tilted?.style.removeProperty("--tilt-y");
        tilted = null;
      };
      const pointer = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || !finePointer.matches) return;
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-tilt]")
            : null;
        if (!target || !surface.contains(target)) return resetTilt();
        if (tilted !== target) resetTilt();
        tilted = target;
        if (pointerFrame) cancelAnimationFrame(pointerFrame);
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0;
          const rect = target.getBoundingClientRect();
          const x = Math.max(
            -0.5,
            Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5),
          );
          const y = Math.max(
            -0.5,
            Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5),
          );
          target.style.setProperty("--tilt-x", `${-y * 3}deg`);
          target.style.setProperty("--tilt-y", `${x * 3}deg`);
        });
      };
      const focus = (event: FocusEvent) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest("[data-reveal]");
        if (target) reveal(target);
      };
      surface.addEventListener("pointermove", pointer, { passive: true });
      surface.addEventListener("pointerleave", resetTilt);
      surface.addEventListener("focusin", focus);
      dispose = () => {
        observer.disconnect();
        mutations.disconnect();
        surface.removeEventListener("scroll", scroll);
        surface.removeEventListener("pointermove", pointer);
        surface.removeEventListener("pointerleave", resetTilt);
        surface.removeEventListener("focusin", focus);
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        resetTilt();
        for (const element of surface.querySelectorAll("[data-reveal]"))
          reveal(element);
        delete surface.dataset.motion;
        delete surface.dataset.scrolled;
        surface.style.removeProperty("--scroll-progress");
      };
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      dispose();
      preference.removeEventListener("change", configure);
    };
  }, []);
  return ref;
}
