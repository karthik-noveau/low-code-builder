import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { createProject, createSection } from "../../src/studio/templates";
import { createCollection } from "../../src/studio/collections";
import { decodeProject } from "../../backend/project";
import { compileSite } from "../../backend/compiler";
import { objectPath } from "../../backend/objects";
import { api } from "../../backend/api";
import { inboxConfig } from "../../backend/inbox";
import { appConfig } from "../../backend/apps";
import { APP_TEMPLATES } from "../../src/apps/templates";

describe("backend validation and static compilation", () => {
  it.each(["botanical", "folio", "studio", "table", "blank"] as const)(
    "compiles the %s template with its bundled images",
    async (template) => {
      const files = await compileSite(
        createProject(template),
        "https://sites.example/release",
      );
      expect(files.some((file) => file.name === "index.html")).toBe(true);
    },
  );
  it("publishes a page for every visible collection item", async () => {
    const project = createProject();
    const c = createCollection("properties");
    c.items[2].hidden = true;
    project.collections = [c];
    project.pages[0].sections.push(
      createSection("collection", {
        listing: { collection: c.id, style: "grid", columns: 3, limit: 0 },
      }),
    );
    const base = "https://sites.example/sites/1/releases/2";
    const files = await compileSite(project, base);
    const pages = files.filter((f) => f.name.startsWith(`${c.slug}/`));
    expect(pages.map((f) => f.name)).toEqual(
      c.items.slice(0, 2).map((i) => `${c.slug}/${i.slug}.html`),
    );
    const page = pages[0].body.toString();
    expect(page).toContain(`${base}/styles.css`);
    expect(page).toContain(`${base}/images/`);
    expect(page).toContain('<base href="../">');
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).toContain(`href="${c.slug}/${c.items[0].slug}.html"`);
  });
  it("wires visitor action forms to the inbox and lists what each release accepts", async () => {
    const project = createProject();
    const services = createCollection("services");
    const team = createCollection("team");
    services.items[1].hidden = true;
    project.collections = [services, team];
    const inbox = "https://api.example/inbox/site-1";
    const files = await compileSite(
      project,
      "https://sites.example/r",
      undefined,
      inbox,
    );
    const page = files.find(
      (f) => f.name === `${services.slug}/${services.items[0].slug}.html`,
    )!;
    expect(page.body.toString()).toContain(`action="${inbox}"`);
    expect(files.some((f) => f.name === "thanks.html")).toBe(true);
    const config = inboxConfig(project);
    expect(config.collections.map((c) => c.id)).toEqual([services.id]);
    expect(config.collections[0].collect).toBe(false);
    expect(Object.keys(config.collections[0].items)).toEqual([
      services.items[0].slug,
      ...services.items.slice(2).map((i) => i.slug),
    ]);
    // Ids are data, not object keys: odd ids can't break publishing.
    project.collections = [{ ...services, id: "__proto__" }];
    expect(inboxConfig(project).collections[0].id).toBe("__proto__");
    const plain = await compileSite(project, "https://sites.example/r");
    expect(plain.some((f) => f.name === "thanks.html")).toBe(false);
  });
  it("publishes even when collections hold images visitors never see", async () => {
    const project = createProject();
    const c = createCollection("products");
    const photo = c.display.image;
    c.items[0].values[photo] = "not a url";
    c.items[1].values[photo] = "http://insecure.example/a.jpg";
    c.items[2].hidden = true;
    c.items[2].values[photo] = "javascript:alert(1)";
    project.collections = [c];
    project.pages.push({
      id: "t",
      name: "Thanks",
      slug: "thanks",
      title: "Thanks",
      description: "",
      sections: [],
    });
    const files = await compileSite(
      project,
      "https://sites.example/r",
      undefined,
      "https://api/inbox/x",
    );
    const names = files.map((f) => f.name);
    expect(names.filter((n) => n === "thanks.html")).toHaveLength(1);
    expect(names).not.toContain(`${c.slug}/${c.items[2].slug}.html`);
    const page = files.find(
      (f) => f.name === `${c.slug}/${c.items[1].slug}.html`,
    )!;
    expect(page.body.toString()).not.toContain("http://insecure.example");
  });
  it("bounds block content", () => {
    const project = createProject();
    project.pages[0].sections.push(
      createSection("custom", {
        blocks: Array.from({ length: 201 }, () => ({
          id: crypto.randomUUID(),
          type: "divider" as const,
          text: "",
          url: "#",
          image: "",
          alt: "",
          size: "md" as const,
          variant: "primary" as const,
          height: 0,
          children: [],
        })),
      }),
    );
    expect(() => decodeProject(gzipSync(JSON.stringify(project)))).toThrow(
      "too many blocks",
    );
  });
  it("bounds decompression and rejects prototype section types", () => {
    expect(() =>
      decodeProject(gzipSync(Buffer.alloc(21 * 1024 * 1024))),
    ).toThrow("oversized");
    const project = createProject();
    (project.pages[0].sections[0] as { type: string }).type = "constructor";
    expect(() => decodeProject(gzipSync(JSON.stringify(project)))).toThrow();
  });
  it("rejects oversized names, unsafe page paths and invalid colors", () => {
    const project = createProject();
    project.name = "x".repeat(121);
    expect(() => decodeProject(gzipSync(JSON.stringify(project)))).toThrow(
      "name",
    );
    project.name = "Safe";
    project.pages[0].slug = "../../secret";
    expect(() => decodeProject(gzipSync(JSON.stringify(project)))).toThrow(
      "format",
    );
    project.pages[0].slug = "";
    project.pages[0].sections[0].background = "url(https://tracker.test)";
    expect(() => decodeProject(gzipSync(JSON.stringify(project)))).toThrow(
      "colors",
    );
  });
  it("never includes private drafts, escapes content and pins assets to a release", async () => {
    const project = createProject();
    project.pages[0].title = "<script>private()</script>";
    const files = await compileSite(
      project,
      "https://sites.example/sites/123/releases/456",
    );
    const home = files
      .find((file) => file.name === "index.html")!
      .body.toString();
    expect(home).toContain("&lt;script&gt;");
    expect(home).toContain(
      "https://sites.example/sites/123/releases/456/styles.css",
    );
    expect(home).toContain(
      "https://sites.example/sites/123/releases/456/images/",
    );
    expect(files.some((file) => file.name.endsWith(".json"))).toBe(false);
    expect(
      files.filter((file) => file.name.startsWith("images/")).length,
    ).toBeGreaterThan(0);
  });
  it("rejects arbitrary local image reads and non-images disguised as uploads", async () => {
    const project = createProject();
    project.pages[0].sections[0].image = "/images/../../.env";
    await expect(
      compileSite(project, "https://sites.example/release"),
    ).rejects.toThrow("missing");
    project.pages[0].sections[0].image =
      "data:image/png;base64," +
      Buffer.from("<script>bad()</script>").toString("base64");
    await expect(
      compileSite(project, "https://sites.example/release"),
    ).rejects.toThrow("file type");
    expect(() => objectPath("drafts", "../../secret")).toThrow();
  });
  it("refuses unauthenticated requests before touching storage", async () => {
    const result = await api({
      method: "GET",
      path: "/sites",
      headers: {},
      body: Buffer.alloc(0),
    });
    expect(result.status).toBe(401);
  });
  it("publishes only placed app forms, and install files only when publishing", async () => {
    const project = createProject();
    project.app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Shop");
    const [submit, lookup] = project.app.forms;
    project.pages[0].sections.push(
      createSection("app", { appForm: submit.id }),
      createSection("app", { appForm: lookup.id, hidden: true }),
    );
    expect(appConfig(project)!.app.forms.map((f) => f.id)).toEqual([submit.id]);
    const exported = await compileSite(project, "https://sites.example/r");
    expect(exported.some((f) => f.name === "app.js")).toBe(false);
    const files = await compileSite(
      project,
      "https://sites.example/r",
      undefined,
      undefined,
      "https://api.example/apps/site-1",
    );
    const names = files.map((f) => f.name);
    for (const name of [
      "app.js",
      "sw.js",
      "offline.html",
      "manifest.webmanifest",
      "icon.svg",
      "icon-192.png",
      "icon-512.png",
    ])
      expect(names).toContain(name);
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).toContain('<script src="app.js" defer></script>');
    expect(home).toContain('href="manifest.webmanifest"');
    const icon = files.find((f) => f.name === "icon-512.png")!.body;
    expect(icon.readUInt32BE(16)).toBe(512);
    // Without install, only the script for the forms is published.
    project.app.install.enabled = false;
    const plain = await compileSite(
      project,
      "https://sites.example/r",
      undefined,
      undefined,
      "https://api.example/apps/site-1",
    );
    expect(
      plain
        .filter((f) => /\.(js|webmanifest)$/.test(f.name))
        .map((f) => f.name),
    ).toEqual(["app.js"]);
  });
});
