import { createHash } from "node:crypto";
import { config, local } from "./config";
import { list, read } from "./commerce-data";
import type { Product, StoreSettings } from "../src/commerce/types";
import type { Item } from "../src/studio/model";

export interface CommerceBinding {
  shopUrl?: string;
  products?: Item[];
  checksum: string;
}
export async function publicationCommerce(
  siteId: string,
): Promise<CommerceBinding> {
  const settings = await read<StoreSettings>(siteId, "SETTINGS");
  if (
    !local ||
    !settings?.enabled ||
    (!settings.linkFromWebsite && !settings.useCatalogOnWebsite)
  )
    return { checksum: "" };
  const storeUrl = new URL("/store", config.editorOrigin);
  storeUrl.searchParams.set("site", siteId);
  const binding: Omit<CommerceBinding, "checksum"> = {};
  if (settings.linkFromWebsite) binding.shopUrl = storeUrl.toString();
  if (settings.useCatalogOnWebsite)
    binding.products = (await list<Product>(siteId, "PRODUCT"))
      .filter((product) => product.status === "active")
      .sort(
        (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
      )
      .slice(0, 12)
      .map((product) => {
        const url = new URL(storeUrl);
        url.searchParams.set("product", product.id);
        return {
          id: product.id,
          title: product.title,
          body: product.description,
          image: product.image,
          price: new Intl.NumberFormat("en", {
            style: "currency",
            currency: settings.currency,
          }).format(Math.min(...product.variants.map((v) => v.price)) / 100),
          url: url.toString(),
        };
      });
  return {
    ...binding,
    checksum: createHash("sha256")
      .update(JSON.stringify(binding))
      .digest("hex"),
  };
}
