// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createProject, createSection } from "../../studio/templates";
import { validateProject, type Project } from "../../studio/model";
import { renderPage } from "../../studio/export";
import { useStudio } from "../../studio/store";
import { cloneNode, walk, type Node } from "../model";
import { createNode } from "../registry";
import { rootValid } from "../validate";
import { presetById } from "../presets";
import { insertPreset } from "../editor/actions";
import { NodeInspector } from "../editor/NodeInspector";
import { Website } from "../../studio/Website";
import {
  actionValid,
  conditionValid,
  evaluateCondition,
  onValid,
  renameVar,
  runActions,
  safeLink,
  splitCondition,
  variablesValid,
  type Condition,
  type LogicEnv,
} from "./model";
import { needsLogicScript, pageUsesLogic } from "./project";
import { LOGIC_SCRIPT } from "./runtime";

const env = (patch: Partial<LogicEnv> = {}): LogicEnv => ({
  vars: {},
  query: {},
  dark: false,
  today: "2026-10-26",
  ...patch,
});
const section = (children: Node[]) => {
  const root = createNode("section");
  root.children = children;
  return root;
};
/** A blank site whose home page holds these prebuilt sections (with their page values). */
function site(ids: string[]): Project {
  const p = createProject("blank", "Logic test");
  const page = p.pages[0];
  page.sections = ids.map((id) =>
    createSection("blocks", {
      name: id,
      root: presetById(id)!.build({ project: p }),
    }),
  );
  page.variables = ids.flatMap((id) => presetById(id)!.variables?.() ?? []);
  expect(validateProject(p)).toBe(true);
  return p;
}
/** The published page's body, as the browser would get it. */
function publish(p: Project) {
  const html = renderPage(p, p.pages[0]);
  document.head.innerHTML = "";
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1];
  return html;
}
const run = () => {
  delete (window as unknown as { formaLogic?: boolean }).formaLogic;
  new Function(LOGIC_SCRIPT)();
};
const byText = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(
    (el) => el.textContent?.trim() === text,
  )!;

describe("checking clicks, rules and page values", () => {
  it("only lets clicks open safe addresses", () => {
    for (const ok of [
      "https://example.com/a?b=c",
      "/contact",
      "#offers",
      "tel:+919800000000",
      "mailto:hello@shop.in",
      "https://wa.me/919800000000?text=Hi",
    ])
      expect(safeLink(ok), ok).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example",
      "/\\evil.example",
      "vbscript:x",
      "https://ok.example/\u0000",
      "https://a.example/<script>",
      "",
    ])
      expect(safeLink(bad), bad).toBe(false);
    expect(actionValid({ do: "link", url: "javascript:alert(1)" })).toBe(false);
    expect(actionValid({ do: "link", url: "https://x.in", extra: 1 })).toBe(
      false,
    );
    expect(actionValid({ do: "call", phone: "javascript:1" })).toBe(false);
    expect(actionValid({ do: "email", to: "a@b" })).toBe(false);
    expect(actionValid({ do: "copy", text: "" })).toBe(false);
    expect(actionValid({ do: "setVar", name: "Bad Name", value: "x" })).toBe(
      false,
    );
    expect(
      actionValid({ do: "setVar", name: "plan", value: "x".repeat(201) }),
    ).toBe(false);
    expect(actionValid({ do: "eval", code: "1" })).toBe(false);
  });
  it("keeps lists short and clicks on blocks that can be clicked", () => {
    const step = { do: "closeDialog" };
    expect(onValid({ click: [step] }, "button")).toBe(true);
    expect(onValid({ click: [step, step, step, step] }, "button")).toBe(false);
    expect(onValid({ click: [] }, "button")).toBe(false);
    expect(onValid({ click: [step] }, "divider")).toBe(false);
    const rule = { if: "theme", is: "dark" };
    expect(conditionValid({ match: "all", rules: [rule] })).toBe(true);
    expect(conditionValid({ match: "all", rules: Array(5).fill(rule) })).toBe(
      false,
    );
    expect(conditionValid({ match: "some", rules: [rule] })).toBe(false);
    expect(
      conditionValid({
        match: "all",
        rules: [{ if: "query", param: "ref<x>", op: "is", value: "a" }],
      }),
    ).toBe(false);
    expect(
      conditionValid({
        match: "all",
        rules: [{ if: "date", from: "2026-12-01", to: "2026-11-01" }],
      }),
    ).toBe(false);
  });
  it("checks page values: names, kinds, how many", () => {
    expect(
      variablesValid([{ name: "plan", type: "text", value: "monthly" }]),
    ).toBe(true);
    expect(variablesValid([{ name: "2plan", type: "text", value: "" }])).toBe(
      false,
    );
    expect(variablesValid([{ name: "n", type: "number", value: "ten" }])).toBe(
      false,
    );
    expect(variablesValid([{ name: "y", type: "yesno", value: "maybe" }])).toBe(
      false,
    );
    expect(
      variablesValid([
        { name: "a", type: "text", value: "" },
        { name: "a", type: "text", value: "" },
      ]),
    ).toBe(false);
    expect(
      variablesValid(
        Array.from({ length: 21 }, (_, i) => ({
          name: `v${i}`,
          type: "text",
          value: "",
        })),
      ),
    ).toBe(false);
    const p = createProject("blank");
    p.pages[0].variables = [
      { name: "x", type: "text", value: "<b>".repeat(100) },
    ];
    expect(validateProject(p)).toBe(false);
  });
  it("refuses a tree with an unsafe click", () => {
    const b = createNode("button");
    b.on = { click: [{ do: "link", url: "javascript:alert(1)" }] };
    expect(rootValid(section([b]))).toBe(false);
    b.on = { click: [{ do: "link", url: "https://ok.in" }] };
    expect(rootValid(section([b]))).toBe(true);
    const d = createNode("dialog");
    d.children = [createNode("dialog")];
    expect(rootValid(section([d]))).toBe(false);
  });
});

