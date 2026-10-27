import { renderToStaticMarkup } from "react-dom/server";
import { Website } from "./Website";
import { createSection } from "./templates";
import {
  createBlock,
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
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Title and description for link previews in chats and social apps. */
const shareTags = (title: string, description: string) =>
  `<meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}">` +
  (description
    ? `<meta property="og:description" content="${escape(description)}">`
    : "") +
  '<meta name="twitter:card" content="summary">';
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
type RenderOptions = { inbox?: string; appApi?: string; owner?: string };
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
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title || page.name)}</title><meta name="description" content="${escape(page.description)}">${shareTags(page.title || page.name, page.description)}<meta name="theme-color" content="${escape(project.theme.accent)}"><link rel="stylesheet" href="styles.css">${appHead(project, options.appApi)}${logic.head}</head><body>${renderToStaticMarkup(<Website project={project} page={page} inbox={options.inbox} appApi={options.appApi} ownerHref={options.owner} exporting preview />)}${logic.body}</body></html>`;
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
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="../"><title>${escape(title)}</title><meta name="description" content="${escape(description)}">${shareTags(title, description)}<meta name="theme-color" content="${escape(project.theme.accent)}"><link rel="stylesheet" href="styles.css">${appHead(project, options.appApi)}${logic.head}</head><body>${renderToStaticMarkup(<Website project={project} page={{ ...project.pages[0], variables: undefined }} item={{ collection, item }} inbox={options.inbox} appApi={options.appApi} ownerHref={options.owner} exporting preview />)}${logic.body}</body></html>`.replace(
    // <base href="../"> would send in-page "#" links to the home page.
    /href="#/g,
    `href="${itemHref(collection, item)}#`,
  );
}
/** Where visitors land after sending a request from a published site. */
export function renderThanksPage(project: Project) {
  const heading = createBlock("heading");
  heading.text = "Thanks — it’s on its way";
  const text = createBlock("text");
  text.text =
    "We’ve received it and will be in touch at the email address you gave us.";
  const button = createBlock("button");
  button.text = "Back to the website";
  button.url = `/${project.pages[0].slug}`;
  const page: Page = {
    id: "thanks",
    name: "Thanks",
    slug: "thanks",
    title: `Thank you — ${project.name}`,
    description: "",
    sections: [createSection("custom", { blocks: [heading, text, button] })],
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
