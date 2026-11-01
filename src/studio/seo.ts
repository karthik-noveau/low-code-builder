/**
 * Search and sharing for published sites: the site-wide settings owners fill
 * in (Settings → Search & sharing), and everything a published page carries
 * from them: canonical address, social cards, structured data (schema.org
 * JSON-LD), search engine verification, a sitemap and robots.txt. Tracking
 * settings (built-in insights, Google Analytics, Meta Pixel) live here too,
 * since they're set in the same place and end up in the same <head>.
 */
import type { Page, Project } from "./model";

export const BUSINESS_TYPES = [
  ["Organization", "Company or organisation"],
  ["LocalBusiness", "Local business"],
  ["Store", "Shop with a location"],
  ["OnlineStore", "Online store"],
  ["Restaurant", "Restaurant or café"],
  ["ProfessionalService", "Professional service"],
  ["HealthAndBeautyBusiness", "Health and beauty"],
  ["EducationalOrganization", "School or tuition"],
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number][0];
export interface Business {
  type: BusinessType;
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  /** Two-letter country code (IN, US, GB…). */
  country: string;
}
export interface SiteSeo {
  /** The site's main address; "" uses its primary domain, or its Forma address. */
  siteUrl: string;
  /** The pages' language (lang attribute), e.g. "en", "en-IN", "hi". */
  language: string;
  /** Shown when a page is shared and has no image of its own. */
  image: string;
  /** Search engines may list the site. */
  indexing: boolean;
  business: Business;
  /** Social profile addresses (schema.org sameAs). */
  social: string[];
  /** Google Search Console and Bing Webmaster verification codes. */
  google: string;
  bing: string;
  /** Forma's own cookieless visitor counts (on unless false). */
  analytics: boolean;
  /** Google Analytics 4 measurement ID (G-…). */
  ga4: string;
  /** Meta (Facebook) Pixel ID. */
  metaPixel: string;
  /** Ask visitors before loading Google Analytics or the Meta Pixel. */
  consent: boolean;
}
export const emptySeo = (): SiteSeo => ({
  siteUrl: "",
  language: "en",
  image: "",
  indexing: true,
  business: {
    type: "Organization",
    name: "",
    phone: "",
    email: "",
    street: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  },
  social: [],
  google: "",
  bing: "",
  analytics: true,
  ga4: "",
  metaPixel: "",
  consent: true,
});
export const seoOf = (project: Project): SiteSeo => ({
  ...emptySeo(),
  ...project.seo,
  business: { ...emptySeo().business, ...project.seo?.business },
});

