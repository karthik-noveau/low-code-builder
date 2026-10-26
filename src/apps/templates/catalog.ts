/**
 * Collections the business templates ship with: a menu, services, courses,
 * events, plans… App forms choose from or order from them ("item" and
 * "items" fields), and the site lists them with item pages, so the menu a
 * visitor browses is the menu they order from.
 */
import {
  createField,
  createItem,
  emptyDisplay,
  uniqueSlug,
  type Blueprint,
  type Collection,
  type CollectionDisplay,
  type FieldType,
} from "../../studio/collections";
import type { CollectionRequest } from "../../studio/requests";

export interface CatalogSpec {
  name: string;
  singular: string;
  blueprint: Blueprint;
  /** Item pages live under /{slug}/…; defaults to the name. */
  slug?: string;
  currency?: string;
  itemPages?: boolean;
  fields: [name: string, type: FieldType, options?: string[]][];
  /** Field names for each display slot; `actionLabel` is the button text itself. */
  display: Partial<Record<keyof CollectionDisplay, string>>;
  /** One row per item, values in the order of `fields`. */
  rows: string[][];
  request?: CollectionRequest;
}

export function catalog(spec: CatalogSpec, taken: string[] = []): Collection {
  const fields = spec.fields.map(([name, type, options]) =>
    createField(name, type, options),
  );
  const byName = (name?: string) =>
    fields.find((f) => f.name === name)?.id ?? "";
  const display = emptyDisplay();
  for (const key of Object.keys(display) as (keyof CollectionDisplay)[])
    display[key] =
      key === "actionLabel"
        ? (spec.display.actionLabel ?? "")
        : byName(spec.display[key]);
  const collection: Collection = {
    id: crypto.randomUUID(),
    name: spec.name,
    slug: uniqueSlug(spec.slug ?? spec.name, taken),
    singular: spec.singular,
    blueprint: spec.blueprint,
    currency: spec.currency ?? "₹",
    itemPages: spec.itemPages ?? true,
    fields,
    display,
    items: [],
  };
  if (spec.request) collection.request = { ...spec.request };
  for (const row of spec.rows)
    collection.items.push(
      createItem(
        collection,
        Object.fromEntries(fields.map((f, i) => [f.id, row[i] ?? ""])),
      ),
    );
  return collection;
}

/** The id of a collection's field, by name. */
export const fieldNamed = (c: Collection, name: string) =>
  c.fields.find((f) => f.name === name)?.id ?? "";
