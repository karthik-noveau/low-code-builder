/** Browser push helpers for the owner's notifications. */
export const PUSH_WORKER = "/forma-push-sw.js";

/** A device name the owner recognises, e.g. "Chrome on Mac". */
export function deviceLabel(ua = navigator.userAgent) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  return system ? `${browser} on ${system}` : browser;
}
/** A VAPID key (base64url) as the bytes PushManager wants. */
export function keyBytes(key: string) {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
export async function existingSubscription() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const mine = registrations.find((r) =>
    (r.active || r.installing || r.waiting)?.scriptURL.endsWith(PUSH_WORKER),
  );
  return (await mine?.pushManager.getSubscription()) ?? null;
}
