// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSection } from "./templates";
import {
  createBlock,
  findSection,
  flattenBlocks,
  validateProject,
  type Block,
  type Project,
} from "./model";
import { useStudio } from "./store";
import { renderPage } from "./export";
import { responsiveCss } from "./responsive";
import { reviewProject } from "./review";
import { Studio } from "./Studio";

vi.mock("../cloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cloud/client")>()),
  initializeCloud: async () => ({ config: { enabled: false } }),
}));

function withCustomSection(): { project: Project; id: string } {
  const project = createProject();
  const section = createSection("custom");
  project.pages[0].sections.push(section);
  return { project, id: section.id };
}
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
const blocksOf = (id: string) =>
  findSection(useStudio.getState().project, id)!.blocks!;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("block schema", () => {
  it("accepts custom sections, device overrides, animation and theme tokens", () => {
    const { project, id } = withCustomSection();
    const s = findSection(project, id)!;
    s.responsive = {
      tablet: { padding: 40 },
      mobile: { align: "left", hidden: true },
    };
    project.theme = {
      ...project.theme,
      scale: "dramatic",
      spacing: "airy",
      buttons: "pill",
    };
    expect(validateProject(project)).toBe(true);
  });
  it("still accepts projects saved before blocks existed", () => {
    const project = createProject();
    for (const s of project.pages.flatMap((p) => p.sections)) {
      delete s.blocks;
      delete s.animation;
    }
    expect(validateProject(project)).toBe(true);
  });
  it.each([
    [
      "nested columns",
      (b: Block[]) => b[2].children[0].children.push(createBlock("columns")),
    ],
    [
      "a bare column in a section",
      (b: Block[]) => b.push(createBlock("column")),
    ],
    [
      "more than four columns",
      (b: Block[]) => {
        for (let i = 0; i < 3; i++) b[2].children.push(createBlock("column"));
      },
    ],
    [
      "children on a leaf block",
      (b: Block[]) => b[0].children.push(createBlock("text")),
    ],
    [
      "an unknown block type",
      (b: Block[]) => ((b[0] as { type: string }).type = "script"),
    ],
    ["a duplicate block id", (b: Block[]) => (b[1].id = b[0].id)],
  ])("rejects %s", (_, corrupt) => {
    const { project, id } = withCustomSection();
    corrupt(findSection(project, id)!.blocks!);
    expect(validateProject(project)).toBe(false);
  });
  it("rejects invalid overrides and animations", () => {
    const { project, id } = withCustomSection();
    const s = findSection(project, id)!;
    s.animation = "spin" as never;
    expect(validateProject(project)).toBe(false);
    s.animation = "fade";
    s.responsive = { mobile: { padding: -5 } };
    expect(validateProject(project)).toBe(false);
  });
});

