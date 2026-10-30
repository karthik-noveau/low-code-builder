import { useState, type FormEvent } from "react";
import type { Market, StoreSettings } from "./types";

/**
 * A market ID made from its name ("Europe & UK" → "europe-uk"), kept unique
 * among the store's other markets. Orders refer to markets by ID.
 */
function marketId(name: string, others: Market[]) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "market";
  let id = base;
  for (let n = 2; others.some((m) => m.id === id); n++) id = `${base}-${n}`;
  return id;
}

export function MarketsEditor({
  settings,
  busy,
  canManage,
  onSave,
}: {
  settings: StoreSettings;
  busy: boolean;
  canManage: boolean;
  onSave: (input: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(settings);
  // The market waiting on "Remove market?" to be answered.
  const [removing, setRemoving] = useState<number>();
  // Saved markets keep their ID; new ones take theirs from the name.
  const saved = new Set(settings.markets.map((m) => m.id));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(draft);
  };
  const codes = ["USD", "EUR", "GBP", "INR", "CAD", "AUD"];
  return (
    <form className="commerce-form" onSubmit={submit}>
      <div className="commerce-panel commerce-form-grid">
        <label className="commerce-field">
          Store name
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="commerce-field">
          Base currency
          <select
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
          >
            {codes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <small>
            Changing currency does not convert existing product prices.
          </small>
        </label>
        <label className="commerce-field">
          Contact email
          <input
            type="email"
            value={draft.contactEmail}
            onChange={(e) =>
              setDraft({ ...draft, contactEmail: e.target.value })
            }
          />
          <small>
            Shown on your store’s contact page and notified of new messages.
          </small>
        </label>
        <label className="commerce-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />{" "}
          Open the storefront
        </label>
        <label className="commerce-check wide">
          <input
            type="checkbox"
            checked={draft.linkFromWebsite || false}
            onChange={(e) =>
              setDraft({ ...draft, linkFromWebsite: e.target.checked })
            }
          />{" "}
          Use a Shop button in published website headers
        </label>
        <label className="commerce-check wide">
          <input
            type="checkbox"
            checked={draft.useCatalogOnWebsite || false}
            onChange={(e) =>
              setDraft({ ...draft, useCatalogOnWebsite: e.target.checked })
            }
          />{" "}
          Fill published product blocks with your active catalog products
        </label>
        <p className="commerce-muted wide">
          Publish your website after changing these settings or catalog content.
          Prices shown on published pages are a snapshot; checkout always checks
          current prices and stock.
        </p>
      </div>
      {draft.markets.map((market, index) => {
        const isNew = !saved.has(market.id);
        const change = (key: string, value: unknown) =>
          setDraft((d) => ({
            ...d,
            markets: d.markets.map((m, i) => {
              if (i !== index) return m;
              const next = { ...m, [key]: value };
              if (key === "name" && isNew)
                next.id = marketId(
                  String(value),
                  d.markets.filter((_, j) => j !== index),
                );
              return next;
            }),
          }));
        return (
          <section key={index} className="commerce-panel commerce-form">
            <div className="commerce-toolbar">
              <h2>{market.name || `Market ${index + 1}`}</h2>
              {draft.markets.length > 1 &&
                (removing === index ? (
                  <div
                    className="commerce-confirm"
                    role="group"
                    aria-label="Remove market"
                  >
                    <span>
                      Remove {market.name || "this market"}? Shoppers in its
                      countries can’t check out once you save.
                    </span>
                    <button
                      type="button"
                      className="commerce-button danger"
                      onClick={() => {
                        setRemoving(undefined);
                        setDraft({
                          ...draft,
                          markets: draft.markets.filter((_, i) => i !== index),
                        });
                      }}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="commerce-button secondary"
                      onClick={() => setRemoving(undefined)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="commerce-link"
                    onClick={() => setRemoving(index)}
                  >
                    Remove market
                  </button>
                ))}
            </div>
            <div className="commerce-form-grid">
              <label className="commerce-field">
                Market name
                <input
                  required
                  value={market.name}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label className="commerce-field">
                Market ID
                <input readOnly value={market.id} />
                <small>
                  {isNew
                    ? "Made from the market name."
                    : "Orders refer to this, so it stays the same."}
                </small>
              </label>
              <label className="commerce-field">
                Currency
                <select
                  value={market.currency}
                  onChange={(e) => change("currency", e.target.value)}
                >
                  {codes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="commerce-field">
                Language
                <input
                  required
                  pattern="[a-z]{2}(-[A-Z]{2})?"
                  value={market.language}
                  onChange={(e) => change("language", e.target.value)}
                />
                <small>Two-letter code, e.g. en, fr, de</small>
              </label>
              <label className="commerce-field">
                Delivery countries
                <input
                  required
                  value={market.countries.join(", ")}
                  onChange={(e) =>
                    change(
                      "countries",
                      e.target.value
                        .split(",")
                        .map((c) => c.trim().toUpperCase()),
                    )
                  }
                  placeholder="US, CA"
                />
                <small>
                  Two-letter codes separated by commas, e.g. US, GB, IN
                </small>
              </label>
              <label className="commerce-field">
                Shipping price ({market.currency})
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={market.shipping / 100}
                  onChange={(e) =>
                    change("shipping", Math.round(Number(e.target.value) * 100))
                  }
                />
              </label>
              <label className="commerce-field">
                Free shipping above ({market.currency})
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={market.freeShippingFrom / 100}
                  onChange={(e) =>
                    change(
                      "freeShippingFrom",
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
                <small>Set zero to keep the flat shipping rate.</small>
              </label>
              <label className="commerce-field">
                Manual tax rate (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="50"
                  step="0.01"
                  value={market.taxBasisPoints / 100}
                  onChange={(e) =>
                    change(
                      "taxBasisPoints",
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
                <small>
                  Applied to discounted items plus shipping. You set this rate
                  yourself; it isn’t calculated for you.
                </small>
              </label>
            </div>
          </section>
        );
      })}
      <div className="commerce-actions">
        <button
          type="button"
          className="commerce-button secondary"
          disabled={draft.markets.length >= 8}
          onClick={() =>
            setDraft({
              ...draft,
              markets: [
                ...draft.markets,
                {
                  id: marketId("New market", draft.markets),
                  name: "New market",
                  currency: draft.currency,
                  language: "en",
                  countries: ["US"],
                  shipping: 0,
                  freeShippingFrom: 0,
                  taxBasisPoints: 0,
                },
              ],
            })
          }
        >
          + Add market
        </button>
        <button className="commerce-button" disabled={busy || !canManage}>
          {busy ? "Saving…" : "Save store settings"}
        </button>
      </div>
    </form>
  );
}
