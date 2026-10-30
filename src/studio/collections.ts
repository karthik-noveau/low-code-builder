/**
 * Collections: structured data for any kind of business (products, dishes,
 * properties, events, services, people, jobs, posts…). Sections list them and
 * every item can get its own static page, so one engine builds a shop, a
 * restaurant, an agency or a school without apps.
 */
import { parseCsv } from "../commerce/csv";
import { validateRequestConfig, type CollectionRequest } from "./requests";

export type FieldType =
  | "text"
  | "longText"
  | "number"
  | "price"
  | "image"
  | "link"
  | "date"
  | "choice";
export interface CollectionField {
  id: string;
  name: string;
  type: FieldType;
  /** Choices for a "choice" field. */
  options: string[];
}
export interface CollectionItem {
  id: string;
  slug: string;
  hidden: boolean;
  /** Field id → value. Everything is stored as text so it round-trips through CSV. */
  values: Record<string, string>;
}
/** Which fields fill each part of a card and an item page. */
export interface CollectionDisplay {
  title: string;
  subtitle: string;
  image: string;
  price: string;
  summary: string;
  body: string;
  /** A link field, shown as the item's call to action. */
  action: string;
  actionLabel: string;
}
export type Blueprint =
  | "products"
  | "menu"
  | "properties"
  | "events"
  | "services"
  | "team"
  | "jobs"
  | "posts"
  | "custom";
export interface Collection {
  id: string;
  name: string;
  /** Item pages live under /{slug}/{item}. */
  slug: string;
  singular: string;
  blueprint: Blueprint;
  currency: string;
  itemPages: boolean;
  fields: CollectionField[];
  display: CollectionDisplay;
  items: CollectionItem[];
  /** What visitors can ask for on an item page; arrives in the inbox. */
  request?: CollectionRequest;
}

export const FIELD_TYPES: Record<FieldType, string> = {
  text: "Text",
  longText: "Long text",
  number: "Number",
  price: "Price",
  image: "Image",
  link: "Link",
  date: "Date",
  choice: "Choice",
};
export const MAX_ITEMS = 1000;
export const MAX_FIELDS = 30;
const uid = () => crypto.randomUUID();

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
/** A slug not already used by `taken`, adding -2, -3… as needed. */
export function uniqueSlug(value: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const stem = slugify(value);
  let slug = stem;
  for (let n = 2; used.has(slug); n++) slug = `${stem}-${n}`;
  return slug;
}
export const itemHref = (c: Collection, item: CollectionItem) =>
  `${c.slug}/${item.slug}.html`;
export const itemPath = (c: Collection, item: CollectionItem) =>
  `/${c.slug}/${item.slug}`;

