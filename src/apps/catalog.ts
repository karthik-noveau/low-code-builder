/**
 * What app forms offer visitors from the site's collections (an "item" or
 * "items" field): published items, priced like the backend prices them, and
 * grouped by an obvious category field. Shared by the classic App form
 * (AppSection.tsx) and forms built from blocks (src/blocks/forms).
 */
import { safeImage } from "../studio/model";
import { formatValue, itemTitle, type Collection } from "../studio/collections";
import { formatMoney } from "./model";

/** The currency's symbol, e.g. ₹ for INR. */
export function currencySymbol(currency: string) {
  return formatMoney(0, currency).replace(/[\d.,\s]/g, "") || currency;
}
/** A collection item as visitors pick it. */
export interface MenuItem {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  image: string;
  /** In whole currency units; null when the item has no price. */
  price: number | null;
  priceText: string;
  category: string;
}
/** A field that obviously sorts a collection into groups, like Category or Course. */
const CATEGORY =
  /^(category|categories|type|course|section|kind|group|cuisine)$/i;
/**
 * The items visitors can choose from a collection: published (not hidden)
 * ones, priced from the card's price field like the backend prices them.
 */
function catalogOf(c: Collection): {
  items: MenuItem[];
  categories: string[];
} {
  const d = c.display;
  const category = c.fields.find(
    (f) => f.type === "choice" && CATEGORY.test(f.name.trim()),
  );
  const items = c.items
    .filter((i) => !i.hidden)
    .map((item): MenuItem => {
      const v = (field: string) => (field ? (item.values[field] ?? "") : "");
      const raw = v(d.price).trim();
      const n = raw ? Number(raw.replace(/[^\d.-]/g, "")) : NaN;
      return {
        slug: item.slug,
        title: itemTitle(c, item),
        subtitle:
          d.subtitle && d.subtitle !== d.summary
            ? formatValue(c, d.subtitle, v(d.subtitle))
            : "",
        summary: formatValue(c, d.summary, v(d.summary)),
        image: safeImage(v(d.image)),
        price: Number.isFinite(n) ? n : null,
        priceText: raw ? formatValue(c, d.price, raw) : "",
        category: category ? v(category.id).trim() : "",
      };
    });
  const used = new Set(items.map((i) => i.category).filter(Boolean));
  const categories = category
    ? [
        ...category.options.filter((o) => used.has(o)),
        ...[...used].filter((o) => !category.options.includes(o)),
      ]
    : [];
  return { items, categories };
}
export type Catalog = (
  collectionId?: string,
) =>
  | { collection: Collection; items: MenuItem[]; categories: string[] }
  | undefined;

/** Looks up (and remembers) the items visitors choose from each collection. */
export function makeCatalog(collections: Collection[]): Catalog {
  const catalogs = new Map<string, ReturnType<Catalog>>();
  return (collectionId) => {
    if (!collectionId) return;
    if (!catalogs.has(collectionId)) {
      const collection = collections.find((c) => c.id === collectionId);
      catalogs.set(
        collectionId,
        collection && { collection, ...catalogOf(collection) },
      );
    }
    return catalogs.get(collectionId);
  };
}
