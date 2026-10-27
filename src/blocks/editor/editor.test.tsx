// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { classicProject, createProject } from "../../studio/templates";
import { findSection, type Project } from "../../studio/model";
import { blocksSection, useStudio } from "../../studio/store";
import { Studio } from "../../studio/Studio";
import { createNode } from "../registry";
import { PRESETS } from "../presets";
import type { Node } from "../model";
import {
  insertBlock,
  placeFor,
  scrollIntoCanvas,
  selectionLock,
} from "./actions";
import { rootValid } from "../validate";

vi.mock("../../cloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cloud/client")>()),
  initializeCloud: async () => ({ config: { enabled: false } }),
}));

/** A project whose home page ends with a blocks section: heading, text, row(button). */
function setup() {
  const project: Project = createProject();
  const root = createNode("section");
  const heading = createNode("heading", { text: "Hello there" });
  const text = createNode("text");
  const row = createNode("row");
  row.children = [createNode("button")];
  root.children = [heading, text, row];
  const section = blocksSection(root, "Intro");
  project.pages[0].sections.push(section);
  useStudio.setState({
    project,
    past: [],
    future: [],
    selected: section.id,
    selectedBlock: root.id,
    activePage: project.pages[0].id,
    saveError: "",
  });
  return { section: section.id, root, heading, text, row };
}
const rootOf = (id: string) =>
  findSection(useStudio.getState().project, id)!.root!;
const types = (n: Node) => n.children!.map((c) => c.type);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("where new blocks go", () => {
  it("goes inside a selected container, else after the selection", () => {
    const { root, heading, row } = setup();
    expect(placeFor(root, row.id, "button")).toEqual({
      parent: row.id,
      index: 1,
    });
    expect(placeFor(root, heading.id, "button")).toEqual({
      parent: root.id,
      index: 1,
    });
    expect(placeFor(root, root.id, "image")).toEqual({
      parent: root.id,
      index: 3,
    });
    // A column only goes into columns.
    expect(placeFor(root, heading.id, "column")).toBeUndefined();
  });
});

describe("Add panel", () => {
  it("inserts a block after the selected block", () => {
    const { section, heading } = setup();
    useStudio.getState().select(section, heading.id);
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Insert a section" }));
    const panel = screen.getByRole("dialog", {
      name: "Add blocks and sections",
    });
    fireEvent.click(within(panel).getByRole("tab", { name: "Blocks" }));
    fireEvent.click(within(panel).getByRole("button", { name: /^Image:/ }));
    const root = rootOf(section);
    expect(types(root)).toEqual(["heading", "image", "text", "row"]);
    expect(useStudio.getState().selectedBlock).toBe(root.children![1].id);
    // The Inspector shows the new block.
    expect(screen.getByRole("button", { name: /Choose image/ })).toBeTruthy();
  });
  it("creates a blocks section for a block when a classic section is selected", () => {
    setup();
    const state = useStudio.getState();
    // Templates are blocks now; an older project may still have a classic section.
    state.project.pages[0].sections[0] = classicProject().pages[0].sections[0];
    const first = state.project.pages[0].sections[0].id;
    state.select(first);
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Insert a section" }));
    fireEvent.click(screen.getByRole("tab", { name: "Blocks" }));
    fireEvent.click(screen.getByRole("button", { name: /^Heading:/ }));
    const sections = useStudio.getState().project.pages[0].sections;
    expect(sections[1].type).toBe("blocks");
    expect(types(sections[1].root!)).toEqual(["heading"]);
    expect(useStudio.getState().selectedBlock).toBe(
      sections[1].root!.children![0].id,
    );
  });
  it("inserts a prebuilt section after the selected section", () => {
    setup();
    const preset = PRESETS.find(
      (p) => !["header", "footer"].includes(p.category),
    )!;
    const state = useStudio.getState();
    const first = state.project.pages[0].sections[0].id;
    state.select(first);
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Insert a section" }));
    const panel = screen.getByRole("dialog", {
      name: "Add blocks and sections",
    });
    fireEvent.click(
      within(panel).getByRole("button", {
        name: `${preset.name}: ${preset.description}`,
      }),
    );
    const sections = useStudio.getState().project.pages[0].sections;
    expect(sections[1].type).toBe("blocks");
    expect(sections[1].name).toBe(preset.name);
    expect(useStudio.getState().selected).toBe(sections[1].id);
    // The panel closes and the section's settings open.
    expect(
      screen.queryByRole("dialog", { name: "Add blocks and sections" }),
    ).toBeNull();
  });
});

