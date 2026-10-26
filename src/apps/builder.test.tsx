// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../studio/templates";
import { useStudio } from "../studio/store";
import { Website } from "../studio/Website";
import { reviewProject } from "../studio/review";
import { validateProject, type Project, type Section } from "../studio/model";
import { sectionAppForms } from "../blocks/project";
import { walk } from "../blocks/model";
import { APP_TEMPLATES } from "./templates";
import { AppBuilder } from "./AppBuilder";
import { DataManager } from "../studio/DataManager";
import { createAppField, type App } from "./model";
import { addTable } from "./edit";

const rewards = () =>
  APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Shop");
const state = () => useStudio.getState();
/** Sections showing an app form: App form sections, built from blocks. */
const appSections = (p: Project) =>
  p.pages.flatMap((pg) => pg.sections).filter((s) => formOf(s));
const formOf = (s: Section) => sectionAppForms(s)[0];

beforeEach(() => {
  localStorage.clear();
  const project = createProject();
  useStudio.setState({
    project,
    past: [],
    future: [],
    selected: null,
    activePage: project.pages[0].id,
    saveError: "",
  });
});
afterEach(() => cleanup());

describe("app in the store", () => {
  it("installs a template with a page of its forms, undoably", () => {
    const pages = state().project.pages.length;
    const page = state().installApp(rewards(), "Rewards");
    const p = state().project;
    expect(p.pages).toHaveLength(pages + 1);
    const added = p.pages.find((pg) => pg.id === page)!;
    expect([added.name, added.slug]).toEqual(["Rewards", "rewards"]);
    expect(added.sections.map((s) => [s.type, formOf(s)])).toEqual(
      p.app!.forms.map((f) => ["blocks", f.id]),
    );
    expect(state().activePage).toBe(page);
    expect(validateProject(p)).toBe(true);
    state().undo();
    expect(state().project.app).toBeUndefined();
  });
  it("adds App form sections showing the first form", () => {
    state().installApp(rewards());
    const id = state().addSection("app");
    const section = appSections(state().project).find((s) => s.id === id)!;
    expect(formOf(section)).toBe(state().project.app!.forms[0].id);
    // Its heading is the form's own title.
    expect(
      renderToStaticMarkup(
        <Website project={state().project} page={state().project.pages[0]} />,
      ),
    ).toContain("Record a purchase");
  });
  it("refuses app changes that would break the app", () => {
    state().installApp(rewards());
    const ok = state().updateApp((a) => ({
      ...a,
      tables: a.tables.map((t) => ({ ...t, titleField: "missing" })),
    }));
    expect(ok).toBe(false);
    expect(state().project.app!.tables[0].titleField).not.toBe("missing");
    expect(state().saveError).toMatch(/app change/);
  });
  it("removes a deleted form's sections with it, and the app with all of them", () => {
    state().installApp(rewards(), "Rewards");
    const [record] = state().project.app!.forms;
    state().addAppSection(record.id, state().project.pages[0].id);
    expect(appSections(state().project)).toHaveLength(3);
    state().updateApp((a) => ({
      ...a,
      forms: a.forms.filter((f) => f.id !== record.id),
    }));
    expect(appSections(state().project).map(formOf)).toEqual([
      state().project.app!.forms[0].id,
    ]);
    state().removeApp();
    expect(state().project.app).toBeUndefined();
    expect(appSections(state().project)).toEqual([]);
  });
  it("keeps the app when switching website template", () => {
    state().installApp(rewards());
    state().applyTemplate("folio");
    expect(state().project.app?.forms).toHaveLength(2);
  });
});

