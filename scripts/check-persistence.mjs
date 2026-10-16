import { writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

// Run prepare, restart dev:local, then verify. Uses a disposable local test account.
const marker = ".local/persistence-check.json";
const api = async (path, token, body, extra = {}) => {
  const response = await fetch(`http://127.0.0.1:8787${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...extra,
  });
  assert.ok(response.ok, `API returned ${response.status}`);
  return response.json();
};
if (process.argv[2] === "prepare") {
  const auth = await api("/auth/register", "", {
    email: `persistence-${randomUUID()}@local.test`,
    password: randomUUID(),
  });
  const { site } = await api("/sites", auth.token, {
    name: "Persistence check",
  });
  const project = {
    version: 1,
    name: "Persistence check",
    template: "blank",
    theme: {
      accent: "#222222",
      color: "#222222",
      background: "#ffffff",
      font: "modern",
      radius: 0,
    },
    header: [],
    footer: [],
    assets: [],
    pages: [
      {
        id: randomUUID(),
        name: "Home",
        slug: "",
        title: "A persistent site",
        description: "",
        sections: [],
      },
    ],
  };
  await api(`/sites/${site.id}/draft`, auth.token, undefined, {
    method: "PUT",
    body: gzipSync(JSON.stringify(project)),
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/gzip",
      "if-match": "0",
    },
  });
  await writeFile(
    marker,
    JSON.stringify({ token: auth.token, siteId: site.id, project }),
    { mode: 0o600 },
  );
  console.log(
    "Prepared a saved draft and session. Restart the local backend, then run this script with verify.",
  );
} else if (process.argv[2] === "verify") {
  const state = JSON.parse(await readFile(marker, "utf8"));
  const loaded = await api(`/sites/${state.siteId}/draft`, state.token);
  assert.deepEqual(loaded, state.project);
  await api("/auth/logout", state.token, {});
  await unlink(marker);
  console.log(
    "PASS: account session, metadata and compressed draft survived a full local backend restart.",
  );
} else
  throw new Error("Use prepare or verify. This checks local services only.");