type FieldSpec = [name: string, type: FieldType, options?: string[]];
interface BlueprintSpec {
  label: string;
  description: string;
  icon: string;
  name: string;
  singular: string;
  itemPages: boolean;
  fields: FieldSpec[];
  /** Field names for each display slot. */
  display: Partial<Record<keyof CollectionDisplay, string>>;
  request?: CollectionRequest;
  samples: string[][];
}
export const blueprints: Record<Blueprint, BlueprintSpec> = {
  products: {
    label: "Products",
    description: "Things you sell, with prices and a buy button.",
    icon: "grid",
    name: "Products",
    singular: "Product",
    itemPages: true,
    fields: [
      ["Name", "text"],
      ["Price", "price"],
      ["Photo", "image"],
      ["Description", "longText"],
      ["Buy link", "link"],
    ],
    display: {
      title: "Name",
      price: "Price",
      image: "Photo",
      summary: "Description",
      body: "Description",
      action: "Buy link",
      actionLabel: "Buy now",
    },
    request: { kind: "order", label: "" },
    samples: [
      [
        "Fiddle leaf fig",
        "48",
        "/images/plant-6.jpg",
        "Big leaves, bright corners.",
        "#",
      ],
      [
        "Desert succulent trio",
        "26",
        "/images/plant-8.jpg",
        "Three easy-going companions.",
        "#",
      ],
      [
        "Rubber plant",
        "34",
        "/images/plant-3.jpg",
        "Glossy, forgiving, and fast-growing.",
        "#",
      ],
    ],
  },
  menu: {
    label: "Menu",
    description: "Dishes and drinks, grouped and priced.",
    icon: "pages",
    name: "Menu",
    singular: "Dish",
    itemPages: false,
    fields: [
      ["Dish", "text"],
      ["Price", "price"],
      ["Description", "text"],
      ["Diet", "choice", ["", "Vegetarian", "Vegan", "Gluten-free"]],
      ["Photo", "image"],
    ],
    display: {
      title: "Dish",
      price: "Price",
      summary: "Description",
      subtitle: "Diet",
      image: "Photo",
    },
    samples: [
      [
        "Charred leeks",
        "12",
        "Hazelnut, brown butter, lemon.",
        "Vegetarian",
        "",
      ],
      ["Market fish", "28", "Fennel, mussels, saffron broth.", "", ""],
      ["Olive oil cake", "9", "Crème fraîche, blood orange.", "Vegetarian", ""],
    ],
  },
  properties: {
    label: "Properties",
    description: "Homes, rentals, or spaces with viewings.",
    icon: "home",
    name: "Properties",
    singular: "Property",
    itemPages: true,
    fields: [
      ["Title", "text"],
      ["Price", "price"],
      ["Location", "text"],
      ["Bedrooms", "number"],
      ["Photo", "image"],
      ["Description", "longText"],
      ["Viewing link", "link"],
    ],
    display: {
      title: "Title",
      price: "Price",
      subtitle: "Location",
      image: "Photo",
      summary: "Location",
      body: "Description",
      action: "Viewing link",
      actionLabel: "Book a viewing",
    },
    request: { kind: "book", label: "Book a viewing" },
    samples: [
      [
        "Light-filled loft",
        "425000",
        "Riverside",
        "2",
        "/images/interior.jpg",
        "Open-plan living with original beams.",
        "#",
      ],
      [
        "Garden cottage",
        "389000",
        "Old Town",
        "3",
        "/images/garden.jpg",
        "A quiet garden ten minutes from everything.",
        "#",
      ],
      [
        "Modern townhouse",
        "560000",
        "Hillcrest",
        "4",
        "/images/architecture.jpg",
        "Four floors of calm, clean lines.",
        "#",
      ],
    ],
  },
  events: {
    label: "Events",
    description: "Dates, venues, and tickets.",
    icon: "sparkles",
    name: "Events",
    singular: "Event",
    itemPages: true,
    fields: [
      ["Event", "text"],
      ["Date", "date"],
      ["Venue", "text"],
      ["Photo", "image"],
      ["Details", "longText"],
      ["Tickets", "link"],
    ],
    display: {
      title: "Event",
      subtitle: "Date",
      summary: "Venue",
      image: "Photo",
      body: "Details",
      action: "Tickets",
      actionLabel: "Get tickets",
    },
    request: { kind: "rsvp", label: "" },
    samples: [
      [
        "Spring supper club",
        "2026-04-18",
        "The Glasshouse",
        "/images/restaurant.jpg",
        "Five courses, one long table.",
        "#",
      ],
      [
        "Planting workshop",
        "2026-05-02",
        "Studio 4",
        "/images/botanical.jpg",
        "Bring a pot. Leave with a plan.",
        "#",
      ],
    ],
  },
  services: {
    label: "Services",
    description: "What you offer, with booking.",
    icon: "checklist",
    name: "Services",
    singular: "Service",
    itemPages: true,
    fields: [
      ["Service", "text"],
      ["Price", "price"],
      ["Duration", "text"],
      ["Description", "longText"],
      ["Booking link", "link"],
    ],
    display: {
      title: "Service",
      price: "Price",
      subtitle: "Duration",
      summary: "Description",
      body: "Description",
      action: "Booking link",
      actionLabel: "Book now",
    },
    request: { kind: "book", label: "Book now" },
    samples: [
      [
        "Discovery call",
        "0",
        "30 min",
        "A short call to understand what you need.",
        "#",
      ],
      [
        "Strategy session",
        "240",
        "2 hours",
        "A focused working session with a written plan.",
        "#",
      ],
      [
        "Monthly support",
        "900",
        "Ongoing",
        "A standing partner for your team.",
        "#",
      ],
    ],
  },
  team: {
    label: "Team",
    description: "The people behind the work.",
    icon: "heart",
    name: "Team",
    singular: "Person",
    itemPages: false,
    fields: [
      ["Name", "text"],
      ["Role", "text"],
      ["Photo", "image"],
      ["Bio", "longText"],
    ],
    display: {
      title: "Name",
      subtitle: "Role",
      image: "Photo",
      summary: "Bio",
      body: "Bio",
    },
    samples: [
      ["Ada Brooks", "Founder", "", "Started it all with a single idea."],
      ["Sam Ortiz", "Design lead", "", "Makes things simple, then simpler."],
    ],
  },
  jobs: {
    label: "Jobs",
    description: "Open roles and how to apply.",
    icon: "send",
    name: "Careers",
    singular: "Role",
    itemPages: true,
    fields: [
      ["Role", "text"],
      ["Location", "text"],
      ["Type", "choice", ["Full-time", "Part-time", "Contract"]],
      ["Description", "longText"],
      ["Apply link", "link"],
    ],
    display: {
      title: "Role",
      subtitle: "Type",
      summary: "Location",
      body: "Description",
      action: "Apply link",
      actionLabel: "Apply",
    },
    request: { kind: "apply", label: "Apply for this role" },
    samples: [
      [
        "Store manager",
        "Riverside",
        "Full-time",
        "Lead a small, kind team.",
        "#",
      ],
      [
        "Weekend assistant",
        "Old Town",
        "Part-time",
        "Help customers find their plant.",
        "#",
      ],
    ],
  },
  posts: {
    label: "Posts",
    description: "News, stories, or a blog.",
    icon: "type",
    name: "Journal",
    singular: "Post",
    itemPages: true,
    fields: [
      ["Title", "text"],
      ["Date", "date"],
      ["Cover", "image"],
      ["Excerpt", "text"],
      ["Body", "longText"],
    ],
    display: {
      title: "Title",
      subtitle: "Date",
      image: "Cover",
      summary: "Excerpt",
      body: "Body",
    },
    samples: [
      [
        "How to repot without the mess",
        "2026-03-02",
        "/images/plant-3.jpg",
        "Five steps and one old towel.",
        "Start with a pot one size up…",
      ],
      [
        "Light, explained",
        "2026-02-14",
        "/images/interior.jpg",
        "Bright, indirect, and everything in between.",
        "Most plants want more light than you think…",
      ],
    ],
  },
  custom: {
    label: "Start from scratch",
    description: "Any kind of list, with your own fields.",
    icon: "plus",
    name: "Collection",
    singular: "Item",
    itemPages: true,
    fields: [
      ["Name", "text"],
      ["Description", "longText"],
      ["Image", "image"],
    ],
    display: {
      title: "Name",
      image: "Image",
      summary: "Description",
      body: "Description",
    },
    samples: [],
  },
};

