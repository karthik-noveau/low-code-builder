import { describe, expect, it } from "vitest";
import {
  APP_TEMPLATES,
  combineApps,
  ordersApp,
  reservationsApp,
} from "./templates";
import { validateApp } from "./model";
import { appIssues } from "./issues";
import { createProject, createSection } from "../studio/templates";
import { validateProject } from "../studio/model";

describe("app templates", () => {
  it("are all valid apps", () => {
    for (const t of APP_TEMPLATES)
      expect([t.id, validateApp(t.build("Shop"))]).toEqual([t.id, true]);
  });
  it("come with the collections their item fields choose from", () => {
    for (const t of APP_TEMPLATES) {
      const { app, collections } = t.create("Shop");
      const ids = collections.map((c) => c.id);
      expect([t.id, validateApp(app, ids)]).toEqual([t.id, true]);
      const used = app.tables.flatMap((table) =>
        table.fields.flatMap((f) => (f.collection ? [f.collection] : [])),
      );
      expect(used.every((id) => ids.includes(id))).toBe(true);
    }
  });
  it("install into a site with their collections", () => {
    for (const t of APP_TEMPLATES) {
      const project = createProject("blank");
      const { app, collections } = t.create(project.name);
      project.collections = collections;
      project.app = app;
      project.pages[0].sections = app.forms.map((f) =>
        createSection("app", { appForm: f.id }),
      );
      expect([t.id, validateProject(project)]).toEqual([t.id, true]);
    }
  });
  it("order from the site's own menu when given one", () => {
    const site = createProject("table");
    const menu = site.collections![0];
    const { app, collections } = ordersApp("Sunday Table", { menu });
    expect(collections).toEqual([]);
    const cart = app.tables[0].fields.find((f) => f.type === "items")!;
    expect(cart.collection).toBe(menu.id);
    expect(app.forms[0].payment).toEqual({ field: cart.id });
  });
  it("combine into one app for a business that does several things", () => {
    const menu = ordersApp("Cafe");
    const both = combineApps(menu.app, reservationsApp("Cafe").app);
    expect(both.tables.map((t) => t.name)).toEqual(["Orders", "Reservations"]);
    expect(
      validateApp(
        both,
        menu.collections.map((c) => c.id),
      ),
    ).toBe(true);
    expect(appIssues(both)).toEqual([]);
    const capacity = both.tables[1].capacity![0];
    expect(capacity.size).toBeTruthy();
  });
});