describe("App form sections on the canvas and published site", () => {
  const setup = () => {
    state().installApp(rewards(), "Rewards");
    const p = state().project;
    return { p, page: p.pages.at(-1)! };
  };
  it("shows the first step inert in the editor", () => {
    const { p, page } = setup();
    const html = renderToStaticMarkup(
      <Website project={p} page={page} onEdit={() => {}} />,
    );
    expect(html).toContain("Works on your published site.");
    expect(html).toContain("Record a purchase");
    expect(html).not.toContain('data-step="confirm"');
    expect(html).not.toContain("data-app-api");
    expect(html).toMatch(/<input(?=[^>]*name="identity")(?=[^>]*disabled)/);
  });
  it("says it needs Forma in a ZIP export, and works when published", () => {
    const { p, page } = setup();
    const zip = renderToStaticMarkup(
      <Website project={p} page={page} exporting preview />,
    );
    expect(zip).toContain("Works when published with Forma.");
    const live = renderToStaticMarkup(
      <Website
        project={p}
        page={page}
        exporting
        preview
        appApi="https://api.test/apps/s1"
      />,
    );
    expect(live).toContain('data-app-api="https://api.test/apps/s1"');
    expect(live).toContain(`data-form="${p.app!.forms[0].id}"`);
    for (const stepName of [
      "identify",
      "confirm",
      "fields",
      "done",
      "lookup",
      "result",
    ])
      expect(live).toContain(`data-step="${stepName}"`);
    expect(live).toContain("Is this you?");
    expect(live).toContain('name="website"');
    expect(live).toContain('aria-live="polite"');
    expect(live).not.toContain("Works on your published site");
  });
  it("shows a placeholder in the editor and nothing when published if the form is gone", () => {
    const { p, page } = setup();
    const broken: Project = {
      ...p,
      pages: p.pages.map((pg) =>
        pg.id === page.id
          ? {
              ...pg,
              sections: pg.sections.map((s) => {
                const root = structuredClone(s.root!);
                for (const n of walk([root]))
                  if (n.type === "appForm") n.props.form = "gone";
                return { ...s, root };
              }),
            }
          : pg,
      ),
    };
    const brokenPage = broken.pages.at(-1)!;
    expect(
      renderToStaticMarkup(
        <Website project={broken} page={brokenPage} onEdit={() => {}} />,
      ),
    ).toContain("Choose which app form this section shows.");
    const published = renderToStaticMarkup(
      <Website
        project={broken}
        page={brokenPage}
        exporting
        preview
        appApi="https://x"
      />,
    );
    expect(published).not.toContain("app-form");
    expect(published).not.toContain("Choose which app form");
    const issues = reviewProject(broken);
    expect(issues.filter((i) => i.id.startsWith("app-section-"))).toHaveLength(
      2,
    );
    expect(
      issues.find((i) => i.id.startsWith("app-unplaced-"))?.target,
    ).toEqual({
      app: { tab: "forms", id: p.app!.forms[0].id },
    });
  });
});

