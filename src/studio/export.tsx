import type { StoreProduct } from "../blocks/data/store";
import { renderToStaticMarkup } from "react-dom/server";
import { Website } from "./Website";
import { createSection } from "./templates";
import { createNode } from "../blocks/registry";
import type { Node, NodeType, Style } from "../blocks/model";
import {
  slugify,
  pageHref,
  replaceSectionImages,
  sectionImages,
  type Project,
  type Page,
  type Section,
} from "./model";
import {
  collectionImages,
  itemHref,
  itemTitle,
  publishedItems,
  replaceCollectionImages,
  type Collection,
  type CollectionItem,
} from "./collections";
import websiteCss from "./website.css?raw";
import blocksCss from "../blocks/blocks.css?raw";
import looksCss from "../blocks/looks.css?raw";
import formsCss from "../blocks/forms/forms.css?raw";
import { appFormsIn } from "../blocks/project";
import { SITE_SCRIPT, needsSiteScript } from "./siteScript";
import { needsDataScript } from "../blocks/data/project";
import {
  logicConfig,
  logicConfigTag,
  needsLogicScript,
  sectionsUseLogic,
} from "../blocks/logic/project";
import { LOGIC_SCRIPT } from "../blocks/logic/runtime";
import type { AppForm } from "../apps/model";
import { pagePath, seoHead, seoOf, type HeadInput } from "./seo";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/**
 * Forma's insights script (and, when the owner set them, Google Analytics
 * and the Meta Pixel), configured by data attributes: the page's CSP runs
 * only the site's own scripts.
 */
function trackerTag(project: Project, tracker?: RenderOptions["tracker"]) {
  const seo = seoOf(project);
  if (!tracker || (!seo.analytics && !seo.ga4 && !seo.metaPixel)) return "";
  const data = [
    seo.analytics && `data-api="${escape(tracker.api)}"`,
    seo.ga4 && `data-ga="${escape(seo.ga4)}"`,
    seo.metaPixel && `data-pixel="${escape(seo.metaPixel)}"`,
    (seo.ga4 || seo.metaPixel) && seo.consent && 'data-consent="1"',
  ].filter(Boolean);
  return `<script src="insights.js" ${data.join(" ")} defer></script>`;
}
/** The <head> lines every published page shares after its own title and description. */
function head(
  project: Project,
  options: RenderOptions,
  seo: Omit<HeadInput, "project" | "siteUrl">,
) {
  return `<title>${escape(seo.title)}</title><meta name="description" content="${escape(seo.description)}">${seoHead({ ...seo, project, siteUrl: options.siteUrl ?? "" })}<meta name="theme-color" content="${escape(project.theme.accent)}">`;
}
/** A page's first picture, for its social card when it has none of its own. */
const firstImage = (sections: Section[]) =>
  sections
    .filter((s) => !s.hidden)
    .flatMap(sectionImages)
    .find((src) => /^(?:https:\/\/|\/)/.test(src));
const htmlOpen = (project: Project) =>
  `<!doctype html>\n<html lang="${escape(seoOf(project).language)}">`;
/**
 * App forms visitors can reach: placed in a visible "app" section or app form
 * block. Only these accept visitors once published.
 */
export function liveAppForms(project: Project): AppForm[] {
  const app = project.app;
  if (!app) return [];
  const placed = appFormsIn(project);
  return app.forms.filter((f) => placed.has(f.id));
}
/** Whether published pages carry the app form script (live app forms or an installable app). */
export function needsAppScript(project: Project, appApi?: string) {
  const app = project.app;
  if (!appApi || !app) return false;
  return app.install.enabled || liveAppForms(project).length > 0;
}
/**
 * Published pages load app.js for app forms, the theme switch and moving
 * backgrounds (SITE_SCRIPT), and when the app installs, the manifest.
 */
function appHead(project: Project, appApi?: string) {
  const app = needsAppScript(project, appApi) ? project.app : undefined;
  if (!app && !needsSiteScript(project) && !needsDataScript(project, appApi))
    return "";
  const install = !!app?.install.enabled;
  return (
    '<script src="app.js" defer></script>' +
    (app && install
      ? `<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="icon-192.png"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${escape(app.install.shortName || project.name)}">`
      : "")
  );
}
/**
 * Pages with clicks, conditions or page values load logic.js and carry its
 * config as JSON (never run as script: the page's CSP is `script-src 'self'`).
 */
