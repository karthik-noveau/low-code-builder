import { mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Official AWS distribution, verified against its published checksum.
const root = new URL("../.local/dynamodb/", import.meta.url);
await mkdir(root, { recursive: true });
await mkdir(new URL("../data/db/", root), { recursive: true });
try {
  await access(new URL("DynamoDBLocal.jar", root));
  console.log("DynamoDB Local is installed.");
} catch {
  const source =
    "https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz";
  const [archive, checksum] = await Promise.all([
    fetch(source),
    fetch(`${source}.sha256`),
  ]);
  if (!archive.ok || !checksum.ok)
    throw new Error("Could not download DynamoDB Local from AWS.");
  const bytes = Buffer.from(await archive.arrayBuffer());
  const expected = (await checksum.text())
    .match(/\b[a-f0-9]{64}\b/i)?.[0]
    .toLowerCase();
  if (
    !expected ||
    createHash("sha256").update(bytes).digest("hex") !== expected
  )
    throw new Error("DynamoDB Local checksum mismatch.");
  await writeFile(new URL("archive.tar.gz", root), bytes);
  execFileSync("tar", [
    "-xzf",
    new URL("archive.tar.gz", root).pathname,
    "-C",
    root.pathname,
  ]);
  await writeFile(new URL("verified.sha256", root), expected + "\n");
  console.log("Installed and checksum-verified DynamoDB Local.");
}
execFileSync("java", ["-version"], { stdio: "inherit" });
console.log(
  "Ready. Run npm run dev:local (Java 17+ required). Local state stays in .local/.",
);
