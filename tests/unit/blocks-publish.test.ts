import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { validateProject } from "../../src/studio/model";
import {
  classicProject,
  createProject,
  createSection,
} from "../../src/studio/templates";
import { presetById } from "../../src/blocks/presets";
import { item } from "../../src/studio/sites/kit";
import {
  liveAppForms,
  needsAppScript,
  renderPage,
} from "../../src/studio/export";
import { needsSiteScript } from "../../src/studio/siteScript";
import { needsUpgrade } from "../../src/blocks/legacy";
import { walk } from "../../src/blocks/model";
import { appFormsIn, tabBarOf } from "../../src/blocks/project";
import { compileSite } from "../../backend/compiler";
import { inboxConfig } from "../../backend/inbox";
import { decodeProject } from "../../backend/project";

describe("classic drafts on the backend", () => {
  it("opens classic drafts on the backend as blocks", () => {
    const p = classicProject("volt");
    const { project } = decodeProject(gzipSync(JSON.stringify(p)));
    expect(needsUpgrade(project)).toBe(false);
    expect(validateProject(project)).toBe(true);
  });
});

describe("smart blocks on the published site", () => {
  const inbox = "https://api.test/inbox/site";
  const appApi = "https://api.test/apps/site";

  it("places app forms from blocks: live forms, the app script and its hooks", () => {
    const p = createProject("glow");
    expect(
      p.pages.flatMap((pg) => pg.sections).some((s) => s.type === "app"),
    ).toBe(false);
    const placed = appFormsIn(p);
    expect(
      liveAppForms(p)
        .map((f) => f.id)
        .sort(),
    ).toEqual(
      p
        .app!.forms.filter((f) => placed.has(f.id))
        .map((f) => f.id)
        .sort(),
    );
    expect(liveAppForms(p).length).toBeGreaterThan(0);
    expect(needsAppScript(p, appApi)).toBe(true);
    const form = liveAppForms(p)[0];
    const page = p.pages.find((pg) =>
      JSON.stringify(pg.sections).includes(form.id),
    )!;
    const html = renderPage(p, page, { appApi });
    expect(html).toContain(`data-app-api="${appApi}"`);
    expect(html).toContain(`data-form="${form.id}"`);
    expect(html).toContain('<script src="app.js" defer></script>');
    // A hidden block isn't live.
    for (const s of page.sections)
      for (const n of walk(s.root ? [s.root] : []))
        if (n.type === "form" && n.props.form === form.id) n.hidden = true;
    expect(liveAppForms(p).some((f) => f.id === form.id)).toBe(false);
  });
  it("lists a collection's items, linking to their pages", () => {
    const p = createProject("table");
    const c = p.collections!.find((x) => x.itemPages)!;
    const page = p.pages.find((pg) =>
      JSON.stringify(pg.sections).includes(`"collection:${c.id}"`),
    )!;
    const html = renderPage(p, page);
    const first = c.items.find((i) => !i.hidden)!;
    expect(html).toContain(`href="./${c.slug}/${first.slug}.html"`);
  });
  it("posts contact and signup forms to the inbox, or the owner's endpoint", async () => {
    const p = createProject("botanical");
    const contact = p.pages.find((pg) => pg.slug === "contact")!;
    let html = renderPage(p, contact, { inbox });
    expect(html).toContain(`action="${inbox}"`);
    expect(html).toContain('name="form" value="contact"');
    expect(renderPage(p, p.pages[0], { inbox })).toContain(
      'name="form" value="newsletter"',
    );
    expect(inboxConfig(p).forms?.sort()).toEqual(["contact", "newsletter"]);
    const files = await compileSite(
      p,
      "https://sites.test/r",
      undefined,
      inbox,
    );
    expect(files.some((f) => f.name === "thanks.html")).toBe(true);
    for (const s of contact.sections)
      for (const n of walk(s.root ? [s.root] : []))
        if (n.type === "form" && n.props.kind === "contact")
          n.props.action = "https://example.com/contact";
    html = renderPage(p, contact, { inbox });
    expect(html).toContain('action="https://example.com/contact"');
    expect(inboxConfig(p).forms).toEqual(["newsletter"]);
  });
  it("copies the bundled portraits and placeholder logos into the release", async () => {
    const p = createProject("glow");
    p.pages[0].sections = ["team-grid", "logos-row"].map((id) =>
      createSection("blocks", {
        name: id,
        root: presetById(id)!.build({ project: p }),
      }),
    );
    const files = await compileSite(p, "/sites/s1/releases/r1");
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).not.toContain("/images/person-");
    expect(home).not.toContain("/images/logo-placeholder-");
    const jpegs = files.filter((f) => /^images\/[\da-f]+\.jpeg$/.test(f.name));
    const pngs = files.filter((f) => /^images\/[\da-f]+\.png$/.test(f.name));
    expect(jpegs).toHaveLength(4);
    expect(pngs).toHaveLength(5);
    for (const f of pngs) {
      expect(f.type).toBe("image/png");
      expect(home).toContain(`/sites/s1/releases/r1/${f.name}`);
    }
  });
  it("fills products blocks and the header's Shop button from the store", async () => {
    const p = createProject("botanical");
    const products = [
      item(
        "Monstera",
        "Big leaves",
        "/images/plant-1.jpg",
        "₹900",
        "/shop/monstera",
      ),
    ];
    const files = await compileSite(p, "https://sites.test/r", {
      shopUrl: "https://shop.test/botanical",
      products,
      checksum: "x",
    });
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).toContain("Monstera");
    expect(home).toContain("₹900");
    expect(home).toContain('href="https://shop.test/botanical"');
    expect(home).toMatch(/>Shop</);
    // The template's own placeholder products are replaced.
    expect(home).not.toContain("Fiddle leaf fig");
    // Products blocks open as store repeats; their photos are published with the site.
    expect(home).toContain("rl-products");
    expect(home).toMatch(
      /<img[^>]*src="https:\/\/sites\.test\/r\/images\/[\w]+\.jpeg"[^>]*alt="Monstera"/,
    );
    expect(home).toContain('href="/shop/monstera"');
  });
  it("keeps the orbits, the theme switch and the phone tab bar working", () => {
    const p = createProject("dhanlaxmi");
    const html = renderPage(p, p.pages[0]);
    expect(needsSiteScript(p)).toBe(true);
    p.theme.darkToggle = false;
    expect(needsSiteScript(p)).toBe(true);
    expect(html).toContain('class="site-ambient"');
    expect(html).toContain("data-site-theme-toggle");
    expect(html).toContain('class="site-tabbar"');
    expect(tabBarOf(p)?.map((t) => t.label)).toEqual([
      "Home",
      "Add",
      "Rewards",
    ]);
    for (const s of p.pages[0].sections)
      if (s.root?.props.effect === "orbits") delete s.root.props.effect;
    expect(needsSiteScript(p)).toBe(false);
  });
  it("relinks blocks when a page's address changes", async () => {
    const { useStudio } = await import("../../src/studio/store");
    const p = createProject("dhanlaxmi");
    useStudio.setState({
      project: p,
      past: [],
      future: [],
      activePage: p.pages[0].id,
    });
    const submit = p.pages.find((pg) => pg.slug === "submit")!;
    useStudio.getState().updatePage(submit.id, { slug: "add" });
    const next = useStudio.getState().project;
    expect(tabBarOf(next)?.map((t) => t.url)).toContain("/add");
    const hero = [...walk([next.pages[0].sections[0].root!])];
    expect(hero.find((n) => n.type === "button")?.props.url).toBe("/add");
  });
});

