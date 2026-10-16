import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from "../../scripts/local-backup.mjs";
import { releaseBlockers } from "../../scripts/release-readiness.mjs";

describe("local recovery and release requirements", () => {
  it("restores a verified snapshot and refuses corrupted or overwriting restores", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "forma-backup-test-"));
    try {
      const source = path.join(root, "source"),
        backup = path.join(root, "backup"),
        restored = path.join(root, "restored");
      await mkdir(path.join(source, "db"), { recursive: true });
      await writeFile(path.join(source, "db", "test.db"), "test fixture data");
      await createBackup(source, backup);
      await verifyBackup(backup);
      await restoreBackup(backup, restored);
      expect(await readFile(path.join(restored, "db", "test.db"), "utf8")).toBe(
        "test fixture data",
      );
      await expect(restoreBackup(backup, restored)).rejects.toThrow(
        "already exists",
      );
      await writeFile(path.join(backup, "data", "db", "test.db"), "corrupted");
      await expect(verifyBackup(backup)).rejects.toThrow("verification failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("requires evidence for every deployment requirement", () => {
    expect(
      releaseBlockers({
        version: 1,
        requirements: [{ status: "verified", evidence: "" }],
      }),
    ).toHaveLength(1);
    expect(
      releaseBlockers({
        version: 1,
        requirements: [{ status: "pending", evidence: "a document" }],
      }),
    ).toHaveLength(1);
    expect(
      releaseBlockers({
        version: 1,
        requirements: [
          { status: "verified", evidence: "integration test result" },
        ],
      }),
    ).toHaveLength(0);
    expect(() => releaseBlockers({ version: 1, requirements: [] })).toThrow();
  });
});