export const SEO_PATTERNS = {
  siteUrl: /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i,
  language: /^[a-z]{2,3}(?:-[A-Z]{2})?$/,
  ga4: /^G-[A-Z0-9]{4,12}$/,
  metaPixel: /^\d{6,20}$/,
  verification: /^[\w-]{8,100}$/,
  country: /^[A-Z]{2}$/,
  social: /^https:\/\/[^\s<>"']{4,300}$/,
};
const short = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
const optional = (v: unknown, pattern: RegExp) =>
  v === "" || (typeof v === "string" && pattern.test(v));

export function validateSeo(value: unknown): value is SiteSeo {
  if (!value || typeof value !== "object") return false;
  const s = value as SiteSeo;
  const b = s.business as Business | undefined;
  return (
    optional(s.siteUrl, SEO_PATTERNS.siteUrl) &&
    typeof s.language === "string" &&
    SEO_PATTERNS.language.test(s.language) &&
    short(s.image, 3_000_000) &&
    typeof s.indexing === "boolean" &&
    !!b &&
    BUSINESS_TYPES.some(([t]) => t === b.type) &&
    [b.name, b.street, b.city, b.region].every((v) => short(v, 120)) &&
    short(b.phone, 40) &&
    short(b.email, 254) &&
    short(b.postalCode, 20) &&
    optional(b.country, SEO_PATTERNS.country) &&
    Array.isArray(s.social) &&
    s.social.length <= 8 &&
    s.social.every(
      (u) => typeof u === "string" && SEO_PATTERNS.social.test(u),
    ) &&
    optional(s.google, SEO_PATTERNS.verification) &&
    optional(s.bing, SEO_PATTERNS.verification) &&
    typeof s.analytics === "boolean" &&
    optional(s.ga4, SEO_PATTERNS.ga4) &&
    optional(s.metaPixel, SEO_PATTERNS.metaPixel) &&
    typeof s.consent === "boolean"
  );
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** A JSON-LD block; `<` is escaped so text can never close the tag. */
export const jsonLdTag = (data: object) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

/** A page's clean address on the site: "" for home, "about", "blog/post". */
export const pagePath = (slug: string) => slug.replace(/\.html$/, "");
export const absoluteUrl = (siteUrl: string, path: string) => {
  try {
    return new URL(
      path,
      siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`,
    ).toString();
  } catch {
    return "";
  }
};

/** What a published page's <head> says to search engines and social apps. */
export interface HeadInput {
  project: Project;
  title: string;
  description: string;
  /** The page's clean path ("" for home). */
  path: string;
  /** The site's absolute address (with a trailing slash); "" when unknown, e.g. exports. */
  siteUrl: string;
  image?: string;
  /** Used when neither the page nor the site has a share image (its first picture). */
  fallbackImage?: string;
  noindex?: boolean;
  type?: "website" | "article" | "product";
  /** Extra JSON-LD (a product, an article). */
  data?: object[];
  /** Trail for BreadcrumbList: [name, path]. */
  trail?: [string, string][];
}
export function seoHead(input: HeadInput) {
  const seo = seoOf(input.project);
  const url = input.siteUrl ? absoluteUrl(input.siteUrl, input.path) : "";
  const imageSource = input.image || seo.image || input.fallbackImage;
  const image =
    imageSource && !imageSource.startsWith("data:")
      ? /^https:\/\//.test(imageSource)
        ? imageSource
        : input.siteUrl
          ? absoluteUrl(input.siteUrl, imageSource)
          : ""
      : "";
  const tags = [
    `<meta property="og:type" content="${input.type === "product" ? "product" : input.type || "website"}">`,
    `<meta property="og:title" content="${escape(input.title)}">`,
    `<meta property="og:site_name" content="${escape(input.project.name)}">`,
    input.description &&
      `<meta property="og:description" content="${escape(input.description)}">`,
    url && `<link rel="canonical" href="${escape(url)}">`,
    url && `<meta property="og:url" content="${escape(url)}">`,
    image && `<meta property="og:image" content="${escape(image)}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    (!seo.indexing || input.noindex) &&
      '<meta name="robots" content="noindex, nofollow">',
    seo.google &&
      `<meta name="google-site-verification" content="${escape(seo.google)}">`,
    seo.bing && `<meta name="msvalidate.01" content="${escape(seo.bing)}">`,
  ];
  const data: object[] = [...(input.data ?? [])];
  if (input.path === "" && url) {
    data.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: input.project.name,
      url,
    });
    const org = organization(input.project, url, image);
    if (org) data.push(org);
  }
  if (url && input.trail?.length)
    data.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: input.trail.map(([name, path], i) => ({
        "@type": "ListItem",
        position: i + 1,
        name,
        item: absoluteUrl(input.siteUrl, path),
      })),
    });
  return tags.filter(Boolean).join("") + data.map(jsonLdTag).join("");
}
/** The business behind the site, when the owner has described it. */
export function organization(project: Project, url: string, image = "") {
  const seo = seoOf(project);
  const b = seo.business;
  if (!b.name && !b.phone && !b.street && !seo.social.length) return null;
  const local = b.type !== "Organization" && b.type !== "OnlineStore";
  const address =
    b.street || b.city
      ? {
          "@type": "PostalAddress",
          ...(b.street && { streetAddress: b.street }),
          ...(b.city && { addressLocality: b.city }),
          ...(b.region && { addressRegion: b.region }),
          ...(b.postalCode && { postalCode: b.postalCode }),
          ...(b.country && { addressCountry: b.country }),
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": b.type,
    name: b.name || project.name,
    url,
    ...(image && { image }),
    ...(b.phone && { telephone: b.phone }),
    ...(b.email && { email: b.email }),
    ...(address && (local || b.type === "Organization") && { address }),
    ...(seo.social.length && { sameAs: seo.social }),
  };
}