describe("App builder", () => {
  it("builds an app from a template and adds its forms to a new page", () => {
    const notify = vi.fn();
    render(<AppBuilder onClose={() => {}} notify={notify} />);
    expect(screen.getByText("Loyalty card")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Use Customer rewards" }),
    );
    expect(state().project.app?.tables.map((t) => t.name)).toEqual([
      "Customers",
      "Purchases",
    ]);
    expect(notify.mock.calls[0][0]).toBe(
      "Customer rewards is ready. Its forms are on a new page, Rewards.",
    );
    expect(
      screen.getByRole("tab", { name: "Tables" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("explains why the phone field can't be deleted", () => {
    state().installApp(rewards());
    render(<AppBuilder onClose={() => {}} notify={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Phone" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/can’t be done yet/);
    expect(alert.textContent).toMatch(/“My rewards” finds records by it/);
    expect(
      state().project.app!.tables[0].fields.some((f) => f.name === "Phone"),
    ).toBe(true);
  });

  it("confirms side effects before deleting a field, then cleans up", () => {
    state().installApp(rewards());
    const notify = vi.fn();
    render(<AppBuilder onClose={() => {}} notify={notify} />);
    fireEvent.click(screen.getByRole("button", { name: /^Purchases/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Reward" }));
    expect(
      screen.getByText("The total “Total reward” will be removed."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete field" }));
    const app = state().project.app!;
    expect(app.tables[1].fields.map((f) => f.name)).not.toContain("Reward");
    expect(app.tables[0].totals.map((t) => t.name)).not.toContain(
      "Total reward",
    );
    expect(notify).toHaveBeenCalledWith(
      "Reward deleted.",
      expect.objectContaining({ label: "Undo" }),
    );
  });

  it("edits steps, forms and settings in plain words", () => {
    state().installApp(rewards());
    render(
      <AppBuilder
        onClose={() => {}}
        notify={vi.fn()}
        initial={{ tab: "tables" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Purchases/ }));
    expect(
      screen.getByText(
        "Approve: from Waiting for review → Approved; you fill Reward; Reward can’t be more than purchase amount.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Table name"), {
      target: { value: "Bills" },
    });
    expect(state().project.app!.tables[1].name).toBe("Bills");

    fireEvent.click(screen.getByRole("tab", { name: "Forms" }));
    expect(screen.getByText(/Not on any page yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to page/ }));
    expect(appSections(state().project)).toHaveLength(1);
    expect(screen.getByText(/Shown on Home/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "USD" },
    });
    expect(state().project.app!.currency).toBe("USD");
    fireEvent.click(screen.getByRole("button", { name: /Remove app/ }));
    const confirm = screen.getByRole("group");
    expect(confirm.getAttribute("aria-label")).toMatch(
      /1 form section on Home/,
    );
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Remove app" }),
    );
    expect(state().project.app).toBeUndefined();
    expect(appSections(state().project)).toEqual([]);
  });

  it("links to app records for workspace sites", () => {
    state().installApp(rewards());
    render(
      <AppBuilder
        onClose={() => {}}
        notify={vi.fn()}
        recordsUrl="/apps?site=abc"
      />,
    );
    expect(
      screen
        .getByRole("link", { name: /Open app records/ })
        .getAttribute("href"),
    ).toBe("/apps?site=abc");
  });
});

describe("collections and the app", () => {
  /** A blank app with an Orders table whose Dishes come from a new menu. */
  const withMenu = () => {
    const menu = state().addCollection("menu");
    const app = addTable(
      APP_TEMPLATES.find((t) => t.id === "blank")!.build("Shop"),
      "Orders",
      "Order",
    );
    app.tables[0].fields.push(
      createAppField("Dishes", "items", { collection: menu }),
    );
    state().installApp(app);
    return menu;
  };
  it("refuses to delete a collection the app orders from", () => {
    const menu = withMenu();
    expect(state().removeCollection(menu)).toBe(false);
    expect(state().project.collections!.map((c) => c.id)).toContain(menu);
    render(
      <DataManager
        initial={menu}
        initialTab="settings"
        onClose={() => {}}
        notify={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /^Delete menu/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Orders chooses “Dishes” from it/)).toBeTruthy();
  });
  it("refuses app changes that point at a collection the site doesn't have", () => {
    withMenu();
    const ok = state().updateApp((a: App) => ({
      ...a,
      tables: a.tables.map((t) => ({
        ...t,
        fields: t.fields.map((f) =>
          f.type === "items" ? { ...f, collection: "gone" } : f,
        ),
      })),
    }));
    expect(ok).toBe(false);
    expect(validateProject(state().project)).toBe(true);
  });
  it("installs an app with its collections in one undoable step", () => {
    const template = APP_TEMPLATES.find(
      (t) => t.create("Shop").collections.length,
    )!;
    const { app, collections } = template.create("Shop");
    const before = state().project.collections?.length ?? 0;
    state().installApp(app, template.page, collections);
    expect(state().project.collections!.length).toBe(
      before + collections.length,
    );
    expect(validateProject(state().project)).toBe(true);
    state().undo();
    expect(state().project.app).toBeUndefined();
    expect(state().project.collections?.length ?? 0).toBe(before);
  });
  it("turns a field into an order from a new menu when the site has none", () => {
    const app = addTable(
      APP_TEMPLATES.find((t) => t.id === "blank")!.build("Shop"),
      "Orders",
      "Order",
    );
    state().installApp(app);
    useStudio.setState({
      project: { ...state().project, collections: [] },
    });
    const notify = vi.fn();
    render(
      <AppBuilder
        onClose={() => {}}
        notify={notify}
        initial={{ tab: "tables" }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name type"), {
      target: { value: "items" },
    });
    expect(screen.getByText("Your site has no collections yet")).toBeTruthy();
    expect(state().project.app!.tables[0].fields[0].type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: /New menu/ }));
    const [menu] = state().project.collections!;
    const field = state().project.app!.tables[0].fields[0];
    expect([field.type, field.collection]).toEqual(["items", menu.id]);
    expect(screen.getByLabelText("Chooses from")).toBeTruthy();
    expect(validateProject(state().project)).toBe(true);
  });
  it("sets up places that run out and reads them as a sentence", () => {
    const app = addTable(
      APP_TEMPLATES.find((t) => t.id === "blank")!.build("Shop"),
      "Bookings",
      "Booking",
    );
    const t = app.tables[0];
    t.fields.push(
      createAppField("Date", "date"),
      createAppField("Time", "choice", { options: ["19:00", "20:00"] }),
      createAppField("Guests", "number"),
    );
    t.statuses = [
      { id: "req", name: "Requested", tone: "waiting" },
      { id: "ok", name: "Confirmed", tone: "good" },
      { id: "no", name: "Cancelled", tone: "bad" },
    ];
    t.initial = "req";
    state().installApp(app);
    render(
      <AppBuilder
        onClose={() => {}}
        notify={vi.fn()}
        initial={{ tab: "tables" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add a limit/ }));
    fireEvent.change(screen.getByLabelText("At most"), {
      target: { value: "40" },
    });
    expect(
      screen.getByText(
        "At most 40 guests per Date + Time while Requested or Confirmed.",
      ),
    ).toBeTruthy();
    const [capacity] = state().project.app!.tables[0].capacity!;
    expect(capacity.max).toBe(40);
  });
  it("asks visitors to pay and warns when there's no way to get paid", () => {
    const menu = withMenu();
    state().updateApp((a) => {
      const t = a.tables[0];
      const dishes = t.fields.find((f) => f.type === "items")!;
      return {
        ...a,
        forms: [
          {
            id: "order",
            name: "Order",
            kind: "submit",
            table: t.id,
            fields: [t.titleField, dishes.id],
            payment: { field: dishes.id },
            totals: [],
            title: "Order",
            intro: "",
            button: "Place order",
            success: "",
          },
        ],
      };
    });
    void menu;
    const issue = reviewProject(state().project).find(
      (i) => i.id === "app-payments-missing",
    );
    expect(issue?.target).toBe("payments");
    render(
      <AppBuilder
        onClose={() => {}}
        notify={vi.fn()}
        initial={{ tab: "forms", id: "order" }}
      />,
    );
    expect(
      (screen.getByLabelText("Ask visitors to pay") as HTMLSelectElement).value,
    ).not.toBe("");
    expect(screen.getByText(/haven’t set up a way to get paid/)).toBeTruthy();
  });
});