function logicParts(project: Project, page: Page, sections: Section[]) {
  if (!sectionsUseLogic(sections, page)) return { head: "", body: "" };
  const config = logicConfig(sections, page, (id) => {
    const target = project.pages.find((p) => p.id === id);
    return target ? pageHref(target.slug) : undefined;
  });
  return {
    head: '<script src="logic.js" defer></script>',
    body: logicConfigTag(config),
  };
}
/** Options for a published page: form endpoints and where OWNER_LINK goes. */
type RenderOptions = {
  inbox?: string;
  appApi?: string;
  owner?: string;
  /** Forma Store's products, when its catalogue is on the website. */
  store?: StoreProduct[];
  /** The site's absolute address, for canonical links, social cards and the sitemap. */
  siteUrl?: string;
  /** Where the insights script sends page views. */
  tracker?: { api: string };
};
export function renderPage(
  project: Project,
  page: Page,
  options: RenderOptions = {},
) {
  const logic = logicParts(project, page, [
    ...project.header,
    ...page.sections,
    ...project.footer,
  ]);
  const home = project.pages[0];
  return `${htmlOpen(project)}<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head(
    project,
    options,
    {
      title: page.title || page.name,
      description: page.description,
      path: pagePath(page.slug),
      image: page.image,
      fallbackImage: firstImage(page.sections),
      noindex: page.noindex,
      trail:
        page.id === home.id
          ? undefined
          : [
              [home.title || home.name, ""],
              [page.name, pagePath(page.slug)],
            ],
    },
  )}<link rel="stylesheet" href="styles.css">${appHead(project, options.appApi)}${logic.head}${trackerTag(project, options.tracker)}</head><body>${renderToStaticMarkup(<Website project={project} page={page} inbox={options.inbox} appApi={options.appApi} store={options.store} ownerHref={options.owner} exporting preview />)}${logic.body}</body></html>`;
}
/** An item's own page. It lives one folder down, so <base> keeps every relative link working. */
export function renderItemPage(
  project: Project,
  collection: Collection,
  item: CollectionItem,
  options: RenderOptions = {},
) {
  const d = collection.display;
  const description = (item.values[d.summary] || item.values[d.body] || "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const title = `${itemTitle(collection, item)} — ${project.name}`;
  // Item pages show the header and footer only (with no page values).
  const logic = logicParts(
    project,
    { ...project.pages[0], variables: undefined },
    [...project.header, ...project.footer],
  );
  const home = project.pages[0];
  const image = collection.fields
    .filter((f) => f.type === "image")
    .map((f) => item.values[f.id])
    .find((v) => !!v);
  return `${htmlOpen(project)}<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="../">${head(
    project,
    options,
    {
      title,
      description,
      path: `${collection.slug}/${item.slug}`,
      fallbackImage: image,
      type: "article",
      trail: [
        [home.title || home.name, ""],
        [itemTitle(collection, item), `${collection.slug}/${item.slug}`],
      ],
    },
  )}<link rel="stylesheet" href="styles.css">${appHead(project, options.appApi)}${logic.head}${trackerTag(project, options.tracker)}</head><body>${renderToStaticMarkup(<Website project={project} page={{ ...project.pages[0], variables: undefined }} item={{ collection, item }} inbox={options.inbox} appApi={options.appApi} store={options.store} ownerHref={options.owner} exporting preview />)}${logic.body}</body></html>`.replace(
    // <base href="../"> would send in-page "#" links to the home page.
    /href="#/g,
    `href="${itemHref(collection, item)}#`,
  );
}
/** A store product as its page on the published site shows it. */
export interface ProductPage {
  id: string;
  /** products/<slug> — the Shopify handle when the product came from Shopify. */
  slug: string;
  title: string;
  description: string;
  image: string;
  collection: string;
  /** Lowest variant price, in minor units, and its currency. */
  amount: number;
  currency: string;
  /** The product in the store, where it's bought. */
  url: string;
}
export const productHref = (p: { slug: string }) => `products/${p.slug}.html`;
/**
 * A store product's own page on the site: fast, readable without scripts,
 * and described to search engines as a Product with its price. Buying
 * happens in the store.
 */
export function renderProductPage(
  project: Project,
  product: ProductPage,
  options: RenderOptions = {},
) {
  const price = new Intl.NumberFormat("en", {
    style: "currency",
    currency: product.currency,
  }).format(product.amount / 100);
  const path = `products/${product.slug}`;
  const description = product.description.replace(/\s+/g, " ").slice(0, 160);
  const section = createSection("imageText", {
    id: `product-${product.id}`,
    name: product.title,
    eyebrow: product.collection.toUpperCase(),
    title: product.title,
    body: `${price}\n\n${product.description}`,
    image: product.image,
    imageAlt: product.title,
    buttonLabel: "Buy now",
    buttonUrl: product.url,
    background: "",
    layout: "split",
  });
  const page = {
    ...project.pages[0],
    id: `product-page-${product.id}`,
    name: product.title,
    slug: path,
    sections: [section],
    variables: undefined,
  };
  const home = project.pages[0];
  const url = options.siteUrl ? new URL(path, options.siteUrl).toString() : "";
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(description && { description }),
    ...(/^https:\/\//.test(product.image) && { image: product.image }),
    ...(product.collection && { category: product.collection }),
    sku: product.id,
    offers: {
      "@type": "Offer",
      price: (product.amount / 100).toFixed(2),
      priceCurrency: product.currency,
      url: product.url,
    },
    ...(url && { url }),
  };
  return `${htmlOpen(project)}<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="../">${head(
    project,
    options,
    {
      title: `${product.title} — ${project.name}`,
      description: description || `${product.title}, ${price}.`,
      path,
      image: product.image,
      type: "product",
      data: [data],
      trail: [
        [home.title || home.name, ""],
        [product.title, path],
      ],
    },
  )}<link rel="stylesheet" href="styles.css">${appHead(project, options.appApi)}${trackerTag(project, options.tracker)}</head><body>${renderToStaticMarkup(<Website project={project} page={page} inbox={options.inbox} appApi={options.appApi} store={options.store} ownerHref={options.owner} exporting preview />)}</body></html>`.replace(
    /href="#/g,
    `href="${productHref(product)}#`,
  );
}
/** Where visitors land after sending a request from a published site. */
export function renderThanksPage(project: Project) {
  // Built from blocks, with the custom section's look (looks.css `lk-custom`).
  // Fixed ids keep every release's markup the same.
  let n = 0;
  const block = (type: NodeType, props: Node["props"], style?: Style) => {
    const node = { ...createNode(type), id: `thanks-${n++}` };
    node.props = { ...node.props, ...props };
    if (style) node.style = style;
    return node;
  };
  const root = block(
    "section",
    { tag: "section", tone: "default", look: "custom" },
    { padding: [64, 0, 64, 0], textAlign: "center" },
  );
  root.children = [
    // The page's main heading, at the custom section's heading size.
    block(
      "heading",
      { text: "Thanks — it’s on its way", level: "1" },
      { fontSize: "3xl", letterSpacing: -1 },
    ),
    block(
      "text",
      {
        text: "We’ve received it and will be in touch at the email address you gave us.",
        variant: "body",
      },
      { fontSize: "14" },
    ),
    block("button", {
      label: "Back to the website",
      url: `/${project.pages[0].slug}`,
      variant: "primary",
      size: "md",
      icon: "arrowUpRight",
    }),
  ];
  const page: Page = {
    id: "thanks",
    name: "Thanks",
    slug: "thanks",
    title: `Thank you — ${project.name}`,
    description: "",
    sections: [
      { ...createSection("blocks", { name: "Thanks", root }), id: "thanks" },
    ],
  };
  return renderPage(project, page).replace(
    "<title>",
    '<meta name="robots" content="noindex"><title>',
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export function exportProject(project: Project) {
  downloadBlob(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
    `${slugify(project.name)}.forma.json`,
  );
}
export async function buildSiteArchive(project: Project) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const portable = structuredClone(project);
  const sections = [
    ...portable.header,
    ...portable.pages.flatMap((p) => p.sections),
    ...portable.footer,
  ];
  const sources = [
    ...new Set(
      sections
        .flatMap(sectionImages)
        .concat(collectionImages(portable.collections))
        .concat(portable.theme.logo ? [portable.theme.logo] : [])
        .filter(
          (src) => src.startsWith("/images/") || src.startsWith("data:image/"),
        ),
    ),
  ];
  const replacements = new Map<string, string>();
  await Promise.all(
    sources.map(async (src, index) => {
      const res = await fetch(src);
      if (!res.ok)
        throw new Error("An image could not be included. Please try again.");
      const blob = await res.blob();
      const filename = src.startsWith("/images/")
        ? src.slice(1)
        : `images/upload-${index}.${blob.type.split("/")[1] || "png"}`;
      zip.file(filename, await blob.arrayBuffer());
      replacements.set(src, filename);
    }),
  );
  for (const s of sections)
    replaceSectionImages(s, (src) => replacements.get(src));
  replaceCollectionImages(portable.collections, (src) => replacements.get(src));
  if (portable.theme.logo && replacements.has(portable.theme.logo))
    portable.theme.logo = replacements.get(portable.theme.logo);
  for (const page of portable.pages)
    zip.file(pageHref(page.slug), renderPage(portable, page));
  for (const { collection, item } of publishedItems(portable.collections))
    zip.file(
      itemHref(collection, item),
      renderItemPage(portable, collection, item),
    );
  if (needsSiteScript(portable)) zip.file("app.js", SITE_SCRIPT);
  if (needsLogicScript(portable)) zip.file("logic.js", LOGIC_SCRIPT);
  zip.file(
    "styles.css",
    `html,body{margin:0;padding:0}body{min-width:320px}*{box-sizing:border-box}\n${websiteCss}\n${blocksCss}\n${looksCss}\n${formsCss}`,
  );
  zip.file("project.forma.json", JSON.stringify(project, null, 2));
  zip.file(
    "README.txt",
    `${project.name}\n\nOpen index.html in a browser, or upload all files to a static host such as Netlify, Cloudflare Pages, or GitHub Pages. Keep the images folder and styles.css beside the HTML files.\n\nEdit again: import project.forma.json into Forma.\n\nForms: configure your form endpoint in the editor before exporting. Product cards link to URLs you provide; payments, inventory, and order processing require an external commerce provider.\n\nStarter photography: Unsplash. Custom remote images remain linked to their source.\n`,
  );
  return zip.generateAsync({ type: "blob" });
}
