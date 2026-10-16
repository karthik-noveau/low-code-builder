import { build } from "esbuild";
import { mkdir, readFile, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(path.join(root, ".build"), { recursive: true });
await build({
  entryPoints: {
    local: path.join(root, "backend/local.ts"),
    lambda: path.join(root, "backend/lambda.ts"),
  },
  outdir: path.join(root, ".build"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  jsx: "automatic",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  plugins: [
    {
      name: "raw-css",
      setup(build) {
        build.onResolve({ filter: /\.css\?raw$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
          namespace: "raw-css",
        }));
        build.onLoad({ filter: /.*/, namespace: "raw-css" }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }));
        build.onLoad({ filter: /\.css$/ }, () => ({
          contents: "",
          loader: "empty",
        }));
      },
    },
  ],
});
await cp(path.join(root, "public/images"), path.join(root, ".build/images"), {
  recursive: true,
});
console.log("Backend built for Node 22 (local server and Lambda handlers).");
