import { useRef, useState, type DragEvent } from "react";
import { Icon } from "../studio/Icon";
import {
  importCustomerDrafts,
  importProductDrafts,
  MAX_PRODUCTS,
} from "./importer";
import { parseCsv } from "./csv";
import { parseExport, SOURCE_NAMES, type Parsed } from "./migrate";
import { money, type Product } from "./types";

const MAX_FILE = 15 * 1024 * 1024;

const GUIDES: Record<
  "shopify" | "wix" | "csv",
  { name: string; products: string[]; customers: string[]; more: string }
> = {
  shopify: {
    name: "Shopify",
    products: [
      "In Shopify admin, open Products and choose Export.",
      "Pick “All products” and “CSV for Excel, Numbers, or other spreadsheet programs”.",
      "Shopify emails you the file. Drop it here.",
    ],
    customers: [
      "Open Customers and choose Export.",
      "Pick “All customers” and the plain CSV format, then drop it here.",
    ],
    more: "Variants, prices, stock, images, product types and old product links come across. Each customer’s order count, total spend and email marketing consent come too.",
  },
  wix: {
    name: "Wix",
    products: [
      "In your Wix dashboard, open Store Products → Products.",
      "Choose More Actions → Export, and export all products.",
      "Drop the catalog_products.csv file here.",
    ],
    customers: [
      "Open Customers & Leads → Contacts.",
      "Choose More Actions → Export, then drop the CSV here.",
    ],
    more: "Products with their options, surcharges, stock, images and collections come across. Contacts keep their names, phone numbers and subscriber status.",
  },
  csv: {
    name: "Spreadsheet",
    products: [
      "Export a product template from Products → Export.",
      "Fill one row per variant: title, description, collection, image, status, variant, sku, price, stock.",
      "Drop the file here.",
    ],
    customers: [
      "Any CSV with an email column works. Name, first and last name, phone, “accepts marketing”, total orders and total spent are read when present.",
    ],
    more: "WooCommerce, Squarespace, BigCommerce and most store tools export customers this way. For their products, use the Skynoveau template.",
  },
};

type Step =
  | { at: "choose" }
  | { at: "preview"; parsed: Parsed; file: string }
  | { at: "running"; parsed: Parsed; done: number; total: number }
  | { at: "done"; summary: string[]; problems: string[] };

/**
 * Store → Import & migrate: bring a store over from Shopify, Wix or a
 * spreadsheet. The file is read in this browser and shown before anything is
 * saved; products go in one at a time and customers in batches.
 */
