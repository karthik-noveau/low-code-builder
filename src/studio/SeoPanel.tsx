import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import { useStudio } from "./store";
import { Field } from "./ui";
import { Icon } from "./Icon";
import { safeImage } from "./model";
import {
  BUSINESS_TYPES,
  emptySeo,
  SEO_PATTERNS,
  seoOf,
  type Business,
  type SiteSeo,
} from "./seo";

const LANGUAGES = [
  ["en", "English"],
  ["en-IN", "English (India)"],
  ["en-GB", "English (UK)"],
  ["en-US", "English (US)"],
  ["hi", "Hindi"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["ml", "Malayalam"],
  ["mr", "Marathi"],
  ["bn", "Bengali"],
  ["gu", "Gujarati"],
  ["ar", "Arabic"],
  ["de", "German"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["pt", "Portuguese"],
  ["ja", "Japanese"],
  ["zh", "Chinese"],
];

/** A switch with a label and a line of explanation. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="seo-toggle">
      <label htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/** A share image: uploaded, picked from the library, or a link. */
export function ShareImageField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const assets = useStudio((s) => s.project.assets);
  const [error, setError] = useState("");
  const shown = value ? safeImage(value) : "";
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
      return setError("Use a PNG, JPEG or WebP image.");
    if (file.size > 3 * 1024 * 1024)
      return setError("Use an image under 3 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      onChange(String(reader.result));
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="field share-image">
      <div className="field-label-row">
        <span>Share image</span>
      </div>
      <div className="share-image-row">
        {shown ? (
          <img src={shown} alt="" />
        ) : (
          <span className="share-image-empty" aria-hidden="true">
            <Icon name="image" size={18} />
          </span>
        )}
        <div>
          <label className="subtle-button import-button">
            <Icon name="upload" size={14} />
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
            />
          </label>
          {!!assets.length && (
            <select
              aria-label="Choose from your images"
              value=""
              onChange={(e) => e.target.value && onChange(e.target.value)}
            >
              <option value="">From your images…</option>
              {assets.map((a) => (
                <option key={a.id} value={a.url}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {value && (
            <button className="text-button" onClick={() => onChange("")}>
              Remove
            </button>
          )}
        </div>
      </div>
      <small>
        {error ||
          hint ||
          "1200 × 630 pixels works best in chats and social apps."}
      </small>
    </div>
  );
}

/** How a page looks in Google's results. */
export function SearchPreview({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description: string;
}) {
  const clip = (v: string, n: number) =>
    v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v;
  return (
    <div className="seo-serp" aria-label="Search result preview">
      <span>{url}</span>
      <strong>{clip(title, 60)}</strong>
      <p>
        {description
          ? clip(description, 160)
          : "Add a description so people know what they’ll find."}
      </p>
    </div>
  );
}
/** How a link to the page looks when shared. */
export function SocialPreview({
  host,
  title,
  description,
  image,
}: {
  host: string;
  title: string;
  description: string;
  image: string;
}) {
  const shown = image ? safeImage(image) : "";
  return (
    <div className="seo-card" aria-label="Share preview">
      {shown ? (
        <img src={shown} alt="" />
      ) : (
        <span className="seo-card-empty">No share image</span>
      )}
      <div>
        <small>{host}</small>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
/** Settings → Search & sharing: how the whole site appears in search and when shared. */
export function SeoPanel() {
  const project = useStudio((s) => s.project);
  const commit = useStudio((s) => s.commit);
  const seo = seoOf(project);
  const save = (patch: Partial<SiteSeo>, key: string) =>
    commit((p) => ({ ...p, seo: { ...seoOf(p), ...patch } }), `seo:${key}`);
  const business = (patch: Partial<Business>, key: string) =>
    save({ business: { ...seo.business, ...patch } }, `business:${key}`);
  const [social, setSocial] = useState(seo.social.join("\n"));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** A text setting checked against its pattern; kept as typed until valid. */
  const checked = (
    key: "siteUrl" | "google" | "bing",
    pattern: RegExp,
    clean = (v: string) => v.trim(),
  ) => ({
    value: drafts[key] ?? seo[key],
    hint:
      drafts[key] !== undefined &&
      drafts[key] !== "" &&
      !pattern.test(clean(drafts[key]))
        ? "That doesn’t look right yet."
        : undefined,
    onChange: (v: string) => {
      setDrafts((d) => ({ ...d, [key]: v }));
      const value = clean(v);
      if (value === "" || pattern.test(value)) save({ [key]: value }, key);
    },
  });
  const site = checked("siteUrl", SEO_PATTERNS.siteUrl, (v) => {
    const t = v.trim().replace(/^http:\/\//i, "https://");
    return t && !/^https:\/\//i.test(t) ? `https://${t}` : t;
  });
  const google = checked("google", SEO_PATTERNS.verification, (v) =>
    v.trim().replace(/^.*content="([^"]+)".*$/, "$1"),
  );
  const bing = checked("bing", SEO_PATTERNS.verification, (v) =>
    v.trim().replace(/^.*content="([^"]+)".*$/, "$1"),
  );
  return (
    <div className="seo-panel">
      <p className="muted-note">
        Every page gets a canonical address, share cards, structured data for
        Google, and a sitemap. Fill in what you can; it goes live when you
        publish.
      </p>
      <Toggle
        label="Let search engines list this site"
        hint="Turn off while you’re still building."
        checked={seo.indexing}
        onChange={(indexing) => save({ indexing }, "indexing")}
      />
      <Field
        label="Site address"
        placeholder="Automatic: your primary domain"
        value={site.value}
        onChange={site.onChange}
        hint={
          site.hint ||
          "Leave empty to use your primary domain. Publish again after connecting one."
        }
      />
      <div className="field">
        <div className="field-label-row">
          <label htmlFor="seo-language">Language</label>
        </div>
        <select
          id="seo-language"
          value={seo.language}
          onChange={(e) => save({ language: e.target.value }, "language")}
        >
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <ShareImageField
        value={seo.image}
        onChange={(image) => save({ image }, "image")}
        hint="Shown when a page without its own image is shared."
      />
      <h5 className="seo-subhead">Your business</h5>
      <p className="muted-note">
        Helps Google show your name, phone and address with your results.
      </p>
      <div className="field">
        <div className="field-label-row">
          <label htmlFor="seo-type">Kind of business</label>
        </div>
        <select
          id="seo-type"
          value={seo.business.type}
          onChange={(e) =>
            business({ type: e.target.value as Business["type"] }, "type")
          }
        >
          {BUSINESS_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="Business name"
        placeholder={project.name}
        value={seo.business.name}
        maxLength={120}
        onChange={(name) => business({ name }, "name")}
      />
      <Field
        label="Phone"
        type="tel"
        value={seo.business.phone}
        maxLength={40}
        onChange={(phone) => business({ phone }, "phone")}
      />
      <Field
        label="Email"
        type="email"
        value={seo.business.email}
        maxLength={254}
        onChange={(email) => business({ email }, "email")}
      />
      <Field
        label="Street address"
        value={seo.business.street}
        maxLength={120}
        onChange={(street) => business({ street }, "street")}
      />
      <div className="seo-pair">
        <Field
          label="City"
          value={seo.business.city}
          maxLength={120}
          onChange={(city) => business({ city }, "city")}
        />
        <Field
          label="State"
          value={seo.business.region}
          maxLength={120}
          onChange={(region) => business({ region }, "region")}
        />
      </div>
      <div className="seo-pair">
        <Field
          label="Postal code"
          value={seo.business.postalCode}
          maxLength={20}
          onChange={(postalCode) => business({ postalCode }, "postalCode")}
        />
        <Field
          label="Country code"
          placeholder="IN"
          value={seo.business.country}
          maxLength={2}
          onChange={(v) => {
            const country = v.toUpperCase().replace(/[^A-Z]/g, "");
            if (!country || SEO_PATTERNS.country.test(country))
              business({ country }, "country");
          }}
        />
      </div>
      <Field
        label="Social profiles"
        multiline
        placeholder={
          "https://instagram.com/yourshop\nhttps://facebook.com/yourshop"
        }
        hint="One address per line, up to eight."
        value={social}
        onChange={(value) => {
          setSocial(value);
          save(
            {
              social: value
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => SEO_PATTERNS.social.test(l))
                .slice(0, 8),
            },
            "social",
          );
        }}
      />
      <h5 className="seo-subhead">Search engine verification</h5>
      <Field
        label="Google Search Console"
        placeholder="Paste the code or the whole meta tag"
        {...google}
      />
      <Field
        label="Bing Webmaster Tools"
        placeholder="Paste the code or the whole meta tag"
        {...bing}
      />
      <p className="muted-note">
        Then submit your sitemap: <code>/sitemap.xml</code> on your site
        address.
      </p>
    </div>
  );
}

/** Settings → Tracking: Forma's own insights, Google Analytics and the Meta Pixel. */
export function TrackingPanel({ siteId }: { siteId?: string }) {
  const project = useStudio((s) => s.project);
  const commit = useStudio((s) => s.commit);
  const seo = seoOf(project);
  const save = (patch: Partial<SiteSeo>, key: string) =>
    commit(
      (p) => ({ ...p, seo: { ...emptySeo(), ...seoOf(p), ...patch } }),
      `tracking:${key}`,
    );
  const [ga, setGa] = useState(seo.ga4);
  const [pixel, setPixel] = useState(seo.metaPixel);
  return (
    <div className="seo-panel">
      <Toggle
        label="Forma insights"
        hint="Visitors, pages, sources, campaigns and sales. No cookies, so no banner needed."
        checked={seo.analytics}
        onChange={(analytics) => save({ analytics }, "analytics")}
      />
      {siteId && (
        <a
          className="subtle-button full-width"
          href={`/insights?site=${encodeURIComponent(siteId)}`}
        >
          <Icon name="chart" size={15} />
          Open insights
        </a>
      )}
      <Field
        label="Google Analytics 4"
        placeholder="G-XXXXXXXXXX"
        value={ga}
        hint={
          ga && !SEO_PATTERNS.ga4.test(ga.trim().toUpperCase())
            ? "A measurement ID starts with G-."
            : "Admin → Data streams → your web stream."
        }
        onChange={(v) => {
          setGa(v);
          const id = v.trim().toUpperCase();
          if (!id || SEO_PATTERNS.ga4.test(id)) save({ ga4: id }, "ga4");
        }}
      />
      <Field
        label="Meta Pixel"
        placeholder="123456789012345"
        value={pixel}
        hint={
          pixel && !SEO_PATTERNS.metaPixel.test(pixel.trim())
            ? "A Pixel ID is a long number."
            : "Events Manager → Data sources → your pixel."
        }
        onChange={(v) => {
          setPixel(v);
          const id = v.trim();
          if (!id || SEO_PATTERNS.metaPixel.test(id))
            save({ metaPixel: id }, "pixel");
        }}
      />
      {(seo.ga4 || seo.metaPixel) && (
        <Toggle
          label="Ask visitors first"
          hint="Google Analytics and the Pixel use cookies. In the EU, UK and India you usually need consent; visitors see a small banner."
          checked={seo.consent}
          onChange={(consent) => save({ consent }, "consent")}
        />
      )}
    </div>
  );
}
