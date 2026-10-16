import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";

// Public pages are static HTML; visits need no Lambda or database request.
await mkdir(".build", { recursive: true });
await build({
  entryPoints: ["src/brand/prerender.tsx"],
  outfile: ".build/brand-render.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node22",
  packages: "external",
  loader: { ".css": "empty" },
});
const { renderPage, metadataFor, publicPaths, privatePaths, previewPaths } =
  await import(pathToFileURL(resolve(".build/brand-render.mjs")).href);
const shell = await readFile("dist/index.html", "utf8");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const configuredOrigin = process.env.PUBLIC_SITE_URL;
const origin = configuredOrigin ? new URL(configuredOrigin).origin : undefined;
if (origin && !origin.startsWith("https://"))
  throw new Error("PUBLIC_SITE_URL must use HTTPS.");
for (const path of [...publicPaths, ...privatePaths, ...previewPaths, "/404"]) {
  const meta = metadataFor(path);
  const publicPage = publicPaths.includes(path);
  const html = shell
    .replace(/<title>.*?<\/title>/s, `<title>${escape(meta.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
      `<meta name="description" content="${escape(meta.description)}" />`,
    )
    .replace(
      "</head>",
      `<meta property="og:type" content="website" /><meta property="og:site_name" content="Forma" /><meta property="og:title" content="${escape(meta.title)}" /><meta property="og:description" content="${escape(meta.description)}" />${privatePaths.includes(path) || path === "/404" ? '<meta name="robots" content="noindex, nofollow" />' : ""}${origin && (publicPage || previewPaths.includes(path)) ? `<link rel="canonical" href="${escape(origin + path)}" />` : ""}</head>`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${publicPage || path === "/404" ? renderPage(path) : ""}</div>`,
    );
  const file =
    path === "/"
      ? "dist/index.html"
      : path === "/404"
        ? "dist/404.html"
        : `dist${path}/index.html`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
await writeFile(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\n${privatePaths.map((path) => `Disallow: ${path}`).join("\n")}\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ""}`,
);
if (origin)
  await writeFile(
    "dist/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...publicPaths, ...previewPaths].map((path) => `<url><loc>${escape(origin + path)}</loc></url>`).join("")}</urlset>`,
  );
console.log(
  `Built ${publicPaths.length} public pages, ${previewPaths.length} template previews, and ${privatePaths.length} workspace entrypoints.`,
);
