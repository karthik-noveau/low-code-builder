import { useEffect, useState, type FormEvent } from "react";
import { storeRequest } from "./client";
import { ApiError, request } from "../cloud/client";
import { useSession } from "../brand/useSession";
import {
  money,
  type CartLine,
  type Address,
  type ContentEntry,
  type Order,
  type Product,
  type Quote,
  type StoreSettings,
} from "./types";
import "./commerce.css";

interface Cart {
  revision: number;
  lines: CartLine[];
  marketId: string;
  country: string;
  discountCode: string;
}
interface CartResponse {
  token?: string;
  cart: Cart;
  quote: Quote;
}
interface StoreData {
  settings: StoreSettings;
  products: Product[];
  content: ContentEntry[];
  sandbox: boolean;
}
type Page = "shop" | "cart" | "checkout" | "receipt" | "journal" | "contact";
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
function Totals({ quote }: { quote: Quote }) {
  return (
    <div>
      {(
        [
          ["Subtotal", quote.subtotal],
          ["Discount", -quote.discount],
          ["Shipping", quote.shipping],
          ["Tax", quote.tax],
          ["Total", quote.total],
        ] as [string, number][]
      ).map(([label, amount]) => (
        <div
          key={label}
          className={`commerce-total-row ${label === "Total" ? "total" : ""}`}
        >
          <span>{label}</span>
          <strong>{money(amount, quote.currency)}</strong>
        </div>
      ))}
    </div>
  );
}

