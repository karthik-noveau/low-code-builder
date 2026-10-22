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
export function renderPage(project: Project, page: Page) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title || page.name)}</title><meta name="description" content="${escape(page.description)}">${shareTags(page.title || page.name, page.description)}<meta name="theme-color" content="${escape(project.theme.accent)}"><link rel="stylesheet" href="styles.css"></head><body>${renderToStaticMarkup(<Website project={project} page={page} exporting preview />)}</body></html>`;
}
/** An item's own page. It lives one folder down, so <base> keeps every relative link working. */
export function renderItemPage(
  project: Project,
  collection: Collection,
  item: CollectionItem,
  options: { inbox?: string } = {},
) {
  const d = collection.display;
  const description = (item.values[d.summary] || item.values[d.body] || "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const title = `${itemTitle(collection, item)} — ${project.name}`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="../"><title>${escape(title)}</title><meta name="description" content="${escape(description)}">${shareTags(title, description)}<meta name="theme-color" content="${escape(project.theme.accent)}"><link rel="stylesheet" href="styles.css"></head><body>${renderToStaticMarkup(<Website project={project} page={project.pages[0]} item={{ collection, item }} inbox={options.inbox} exporting preview />)}</body></html>`.replace(
    // <base href="../"> would send in-page "#" links to the home page.
    /href="#/g,
    `href="${itemHref(collection, item)}#`,
  );
}
/** Where visitors land after sending a request from a published site. */
export function renderThanksPage(project: Project) {
  const heading = createBlock("heading");
  heading.text = "Thanks — your request was sent";
  const text = createBlock("text");
  text.text =
    "We’ve received it and will reply to the email address you gave us.";
  const button = createBlock("button");
  button.text = "Back to the website";
  button.url = `/${project.pages[0].slug}`;
  const page: Page = {
    id: "thanks",
    name: "Thanks",
    slug: "thanks",
    title: `Request sent — ${project.name}`,
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
  for (const page of portable.pages)
    zip.file(pageHref(page.slug), renderPage(portable, page));
  for (const { collection, item } of publishedItems(portable.collections))
    zip.file(
      itemHref(collection, item),
      renderItemPage(portable, collection, item),
    );
  zip.file(
    "styles.css",
    `html,body{margin:0;padding:0}body{min-width:320px}*{box-sizing:border-box}\n${websiteCss}`,
  );
  zip.file("project.forma.json", JSON.stringify(project, null, 2));
  zip.file(
    "README.txt",
    `${project.name}\n\nOpen index.html in a browser, or upload all files to a static host such as Netlify, Cloudflare Pages, or GitHub Pages. Keep the images folder and styles.css beside the HTML files.\n\nEdit again: import project.forma.json into Forma.\n\nForms: configure your form endpoint in the editor before exporting. Product cards link to URLs you provide; payments, inventory, and order processing require an external commerce provider.\n\nStarter photography: Unsplash. Custom remote images remain linked to their source.\n`,
  );
  return zip.generateAsync({ type: "blob" });
}
