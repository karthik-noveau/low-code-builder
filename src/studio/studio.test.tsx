// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { classicProject, createProject, templateOptions } from "./templates";
import { findSection, safeImage, safeUrl, validateProject } from "./model";
import { useStudio, STORAGE_KEY } from "./store";
import { renderPage } from "./export";
import { renderToStaticMarkup } from "react-dom/server";
import { Website } from "./Website";
import { readFileSync } from "node:fs";
import { Studio } from "./Studio";
import { reviewProject } from "./review";

vi.mock("../cloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cloud/client")>()),
  initializeCloud: async () => ({ config: { enabled: false } }),
}));

beforeEach(() => {
  localStorage.clear();
  // These workflows edit classic sections, which older projects may still have
  // (templates are built from blocks; see src/blocks/legacy.test.ts).
  const project = classicProject();
  useStudio.setState({
    project,
    past: [],
    future: [],
    selected: project.pages[0].sections[0].id,
    activePage: project.pages[0].id,
    saveError: "",
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("project editing", () => {
  it("persists an edit and restores it through undo/redo", () => {
    const s = useStudio.getState();
    const id = s.selected!;
    s.updateSection(id, { title: "A new beginning" });
    expect(findSection(useStudio.getState().project, id)?.title).toBe(
      "A new beginning",
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).pages[0].sections[0].title,
    ).toBe("A new beginning");
    s.undo();
    expect(findSection(useStudio.getState().project, id)?.title).toBe(
      "Good things\ntake root.",
    );
    s.redo();
    expect(findSection(useStudio.getState().project, id)?.title).toBe(
      "A new beginning",
    );
  });
  it("adds, duplicates, hides, reorders, and deletes independent sections", () => {
    const s = useStudio.getState();
    const id = s.addSection("faq");
    s.duplicateSection(id);
    const copy = useStudio.getState().selected!;
    expect(copy).not.toBe(id);
    s.updateSection(copy, { title: "Only the copy", hidden: true });
    expect(findSection(useStudio.getState().project, id)?.title).not.toBe(
      "Only the copy",
    );
    s.reorderSection(copy, id);
    expect(useStudio.getState().project.pages[0].sections.at(-2)?.id).toBe(
      copy,
    );
    s.removeSection(copy);
    expect(findSection(useStudio.getState().project, copy)).toBeUndefined();
    s.undo();
    expect(findSection(useStudio.getState().project, copy)?.hidden).toBe(true);
  });
  it("keeps shared headers consistent across pages", () => {
    const s = useStudio.getState();
    s.updateSection(s.project.header[1].id, { title: "Our new brand" });
    const p = useStudio.getState().project;
    for (const pg of p.pages)
      expect(renderPage(p, pg)).toContain("Our new brand");
  });
  it("keeps selection valid when undoing a newly created page", () => {
    const s = useStudio.getState();
    s.addPage("Journal");
    const created = useStudio.getState().activePage;
    s.undo();
    expect(
      useStudio
        .getState()
        .project.pages.some((p) => p.id === useStudio.getState().activePage),
    ).toBe(true);
    s.redo();
    expect(
      useStudio.getState().project.pages.some((p) => p.id === created),
    ).toBe(true);
  });
  it("creates unique page URLs and reserves the home export filename", () => {
    const s = useStudio.getState();
    s.addPage("Contact");
    s.addPage("Contact");
    s.addPage("Index");
    expect(
      useStudio
        .getState()
        .project.pages.slice(-3)
        .map((p) => p.slug),
    ).toEqual(["contact-2", "contact-3", "index-2"]);
    const pg = useStudio.getState().project.pages.at(-1)!;
    s.updatePage(pg.id, { slug: "contact" });
    expect(useStudio.getState().project.pages.at(-1)?.slug).toBe("index-2");
  });
  it("updates section links when a page URL changes or the page is deleted", () => {
    const s = useStudio.getState();
    const collection = s.project.pages[1];
    s.updatePage(collection.id, { slug: "shop" });
    expect(useStudio.getState().project.pages[0].sections[0].buttonUrl).toBe(
      "/shop",
    );
    s.removePage(collection.id);
    expect(useStudio.getState().project.pages[0].sections[0].buttonUrl).toBe(
      "/",
    );
    s.undo();
    expect(useStudio.getState().project.pages[0].sections[0].buttonUrl).toBe(
      "/shop",
    );
  });
  it("protects the home page and preserves the original project when switching templates", () => {
    const s = useStudio.getState();
    s.removePage(s.project.pages[0].id);
    expect(useStudio.getState().project.pages).toHaveLength(4);
    s.applyTemplate("blank");
    expect(useStudio.getState().project.pages).toHaveLength(1);
    expect(useStudio.getState().project.pages[0].sections).toHaveLength(0);
    s.undo();
    expect(useStudio.getState().project.name).toBe("Botanical");
  });
});

describe("portable websites", () => {
  it.each(templateOptions.map((t) => [t.id] as const))(
    "renders the same markup in preview and export for the %s template",
    (id) => {
      const p = createProject(id);
      // Page links differ by design (/slug in the editor, slug.html in export),
      // and only published forms carry the inbox endpoint and its hidden fields.
      const withoutHrefs = (html: string) =>
        html
          .replace(/ (href|action)="[^"]*"/g, "")
          .replace(/<input type="hidden" name="form"[^>]*\/>/g, "")
          .replace(/<label class="site-request-trap"[\s\S]*?<\/label>/g, "")
          // App forms say where they work ("…published site" vs "…with Forma").
          .replace(/<p class="app-preview-note">[\s\S]*?<\/p>/g, "")
          .replace(/(class="app-form is-preview"[^>]*?) inert=""/g, "$1");
      for (const pg of p.pages) {
        const preview = renderToStaticMarkup(
          <Website project={p} page={pg} preview />,
        );
        const exported = renderPage(p, pg, {
          inbox: "https://api.test/inbox/site",
        }).match(/<body>([\s\S]*)<\/body>/)![1];
        expect(withoutHrefs(preview)).toBe(withoutHrefs(exported));
      }
    },
  );
  it("keeps editor styles from changing how the published site looks", () => {
    const css = (name: string) =>
      readFileSync(`${process.cwd()}/src/studio/${name}`, "utf8");
    const websiteCss = css("website.css");
    expect(websiteCss).toMatch(/\.website \{[^}]*font-size:/);
    expect(websiteCss).toMatch(/\.website \{[^}]*color:/);
    const editorCss = [
      "studio.css",
      "canvas-first.css",
      "product-ui.css",
      "experience.css",
      "blocks.css",
      "chrome.css",
      "data.css",
      "editor-admin.css",
    ]
      .map(css)
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const leaks = [...editorCss.matchAll(/([^{}]+)\{/g)]
      .flatMap((m) => m[1].split(","))
      .map((sel) => sel.trim())
      .filter((sel) => !sel.startsWith("@"))
      .filter((sel) =>
        /\.(website|site-(?!navigator)[\w-]+)(?![\w-])/.test(sel),
      )
      .filter((sel) => !sel.includes(".website-editing"));
    expect(leaks).toEqual([]);
  });
  it.each(templateOptions.map((t) => [t.id] as const))(
    "renders every page of the %s template",
    (id) => {
      const p = createProject(id);
      expect(validateProject(p)).toBe(true);
      for (const pg of p.pages) {
        const html = renderPage(p, pg);
        expect(html).toContain("<!doctype html>");
        expect(html).toContain("styles.css");
        // Only app forms, which are inert until published with Forma.
        expect(
          html.replace(/class="app-form is-preview"[^>]*inert=""/g, ""),
        ).not.toContain('inert=""');
        expect(html).not.toContain("section-selection-label");
        expect(html).not.toContain("site-empty");
      }
    },
  );
  it("exports working relative page links, omits hidden sections, and escapes user text", () => {
    const p = createProject();
    p.pages[0].title = "<script>bad()</script>";
    p.pages[0].sections[0].hidden = true;
    const html = renderPage(p, p.pages[0]);
    expect(html).toContain('href="collection.html"');
    expect(html).toContain('href="index.html"');
    expect(html).not.toContain(
      `data-section-id="${p.pages[0].sections[0].id}"`,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("enables form submission only after a service is connected", () => {
    const p = classicProject();
    const contact = p.pages.at(-1)!;
    expect(renderPage(p, contact)).toContain('disabled=""');
    contact.sections[0].formAction = "https://example.com/contact";
    expect(renderPage(p, contact)).toContain(
      'action="https://example.com/contact"',
    );
    expect(renderPage(p, contact)).not.toContain('disabled=""');
  });
  it("rejects malformed backups and unsafe image or link schemes", () => {
    expect(validateProject({ version: 1 })).toBe(false);
    const p = createProject();
    p.pages[1].slug = "";
    expect(validateProject(p)).toBe(false);
    p.pages[1].slug = "index";
    expect(validateProject(p)).toBe(false);
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeImage('data:image/svg+xml,<svg onload="alert(1)"/>')).toBe("");
    expect(safeImage("/images/botanical.jpg")).toBe("/images/botanical.jpg");
  });
});

describe("editor workflows", () => {
  it("edits content on the canvas, persists it, and undoes it", () => {
    const { container } = render(<Studio />);
    fireEvent.doubleClick(
      screen.getByRole("button", { name: "Edit Image banner heading" }),
    );
    const heading = screen.getByRole("textbox", {
      name: "Edit Image banner heading",
    });
    heading.textContent = "Made for your world.";
    fireEvent.blur(heading);
    expect(container.querySelector(".site-hero h1")?.textContent).toBe(
      "Made for your world.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo (⌘Z)" }));
    expect(container.querySelector(".site-hero h1")?.textContent).toBe(
      "Good things\ntake root.",
    );
  });
  it("searches the section library and inserts the chosen section", () => {
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(
      within(dialog).getByLabelText("Search sections and blocks"),
      {
        target: { value: "Questions" },
      },
    );
    // Every section is a prebuilt blocks section now.
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Questions, centred:/ }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      useStudio
        .getState()
        .project.pages[0].sections.some(
          (s) => s.type === "blocks" && s.name === "Questions, centred",
        ),
    ).toBe(true);
  });
  it("navigates between pages in preview and returns to the editor", () => {
    render(<Studio />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getAllByRole("link", { name: "Collection" })[0]);
    expect(
      useStudio
        .getState()
        .project.pages.find((p) => p.id === useStudio.getState().activePage)
        ?.name,
    ).toBe("Collection");
    fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
    expect(screen.getByRole("button", { name: "Hide site map" })).toBeTruthy();
  });
});

describe("canvas-first workflow", () => {
  it("selects sections with one click and preserves text when changing layout", () => {
    render(<Studio />);
    expect(screen.queryByLabelText("Heading")).toBeNull();
    fireEvent.click(screen.getByRole("group", { name: "Edit Image banner" }));
    fireEvent.change(screen.getByLabelText("Heading"), {
      target: { value: "My original words" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Select Image banner" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    const section = useStudio.getState().project.pages[0].sections[0];
    expect(section.layout).toBe("split");
    expect(section.title).toBe("My original words");
  });
  it("separates selection from typing and supports Done and Cancel", () => {
    render(<Studio />);
    const text = screen.getByRole("button", {
      name: "Edit Image banner heading",
    });
    fireEvent.click(text);
    expect(
      screen.queryByRole("textbox", { name: "Edit Image banner heading" }),
    ).toBeNull();
    expect(
      screen
        .getByLabelText("Heading")
        .closest(".field")
        ?.classList.contains("is-targeted"),
    ).toBe(true);
    expect(useStudio.getState().past).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit heading on canvas" }),
    );
    const editor = screen.getByRole("textbox", {
      name: "Edit Image banner heading",
    });
    editor.textContent = "Keep this change";
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useStudio.getState().project.pages[0].sections[0].title).toBe(
      "Keep this change",
    );
    expect(useStudio.getState().past).toHaveLength(1);
    fireEvent.doubleClick(
      screen.getByRole("button", { name: "Edit Image banner heading" }),
    );
    screen.getByRole("textbox", {
      name: "Edit Image banner heading",
    }).textContent = "Discard this change";
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useStudio.getState().project.pages[0].sections[0].title).toBe(
      "Keep this change",
    );
    expect(
      screen.getByRole("button", { name: "Edit Image banner heading" })
        .textContent,
    ).toBe("Keep this change");
    expect(useStudio.getState().past).toHaveLength(1);
  });
  it("mirrors the draft in settings without saving until the edit is finished", () => {
    vi.stubGlobal("innerWidth", 1440);
    render(<Studio />);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Image banner heading" }),
    );
    fireEvent.doubleClick(
      screen.getByRole("button", { name: "Edit Image banner heading" }),
    );
    const editor = screen.getByRole("textbox", {
      name: "Edit Image banner heading",
    });
    editor.textContent = "A live draft";
    fireEvent.input(editor);
    expect(
      (screen.getByLabelText("Heading") as HTMLTextAreaElement).value,
    ).toBe("A live draft");
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.paste(editor, {
      clipboardData: { getData: () => " with pasted text" },
    });
    expect(
      (screen.getByLabelText("Heading") as HTMLTextAreaElement).value,
    ).toBe("A live draft with pasted text");
    expect(useStudio.getState().project.pages[0].sections[0].title).toBe(
      "Good things\ntake root.",
    );
    expect(useStudio.getState().past).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      (screen.getByLabelText("Heading") as HTMLTextAreaElement).value,
    ).toBe("Good things\ntake root.");
  });
  it("starts text editing with Enter without making keyboard focus editable", () => {
    render(<Studio />);
    const text = screen.getByRole("button", {
      name: "Edit Image banner heading",
    });
    fireEvent.focus(text);
    expect(text.getAttribute("contenteditable")).toBe("false");
    fireEvent.keyDown(text, { key: "Enter" });
    expect(
      screen
        .getByRole("textbox", { name: "Edit Image banner heading" })
        .getAttribute("contenteditable"),
    ).toBe("true");
  });
  it("inserts a section at the chosen page boundary", () => {
    render(<Studio />);
    const original = useStudio.getState().project.pages[0].sections[0].id;
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(screen.getByLabelText("Section position"), {
      target: { value: "start" },
    });
    fireEvent.change(screen.getByLabelText("Search sections and blocks"), {
      target: { value: "Questions" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /^Questions, centred:/ }),
    );
    const sections = useStudio.getState().project.pages[0].sections;
    expect(sections[0].name).toBe("Questions, centred");
    expect(sections[1].id).toBe(original);
  });
  it("finds a task through the command menu and executes it with Enter", () => {
    render(<Studio />);
    fireEvent.click(
      screen.getByRole("button", { name: "Find anything, do anything" }),
    );
    const search = screen.getByLabelText("Search commands");
    fireEvent.change(search, { target: { value: "colors" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Site styles" })).toBeTruthy();
  });
  it("cancels inline edits with Escape without creating a history entry", () => {
    render(<Studio />);
    fireEvent.doubleClick(
      screen.getByRole("button", { name: "Edit Image banner heading" }),
    );
    const heading = screen.getByRole("textbox", {
      name: "Edit Image banner heading",
    });
    heading.textContent = "Discard these words";
    fireEvent.keyDown(heading, { key: "Escape" });
    fireEvent.blur(heading);
    expect(heading.textContent).toBe("Good things\ntake root.");
    expect(useStudio.getState().past).toHaveLength(0);
  });
  it("removes review issues as real content is corrected and ignores hidden sections", () => {
    const project = classicProject();
    const hero = project.pages[0].sections[0];
    hero.imageAlt = "";
    hero.buttonUrl = "/does-not-exist";
    expect(
      reviewProject(project).filter((i) => i.section === hero.id),
    ).toHaveLength(2);
    hero.imageAlt = "Green ferns in a garden";
    hero.buttonUrl = "/";
    expect(
      reviewProject(project).filter((i) => i.section === hero.id),
    ).toHaveLength(0);
    hero.imageAlt = "";
    hero.hidden = true;
    expect(
      reviewProject(project).filter((i) => i.section === hero.id),
    ).toHaveLength(0);
  });
  it("keeps editor controls and editable attributes out of exported HTML", () => {
    const project = createProject();
    const html = renderPage(project, project.pages[0]);
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("insert-boundary");
    expect(html).not.toContain("data-edit-field");
    expect(html).not.toContain('role="textbox"');
  });
  it("doesn't flag forms, which post to the inbox when published", () => {
    const project = classicProject();
    const form = project.pages[0].sections.find(
      (section) => section.type === "newsletter",
    )!;
    expect(
      reviewProject(project).filter((issue) => issue.section === form.id),
    ).toHaveLength(0);
    form.formAction = "https://example.com/contact";
    expect(
      reviewProject(project).filter((issue) => issue.section === form.id),
    ).toHaveLength(0);
  });
});

describe("page and section workflows", () => {
  it("duplicates complete pages with unique URLs and independent nested content", () => {
    const s = useStudio.getState();
    const source = s.project.pages[1];
    const id = s.duplicatePage(source.id)!;
    const copy = useStudio.getState().project.pages.find((p) => p.id === id)!;
    expect(copy.slug).toBe("collection-copy");
    expect(copy.sections).toHaveLength(source.sections.length);
    expect(copy.sections[0].id).not.toBe(source.sections[0].id);
    const products = copy.sections.find((section) => section.items.length)!;
    const original = source.sections.find((section) => section.items.length)!;
    expect(products.items[0].id).not.toBe(original.items[0].id);
    s.updateSection(products.id, {
      title: "Changed copy",
      items: [{ ...products.items[0], title: "New item" }],
    });
    expect(
      useStudio.getState().project.pages.find((p) => p.id === source.id)
        ?.sections,
    ).toEqual(source.sections);
    s.duplicatePage(source.id);
    expect(
      useStudio
        .getState()
        .project.pages.some((p) => p.slug === "collection-copy-2"),
    ).toBe(true);
    expect(validateProject(useStudio.getState().project)).toBe(true);
    s.undo();
    expect(useStudio.getState().project.pages).toHaveLength(5);
    s.redo();
    expect(useStudio.getState().project.pages).toHaveLength(6);
  });
  it("reorders pages without moving the home page and persists the navigation order", () => {
    const s = useStudio.getState();
    const home = s.project.pages[0].id;
    const contact = s.project.pages.at(-1)!.id;
    s.movePage(home, 1);
    expect(useStudio.getState().past).toHaveLength(0);
    s.movePage(contact, -1);
    expect(useStudio.getState().project.pages[2].id).toBe(contact);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pages[2].id).toBe(
      contact,
    );
    s.undo();
    expect(useStudio.getState().project.pages.at(-1)?.id).toBe(contact);
  });
  it("saves reusable sections in backups and inserts independent copies at the chosen position", () => {
    const s = useStudio.getState();
    const source = s.project.pages[0].sections[0];
    const saved = s.saveSection(source.id)!;
    s.updateSection(source.id, { title: "A later source edit" });
    s.goToPage(s.project.pages[1].id);
    const first = s.insertSavedSection(saved, "start")!;
    const second = s.insertSavedSection(saved, first)!;
    const project = useStudio.getState().project;
    expect(
      project.pages[1].sections.slice(0, 2).map((section) => section.id),
    ).toEqual([first, second]);
    expect(project.pages[1].sections[0].title).toBe(source.title);
    s.updateSection(first, { title: "Only this instance" });
    expect(findSection(useStudio.getState().project, second)?.title).toBe(
      source.title,
    );
    expect(useStudio.getState().project.savedSections?.[0].title).toBe(
      source.title,
    );
    const backup = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(validateProject(backup)).toBe(true);
    expect(backup.savedSections).toHaveLength(1);
    s.removeSavedSection(saved);
    expect(useStudio.getState().project.savedSections).toHaveLength(0);
    expect(findSection(useStudio.getState().project, first)).toBeTruthy();
    s.undo();
    expect(useStudio.getState().project.savedSections).toHaveLength(1);
    expect(validateProject({ ...backup, savedSections: [{}] })).toBe(false);
  });
  it("searches content across pages and opens the matching section", () => {
    render(<Studio />);
    fireEvent.change(screen.getByLabelText("Find pages or sections"), {
      target: { value: "Contact form" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Select Contact form" }),
    );
    const state = useStudio.getState();
    expect(
      state.project.pages.find((page) => page.id === state.activePage)?.name,
    ).toBe("Contact");
    expect(findSection(state.project, state.selected)?.type).toBe("contact");
    expect(screen.getByLabelText("Send messages to (optional)")).toBeTruthy();
  });
  it("opens page actions with the keyboard, restores focus, and duplicates from the navigator", () => {
    render(<Studio />);
    const trigger = screen.getByRole("button", { name: "Actions for Home" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "Actions for Home" });
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement?.textContent).toBe("Duplicate page");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate page" }));
    expect(useStudio.getState().project.pages).toHaveLength(5);
    expect(
      screen
        .getByRole("button", { name: "Home copy" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
  it("saves a section from its actions and reuses it from the library", () => {
    render(<Studio />);
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Image banner" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Save to library" }));
    fireEvent.click(screen.getByRole("button", { name: "Saved sections 1" }));
    const library = screen.getByRole("dialog", { name: "Add a section" });
    fireEvent.click(
      within(library).getByRole("button", { name: /Image banner Good things/ }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const state = useStudio.getState();
    expect(state.project.pages[0].sections.at(-1)?.type).toBe("hero");
    expect(state.project.pages[0].sections.at(-1)?.id).toBe(state.selected);
  });
});
