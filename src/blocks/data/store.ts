/**
 * Forma Store products as a repeat's items (source `store:products`, an
 * optional `category` prop). The catalogue isn't in the project: the
 * publisher reads it (backend/commerce-publishing.ts) and draws the items
 * into the page (`RenderContext.store`); the editor reads the same list
 * through the owner API (live.ts `useStoreCatalog`). Inside the card,
 * bindings read `item:title`, `item:price`, `item:image`,
 * `item:description`, `item:category` and `item:link` (the product's page).
 */
import type { Item } from "../../studio/model";
import type { DataItem, SourceField } from "./bind";

export const STORE_SOURCE = "store:products";
/** A product as the website shows it: its lowest price as the store formats it, and its page in the store. */
export type StoreProduct = Item & { category?: string };
/** Item paths a store product adds to title and link. */
export const STORE_PATHS = ["price", "image", "description", "category"];
/** The most products a site's pages are given (a repeat shows up to 24). */
export const MAX_STORE_PRODUCTS = 100;

/** A price in minor units, as Forma Store shows it on the website. */
export const storePrice = (minor: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(
    minor / 100,
  );

export const storeFields = (): SourceField[] => [
  { source: "item:title", name: "Product name", type: "text" },
  { source: "item:price", name: "Price", type: "price" },
  { source: "item:image", name: "Photo", type: "image" },
  { source: "item:description", name: "Description", type: "text" },
  { source: "item:category", name: "Category", type: "text" },
  { source: "item:link", name: "Product page", type: "link" },
  { source: "item:index", name: "Place in list (1, 2, 3…)", type: "number" },
];

/** The products a repeat lists: those of its category (all without one), up to its limit. */
export function queryStore(
  products: StoreProduct[],
  category: string,
  limit: number,
): StoreProduct[] {
  const want = category.trim().toLowerCase();
  const list = want
    ? products.filter((p) => (p.category ?? "").trim().toLowerCase() === want)
    : products;
  return limit > 0 ? list.slice(0, limit) : list;
}
export const storeItem = (p: StoreProduct, index: number): DataItem => ({
  index,
  values: {},
  raw: {},
  title: p.title,
  link: p.url,
  paths: {
    price: p.price,
    image: p.image,
    description: p.body,
    category: p.category ?? "",
  },
});
/** The categories products are in, in order of first use. */
export const storeCategories = (products: StoreProduct[]) => [
  ...new Set(products.map((p) => p.category?.trim() ?? "").filter(Boolean)),
];

/** What the editor shows before it can read the site's store. */
export const SAMPLE_PRODUCTS: StoreProduct[] = [
  ["Sample product", "₹1,299.00", "/images/plant-1.jpg"],
  ["Another product", "₹849.00", "/images/plant-2.jpg"],
  ["A third product", "₹499.00", "/images/plant-3.jpg"],
].map(([title, price, image], i) => ({
  id: `sample-${i + 1}`,
  title,
  body: "A line about the product, from its description in your store.",
  image,
  price,
  url: "#",
  category: "",
}));
