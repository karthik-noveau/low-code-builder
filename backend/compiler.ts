import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  renderItemPage,
  renderPage,
  renderThanksPage,
} from "../src/studio/export";
import {
  collectionImages,
  itemHref,
  publishedItems,
  replaceCollectionImages,
} from "../src/studio/collections";
import {
  pageHref,
  safeImage,
  replaceSectionImages,
  sectionImages,
  type Project,
} from "../src/studio/model";
import websiteCss from "../src/studio/website.css?raw";
import { digest } from "./project";
import { insist } from "./config";
import type { CommerceBinding } from "./commerce-publishing";

export interface Artifact {
  name: string;
  body: Buffer;
  type: string;
}
const starterNames = new Set([
  "salad.jpg",
  "dish.jpg",
  "botanical.jpg",
  "plant-1.jpg",
  "plant-2.jpg",
  "plant-3.jpg",
  "interior.jpg",
  "architecture.jpg",
  "restaurant.jpg",
  "garden.jpg",
]);
export async function compileSite(
  input: Project,
  releaseBase: string,
  commerce?: CommerceBinding,
  /** Endpoint for visitor action forms; without it item pages show no form. */
  inbox?: string,
): Promise<Artifact[]> {
  const project = structuredClone(input);
  if (commerce?.shopUrl)
    for (const section of project.header)
      if (section.type === "header") {
        section.buttonLabel = "Shop";
        section.buttonUrl = commerce.shopUrl;
      }
  if (commerce?.products)
    for (const page of project.pages)
      for (const section of page.sections)
        if (section.type === "products")
          section.items = structuredClone(commerce.products);
  const artifacts: Artifact[] = [];
  let totalBytes = 0;
  const add = (artifact: Artifact) => {
    totalBytes += artifact.body.length;
    insist(
      totalBytes <= 30 * 1024 * 1024,
      422,
      "The published site exceeds 30 MB.",
    );
    artifacts.push(artifact);
  };
  const sections = [
    ...project.header,
    ...project.pages.flatMap((p) => p.sections),
    ...project.footer,
  ];
  // Hidden items are never rendered, and collection images that can't be
  // published safely (typed text, http://) are shown as no image, not a failed publish.
  for (const c of project.collections ?? []) {
    c.items = c.items.filter((i) => !i.hidden);
    const images = c.fields.filter((f) => f.type === "image");
    for (const item of c.items)
      for (const f of images) {
        const value = item.values[f.id] ?? "";
        if (value && (!safeImage(value) || /^http:/i.test(value)))
          item.values[f.id] = "";
      }
  }
  const replacements = new Map<string, string>();
  const sources = new Set([
    ...sections.flatMap(sectionImages),
    ...collectionImages(project.collections),
  ]);
  // Remote HTTPS images stay linked; only images we store count toward the limit.
  insist(
    [...sources].filter((src) => !/^https:\/\//i.test(src)).length <= 200,
    422,
    "A published site can store up to 200 uploaded images. Use image URLs for the rest.",
  );
  for (const source of sources) {
    let body: Buffer | undefined,
      extension = "";
    if (source.startsWith("/images/") || source.startsWith("images/")) {
      const name = source.replace(/^\/?images\//, "");
      insist(
        starterNames.has(name),
        422,
        "An image is missing. Upload it again before publishing.",
      );
      body = await readFile(
        path.join(process.env.ASSET_DIR || "public/images", name),
      );
      extension = "jpeg";
    } else if (source.startsWith("data:")) {
      const match =
        /^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(
          source,
        );
      insist(match, 422, "An uploaded image has an unsupported format.");
      extension = match[1];
      body = Buffer.from(match[2], "base64");
      insist(body.length <= 3 * 1024 * 1024, 422, "An image exceeds 3 MB.");
      const valid =
        extension === "png"
          ? body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
          : extension === "jpeg"
            ? body[0] === 0xff && body[1] === 0xd8
            : extension === "gif"
              ? /^GIF8[79]a/.test(body.toString("ascii", 0, 6))
              : body.toString("ascii", 0, 4) === "RIFF" &&
                body.toString("ascii", 8, 12) === "WEBP";
      insist(valid, 422, "An uploaded image does not match its file type.");
    } else {
      // Remote URLs stay client-side. The publisher never fetches user-controlled URLs.
      insist(
        /^https:\/\//.test(source),
        422,
        "Use HTTPS image URLs before publishing.",
      );
    }
    if (body) {
      const name = `images/${digest(body)}.${extension}`;
      if (!artifacts.some((a) => a.name === name))
        add({ name, body, type: `image/${extension}` });
      replacements.set(source, `${releaseBase}/${name}`);
    }
  }
  for (const section of sections)
    replaceSectionImages(section, (src) => replacements.get(src) || undefined);
  replaceCollectionImages(
    project.collections,
    (src) => replacements.get(src) || undefined,
  );
  for (const page of project.pages)
    add({
      name: pageHref(page.slug),
      type: "text/html; charset=utf-8",
      body: Buffer.from(
        renderPage(project, page).replace(
          'href="styles.css"',
          `href="${releaseBase}/styles.css"`,
        ),
      ),
    });
  for (const { collection, item } of publishedItems(project.collections))
    add({
      name: itemHref(collection, item),
      type: "text/html; charset=utf-8",
      body: Buffer.from(
        renderItemPage(project, collection, item, { inbox }).replace(
          'href="styles.css"',
          `href="${releaseBase}/styles.css"`,
        ),
      ),
    });
  // A page of the site's own called "thanks" wins; visitors land there instead.
  if (
    inbox &&
    project.collections?.some((c) => c.request) &&
    !project.pages.some((p) => p.slug === "thanks")
  )
    add({
      name: "thanks.html",
      type: "text/html; charset=utf-8",
      body: Buffer.from(
        renderThanksPage(project).replace(
          'href="styles.css"',
          `href="${releaseBase}/styles.css"`,
        ),
      ),
    });
  add({
    name: "styles.css",
    type: "text/css; charset=utf-8",
    body: Buffer.from(
      `html,body{margin:0;padding:0}body{min-width:320px}*{box-sizing:border-box}\n${websiteCss}`,
    ),
  });
  insist(
    artifacts.reduce((sum, file) => sum + file.body.length, 0) <=
      30 * 1024 * 1024,
    422,
    "The published site exceeds 30 MB.",
  );
  return artifacts;
}
