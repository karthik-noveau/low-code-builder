import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2),
  action = args[0];
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const liveData = path.resolve(
  root,
  process.env.FORMA_DATA_DIR || ".local/data",
);
export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function files(directory, prefix = "") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isSymbolicLink())
      throw new Error(`Backups do not follow symbolic links: ${relative}`);
    if (item.isDirectory())
      result.push(...(await files(path.join(directory, item.name), relative)));
    else if (item.isFile()) result.push(relative);
    else throw new Error(`Unsupported file: ${relative}`);
  }
  return result;
}
async function exists(file) {
  return access(file)
    .then(() => true)
    .catch(() => false);
}
async function requireOffline(source) {
  if (source !== liveData) return;
  for (const port of [8787, 8008]) {
    const active = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    })
      .then(() => true)
      .catch(() => false);
    if (active)
      throw new Error(
        "Stop local services before backing up the database: npm run local:stop. This keeps the snapshot consistent.",
      );
  }
}
export async function createBackup(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  if (destination === source || destination.startsWith(`${source}${path.sep}`))
    throw new Error(
      "The backup destination must be outside the data directory.",
    );
  if (await exists(destination))
    throw new Error(
      "Backup destination already exists. Choose a new directory.",
    );
  await requireOffline(source);
  const entries = await files(source);
  await mkdir(path.join(destination, "data"), { recursive: true, mode: 0o700 });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: [],
  };
  for (const relative of entries) {
    const original = path.join(source, relative),
      copy = path.join(destination, "data", relative);
    await mkdir(path.dirname(copy), { recursive: true, mode: 0o700 });
    await cp(original, copy, { errorOnExist: true, force: false });
    manifest.files.push({
      path: relative,
      bytes: (await stat(copy)).size,
      sha256: await sha256(copy),
    });
  }
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  return manifest;
}
export async function verifyBackup(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1 || !Array.isArray(manifest.files))
    throw new Error("Unsupported backup manifest.");
  const paths = new Set();
  for (const entry of manifest.files) {
    if (
      typeof entry.path !== "string" ||
      !entry.path ||
      path.posix.isAbsolute(entry.path) ||
      entry.path.includes("\\") ||
      entry.path.split("/").some((p) => p === ".." || p === "." || !p) ||
      paths.has(entry.path)
    )
      throw new Error("Invalid backup path.");
    paths.add(entry.path);
  }
  const actual = await files(path.join(directory, "data"));
  if (actual.length !== paths.size || actual.some((file) => !paths.has(file)))
    throw new Error("Backup files differ from the manifest.");
  for (const entry of manifest.files) {
    const file = path.join(directory, "data", entry.path);
    if (
      (await stat(file)).size !== entry.bytes ||
      (await sha256(file)) !== entry.sha256
    )
      throw new Error(`Backup verification failed: ${entry.path}`);
  }
  return manifest;
}
export async function restoreBackup(directory, destination) {
  if (await exists(destination))
    throw new Error(
      "Restore destination already exists. Existing data is never overwritten.",
    );
  const manifest = await verifyBackup(directory);
  await cp(path.join(directory, "data"), destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  for (const entry of manifest.files)
    if ((await sha256(path.join(destination, entry.path))) !== entry.sha256)
      throw new Error(`Restored file differs: ${entry.path}`);
  return manifest;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = path.resolve(option("--source") || liveData);
  const destination =
    option("--destination") && path.resolve(option("--destination"));
  if (action === "create") {
    const target =
      destination ||
      path.join(
        root,
        ".local/backups",
        new Date().toISOString().replaceAll(":", "-"),
      );
    const result = await createBackup(source, target);
    console.log(`Created ${target} (${result.files.length} verified files).`);
  } else if (action === "verify") {
    const result = await verifyBackup(source);
    console.log(`Backup verified: ${result.files.length} files.`);
  } else if (action === "restore" && destination) {
    const result = await restoreBackup(source, destination);
    console.log(
      `Restored ${result.files.length} files to ${destination}. Set FORMA_DATA_DIR to this directory when starting local services.`,
    );
  } else
    throw new Error(
      "Use create [--source DATA] [--destination BACKUP], verify --source BACKUP, or restore --source BACKUP --destination NEW_DIRECTORY.",
    );
}
