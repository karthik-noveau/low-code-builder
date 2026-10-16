// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, createSection } from "./templates";
import { validateProject, type Project } from "./model";
import { createCollection, importCsv } from "./collections";
import { renderItemPage } from "./export";
import {
  flushSave,
  MAX_COLLECTIONS,
  STORAGE_KEY,
  UNREADABLE_KEY,
  useStudio,
} from "./store";

function load(project: Project) {
  useStudio.setState({
    project,
    past: [],
    future: [],
    selected: null,
    selectedBlock: null,
    activePage: project.pages[0].id,
    saveError: "",
  });
}
beforeEach(() => localStorage.clear());

describe("a bad edit can never cost the user their project", () => {
  it("refuses edits that would make the project invalid, keeping the last good save", () => {
    load(createProject());
    const id = useStudio.getState().addCollection("menu");
    const saved = localStorage.getItem(STORAGE_KEY);
    useStudio
      .getState()
      .updateCollection(id, (c) => ({ ...c, name: "x".repeat(121) }));
    const state = useStudio.getState();
    expect(state.project.collections![0].name).toBe("Menu");
    expect(state.saveError).toMatch(/wasn’t applied/);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    expect(validateProject(state.project)).toBe(true);
  });
  it("stops adding collections at the limit", () => {
    load(createProject());
    for (let i = 0; i < MAX_COLLECTIONS + 2; i++)
      useStudio.getState().addCollection("team");
    expect(useStudio.getState().project.collections).toHaveLength(
      MAX_COLLECTIONS,
    );
    expect(validateProject(useStudio.getState().project)).toBe(true);
  });
  it("keeps an unreadable save instead of overwriting it", async () => {
    localStorage.setItem(STORAGE_KEY, '{"version":1,"name":"mine"}');
    vi.resetModules();
    const { useStudio: fresh } = await import("./store");
    expect(fresh.getState().saveError).toMatch(/copy was kept/);
    fresh.getState().addPage("About us");
    expect(localStorage.getItem(UNREADABLE_KEY)).toBe(
      '{"version":1,"name":"mine"}',
    );
  });
  it("cuts spreadsheet cells and headers to what a project can hold", () => {
    const long = "y".repeat(25000);
    const { collection, truncated } = importCsv(
      `${"H".repeat(200)},Notes\nA,${long}\n`,
      "z".repeat(300),
    );
    expect(truncated).toBe(true);
    const project = createProject();
    project.collections = [collection];
    expect(validateProject(project)).toBe(true);
  });
});

describe("editing history", () => {
  it("makes typing in one field a single undo step", () => {
    load(createProject());
    const section = useStudio.getState().project.pages[0].sections[0];
    const before = section.title;
    for (const title of ["H", "He", "Hel", "Hello"])
      useStudio.getState().updateSection(section.id, { title });
    expect(useStudio.getState().past).toHaveLength(1);
    useStudio.getState().undo();
    expect(useStudio.getState().project.pages[0].sections[0].title).toBe(
      before,
    );
  });
  it("still separates edits to different fields", () => {
    load(createProject());
    const section = useStudio.getState().project.pages[0].sections[0];
    useStudio.getState().updateSection(section.id, { title: "A" });
    useStudio.getState().updateSection(section.id, { body: "B" });
    expect(useStudio.getState().past).toHaveLength(2);
  });
});

describe("pages and templates", () => {
  it("updates links inside saved sections when a page is renamed", () => {
    const project = createProject();
    const contact = project.pages.find((p) => p.slug !== "")!;
    project.savedSections = [
      createSection("cta", { buttonUrl: `/${contact.slug}` }),
    ];
    load(project);
    useStudio.getState().updatePage(contact.id, { slug: "reach-us" });
    expect(useStudio.getState().project.savedSections![0].buttonUrl).toBe(
      "/reach-us",
    );
  });
  it("keeps data, uploads and saved sections when switching templates", () => {
    const project = createProject();
    project.collections = [createCollection("events")];
    project.savedSections = [createSection("cta")];
    project.assets = [
      { id: "a", name: "Logo", url: "data:image/png;base64,AA==" },
    ];
    load(project);
    useStudio.getState().applyTemplate("table");
    const next = useStudio.getState().project;
    expect(next.template).toBe("table");
    expect(next.collections).toHaveLength(1);
    expect(next.savedSections).toHaveLength(1);
    expect(next.assets.some((a) => a.id === "a")).toBe(true);
  });
});

describe("item pages", () => {
  it("keeps in-page # links on the item page instead of the home page", () => {
    const project = createProject();
    const c = createCollection("products");
    project.collections = [c];
    const html = renderItemPage(project, c, c.items[0]);
    expect(html).not.toMatch(/href="#/);
    expect(html).toContain(`href="${c.slug}/${c.items[0].slug}.html#`);
  });
});

describe("saving while typing", () => {
  it("saves the first keystroke at once and the rest when typing pauses", () => {
    vi.useFakeTimers();
    try {
      load(createProject());
      const id = useStudio.getState().project.pages[0].sections[0].id;
      const saved = () =>
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).pages[0].sections[0]
          .title;
      useStudio.getState().updateSection(id, { title: "H" });
      expect(saved()).toBe("H");
      useStudio.getState().updateSection(id, { title: "Hello" });
      expect(saved()).toBe("H");
      vi.advanceTimersByTime(500);
      expect(saved()).toBe("Hello");
      useStudio.getState().updateSection(id, { title: "Hello!" });
      flushSave();
      expect(saved()).toBe("Hello!");
    } finally {
      vi.useRealTimers();
    }
  });
});
