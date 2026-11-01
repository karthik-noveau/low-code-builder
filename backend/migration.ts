/**
 * Moving a store to Forma: customers exported from Shopify, Wix or any
 * spreadsheet (parsed in the browser, src/commerce/migrate.ts) arrive here in
 * batches. Each one is matched by email, so importing the same file twice
 * changes nothing: the history it brings (orders and spend on the old store)
 * replaces what an earlier import from that store added. Shoppers who agreed
 * to marketing there become newsletter subscribers, without a welcome email.
 */
import { allow } from "./access";
import { insist } from "./config";
import { audit, now, put, read, transact } from "./commerce-data";
import { digest, email, ensureStore, object, text } from "./commerce";
import type {
  Customer,
  MigrationSource,
  Submission,
} from "../src/commerce/types";

const SOURCES: MigrationSource[] = ["shopify", "wix", "csv"];
export const CUSTOMER_BATCH = 200;
const whole = (value: unknown, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, max)
    : 0;

export async function importCustomers(
  actor: string,
  siteId: string,
  input: Record<string, unknown>,
) {
  const { access, stored } = await ensureStore(actor, siteId);
  allow(access, "manage");
  const from = input.source as MigrationSource;
  insist(SOURCES.includes(from), 422, "Choose where the customers come from.");
  insist(
    Array.isArray(input.customers) &&
      input.customers.length > 0 &&
      input.customers.length <= CUSTOMER_BATCH,
    422,
    `Send between one and ${CUSTOMER_BATCH} customers at a time.`,
  );
  const { currency } = stored;
  const at = now();
  let created = 0,
    updated = 0,
    subscribed = 0;
  const skipped: string[] = [];
  const seen = new Set<string>();
  const one = async (raw: unknown) => {
    const row = object(raw);
    let address: string;
    try {
      address = email(row.email);
    } catch {
      skipped.push(String(row.email ?? "").slice(0, 254));
      return;
    }
    if (seen.has(address)) return;
    seen.add(address);
    const id = digest(address);
    const name = text(String(row.name ?? "").slice(0, 100), "name", 100, true);
    const phone = String(row.phone ?? "")
      .replace(/[^\d+()\s.-]/g, "")
      .slice(0, 40);
    const history = {
      from,
      orders: whole(row.orders, 1_000_000),
      spent: whole(row.spent, 1_000_000_000_000),
      currency,
      at,
    };
    const previous = await read<Customer & { revision: number }>(
      siteId,
      "CUSTOMER",
      id,
    );
    // An earlier import from the same store is replaced, not added to.
    const earlier =
      previous?.imported?.from === from ? previous.imported : undefined;
    const spent = { ...previous?.spent };
    if (earlier)
      spent[earlier.currency] = Math.max(
        0,
        (spent[earlier.currency] || 0) - earlier.spent,
      );
    if (history.spent) spent[currency] = (spent[currency] || 0) + history.spent;
    for (const code of Object.keys(spent)) if (!spent[code]) delete spent[code];
    const customer: Customer & { revision: number } = {
      id,
      email: address,
      name: previous?.name || name,
      orders:
        Math.max(0, (previous?.orders || 0) - (earlier?.orders || 0)) +
        history.orders,
      spent,
      updatedAt: previous?.updatedAt || at,
      ...((previous?.phone || phone) && { phone: previous?.phone || phone }),
      imported: previous?.imported && !earlier ? previous.imported : history,
      revision: (previous?.revision || 0) + 1,
    };
    const writes = [put(siteId, "CUSTOMER", id, customer, previous?.revision)];
    if (row.marketing === true) {
      const existing = await read<Submission & { revision?: number }>(
        siteId,
        "SUBMISSION",
        id,
      );
      // Someone who unsubscribed here stays unsubscribed.
      if (!existing) {
        writes.push(
          put(siteId, "SUBMISSION", id, {
            id,
            kind: "newsletter",
            email: address,
            name: customer.name,
            message: "",
            consent: true,
            createdAt: at,
            revision: 1,
          } satisfies Submission & { revision: number }),
        );
        subscribed++;
      }
    }
    await transact(writes);
    if (previous) updated++;
    else created++;
  };
  // A few at a time: quick, without crowding the table.
  const queue = [...input.customers];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) await one(queue.shift());
    }),
  );
  await transact([
    audit(siteId, actor, "customers.imported", `${from}:${created + updated}`),
  ]);
  return { created, updated, subscribed, skipped };
}
