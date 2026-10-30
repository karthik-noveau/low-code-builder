import { createHash } from "node:crypto";
import { config, local } from "./config";
import { list, read } from "./commerce-data";
import type { Product, StoreSettings } from "../src/commerce/types";
import {
  MAX_STORE_PRODUCTS,
  storePrice,
  type StoreProduct,
} from "../src/blocks/data/store";

export interface CommerceBinding {
  shopUrl?: string;
  /** The catalogue as the website shows it, when the store puts it there. */
  products?: StoreProduct[];
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
/** Whether the site's store is open for its website (Forma Store runs locally only). */
export const storeOnWebsite = (settings: StoreSettings | undefined) =>
  local && !!settings?.enabled;
export async function publicationCommerce(
  siteId: string,
): Promise<CommerceBinding> {
  const settings = await read<StoreSettings>(siteId, "SETTINGS");
  if (
    !storeOnWebsite(settings) ||
    !settings ||
    (!settings.linkFromWebsite && !settings.useCatalogOnWebsite)
  )
    return { checksum: "" };
  const binding: Omit<CommerceBinding, "checksum"> = {};
  if (settings.linkFromWebsite) binding.shopUrl = storeUrl(siteId).toString();
  if (settings.useCatalogOnWebsite)
    binding.products = await websiteProducts(siteId, settings);
  return {
    ...binding,
    checksum: createHash("sha256")
      .update(JSON.stringify(binding))
      .digest("hex"),
  };
}
