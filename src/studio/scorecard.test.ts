import { describe, expect, it } from "vitest";
import { createProject } from "./templates";
import { inlineImageBytes, scoreProject } from "./scorecard";

const failing = (project: ReturnType<typeof createProject>) =>
  scoreProject(project)
    .checks.filter((c) => !c.pass)
    .map((c) => c.id);

describe("search and speed scorecard", () => {
  it("scores between 0 and 100 and explains every failing check", () => {
    const card = scoreProject(createProject("botanical"));
    for (const score of [card.seo, card.speed]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    for (const check of card.checks.filter((c) => !c.pass)) {
      expect(check.title).toBeTruthy();
      expect(check.detail).toBeTruthy();
    }
  });
  it("flags missing, short, long and repeated titles and descriptions", () => {
    const project = createProject("botanical");
    const [home, second] = project.pages;
    home.title = "";
    home.description = "Too short.";
    second.title = "Fern House — houseplants delivered across the city";
    project.pages[0].title = second.title;
    second.description = "x".repeat(200);
    const ids = failing(project);
    expect(ids).toContain(`seo-unique-${home.id}`);
    expect(ids).toContain(`seo-description-${home.id}`);
    expect(ids).toContain(`seo-description-${second.id}`);
    home.title = "";
    expect(failing(project)).toContain(`seo-title-${home.id}`);
  });
  it("asks for one main heading per page", () => {
    const project = createProject("blank");
    expect(failing(project)).toContain(`seo-heading-${project.pages[0].id}`);
  });
  it("finds oversized uploaded images and too many animations", () => {
    const project = createProject("botanical");
    const page = project.pages[0];
    const section = page.sections.find((s) => !s.hidden)!;
    section.image = `data:image/png;base64,${"A".repeat(700 * 1024)}`;
    for (const s of page.sections) s.animation = "rise";
    for (let i = 0; i < 8; i++)
      page.sections.push({ ...section, id: `copy-${i}`, image: "" });
    const card = scoreProject(project);
    const image = card.checks.find((c) => c.id === `speed-images-${page.id}`)!;
    expect(image.pass).toBe(false);
    expect(image.section).toBe(section.id);
    expect(
      card.checks.find((c) => c.id === `speed-motion-${page.id}`)!.pass,
    ).toBe(false);
  });
  it("measures inline image bytes", () => {
    expect(inlineImageBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(inlineImageBytes("https://example.com/a.jpg")).toBe(0);
  });
});
