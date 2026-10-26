import { describe, expect, it } from "vitest";
import { createProject, createSection } from "../../src/studio/templates";
import { OWNER_LINK } from "../../src/studio/model";
import { SITE_SCRIPT } from "../../src/studio/siteScript";
import { compileSite } from "../../backend/compiler";

describe("published site script", () => {
  it("adds app.js for the theme switch and fills in the owner's link", async () => {
    const p = createProject("blank");
    p.theme.darkToggle = true;
    p.footer = [
      createSection("footer", {
        variant: "centered",
        buttonLabel: "Shop owner sign in",
        buttonUrl: OWNER_LINK,
      }),
    ];
    const files = await compileSite(p, "/sites/abc/releases/r1");
    expect(files.find((f) => f.name === "app.js")?.body.toString()).toBe(
      SITE_SCRIPT,
    );
    const home = files.find((f) => f.name === "index.html")!.body.toString();
    expect(home).toContain('<script src="app.js" defer></script>');
    expect(home).toMatch(
      /href="[^"]*\/owner\?site=abc"><span>Shop owner sign in/,
    );
  });

  it("publishes no script for a site that doesn't need one", async () => {
    const files = await compileSite(
      createProject("blank"),
      "/sites/abc/releases/r1",
    );
    expect(files.some((f) => f.name === "app.js")).toBe(false);
  });
});
