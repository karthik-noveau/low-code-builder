// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_SCRIPT } from "../../apps/widget";
import { APP_TEMPLATES } from "../../apps/templates";
import { validateApp, type App, type AppForm } from "../../apps/model";
import { createProject } from "../../studio/templates";
import {
  TEMPLATE_IDS,
  validateProject,
  type Project,
} from "../../studio/model";
import { blocksSection } from "../../studio/store";
import { appFormsIn } from "../project";
import { findNode, walk, type Node } from "../model";
import { createNode } from "../registry";
import { rootValid } from "../validate";
import { Nodes, type RenderContext } from "../render";
import { placedFields, IDENTITY } from "./model";
import {
  formChildren,
  newFormBlock,
  syncForms,
  fieldBlock,
  make,
} from "./sync";
import { recipeById } from "./recipes";

const API = "https://api.example.com/apps/site-1";

/** A project with the rewards app and one page holding `root`'s section. */
function site(app: App, children: Node[]): Project {
  const p = createProject("blank");
  p.app = app;
  const root = createNode("section");
  root.children = children;
  p.pages[0].sections = [blocksSection(root, "Form")];
  return p;
}
const formsOf = (p: Project) =>
  [...walk([p.pages[0].sections[0].root!])].filter((n) => n.type === "form");
const fieldIds = (n: Node) =>
  [...walk([n])]
    .filter((x) => x.type === "field")
    .map((x) => String(x.props.field));
/** Applies `fn` to the first form block, as an editor change would. */
function edit(p: Project, fn: (form: Node) => Node): Project {
  const section = p.pages[0].sections[0];
  const visit = (n: Node): Node =>
    n.type === "form"
      ? fn(n)
      : n.children
        ? { ...n, children: n.children.map(visit) }
        : n;
  return {
    ...p,
    pages: [
      {
        ...p.pages[0],
        sections: [{ ...section, root: visit(section.root!) }],
      },
    ],
  };
}
function render(p: Project, mode: "live" | "editor" | "preview" | "export") {
  const ctx: RenderContext = {
    project: p,
    exporting: mode === "live" || mode === "export",
    appApi: mode === "live" ? API : undefined,
    href: (u) => u,
    edit:
      mode === "editor"
        ? {
            selected: null,
            typing: null,
            onStartTyping: () => {},
            onFinishTyping: () => {},
            onCommit: () => {},
            onSelect: () => {},
          }
        : undefined,
  };
  return renderToStaticMarkup(
    <div className="website">
      <Nodes nodes={[p.pages[0].sections[0].root!]} ctx={ctx} />
    </div>,
  );
}

let rewards: App;
beforeEach(() => {
  rewards = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Shop");
});

