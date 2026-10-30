import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import {
  liveAppForms,
  renderItemPage,
  renderPage,
  renderThanksPage,
} from "../src/studio/export";
import { APP_SCRIPT } from "../src/apps/widget";
import { SITE_SCRIPT, needsSiteScript } from "../src/studio/siteScript";
import { DATA_SCRIPT } from "../src/blocks/data/runtime";
import { needsDataScript } from "../src/blocks/data/project";
import { LOGIC_SCRIPT } from "../src/blocks/logic/runtime";
import { needsLogicScript } from "../src/blocks/logic/project";
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
import blocksCss from "../src/blocks/blocks.css?raw";
import looksCss from "../src/blocks/looks.css?raw";
import formsCss from "../src/blocks/forms/forms.css?raw";
import { digest } from "./project";
import { walk, type Node } from "../src/blocks/model";
import { createNode } from "../src/blocks/registry";
import { productCards } from "../src/blocks/legacy";
import { inboxForms } from "../src/blocks/project";
import { config, insist } from "./config";
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
  "plant-4.jpg",
  "plant-5.jpg",
  "plant-6.jpg",
  "plant-7.jpg",
  "plant-8.jpg",
  "books.jpg",
  "interior.jpg",
  "architecture.jpg",
  "restaurant.jpg",
  "garden.jpg",
  // Flat illustrations for the business templates.
  "ac-service.jpg",
  "breads.jpg",
  "ceiling-fan.jpg",
  "classroom.jpg",
  "dairy.jpg",
  "dessert.jpg",
  "drinks.jpg",
  "electrical-shop.jpg",
  "fruits.jpg",
  "groceries.jpg",
  "gym.jpg",
  "home-tools.jpg",
  "led-bulb.jpg",
  "salon.jpg",
  "staples.jpg",
  "switches.jpg",
  "vegetables.jpg",
  "wires.jpg",
  // Illustrated people (no real faces) for team and review sections.
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `person-${i}.jpg`),
  // Grey placeholder logos (transparent PNG) for logo strips.
  ...[1, 2, 3, 4, 5, 6].map((i) => `logo-placeholder-${i}.png`),
]);
/**
 * A blocks header's button becomes "Shop" (the store's address): its first
 * button, shown even if hidden, or a new one beside the menu.
 */
