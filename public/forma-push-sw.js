/*
 * Forma's notification worker for the owner's app page. It only shows push
 * notifications ({ title, body, url }) and opens the record on click. It has
 * no fetch handler, so it never caches or changes how the editor loads.
 * Registered from the app page when the owner turns notifications on.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

/** Only addresses on this origin open; anything else goes to the app page. */
function safeUrl(value) {
  try {
    const url = new URL(
      typeof value === "string" && value ? value : "/apps",
      self.location.origin,
    );
    return url.origin === self.location.origin
      ? url.href
      : new URL("/apps", self.location.origin).href;
  } catch {
    return new URL("/apps", self.location.origin).href;
  }
}
const text = (value, max) =>
  typeof value === "string" ? value.slice(0, max) : "";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = safeUrl(data.url);
  event.waitUntil(
    self.registration.showNotification(text(data.title, 120) || "Forma", {
      body: text(data.body, 400),
      icon: "/forma.svg",
      badge: "/forma.svg",
      // A newer notice about the same record replaces the older one.
      tag: url,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const same = windows.find((client) => client.url === url);
      if (same) return same.focus();
      // Reuse an open app page rather than piling up tabs.
      const page = windows.find(
        (client) => new URL(client.url).pathname === "/apps",
      );
      if (page && "navigate" in page) {
        try {
          const moved = await page.navigate(url);
          if (moved) return moved.focus();
        } catch {
          // Uncontrolled pages can't be navigated; open a new one instead.
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
