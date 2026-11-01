/**
 * Saving what a migration file held (src/commerce/migrate.ts): products one
 * by one through the store API, customers in batches (backend/migration.ts).
 */
import { commerceRequest } from "./client";
import type { CustomerDraft, ProductDraft } from "./migrate";
import type { MigrationSource, Product } from "./types";

/** The catalogue size the store keeps (backend/commerce.ts saveProduct). */
export const MAX_PRODUCTS = 500;
const CUSTOMER_BATCH = 200;

/**
 * Creates products a few at a time. Products whose handle or title is
 * already in the catalogue are skipped, so a second run finishes the first.
 */
export async function importProductDrafts(
  siteId: string,
  drafts: ProductDraft[],
  existing: Product[],
  onProgress: (done: number) => void,
) {
  const handles = new Set(existing.map((p) => p.handle).filter(Boolean));
  const titles = new Set(existing.map((p) => p.title.toLowerCase()));
  const todo = drafts.filter(
    (d) =>
      !(d.handle && handles.has(d.handle)) &&
      !titles.has(d.title.toLowerCase()),
  );
  const room = Math.max(0, MAX_PRODUCTS - existing.length);
  const queue = todo.slice(0, room);
  const failed: { title: string; reason: string }[] = [];
  let created = 0,
    done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let draft = queue.shift(); draft; draft = queue.shift()) {
        try {
          await commerceRequest(siteId, "products", draft);
          created++;
        } catch (e) {
          failed.push({
            title: draft.title,
            reason: e instanceof Error ? e.message : "Couldn’t save",
          });
        }
        onProgress(++done);
      }
    }),
  );
  return {
    created,
    skipped: drafts.length - todo.length,
    overLimit: Math.max(0, todo.length - room),
    failed,
  };
}
export async function importCustomerDrafts(
  siteId: string,
  source: MigrationSource,
  drafts: CustomerDraft[],
  onProgress: (done: number) => void,
) {
  const total = { created: 0, updated: 0, subscribed: 0, skipped: 0 };
  for (let i = 0; i < drafts.length; i += CUSTOMER_BATCH) {
    const result = await commerceRequest<{
      created: number;
      updated: number;
      subscribed: number;
      skipped: string[];
    }>(siteId, "customers", {
      source,
      customers: drafts.slice(i, i + CUSTOMER_BATCH),
    });
    total.created += result.created;
    total.updated += result.updated;
    total.subscribed += result.subscribed;
    total.skipped += result.skipped.length;
    onProgress(Math.min(drafts.length, i + CUSTOMER_BATCH));
  }
  return total;
}
