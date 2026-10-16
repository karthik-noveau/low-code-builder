import { useState, type FormEvent } from "react";
import type { StoreSettings } from "./types";

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
        </label>
        <label className="commerce-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />{" "}
          Open the local storefront
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
          Fill published product sections with the first 12 active catalog
          products
        </label>
        <p className="commerce-muted wide">
          Publish your website after changing these settings or catalog content.
          Prices shown on published pages are a snapshot; checkout always checks
          current prices and stock.
        </p>
      </div>
      {draft.markets.map((market, index) => {
        const change = (key: string, value: unknown) =>
          setDraft((d) => ({
            ...d,
            markets: d.markets.map((m, i) =>
              i === index ? { ...m, [key]: value } : m,
            ),
          }));
        return (
          <section key={index} className="commerce-panel commerce-form">
            <div className="commerce-toolbar">
              <h2>{market.name || `Market ${index + 1}`}</h2>
              {draft.markets.length > 1 && (
                <button
                  type="button"
                  className="commerce-link"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      markets: draft.markets.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove market
                </button>
              )}
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
                <input
                  required
                  pattern="[a-z0-9-]+"
                  value={market.id}
                  onChange={(e) => change("id", e.target.value)}
                />
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
                <small>Comma-separated two-letter country codes.</small>
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
                  Applied to discounted items plus shipping. This is a local
                  test rule, not an automated tax service.
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
                  id: `market-${draft.markets.length + 1}`,
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