describe("form blocks and their app form", () => {
  it("binds a prebuilt form: creates the table and form, once", () => {
    const recipe = recipeById("booking")!;
    const block = make("form", { form: "", recipe: recipe.id }, undefined, [
      fieldBlock("name"),
      fieldBlock("phone"),
      fieldBlock("date"),
      make("submit", { label: "Book" }),
    ]);
    const before = site(undefined as unknown as App, []);
    delete before.app;
    const after = syncForms(before, site(undefined as unknown as App, [block]));
    expect(after.app).toBeDefined();
    expect(validateApp(after.app)).toBe(true);
    expect(validateProject(after)).toBe(true);
    const [form] = after.app!.forms;
    expect(form.fields).toEqual(["name", "phone", "date"]);
    expect(after.app!.tables[0].name).toBe("Bookings");
    const node = formsOf(after)[0];
    expect(node.props.form).toBe(form.id);
    expect(node.props.recipe).toBeUndefined();
    expect(appFormsIn(after).has(form.id)).toBe(true);
    // A second booking section reuses the table.
    const twice = syncForms(
      after,
      edit(after, (n) => n),
    );
    expect(twice.app).toBe(after.app);
  });

  it("fills an empty form block with the form's questions, button and success", () => {
    const form = rewards.forms[0];
    const p = syncForms(
      site(rewards, []),
      site(rewards, [make("form", { form: form.id })]),
    );
    const node = formsOf(p)[0];
    expect(node.children!.length).toBeGreaterThan(2);
    // The purchase form identifies the customer first: three steps.
    const steps = node.children!.filter((c) => c.type === "formStep");
    expect(steps.map((s) => s.props.kind)).toEqual([
      "identify",
      "confirm",
      "details",
    ]);
    expect(fieldIds(steps[0])).toEqual([IDENTITY]);
    const table = rewards.tables.find((t) => t.id === form.table)!;
    expect(placedFields(node, table)).toEqual(
      form.fields.filter((id) => {
        const f = table.fields.find((x) => x.id === id)!;
        return !f.ownerOnly && f.type !== "link";
      }),
    );
    expect(rootValid(p.pages[0].sections[0].root)).toBe(true);
  });

  it("follows field blocks: removing, adding and reordering change form.fields", () => {
    const form = rewards.forms[0];
    const start = syncForms(
      site(rewards, []),
      site(rewards, [newFormBlock(rewards, form)]),
    );
    const table = rewards.tables.find((t) => t.id === form.table)!;
    const asked = placedFields(formsOf(start)[0], table);
    expect(asked.length).toBeGreaterThanOrEqual(2);
    // Remove the first question.
    const removed = syncForms(
      start,
      edit(start, (n) => {
        const drop = (x: Node): Node => ({
          ...x,
          children: x.children
            ?.filter((c) => !(c.type === "field" && c.props.field === asked[0]))
            .map(drop),
        });
        return drop(n);
      }),
    );
    expect(removed.app!.forms[0].fields).not.toContain(asked[0]);
    // Owner-only fields and links stay on the form.
    const kept = form.fields.filter((id) => !asked.includes(id));
    for (const id of kept) expect(removed.app!.forms[0].fields).toContain(id);
    // Put it back at the end of the details step.
    const added = syncForms(
      removed,
      edit(removed, (n) => {
        const put = (x: Node): Node =>
          x.type === "formStep" && x.props.kind === "details"
            ? { ...x, children: [...x.children!, fieldBlock(asked[0])] }
            : { ...x, children: x.children?.map(put) };
        return put(n);
      }),
    );
    expect(
      added.app!.forms[0].fields.filter((id) => asked.includes(id)),
    ).toEqual([...asked.slice(1), asked[0]]);
  });

  it("follows the App builder: fields added, removed and reordered there show in the blocks", () => {
    const form = rewards.forms[0];
    const start = syncForms(
      site(rewards, []),
      site(rewards, [newFormBlock(rewards, form)]),
    );
    const table = rewards.tables.find((t) => t.id === form.table)!;
    const asked = placedFields(formsOf(start)[0], table);
    const withApp = (fields: string[]) => ({
      ...start,
      app: {
        ...start.app!,
        forms: start.app!.forms.map((f) =>
          f.id === form.id ? { ...f, fields } : f,
        ),
      },
    });
    // Reversed in the App builder: the blocks swap places.
    const reversed = [...asked].reverse();
    const kept = form.fields.filter((id) => !asked.includes(id));
    const swapped = syncForms(start, withApp([...reversed, ...kept]));
    expect(placedFields(formsOf(swapped)[0], table)).toEqual(reversed);
    // Removed there: its block goes.
    const fewer = syncForms(start, withApp([asked[1], ...kept]));
    expect(placedFields(formsOf(fewer)[0], table)).toEqual([asked[1]]);
    expect(fieldIds(formsOf(fewer)[0])).not.toContain(asked[0]);
    // Added back: a field block appears after the last field.
    const back = syncForms(fewer, withApp([asked[1], asked[0], ...kept]));
    expect(placedFields(formsOf(back)[0], table)).toEqual([asked[1], asked[0]]);
  });
});

