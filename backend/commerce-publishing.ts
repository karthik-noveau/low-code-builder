import { createHash } from "node:crypto";
import { config } from "./config";
import { list, read } from "./commerce-data";
import type { Product, StoreSettings } from "../src/commerce/types";
import type { ProductPage } from "../src/studio/export";
import { slugify } from "../src/studio/redirects";
import {
  MAX_STORE_PRODUCTS,
  storePrice,
  type StoreProduct,
} from "../src/blocks/data/store";

export interface CommerceBinding {
  shopUrl?: string;
  /** The catalogue as the website shows it, when the store puts it there. */
  products?: StoreProduct[];
  /** Each active product's own page on the site. */
  pages?: ProductPage[];
  /** The store's address and its imported products' old handles, for redirects. */
  moved?: {
    shopUrl: string;
    products: { handle: string; url: string; collection: string }[];
  };
  checksum: string;
}
const storeUrl = (siteId: string) => {
  const url = new URL("/store", config.editorOrigin);
  url.searchParams.set("site", siteId);
  return url;
};
/** The store's active products as published pages show them (data/store.ts). */
export async function websiteProducts(
  siteId: string,
  settings: StoreSettings,
): Promise<StoreProduct[]> {
  return (await list<Product>(siteId, "PRODUCT"))
    .filter((product) => product.status === "active")
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, MAX_STORE_PRODUCTS)
    .map((product) => {
      const url = storeUrl(siteId);
      url.searchParams.set("product", product.id);
      return {
        id: product.id,
        title: product.title,
        body: product.description,
        image: product.image,
        price: storePrice(
          Math.min(...product.variants.map((v) => v.price)),
          settings.currency,
        ),
        url: url.toString(),
        category: product.collection,
      };
    });
}
/** Whether the site's store is open for its website (locally and on AWS). */
export const storeOnWebsite = (settings: StoreSettings | undefined) =>
  !!settings?.enabled;
export async function publicationCommerce(
  siteId: string,
): Promise<CommerceBinding> {
  const settings = await read<StoreSettings>(siteId, "SETTINGS");
  if (!storeOnWebsite(settings) || !settings) return { checksum: "" };
  const binding: Omit<CommerceBinding, "checksum"> = {};
  if (settings.linkFromWebsite) binding.shopUrl = storeUrl(siteId).toString();
  if (settings.useCatalogOnWebsite)
    binding.products = await websiteProducts(siteId, settings);
  // Every active product gets its own page on the site (products/<slug>);
  // one moved from Shopify keeps its handle, so its old address still works.
  const active = (await list<Product>(siteId, "PRODUCT"))
    .filter((p) => p.status === "active")
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .slice(0, MAX_STORE_PRODUCTS);
  const taken = new Set<string>();
  const pages: ProductPage[] = active.map((p) => {
    const base = p.handle || slugify(p.title) || "product";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    const url = storeUrl(siteId);
    url.searchParams.set("product", p.id);
    return {
      id: p.id,
      slug,
      title: p.title,
      description: p.description,
      image: p.image,
      collection: p.collection,
      amount: Math.min(...p.variants.map((v) => v.price)),
      currency: settings.currency,
      url: url.toString(),
    };
  });
  if (pages.length) binding.pages = pages;
  const handled = active.filter((p) => p.handle);
  if (handled.length)
    binding.moved = {
      shopUrl: storeUrl(siteId).toString(),
      products: handled.map((p) => ({
        handle: p.handle!,
        url: `/products/${pages.find((page) => page.id === p.id)!.slug}`,
        collection: p.collection,
      })),
    };
  if (!Object.keys(binding).length) return { checksum: "" };
  return {
    ...binding,
    checksum: createHash("sha256")
      .update(JSON.stringify(binding))
      .digest("hex"),
  };
}