describe("keyboard", () => {
  it("moves, duplicates, copies, pastes, deletes and selects the parent", () => {
    const { section, heading, text, row } = setup();
    useStudio.getState().select(section, text.id);
    render(<Studio />);
    const key = (key: string, extra = {}) =>
      fireEvent.keyDown(document.body, { key, ...extra });
    key("ArrowUp", { altKey: true });
    expect(rootOf(section).children!.map((c) => c.id)).toEqual([
      text.id,
      heading.id,
      row.id,
    ]);
    key("ArrowDown", { altKey: true });
    key("ArrowDown", { altKey: true });
    expect(rootOf(section).children!.map((c) => c.id)).toEqual([
      heading.id,
      row.id,
      text.id,
    ]);
    key("d", { metaKey: true });
    expect(types(rootOf(section))).toEqual(["heading", "row", "text", "text"]);
    key("Delete");
    expect(types(rootOf(section))).toEqual(["heading", "row", "text"]);
    // Delete selects the parent; copy the heading and paste it after the row.
    useStudio.getState().select(section, heading.id);
    key("c", { ctrlKey: true });
    useStudio.getState().select(section, row.id);
    key("v", { ctrlKey: true });
    const root = rootOf(section);
    expect(types(root)).toEqual(["heading", "row", "heading", "text"]);
    expect(root.children![2].id).not.toBe(heading.id);
    useStudio.getState().select(section, row.children![0].id);
    key("Escape");
    expect(useStudio.getState().selectedBlock).toBe(row.id);
  });
});

describe("block Inspector", () => {
  it("writes tablet styles as overrides and resets them", () => {
    const { section, heading } = setup();
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-node-id="${heading.id}"]`)!);
    expect(useStudio.getState().selectedBlock).toBe(heading.id);
    fireEvent.click(screen.getByRole("tab", { name: "Style" }));
    fireEvent.click(screen.getByRole("button", { name: "Style for tablet" }));
    fireEvent.change(screen.getByLabelText("Max width"), {
      target: { value: "420" },
    });
    let node = rootOf(section).children![0];
    expect(node.tablet?.maxWidth).toBe(420);
    expect(node.style?.maxWidth).toBeUndefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Same as desktop: Max width" }),
    );
    node = rootOf(section).children![0];
    expect(node.tablet).toBeUndefined();
  });
  it("edits content fields and adds columns", () => {
    const { section, heading } = setup();
    useStudio.getState().select(section, heading.id);
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-node-id="${heading.id}"]`)!);
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "Fresh *flowers* daily" },
    });
    expect(rootOf(section).children![0].props.text).toBe(
      "Fresh *flowers* daily",
    );
    // Columns: add one (up to four).
    const cols = createNode("columns");
    act(() => {
      useStudio.getState().insertNode(section, rootOf(section).id, cols);
    });
    fireEvent.click(container.querySelector(`[data-node-id="${cols.id}"]`)!);
    fireEvent.click(screen.getByRole("button", { name: "Add a column" }));
    const after = rootOf(section).children!.at(-1)!;
    expect(after.children).toHaveLength(3);
    expect(after.style?.columns).toBe(3);
  });
});

