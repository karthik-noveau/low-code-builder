/**
 * Old addresses that keep working after a site moves to Skynoveau, so links,
 * bookmarks and search results from Shopify or Wix still land somewhere.
 * Each one is published as a tiny page at the old path that sends visitors
 * (and search engines) on at once; the site router serves `/old/path` from
 * `old/path.html`. Store products imported with a handle get theirs
 * automatically (`movedPaths`).
 */
export interface Redirect {
  /** The old path without the leading slash: lowercase words and dashes, up to four parts. */
  from: string;
  /** A page on this site ("/about", "/") or a full https address. */
  to: string;
}
export const MAX_REDIRECTS = 500;
const SEGMENT = "[a-z0-9][a-z0-9-]*";
const FROM = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){0,3}$`);
/** Paths the site itself uses, never taken by a redirect. */
const RESERVED =
  /^(?:releases|sites|images|index|offline|thanks|styles|app|logic|sw|manifest|icon)(?:\/|$)/;

/**
 * An old address as people paste it (a full URL, with a slash, query or
 * ".html") reduced to the stored form, or "" when it can't be served.
 */
export function redirectFrom(value: string) {
  let path = value.trim();
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return "";
  }
  try {
    path = decodeURI(path);
  } catch {
    return "";
  }
  path = path
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html?$/i, "")
    .toLowerCase();
  return FROM.test(path) && !RESERVED.test(path) ? path : "";
}
/** A destination: a path on this site, or an https address. "" when unusable. */
export function redirectTo(value: string) {
  const to = value.trim();
  // http only for a workspace on this computer (its store runs on localhost).
  if (
    /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)[^\s<>"']*$/i.test(
      to,
    ) &&
    to.length <= 2000
  )
    return to;
  const path = to.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
  return path === "" || /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(path)
    ? `/${path}`
    : "";
}
export function validateRedirects(value: unknown): value is Redirect[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_REDIRECTS &&
    value.every(
      (r) =>
        r &&
        typeof r.from === "string" &&
        typeof r.to === "string" &&
        redirectFrom(r.from) === r.from &&
        redirectTo(r.to) === r.to,
    )
  );
}
/** Reads a redirect list: Shopify's URL redirect export, or any two-column CSV (old, new). */
export function redirectsFromRows(rows: string[][]) {
  const [first = [], ...rest] = rows;
  const heading = first.map((h) => h.trim().toLowerCase());
  const named =
    heading.includes("redirect from") ||
    (heading[0] === "from" && heading[1] === "to") ||
    heading[0] === "old url" ||
    heading[0] === "source";
  const fromAt = Math.max(0, heading.indexOf("redirect from"));
  const toAt = heading.includes("redirect to")
    ? heading.indexOf("redirect to")
    : 1;
  const redirects: Redirect[] = [];
  let skipped = 0;
  for (const row of named ? rest : rows) {
    const from = redirectFrom(row[fromAt] ?? "");
    const to = redirectTo(row[toAt] ?? "");
    if (from && to) redirects.push({ from, to });
    else skipped++;
  }
  return { redirects, skipped };
}
/** Adds redirects, the newest for an old path winning, up to the limit. */
export function mergeRedirects(current: Redirect[], added: Redirect[]) {
  const byFrom = new Map(current.map((r) => [r.from, r]));
  for (const r of added) byFrom.set(r.from, r);
  return [...byFrom.values()].slice(0, MAX_REDIRECTS);
}
export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
/**
 * The addresses a store's products and collections had on Shopify and Wix,
 * pointed at the same product or collection in the Skynoveau store.
 */
export function movedPaths(
  shopUrl: string,
  products: { handle: string; url: string; collection?: string }[],
): Redirect[] {
  const out: Redirect[] = [];
  const shop = redirectTo(shopUrl);
  if (!shop) return out;
  for (const from of [
    "collections/all",
    "products",
    "shop",
    "category/all-products",
  ])
    out.push({ from, to: shop });
  const collections = new Set<string>();
  for (const p of products) {
    const to = redirectTo(p.url);
    if (!to || !redirectFrom(p.handle)) continue;
    out.push({ from: `products/${p.handle}`, to });
    out.push({ from: `product-page/${p.handle}`, to });
    if (p.collection) collections.add(p.collection);
  }
  for (const name of collections) {
    const slug = slugify(name);
    if (!slug) continue;
    const url = new URL(shop);
    url.searchParams.set("collection", name);
    out.push({ from: `collections/${slug}`, to: url.toString() });
    out.push({ from: `category/${slug}`, to: url.toString() });
  }
  return out.filter((r) => redirectFrom(r.from) === r.from);
}
const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The published page at an old path: it sends the visitor on at once. */
export function redirectPage(redirect: Redirect) {
  const depth = redirect.from.split("/").length - 1;
  const target = /^https?:\/\//.test(redirect.to)
    ? redirect.to
    : `${"../".repeat(depth)}${redirect.to === "/" ? "index.html" : `${redirect.to.slice(1)}.html`}`;
  const href = escape(target);
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${href}"><link rel="canonical" href="${href}"><title>Moved</title></head><body><p>This page has moved. <a href="${href}">Continue</a>.</p></body></html>`;
}