describe("show only when", () => {
  const cond = (match: Condition["match"], ...rules: Condition["rules"]) => ({
    match,
    rules,
  });
  it("compares page values, the address, the theme and the day", () => {
    const plan = cond("all", {
      if: "var",
      name: "plan",
      op: "is",
      value: "Yearly",
    });
    expect(evaluateCondition(plan, env({ vars: { plan: " yearly " } }))).toBe(
      true,
    );
    expect(evaluateCondition(plan, env({ vars: { plan: "monthly" } }))).toBe(
      false,
    );
    expect(
      evaluateCondition(
        cond("all", { if: "query", param: "ref", op: "is", value: "insta" }),
        env({ query: { ref: "insta" } }),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        cond("all", { if: "query", param: "ref", op: "set" }),
        env(),
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        cond("all", { if: "theme", is: "dark" }),
        env({ dark: true }),
      ),
    ).toBe(true);
    const offer = cond("all", {
      if: "date",
      from: "2026-10-20",
      to: "2026-10-26",
    });
    expect(evaluateCondition(offer, env())).toBe(true);
    expect(evaluateCondition(offer, env({ today: "2026-10-27" }))).toBe(false);
    expect(evaluateCondition(offer, env({ today: "2026-10-19" }))).toBe(false);
    const either = cond(
      "any",
      { if: "theme", is: "dark" },
      { if: "var", name: "n", op: "gt", value: "5" },
    );
    expect(evaluateCondition(either, env({ vars: { n: "7" } }))).toBe(true);
    expect(evaluateCondition(either, env({ vars: { n: "3" } }))).toBe(false);
    expect(
      evaluateCondition(
        cond("all", { if: "var", name: "n", op: "lt", value: "abc" }),
        env({ vars: { n: "3" } }),
      ),
    ).toBe(false);
  });
  it("decides item rules where the item is known", () => {
    const c = cond(
      "all",
      { if: "item", field: "field:price", op: "gt", value: "500" },
      { if: "var", name: "plan", op: "is", value: "a" },
    );
    expect(splitCondition(c, { "field:price": "₹1,200" })).toEqual({
      runtime: { match: "all", rules: [c.rules[1]] },
    });
    expect(splitCondition(c, { "field:price": "₹200" })).toEqual({
      decided: false,
    });
    expect(
      splitCondition(cond("all", c.rules[0]), { "field:price": "" }),
    ).toEqual({ decided: false });
    expect(splitCondition(c, undefined, true).item).toEqual({
      match: "all",
      rules: [c.rules[0]],
    });
    const empty = cond("all", { if: "item", field: "item:title", op: "empty" });
    expect(splitCondition(empty, { "item:title": "" })).toEqual({
      decided: true,
    });
  });
});