describe("Layers", () => {
  it("renames and hides a block", () => {
    const { section, heading } = setup();
    render(<Studio />);
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    const layers = screen.getByLabelText(/^Layers of/);
    fireEvent.doubleClick(
      within(layers).getByRole("button", { name: "Heading" }),
    );
    const input = within(layers).getByLabelText("Rename Heading");
    fireEvent.change(input, { target: { value: "Welcome title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(rootOf(section).children![0].name).toBe("Welcome title");
    fireEvent.click(
      within(layers).getByRole("button", { name: "Hide Welcome title" }),
    );
    expect(rootOf(section).children![0].hidden).toBe(true);
    fireEvent.click(
      within(layers).getByRole("button", { name: "Welcome title" }),
    );
    expect(useStudio.getState().selectedBlock).toBe(heading.id);
  });
});

describe("block menu", () => {
  it("opens on right-click, puts a block in a box and deletes with Undo", () => {
    const { section, heading, text } = setup();
    const { container } = render(<Studio />);
    fireEvent.contextMenu(
      container.querySelector(`[data-node-id="${text.id}"]`)!,
      { clientX: 200, clientY: 200 },
    );
    expect(useStudio.getState().selectedBlock).toBe(text.id);
    const menu = screen.getByRole("menu", { name: "Text actions" });
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: /Put in a box/ }),
    );
    const root = rootOf(section);
    expect(types(root)).toEqual(["heading", "box", "row"]);
    expect(root.children![1].children!.map((c) => c.id)).toEqual([text.id]);
    // The box is selected; one Undo puts the text back.
    expect(useStudio.getState().selectedBlock).toBe(root.children![1].id);
    act(() => useStudio.getState().undo());
    expect(types(rootOf(section))).toEqual(["heading", "text", "row"]);
    // Delete from the menu, then Undo from the notification.
    fireEvent.contextMenu(
      container.querySelector(`[data-node-id="${heading.id}"]`)!,
    );
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: /^Delete/,
      }),
    );
    expect(types(rootOf(section))).toEqual(["text", "row"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(types(rootOf(section))).toEqual(["heading", "text", "row"]);
  });
  it("closes with Escape without changing the selection", () => {
    const { text } = setup();
    const { container } = render(<Studio />);
    fireEvent.contextMenu(
      container.querySelector(`[data-node-id="${text.id}"]`)!,
    );
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(useStudio.getState().selectedBlock).toBe(text.id);
  });
});

describe("keyboard selection", () => {
  it("moves through siblings with Tab and Shift+Tab, and goes inside with Enter", () => {
    const { section, heading, text, row } = setup();
    useStudio.getState().select(section, heading.id);
    render(<Studio />);
    const key = (key: string, extra = {}) =>
      fireEvent.keyDown(document.body, { key, ...extra });
    key("Tab");
    expect(useStudio.getState().selectedBlock).toBe(text.id);
    key("Tab");
    expect(useStudio.getState().selectedBlock).toBe(row.id);
    // Wraps around.
    key("Tab");
    expect(useStudio.getState().selectedBlock).toBe(heading.id);
    key("Tab", { shiftKey: true });
    expect(useStudio.getState().selectedBlock).toBe(row.id);
    key("Enter");
    expect(useStudio.getState().selectedBlock).toBe(row.children![0].id);
    key("Escape");
    expect(useStudio.getState().selectedBlock).toBe(row.id);
  });
  it("shows the shortcut sheet with ?", () => {
    setup();
    render(<Studio />);
    fireEvent.keyDown(document.body, { key: "?" });
    expect(
      screen.getByRole("dialog", { name: /Keyboard shortcuts/ }),
    ).toBeTruthy();
  });
});

describe("Style and Layout controls", () => {
  it("sets padding per side, or on all sides when linked", () => {
    const { section, text } = setup();
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-node-id="${text.id}"]`)!);
    fireEvent.click(screen.getByRole("tab", { name: "Style" }));
    fireEvent.change(screen.getByLabelText("Padding top"), {
      target: { value: "8" },
    });
    expect(rootOf(section).children![1].style?.padding).toEqual([8, 0, 0, 0]);
    fireEvent.click(
      screen.getByRole("button", { name: "Same padding on all sides" }),
    );
    fireEvent.change(screen.getByLabelText("Padding left"), {
      target: { value: "24px" },
    });
    expect(rootOf(section).children![1].style?.padding).toEqual([
      24, 24, 24, 24,
    ]);
    // Arrow keys nudge a side.
    fireEvent.click(
      screen.getByRole("button", { name: "Same padding on all sides" }),
    );
    fireEvent.keyDown(screen.getByLabelText("Padding bottom"), {
      key: "ArrowUp",
      shiftKey: true,
    });
    expect(rootOf(section).children![1].style?.padding).toEqual([
      24, 24, 34, 24,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Reset padding" }));
    expect(rootOf(section).children![1].style?.padding).toBeUndefined();
  });
  it("arranges a layout block from its Layout tab", () => {
    const { section, row } = setup();
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-node-id="${row.id}"]`)!);
    // Layout blocks open on Layout, which lists what's inside.
    expect(
      screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      within(screen.getByRole("list", { name: /Blocks in/ })).getAllByRole(
        "button",
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Bottom right" }));
    let node = rootOf(section).children![2];
    // Side by side: across is justify, down is align.
    expect(node.style?.justify).toBe("end");
    expect(node.style?.align).toBe("end");
    fireEvent.click(screen.getByRole("button", { name: "Stacked" }));
    node = rootOf(section).children![2];
    expect(node.style?.direction).toBe("column");
  });
  it("picks a theme colour or a hex colour, and says how readable it is", () => {
    const { section, text } = setup();
    const { container } = render(<Studio />);
    fireEvent.click(container.querySelector(`[data-node-id="${text.id}"]`)!);
    fireEvent.click(screen.getByRole("tab", { name: "Style" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Text colour: Default" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accent colour" }));
    expect(rootOf(section).children![1].style?.color).toBe("accent");
    fireEvent.change(screen.getByLabelText("Text colour hex code"), {
      target: { value: "#FAFAFA" },
    });
    expect(rootOf(section).children![1].style?.color).toBe("#fafafa");
    // Near-white text on the light theme background is flagged.
    expect(screen.getByText(/Hard to read/)).toBeTruthy();
  });
});

