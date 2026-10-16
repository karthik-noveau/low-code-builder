import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(
  await readFile(new URL("../release-readiness.json", import.meta.url), "utf8"),
);
export function releaseBlockers(report) {
  if (
    !report ||
    report.version !== 1 ||
    !Array.isArray(report.requirements) ||
    report.requirements.length === 0
  )
    throw new Error("Invalid release readiness manifest.");
  return report.requirements.filter(
    (item) =>
      item.status !== "verified" ||
      typeof item.evidence !== "string" ||
      !item.evidence.trim(),
  );
}
export function assertReleaseReady() {
  const blockers = releaseBlockers(manifest);
  if (blockers.length)
    throw new Error(
      `Deployment is blocked by the pre-deployment requirements:\n${blockers.map((item) => `- ${item.title}: ${item.status}`).join("\n")}\nReview release-readiness.json; do not mark a requirement verified without its supporting evidence.`,
    );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const blockers = releaseBlockers(manifest);
  console.log(
    JSON.stringify(
      {
        deploymentAllowed: blockers.length === 0,
        requirements: manifest.requirements,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--enforce")) assertReleaseReady();
}
