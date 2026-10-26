import { describe, expect, it } from "vitest";
import { createProject, createSection } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";
import { APP_TEMPLATES } from "../../src/apps/templates";
import type { AppView } from "../../src/apps/model";
import { presetById } from "../../src/blocks/presets";
import { walk } from "../../src/blocks/model";
import { DATA_SCRIPT } from "../../src/blocks/data/runtime";
import { compileSite } from "../../backend/compiler";
import { appConfig } from "../../backend/apps";
import { isPublicAppPath } from "../../backend/api";

function site() {
  const p = createProject("blank");
  p.collections = [createCollection("products")];
  const app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Shop");
  const [customers] = app.tables;
  const view: AppView = {
    id: "top",
    name: "Top customers",
    table: customers.id,
    fields: [customers.titleField, customers.totals[0].id],
    statuses: [],
    sort: customers.totals[0].id,
    limit: 10,
    public: true,
  };
  app.views = [view, { ...view, id: "draft", public: false }];
  p.app = app;
  const products = presetById("data-products")!.build({ project: p });
  const board = presetById("data-leaderboard")!.build({ project: p });
  const repeat = [...walk([board])].find((n) => n.type === "repeat")!;
  repeat.props.source = "view:top";
  p.pages[0].sections.push(
    createSection("blocks", { name: "Products", root: products }),
    createSection("blocks", { name: "Leaders", root: board }),
  );
  return p;
}

describe("data blocks when publishing", () => {
  it("writes collections into the page and loads app lists with the data script", async () => {
    const p = site();
    const files = await compileSite(
      p,
      "/sites/abc/releases/r1",
      undefined,
      undefined,
      "https://api.test/apps/abc",
    );
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).toContain("Fiddle leaf fig");
    expect(home).toContain('data-view="top"');
    expect(home).toContain('<script src="app.js" defer></script>');
    expect(files.find((f) => f.name === "app.js")!.body.toString()).toContain(
      DATA_SCRIPT,
    );
  });
  it("publishes no data script without app lists", async () => {
    const p = createProject("blank");
    p.collections = [createCollection("products")];
    p.pages[0].sections.push(
      createSection("blocks", {
        name: "Products",
        root: presetById("data-products")!.build({ project: p }),
      }),
    );
    const files = await compileSite(
      p,
      "/sites/abc/releases/r1",
      undefined,
      undefined,
      "https://api.test/apps/abc",
    );
    expect(files.some((f) => f.name === "app.js")).toBe(false);
  });
  it("puts only public views in the live app config", () => {
    const config = appConfig(site())!;
    expect(config.app.views!.map((v) => v.id)).toEqual(["top"]);
  });
  it("serves views and metrics as public, CORS-open routes", () => {
    expect(isPublicAppPath("/apps/abc/views/top")).toBe(true);
    expect(isPublicAppPath("/apps/abc/metrics")).toBe(true);
    expect(isPublicAppPath("/apps/abc/views/top/extra")).toBe(false);
  });
});