describe("editing helpers", () => {
  it("renames a page value everywhere it's used", () => {
    const b = createNode("button");
    b.on = { click: [{ do: "setVar", name: "tab", value: "one" }] };
    const t = createNode("text", { text: "Showing {var:tab} and {var:tabs}" });
    t.when = {
      match: "all",
      rules: [{ if: "var", name: "tab", op: "is", value: "one" }],
    };
    const next = renameVar(section([b, t]), "tab", "panel");
    const [nb, nt] = next.children!;
    expect(nb.on!.click![0]).toEqual({
      do: "setVar",
      name: "panel",
      value: "one",
    });
    expect(nt.props.text).toBe("Showing {var:panel} and {var:tabs}");
    expect(nt.when!.rules[0]).toMatchObject({ name: "panel" });
  });
  it("copies keep their buttons pointed at their own dialog", () => {
    const d = createNode("dialog");
    const b = createNode("button");
    b.on = { click: [{ do: "openDialog", dialog: d.id }] };
    const outside = createNode("button");
    outside.on = { click: [{ do: "openDialog", dialog: "elsewhere" }] };
    const copy = cloneNode(section([b, d, outside]));
    const [cb, cd, co] = copy.children!;
    expect(cd.id).not.toBe(d.id);
    expect(cb.on!.click![0]).toEqual({ do: "openDialog", dialog: cd.id });
    expect(co.on!.click![0]).toEqual({ do: "openDialog", dialog: "elsewhere" });
  });
  it("works out addresses for going-somewhere clicks", () => {
    expect(
      runActions(
        [
          { do: "call", phone: "+91 98000 00000" },
          { do: "whatsapp", phone: "+91 98000-00000", text: "Hi & bye" },
          { do: "email", to: "a@shop.in", subject: "Order 12" },
          { do: "page", page: "gone" },
          { do: "scroll", target: "abc" },
        ],
        () => undefined,
      ),
    ).toEqual([
      { do: "go", href: "tel:+919800000000" },
      {
        do: "go",
        href: "https://wa.me/919800000000?text=Hi%20%26%20bye",
        newTab: true,
      },
      { do: "go", href: "mailto:a@shop.in?subject=Order%2012" },
      { do: "go", href: "#b-abc" },
    ]);
  });
});