export function createField(
  name: string,
  type: FieldType,
  options: string[] = [],
): CollectionField {
  return { id: uid(), name, type, options: type === "choice" ? options : [] };
}
export function emptyDisplay(): CollectionDisplay {
  return {
    title: "",
    subtitle: "",
    image: "",
    price: "",
    summary: "",
    body: "",
    action: "",
    actionLabel: "",
  };
}
export function createCollection(
  blueprint: Blueprint,
  taken: string[] = [],
): Collection {
  const spec = blueprints[blueprint];
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
    id: uid(),
    name: spec.name,
    slug: uniqueSlug(spec.name, taken),
    singular: spec.singular,
    blueprint,
    currency: "$",
    itemPages: spec.itemPages,
    fields,
    display,
    items: [],
  };
  if (spec.request) collection.request = { ...spec.request };
  for (const sample of spec.samples)
    collection.items.push(
      createItem(
        collection,
        Object.fromEntries(fields.map((f, i) => [f.id, sample[i] ?? ""])),
      ),
    );
  return collection;
}
export function createItem(
  c: Collection,
  values: Record<string, string> = {},
): CollectionItem {
  const title = values[c.display.title] || `New ${c.singular.toLowerCase()}`;
  return {
    id: uid(),
    slug: uniqueSlug(
      title,
      c.items.map((i) => i.slug),
    ),
    hidden: false,
    values: Object.fromEntries(
      c.fields.map((f) => [
        f.id,
        values[f.id] ?? (f.id === c.display.title ? title : ""),
      ]),
    ),
  };
}
export const itemTitle = (c: Collection, item: CollectionItem) =>
  item.values[c.display.title] || `Untitled ${c.singular.toLowerCase()}`;

/** A value formatted for visitors: prices get the currency, dates read naturally. */
export function formatValue(c: Collection, fieldId: string, value: string) {
  const field = c.fields.find((f) => f.id === fieldId);
  if (!field || !value) return value;
  if (field.type === "price") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    if (!value.trim() || !Number.isFinite(n)) return value;
    if (n === 0) return "Free";
    return `${c.currency}${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  }
  if (field.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00Z`);
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return value;
}

