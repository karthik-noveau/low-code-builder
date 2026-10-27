import { flattenBlocks, OWNER_LINK, type Project } from "./model";
import {
  canCollect,
  isRupee,
  paymentProblems,
  usablePayments,
} from "./payments";
import { appIssues, appSectionProblem, type AppTarget } from "../apps/issues";
import { appFormsIn, shownNodes } from "../blocks/project";
import { inlineLinks, RICH_PROPS, richOptionsFor } from "../blocks/richtext";

export interface ReviewItem {
  id: string;
  title: string;
  detail: string;
  page: string;
  section?: string;
  kind: "content" | "links" | "forms" | "images";
  /** Fixed outside the page: a collection's Data settings, Settings → Get paid, or the App. */
  target?: { collection: string } | { app: AppTarget } | "payments";
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
      const nodes = [...shownNodes(section.root)];
      const blockImages = [
        ...flattenBlocks(section.blocks).filter(
          (b) => b.type === "image" && b.image,
        ),
        ...nodes
          .filter((n) => n.type === "image" && n.props.src)
          .map((n) => ({ alt: String(n.props.alt ?? "") })),
      ];
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
      // An app section's form, or each app form block's.
      const forms =
        section.type === "app"
          ? [section.appForm]
          : [...shownNodes(section.root)]
              .filter((n) => n.type === "appForm")
              .map((n) => String(n.props.form ?? "") || undefined);
      const problem = forms
        .map((f) => appSectionProblem(project.app, f))
        .find(Boolean);
      if (problem)
        issues.push({
          id: `app-section-${section.id}`,
          title: `${section.name} has no form to show`,
          detail: `${problem} Until then it stays empty on your published site.`,
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
        // Buttons, and boxes and images that link somewhere.
        ...nodes
          .filter(
            (n) =>
              n.type === "button" ||
              ((n.type === "box" || n.type === "image") && n.props.link),
          )
          .map((n) =>
            String((n.type === "button" ? n.props.url : n.props.link) ?? ""),
          )
          .filter((url) => url.trim() !== OWNER_LINK),
        // Links inside text ("[words](/menu)").
        ...nodes.flatMap((n) =>
          RICH_PROPS[n.type]
            ? inlineLinks(
                n.props[RICH_PROPS[n.type]!],
                richOptionsFor(n.type),
              ).map((l) => l.href)
            : [],
        ),
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
        target: { collection: c.id },
      });
  if (project.app) {
    const home = project.pages[0].id;
    for (const issue of appIssues(project.app, {
      collections: project.collections,
    }))
      issues.push({
        ...issue,
        page: home,
        kind: "forms",
        target: { app: issue.target },
      });
    const placed = appFormsIn(project);
    for (const form of project.app.forms)
      if (!placed.has(form.id))
        issues.push({
          id: `app-unplaced-${form.id}`,
          title: `Put “${form.name}” on a page`,
          detail:
            "Visitors can only use app forms that are on one of your pages.",
          page: home,
          kind: "forms",
          target: { app: { tab: "forms", id: form.id } },
        });
  }
  const appPaying = (project.app?.forms ?? []).filter((f) => f.payment);
  if (appPaying.length && !usablePayments(project.payments))
    issues.push({
      id: "app-payments-missing",
      title: "Add a way to get paid",
      detail: `${appPaying.map((f) => `“${f.name}”`).join(", ")} ${appPaying.length === 1 ? "asks" : "ask"} visitors to pay, but Settings → Get paid has no UPI ID, online checkout, payment link or bank details, so they won’t see how.`,
      page: project.pages[0].id,
      kind: "forms",
      target: "payments",
    });
  const paying = (project.collections ?? []).filter(
    (c) => c.request?.collect && canCollect(c.request.kind),
  );
  if (paying.length && !usablePayments(project.payments))
    issues.push({
      id: "payments-missing",
      title: "Add a way to get paid",
      detail: `${paying.map((c) => c.name).join(", ")} ask visitors to pay, but Settings → Get paid has no card payments, UPI ID, payment link, bank details or in-person option.`,
      page: project.pages[0].id,
      kind: "forms",
      target: "payments",
    });
  else if (
    usablePayments(project.payments)?.upi &&
    paying.some((c) => !isRupee(c.currency))
  )
    issues.push({
      id: "payments-currency",
      title: "UPI payments are in rupees",
      detail: `Set the currency to ₹ for ${paying
        .filter((c) => !isRupee(c.currency))
        .map((c) => c.name)
        .join(
          ", ",
        )} so UPI apps fill in the amount, or use a payment link for other currencies.`,
      page: project.pages[0].id,
      kind: "forms",
      target: "payments",
    });
  if (project.payments && paying.length) {
    const problems = Object.values(paymentProblems(project.payments));
    if (problems.length)
      issues.push({
        id: "payments-invalid",
        title: "Fix your payment details",
        detail: `${problems.join(" ")} Visitors won’t see that option until it’s fixed.`,
        page: project.pages[0].id,
        kind: "forms",
        target: "payments",
      });
  }
  return issues;
}
