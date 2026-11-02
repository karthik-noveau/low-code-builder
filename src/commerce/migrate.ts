/**
 * Reading another store's exports in the browser: Shopify's product and
 * customer CSVs, Wix's catalog and contacts CSVs, and Skynoveau's own product
 * CSV. The source is recognised from the headings; nothing has to be edited
 * first. The result is what the store API takes (saveProduct, and
 * importCustomers in backend/migration.ts), with a note of everything that
 * didn't come across as it was.
 */
import type { MigrationSource } from "./types";

export interface ProductDraft {
  title: string;
  description: string;
  collection: string;
  image: string;
  status: "active" | "draft" | "archived";
  handle?: string;
  variants: {
    title: string;
    sku: string;
    price: number;
    stock: number;
    prices: Record<string, number>;
  }[];
}
export interface CustomerDraft {
  email: string;
  name: string;
  phone: string;
  marketing: boolean;
  /** Orders and spend (minor units) on the old store. */
  orders: number;
  spent: number;
}
export type Parsed =
  | {
      kind: "products";
      source: MigrationSource | "forma";
      products: ProductDraft[];
      notes: string[];
    }
  | {
      kind: "customers";
      source: MigrationSource;
      customers: CustomerDraft[];
      notes: string[];
    };

/** Skynoveau's own product CSV columns, in order (export and import share them). */
export const PRODUCT_COLUMNS = [
  "title",
  "description",
  "collection",
  "image",
  "status",
  "variant",
  "sku",
  "price",
  "stock",
];
/** Stock given to variants the old store didn't count. */
export const UNTRACKED_STOCK = 1000;
export const MAX_VARIANTS = 50;
export const SOURCE_NAMES: Record<Parsed["source"], string> = {
  shopify: "Shopify",
  wix: "Wix",
  csv: "Spreadsheet",
  forma: "Skynoveau",
};