const isText = (v: unknown, max = 20000) =>
  typeof v === "string" && v.length <= max;
export function validateCollections(value: unknown): value is Collection[] {
  if (!Array.isArray(value) || value.length > 50) return false;
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const c of value as Collection[]) {
    if (!c || ids.has(c.id)) return false;
    ids.add(c.id);
    if (
      !c ||
      !isText(c.id, 100) ||
      !isText(c.name, 120) ||
      !isText(c.singular, 120) ||
      !isText(c.currency, 8) ||
      !(c.blueprint in blueprints) ||
      typeof c.itemPages !== "boolean" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug) ||
      slugs.has(c.slug) ||
      !Array.isArray(c.fields) ||
      c.fields.length > MAX_FIELDS ||
      !Array.isArray(c.items) ||
      c.items.length > MAX_ITEMS ||
      !c.display ||
      typeof c.display !== "object" ||
      (c.request !== undefined && !validateRequestConfig(c.request))
    )
      return false;
    slugs.add(c.slug);
    const fieldIds = new Set<string>();
    for (const f of c.fields) {
      if (
        !f ||
        !isText(f.id, 100) ||
        fieldIds.has(f.id) ||
        !isText(f.name, 120) ||
        !(f.type in FIELD_TYPES) ||
        !Array.isArray(f.options) ||
        f.options.length > 50 ||
        !f.options.every((o) => isText(o, 120))
      )
        return false;
      fieldIds.add(f.id);
    }
    const display = emptyDisplay();
    for (const key of Object.keys(display) as (keyof CollectionDisplay)[]) {
      const v = c.display[key];
      if (!isText(v, 120)) return false;
      if (key !== "actionLabel" && v && !fieldIds.has(v)) return false;
    }
    const itemIds = new Set<string>();
    const itemSlugs = new Set<string>();
    for (const i of c.items) {
      if (
        !i ||
        !isText(i.id, 100) ||
        itemIds.has(i.id) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.slug) ||
        itemSlugs.has(i.slug) ||
        typeof i.hidden !== "boolean" ||
        !i.values ||
        typeof i.values !== "object" ||
        !Object.entries(i.values).every(
          ([k, v]) => fieldIds.has(k) && isText(v),
        )
      )
        return false;
      itemIds.add(i.id);
      itemSlugs.add(i.slug);
    }
  }
  return true;
}

/** Strips tags from imported HTML descriptions; keeps paragraphs as line breaks. */
export function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export interface ImportResult {
  collection: Collection;
  source: "shopify" | "csv";
  skipped: number;
  /** Some cells were longer than a field allows and were cut. */
  truncated?: boolean;
}
/**
 * Turns a CSV into a collection. Shopify product exports are recognised and
 * mapped to a Products collection (one item per handle; variant and image rows
 * are folded in). Any other CSV becomes a custom collection with a field per
 * column and field types guessed from the values.
 */
