import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, open, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const directory = path.join(root, ".local");
const pidFile = path.join(directory, "dev-local.pid");
const action = process.argv[2] || "status";
if (!["start", "stop", "restart", "status"].includes(action))
  throw new Error("Use start, stop, restart or status.");
await mkdir(directory, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function running() {
  const pid = Number(await readFile(pidFile, "utf8").catch(() => "0"));
  if (!Number.isInteger(pid) || pid < 2) return undefined;
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return command.includes("scripts/dev-local.mjs") ? pid : undefined;
  } catch {
    return undefined;
  }
}
async function ready() {
  try {
    const response = await fetch("http://127.0.0.1:8787/health", {
      signal: AbortSignal.timeout(1000),
    });
    const page = await fetch("http://127.0.0.1:5178", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok && page.ok;
  } catch {
    return false;
  }
}
let pid = await running();
if (action === "status") {
  console.log(
    JSON.stringify(
      {
        supervisor: pid || null,
        ready: await ready(),
        editor: "http://localhost:5178",
        log: path.join(directory, "dev-local.log"),
      },
      null,
      2,
    ),
  );
} else {
  const lock = path.join(directory, "service-command.lock");
  const handle = await open(lock, "wx").catch(() => {
    throw new Error(
      "Another service command is running. Try again after it finishes.",
    );
  });
  try {
    if ((action === "stop" || action === "restart") && pid) {
      process.kill(pid, "SIGTERM");
      for (let attempt = 0; attempt < 100 && (await running()); attempt++)
        await pause(100);
      if (await running())
        throw new Error(
          "The supervisor did not stop. Inspect the local service log.",
        );
      await pause(500);
      pid = undefined;
    }
    if (action !== "stop") {
      if (!pid) {
        const log = await open(
          path.join(directory, "dev-local.log"),
          "a",
          0o600,
        );
        try {
          const child = spawn(process.execPath, ["scripts/dev-local.mjs"], {
            cwd: root,
            detached: true,
            stdio: ["ignore", log.fd, log.fd],
            env: {
              ...process.env,
              PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`,
            },
          });
          await new Promise((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          await writeFile(pidFile, `${child.pid}\n`, { mode: 0o600 });
          child.unref();
          pid = child.pid;
        } finally {
          await log.close();
        }
      }
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await ready()) break;
        if (attempt === 119 || !(await running()))
          throw new Error(
            `Local services did not become ready. Inspect ${path.join(directory, "dev-local.log")}.`,
          );
        await pause(250);
      }
      console.log(
        `Local website and backend ready at http://localhost:5178 (supervisor ${pid}).`,
      );
    } else console.log("Local services stopped. Saved data is preserved.");
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