function shopButton(root: Node, url: string) {
  const nodes = [...walk([root])];
  const button = nodes.find((n) => n.type === "button");
  if (button) {
    button.props = { ...button.props, label: "Shop", url };
    delete button.hidden;
    return;
  }
  const parent =
    nodes.find((n) => n.children?.some((c) => c.type === "menu")) ?? root;
  parent.children = [
    ...(parent.children ?? []),
    createNode("button", { label: "Shop", url, size: "sm" }),
  ];
}
export async function compileSite(
  input: Project,
  releaseBase: string,
  commerce?: CommerceBinding,
  /** Endpoint for visitor action forms; without it item pages show no form. */
  inbox?: string,
  /** The public app API for this site; without it app sections show no form. */
  appApi?: string,
): Promise<Artifact[]> {
  const project = structuredClone(input);
  // OWNER_LINK ("{owner}") opens the owner's branded app for this site. The
  // site id is the one in the release path: /sites/<id>/releases/<release>.
  const siteId = /^\/sites\/([^/]+)\/releases\//.exec(releaseBase)?.[1];
  const owner = siteId
    ? `${config.editorOrigin}/owner?site=${encodeURIComponent(siteId)}`
    : undefined;
  if (commerce?.shopUrl)
    for (const section of project.header)
      if (section.type === "header") {
        section.buttonLabel = "Shop";
        section.buttonUrl = commerce.shopUrl;
      } else if (section.root?.props.tag === "header")
        shopButton(section.root, commerce.shopUrl);
  if (commerce?.products)
    for (const page of project.pages)
      for (const section of page.sections)
        if (section.type === "products")
          section.items = structuredClone(commerce.products);
        else
          for (const node of walk(section.root ? [section.root] : []))
            if (node.type === "products")
              node.children = productCards(commerce.products, node.id);
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
  // The header's logo mark may be an uploaded image; "bolt" is drawn, not stored.
  const logo =
    project.theme.logo && project.theme.logo !== "bolt"
      ? safeImage(project.theme.logo)
      : "";
  if (project.theme.logo && project.theme.logo !== "bolt" && !logo)
    delete project.theme.logo;
  const sources = new Set([
    ...sections.flatMap(sectionImages),
    ...collectionImages(project.collections),
    ...(logo ? [logo] : []),
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
      extension = name.endsWith(".png") ? "png" : "jpeg";
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
  if (logo && replacements.has(logo))
    project.theme.logo = replacements.get(logo);
  for (const page of project.pages)
    add({
      name: pageHref(page.slug),
      type: "text/html; charset=utf-8",
      body: Buffer.from(
        renderPage(project, page, { inbox, appApi, owner }).replace(
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
        renderItemPage(project, collection, item, {
          inbox,
          appApi,
          owner,
        }).replace('href="styles.css"', `href="${releaseBase}/styles.css"`),
      ),
    });
  // A page of the site's own called "thanks" wins; visitors land there instead.
  if (
    inbox &&
    (project.collections?.some((c) => c.request) ||
      sections.some(
        (s) =>
          (s.type === "contact" || s.type === "newsletter") &&
          !/^https?:\/\//i.test(s.formAction),
      ) ||
      inboxForms(sections).some((f) => !/^https?:\/\//i.test(f.action))) &&
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
      `html,body{margin:0;padding:0}body{min-width:320px}*{box-sizing:border-box}\n${websiteCss}\n${blocksCss}\n${looksCss}\n${formsCss}`,
    ),
  });
  const files = appApi ? appFiles(project, releaseBase) : [];
  // The theme switch and moving backgrounds share app.js with app forms.
  if (needsSiteScript(project)) {
    const script = files.find((f) => f.name === "app.js");
    if (script)
      script.body = Buffer.concat([script.body, Buffer.from(SITE_SCRIPT)]);
    else
      files.unshift({
        name: "app.js",
        type: "text/javascript; charset=utf-8",
        body: Buffer.from(SITE_SCRIPT),
      });
  }
  // App data blocks (lists, tables, figures) are filled by the data script.
  if (needsDataScript(project, appApi)) {
    const script = files.find((f) => f.name === "app.js");
    if (script)
      script.body = Buffer.concat([script.body, Buffer.from(DATA_SCRIPT)]);
    else
      files.unshift({
        name: "app.js",
        type: "text/javascript; charset=utf-8",
        body: Buffer.from(DATA_SCRIPT),
      });
  }
  // Clicks, conditions and page values: logic.js, loaded only by the pages
  // that use them (src/blocks/logic).
  if (needsLogicScript(project))
    files.push({
      name: "logic.js",
      type: "text/javascript; charset=utf-8",
      body: Buffer.from(LOGIC_SCRIPT),
    });
  for (const file of files) add(file);
  insist(
    artifacts.reduce((sum, file) => sum + file.body.length, 0) <=
      30 * 1024 * 1024,
    422,
    "The published site exceeds 30 MB.",
  );
  return artifacts;
}

/**
 * app.js for app forms, and when the app installs: a manifest, icons, a
 * service worker and its offline page. They're served from the site's live
 * root (not the release folder) because a service worker only controls pages
 * at or below its own path.
 */
function appFiles(project: Project, releaseBase: string): Artifact[] {
  const app = project.app;
  if (!app) return [];
  const install = app.install.enabled;
  if (!install && !liveAppForms(project).length) return [];
  const register =
    "\n;if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).catch(function(){});});\n";
  const files: Artifact[] = [
    {
      name: "app.js",
      type: "text/javascript; charset=utf-8",
      body: Buffer.from(APP_SCRIPT + (install ? register : "")),
    },
  ];
  if (!install) return files;
  const accent = /^#[\da-f]{6}$/i.test(project.theme.accent)
    ? project.theme.accent
    : "#1c1c1c";
  const background = /^#[\da-f]{6}$/i.test(project.theme.background)
    ? project.theme.background
    : "#ffffff";
  const name = (app.install.name || project.name).slice(0, 60);
  const shortName = (app.install.shortName || name).slice(0, 20);
  const initial =
    /[a-z0-9]/i.exec(shortName)?.[0].toUpperCase() ??
    /[a-z0-9]/i.exec(project.name)?.[0].toUpperCase() ??
    "";
  const ink = luminance(accent) > 0.6 ? "#1c1c1c" : "#ffffff";
  const escape = (v: string) =>
    v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const pages = project.pages.map((p) => pageHref(p.slug));
  const precache = [
    ".",
    ...pages,
    "offline.html",
    `${releaseBase}/styles.css`,
    "icon.svg",
  ];
  const version = digest(releaseBase + pages.join()).slice(0, 12);
  files.push(
    {
      name: "manifest.webmanifest",
      type: "application/manifest+json",
      body: Buffer.from(
        JSON.stringify({
          name,
          short_name: shortName,
          start_url: ".",
          scope: ".",
          display: "standalone",
          theme_color: accent,
          background_color: background,
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
          ],
        }),
      ),
    },
    {
      name: "icon.svg",
      type: "image/svg+xml",
      body: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${accent}"/><text x="256" y="256" dy=".35em" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="280" font-weight="700" fill="${ink}">${escape(initial)}</text></svg>`,
      ),
    },
    {
      name: "icon-192.png",
      type: "image/png",
      body: iconPng(192, accent, ink, initial),
    },
    {
      name: "icon-512.png",
      type: "image/png",
      body: iconPng(512, accent, ink, initial),
    },
    {
      name: "sw.js",
      type: "text/javascript; charset=utf-8",
      // Caches are per origin and published sites can share one, so names carry the scope.
      body: Buffer.from(`const PREFIX = "forma:" + self.registration.scope + ":";
const CACHE = PREFIX + ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// Network first, so visitors always see the live site; the cache is for when they're offline.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.open(CACHE).then((cache) =>
          cache.match(request).then((hit) =>
            hit || (request.mode === "navigate" ? cache.match(new URL("offline.html", self.registration.scope)) : Response.error()),
          ),
        ),
      ),
  );
});
`),
    },
  );
  if (!project.pages.some((p) => p.slug === "offline"))
    files.push({
      name: "offline.html",
      type: "text/html; charset=utf-8",
      body: Buffer.from(
        `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Offline — ${escape(project.name)}</title><meta name="theme-color" content="${accent}"><link rel="stylesheet" href="${releaseBase}/styles.css"></head><body style="background:${background};color:${/^#[\da-f]{6}$/i.test(project.theme.color) ? project.theme.color : "#1c1c1c"}"><main style="max-width:32rem;margin:20vh auto;padding:0 1.5rem;font:16px/1.5 system-ui,-apple-system,sans-serif"><h1 style="font-size:1.6rem;margin:0 0 .5rem">You’re offline</h1><p>${escape(project.name)} will load again when you’re back online. Pages you’ve opened before still work.</p><p><a href="./" style="color:${accent};font-weight:600">Try again</a></p></main></body></html>`,
      ),
    });
  return files;
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** 5×7 pixel letters for PNG icons (rows as hex), so installing needs no image library. */
const GLYPHS = Object.fromEntries(
  "A0e11111f111111 B1e11111e11111e C0e11101010110e D1e11111111111e E1f10101e10101f F1f10101e101010 G0e11101711110f H1111111f111111 I0e04040404040e J0702020202120c K11121418141211 L1010101010101f M111b1515111111 N11111915131111 O0e11111111110e P1e11111e101010 Q0e11111115120d R1e11111e141211 S0f10100e01011e T1f040404040404 U1111111111110e V11111111110a04 W1111111515150a X11110a040a1111 Y11110a04040404 Z1f01020408101f 00e11131519110e 1040c040404040e 20e11010204081f 31f02040201110e 402060a121f0202 51f101e0101110e 60608101e11110e 71f010204080808 80e11110e11110e 90e11110f01020c"
    .split(" ")
    .map((g) => [
      g[0],
      g
        .slice(1)
        .match(/../g)!
        .map((r) => parseInt(r, 16)),
    ]),
) as Record<string, number[]>;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A square PNG in the accent colour with the site's initial, full-bleed so it also works as a maskable icon. */
export function iconPng(
  size: number,
  background: string,
  ink: string,
  letter: string,
) {
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const bg = rgb(background),
    fg = rgb(ink);
  const glyph = GLYPHS[letter];
  // The letter fills about 40% of the height: inside the maskable safe zone.
  const cell = Math.floor((size * 0.4) / 7);
  const left = Math.floor((size - cell * 5) / 2),
    top = Math.floor((size - cell * 7) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    const gy = Math.floor((y - top) / cell);
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - left) / cell);
      const on =
        glyph &&
        gy >= 0 &&
        gy < 7 &&
        gx >= 0 &&
        gx < 5 &&
        x >= left &&
        y >= top &&
        (glyph[gy] >> (4 - gx)) & 1;
      const color = on ? fg : bg;
      raw.set(color, row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