describe("the published page", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });
  it("loads the logic script only where it's needed, with its config as JSON", () => {
    const plain = createProject("blank");
    expect(needsLogicScript(plain)).toBe(false);
    expect(renderPage(plain, plain.pages[0])).not.toContain("logic.js");
    const p = site(["logic-tabs", "logic-whatsapp"]);
    // A page with only a WhatsApp link needs no script: it's a real link.
    const links = site(["logic-whatsapp"]);
    expect(pageUsesLogic(links, links.pages[0])).toBe(false);
    const html = renderPage(links, links.pages[0]);
    expect(html).toContain(
      'href="https://wa.me/919800000000?text=Hi!%20I%20have%20a%20question."',
    );
    expect(html).toContain('href="tel:+919800000000"');
    expect(html).not.toContain("logic.js");
    const full = renderPage(p, p.pages[0]);
    expect(full).toContain('<script src="logic.js" defer></script>');
    // The only scripts: the file, and the non-executable config.
    const scripts = [...full.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts).toEqual([
      '<script src="logic.js" defer>',
      '<script type="application/json" id="forma-logic">',
    ]);
    expect(full).not.toMatch(/\son[a-z]+=/i);
  });
  it("keeps the config inert, even with </script> in a value", () => {
    const p = site(["logic-offer"]);
    const b = [...walk([p.pages[0].sections[0].root!])].find(
      (n) => n.type === "button",
    )!;
    b.on = {
      click: [{ do: "copy", text: "</script><script>alert(1)</script>" }],
    };
    const html = renderPage(p, p.pages[0]);
    const tag =
      /<script type="application\/json" id="forma-logic">([\s\S]*?)<\/script>/.exec(
        html,
      )!;
    expect(tag[1]).not.toContain("<");
    expect(JSON.parse(tag[1]).act[b.id][0].text).toBe(
      "</script><script>alert(1)</script>",
    );
  });
  it("shows the starting state without the script", () => {
    const p = site(["logic-tabs", "logic-book-now"]);
    publish(p);
    const panels = [...document.querySelectorAll<HTMLElement>("[data-when]")];
    expect(panels).toHaveLength(3);
    expect(panels.map((el) => el.hidden)).toEqual([false, true, true]);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      dialog.querySelector("h2")!.id,
    );
    const book = byText("button", "Book now");
    expect(book.getAttribute("aria-haspopup")).toBe("dialog");
    expect(book.getAttribute("aria-controls")).toBe(dialog.id);
    // The first tab is on.
    expect(byText("button", "Services").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
  it("switches tabs and prices, and keeps text and tabs up to date", () => {
    const p = site(["logic-tabs", "logic-pricing-toggle"]);
    const heading = [...walk([p.pages[0].sections[0].root!])].find(
      (n) => n.type === "heading",
    )!;
    heading.props.text = "Now showing {var:tab}";
    publish(p);
    run();
    const panel = (title: string) =>
      byText("h3", title).closest("[data-when]") as HTMLElement;
    byText("button", "Prices").click();
    expect(panel("Prices").hidden).toBe(false);
    expect(panel("Services").hidden).toBe(true);
    expect(byText("button", "Prices").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(byText("button", "Prices").classList.contains("is-on")).toBe(true);
    expect(byText("button", "Services").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(document.querySelector("[data-var='tab']")!.textContent).toBe(
      "prices",
    );
    const prices = () =>
      [...document.querySelectorAll<HTMLElement>("[data-when]")]
        .filter((el) => !el.hidden)
        .map((el) => el.textContent)
        .join(" ");
    expect(prices()).toContain("₹999");
    byText("button", "Yearly · save 20%").click();
    expect(prices()).toContain("₹799");
    expect(prices()).not.toContain("₹999");
  });
  it("opens a dialog with focus inside; Esc closes it and focus returns", () => {
    const p = site(["logic-book-now"]);
    publish(p);
    run();
    const book = byText("button", "Book now");
    book.focus();
    book.click();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(book);
    book.click();
    (dialog.querySelector("[data-dialog-close]") as HTMLElement).click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(book);
  });
  it("keeps Tab inside the open dialog", () => {
    const p = site(["logic-book-now"]);
    publish(p);
    run();
    byText("button", "Book now").click();
    const dialog = document.querySelector("dialog")!;
    const close = dialog.querySelector<HTMLElement>(".blk-dialog-close")!;
    const last = [...dialog.querySelectorAll<HTMLElement>("button")].at(-1)!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
  it("copies text and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    publish(site(["logic-offer"]));
    run();
    byText("button", "Copy code").click();
    expect(writeText).toHaveBeenCalledWith("DIWALI20");
    await vi.waitFor(() =>
      expect(document.querySelector(".blk-toast")?.textContent).toBe(
        "Code copied",
      ),
    );
    expect(document.querySelector(".blk-toast")!.getAttribute("role")).toBe(
      "status",
    );
  });
  it("closes an announcement for good, and reads ?ref= from the address", () => {
    const p = site(["logic-announcement"]);
    const text = createNode("text", { text: "Welcome, Instagram friends!" });
    text.when = {
      match: "all",
      rules: [{ if: "query", param: "ref", op: "is", value: "instagram" }],
    };
    p.pages[0].sections[0].root!.children!.push(text);
    publish(p);
    localStorage.clear();
    history.replaceState(null, "", "/?ref=Instagram");
    run();
    const bar = document.querySelector<HTMLElement>("section[data-when]")!;
    const welcome = byText("p", "Welcome, Instagram friends!");
    expect(bar.hidden).toBe(false);
    expect(welcome.hidden).toBe(false);
    (
      document.querySelector(
        "[aria-label='Close the announcement']",
      ) as HTMLElement
    ).click();
    expect(bar.hidden).toBe(true);
    // Remembered: a new visit starts closed.
    publish(p);
    run();
    expect(
      document.querySelector<HTMLElement>("section[data-when]")!.hidden,
    ).toBe(true);
    history.replaceState(null, "", "/");
  });
});

describe("in the editor", () => {
  beforeEach(() => {
    localStorage.clear();
    useStudio.getState().importProject(createProject("blank", "Editor logic"));
  });
  it("adds a section's page values with it, renamed when taken", () => {
    insertPreset("logic-tabs");
    insertPreset("logic-tabs");
    const s = useStudio.getState();
    const page = s.project.pages.find((p) => p.id === s.activePage)!;
    expect(page.variables!.map((v) => v.name)).toEqual(["tab", "tab_2"]);
    const second = page.sections.at(-1)!.root!;
    const names = new Set(
      [...walk([second])].flatMap((n) => [
        ...(n.on?.click ?? []).map((a) => ("name" in a ? a.name : "")),
        ...(n.when?.rules ?? []).map((r) => ("name" in r ? r.name : "")),
      ]),
    );
    expect([...names].filter(Boolean)).toEqual(["tab_2"]);
    // One undo step takes the section and its value away together.
    s.undo();
    const after = useStudio.getState();
    expect(
      after.project.pages
        .find((p) => p.id === after.activePage)!
        .variables!.map((v) => v.name),
    ).toEqual(["tab"]);
  });
  it("sets a click in the Actions tab as one undo step", () => {
    const id = insertPreset("logic-whatsapp")!;
    const store = useStudio.getState();
    const sectionNow = () =>
      useStudio
        .getState()
        .project.pages.flatMap((p) => p.sections)
        .find((x) => x.id === id)!;
    const button = [...walk([sectionNow().root!])].find(
      (n) => n.type === "button" && n.props.label === "Call us",
    )!;
    const notify = vi.fn();
    const view = () => (
      <NodeInspector
        section={sectionNow()}
        node={[...walk([sectionNow().root!])].find((n) => n.id === button.id)!}
        device="desktop"
        pickMedia={() => {}}
        notify={notify}
        onSelectNode={() => {}}
      />
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    const picker = screen.getByRole("button", { name: /When clicked/ });
    expect(picker.textContent).toContain("Call a number");
    fireEvent.click(picker);
    const menu = screen.getByRole("menu");
    fireEvent.click(
      within(menu).getByRole("menuitemradio", { name: /Copy text/ }),
    );
    rerender(view());
    // Nothing usable typed yet: nothing saved.
    expect(
      [...walk([sectionNow().root!])].find((n) => n.id === button.id)!.on!
        .click![0].do,
    ).toBe("call");
    const before = useStudio.getState().past.length;
    act(() => {
      fireEvent.change(screen.getByLabelText("Text to copy"), {
        target: { value: "SAVE10" },
      });
    });
    rerender(view());
    expect(
      [...walk([sectionNow().root!])].find((n) => n.id === button.id)!.on!
        .click,
    ).toEqual([{ do: "copy", text: "SAVE10" }]);
    expect(useStudio.getState().past.length).toBe(before + 1);
    void store;
  });
  it("runs clicks in Preview only, and draws the page as Preview as says", () => {
    const p = site(["logic-tabs", "logic-book-now"]);
    const page = p.pages[0];
    const panel = (title: string) =>
      [...document.querySelectorAll("h3")].find(
        (h) => h.textContent === title,
      ) ?? null;
    // Editing: a click selects, nothing runs; "Preview as" picks the tab shown.
    const { rerender } = render(
      <Website
        project={p}
        page={page}
        onEditNode={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(panel("Services")).not.toBeNull();
    expect(panel("Prices")).toBeNull();
    fireEvent.click(screen.getByText("Prices"));
    expect(panel("Prices")).toBeNull();
    rerender(
      <Website
        project={p}
        page={page}
        onEditNode={() => {}}
        onSelect={() => {}}
        previewAs={{ vars: { tab: "hours" }, query: "", theme: "", date: "" }}
      />,
    );
    expect(panel("Hours")).not.toBeNull();
    expect(panel("Services")).toBeNull();
    // Dialogs show as a strip until selected.
    expect(
      screen.getByText("Book a visit").closest(".blk-dialog-chip"),
    ).not.toBeNull();
    // Preview: clicks run.
    rerender(<Website project={p} page={page} preview />);
    fireEvent.click(screen.getByRole("button", { name: "Prices" }));
    expect(panel("Prices")).not.toBeNull();
    expect(panel("Services")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Prices" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Book now/ }));
    expect((document.querySelector("dialog") as HTMLDialogElement).open).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect((document.querySelector("dialog") as HTMLDialogElement).open).toBe(
      false,
    );
  });
});
