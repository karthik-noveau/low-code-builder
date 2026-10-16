import { flattenBlocks, type Project } from "./model";

export interface ReviewItem {
  id: string;
  title: string;
  detail: string;
  page: string;
  section?: string;
  kind: "content" | "links" | "forms" | "images";
}
export function reviewProject(project: Project): ReviewItem[] {
  const issues: ReviewItem[] = [];
  const paths = new Set(project.pages.map((p) => `/${p.slug}`));
  for (const page of project.pages) {
    if (!page.title.trim() || !page.description.trim())
      issues.push({
        id: `seo-${page.id}`,
        title: `Describe ${page.name} for search`,
        detail:
          "Add a page title and description so people know what they’re opening.",
        page: page.id,
        kind: "content",
      });
    if (!page.sections.some((s) => !s.hidden))
      issues.push({
        id: `empty-${page.id}`,
        title: `${page.name} is still empty`,
        detail: "Add your first section to give this page a purpose.",
        page: page.id,
        kind: "content",
      });
    const sections = [
      ...(page.id === project.pages[0].id ? project.header : []),
      ...page.sections,
      ...(page.id === project.pages[0].id ? project.footer : []),
    ];
    for (const section of sections.filter((s) => !s.hidden)) {
      const blockImages = flattenBlocks(section.blocks).filter(
        (b) => b.type === "image" && b.image,
      );
      if (blockImages.some((b) => !b.alt.trim()))
        issues.push({
          id: `block-alt-${section.id}`,
          title: `Describe the images in ${section.name}`,
          detail:
            "A short image description helps visitors using screen readers.",
          page: page.id,
          section: section.id,
          kind: "images",
        });
      if (section.image && !section.imageAlt.trim())
        issues.push({
          id: `alt-${section.id}`,
          title: `Describe the image in ${section.name}`,
          detail:
            "A short image description helps visitors using screen readers.",
          page: page.id,
          section: section.id,
          kind: "images",
        });
      if (
        ["contact", "newsletter"].includes(section.type) &&
        !/^https?:\/\//i.test(section.formAction)
      )
        issues.push({
          id: `form-${section.id}`,
          title: `Connect ${section.name.toLowerCase()}`,
          detail:
            "Choose where submissions go. This form is disabled until it is connected.",
          page: page.id,
          section: section.id,
          kind: "forms",
        });
      const hasLinkButton = [
        "announcement",
        "header",
        "hero",
        "text",
        "imageText",
        "products",
        "gallery",
        "cta",
      ].includes(section.type);
      const links = [
        ...(hasLinkButton &&
        (section.buttonLabel || section.type === "announcement")
          ? [section.buttonUrl]
          : []),
        ...(["products", "gallery"].includes(section.type)
          ? section.items.map((i) => i.url).filter(Boolean)
          : []),
        ...flattenBlocks(section.blocks)
          .filter((b) => b.type === "button")
          .map((b) => b.url),
      ];
      if (
        links.some(
          (url) =>
            !url.trim() ||
            url === "#" ||
            (url.startsWith("/") && !url.startsWith("//") && !paths.has(url)),
        )
      )
        issues.push({
          id: `link-${section.id}`,
          title: `Check the links in ${section.name}`,
          detail:
            "Choose an existing page or a complete external URL for every button.",
          page: page.id,
          section: section.id,
          kind: "links",
        });
    }
  }
  for (const c of project.collections ?? [])
    if (c.request && !c.itemPages)
      issues.push({
        id: `request-${c.id}`,
        title: `Turn on item pages for ${c.name}`,
        detail:
          "Visitor actions appear on item pages, so this collection’s form isn’t shown anywhere yet.",
        page: project.pages[0].id,
        kind: "forms",
      });
  return issues;
}
