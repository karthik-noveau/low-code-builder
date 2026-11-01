/**
 * Google Analytics 4 and the Meta Pixel in the store, with the IDs the
 * owner set for their website (Settings → Tracking, written at publish and
 * passed on by the storefront API). Product views, add to cart, checkout
 * and purchases are reported as each platform's standard ecommerce events,
 * so ads can optimise for sales. Nothing loads until the shopper agrees
 * (when the owner asks for consent), or for shoppers asking not to be
 * tracked.
 */
export interface StoreTracking {
  ga4: string;
  pixel: string;
  consent: boolean;
}
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Gtag & {
      queue?: unknown[];
      callMethod?: Gtag;
      loaded?: boolean;
      version?: string;
      push?: Gtag;
    };
    _fbq?: unknown;
  }
}
const CONSENT = "forma-store-consent";
let ready = false;
const queue: (() => void)[] = [];

function load(t: StoreTracking) {
  if (t.ga4 && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      // gtag reads the arguments object itself.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", t.ga4);
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(t.ga4)}`;
    document.head.appendChild(s);
  }
  if (t.pixel && !window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as NonNullable<Window["fbq"]>;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    fbq("init", t.pixel);
    fbq("track", "PageView");
  }
  ready = true;
  for (const run of queue.splice(0)) run();
}
/** Starts tracking for this store (once), asking first when the owner wants consent. */
export function startStoreTracking(t: StoreTracking | undefined) {
  if (!t || (!t.ga4 && !t.pixel) || ready) return;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
  let choice: string | null = null;
  try {
    choice = localStorage.getItem(CONSENT);
  } catch {
    /* Ask again next time. */
  }
  if (!t.consent || choice === "yes") return load(t);
  if (choice === "no" || document.querySelector(".store-consent")) return;
  const bar = document.createElement("div");
  bar.className = "store-consent";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Cookie choice");
  const text = document.createElement("span");
  text.textContent =
    "This store uses cookies to understand visits and improve its ads. Is that OK?";
  bar.appendChild(text);
  for (const [label, value] of [
    ["No thanks", "no"],
    ["Accept", "yes"],
  ] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (value === "yes") b.className = "is-primary";
    b.addEventListener("click", () => {
      try {
        localStorage.setItem(CONSENT, value);
      } catch {
        /* Chosen for this visit. */
      }
      bar.remove();
      if (value === "yes") load(t);
    });
    bar.appendChild(b);
  }
  document.body.appendChild(bar);
}
interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
}
/** One ecommerce event, in each platform's own words (dropped if tracking never starts). */
export function trackStore(
  event: "view_item" | "add_to_cart" | "begin_checkout" | "purchase",
  data: { currency: string; value: number; items: Item[]; orderId?: string },
) {
  const run = () => {
    const value = data.value / 100;
    window.gtag?.("event", event, {
      currency: data.currency,
      value,
      ...(data.orderId ? { transaction_id: data.orderId } : {}),
      items: data.items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        price: i.price / 100,
        quantity: i.quantity,
      })),
    });
    const meta = {
      view_item: "ViewContent",
      add_to_cart: "AddToCart",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
    }[event];
    window.fbq?.(
      "track",
      meta,
      {
        currency: data.currency,
        value,
        content_type: "product",
        content_ids: data.items.map((i) => i.id),
        num_items: data.items.reduce((n, i) => n + i.quantity, 0),
      },
      data.orderId ? { eventID: data.orderId } : undefined,
    );
  };
  if (ready) run();
  else if (queue.length < 20) queue.push(run);
}
/** A purchase is reported once per order, even if the receipt is opened again. */
export function trackPurchaseOnce(
  orderId: string,
  data: Parameters<typeof trackStore>[1],
) {
  const key = `forma-purchase-${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* Reported for this page. */
  }
  trackStore("purchase", { ...data, orderId });
}
