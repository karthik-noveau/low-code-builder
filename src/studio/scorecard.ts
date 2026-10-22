import { renderPage } from "./export";
import { sectionImages, type Page, type Project } from "./model";

/**
 * Search and speed scores for "Review site". Each page is rendered the way it
 * is published and checked for what search engines and phones care about.
 * A score is the share of checks that pass, so every point is explainable.
 */
export interface ScoreCheck {
  id: string;
  category: "seo" | "speed";
  title: string;
  detail: string;
  page: string;
  section?: string;
  pass: boolean;
  /** Which inspector field fixes it, if one does. */
  field?: "Page title" | "Meta description" | "Image description";
}
export interface Scorecard {
  seo: number;
  speed: number;
  checks: ScoreCheck[];
}

const TITLE = [10, 60] as const;
const DESCRIPTION = [50, 160] as const;
/** Uploaded images above this are worth compressing before visitors download them. */
const IMAGE_BYTES = 400 * 1024;
const PAGE_BYTES = 150 * 1024;
const MAX_IMAGES = 24;
const MAX_SECTIONS = 18;
const MAX_ANIMATED = 6;

/** Bytes behind a data: URL, or 0 for linked images. */
export function inlineImageBytes(src: string) {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(src);
  return match ? Math.floor((match[1].length * 3) / 4) : 0;
}
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
const withoutInlineImages = (html: string) =>
  html.replace(/data:image\/[^"')\s]+/g, "");

export function scoreProject(project: Project): Scorecard {
  const checks: ScoreCheck[] = [];
  const add = (check: ScoreCheck) => checks.push(check);
  const titles = new Map<string, Page[]>();
  for (const page of project.pages) {
    const key = page.title.trim().toLowerCase();
    if (key) titles.set(key, [...(titles.get(key) ?? []), page]);
  }
  for (const page of project.pages) {
    const sections = [
      ...project.header,
      ...page.sections,
      ...project.footer,
    ].filter((s) => !s.hidden);
    const title = page.title.trim();
    const description = page.description.trim();
    add({
      id: `seo-title-${page.id}`,
      category: "seo",
      page: page.id,
      field: "Page title",
      pass: title.length >= TITLE[0] && title.length <= TITLE[1],
      title: !title
        ? `Give ${page.name} a search title`
        : title.length < TITLE[0]
          ? `Make the title of ${page.name} more descriptive`
          : `Shorten the title of ${page.name}`,
      detail: !title
        ? "Search results show this title. Name what the page offers, then your business."
        : `It has ${title.length} characters. ${TITLE[0]}–${TITLE[1]} show in full on Google.`,
    });
    add({
      id: `seo-description-${page.id}`,
      category: "seo",
      page: page.id,
      field: "Meta description",
      pass:
        description.length >= DESCRIPTION[0] &&
        description.length <= DESCRIPTION[1],
      title: !description
        ? `Describe ${page.name} for search results`
        : description.length < DESCRIPTION[0]
          ? `Say a little more about ${page.name}`
          : `Shorten the description of ${page.name}`,
      detail: !description
        ? "This is the sentence under your link on Google. Without it, search engines pick text from the page."
        : `It has ${description.length} characters. ${DESCRIPTION[0]}–${DESCRIPTION[1]} read best in results.`,
    });
    const twins = titles.get(title.toLowerCase()) ?? [];
    if (project.pages.length > 1)
      add({
        id: `seo-unique-${page.id}`,
        category: "seo",
        page: page.id,
        field: "Page title",
        pass: !title || twins.length < 2,
        title: `${page.name} shares its title with ${twins
          .filter((p) => p.id !== page.id)
          .map((p) => p.name)
          .join(", ")}`,
        detail:
          "Pages with the same title compete with each other in search. Give each one its own.",
      });
    const html = renderPage(project, page);
    const headings = (html.match(/<h1[\s>]/g) ?? []).length;
    add({
      id: `seo-heading-${page.id}`,
      category: "seo",
      page: page.id,
      pass: headings === 1,
      title: headings
        ? `${page.name} has ${headings} main headings`
        : `Give ${page.name} a main heading`,
      detail: headings
        ? "One main heading tells search engines what the page is about. Keep the biggest title in the first section and make the rest smaller."
        : "Start the page with a hero or heading section so it has one clear main title.",
    });
    const images = sections.flatMap((s) =>
      sectionImages(s).map((src) => ({ src, section: s })),
    );
    const heavy = images
      .map((image) => ({ ...image, bytes: inlineImageBytes(image.src) }))
      .filter((image) => image.bytes > IMAGE_BYTES);
    add({
      id: `speed-images-${page.id}`,
      category: "speed",
      page: page.id,
      section: heavy[0]?.section.id,
      field: "Image description",
      pass: !heavy.length,
      title: `Use a smaller image in ${heavy[0]?.section.name ?? page.name}`,
      detail: `${heavy.length === 1 ? "An image" : `${heavy.length} images`} on ${page.name} ${heavy.length === 1 ? "is" : "are"} ${kb(Math.max(0, ...heavy.map((h) => h.bytes)))}${heavy.length === 1 ? "" : " or more"}. Upload it again: Forma resizes new uploads, which loads much faster on phones.`,
    });
    add({
      id: `speed-count-${page.id}`,
      category: "speed",
      page: page.id,
      pass: images.length <= MAX_IMAGES,
      title: `${page.name} loads ${images.length} images`,
      detail: `Pages with more than ${MAX_IMAGES} images feel slow on mobile data. Move some to their own page or a collection.`,
    });
    const bytes = new TextEncoder().encode(withoutInlineImages(html)).length;
    add({
      id: `speed-weight-${page.id}`,
      category: "speed",
      page: page.id,
      pass: bytes <= PAGE_BYTES,
      title: `${page.name} is a heavy page`,
      detail: `Its markup is ${kb(bytes)}. Under ${kb(PAGE_BYTES)} opens quickly; split long lists or pages.`,
    });
    add({
      id: `speed-length-${page.id}`,
      category: "speed",
      page: page.id,
      pass: page.sections.filter((s) => !s.hidden).length <= MAX_SECTIONS,
      title: `${page.name} has a lot of sections`,
      detail: `More than ${MAX_SECTIONS} sections make visitors scroll a long way and slow the first view. Move some to a new page.`,
    });
    const animated = sections.filter(
      (s) => s.animation && s.animation !== "none",
    );
    add({
      id: `speed-motion-${page.id}`,
      category: "speed",
      page: page.id,
      section: animated[0]?.id,
      pass: animated.length <= MAX_ANIMATED,
      title: `${animated.length} sections animate on ${page.name}`,
      detail: `Keep entrance animations to ${MAX_ANIMATED} or fewer so scrolling stays smooth on older phones.`,
    });
  }
  const score = (category: ScoreCheck["category"]) => {
    const list = checks.filter((c) => c.category === category);
    return list.length
      ? Math.round((100 * list.filter((c) => c.pass).length) / list.length)
      : 100;
  };
  return { seo: score("seo"), speed: score("speed"), checks };
}
