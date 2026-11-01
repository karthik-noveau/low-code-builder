import { describe, expect, it } from "vitest";
import { createProject } from "./templates";
import {
  emptySeo,
  jsonLdTag,
  robotsTxt,
  seoHead,
  seoProblems,
  sitemapXml,
  validateSeo,
} from "./seo";
import { validateProject } from "./model";

describe("search and sharing", () => {
  it("validates settings strictly", () => {
    expect(validateSeo(emptySeo())).toBe(true);
    expect(validateSeo({ ...emptySeo(), ga4: "UA-123" })).toBe(false);
    expect(validateSeo({ ...emptySeo(), siteUrl: "http://shop.com" })).toBe(
      false,
    );
    expect(
      validateSeo({ ...emptySeo(), social: ["javascript:alert(1)"] }),
    ).toBe(false);
    expect(
      validateSeo({
        ...emptySeo(),
        business: { ...emptySeo().business, country: "india" },
      }),
    ).toBe(false);
    const project = createProject();
    expect(validateProject({ ...project, seo: emptySeo() })).toBe(true);
    expect(
      validateProject({ ...project, seo: { ...emptySeo(), language: "<x>" } }),
    ).toBe(false);
  });
  it("never lets page text close a JSON-LD block", () => {
    expect(jsonLdTag({ name: "</script><script>alert(1)" })).not.toContain(
      "</script><script>",
    );
  });
  it("writes canonical, social and robots tags", () => {
    const project = createProject();
    const head = seoHead({
      project: { ...project, seo: { ...emptySeo(), indexing: false } },
      title: 'A "quoted" page',
      description: "",
      path: "about",
      siteUrl: "https://shop.example.com/",
      fallbackImage: "/sites/x/releases/y/images/a.png",
    });
    expect(head).toContain(
      '<link rel="canonical" href="https://shop.example.com/about">',
    );
    expect(head).toContain('content="A &quot;quoted&quot; page"');
    expect(head).toContain(
      'content="https://shop.example.com/sites/x/releases/y/images/a.png"',
    );
    expect(head).toContain("noindex, nofollow");
    // Exports (no address) carry no canonical.
    expect(
      seoHead({ project, title: "x", description: "", path: "", siteUrl: "" }),
    ).not.toContain("canonical");
  });
  it("lists pages in the sitemap and keeps hidden ones out of robots", () => {
    const sitemap = sitemapXml("https://a.com/", [
      { path: "" },
      { path: "about" },
    ]);
    expect(sitemap).toContain("<url><loc>https://a.com/</loc></url>");
    expect(sitemap).toContain("<url><loc>https://a.com/about</loc></url>");
    expect(robotsTxt("https://a.com/", true, ["secret"])).toBe(
      "User-agent: *\nAllow: /\nDisallow: /secret\nSitemap: https://a.com/sitemap.xml\n",
    );
    expect(robotsTxt("", false, [])).toBe("User-agent: *\nDisallow: /\n");
  });
  it("finds titles and descriptions that read badly in results", () => {
    const project = createProject();
    const [home] = project.pages;
    const copy = {
      ...structuredClone(home),
      id: "p2",
      slug: "two",
      name: "Two",
    };
    copy.title = home.title = "Same title";
    home.description = "Too short";
    const ids = seoProblems({ ...project, pages: [home, copy] }).map(
      (p) => p.id,
    );
    expect(ids).toContain(`seo-title-same-${home.id}`);
    expect(ids).toContain(`seo-description-${home.id}`);
    expect(ids).toContain("seo-share-image");
  });
});