describe("drawing form blocks", () => {
  function contactSite() {
    const before = site(undefined as unknown as App, []);
    delete before.app;
    const recipe = recipeById("contact")!;
    const block = make("form", { recipe: recipe.id, form: "" });
    block.children = [
      fieldBlock("name", { width: "half" }),
      fieldBlock("phone", { width: "half" }),
      fieldBlock("email"),
      fieldBlock("message", { hint: "A sentence or two." }),
      make("formError", {}, undefined, [
        make("text", { text: "Couldn’t send: {message}" }),
      ]),
      make("submit", { label: "Send it" }),
      make("formSuccess", {}, undefined, [
        make("heading", { text: "Thanks!", level: "3" }),
        make("text", { text: "We got it. {message}" }),
      ]),
    ];
    return syncForms(before, site(undefined as unknown as App, [block]));
  }

  it("publishes the widget's contract", () => {
    const p = contactSite();
    const form = p.app!.forms[0];
    const html = render(p, "live");
    expect(html).toContain('data-blocks-form=""');
    expect(html).toContain(`data-app-api="${API}"`);
    expect(html).toContain(`data-form="${form.id}"`);
    expect(html).toMatch(/<form[^>]*data-step="fields"/);
    expect(html).toContain('name="website"');
    expect(html).toMatch(/<input[^>]*required=""[^>]*name="name"/);
    expect(html).toMatch(/<input[^>]*data-mobile=""[^>]*name="phone"/);
    expect(html).toContain(">+91<");
    expect(html).toContain('aria-describedby="f-');
    expect(html).toMatch(/data-step="done"[^>]*hidden=""/);
    expect(html).toContain('data-form-error=""');
    expect(html).toContain('aria-live="polite"');
  });

  it("shows every step in the editor and only the first in previews, the same in exports", () => {
    const p = syncForms(
      site(rewards, []),
      site(rewards, [make("form", { form: rewards.forms[0].id })]),
    );
    const editor = render(p, "editor");
    expect(editor).toContain("Step 1 · ");
    expect(editor).toContain("Step 3 · ");
    expect(editor).toContain('data-form-label="After sending"');
    const preview = render(p, "preview");
    expect(preview).not.toContain("Step 2");
    expect(preview).toContain("Works on your published site.");
    const strip = (h: string) =>
      h.replace(/<p class="app-preview-note">[\s\S]*?<\/p>/g, "");
    expect(strip(render(p, "export"))).toBe(strip(preview));
    expect(preview).toContain("disabled");
  });

  it("asks a lookup for its key and shows the record", () => {
    const lookup = rewards.forms[1];
    const p = syncForms(
      site(rewards, []),
      site(rewards, [make("form", { form: lookup.id })]),
    );
    const html = render(p, "live");
    expect(html).toMatch(/<form[^>]*data-step="lookup"/);
    expect(html).toMatch(/name="value"/);
    expect(html).toMatch(/data-step="result"[^>]*hidden/);
    expect(html).toContain("app-record-fields");
  });
});