export function Storefront({ siteId }: { siteId: string }) {
  const session = useSession();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [checkoutFields, setCheckoutFields] = useState({
    email: "",
    name: "",
    line1: "",
    city: "",
    postalCode: "",
  });
  const [requestedProduct, setRequestedProduct] = useState(
    () => new URLSearchParams(location.search).get("product") || "",
  );
  const unsubscribeToken = new URLSearchParams(location.search).get(
    "unsubscribe",
  );
  const [data, setData] = useState<StoreData>(),
    [cart, setCart] = useState<CartResponse>(),
    [token, setToken] = useState("");
  const [page, setPage] = useState<Page>("shop"),
    [marketId, setMarketId] = useState(""),
    [country, setCountry] = useState("");
  const [search, setSearch] = useState(""),
    [collection, setCollection] = useState(""),
    [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [order, setOrder] = useState<Order>(),
    [receipt, setReceipt] = useState("");
  const [article, setArticle] = useState<ContentEntry>();
  const storageKey = `forma-store-cart-${siteId}`;
  useEffect(() => {
    if (page !== "checkout" || !session.account) return;
    let active = true;
    request<{ addresses: Address[]; email: string }>(
      `/store/${siteId}/account/profile`,
    )
      .then((profile) => {
        if (active) {
          setAddresses(profile.addresses);
          setCheckoutFields((current) => ({
            ...current,
            email: current.email || profile.email,
          }));
        }
      })
      .catch(() => {
        /* Guest checkout remains available when profile loading fails. */
      });
    return () => {
      active = false;
    };
  }, [page, siteId, session.account]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await storeRequest<StoreData>(siteId);
        if (!active) return;
        setData(result);
        setMarketId(result.settings.markets[0].id);
        setCountry(result.settings.markets[0].countries[0]);
        try {
          const key = `forma-store-visit-${siteId}`;
          if (!sessionStorage.getItem(key)) {
            const id = crypto.randomUUID();
            await storeRequest(siteId, "events", { id, name: "store.visit" });
            sessionStorage.setItem(key, id);
          }
        } catch {
          /* Analytics must never prevent shopping. */
        }
        let saved = "";
        try {
          saved = localStorage.getItem(storageKey) || "";
        } catch {
          /* Cart can remain in memory. */
        }
        if (saved) {
          try {
            const restored = await storeRequest<CartResponse>(
              siteId,
              "cart/read",
              { token: saved },
            );
            if (active) {
              setToken(saved);
              setCart(restored);
              setMarketId(restored.cart.marketId);
              setCountry(restored.cart.country);
              setDiscount(restored.cart.discountCode);
            }
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* In-memory fallback. */
              }
            } else if (active) {
              setToken(saved);
              setError(
                `Your saved cart needs attention: ${messageOf(e)}. Clear it or add a product to start again.`,
              );
            }
          }
        }
      } catch (e) {
        if (active) setError(messageOf(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [siteId, storageKey]);
  const market =
    data?.settings.markets.find((m) => m.id === marketId) ||
    data?.settings.markets[0];
  const updateCart = async (lines: CartLine[], changes: Partial<Cart> = {}) => {
    setBusy(true);
    setError("");
    try {
      // A cart whose current prices cannot be loaded is replaced explicitly on the next edit.
      const result = await storeRequest<CartResponse>(siteId, "cart", {
        ...(cart ? { token, revision: cart.cart.revision } : {}),
        lines,
        marketId,
        country,
        discountCode: discount,
        ...changes,
      });
      setCart(result);
      setMarketId(result.cart.marketId);
      setCountry(result.cart.country);
      setDiscount(result.cart.discountCode);
      if (result.token) {
        setToken(result.token);
        try {
          localStorage.setItem(storageKey, result.token);
        } catch {
          setNotice(
            "Your cart is saved for this visit. Browser storage is unavailable.",
          );
        }
      }
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (productId: string, variantId: string) => {
    const lines = [...(cart?.cart.lines || [])];
    const existing = lines.find(
      (line) => line.productId === productId && line.variantId === variantId,
    );
    const updated = existing
      ? lines.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        )
      : [...lines, { productId, variantId, quantity: 1 }];
    if (await updateCart(updated)) setNotice("Added to your cart.");
  };
  const navigate = (next: Page) => {
    if (next === "shop") setRequestedProduct("");
    setPage(next);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const placeOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await storeRequest<{ orderId: string; receipt: string }>(
        siteId,
        "checkout",
        {
          token,
          email: values.get("email"),
          address: {
            name: values.get("name"),
            line1: values.get("line1"),
            city: values.get("city"),
            postalCode: values.get("postalCode"),
            country,
          },
        },
      );
      setReceipt(result.receipt);
      const receiptData = await storeRequest<{ order: Order }>(
        siteId,
        `orders/${result.orderId}/receipt`,
        { receipt: result.receipt },
      );
      setOrder(receiptData.order);
      navigate("receipt");
      try {
        localStorage.setItem(
          `forma-store-receipt-${siteId}`,
          JSON.stringify(result),
        );
      } catch {
        /* Receipt remains available in the current visit. */
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  const pay = async (outcome: "approved" | "declined") => {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const result = await storeRequest<{ order: Order }>(
        siteId,
        `orders/${order.id}/pay-local`,
        { receipt, outcome },
      );
      setOrder(result.order);
      if (result.order.status !== "pending") {
        setCart(undefined);
        setToken("");
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* No persistent cart. */
        }
        setNotice("Sandbox payment completed. No real money was collected.");
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const restoreReceipt = async () => {
    try {
      const stored = localStorage.getItem(`forma-store-receipt-${siteId}`);
      if (!stored)
        throw new Error("No previous order is saved in this browser.");
      const saved = JSON.parse(stored) as { orderId: string; receipt: string };
      const result = await storeRequest<{ order: Order }>(
        siteId,
        `orders/${saved.orderId}/receipt`,
        { receipt: saved.receipt },
      );
      setOrder(result.order);
      setReceipt(saved.receipt);
      navigate("receipt");
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const content = () => {
    if (!data || !market) return null;
    if (page === "shop") {
      const products = data.products.filter(
        (p) =>
          (!requestedProduct || p.id === requestedProduct) &&
          `${p.title} ${p.description} ${p.collection} ${Object.values(
            p.translations,
          )
            .map((t) => `${t.title} ${t.description}`)
            .join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (!collection || p.collection === collection),
      );
      return (
        <>
          <section className="store-hero">
            <div>
              <span className="commerce-eyebrow">
                Welcome to {data.settings.name}
              </span>
              <h1>Find your next favorite.</h1>
              <p>Thoughtful products, ready to make part of your everyday.</p>
            </div>
            <label className="commerce-field">
              Shopping in
              <select
                value={marketId}
                disabled={busy}
                onChange={(e) => {
                  const next = data.settings.markets.find(
                    (m) => m.id === e.target.value,
                  )!;
                  if (cart) {
                    void updateCart(cart.cart.lines, {
                      marketId: next.id,
                      country: next.countries[0],
                      discountCode: "",
                    });
                  } else {
                    setMarketId(next.id);
                    setCountry(next.countries[0]);
                  }
                }}
              >
                {data.settings.markets.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name} · {m.currency}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <div className="commerce-toolbar">
            <input
              aria-label="Search store products"
              placeholder="Find something you’ll love"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="commerce-field">
              <span className="sr-only">Collection</span>
              <select
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
              >
                <option value="">All collections</option>
                {[
                  ...new Set(
                    data.products.map((p) => p.collection).filter(Boolean),
                  ),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="store-grid">
            {products.map((product) => (
              <ProductCard
                key={`${product.id}-${market.id}`}
                product={product}
                language={market.language}
                currency={market.currency}
                baseCurrency={data.settings.currency}
                busy={busy}
                onAdd={(variant) => add(product.id, variant)}
              />
            ))}
          </div>
          {!products.length && (
            <div className="commerce-panel commerce-empty">
              <h2>
                {search || collection
                  ? "No matching products"
                  : "Something good is on the way"}
              </h2>
              <p className="commerce-muted">
                {search || collection
                  ? "Try another search or collection."
                  : "This store has not added any available products yet."}
              </p>
            </div>
          )}
        </>
      );
    }
    if (page === "cart")
      return (
        <div className="store-cart">
          <h1>Your cart</h1>
          {!cart?.cart.lines.length ? (
            <div className="commerce-panel commerce-empty">
              <h2>Your cart is waiting</h2>
              <p className="commerce-muted">
                Explore the collection and add something you like.
              </p>
              <button
                className="commerce-button"
                onClick={() => navigate("shop")}
              >
                Continue shopping
              </button>
            </div>
          ) : (
            <div className="commerce-columns">
              <div className="commerce-panel">
                {cart.quote.lines.map((line) => (
                  <div className="store-cart-line" key={line.variantId}>
                    <div>
                      <strong>{line.title}</strong>
                      <p>
                        {line.variant} ·{" "}
                        {money(line.unitPrice, cart.quote.currency)} each
                      </p>
                    </div>
                    <input
                      type="number"
                      aria-label={`Quantity for ${line.title} ${line.variant}`}
                      min="1"
                      max="99"
                      value={line.quantity}
                      disabled={busy}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        if (Number.isInteger(quantity) && quantity > 0)
                          void updateCart(
                            cart.cart.lines.map((l) =>
                              l.variantId === line.variantId
                                ? { ...l, quantity }
                                : l,
                            ),
                          );
                      }}
                    />
                    <div className="commerce-actions">
                      <strong>{money(line.total, cart.quote.currency)}</strong>
                      <button
                        className="commerce-link"
                        disabled={busy}
                        onClick={() =>
                          void updateCart(
                            cart.cart.lines.filter(
                              (l) => l.variantId !== line.variantId,
                            ),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="commerce-link"
                  onClick={() => navigate("shop")}
                >
                  ← Continue shopping
                </button>
              </div>
              <div className="commerce-panel commerce-form">
                <h2>Order summary</h2>
                <label className="commerce-field">
                  Delivery country
                  <select
                    value={country}
                    disabled={busy}
                    onChange={(e) =>
                      void updateCart(cart.cart.lines, {
                        country: e.target.value,
                      })
                    }
                  >
                    {market.countries.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <form
                  className="commerce-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void updateCart(cart.cart.lines);
                  }}
                >
                  <label className="commerce-field">
                    Discount code
                    <input
                      value={discount}
                      onChange={(e) =>
                        setDiscount(e.target.value.toUpperCase())
                      }
                    />
                  </label>
                  <button className="commerce-button secondary" disabled={busy}>
                    Apply discount
                  </button>
                </form>
                <Totals quote={cart.quote} />
                <button
                  className="commerce-button"
                  disabled={busy}
                  onClick={() => navigate("checkout")}
                >
                  Continue to checkout
                </button>
              </div>
            </div>
          )}
        </div>
      );
    if (page === "checkout" && cart)
      return (
        <div className="store-cart">
          <h1>Checkout</h1>
          <div className="commerce-columns">
            <form
              className="commerce-panel commerce-form"
              onSubmit={(e) => void placeOrder(e)}
            >
              <h2>Contact & delivery</h2>
              {addresses.some((address) => address.country === country) && (
                <label className="commerce-field">
                  Saved delivery address
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      const address = addresses[Number(e.target.value)];
                      setCheckoutFields((current) => ({
                        ...current,
                        name: address.name,
                        line1: address.line1,
                        city: address.city,
                        postalCode: address.postalCode,
                      }));
                    }}
                  >
                    <option value="" disabled>
                      Choose an address
                    </option>
                    {addresses.map(
                      (address, index) =>
                        address.country === country && (
                          <option key={index} value={index}>
                            {address.name} · {address.line1}
                          </option>
                        ),
                    )}
                  </select>
                </label>
              )}

              <label className="commerce-field">
                Email
                <input
                  type="email"
                  name="email"
                  value={checkoutFields.email}
                  onChange={(e) =>
                    setCheckoutFields((current) => ({
                      ...current,
                      email: e.target.value,
                    }))
                  }
                  autoComplete="email"
                  required
                />
              </label>
              <label className="commerce-field">
                Full name
                <input
                  name="name"
                  value={checkoutFields.name}
                  onChange={(e) =>
                    setCheckoutFields((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
              <label className="commerce-field">
                Street address
                <input
                  name="line1"
                  value={checkoutFields.line1}
                  onChange={(e) =>
                    setCheckoutFields((current) => ({
                      ...current,
                      line1: e.target.value,
                    }))
                  }
                  autoComplete="address-line1"
                  required
                  maxLength={200}
                />
              </label>
              <div className="commerce-form-grid">
                <label className="commerce-field">
                  City
                  <input
                    name="city"
                    value={checkoutFields.city}
                    onChange={(e) =>
                      setCheckoutFields((current) => ({
                        ...current,
                        city: e.target.value,
                      }))
                    }
                    autoComplete="address-level2"
                    required
                    maxLength={100}
                  />
                </label>
                <label className="commerce-field">
                  Postal code
                  <input
                    name="postalCode"
                    value={checkoutFields.postalCode}
                    onChange={(e) =>
                      setCheckoutFields((current) => ({
                        ...current,
                        postalCode: e.target.value,
                      }))
                    }
                    autoComplete="postal-code"
                    required
                    maxLength={30}
                  />
                </label>
              </div>
              <p className="commerce-muted">
                Delivery country: {country}.{" "}
                <button
                  type="button"
                  className="commerce-link"
                  onClick={() => navigate("cart")}
                >
                  Change
                </button>
              </p>
              <button className="commerce-button" disabled={busy}>
                {busy ? "Preparing order…" : "Continue to sandbox payment"}
              </button>
              <button
                className="commerce-link"
                type="button"
                onClick={() => navigate("cart")}
              >
                Back to cart
              </button>
            </form>
            <div className="commerce-panel">
              <h2>Your order</h2>
              <div className="commerce-order-lines">
                {cart.quote.lines.map((line) => (
                  <div key={line.variantId}>
                    <span>
                      {line.title} × {line.quantity}
                    </span>
                    <span>{money(line.total, cart.quote.currency)}</span>
                  </div>
                ))}
              </div>
              <Totals quote={cart.quote} />
            </div>
          </div>
        </div>
      );
    if (page === "receipt" && order)
      return (
        <div className="store-cart">
          <h1>
            {order.status === "pending"
              ? "Complete your test payment"
              : order.status === "cancelled"
                ? "Order cancelled"
                : order.status === "refunded"
                  ? "Order refunded"
                  : "Thank you for your order."}
          </h1>
          <div className="commerce-panel commerce-form">
            <div className="commerce-toolbar">
              <div>
                <h2>#{order.id.slice(0, 8)}</h2>
                <p className="commerce-muted">{order.email}</p>
              </div>
              <span className="commerce-badge">{order.status}</span>
            </div>
            <div className="commerce-order-lines">
              {order.lines.map((line) => (
                <div key={line.variantId}>
                  <span>
                    {line.title} · {line.variant} × {line.quantity}
                  </span>
                  <span>{money(line.total, order.currency)}</span>
                </div>
              ))}
            </div>
            <Totals quote={order} />
            {order.tracking && <p>Tracking: {order.tracking}</p>}
            {order.returnRequest ? (
              <p className="commerce-notice">
                Return {order.returnRequest.status}:{" "}
                {order.returnRequest.reason}
              </p>
            ) : (
              ["paid", "fulfilled"].includes(order.status) && (
                <form
                  className="commerce-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    setBusy(true);
                    void storeRequest<{ order: Order }>(
                      siteId,
                      `orders/${order.id}/return`,
                      { receipt, reason: fields.get("reason") },
                    )
                      .then((result) => {
                        setOrder(result.order);
                        setNotice("Your return request has been received.");
                      })
                      .catch((e) => setError(messageOf(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <label className="commerce-field">
                    Reason for return
                    <textarea name="reason" required maxLength={1000} />
                  </label>
                  <button className="commerce-button secondary" disabled={busy}>
                    Request return
                  </button>
                </form>
              )
            )}
            {order.status === "pending" && (
              <div className="commerce-form">
                <div className="commerce-notice">
                  This is a local payment simulator. Do not enter card details.
                  Choose a result to test the order flow.
                </div>
                <div className="commerce-actions">
                  <button
                    className="commerce-button"
                    disabled={busy}
                    onClick={() => void pay("approved")}
                  >
                    Simulate successful payment
                  </button>
                  <button
                    className="commerce-button secondary"
                    disabled={busy}
                    onClick={() => void pay("declined")}
                  >
                    Simulate declined payment
                  </button>
                </div>
              </div>
            )}
            <button className="commerce-link" onClick={() => navigate("shop")}>
              Continue shopping
            </button>
          </div>
        </div>
      );
    if (page === "journal")
      return (
        <div className="store-cart">
          {article ? (
            <>
              <button
                className="commerce-link"
                onClick={() => setArticle(undefined)}
              >
                ← All stories
              </button>
              <h1>{article.title}</h1>
              <article className="commerce-panel commerce-article">
                {article.body}
              </article>
            </>
          ) : (
            <>
              <h1>From the journal</h1>
              <div className="store-grid">
                {data.content.map((entry) => (
                  <button
                    className="store-article-card"
                    key={entry.id}
                    onClick={() => setArticle(entry)}
                  >
                    <span className="commerce-eyebrow">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    <h2>{entry.title}</h2>
                    <p className="commerce-muted">
                      {entry.body.slice(0, 150)}
                      {entry.body.length > 150 ? "…" : ""}
                    </p>
                    <span className="commerce-link">Read story →</span>
                  </button>
                ))}
              </div>
              {!data.content.length && (
                <p className="commerce-muted">New stories are coming soon.</p>
              )}
            </>
          )}
        </div>
      );
    if (page === "contact")
      return (
        <div className="store-cart">
          <h1>Let’s talk.</h1>
          <div className="commerce-columns">
            <StoreForm
              kind="contact"
              busy={busy}
              onSubmit={async (input) => {
                setBusy(true);
                setError("");
                try {
                  await storeRequest(siteId, "forms", input);
                  setNotice("Your message has been received.");
                  return true;
                } catch (e) {
                  setError(messageOf(e));
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            />
            <StoreForm
              kind="newsletter"
              busy={busy}
              onSubmit={async (input) => {
                setBusy(true);
                setError("");
                try {
                  await storeRequest(siteId, "forms", input);
                  setNotice("You’re subscribed. Thank you.");
                  return true;
                } catch (e) {
                  setError(messageOf(e));
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </div>
      );
    return null;
  };
  return (
    <div className="commerce-app">
      {data?.sandbox && (
        <div className="store-sandbox">
          Local demo store · Payments are simulated. No real money is collected.
        </div>
      )}
      <div className="store-shell">
        <header className="store-header">
          <a className="store-logo" href={`/store?site=${siteId}`}>
            {data?.settings.name || "Store"}
          </a>
          <nav className="store-nav" aria-label="Store navigation">
            <button onClick={() => navigate("shop")}>Shop</button>
            <button onClick={() => navigate("journal")}>Journal</button>
            <button onClick={() => navigate("contact")}>Contact</button>
            <button
              className="commerce-button secondary"
              onClick={() => navigate("cart")}
            >
              Cart (
              {cart?.cart.lines.reduce((sum, line) => sum + line.quantity, 0) ||
                0}
              )
            </button>
          </nav>
        </header>
        {error && (
          <div
            className="commerce-notice error"
            role="alert"
            style={{ marginTop: 24 }}
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            className="commerce-notice"
            role="status"
            style={{ marginTop: 24 }}
          >
            {notice}
          </div>
        )}
        {unsubscribeToken ? (
          <main className="store-cart">
            <div className="commerce-panel commerce-form">
              <h1>Newsletter preferences</h1>
              <p className="commerce-muted">
                Unsubscribe from this store's marketing updates. Order
                notifications are separate.
              </p>
              <button
                className="commerce-button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void storeRequest(siteId, "unsubscribe", {
                    token: unsubscribeToken,
                  })
                    .then(() =>
                      setNotice(
                        "You are unsubscribed from this store's newsletter.",
                      ),
                    )
                    .catch((e) => setError(messageOf(e)))
                    .finally(() => setBusy(false));
                }}
              >
                Unsubscribe
              </button>
            </div>
          </main>
        ) : loading ? (
          <p className="commerce-empty" role="status">
            Opening the store…
          </p>
        ) : !data ? (
          <div className="commerce-empty">
            <h1>This store is not open.</h1>
            <p className="commerce-muted">Please try again later.</p>
            <a href="/workspace">Back to workspace</a>
          </div>
        ) : (
          <main>{content()}</main>
        )}
        <footer className="store-footer">
          <span>
            © {new Date().getFullYear()} {data?.settings.name}
          </span>
          <div className="commerce-actions">
            <button
              className="commerce-link"
              onClick={() => void restoreReceipt()}
            >
              View your last order
            </button>
            <a href={`/customer?site=${siteId}`}>Your account</a>
            <span>Built with Forma</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  language,
  currency,
  baseCurrency,
  busy,
  onAdd,
}: {
  product: Product;
  language: string;
  currency: string;
  baseCurrency: string;
  busy: boolean;
  onAdd: (variant: string) => Promise<void>;
}) {
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const variant = product.variants.find((v) => v.id === variantId)!;
  const price =
    currency === baseCurrency ? variant.price : variant.prices[currency];
  const translation = product.translations[language];
  return (
    <article className="store-product">
      {product.image ? (
        <img
          className="store-product-image"
          src={product.image}
          alt={translation?.title || product.title}
          loading="lazy"
        />
      ) : (
        <div className="store-product-image" />
      )}
      <div className="store-product-body">
        <span className="commerce-eyebrow">
          {product.collection || "Collection"}
        </span>
        <h2>{translation?.title || product.title}</h2>
        <p>{translation?.description || product.description}</p>
        {product.variants.length > 1 && (
          <select
            aria-label={`Options for ${product.title}`}
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
                {v.stock ? "" : " — sold out"}
              </option>
            ))}
          </select>
        )}
        <div className="store-product-bottom">
          <strong>
            {price === undefined
              ? "Not sold in this market"
              : money(price, currency)}
          </strong>
          <button
            className="commerce-button"
            disabled={busy || !variant.stock || price === undefined}
            onClick={() => void onAdd(variant.id)}
          >
            {!variant.stock ? "Sold out" : "Add to cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
function StoreForm({
  kind,
  busy,
  onSubmit,
}: {
  kind: "contact" | "newsletter";
  busy: boolean;
  onSubmit: (input: unknown) => Promise<boolean>;
}) {
  return (
    <form
      className="commerce-panel commerce-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fields = new FormData(form);
        void onSubmit({
          kind,
          name: fields.get("name") || "",
          email: fields.get("email"),
          message: fields.get("message") || "",
          consent: fields.get("consent") === "on",
          website: fields.get("website"),
        }).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      <h2>{kind === "contact" ? "Send a message" : "Stay in the loop"}</h2>
      {kind === "contact" && (
        <label className="commerce-field">
          Name
          <input name="name" maxLength={100} />
        </label>
      )}
      <label className="commerce-field">
        Email
        <input name="email" type="email" required maxLength={254} />
      </label>
      {kind === "contact" && (
        <label className="commerce-field">
          Message
          <textarea name="message" required rows={5} maxLength={5000} />
        </label>
      )}
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1 }}
      />
      {kind === "newsletter" && (
        <label className="commerce-check">
          <input name="consent" type="checkbox" required /> I agree to receive
          updates from this store.
        </label>
      )}
      <button className="commerce-button" disabled={busy}>
        {kind === "contact" ? "Send message" : "Subscribe"}
      </button>
    </form>
  );
}