describe("Add panel search and keyboard", () => {
  it("finds blocks and sections in one search, and Enter adds the first", () => {
    const { section, heading } = setup();
    useStudio.getState().select(section, heading.id);
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Insert a section" }));
    const panel = screen.getByRole("dialog", {
      name: "Add blocks and sections",
    });
    const search = within(panel).getByLabelText("Search sections and blocks");
    fireEvent.change(search, { target: { value: "image" } });
    // Both kinds show while searching.
    expect(within(panel).getByRole("heading", { name: "Blocks" })).toBeTruthy();
    expect(
      within(panel).getByRole("heading", { name: /^Sections/ }),
    ).toBeTruthy();
    // Arrow down moves from the search box into the list.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(document.activeElement?.classList.contains("add-item")).toBe(true);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(types(rootOf(section))).toEqual(["heading", "image", "text", "row"]);
    // It's remembered as recently added.
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(within(panel).getByRole("tab", { name: "Blocks" }));
    expect(
      within(panel).getByRole("heading", { name: "Recently added" }),
    ).toBeTruthy();
  });
});

describe("locked blocks", () => {
  const lock = (section: string, id: string) =>
    useStudio
      .getState()
      .updateNode(section, id, (n) => ({ ...n, locked: true }));
  it("can't be moved, deleted or added to, but stay editable", () => {
    const { section, heading, row } = setup();
    lock(section, row.id);
    const store = useStudio.getState();
    const button = row.children![0];
    expect(rootValid(rootOf(section))).toBe(true);
    // Its place, and what it holds, stay put.
    store.moveNode(section, row.id, section, rootOf(section).id, 0);
    store.removeNode(section, row.id);
    store.removeNode(section, button.id);
    store.moveNode(section, button.id, section, rootOf(section).id, 0);
    store.moveNode(section, heading.id, section, row.id, 0);
    expect(types(rootOf(section))).toEqual(["heading", "text", "row"]);
    expect(types(rootOf(section).children![2])).toEqual(["button"]);
    // New blocks go beside it instead of inside.
    expect(placeFor(rootOf(section), row.id, "button")).toEqual({
      parent: rootOf(section).id,
      index: 3,
    });
    // Text and settings still change.
    store.updateNode(section, button.id, (n) => ({
      ...n,
      props: { ...n.props, label: "Book" },
    }));
    expect(rootOf(section).children![2].children![0].props.label).toBe("Book");
    useStudio.getState().select(section, row.id);
    expect(selectionLock("move")).toBe(
      "Locked. Unlock it in Layers to move it.",
    );
    expect(selectionLock("duplicate")).toBeNull();
    useStudio.getState().select(section, button.id);
    expect(selectionLock("delete")).toBe(
      "Row is locked. Unlock it in Layers to delete what’s inside.",
    );
    // A locked section's root keeps the section.
    lock(section, rootOf(section).id);
    useStudio.getState().removeSection(section);
    expect(findSection(useStudio.getState().project, section)).toBeTruthy();
  });
  it("says why on the keyboard, and locks from Layers in one undo step", () => {
    const { section, text } = setup();
    render(<Studio />);
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    const layers = screen.getByLabelText(/^Layers of/);
    const before = useStudio.getState().past.length;
    fireEvent.click(within(layers).getByRole("button", { name: "Lock Text" }));
    expect(rootOf(section).children![1].locked).toBe(true);
    expect(useStudio.getState().past.length).toBe(before + 1);
    expect(
      within(layers).getByRole("button", { name: "Unlock Text" }),
    ).toBeTruthy();
    act(() => useStudio.getState().select(section, text.id));
    fireEvent.keyDown(document.body, { key: "Delete" });
    fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });
    expect(types(rootOf(section))).toEqual(["heading", "text", "row"]);
    expect(document.querySelector(".studio-toast")?.textContent).toContain(
      "Unlock it in Layers to move it",
    );
    act(() => useStudio.getState().undo());
    expect(rootOf(section).children![1].locked).toBeUndefined();
  });
  it("refuses a lock that isn't true or false", () => {
    const { root } = setup();
    expect(rootValid({ ...root, locked: "yes" } as unknown as Node)).toBe(
      false,
    );
  });
});

