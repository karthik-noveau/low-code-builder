import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AppShell, PageHeading } from "../brand/AppShell";
import { Icon } from "../studio/Icon";
import { useSession } from "../brand/useSession";
import { listSites, request, type Site } from "../cloud/client";
import { commerceRequest, download, loadCommerce } from "./client";
import {
  money,
  type CommerceOverview,
  type ContentEntry,
  type Discount,
  type Order,
  type Product,
} from "./types";
import { ProductEditor } from "./ProductEditor";
import { MarketsEditor } from "./MarketsEditor";
import { parseCsv, toCsv } from "./csv";
import "./commerce.css";

const sections = [
  "Overview",
  "Products",
  "Orders",
  "Customers",
  "Discounts",
  "Content",
  "Inbox",
  "Markets",
  "Team",
  "Integrations",
  "Usage & activity",
] as const;
type Section = (typeof sections)[number];
const descriptions: Record<Section, string> = {
  Overview: "Your catalog, customers, and sales in one place.",
  Products: "Manage the products and variants shoppers can buy.",
  Orders: "Follow each purchase from payment to delivery.",
  Customers: "Understand the people buying from your store.",
  Discounts: "Create offers with clear limits and expiry dates.",
  Content: "Write and publish stories for your storefront.",
  Inbox: "Read form submissions and preview store emails.",
  Markets: "Choose where you sell, and how you price and deliver.",
  Team: "Give collaborators the access they need.",
  Integrations: "Connect local tools to signed commerce events.",
  "Usage & activity":
    "Review activity, export your records, and track local usage.",
};
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
function Empty({
  title,
  icon = "sparkles",
  children,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className="commerce-panel commerce-empty">
      <span className="commerce-empty-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
/** The search field at the top of a table card. */
function SearchRow({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="commerce-index-search">
      <Icon name="search" size={15} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
/** Row selection for a table: checkboxes, select-all, and the selected ids still on screen. */
interface Selection {
  ids: string[];
  selected: string[];
  cell: (id: string, label: string) => ReactNode;
  toggleAll: () => void;
  clear: () => void;
}
function useSelection(ids: string[]): Selection {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Rows that disappear (filtered, deleted, refreshed) drop out of the selection.
  const selected = ids.filter((id) => picked.has(id));
  return {
    ids,
    selected,
    cell: (id, label) => (
      <td className="commerce-select-cell">
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          checked={picked.has(id)}
          onChange={() =>
            setPicked((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      </td>
    ),
    toggleAll: () =>
      setPicked(selected.length === ids.length ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}
function Table({
  headings,
  children,
  selection,
  bulkActions,
}: {
  headings: string[];
  children: ReactNode;
  selection?: Selection;
  /** Shown in place of the headings while rows are selected. */
  bulkActions?: ReactNode;
}) {
  // Column headings over no rows read as broken; the caller's empty message is enough.
  if (!Children.count(children)) return null;
  const count = selection?.selected.length ?? 0;
  const all = !!selection && count === selection.ids.length;
  return (
    <div className="commerce-scroll">
      <table
        className={`commerce-table ${selection ? "is-selectable" : ""} ${count ? "has-selection" : ""}`}
      >
        <thead>
          <tr>
            {selection && (
              <th className="commerce-select-cell">
                <input
                  type="checkbox"
                  aria-label={all ? "Deselect all" : "Select all"}
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = count > 0 && !all;
                  }}
                  onChange={selection.toggleAll}
                />
              </th>
            )}
            {count ? (
              <th colSpan={headings.length} className="commerce-bulk">
                <div>
                  <strong>{count} selected</strong>
                  {bulkActions}
                  <button className="commerce-link" onClick={selection!.clear}>
                    Clear
                  </button>
                </div>
              </th>
            ) : (
              headings.map((h) => <th key={h}>{h}</th>)
            )}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Totals({
  order,
}: {
  order: Pick<
    Order,
    "subtotal" | "discount" | "shipping" | "tax" | "total" | "currency"
  >;
}) {
  return (
    <div>
      {(
        [
          ["Subtotal", order.subtotal],
          ["Discount", -order.discount],
          ["Shipping", order.shipping],
          ["Tax", order.tax],
          ["Total", order.total],
        ] as [string, number][]
      ).map(([label, amount]) => (
        <div
          key={label}
          className={`commerce-total-row ${label === "Total" ? "total" : ""}`}
        >
          <span>{label}</span>
          <span>{money(amount, order.currency)}</span>
        </div>
      ))}
    </div>
  );
}

export function CommercePage({ initialSiteId }: { initialSiteId: string }) {
  const session = useSession();
  const [siteId, setSiteId] = useState(initialSiteId),
    [sites, setSites] = useState<Site[]>([]);
  const [section, setSection] = useState<Section>("Overview"),
    [data, setData] = useState<CommerceOverview>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [editingProduct, setEditingProduct] = useState<Product | "new">(),
    [editingContent, setEditingContent] = useState<ContentEntry | "new">();
  const [selectedOrder, setSelectedOrder] = useState<string>(),
    [tracking, setTracking] = useState(""),
    [restock, setRestock] = useState(true);
  const [integrationPreview, setIntegrationPreview] = useState("");
  const loadGeneration = useRef(0);
  const refresh = useCallback(async () => {
    if (!siteId) return;
    const generation = ++loadGeneration.current;
    const result = await loadCommerce(siteId);
    if (generation === loadGeneration.current) setData(result);
  }, [siteId]);
  useEffect(() => {
    if (!session.account) {
      if (!session.loading) setLoading(false);
      return;
    }
    let active = true;
    listSites()
      .then((result) => {
        if (active) {
          setSites(result.sites);
          if (!initialSiteId && result.sites[0]) setSiteId(result.sites[0].id);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session.account, session.loading, initialSiteId]);
  useEffect(() => {
    if (!session.account || !siteId) return;
    let active = true;
    loadCommerce(siteId)
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session.account, siteId]);
  const perform = async (
    path: string,
    input: unknown,
    message: string,
    method?: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await commerceRequest(siteId, path, input, method);
      await refresh();
      setNotice(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be completed.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const go = (next: Section) => {
    setSection(next);
    setSearch("");
    setEditingProduct(undefined);
    setEditingContent(undefined);
    setSelectedOrder(undefined);
    setNotice("");
  };
  const canEdit = !!data && data.role !== "viewer",
    canManage = data?.role === "owner" || data?.role === "manager";
  const filteredProducts =
    data?.products.filter((p) =>
      `${p.title} ${p.collection} ${p.variants.map((v) => v.sku).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const selected = data?.orders.find((order) => order.id === selectedOrder);
  const filteredOrders =
    data?.orders.filter((o) =>
      `${o.id} ${o.email} ${o.address.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const productSelection = useSelection(filteredProducts.map((p) => p.id));
  const orderSelection = useSelection(filteredOrders.map((o) => o.id));
  const customerSelection = useSelection(
    data?.customers.map((c) => c.id) || [],
  );
  /** Runs one request per selected row, then reports what worked. */
  const bulk = async <T,>(
    items: T[],
    run: (item: T) => Promise<unknown>,
    done: (count: number) => string,
    after?: () => void,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    let ok = 0;
    let failure = "";
    for (const item of items) {
      try {
        await run(item);
        ok++;
      } catch (e) {
        failure ||= e instanceof Error ? e.message : "Something went wrong.";
      }
    }
    try {
      await refresh();
    } catch {
      /* the next load shows the current state */
    }
    setBusy(false);
    after?.();
    if (ok) setNotice(done(ok));
    if (failure)
      setError(
        `${items.length - ok} of ${items.length} couldn’t be updated: ${failure}`,
      );
  };
  const setProductStatus = (status: Product["status"]) => {
    const items = (data?.products || []).filter(
      (p) => productSelection.selected.includes(p.id) && p.status !== status,
    );
    if (!items.length) {
      setNotice(`Selected products are already ${status}.`);
      return;
    }
    void bulk(
      items,
      (p) => commerceRequest(siteId, "products", { ...p, status }),
      (n) => `${n} product${n === 1 ? "" : "s"} set to ${status}.`,
      productSelection.clear,
    );
  };
  const fulfillOrders = () => {
    const chosen = (data?.orders || []).filter((o) =>
      orderSelection.selected.includes(o.id),
    );
    const items = chosen.filter((o) => o.status === "paid");
    if (!items.length) {
      setError("Only paid orders can be fulfilled.");
      return;
    }
    void bulk(
      items,
      (o) =>
        commerceRequest(siteId, `orders/${o.id}`, {
          action: "fulfill",
          revision: o.revision,
        }),
      (n) =>
        `${n} order${n === 1 ? "" : "s"} marked fulfilled.` +
        (chosen.length > items.length
          ? ` ${chosen.length - items.length} skipped (not paid).`
          : ""),
      orderSelection.clear,
    );
  };
  const exportOrders = (orders: Order[]) =>
    download(
      "orders.csv",
      toCsv([
        ["order", "email", "status", "currency", "total", "created"],
        ...orders.map((o) => [
          o.id,
          o.email,
          o.status,
          o.currency,
          String(o.total / 100),
          o.createdAt,
        ]),
      ]),
      "text/csv",
    );
  const exportCustomers = (ids: string[]) =>
    download(
      "customers.csv",
      toCsv([
        ["name", "email", "orders", "last purchase"],
        ...(data?.customers || [])
          .filter((c) => ids.includes(c.id))
          .map((c) => [c.name, c.email, String(c.orders), c.updatedAt]),
      ]),
      "text/csv",
    );
  const exportProducts = (only?: string[]) => {
    if (data)
      download(
        "products.csv",
        toCsv([
          [
            "title",
            "description",
            "collection",
            "image",
            "status",
            "variant",
            "sku",
            "price",
            "stock",
          ],
          ...data.products
            .filter((p) => !only || only.includes(p.id))
            .flatMap((p) =>
              p.variants.map((v) => [
                p.title,
                p.description,
                p.collection,
                p.image,
                p.status,
                v.title,
                v.sku,
                String(v.price / 100),
                String(v.stock),
              ]),
            ),
        ]),
        "text/csv",
      );
  };
  const importProducts = async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (file.size > 1024 * 1024)
        throw new Error("CSV files must be under 1 MB.");
      const [headings, ...rows] = parseCsv(await file.text());
      const expected = [
        "title",
        "description",
        "collection",
        "image",
        "status",
        "variant",
        "sku",
        "price",
        "stock",
      ];
      if (
        !headings ||
        expected.some((h, i) => headings[i] !== h) ||
        headings.length !== expected.length
      )
        throw new Error(
          `CSV columns must be: ${expected.join(", ")}. Export a catalog to get the template.`,
        );
      if (!rows.length || rows.length > 500)
        throw new Error("Import between one and 500 variant rows.");
      const groups = new Map<
        string,
        {
          title: string;
          description: string;
          collection: string;
          image: string;
          status: string;
          variants: {
            title: string;
            sku: string;
            price: number;
            stock: number;
            prices: object;
          }[];
        }
      >();
      for (const [
        title,
        description,
        collection,
        image,
        status,
        variant,
        sku,
        price,
        stock,
      ] of rows) {
        if (
          !title ||
          !Number.isFinite(Number(price)) ||
          !Number.isInteger(Number(stock)) ||
          !price.trim() ||
          !stock.trim() ||
          Number(price) < 0 ||
          Number(stock) < 0
        )
          throw new Error(
            "Every row needs a title, nonnegative price, and whole stock quantity.",
          );
        const group = groups.get(title) || {
          title,
          description,
          collection,
          image,
          status,
          variants: [],
        };
        group.variants.push({
          title: variant || "Default",
          sku,
          price: Math.round(Number(price) * 100),
          stock: Number(stock),
          prices: {},
        });
        groups.set(title, group);
      }
      let completed = 0;
      for (const product of groups.values()) {
        try {
          await commerceRequest(siteId, "products", product);
          completed++;
        } catch (e) {
          throw new Error(
            `${completed} products imported before the error: ${e instanceof Error ? e.message : "Could not import"}. Existing products were preserved.`,
          );
        }
      }
      await refresh();
      setNotice(
        `Imported ${completed} new products. Imports create new products; edit existing products from the catalog.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const panel = () => {
    if (!data) return null;
    if (section === "Overview")
      return (
        <>
          <div className="commerce-stats">
            <div className="commerce-stat">
              <span>Net sales</span>
              <strong>
                {money(
                  data.usage.currencyTotals[data.settings.currency] || 0,
                  data.settings.currency,
                )}
              </strong>
              <small>Paid orders, excluding refunds</small>
            </div>
            <div className="commerce-stat">
              <span>Paid orders</span>
              <strong>{data.analytics.paidOrders}</strong>
              <small>Across all markets</small>
            </div>
            <div className="commerce-stat">
              <span>Active products</span>
              <strong>
                {data.products.filter((p) => p.status === "active").length}
              </strong>
              <small>{data.products.length} products in your catalog</small>
            </div>
            <div className="commerce-stat">
              <span>Customers</span>
              <strong>{data.customers.length}</strong>
              <small>
                {data.analytics.returningCustomers} returning customers
              </small>
            </div>
          </div>
          <div className="commerce-columns">
            <SetupGuide
              steps={[
                {
                  title: "Add your first product",
                  note: "Set prices, variants, and available stock.",
                  done: !!data.products.length,
                  to: "Products" as Section,
                  action: "Add product",
                },
                {
                  title: "Set up your market",
                  note: "Review currency, delivery countries, shipping, and tax.",
                  done: data.settings.revision > 1,
                  to: "Markets" as Section,
                  action: "Review market",
                },
                {
                  title: "Open your storefront",
                  note: "Enable the store in Markets and test a purchase.",
                  done: data.settings.enabled,
                  to: "Markets" as Section,
                  action: "Open storefront",
                },
                {
                  title: "Complete a sandbox order",
                  note: "Test payment, fulfillment, and refund behavior.",
                  done: !!data.orders.length,
                  to: "Orders" as Section,
                  action: "View orders",
                },
              ]}
              go={go}
            />
            <section className="commerce-panel">
              <h2>Buying journey</h2>
              <p className="commerce-muted">
                Recorded server events from this local store.
              </p>
              <ul className="admin-metric-list">
                {[
                  ["Carts created", "cart.created"],
                  ["Checkouts started", "checkout.started"],
                  ["Payments completed", "order.paid"],
                  ["Orders fulfilled", "order.fulfilled"],
                  ["Orders refunded", "order.refunded"],
                ].map(([label, key]) => (
                  <li key={key}>
                    {label}
                    <strong>{data.analytics.events[key] || 0}</strong>
                  </li>
                ))}
              </ul>
              <p className="commerce-footer-note">
                Payments and notification emails use the local sandbox. No money
                is collected and no emails leave this computer.
              </p>
            </section>
          </div>
          {Object.entries(data.usage.currencyTotals).length > 1 && (
            <section className="commerce-panel">
              <h2>Sales by currency</h2>
              {Object.entries(data.usage.currencyTotals).map(
                ([code, amount]) => (
                  <div className="commerce-total-row" key={code}>
                    <span>{code}</span>
                    <strong>{money(amount, code)}</strong>
                  </div>
                ),
              )}
              <p className="commerce-muted">
                Currencies are kept separate; totals are not converted using an
                assumed exchange rate.
              </p>
            </section>
          )}
        </>
      );
    if (section === "Products")
      return editingProduct ? (
        <ProductEditor
          key={typeof editingProduct === "string" ? "new" : editingProduct.id}
          product={editingProduct === "new" ? undefined : editingProduct}
          currency={data.settings.currency}
          currencies={[
            ...new Set(data.settings.markets.map((m) => m.currency)),
          ]}
          busy={busy}
          onSave={(input) => perform("products", input, "Product saved.")}
          onCancel={() => setEditingProduct(undefined)}
        />
      ) : (
        <>
          <div className="commerce-toolbar is-actions">
            <div className="commerce-actions">
              <button
                className="commerce-button secondary"
                onClick={() => exportProducts()}
              >
                Export CSV
              </button>
              {canEdit && (
                <label className="commerce-button secondary commerce-import">
                  Import CSV
                  <input
                    aria-label="Import products CSV"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(e) => {
                      void importProducts(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {canEdit && (
                <button
                  className="commerce-button"
                  onClick={() => setEditingProduct("new")}
                >
                  + Add product
                </button>
              )}
            </div>
          </div>
          {!data.products.length ? (
            <Empty icon="store" title="Your catalog starts here">
              <p>
                Add the things you sell, then set up their options, prices, and
                stock.
              </p>
              {canEdit && (
                <button
                  className="commerce-button"
                  onClick={() => setEditingProduct("new")}
                >
                  Add product
                </button>
              )}
            </Empty>
          ) : (
            <div className="commerce-panel commerce-index">
              <SearchRow
                label="Search products"
                placeholder="Search products, collections, or SKUs"
                value={search}
                onChange={setSearch}
              />
              {!filteredProducts.length && (
                <p className="commerce-index-empty">
                  No products match “{search}”.
                </p>
              )}
              <Table
                headings={["Product", "Status", "Inventory", "Price", ""]}
                selection={productSelection}
                bulkActions={
                  <>
                    {canEdit && (
                      <>
                        <button
                          className="commerce-button secondary"
                          disabled={busy}
                          onClick={() => setProductStatus("active")}
                        >
                          Set active
                        </button>
                        <button
                          className="commerce-button secondary"
                          disabled={busy}
                          onClick={() => setProductStatus("draft")}
                        >
                          Set draft
                        </button>
                        <button
                          className="commerce-button secondary"
                          disabled={busy}
                          onClick={() => setProductStatus("archived")}
                        >
                          Archive
                        </button>
                      </>
                    )}
                    <button
                      className="commerce-button secondary"
                      onClick={() => exportProducts(productSelection.selected)}
                    >
                      Export
                    </button>
                  </>
                }
              >
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    {productSelection.cell(p.id, p.title)}
                    <td>
                      <div className="commerce-product-cell">
                        {p.image && <img src={p.image} alt="" />}
                        <div>
                          <strong>{p.title}</strong>
                          <small>
                            {p.collection || "Uncategorized"} ·{" "}
                            {p.variants.length} variant
                            {p.variants.length === 1 ? "" : "s"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`commerce-badge ${p.status === "active" ? "" : "neutral"}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {p.variants.reduce((sum, v) => sum + v.stock, 0)} in stock
                    </td>
                    <td>
                      {money(
                        Math.min(...p.variants.map((v) => v.price)),
                        data.settings.currency,
                      )}
                    </td>
                    <td>
                      {canEdit && (
                        <button
                          className="commerce-link"
                          onClick={() => setEditingProduct(p)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </>
      );
    if (section === "Orders")
      return selected ? (
        <>
          <button
            className="commerce-link"
            onClick={() => setSelectedOrder(undefined)}
          >
            ← All orders
          </button>
          <div className="commerce-columns" style={{ marginTop: 18 }}>
            <div className="commerce-panel">
              <div className="commerce-toolbar">
                <h2>Order {selected.id.slice(0, 8)}</h2>
                <span className="commerce-badge">{selected.status}</span>
              </div>
              <p className="commerce-muted">
                {date(selected.createdAt)} · Local sandbox payment
              </p>
              <div className="commerce-order-lines">
                {selected.lines.map((line) => (
                  <div key={line.variantId}>
                    <span>
                      <strong>{line.title}</strong>
                      <br />
                      {line.variant} × {line.quantity}
                    </span>
                    <span>{money(line.total, selected.currency)}</span>
                  </div>
                ))}
              </div>
              <Totals order={selected} />
            </div>
            <div className="commerce-panel">
              <h2>Customer & delivery</h2>
              <p className="commerce-article">
                {selected.address.name}
                {"\n"}
                {selected.email}
                {"\n"}
                {selected.address.line1}
                {"\n"}
                {selected.address.city}, {selected.address.postalCode}
                {"\n"}
                {selected.address.country}
              </p>
              {selected.tracking && (
                <p className="commerce-muted">Tracking: {selected.tracking}</p>
              )}
              {canManage && (
                <div className="commerce-form">
                  {selected.returnRequest && (
                    <div className="commerce-notice">
                      <strong>Return {selected.returnRequest.status}</strong>
                      <p>{selected.returnRequest.reason}</p>
                      {selected.returnRequest.status === "requested" && (
                        <div className="commerce-actions">
                          <button
                            className="commerce-button secondary"
                            disabled={busy}
                            onClick={() =>
                              void perform(
                                `orders/${selected.id}`,
                                {
                                  revision: selected.revision,
                                  action: "approve-return",
                                },
                                "Return approved. Record the refund after receiving the returned items.",
                              )
                            }
                          >
                            Approve return
                          </button>
                          <button
                            className="commerce-button secondary"
                            disabled={busy}
                            onClick={() =>
                              void perform(
                                `orders/${selected.id}`,
                                {
                                  revision: selected.revision,
                                  action: "reject-return",
                                },
                                "Return request rejected.",
                              )
                            }
                          >
                            Reject return
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {selected.status === "paid" && (
                    <>
                      <label className="commerce-field">
                        Tracking reference
                        <input
                          value={tracking}
                          onChange={(e) => setTracking(e.target.value)}
                          placeholder="Carrier and tracking number"
                        />
                      </label>
                      <button
                        className="commerce-button"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            `orders/${selected.id}`,
                            {
                              revision: selected.revision,
                              action: "fulfill",
                              tracking,
                            },
                            "Order fulfilled.",
                          )
                        }
                      >
                        Mark fulfilled
                      </button>
                    </>
                  )}
                  {selected.status === "pending" && (
                    <button
                      className="commerce-button secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          `orders/${selected.id}`,
                          { revision: selected.revision, action: "cancel" },
                          "Pending order cancelled.",
                        )
                      }
                    >
                      Cancel pending order
                    </button>
                  )}
                  {["paid", "fulfilled"].includes(selected.status) && (
                    <>
                      <label className="commerce-check">
                        <input
                          type="checkbox"
                          checked={restock}
                          onChange={(e) => setRestock(e.target.checked)}
                        />{" "}
                        Return items to inventory
                      </label>
                      <button
                        className="commerce-button secondary"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            `orders/${selected.id}`,
                            {
                              revision: selected.revision,
                              action: "refund",
                              restock,
                            },
                            "Sandbox refund recorded.",
                          )
                        }
                      >
                        Refund full order · sandbox
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {!!data.orders.length && (
            <div className="commerce-toolbar is-actions">
              <button
                className="commerce-button secondary"
                onClick={() => exportOrders(data.orders)}
              >
                Export orders
              </button>
            </div>
          )}
          {!data.orders.length ? (
            <Empty icon="checklist" title="Ready for your first order">
              <p>
                Orders appear here when a shopper starts checkout. Open the
                storefront to try the complete flow.
              </p>
              <a
                className="commerce-button secondary"
                href={`/store?site=${siteId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open storefront ↗
              </a>
            </Empty>
          ) : (
            <div className="commerce-panel commerce-index">
              <SearchRow
                label="Search orders"
                placeholder="Search order or customer"
                value={search}
                onChange={setSearch}
              />
              {!filteredOrders.length && (
                <p className="commerce-index-empty">
                  No orders match “{search}”.
                </p>
              )}
              <Table
                headings={["Order", "Customer", "Status", "Total", ""]}
                selection={orderSelection}
                bulkActions={
                  <>
                    {canManage && (
                      <button
                        className="commerce-button secondary"
                        disabled={busy}
                        onClick={fulfillOrders}
                      >
                        Mark fulfilled
                      </button>
                    )}
                    <button
                      className="commerce-button secondary"
                      onClick={() =>
                        exportOrders(
                          data.orders.filter((o) =>
                            orderSelection.selected.includes(o.id),
                          ),
                        )
                      }
                    >
                      Export
                    </button>
                  </>
                }
              >
                {filteredOrders.map((o) => (
                  <tr key={o.id}>
                    {orderSelection.cell(o.id, `order ${o.id.slice(0, 8)}`)}
                    <td>
                      <strong>#{o.id.slice(0, 8)}</strong>
                      <small>{date(o.createdAt)}</small>
                    </td>
                    <td>
                      {o.address.name}
                      <small>{o.email}</small>
                    </td>
                    <td>
                      <span className="commerce-badge">{o.status}</span>
                    </td>
                    <td>{money(o.total, o.currency)}</td>
                    <td>
                      <button
                        className="commerce-link"
                        onClick={() => {
                          setSelectedOrder(o.id);
                          setTracking(o.tracking);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </>
      );
    if (section === "Customers")
      return !data.customers.length ? (
        <Empty icon="heart" title="No customers yet">
          <p>Customer records are created after a successful payment.</p>
        </Empty>
      ) : (
        <div className="commerce-panel">
          <Table
            headings={["Customer", "Orders", "Net spend", "Last purchase"]}
            selection={customerSelection}
            bulkActions={
              <button
                className="commerce-button secondary"
                onClick={() => exportCustomers(customerSelection.selected)}
              >
                Export
              </button>
            }
          >
            {data.customers.map((c) => (
              <tr key={c.id}>
                {customerSelection.cell(c.id, c.name || c.email)}
                <td>
                  <strong>{c.name}</strong>
                  <small>{c.email}</small>
                </td>
                <td>{c.orders}</td>
                <td>
                  {Object.entries(c.spent).map(([code, amount]) => (
                    <div key={code}>{money(amount, code)}</div>
                  ))}
                </td>
                <td>{date(c.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        </div>
      );
    if (section === "Discounts")
      return (
        <>
          <DiscountForm
            currency={data.settings.currency}
            disabled={busy || !canManage}
            onSave={(input) => perform("discounts", input, "Discount created.")}
          />
          <div className="commerce-panel">
            <Table headings={["Code", "Offer", "Used", "Expires", "Status"]}>
              {data.discounts.map((d) => (
                <tr key={d.code}>
                  <td>
                    <strong>{d.code}</strong>
                    <small>Minimum {money(d.minimum, d.currency)}</small>
                  </td>
                  <td>
                    {d.kind === "percent"
                      ? `${d.value}%`
                      : money(d.value, d.currency)}
                  </td>
                  <td>
                    {d.uses}
                    {d.maxUses ? ` / ${d.maxUses}` : ""}
                  </td>
                  <td>{d.expiresAt ? date(d.expiresAt) : "No expiry"}</td>
                  <td>
                    <button
                      className="commerce-link"
                      disabled={busy || !canManage}
                      onClick={() =>
                        void perform(
                          "discounts",
                          { ...d, active: !d.active },
                          d.active ? "Discount paused." : "Discount activated.",
                        )
                      }
                    >
                      {d.active ? "Pause" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            {!data.discounts.length && (
              <p className="commerce-muted">No discount codes yet.</p>
            )}
          </div>
        </>
      );
    if (section === "Content")
      return editingContent ? (
        <ContentForm
          entry={editingContent === "new" ? undefined : editingContent}
          busy={busy}
          onSave={(input) => perform("content", input, "Article saved.")}
          onCancel={() => setEditingContent(undefined)}
        />
      ) : (
        <>
          <div className="commerce-toolbar">
            <p className="commerce-muted">
              Published articles appear in your storefront journal.
            </p>
            {canEdit && (
              <button
                className="commerce-button"
                onClick={() => setEditingContent("new")}
              >
                + Write an article
              </button>
            )}
          </div>
          <div className="commerce-panel">
            <Table headings={["Article", "URL", "Status", ""]}>
              {data.content.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{entry.title}</strong>
                    <small>{date(entry.updatedAt)}</small>
                  </td>
                  <td>{entry.slug}</td>
                  <td>
                    <span className="commerce-badge">{entry.status}</span>
                  </td>
                  <td>
                    {canEdit && (
                      <button
                        className="commerce-link"
                        onClick={() => setEditingContent(entry)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {!data.content.length && (
              <p className="commerce-muted">
                Share your first story with customers.
              </p>
            )}
          </div>
        </>
      );
    if (section === "Inbox")
      return (
        <>
          <section className="commerce-panel">
            <h2>Form submissions</h2>
            <Table headings={["From", "Type", "Message", "Received"]}>
              {data.submissions.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name || s.email}</strong>
                    <small>{s.email}</small>
                  </td>
                  <td>{s.kind}</td>
                  <td>{s.message || "Subscribed with consent"}</td>
                  <td>{date(s.createdAt)}</td>
                </tr>
              ))}
            </Table>
            {!data.submissions.length && (
              <p className="commerce-muted">
                Contact messages and newsletter signups appear here.
              </p>
            )}
          </section>
          <CampaignForm
            disabled={busy || !canManage}
            onPreview={async (input) => {
              try {
                const result = await commerceRequest(
                  siteId,
                  "campaign-preview",
                  input,
                );
                setIntegrationPreview(JSON.stringify(result, null, 2));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Preview failed.");
              }
            }}
          />
          {integrationPreview && (
            <pre className="commerce-code">{integrationPreview}</pre>
          )}
          <section className="commerce-panel">
            <h2>Email previews</h2>
            <p className="commerce-muted">
              Order and team notifications are captured locally. These messages
              have not been sent.
            </p>
            {data.outbox.map((mail) => (
              <details key={mail.id} className="commerce-step">
                <summary>
                  {mail.subject}{" "}
                  <span className="commerce-muted">· {mail.to}</span>
                </summary>
                <p className="commerce-article">{mail.body}</p>
              </details>
            ))}
            {!data.outbox.length && (
              <p className="commerce-muted">No notifications yet.</p>
            )}
          </section>
        </>
      );
    if (section === "Markets")
      return (
        <MarketsEditor
          key={data.settings.revision}
          settings={data.settings}
          busy={busy}
          canManage={canManage}
          onSave={(input) =>
            perform("settings", input, "Store settings saved.", "PUT")
          }
        />
      );
    if (section === "Team")
      return (
        <>
          <div className="commerce-notice">
            Owner: all actions. Manager: commerce settings, orders, and
            publishing. Editor: products, content, and website drafts. Viewer:
            read-only access. Local collaborators need an existing account.
          </div>
          {data.role === "owner" && (
            <form
              className="commerce-panel commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fields = new FormData(form);
                void perform(
                  "members",
                  { email: fields.get("email"), role: fields.get("role") },
                  "Collaborator access saved.",
                ).then((ok) => {
                  if (ok) form.reset();
                });
              }}
            >
              <div className="commerce-form-grid">
                <label className="commerce-field">
                  Collaborator email
                  <input required type="email" name="email" />
                </label>
                <label className="commerce-field">
                  Role
                  <select name="role">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
              </div>
              <button className="commerce-button" disabled={busy}>
                Add collaborator
              </button>
            </form>
          )}
          <div className="commerce-panel">
            <Table headings={["Member", "Role", ""]}>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                  <td>
                    {data.role === "owner" && (
                      <button
                        className="commerce-link"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            `members/${m.id}/remove`,
                            {},
                            "Access revoked.",
                          )
                        }
                      >
                        Revoke access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {!data.members.length && (
              <p className="commerce-muted">
                Only the site owner currently has access.
              </p>
            )}
          </div>
        </>
      );
    if (section === "Integrations")
      return (
        <>
          <div className="commerce-notice">
            Local event feeds are signed with HMAC-SHA256. This workspace does
            not send outbound webhooks or connect to external sales channels
            yet.
          </div>
          {data.role === "owner" && (
            <form
              className="commerce-panel commerce-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fields = new FormData(form);
                setBusy(true);
                void commerceRequest<{ secret: string }>(
                  siteId,
                  "integrations",
                  {
                    name: fields.get("name"),
                    events: [
                      "order.paid",
                      "order.fulfilled",
                      "order.refunded",
                      "product.updated",
                    ],
                    enabled: true,
                  },
                )
                  .then(async (result) => {
                    setIntegrationPreview(
                      `Signing secret (shown only now): ${result.secret}\nKeep this secret private.`,
                    );
                    await refresh();
                    form.reset();
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label className="commerce-field">
                Integration name
                <input
                  required
                  name="name"
                  placeholder="Warehouse sandbox"
                  maxLength={80}
                />
              </label>
              <button className="commerce-button" disabled={busy}>
                Create local event feed
              </button>
            </form>
          )}
          <div className="commerce-panel">
            {data.integrations.map((item) => (
              <div className="commerce-step" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="commerce-muted">
                    {item.events.join(", ")}
                  </span>
                </div>
                {data.role === "owner" && (
                  <button
                    className="commerce-link"
                    onClick={() => {
                      void commerceRequest(
                        siteId,
                        `integrations/${item.id}/events`,
                      )
                        .then((result) =>
                          setIntegrationPreview(
                            JSON.stringify(result, null, 2),
                          ),
                        )
                        .catch((e) => setError(e.message));
                    }}
                  >
                    Inspect events
                  </button>
                )}
              </div>
            ))}
            {!data.integrations.length && (
              <p className="commerce-muted">No integrations connected.</p>
            )}
          </div>
          {integrationPreview && (
            <pre className="commerce-code">{integrationPreview}</pre>
          )}
        </>
      );
    return (
      <>
        <div className="commerce-stats">
          <div className="commerce-stat">
            <span>Products</span>
            <strong>{data.usage.products}</strong>
            <small>500 product local limit</small>
          </div>
          <div className="commerce-stat">
            <span>Order records</span>
            <strong>{data.usage.orders}</strong>
            <small>Includes pending and refunded</small>
          </div>
          <div className="commerce-stat">
            <span>Form submissions</span>
            <strong>{data.usage.submissions}</strong>
            <small>Contact and newsletter records</small>
          </div>
          <div className="commerce-stat">
            <span>Commerce data</span>
            <strong>{(data.usage.storageBytes / 1024).toFixed(1)} KB</strong>
            <small>Record estimate, excluding site assets</small>
          </div>
        </div>
        <div className="commerce-panel">
          <h2>Local usage, without a bill</h2>
          <p className="commerce-muted">
            These are measured local record counts. Customer billing and live
            cloud cost metering are not enabled. No estimated price is presented
            as an actual invoice.
          </p>
          {data.role === "owner" && (
            <button
              className="commerce-button secondary"
              onClick={() => {
                void commerceRequest(siteId, "export")
                  .then((value) => download(`commerce-${siteId}.json`, value))
                  .catch((e) => setError(e.message));
              }}
            >
              Export commerce records
            </button>
          )}
        </div>
        {data.role === "owner" && (
          <details className="commerce-panel">
            <summary>Delete local website and store</summary>
            <form
              className="commerce-form"
              style={{ marginTop: 20 }}
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                setBusy(true);
                void request(`/sites/${siteId}/delete`, {
                  method: "POST",
                  body: JSON.stringify({
                    confirmation: fields.get("confirmation"),
                  }),
                })
                  .then(() => location.assign("/workspace"))
                  .catch((e) => {
                    setError(e.message);
                    setBusy(false);
                  });
              }}
            >
              <p className="commerce-muted">
                Unpublish the website and remove its domain connections first.
                This permanently deletes its drafts, releases, catalog, orders,
                customer records, and submissions from this local workspace.
                Export anything you want to keep.
              </p>
              <label className="commerce-field">
                Type DELETE{" "}
                {sites.find((s) => s.id === siteId)?.name || data.settings.name}
                <input name="confirmation" required autoComplete="off" />
              </label>
              <button className="commerce-button danger" disabled={busy}>
                Permanently delete local website
              </button>
            </form>
          </details>
        )}
        <section className="commerce-panel">
          <h2>Activity</h2>
          <Table headings={["Action", "Actor", "Target", "Time"]}>
            {data.audit.map((a) => (
              <tr key={a.id}>
                <td>{a.action}</td>
                <td>{a.actor === session.account?.id ? "You" : a.actor}</td>
                <td>{a.target.slice(0, 36)}</td>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
          {!data.audit.length && (
            <p className="commerce-muted">
              Changes you and your team make will be listed here.
            </p>
          )}
        </section>
      </>
    );
  };
  const sectionButtons = (scroll: boolean) =>
    sections.map((item) => (
      <button
        key={item}
        aria-current={section === item ? "page" : undefined}
        // The phone tab row scrolls sideways; keep the current section in view.
        ref={
          scroll
            ? (el) => {
                if (el && section === item)
                  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
              }
            : undefined
        }
        onClick={() => go(item)}
      >
        {item}
      </button>
    ));
  return (
    <AppShell
      area="store"
      searchItems={[
        ...sections.map((item) => ({
          id: `section-${item}`,
          label: item,
          hint: descriptions[item],
          group: "Store",
          icon: "store",
          run: () => go(item),
        })),
        ...(data?.products || []).map((p) => ({
          id: `product-${p.id}`,
          label: p.title,
          hint: `Product · ${p.status}`,
          group: "Products",
          icon: "edit",
          run: () => {
            go("Products");
            if (canEdit) setEditingProduct(p);
          },
        })),
        ...(data?.orders || []).map((o) => ({
          id: `order-${o.id}`,
          label: `Order #${o.id.slice(0, 8)} · ${o.address.name}`,
          hint: `${o.status} · ${money(o.total, o.currency)}`,
          group: "Orders",
          icon: "checklist",
          run: () => {
            go("Orders");
            setSelectedOrder(o.id);
            setTracking(o.tracking);
          },
        })),
      ]}
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: "Store" },
        { label: section },
      ]}
      headerExtra={
        sites.length > 1 && (
          <select
            className="commerce-site-switch"
            aria-label="Website"
            value={siteId}
            onChange={(e) => {
              setData(undefined);
              setLoading(true);
              setSiteId(e.target.value);
              setSection("Overview");
              setError("");
            }}
            disabled={busy}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        )
      }
      subnav={<nav aria-label="Store sections">{sectionButtons(false)}</nav>}
    >
      <div className="commerce-app commerce-embedded">
        <nav className="commerce-tabs" aria-label="Store sections">
          {sectionButtons(true)}
        </nav>
        <PageHeading
          kicker={data?.settings.name || "Your store"}
          title={section}
          description={descriptions[section]}
          action={
            siteId && (
              <div className="commerce-actions">
                {data && (
                  <span className="commerce-badge neutral">{data.role}</span>
                )}
                <a
                  className="commerce-button secondary"
                  href={`/editor?site=${siteId}`}
                >
                  Website editor
                </a>
                <a
                  className="commerce-button secondary"
                  href={`/store?site=${siteId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open storefront ↗
                </a>
              </div>
            )
          }
        />
        {(error || session.error) && (
          <div className="commerce-notice error" role="alert">
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
            {error || session.error}
          </div>
        )}
        {notice && (
          <div className="commerce-notice" role="status">
            {notice}
          </div>
        )}
        {session.loading ? (
          <p role="status">Opening your workspace…</p>
        ) : !session.account ? (
          <Empty title="Sign in to manage your store">
            <p>Your products and orders are private to your workspace.</p>
            <a className="commerce-button" href="/login">
              Sign in
            </a>
          </Empty>
        ) : !siteId ? (
          <Empty title="Create a website first">
            <p>Each website has its own catalog, orders, and settings.</p>
            <a className="commerce-button" href="/new">
              Create website
            </a>
          </Empty>
        ) : loading ? (
          <p role="status">Loading store…</p>
        ) : (
          panel()
        )}
      </div>
    </AppShell>
  );
}

function DiscountForm({
  currency,
  disabled,
  onSave,
}: {
  currency: string;
  disabled: boolean;
  onSave: (input: unknown) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<Discount["kind"]>("percent");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const expires = String(data.get("expires") || "");
    if (
      await onSave({
        code: data.get("code"),
        kind,
        value: Number(data.get("value")) * (kind === "fixed" ? 100 : 1),
        currency,
        minimum: Math.round(Number(data.get("minimum")) * 100),
        maxUses: Number(data.get("uses")),
        expiresAt: expires ? new Date(expires).toISOString() : "",
        active: true,
      })
    )
      form.reset();
  };
  return (
    <form
      className="commerce-panel commerce-form"
      onSubmit={(e) => void submit(e)}
    >
      <h2>Create a discount</h2>
      <div className="commerce-form-grid">
        <label className="commerce-field">
          Code
          <input
            name="code"
            required
            maxLength={30}
            pattern="[A-Za-z0-9_-]+"
            placeholder="WELCOME10"
          />
        </label>
        <label className="commerce-field">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Discount["kind"])}
          >
            <option value="percent">Percentage</option>
            <option value="fixed">Fixed amount ({currency})</option>
          </select>
        </label>
        <label className="commerce-field">
          {kind === "percent" ? "Percentage off" : `Amount off (${currency})`}
          <input
            name="value"
            type="number"
            min="1"
            max={kind === "percent" ? 100 : 1000000}
            step={kind === "percent" ? 1 : 0.01}
            defaultValue="10"
            required
          />
        </label>
        <label className="commerce-field">
          Minimum spend ({currency})
          <input
            name="minimum"
            type="number"
            min="0"
            step=".01"
            defaultValue="0"
            required
          />
        </label>
        <label className="commerce-field">
          Maximum uses
          <input name="uses" type="number" min="0" step="1" defaultValue="0" />
          <small>Zero means no usage limit.</small>
        </label>
        <label className="commerce-field">
          Expires
          <input name="expires" type="datetime-local" />
        </label>
      </div>
      <button className="commerce-button" disabled={disabled}>
        Create discount
      </button>
    </form>
  );
}
function ContentForm({
  entry,
  busy,
  onSave,
  onCancel,
}: {
  entry?: ContentEntry;
  busy: boolean;
  onSave: (input: unknown) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(
    () =>
      entry || {
        title: "",
        slug: "",
        body: "",
        status: "draft" as ContentEntry["status"],
      },
  );
  return (
    <form
      className="commerce-panel commerce-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(draft).then((ok) => {
          if (ok) onCancel();
        });
      }}
    >
      <label className="commerce-field">
        Title
        <input
          required
          value={draft.title}
          maxLength={160}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label className="commerce-field">
        URL slug
        <input
          required
          value={draft.slug}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          placeholder="our-story"
        />
      </label>
      <label className="commerce-field">
        Article
        <textarea
          required
          rows={14}
          maxLength={20000}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </label>
      <label className="commerce-field">
        Visibility
        <select
          value={draft.status}
          onChange={(e) =>
            setDraft({
              ...draft,
              status: e.target.value as ContentEntry["status"],
            })
          }
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <div className="commerce-form-footer">
        <button
          type="button"
          className="commerce-button secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="commerce-button" disabled={busy}>
          Save article
        </button>
      </div>
    </form>
  );
}
function CampaignForm({
  disabled,
  onPreview,
}: {
  disabled: boolean;
  onPreview: (input: unknown) => Promise<void>;
}) {
  return (
    <form
      className="commerce-panel commerce-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        void onPreview({
          subject: fields.get("subject"),
          body: fields.get("body"),
        });
      }}
    >
      <h2>Campaign preview</h2>
      <p className="commerce-muted">
        Preview an email for newsletter subscribers who explicitly opted in. No
        email is sent.
      </p>
      <label className="commerce-field">
        Subject
        <input required name="subject" maxLength={160} />
      </label>
      <label className="commerce-field">
        Message
        <textarea required name="body" maxLength={5000} />
      </label>
      <button className="commerce-button secondary" disabled={disabled}>
        Preview recipients & message
      </button>
    </form>
  );
}

/** Shopify-style setup guide: progress, done steps checked, the next one open. */
function SetupGuide({
  steps,
  go,
}: {
  steps: {
    title: string;
    note: string;
    done: boolean;
    to: Section;
    action: string;
  }[];
  go: (section: Section) => void;
}) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="commerce-panel admin-setup">
      <header>
        <h2>Get your store ready</h2>
        <p className="commerce-muted">
          {done === steps.length
            ? "Your store is set up. Everything below can be revisited any time."
            : "Complete the buying journey locally before connecting live services."}
        </p>
        <div className="admin-setup-progress">
          <span
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
          >
            <i style={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
          {done} of {steps.length} tasks complete
        </div>
      </header>
      <ol>
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`${s.done ? "is-done" : ""} ${i === next ? "is-next" : ""}`}
          >
            <span
              className="admin-setup-check"
              role="img"
              aria-label={s.done ? "Done" : "To do"}
            >
              {s.done && <Icon name="check" size={13} />}
            </span>
            <div>
              <strong>{s.title}</strong>
              <p>{s.note}</p>
              {i === next && (
                <button className="commerce-button" onClick={() => go(s.to)}>
                  {s.action}
                </button>
              )}
            </div>
            {i !== next && (
              <button className="commerce-link" onClick={() => go(s.to)}>
                Open
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