describe("block editing", () => {
  it("adds, moves, duplicates and removes blocks with undo", () => {
    const { project, id } = withCustomSection();
    load(project);
    const store = useStudio.getState();
    const before = blocksOf(id).length;
    const added = store.addBlock(id, "image", { after: blocksOf(id)[0].id })!;
    expect(blocksOf(id)[1].id).toBe(added);
    expect(useStudio.getState().selectedBlock).toBe(added);
    store.moveBlock(id, added, -1);
    expect(blocksOf(id)[0].id).toBe(added);
    store.duplicateBlock(id, added);
    expect(blocksOf(id)).toHaveLength(before + 2);
    expect(blocksOf(id)[1].id).not.toBe(added);
    store.removeBlock(id, added);
    expect(blocksOf(id).some((b) => b.id === added)).toBe(false);
    store.undo();
    expect(blocksOf(id).some((b) => b.id === added)).toBe(true);
    expect(validateProject(useStudio.getState().project)).toBe(true);
  });
  it("only puts columns in columns and blocks in columns", () => {
    const { project, id } = withCustomSection();
    load(project);
    const store = useStudio.getState();
    const columns = blocksOf(id)[2];
    expect(store.addBlock(id, "text", { parent: columns.id })).toBeUndefined();
    expect(store.addBlock(id, "column")).toBeUndefined();
    expect(
      store.addBlock(id, "columns", { parent: columns.children[0].id }),
    ).toBeUndefined();
    expect(store.addBlock(id, "column", { parent: columns.id })).toBeDefined();
    expect(
      store.addBlock(id, "column", { parent: columns.id }),
    ).toBeUndefined();
    const inColumn = store.addBlock(id, "button", {
      parent: columns.children[0].id,
    })!;
    expect(blocksOf(id)[2].children[0].children.at(-1)?.id).toBe(inColumn);
    expect(validateProject(useStudio.getState().project)).toBe(true);
  });
  it("removes the columns block along with its last column", () => {
    const { project, id } = withCustomSection();
    load(project);
    const store = useStudio.getState();
    const columns = blocksOf(id)[2];
    for (const c of columns.children) store.removeBlock(id, c.id);
    expect(blocksOf(id).some((b) => b.id === columns.id)).toBe(false);
  });
  it("gives copied sections fresh block ids and follows page renames", () => {
    const { project, id } = withCustomSection();
    load(project);
    const store = useStudio.getState();
    store.duplicateSection(id);
    const ids = useStudio
      .getState()
      .project.pages[0].sections.flatMap((s) =>
        flattenBlocks(s.blocks).map((b) => b.id),
      );
    expect(new Set(ids).size).toBe(ids.length);
    const contact = useStudio
      .getState()
      .project.pages.find((p) => p.slug === "contact")!;
    store.updatePage(contact.id, { slug: "say-hello" });
    const button = flattenBlocks(blocksOf(id)).find(
      (b) => b.type === "button",
    )!;
    expect(button.url).toBe("/say-hello");
  });
});

describe("block rendering", () => {
  it("exports blocks without editor attributes", () => {
    const { project } = withCustomSection();
    const html = renderPage(project, project.pages[0]);
    expect(html).toContain("Your story, your layout.");
    expect(html).toContain('class="site-block site-columns"');
    expect(html).toContain('href="contact.html"');
    expect(html).toContain('data-animation="rise"');
    expect(html).not.toContain("data-block-id");
  });
  it("emits container-query CSS for device overrides", () => {
    const { project, id } = withCustomSection();
    const s = findSection(project, id)!;
    s.responsive = { mobile: { padding: 12, hidden: true } };
    const html = renderPage(project, project.pages[0]);
    expect(html).toContain("@container (max-width:480px)");
    expect(html).toContain("padding-block:calc(12px");
    expect(html).toContain(`[data-section-id="${id}"]{display:none}`);
    // In the editor a hidden-on-device section is dimmed, not removed.
    expect(responsiveCss(s, true)).toContain("opacity:.35");
  });
  it("never writes unsafe section ids into CSS", () => {
    const s = createSection("custom", {
      id: 'x"]{}</style><script>',
      responsive: { mobile: { padding: 1 } },
    });
    expect(responsiveCss(s)).toBe("");
  });
  it("flags block images without descriptions", () => {
    const { project, id } = withCustomSection();
    findSection(project, id)!.blocks!.push({
      ...createBlock("image"),
      image: "/images/garden.jpg",
    });
    expect(reviewProject(project).some((i) => i.id === `block-alt-${id}`)).toBe(
      true,
    );
  });
});

describe("block inspector", () => {
  it("selects a block on the canvas and edits it", () => {
    const { project, id } = withCustomSection();
    load(project);
    const { container } = render(<Studio />);
    const heading = container.querySelector<HTMLElement>(
      `[data-section-id="${id}"] [data-block-type="heading"]`,
    )!;
    fireEvent.click(heading);
    expect(useStudio.getState().selectedBlock).toBe(blocksOf(id)[0].id);
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "Hello blocks" },
    });
    expect(blocksOf(id)[0].text).toBe("Hello blocks");
    expect(heading.className).toContain("is-block-selected");
  });
  it("adds a block from the tree", () => {
    const { project, id } = withCustomSection();
    load(project);
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-section-id="${id}"]`)!);
    const count = blocksOf(id).length;
    fireEvent.change(screen.getByRole("combobox", { name: "Add block" }), {
      target: { value: "divider" },
    });
    expect(blocksOf(id)).toHaveLength(count + 1);
    expect(blocksOf(id).at(-1)?.type).toBe("divider");
  });
});