describe("sections between header, page and footer", () => {
  it("moves a page section into the shared header and back in one undo step each", () => {
    const { section } = setup();
    const store = useStudio.getState();
    const header = store.project.header.length;
    const before = store.past.length;
    expect(store.placeSection(section, "header", header)).toBe(true);
    let p = useStudio.getState().project;
    expect(p.header.at(-1)?.id).toBe(section);
    expect(p.pages[0].sections.some((s) => s.id === section)).toBe(false);
    expect(useStudio.getState().past.length).toBe(before + 1);
    useStudio.getState().placeSection(section, "page", 0);
    p = useStudio.getState().project;
    expect(p.pages[0].sections[0].id).toBe(section);
    expect(p.header.some((s) => s.id === section)).toBe(false);
    useStudio.getState().undo();
    expect(useStudio.getState().project.header.at(-1)?.id).toBe(section);
    // A locked section stays where it is.
    useStudio.getState().updateNode(section, rootOf(section).id, (n) => ({
      ...n,
      locked: true,
    }));
    expect(useStudio.getState().placeSection(section, "footer", 0)).toBe(false);
  });
});

describe("Layers section drag", () => {
  it("drags a page section into the header with a notice and Undo", async () => {
    const { section } = setup();
    render(<Studio />);
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    const layers = screen.getByLabelText(/^Layers of/);
    const rowOf = (name: string) =>
      within(layers).getByRole("button", { name }).closest(".layer-row")!;
    const dataTransfer = { setData: () => {}, types: [] as string[] };
    const header = useStudio.getState().project.header;
    fireEvent.dragStart(rowOf("Intro"), { dataTransfer });
    await act(() => new Promise((r) => setTimeout(r)));
    // Every list takes it while dragging, even an empty one.
    expect(within(layers).getAllByText(/^Drop here/)).toHaveLength(3);
    const target = rowOf(header.at(-1)!.name);
    fireEvent.dragOver(target, { dataTransfer, clientY: 1 });
    fireEvent.drop(target, { dataTransfer, clientY: 1 });
    const p = useStudio.getState().project;
    expect(p.header.at(-1)?.id).toBe(section);
    expect(p.pages[0].sections.some((s) => s.id === section)).toBe(false);
    expect(document.querySelector(".studio-toast")?.textContent).toContain(
      "Intro now shows at the top of every page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(useStudio.getState().project.pages[0].sections.at(-1)?.id).toBe(
      section,
    );
  });
});

describe("after adding", () => {
  it("scrolls the canvas to the new block", async () => {
    const { section, text } = setup();
    useStudio.getState().select(section, text.id);
    render(<Studio />);
    const scroller = document.querySelector<HTMLElement>(".canvas-scroll")!;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    // The canvas shows 600px; every block sits below the fold.
    let blockTop = 1400;
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return this === scroller
          ? new DOMRect(0, 0, 800, 600)
          : new DOMRect(0, blockTop, 600, 100);
      });
    let id: string | undefined;
    act(() => {
      id = insertBlock("image");
    });
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalled());
    // Centred: 1400 - (600 - 100) / 2.
    expect(scrollTo.mock.calls.at(-1)![0]).toMatchObject({ top: 1150 });
    expect(useStudio.getState().selectedBlock).toBe(id);
    // Already in view: nothing to do.
    scrollTo.mockClear();
    blockTop = 200;
    const el = scroller.querySelector(`[data-node-id="${CSS.escape(id!)}"]`);
    expect(el).toBeTruthy();
    expect(scrollIntoCanvas(el)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    rect.mockRestore();
  });
});
