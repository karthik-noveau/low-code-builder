// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject, createSection } from "./templates";
import { OWNER_LINK, validateProject, type Project } from "./model";
import { renderPage } from "./export";
import { Website } from "./Website";
import { needsSiteScript } from "./siteScript";

afterEach(cleanup);

/** A small rewards site using every variant, as the Dhanlaxmi template does. */
function rewardsSite(): Project {
  const p = createProject("blank");
  p.theme = {
    ...p.theme,
    accent: "#e07400",
    background: "#f5f6f8",
    color: "#101623",
    logo: "bolt",
    darkToggle: true,
  };
  p.pages[0].name = "Home";
  p.pages.push({
    id: "add",
    name: "Add purchase",
    slug: "add-purchase",
    title: "Add a purchase",
    description: "",
    sections: [],
  });
  p.header = [
    createSection("header", {
      variant: "brand",
      title: "Dhanlaxmi",
      eyebrow: "Electricals",
      buttonLabel: "",
      items: [
        { id: "t1", title: "Home", body: "", image: "", price: "", url: "/" },
        {
          id: "t2",
          title: "Add",
          body: "",
          image: "",
          price: "",
          url: "/add-purchase",
          icon: "receipt",
        },
      ],
    }),
  ];
  p.pages[0].sections = [
    createSection("hero", {
      variant: "badge",
      effect: "orbits",
      eyebrow: "Rewards for shopping with us",
      title: "Buy from us. *Earn rewards.*",
      body: "Tell us what you bought.",
      buttonLabel: "Add a purchase",
      buttonUrl: "/add-purchase",
      secondaryLabel: "See my rewards",
      secondaryUrl: "/add-purchase",
      note: "No login needed.",
      image: "",
    }),
    createSection("features", {
      variant: "cards",
      title: "How it works",
      items: [
        {
          id: "s1",
          title: "Enter your phone number",
          body: "We show your name.",
          image: "",
          price: "",
          url: "",
          icon: "phone",
        },
      ],
    }),
    createSection("text", {
      variant: "notice",
      title: "Not registered yet?",
      body: "Only the shop owner can add you.",
      buttonLabel: "",
    }),
  ];
  p.footer = [
    createSection("footer", {
      variant: "centered",
      title: "Dhanlaxmi Electricals · Customer rewards",
      body: "",
      buttonLabel: "Shop owner sign in",
      buttonUrl: OWNER_LINK,
    }),
  ];
  return p;
}

describe("section variants", () => {
  it("is a valid project", () => {
    expect(validateProject(rewardsSite())).toBe(true);
  });

  it("renders each look with its own markup", () => {
    const p = rewardsSite();
    const html = renderToStaticMarkup(
      <Website project={p} page={p.pages[0]} preview />,
    );
    expect(html).toContain("site-header-brand");
    expect(html).toContain('class="site-brand-mark"');
    expect(html).toContain("site-brand-tagline");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("data-site-theme-toggle");
    expect(html).toContain("site-hero-badge");
    expect(html).toContain("site-hero-pill");
    expect(html).toContain("<em>Earn rewards.</em>");
    expect(html).not.toContain("*Earn");
    expect(html).toContain("site-hero-ghost");
    expect(html).toContain("site-hero-reassure");
    expect(html).toContain("data-ambient");
    expect(html).toContain("site-step-number");
    expect(html).toContain("site-notice-box");
    expect(html).toContain("site-footer-centered");
    expect(html).toContain("site-tabbar");
    expect(html).toContain("site-themes");
  });

  it("renders the same markup in preview and export", () => {
    const p = rewardsSite();
    const strip = (html: string) => html.replace(/ href="[^"]*"/g, "");
    const preview = renderToStaticMarkup(
      <Website project={p} page={p.pages[0]} preview />,
    );
    const exported = renderPage(p, p.pages[0]).match(
      /<body>([\s\S]*)<\/body>/,
    )![1];
    expect(strip(preview)).toBe(strip(exported));
  });

  it("links the owner's sign-in to the owner app once published", () => {
    const p = rewardsSite();
    expect(renderPage(p, p.pages[0])).toContain(
      'href="#"><span>Shop owner sign in',
    );
    expect(
      renderPage(p, p.pages[0], {
        owner: "https://forma.test/owner?site=abc",
      }),
    ).toContain(
      'href="https://forma.test/owner?site=abc"><span>Shop owner sign in',
    );
  });

  it("loads app.js only when the theme switch or moving background needs it", () => {
    const p = rewardsSite();
    expect(needsSiteScript(p)).toBe(true);
    expect(renderPage(p, p.pages[0])).toContain(
      '<script src="app.js" defer></script>',
    );
    const plain = createProject();
    expect(needsSiteScript(plain)).toBe(false);
    expect(renderPage(plain, plain.pages[0])).not.toContain("app.js");
  });

  it("switches between light and dark in preview", () => {
    const p = rewardsSite();
    const { container, getByRole } = render(
      <Website project={p} page={p.pages[0]} preview />,
    );
    const root = container.querySelector(".website")!;
    expect(root.getAttribute("data-theme")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Switch to dark theme" }));
    expect(root.getAttribute("data-theme")).toBe("dark");
    fireEvent.click(getByRole("button", { name: "Switch to light theme" }));
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("leaves other sites' markup alone", () => {
    const p = createProject();
    const html = renderToStaticMarkup(
      <Website project={p} page={p.pages[0]} preview />,
    );
    for (const name of [
      "site-themes",
      "site-tabbar",
      "data-ambient",
      "site-theme-toggle",
    ])
      expect(html).not.toContain(name);
  });
});
