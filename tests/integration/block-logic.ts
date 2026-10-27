/**
 * Logic (src/blocks/logic) end to end: a site with tabs, a "Book now"
 * dialog and a limited-time offer publishes with logic.js on the page that
 * uses it, its config as inert JSON, and the script served under the site's
 * CSP (`script-src 'self'`). Run from apps.test.ts, which owns the account
 * (the local sign-up limiter allows a few accounts a minute).
 */
import { expect } from "vitest";
import { createProject, createSection } from "../../src/studio/templates";
import { presetById } from "../../src/blocks/presets";
import { syncForms } from "../../src/blocks/forms/sync";
import { validateProject } from "../../src/studio/model";
import { publish, useAccount, type Call } from "./block-forms";

const sites = process.env.TEST_SITE_URL || "http://127.0.0.1:8788";

export async function checkBlockLogic(owner: string, api: Call) {
  useAccount(owner, api);
  const before = createProject("blank", "Logic test");
  const after = structuredClone(before);
  const ids = ["logic-tabs", "logic-book-now", "logic-offer"];
  after.pages[0].sections = ids.map((id) =>
    createSection("blocks", {
      name: id,
      root: presetById(id)!.build({ project: after }),
    }),
  );
  after.pages[0].variables = ids.flatMap(
    (id) => presetById(id)!.variables?.() ?? [],
  );
  const project = syncForms(before, after);
  expect(validateProject(project)).toBe(true);
  const id = await publish(project);

  const page = await fetch(`${sites}/sites/${id}/index.html`);
  const html = await page.text();
  expect(page.headers.get("content-security-policy")).toContain(
    "script-src 'self'",
  );
  expect(html).toContain('<script src="logic.js" defer></script>');
  for (const tag of html.match(/<script\b[^>]*>/g) ?? [])
    expect(tag).toMatch(/src="(app|logic)\.js"|type="application\/json"/);
  const config = JSON.parse(
    /<script type="application\/json" id="forma-logic">([\s\S]*?)<\/script>/.exec(
      html,
    )![1],
  );
  expect(config.vars.tab).toEqual({ type: "text", value: "services" });
  expect(Object.values(config.act).flat()).toContainEqual(
    expect.objectContaining({ do: "open" }),
  );
  // The starting state is in the HTML: one tab panel shown, the dialog closed.
  expect(html.match(/data-when="[\w-]+"[^>]*hidden=""/g)?.length).toBe(2);
  expect(html).toMatch(/<dialog[^>]*aria-labelledby="dlg-/);
  // The booking form inside the dialog is a live app form.
  expect(html).toContain("data-blocks-form");

  const script = await fetch(`${sites}/sites/${id}/logic.js`);
  expect(script.status).toBe(200);
  expect(script.headers.get("content-type")).toContain("text/javascript");
  const source = await script.text();
  expect(source).toContain("forma-logic");
  expect(source).not.toMatch(/\beval\(|new Function|innerHTML/);
  // Unknown files still 404.
  expect((await fetch(`${sites}/sites/${id}/other.js`)).status).toBe(404);
  return id;
}