describe("logic on the published site (src/blocks/logic)", () => {
  it("adds logic.js only for sites that use clicks or conditions, and only on those pages", async () => {
    const p = createProject("blank", "Logic publish");
    const plain = await compileSite(p, "https://sites.test/r");
    expect(plain.some((f) => f.name === "logic.js")).toBe(false);
    // A second page with tabs; the home page stays plain.
    const tabs = presetById("logic-tabs")!;
    p.pages.push({
      id: "offers",
      name: "Offers",
      slug: "offers",
      title: "Offers",
      description: "",
      sections: [
        createSection("blocks", {
          name: "Tabs",
          root: tabs.build({ project: p }),
        }),
      ],
      variables: tabs.variables!(),
    });
    expect(validateProject(p)).toBe(true);
    const files = await compileSite(p, "https://sites.test/r");
    const script = files.find((f) => f.name === "logic.js");
    expect(script?.type).toBe("text/javascript; charset=utf-8");
    const source = script!.body.toString();
    expect(source).not.toMatch(
      /\beval\(|new Function|innerHTML|insertAdjacentHTML|document\.write/,
    );
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    const offers = files.find((f) => f.name === "offers.html")!.body.toString();
    expect(home).not.toContain("logic.js");
    expect(home).not.toContain("forma-logic");
    expect(offers).toContain('<script src="logic.js" defer></script>');
    // No inline script: every <script> is the file or the JSON config.
    for (const tag of offers.match(/<script\b[^>]*>/g) ?? [])
      expect(tag).toMatch(/src="(app|logic)\.js"|type="application\/json"/);
    expect(offers).toMatch(/data-when="[\w-]+"[^>]*hidden/);
  });
});
