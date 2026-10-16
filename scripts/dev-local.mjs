import { spawn, execFileSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
await access(".local/dynamodb/DynamoDBLocal.jar").catch(() => {
  throw new Error("Run npm run local:setup first.");
});
const databaseDirectory = path.join(
  path.resolve(process.env.FORMA_DATA_DIR || ".local/data"),
  "db",
);
await mkdir(databaseDirectory, { recursive: true });
execFileSync(process.execPath, ["scripts/build-backend.mjs"], {
  stdio: "inherit",
});
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300).unref();
}
function start(command, args, extra = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extra },
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
  return child;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
const existing = await fetch("http://127.0.0.1:8008")
  .then(() => true)
  .catch(() => false);
if (!existing)
  start("java", [
    "-Djava.library.path=.local/dynamodb/DynamoDBLocal_lib",
    "-jar",
    ".local/dynamodb/DynamoDBLocal.jar",
    "-sharedDb",
    "-disableTelemetry",
    "-dbPath",
    databaseDirectory,
    "-port",
    "8008",
  ]);
for (let i = 0; i < 100; i++) {
  if (
    await fetch("http://127.0.0.1:8008")
      .then(() => true)
      .catch(() => false)
  )
    break;
  if (i === 99) {
    stop(1);
    throw new Error("DynamoDB Local did not start.");
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
start(process.execPath, [".build/local.js"], {
  FORMA_MODE: "local",
  ASSET_DIR: path.join(root, "public/images"),
});
if (!process.argv.includes("--backend-only"))
  start(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5178",
      "--strictPort",
    ],
    { FORMA_LOCAL: "true" },
  );