export function sitemapXml(
  siteUrl: string,
  entries: { path: string; lastmod?: string }[],
) {
  const urls = entries
    .map(
      (e) =>
        `<url><loc>${escape(absoluteUrl(siteUrl, e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
export function robotsTxt(
  siteUrl: string,
  indexing: boolean,
  hidden: string[],
) {
  if (!indexing) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n${hidden.map((p) => `Disallow: /${p}\n`).join("")}${siteUrl ? `Sitemap: ${absoluteUrl(siteUrl, "sitemap.xml")}\n` : ""}`;
}

/** "shop.example.com" for previews: the site's address or a stand-in. */
export function previewHost(seo: SiteSeo, name: string) {
  try {
    if (seo.siteUrl) return new URL(seo.siteUrl).host;
  } catch {
    /* Falls through to the stand-in. */
  }
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yoursite"}.com`;
}

/** Search and sharing problems Review site lists (src/studio/review.ts). */
export function seoProblems(project: Project) {
  const seo = seoOf(project);
  const out: { id: string; title: string; detail: string; page?: Page }[] = [];
  if (!seo.indexing)
    out.push({
      id: "seo-hidden",
      title: "Search engines can’t list this site",
      detail:
        "“Let search engines list this site” is off in Settings → Search & sharing. Turn it on when you’re ready to be found.",
    });
  const titles = new Map<string, Page[]>();
  const descriptions = new Map<string, Page[]>();
  for (const page of project.pages) {
    if (page.noindex) continue;
    const title = (page.title || page.name).trim();
    if (title)
      titles.set(title.toLowerCase(), [
        ...(titles.get(title.toLowerCase()) ?? []),
        page,
      ]);
    const d = page.description.trim();
    if (d)
      descriptions.set(d.toLowerCase(), [
        ...(descriptions.get(d.toLowerCase()) ?? []),
        page,
      ]);
    if (title.length > 60)
      out.push({
        id: `seo-title-long-${page.id}`,
        title: `Shorten the title of ${page.name}`,
        detail: `Search results show about 60 characters; this title has ${title.length}.`,
        page,
      });
    if (d && (d.length < 50 || d.length > 160))
      out.push({
        id: `seo-description-${page.id}`,
        title: `Adjust the description of ${page.name}`,
        detail: `Descriptions of 50–160 characters read best in search results; this one has ${d.length}.`,
        page,
      });
  }
  for (const pages of titles.values())
    if (pages.length > 1)
      out.push({
        id: `seo-title-same-${pages[0].id}`,
        title: `${pages.map((p) => p.name).join(" and ")} share a title`,
        detail:
          "Give each page its own title so search engines show the right one.",
        page: pages[1],
      });
  for (const pages of descriptions.values())
    if (pages.length > 1)
      out.push({
        id: `seo-description-same-${pages[0].id}`,
        title: `${pages.map((p) => p.name).join(" and ")} share a description`,
        detail: "Describe each page in its own words.",
        page: pages[1],
      });
  if (!seo.image && !project.pages.some((p) => p.image))
    out.push({
      id: "seo-share-image",
      title: "Add a share image",
      detail:
        "Links to your site show this picture in chats and social apps. Set one in Settings → Search & sharing.",
    });
  return out;
}