/** Plain text from a product description written as HTML. */
export function plainText(html: string) {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "’")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+• /g, "\n• ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 5000);
}
/** Minor units from a price as stores write it ("1,299.00", "$12", "12.5"). */
export function cents(value: string) {
  const cleaned = value.replace(/[^\d.,-]/g, "");
  // "1.299,00" (comma decimals) and "1,299.00" both read as 1299.
  const normal = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const n = Number(normal);
  return normal && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
const handleOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
const clip = (value: string, max: number) =>
  value.trim().replace(/\s+/g, " ").slice(0, max);
const https = (url: string) => {
  const u = url
    .trim()
    .replace(/^\/\//, "https://")
    .replace(/^http:\/\//i, "https://");
  return /^https:\/\/[^\s]+$/.test(u) && u.length <= 2000 ? u : "";
};
const yes = (value = "") => /^(true|yes|y|1|subscribed)$/i.test(value.trim());
const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The column reader for a CSV's headings, ignoring case and spacing. */
function columns(headings: string[]) {
  const at = new Map(
    headings.map((h, i) => [h.trim().toLowerCase().replace(/\s+/g, " "), i]),
  );
  const index = (...names: string[]) => {
    for (const n of names) {
      const i = at.get(n);
      if (i !== undefined) return i;
    }
    return -1;
  };
  return {
    has: (...names: string[]) => names.every((n) => at.has(n)),
    any: (...names: string[]) => names.some((n) => at.has(n)),
    get: (row: string[], ...names: string[]) => {
      const i = index(...names);
      return i < 0 ? "" : (row[i] ?? "").trim();
    },
  };
}

/** Recognises an export and turns it into products or customers. */
export function parseExport(rows: string[][]): Parsed {
  const [headings = [], ...body] = rows;
  if (!body.length) throw new Error("This file has headings but no rows.");
  const col = columns(headings);
  if (PRODUCT_COLUMNS.every((h, i) => headings[i]?.trim() === h))
    return forma(body);
  if (col.has("handle", "title") && col.any("variant price", "body (html)"))
    return shopifyProducts(body, col);
  if (col.has("handleid", "fieldtype")) return wixProducts(body, col);
  if (col.any("email", "email 1", "e-mail", "email address"))
    return customers(body, col);
  throw new Error(
    "This doesn’t look like a Shopify or Wix export. Use a products or customers CSV exported from your store, or Skynoveau’s product template.",
  );
}

type Columns = ReturnType<typeof columns>;
function forma(body: string[][]): Parsed {
  const groups = new Map<string, ProductDraft>();
  for (const [
    title,
    description,
    collection,
    image,
    status,
    variant,
    sku,
    price,
    stock,
  ] of body) {
    if (
      !title ||
      !price?.trim() ||
      !stock?.trim() ||
      !Number.isFinite(Number(price)) ||
      !Number.isInteger(Number(stock)) ||
      Number(price) < 0 ||
      Number(stock) < 0
    )
      throw new Error(
        "Every row needs a title, nonnegative price, and whole stock quantity.",
      );
    const group = groups.get(title) || {
      title,
      description,
      collection,
      image,
      status: (["active", "draft", "archived"].includes(status)
        ? status
        : "draft") as ProductDraft["status"],
      variants: [],
    };
    group.variants.push({
      title: variant || "Default",
      sku,
      price: Math.round(Number(price) * 100),
      stock: Number(stock),
      prices: {},
    });
    groups.set(title, group);
  }
  return {
    kind: "products",
    source: "forma",
    products: [...groups.values()],
    notes: [],
  };
}

function shopifyProducts(body: string[][], col: Columns): Parsed {
  const byHandle = new Map<
    string,
    { product: ProductDraft; seen: Set<string> }
  >();
  let untracked = 0,
    truncated = 0,
    noPrice = 0,
    compareAt = 0;
  for (const row of body) {
    const handle = handleOf(col.get(row, "handle"));
    if (!handle) continue;
    let entry = byHandle.get(handle);
    const title = col.get(row, "title");
    if (!entry) {
      if (!title) continue;
      const status = col.get(row, "status").toLowerCase();
      const published = col.get(row, "published");
      const category = col.get(row, "product category").split(">").at(-1) ?? "";
      entry = {
        seen: new Set(),
        product: {
          title: clip(title, 120),
          description: plainText(col.get(row, "body (html)", "body html")),
          collection: clip(
            col.get(row, "type", "product type") ||
              category ||
              col.get(row, "tags").split(",")[0] ||
              "",
            80,
          ),
          image: https(col.get(row, "image src")),
          status:
            status === "active" || status === "draft" || status === "archived"
              ? status
              : published
                ? yes(published)
                  ? "active"
                  : "draft"
                : "active",
          handle,
          variants: [],
        },
      };
      byHandle.set(handle, entry);
    }
    const { product, seen } = entry;
    if (!product.image) product.image = https(col.get(row, "image src"));
    // Rows with only an image (Shopify lists each extra image on its own row).
    const priceText = col.get(row, "variant price");
    const options = [1, 2, 3]
      .map((n) => col.get(row, `option${n} value`))
      .filter(Boolean);
    if (!priceText && !options.length && !col.get(row, "variant sku")) continue;
    const price = cents(priceText);
    if (!Number.isFinite(price)) {
      noPrice++;
      continue;
    }
    const name =
      !options.length ||
      (options.length === 1 && options[0] === "Default Title")
        ? "Default"
        : options.join(" / ");
    if (seen.has(name)) continue;
    seen.add(name);
    if (product.variants.length >= MAX_VARIANTS) {
      truncated++;
      continue;
    }
    const tracked = col.get(row, "variant inventory tracker");
    const qty = col.get(row, "variant inventory qty", "inventory quantity");
    let stock: number;
    if (qty !== "" && Number.isFinite(Number(qty)))
      stock = Math.max(0, Math.min(1_000_000, Math.trunc(Number(qty))));
    else {
      stock = tracked ? 0 : UNTRACKED_STOCK;
      if (!tracked) untracked++;
    }
    if (cents(col.get(row, "variant compare at price")) > price) compareAt++;
    product.variants.push({
      title: clip(name, 80),
      sku: clip(col.get(row, "variant sku"), 80),
      price,
      stock,
      prices: {},
    });
  }
  const products = [...byHandle.values()]
    .map((e) => e.product)
    .filter((p) => p.variants.length);
  const notes: string[] = [];
  const dropped = byHandle.size - products.length;
  if (dropped)
    notes.push(`${count(dropped, "product")} without a price were left out.`);
  if (noPrice)
    notes.push(
      `${count(noPrice, "variant")} without a readable price were left out.`,
    );
  if (untracked)
    notes.push(
      `${count(untracked, "variant")} didn’t track stock in Shopify; ${untracked === 1 ? "it starts" : "they start"} with ${UNTRACKED_STOCK.toLocaleString()} available.`,
    );
  if (truncated)
    notes.push(
      `Skynoveau keeps ${MAX_VARIANTS} variants a product; ${count(truncated, "variant")} beyond that were left out.`,
    );
  if (compareAt)
    notes.push(
      `${count(compareAt, "variant")} had a “compare at” price; the selling price came across. Create a discount for sales.`,
    );
  return { kind: "products", source: "shopify", products, notes };
}

function wixImage(value: string) {
  const first = value.split(";")[0]?.trim() ?? "";
  if (!first) return "";
  return /^https?:\/\//i.test(first)
    ? https(first)
    : /^[\w~.-]+$/.test(first)
      ? `https://static.wixstatic.com/media/${first}`
      : "";
}
function wixStock(value: string) {
  const v = value.trim();
  if (/^instock$/i.test(v) || v === "") return UNTRACKED_STOCK;
  if (/^outofstock$/i.test(v)) return 0;
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(1_000_000, Math.trunc(n)))
    : UNTRACKED_STOCK;
}
function wixProducts(body: string[][], col: Columns): Parsed {
  const products = new Map<
    string,
    {
      draft: ProductDraft;
      base: number;
      stock: string;
      choices: string[][];
      seen: Set<string>;
    }
  >();
  let discounted = 0,
    truncated = 0,
    noPrice = 0;
  for (const row of body) {
    const id = col.get(row, "handleid");
    const type = col.get(row, "fieldtype").toLowerCase();
    if (!id) continue;
    if (type === "product") {
      const base = cents(col.get(row, "price"));
      if (!Number.isFinite(base)) {
        noPrice++;
        continue;
      }
      if (
        col.get(row, "discountvalue") &&
        Number(col.get(row, "discountvalue")) > 0
      )
        discounted++;
      const choices = [1, 2, 3, 4, 5, 6]
        .map((n) =>
          col
            .get(row, `productoptiondescription${n}`)
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean),
        )
        .filter((c) => c.length);
      const name = col.get(row, "name");
      if (!name) continue;
      products.set(id, {
        base,
        stock: col.get(row, "inventory"),
        choices,
        seen: new Set(),
        draft: {
          title: clip(name, 120),
          description: plainText(col.get(row, "description")),
          collection: clip(col.get(row, "collection").split(";")[0] ?? "", 80),
          image: wixImage(col.get(row, "productimageurl")),
          status: /^false$/i.test(col.get(row, "visible")) ? "draft" : "active",
          handle: handleOf(
            col.get(row, "handleid").startsWith("product_")
              ? name
              : col.get(row, "handleid"),
          ),
          variants: [],
        },
      });
      continue;
    }
    if (type !== "variant") continue;
    const product = products.get(id);
    if (!product) continue;
    if (/^false$/i.test(col.get(row, "visible"))) continue;
    const name =
      [1, 2, 3, 4, 5, 6]
        .map((n) => col.get(row, `productoptiondescription${n}`))
        .filter(Boolean)
        .join(" / ") || "Default";
    if (product.seen.has(name)) continue;
    product.seen.add(name);
    if (product.draft.variants.length >= MAX_VARIANTS) {
      truncated++;
      continue;
    }
    const surcharge = cents(col.get(row, "surcharge") || "0");
    product.draft.variants.push({
      title: clip(name, 80),
      sku: clip(col.get(row, "sku"), 80),
      price: product.base + (Number.isFinite(surcharge) ? surcharge : 0),
      stock: wixStock(col.get(row, "inventory")),
      prices: {},
    });
  }
  // Products with options but no variant rows: every combination, at the product's price.
  for (const p of products.values()) {
    if (p.draft.variants.length) continue;
    const combos = p.choices.reduce<string[][]>(
      (all, choices) => all.flatMap((a) => choices.map((c) => [...a, c])),
      [[]],
    );
    if (combos.length > MAX_VARIANTS) truncated += combos.length - MAX_VARIANTS;
    for (const combo of combos.slice(0, MAX_VARIANTS))
      p.draft.variants.push({
        title: clip(combo.join(" / ") || "Default", 80),
        sku: "",
        price: p.base,
        stock: wixStock(p.stock),
        prices: {},
      });
  }
  const notes: string[] = [];
  if (noPrice)
    notes.push(
      `${count(noPrice, "product")} without a readable price were left out.`,
    );
  if (discounted)
    notes.push(
      `${count(discounted, "product")} had a Wix discount; the regular price came across. Create a discount for sales.`,
    );
  if (truncated)
    notes.push(
      `Skynoveau keeps ${MAX_VARIANTS} variants a product; ${count(truncated, "variant")} beyond that were left out.`,
    );
  return {
    kind: "products",
    source: "wix",
    products: [...products.values()].map((p) => p.draft),
    notes,
  };
}

function customers(body: string[][], col: Columns): Parsed {
  const source: MigrationSource = col.any(
    "accepts email marketing",
    "accepts marketing",
    "total spent",
  )
    ? "shopify"
    : col.any("email 1", "email subscriber status", "labels")
      ? "wix"
      : "csv";
  const seen = new Set<string>();
  let invalid = 0,
    duplicates = 0;
  const list: CustomerDraft[] = [];
  for (const row of body) {
    const email = col
      .get(row, "email", "email 1", "e-mail", "email address")
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    const name =
      col.get(row, "name", "full name") ||
      [col.get(row, "first name"), col.get(row, "last name")]
        .filter(Boolean)
        .join(" ");
    const marketing =
      source === "wix"
        ? /^subscribed$/i.test(col.get(row, "email subscriber status"))
        : yes(
            col.get(
              row,
              "accepts email marketing",
              "accepts marketing",
              "subscribed",
              "marketing",
            ),
          );
    const spent = cents(col.get(row, "total spent") || "0");
    const orders = Number(col.get(row, "total orders") || 0);
    list.push({
      email,
      name: clip(name, 100),
      phone: clip(
        col.get(row, "phone", "phone 1", "default address phone"),
        40,
      ),
      marketing,
      orders: Number.isInteger(orders) && orders > 0 ? orders : 0,
      spent: Number.isFinite(spent) ? spent : 0,
    });
  }
  const notes: string[] = [];
  if (invalid)
    notes.push(
      `${count(invalid, "row")} without a valid email address will be skipped.`,
    );
  if (duplicates)
    notes.push(`${count(duplicates, "repeated email")} will be imported once.`);
  return { kind: "customers", source, customers: list, notes };
}
