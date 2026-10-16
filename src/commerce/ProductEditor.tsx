import { useState, type FormEvent } from "react";
import type { Product, Variant } from "./types";

const newVariant = (): Variant => ({
  id: crypto.randomUUID(),
  title: "Default",
  sku: "",
  stock: 0,
  price: 0,
  prices: {},
});
export function ProductEditor({
  product,
  currency,
  currencies,
  busy,
  onSave,
  onCancel,
}: {
  product?: Product;
  currency: string;
  currencies: string[];
  busy: boolean;
  onSave: (input: unknown) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<
    Pick<
      Product,
      | "title"
      | "description"
      | "image"
      | "collection"
      | "status"
      | "variants"
      | "translations"
    > &
      Partial<Product>
  >(
    () =>
      product || {
        title: "",
        description: "",
        image: "",
        collection: "",
        status: "draft",
        variants: [newVariant()],
        translations: {},
      },
  );
  const [language, setLanguage] = useState("fr");
  const change = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const variantChange = (id: string, change: Partial<Variant>) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.id === id ? { ...v, ...change } : v)),
    }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onSave(draft)) onCancel();
  };
  return (
    <form className="commerce-form" onSubmit={(e) => void submit(e)}>
      <div className="commerce-panel commerce-form-grid">
        <label className="commerce-field">
          Product name
          <input
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <label className="commerce-field">
          Collection
          <input
            maxLength={80}
            value={draft.collection}
            onChange={(e) => change("collection", e.target.value)}
            placeholder="e.g. Home essentials"
          />
        </label>
        <label className="commerce-field wide">
          Description
          <textarea
            maxLength={5000}
            value={draft.description}
            onChange={(e) => change("description", e.target.value)}
            rows={4}
          />
        </label>
        <label className="commerce-field">
          Image URL
          <input
            value={draft.image}
            onChange={(e) => change("image", e.target.value)}
            placeholder="https://… or /images/plant-1.jpg"
          />
        </label>
        <label className="commerce-field">
          Visibility
          <select
            value={draft.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="draft">Draft — hidden from shoppers</option>
            <option value="active">Active — available to shoppers</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="commerce-panel commerce-form">
        <div>
          <h2>Variants & inventory</h2>
          <p className="commerce-muted">
            Set a price and stock quantity for each size, color, or option.
          </p>
        </div>
        {draft.variants.map((v, index) => (
          <div key={v.id} className="commerce-variant">
            <label className="commerce-field">
              Option name
              <input
                required
                value={v.title}
                aria-label={`Variant ${index + 1} name`}
                onChange={(e) => variantChange(v.id, { title: e.target.value })}
              />
            </label>
            <label className="commerce-field">
              SKU
              <input
                value={v.sku}
                aria-label={`Variant ${index + 1} SKU`}
                onChange={(e) => variantChange(v.id, { sku: e.target.value })}
              />
            </label>
            <label className="commerce-field">
              Price ({currency})
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={v.price / 100}
                aria-label={`Variant ${index + 1} price`}
                onChange={(e) =>
                  variantChange(v.id, {
                    price: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
            <label className="commerce-field">
              Stock
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                required
                value={v.stock}
                aria-label={`Variant ${index + 1} stock`}
                onChange={(e) =>
                  variantChange(v.id, { stock: Number(e.target.value) })
                }
              />
            </label>
            <button
              type="button"
              className="commerce-link"
              disabled={draft.variants.length === 1}
              onClick={() =>
                change(
                  "variants",
                  draft.variants.filter((item) => item.id !== v.id),
                )
              }
            >
              Remove
            </button>
            {currencies
              .filter((c) => c !== currency)
              .map((code) => (
                <label className="commerce-field" key={code}>
                  Price ({code})
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      v.prices[code] === undefined ? "" : v.prices[code] / 100
                    }
                    placeholder="Unavailable"
                    onChange={(e) => {
                      const prices = { ...v.prices };
                      if (e.target.value === "") delete prices[code];
                      else
                        prices[code] = Math.round(Number(e.target.value) * 100);
                      variantChange(v.id, { prices });
                    }}
                  />
                </label>
              ))}
          </div>
        ))}
        <button
          type="button"
          className="commerce-button secondary"
          disabled={draft.variants.length >= 50}
          onClick={() => change("variants", [...draft.variants, newVariant()])}
        >
          + Add variant
        </button>
      </div>
      <details className="commerce-panel">
        <summary>Product translations</summary>
        <div className="commerce-form" style={{ marginTop: 20 }}>
          <label className="commerce-field">
            Language code
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="fr"
              pattern="[a-z]{2}(-[A-Z]{2})?"
            />
          </label>
          <label className="commerce-field">
            Translated title
            <input
              value={draft.translations[language]?.title || ""}
              onChange={(e) =>
                change("translations", {
                  ...draft.translations,
                  [language]: {
                    ...draft.translations[language],
                    title: e.target.value,
                    description:
                      draft.translations[language]?.description || "",
                  },
                })
              }
            />
          </label>
          <label className="commerce-field">
            Translated description
            <textarea
              value={draft.translations[language]?.description || ""}
              onChange={(e) =>
                change("translations", {
                  ...draft.translations,
                  [language]: {
                    title: draft.translations[language]?.title || "",
                    description: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      </details>
      <div className="commerce-form-footer">
        <button
          type="button"
          className="commerce-button secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="commerce-button" disabled={busy}>
          {busy ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