describe("the widget on a form built from blocks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const json = (status: number, body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const visible = () =>
    [...document.querySelectorAll<HTMLElement>("[data-step]")]
      .filter((s) => !s.hidden)
      .map((s) => s.dataset.step);
  const submit = (el: Element) =>
    el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const type = (name: string, value: string) => {
    document.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value;
  };
  function mount(p: Project) {
    document.body.innerHTML = render(p, "live");
    new Function(APP_SCRIPT)();
  }
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("checks, sends with an idempotency key, and fills {message} after sending", async () => {
    const recipe = recipeById("contact")!;
    const before = site(undefined as unknown as App, []);
    delete before.app;
    const p = syncForms(
      before,
      site(undefined as unknown as App, [
        make("form", { recipe: recipe.id, form: "" }, undefined, [
          fieldBlock("name"),
          fieldBlock("email"),
          fieldBlock("message"),
          make("formError", {}, undefined, [
            make("text", { text: "Couldn’t send: {message}" }),
          ]),
          make("submit", { label: "Send" }),
          make("formSuccess", {}, undefined, [
            make("heading", { text: "Thanks!", level: "3" }),
            make("text", { text: "Ref {ref}. {message}" }),
          ]),
        ]),
      ]),
    );
    const form = p.app!.forms[0];
    mount(p);
    const fields = document.querySelector('[data-step="fields"]')!;
    expect(visible()).toEqual(["fields"]);
    // Nothing typed: the first required field says so, inline.
    submit(fields);
    expect(fetchMock).not.toHaveBeenCalled();
    const name = document.querySelector<HTMLInputElement>('[name="name"]')!;
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const slot = document.getElementById(
      name.getAttribute("aria-describedby")!.split(" ").at(-1)!,
    )!;
    expect(slot.hidden).toBe(false);
    expect(slot.textContent).toBe("Add your name.");
    // A server refusal shows in the owner's failure blocks.
    type("name", "Asha");
    type("email", "asha@example.com");
    type("message", "Do you open on Sundays?");
    fetchMock.mockReturnValueOnce(
      json(422, { message: "Too many messages today." }),
    );
    submit(fields);
    await flush();
    const box = document.querySelector<HTMLElement>("[data-form-error]")!;
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe("Couldn’t send: Too many messages today.");
    // Then it goes through.
    fetchMock.mockReturnValueOnce(
      json(200, { ref: "", message: "Thanks — we’ll get back to you." }),
    );
    submit(fields);
    await flush();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API}/forms/${form.id}`);
    const body = JSON.parse(init.body);
    expect(body.values).toEqual({
      name: "Asha",
      email: "asha@example.com",
      message: "Do you open on Sundays?",
    });
    expect(body.key).toMatch(/\w{8,}/);
    expect(body.website).toBe("");
    expect(visible()).toEqual(["done"]);
    expect(box.hidden).toBe(true);
    const done = document.querySelector('[data-step="done"]')!;
    expect(done.textContent).toContain("Thanks — we’ll get back to you.");
    expect(document.activeElement?.tagName).toBe("H3");
  });

  it("walks pages: checks each page before the next, and the indicator follows", async () => {
    const recipe = recipeById("booking")!;
    const before = site(undefined as unknown as App, []);
    delete before.app;
    const step = (label: string, children: Node[]) =>
      make("formStep", { kind: "details", label }, undefined, children);
    const p = syncForms(
      before,
      site(undefined as unknown as App, [
        make("form", { recipe: recipe.id, form: "" }, undefined, [
          make("formSteps"),
          step("You", [
            fieldBlock("name"),
            fieldBlock("phone"),
            make("submit", { label: "Next" }),
          ]),
          step("When", [
            fieldBlock("date"),
            fieldBlock("time", { display: "chips" }),
            make("submit", { label: "Back", action: "back" }),
            make("submit", { label: "Book" }),
          ]),
          make("formSuccess", {}, undefined, [
            make("text", { text: "Booked: {ref}" }),
          ]),
        ]),
      ]),
    );
    expect(p.app!.forms[0].fields).toEqual(["name", "phone", "date", "time"]);
    mount(p);
    const fields = document.querySelector('[data-step="fields"]')!;
    const pages = [...document.querySelectorAll<HTMLElement>("[data-page]")];
    expect(pages.map((x) => x.hidden)).toEqual([false, true]);
    submit(fields);
    expect(pages[1].hidden).toBe(true);
    type("name", "Ravi");
    type("phone", "98765 43210");
    submit(fields);
    expect(pages.map((x) => x.hidden)).toEqual([true, false]);
    expect(
      document.querySelector('[data-wizard="2"]')!.getAttribute("data-state"),
    ).toBe("active");
    // Back keeps what was typed.
    document.querySelector<HTMLElement>('[data-action="back"]')!.click();
    expect(pages.map((x) => x.hidden)).toEqual([false, true]);
    submit(fields);
    type("date", "2026-12-01");
    document.querySelector<HTMLInputElement>(
      '[name="time"][value="Evening"]',
    )!.checked = true;
    fetchMock.mockReturnValueOnce(json(200, { ref: "BK-1001", message: "ok" }));
    submit(fields);
    await flush();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.values).toMatchObject({
      name: "Ravi",
      time: "Evening",
      date: "2026-12-01",
    });
    expect(document.querySelector('[data-step="done"]')!.textContent).toBe(
      "Booked: BK-1001",
    );
    expect(document.querySelector<HTMLElement>(".app-wizard")!.hidden).toBe(
      true,
    );
  });

  it("identifies, confirms and sends for the purchase form", async () => {
    const form: AppForm = rewards.forms[0];
    const p = syncForms(
      site(rewards, []),
      site(rewards, [make("form", { form: form.id })]),
    );
    mount(p);
    expect(visible()).toEqual(["identify"]);
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "match",
        title: "Ravi Kumar",
        initials: "RK",
        fields: [{ name: "Phone", value: "•••••3210" }],
      }),
    );
    type("identity", "9876543210");
    submit(document.querySelector('[data-step="identify"]')!);
    await flush();
    expect(visible()).toEqual(["confirm"]);
    expect(document.querySelector(".app-identity-name")!.textContent).toBe(
      "Ravi Kumar",
    );
    document.querySelector<HTMLElement>('[data-action="confirm"]')!.click();
    expect(visible()).toEqual(["fields"]);
    expect(
      document.querySelector('[data-step="fields"]')!.textContent,
    ).toContain("Sending as Ravi Kumar");
  });
});

it("keeps formChildren valid for every template form", () => {
  for (const t of APP_TEMPLATES) {
    const app = t.build("Shop");
    for (const form of app.forms) {
      const root = createNode("section");
      root.children = [
        {
          ...make("form", { form: form.id }),
          children: formChildren(app, form),
        },
      ];
      expect(rootValid(root)).toBe(true);
      expect(findNode([root], root.children[0].id)).toBeDefined();
    }
  }
});

describe("every business template's forms, built from blocks", () => {
  it("asks each visitor field, and keeps payment and places-left", () => {
    let paid = 0;
    let limited = 0;
    for (const id of TEMPLATE_IDS) {
      const base = createProject(id);
      if (!base.app) continue;
      const app = base.app;
      for (const form of app.forms) {
        const p = syncForms(
          { ...base, pages: [{ ...base.pages[0], sections: [] }] },
          {
            ...base,
            pages: [
              {
                ...base.pages[0],
                sections: [
                  blocksSection(
                    {
                      ...createNode("section"),
                      children: [make("form", { form: form.id })],
                    },
                    "Form",
                  ),
                ],
              },
            ],
          },
        );
        expect(validateProject(p), `${id} ${form.name}`).toBe(true);
        // Syncing didn't change what the form asks.
        expect(p.app!.forms.find((f) => f.id === form.id)!.fields).toEqual(
          form.fields,
        );
        const html = render(p, "live");
        const table = app.tables.find((t) => t.id === form.table)!;
        if (form.kind === "submit")
          for (const fid of form.fields) {
            const f = table.fields.find((x) => x.id === fid)!;
            if (f.ownerOnly || f.type === "link") continue;
            expect(
              html.includes(`name="${fid}"`) ||
                html.includes(`data-picker="${fid}"`),
              `${id} ${form.name} ${f.name}`,
            ).toBe(true);
          }
        if (form.payment) {
          paid++;
          expect(html).toContain('data-step="pay"');
        }
        if (html.includes("data-capacity=")) {
          limited++;
          expect(html).toContain("app-places");
        }
      }
    }
    expect(paid).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(0);
  });
});