export function importCsv(
  source: string,
  name: string,
  taken: string[] = [],
): ImportResult {
  const result = readCsv(source, name, taken);
  const c = result.collection;
  // Spreadsheets have no length limits; the project does.
  c.name = c.name.slice(0, 120);
  for (const f of c.fields) f.name = f.name.slice(0, 120);
  let truncated = false;
  for (const item of c.items)
    for (const [k, v] of Object.entries(item.values))
      if (v.length > 20000) {
        item.values[k] = v.slice(0, 20000);
        truncated = true;
      }
  return { ...result, truncated };
}
function readCsv(source: string, name: string, taken: string[]): ImportResult {
  const rows = parseCsv(source);
  if (rows.length < 2)
    throw new Error(
      "The file needs a header row and at least one row of data.",
    );
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) =>
    header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (col("Handle") >= 0 && col("Title") >= 0 && col("Variant Price") >= 0)
    return importShopify(rows, col, taken);
  if (header.length > MAX_FIELDS)
    throw new Error(`Use ${MAX_FIELDS} columns or fewer.`);
  const data = rows.slice(1, MAX_ITEMS + 1);
  const guess = (h: string, values: string[]): FieldType => {
    const filled = values.filter(Boolean);
    const all = (re: RegExp) =>
      filled.length > 0 && filled.every((v) => re.test(v));
    if (
      /price|cost|fee|amount/i.test(h) &&
      all(/^[^\d-]{0,3}-?[\d,]+(\.\d+)?$/)
    )
      return "price";
    if (all(/^https?:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i))
      return "image";
    if (all(/^(https?:\/\/|mailto:|tel:)\S+$/i)) return "link";
    if (all(/^\d{4}-\d{2}-\d{2}$/)) return "date";
    if (all(/^-?\d+(\.\d+)?$/)) return "number";
    if (filled.some((v) => v.length > 120 || v.includes("\n")))
      return "longText";
    return "text";
  };
  const collection = createCollection("custom", taken);
  collection.name = name.trim() || "Imported collection";
  collection.slug = uniqueSlug(collection.name, taken);
  collection.fields = header.map((h, i) =>
    createField(
      h || `Column ${i + 1}`,
      guess(
        h,
        data.map((r) => r[i] ?? ""),
      ),
    ),
  );
  const first = (type: FieldType) =>
    collection.fields.find((f) => f.type === type)?.id ?? "";
  const text =
    collection.fields.find((f) => f.type === "text")?.id ??
    collection.fields[0].id;
  collection.display = {
    ...emptyDisplay(),
    title: text,
    image: first("image"),
    price: first("price"),
    summary: first("longText"),
    body: first("longText"),
    action: first("link"),
    actionLabel: first("link") ? "Learn more" : "",
  };
  collection.items = [];
  for (const r of data)
    collection.items.push(
      createItem(
        collection,
        Object.fromEntries(
          collection.fields.map((f, i) => [f.id, (r[i] ?? "").trim()]),
        ),
      ),
    );
  return {
    collection,
    source: "csv",
    skipped: Math.max(0, rows.length - 1 - MAX_ITEMS),
  };
}
function importShopify(
  rows: string[][],
  col: (name: string) => number,
  taken: string[],
): ImportResult {
  const collection = createCollection("products", taken);
  collection.items = [];
  const [name, price, photo, description, link] = collection.fields.map(
    (f) => f.id,
  );
  const at = (r: string[], name: string) =>
    col(name) >= 0 ? (r[col(name)] ?? "").trim() : "";
  const byHandle = new Map<string, Record<string, string>>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const handle = at(r, "Handle");
    if (!handle) continue;
    const existing = byHandle.get(handle);
    if (existing) {
      // Variant and extra-image rows: fill anything still missing.
      if (!existing[photo]) existing[photo] = at(r, "Image Src");
      if (!existing[price]) existing[price] = at(r, "Variant Price");
      continue;
    }
    if (byHandle.size >= MAX_ITEMS) {
      skipped++;
      continue;
    }
    const status = at(r, "Status").toLowerCase();
    byHandle.set(handle, {
      [name]: at(r, "Title") || handle,
      [price]: at(r, "Variant Price"),
      [photo]: at(r, "Image Src"),
      [description]: htmlToText(at(r, "Body (HTML)")),
      [link]: "",
      __slug: handle,
      __hidden: status && status !== "active" ? "1" : "",
    });
  }
  for (const values of byHandle.values()) {
    const item = createItem(collection, values);
    item.slug = uniqueSlug(
      values.__slug,
      collection.items.map((i) => i.slug),
    );
    item.hidden = values.__hidden === "1";
    collection.items.push(item);
  }
  if (!collection.items.length)
    throw new Error("No products were found in this Shopify export.");
  return { collection, source: "shopify", skipped };
}

/** Every image URL used by collection items. */
export function collectionImages(collections: Collection[] = []) {
  return collections.flatMap((c) => {
    const images = c.fields.filter((f) => f.type === "image").map((f) => f.id);
    return c.items
      .flatMap((i) => images.map((f) => i.values[f] ?? ""))
      .filter(Boolean);
  });
}
/** Replace image URLs in collection items in place, e.g. for portable exports. */
export function replaceCollectionImages(
  collections: Collection[] = [],
  replace: (src: string) => string | undefined,
) {
  for (const c of collections) {
    const images = c.fields.filter((f) => f.type === "image").map((f) => f.id);
    for (const i of c.items)
      for (const f of images)
        if (i.values[f]) i.values[f] = replace(i.values[f]) ?? i.values[f];
  }
}
/** Items that get their own published page. */
export const publishedItems = (collections: Collection[] = []) =>
  collections
    .filter((c) => c.itemPages)
    .flatMap((c) =>
      c.items.filter((i) => !i.hidden).map((item) => ({ collection: c, item })),
    );