export function MigrationPanel({
  siteId,
  products,
  currency,
  canEdit,
  canManage,
  onImported,
  openSection,
}: {
  siteId: string;
  products: Product[];
  currency: string;
  canEdit: boolean;
  canManage: boolean;
  onImported: () => Promise<void>;
  openSection: (section: "Products" | "Customers" | "Markets") => void;
}) {
  const [source, setSource] = useState<keyof typeof GUIDES>("shopify");
  const [step, setStep] = useState<Step>({ at: "choose" });
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const guide = GUIDES[source];

  const read = async (file?: File) => {
    setError("");
    if (!file) return;
    try {
      if (file.size > MAX_FILE)
        throw new Error(
          "Use a CSV under 15 MB. Split a larger export into parts.",
        );
      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv")
        throw new Error("Choose the CSV file your store exported.");
      const parsed = parseExport(parseCsv(await file.text()));
      if (parsed.kind === "products" && !parsed.products.length)
        throw new Error("No products with a price were found in this file.");
      if (parsed.kind === "customers" && !parsed.customers.length)
        throw new Error(
          "No customers with an email address were found in this file.",
        );
      setStep({ at: "preview", parsed, file: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that file.");
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void read(e.dataTransfer.files[0]);
  };

  const run = async (parsed: Parsed) => {
    setError("");
    const total =
      parsed.kind === "products"
        ? parsed.products.length
        : parsed.customers.length;
    setStep({ at: "running", parsed, done: 0, total });
    const progress = (done: number) =>
      setStep({ at: "running", parsed, done, total });
    try {
      if (parsed.kind === "products") {
        const r = await importProductDrafts(
          siteId,
          parsed.products,
          products,
          progress,
        );
        await onImported();
        setStep({
          at: "done",
          summary: [
            `${r.created.toLocaleString()} ${r.created === 1 ? "product" : "products"} added to your catalog.`,
            ...(r.skipped
              ? [
                  `${r.skipped.toLocaleString()} already in your catalog were left as they are.`,
                ]
              : []),
            ...(r.overLimit
              ? [
                  `${r.overLimit.toLocaleString()} weren’t added: the catalog holds ${MAX_PRODUCTS} products.`,
                ]
              : []),
          ],
          problems: r.failed.slice(0, 20).map((f) => `${f.title}: ${f.reason}`),
        });
      } else {
        const r = await importCustomerDrafts(
          siteId,
          parsed.source,
          parsed.customers,
          progress,
        );
        await onImported();
        setStep({
          at: "done",
          summary: [
            `${(r.created + r.updated).toLocaleString()} customers imported (${r.created.toLocaleString()} new, ${r.updated.toLocaleString()} matched by email).`,
            ...(r.subscribed
              ? [
                  `${r.subscribed.toLocaleString()} who agreed to marketing ${r.subscribed === 1 ? "was" : "were"} added to your newsletter list. No email was sent.`,
                ]
              : []),
          ],
          problems: r.skipped
            ? [`${r.skipped} rows had an email address the store couldn’t use.`]
            : [],
        });
      }
    } catch (e) {
      await onImported().catch(() => {});
      setError(
        `${e instanceof Error ? e.message : "The import stopped."} What was imported before this is kept; run the same file again to finish.`,
      );
      setStep({ at: "choose" });
    }
  };

  return (
    <div className="migrate">
      <section className="commerce-panel migrate-hero">
        <div>
          <span className="migrate-kicker">Move to Skynoveau</span>
          <h2>Bring your store over from Shopify, Wix or a spreadsheet</h2>
          <p className="commerce-muted">
            Products, customers and old links come with you. Files are read in
            this browser and shown to you before anything is saved, and
            importing the same file again never makes duplicates.
          </p>
        </div>
        <ol className="migrate-path" aria-label="Migration steps">
          {[
            ["Products", "tag"],
            ["Customers", "users"],
            ["Old links", "link"],
            ["Domain", "globe"],
          ].map(([label, icon], i) => (
            <li key={label}>
              <span aria-hidden="true">
                <Icon name={icon} size={16} />
              </span>
              <small>Step {i + 1}</small>
              {label}
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <div className="commerce-notice error" role="alert">
          {error}
        </div>
      )}

      {step.at === "choose" && (
        <section className="commerce-panel">
          <div
            className="migrate-sources"
            role="tablist"
            aria-label="Moving from"
          >
            {(Object.keys(GUIDES) as (keyof typeof GUIDES)[]).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={source === key}
                className={source === key ? "is-active" : ""}
                onClick={() => setSource(key)}
              >
                <strong>{GUIDES[key].name}</strong>
                <small>
                  {key === "csv"
                    ? "WooCommerce, Squarespace and others"
                    : `Export from ${GUIDES[key].name}`}
                </small>
              </button>
            ))}
          </div>
          <div className="migrate-guides">
            <div>
              <h3>Products</h3>
              <ol>
                {guide.products.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3>Customers</h3>
              <ol>
                {guide.customers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
          </div>
          <p className="commerce-hint">{guide.more}</p>
          <div
            className={`migrate-drop ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" size={22} />
            <strong>Drop a products or customers CSV</strong>
            <span className="commerce-muted">
              Skynoveau recognises Shopify, Wix and its own exports by their
              columns.
            </span>
            <button
              className="commerce-button"
              disabled={!canEdit}
              onClick={() => input.current?.click()}
            >
              Choose file
            </button>
            <input
              ref={input}
              hidden
              type="file"
              accept=".csv,text/csv"
              aria-label="Import file"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {!canEdit && (
              <small className="commerce-muted">
                Viewers can’t import. Ask the owner for edit access.
              </small>
            )}
          </div>
        </section>
      )}

      {step.at === "preview" && (
        <Preview
          parsed={step.parsed}
          file={step.file}
          currency={currency}
          existing={products}
          canImport={step.parsed.kind === "products" ? canEdit : canManage}
          onCancel={() => setStep({ at: "choose" })}
          onImport={() => void run(step.parsed)}
        />
      )}

      {step.at === "running" && (
        <section className="commerce-panel migrate-running" aria-live="polite">
          <h2>
            Importing {step.parsed.kind} from {SOURCE_NAMES[step.parsed.source]}
            …
          </h2>
          <div className="admin-setup-progress">
            <span
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={step.total}
              aria-valuenow={step.done}
            >
              <i
                style={{
                  width: `${(step.done / Math.max(1, step.total)) * 100}%`,
                }}
              />
            </span>
            {step.done.toLocaleString()} of {step.total.toLocaleString()}
          </div>
          <p className="commerce-muted">
            Keep this tab open until it finishes.
          </p>
        </section>
      )}

      {step.at === "done" && (
        <section className="commerce-panel migrate-done">
          <span className="migrate-done-icon" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <h2>Import finished</h2>
          <ul>
            {step.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {!!step.problems.length && (
            <details className="migrate-problems">
              <summary>{step.problems.length} couldn’t be imported</summary>
              <ul>
                {step.problems.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
          <h3>Next</h3>
          <ol className="migrate-next">
            <li>
              <button
                className="commerce-link"
                onClick={() => openSection("Products")}
              >
                Review your products
              </button>{" "}
              and their stock.
            </li>
            <li>
              <button
                className="commerce-link"
                onClick={() => openSection("Customers")}
              >
                Check your customers
              </button>
              . They sign in to their account with an email code. There are no
              passwords to move.
            </li>
            <li>
              Old product links redirect by themselves when you publish. For
              other pages, add{" "}
              <a
                className="commerce-link"
                href={`/editor?site=${encodeURIComponent(siteId)}`}
              >
                moved pages
              </a>{" "}
              in the editor’s Settings.
            </li>
            <li>
              <a
                className="commerce-link"
                href={`/domains?site=${encodeURIComponent(siteId)}`}
              >
                Point your domain
              </a>{" "}
              at Skynoveau when you’re ready to switch.
            </li>
          </ol>
          <button
            className="commerce-button secondary"
            onClick={() => setStep({ at: "choose" })}
          >
            Import another file
          </button>
        </section>
      )}
    </div>
  );
}

function Preview({
  parsed,
  file,
  currency,
  existing,
  canImport,
  onCancel,
  onImport,
}: {
  parsed: Parsed;
  file: string;
  currency: string;
  existing: Product[];
  canImport: boolean;
  onCancel: () => void;
  onImport: () => void;
}) {
  const notes = [...parsed.notes];
  let headline: string;
  if (parsed.kind === "products") {
    const variants = parsed.products.reduce((n, p) => n + p.variants.length, 0);
    headline = `${parsed.products.length.toLocaleString()} products · ${variants.toLocaleString()} variants`;
    const handles = new Set(existing.map((p) => p.handle).filter(Boolean));
    const titles = new Set(existing.map((p) => p.title.toLowerCase()));
    const already = parsed.products.filter(
      (p) =>
        (p.handle && handles.has(p.handle)) ||
        titles.has(p.title.toLowerCase()),
    ).length;
    if (already)
      notes.unshift(
        `${already.toLocaleString()} are already in your catalog and will be skipped.`,
      );
    const room = MAX_PRODUCTS - existing.length;
    if (parsed.products.length - already > room)
      notes.unshift(
        `Your catalog has room for ${Math.max(0, room)} more of these (it holds ${MAX_PRODUCTS} products).`,
      );
  } else {
    const subscribed = parsed.customers.filter((c) => c.marketing).length;
    headline = `${parsed.customers.length.toLocaleString()} customers · ${subscribed.toLocaleString()} subscribed to marketing`;
  }
  return (
    <section className="commerce-panel migrate-preview">
      <header>
        <div>
          <span className="migrate-kicker">
            {SOURCE_NAMES[parsed.source]} {parsed.kind} · {file}
          </span>
          <h2>{headline}</h2>
        </div>
        <div className="commerce-actions">
          <button className="commerce-button secondary" onClick={onCancel}>
            Choose another file
          </button>
          <button
            className="commerce-button"
            disabled={!canImport}
            onClick={onImport}
          >
            Import {parsed.kind}
          </button>
        </div>
      </header>
      {!canImport && (
        <p className="commerce-hint">
          {parsed.kind === "customers"
            ? "Importing customers needs an owner or manager."
            : "Viewers can’t import products."}
        </p>
      )}
      {!!notes.length && (
        <ul className="migrate-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="commerce-scroll">
        {parsed.kind === "products" ? (
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Collection</th>
                <th>Variants</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parsed.products.slice(0, 8).map((p) => {
                const prices = p.variants.map((v) => v.price);
                const low = Math.min(...prices),
                  high = Math.max(...prices);
                return (
                  <tr key={(p.handle || "") + p.title}>
                    <td>
                      <span className="migrate-product">
                        {p.image ? (
                          <img src={p.image} alt="" loading="lazy" />
                        ) : (
                          <i aria-hidden="true" />
                        )}
                        <span>
                          <strong>{p.title}</strong>
                          {p.handle && <small>/products/{p.handle}</small>}
                        </span>
                      </span>
                    </td>
                    <td>{p.collection || "—"}</td>
                    <td>{p.variants.length}</td>
                    <td>
                      {money(low, currency)}
                      {high > low && ` – ${money(high, currency)}`}
                    </td>
                    <td>{p.status[0].toUpperCase() + p.status.slice(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Spent</th>
                <th>Marketing</th>
              </tr>
            </thead>
            <tbody>
              {parsed.customers.slice(0, 8).map((c) => (
                <tr key={c.email}>
                  <td>
                    <strong>{c.name || "—"}</strong>
                    <small>{c.email}</small>
                  </td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.orders}</td>
                  <td>{c.spent ? money(c.spent, currency) : "—"}</td>
                  <td>{c.marketing ? "Subscribed" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(parsed.kind === "products"
        ? parsed.products.length
        : parsed.customers.length) > 8 && (
        <p className="commerce-hint">
          Showing the first 8. Prices are read in your store’s currency (
          {currency}).
        </p>
      )}
    </section>
  );
}
