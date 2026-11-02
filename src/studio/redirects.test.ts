import { describe, expect, it } from "vitest";
import {
  mergeRedirects,
  movedPaths,
  redirectFrom,
  redirectPage,
  redirectsFromRows,
  redirectTo,
  validateRedirects,
} from "./redirects";

describe("redirects", () => {
  it("reduces old addresses to a path the site can serve", () => {
    expect(redirectFrom("https://old-shop.com/pages/About-Us/?ref=x#top")).toBe(
      "pages/about-us",
    );
    expect(redirectFrom("/blogs/news/spring-sale")).toBe(
      "blogs/news/spring-sale",
    );
    expect(redirectFrom("/products/tee.html")).toBe("products/tee");
    expect(redirectFrom("/a/b/c/d/e")).toBe("");
    expect(redirectFrom("/images/x")).toBe("");
    expect(redirectFrom("/index")).toBe("");
    expect(redirectFrom("/with space")).toBe("");
    expect(redirectFrom("/%E0%A4")).toBe("");
  });
  it("accepts site paths and https addresses only", () => {
    expect(redirectTo("about")).toBe("/about");
    expect(redirectTo("/")).toBe("/");
    expect(redirectTo("https://shop.example.com/x?y=1")).toBe(
      "https://shop.example.com/x?y=1",
    );
    expect(redirectTo("javascript:alert(1)")).toBe("");
    expect(redirectTo("http://insecure.example.com")).toBe("");
    expect(redirectTo("http://localhost:5178/store?site=s")).toBe(
      "http://localhost:5178/store?site=s",
    );
    expect(validateRedirects([{ from: "pages/a", to: "/about" }])).toBe(true);
    expect(validateRedirects([{ from: "/pages/a", to: "/about" }])).toBe(false);
  });
  it("reads Shopify's redirect export and plain two-column files", () => {
    expect(
      redirectsFromRows([
        ["Redirect from", "Redirect to"],
        ["/pages/faq", "/help"],
        ["/collections/old", "https://shop.example.com/new"],
        ["/bad path", "/x"],
      ]),
    ).toEqual({
      redirects: [
        { from: "pages/faq", to: "/help" },
        { from: "collections/old", to: "https://shop.example.com/new" },
      ],
      skipped: 1,
    });
    expect(redirectsFromRows([["/old", "/new"]]).redirects).toEqual([
      { from: "old", to: "/new" },
    ]);
    expect(
      mergeRedirects(
        [{ from: "a", to: "/" }],
        [
          { from: "a", to: "/b" },
          { from: "c", to: "/" },
        ],
      ),
    ).toEqual([
      { from: "a", to: "/b" },
      { from: "c", to: "/" },
    ]);
  });
  it("points an imported store's old product and collection links at the Skynoveau store", () => {
    const moved = movedPaths("https://forma.example.com/store?site=s1", [
      {
        handle: "linen-shirt",
        url: "https://forma.example.com/store?site=s1&product=p1",
        collection: "Summer Shirts",
      },
    ]);
    expect(moved).toContainEqual({
      from: "products/linen-shirt",
      to: "https://forma.example.com/store?site=s1&product=p1",
    });
    expect(moved).toContainEqual({
      from: "product-page/linen-shirt",
      to: "https://forma.example.com/store?site=s1&product=p1",
    });
    expect(moved).toContainEqual({
      from: "collections/all",
      to: "https://forma.example.com/store?site=s1",
    });
    expect(moved).toContainEqual({
      from: "collections/summer-shirts",
      to: "https://forma.example.com/store?site=s1&collection=Summer+Shirts",
    });
  });
  it("publishes a page that sends visitors on, relative to its depth", () => {
    const page = redirectPage({ from: "blogs/news/post", to: "/about" });
    expect(page).toContain('content="0; url=../../about.html"');
    expect(page).toContain('rel="canonical" href="../../about.html"');
    expect(redirectPage({ from: "old", to: "/" })).toContain("url=index.html");
    expect(redirectPage({ from: "x", to: 'https://e.com/?a="b"' })).toContain(
      "&#34;b&#34;",
    );
  });
});
