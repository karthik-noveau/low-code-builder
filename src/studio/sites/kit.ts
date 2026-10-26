/**
 * Building blocks for the site templates: sections with sensible defaults,
 * pages, app form sections and collection lists.
 */
import {
  uid,
  type Item,
  type Section,
  type SectionType,
  type Page,
  type Project,
  sectionMeta,
  createBlock,
  type Block,
} from "../model";
import type { Collection } from "../collections";
import type { App, AppForm } from "../../apps/model";

export const item = (
  title: string,
  body = "",
  image = "",
  price = "",
  url = "",
): Item => ({ id: uid(), title, body, image, price, url });
export function createSection(
  type: SectionType,
  overrides: Partial<Section> = {},
): Section {
  const base: Section = {
    id: uid(),
    type,
    name: sectionMeta[type].label,
    title: "A little something extraordinary.",
    eyebrow: "MADE WITH PURPOSE",
    body: "Thoughtful details. Lasting impressions. Make room for the things that matter.",
    buttonLabel: "",
    buttonUrl: "#",
    image: "",
    imageAlt: "",
    background: "",
    color: "",
    align: "left",
    layout: "cover",
    padding: 64,
    height: 480,
    overlay: 25,
    hidden: false,
    items: [],
    formAction: "",
  };
  const defaults: Partial<Record<SectionType, Partial<Section>>> = {
    announcement: {
      title: "A little green goes a long way. Find your perfect plant →",
      background: "#294b3b",
      color: "#ffffff",
      padding: 10,
      align: "center",
      buttonUrl: "/collection",
    },
    header: {
      title: "botanical",
      padding: 24,
      buttonLabel: "Explore the collection",
      buttonUrl: "/collection",
    },
    hero: {
      name: "Image banner",
      title: "Good things\ntake root.",
      eyebrow: "A GREENER EVERYDAY",
      body: "Bring a little outside in. Thoughtfully grown plants,\nfor a home that feels more like you.",
      image: "/images/botanical.jpg",
      imageAlt: "Lush green leaves in natural light",
      color: "#ffffff",
      buttonLabel: "Find your green",
      buttonUrl: "/collection",
      height: 490,
      overlay: 36,
    },
    products: {
      title: "Meet your new roommates.",
      eyebrow: "GROW YOUR HAPPY PLACE",
      body: "A few of our favorites. Soon to be yours.",
      buttonLabel: "Shop all plants",
      buttonUrl: "/collection",
      items: [
        item(
          "The everyday succulent",
          "Small plant, big personality",
          "/images/plant-1.jpg",
          "$24",
          "/contact",
        ),
        item(
          "The desert collection",
          "A little wild at heart",
          "/images/plant-2.jpg",
          "$32",
          "/contact",
        ),
        item(
          "The rubber plant",
          "A fresh start for any space",
          "/images/plant-3.jpg",
          "$38",
          "/contact",
        ),
      ],
    },
    features: {
      title: "",
      eyebrow: "",
      body: "",
      padding: 28,
      background: "#f2f3ed",
      items: [
        item("Grown with care", "Happy, healthy plants. Always."),
        item("Delivered to your door", "A little green, a little closer."),
        item("Here to help you grow", "Plant people, just a message away."),
      ],
    },
    imageText: {
      title: "Rooted in something good.",
      eyebrow: "OUR STORY",
      body: "We believe a greener space is a happier space. What started with a windowsill and a few cuttings has grown into a community of people who find joy in the everyday.\n\nEvery plant has a story. Let’s start yours.",
      image: "/images/garden.jpg",
      imageAlt: "Gardening tools ready for planting",
      buttonLabel: "A little about us",
      buttonUrl: "/our-story",
      background: "#f2f3ed",
    },
    gallery: {
      title: "A few things we’ve made.",
      eyebrow: "SELECTED WORK",
      body: "Good ideas, brought to life.",
      items: [
        item("Living spaces", "Interior design", "/images/interior.jpg"),
        item("New perspectives", "Architecture", "/images/architecture.jpg"),
        item("Slow living", "Art direction", "/images/botanical.jpg"),
      ],
    },
    testimonials: {
      title: "Nice words. Happy people.",
      eyebrow: "FROM OUR COMMUNITY",
      body: "",
      background: "#f2f3ed",
      items: [
        item(
          "Alex M.",
          "“Beautiful from the moment it arrived. My home feels a little more alive.”",
        ),
        item(
          "Jamie R.",
          "“The care and attention to detail make all the difference. Couldn’t be happier.”",
        ),
        item(
          "Morgan S.",
          "“Exactly what I was looking for. I’ve already told everyone I know.”",
        ),
      ],
    },
    faq: {
      title: "A little more to know.",
      eyebrow: "GOOD QUESTIONS",
      body: "",
      items: [
        item(
          "How do I get started?",
          "Explore our collection and find what feels right for you. Our team is always here to help.",
        ),
        item(
          "Can you help me choose?",
          "Of course. Get in touch and tell us a little about what you’re looking for.",
        ),
        item(
          "Where can I learn more?",
          "Visit our story page, or send us a message. We’d love to hear from you.",
        ),
      ],
    },
    text: {
      title: "Make yourself at home.",
      body: "This is your space to share what makes you different. Tell your story, introduce an idea, or let your visitors get to know you a little better.",
      align: "center",
    },
    contact: {
      title: "Let’s start a conversation.",
      eyebrow: "SAY HELLO",
      body: "Have a question, an idea, or just want to say hi?\nWe’d love to hear from you.",
      buttonLabel: "Send message",
    },
    newsletter: {
      title: "A little green in your inbox.",
      eyebrow: "STAY IN THE GROW",
      body: "Fresh arrivals, plant care tips, and good things to come.",
      background: "#e7ecdf",
      buttonLabel: "Count me in",
      align: "center",
    },
    footer: {
      title: "botanical",
      body: "Good things take root.",
      padding: 40,
      background: "#213e32",
      color: "#ffffff",
    },
    cta: {
      title: "Something good starts here.",
      eyebrow: "YOUR NEXT CHAPTER",
      buttonLabel: "Let’s talk",
      buttonUrl: "/contact",
      align: "center",
      background: "#294b3b",
      color: "#ffffff",
    },
    custom: {
      align: "center",
      width: "normal",
      animation: "rise",
      blocks: [
        { ...createBlock("heading"), text: "Your story, your layout." },
        {
          ...createBlock("text"),
          text: "Mix headings, text, images, and buttons. Add columns to place them side by side.",
        },
        withChildren(createBlock("columns"), [
          [
            { ...createBlock("heading"), text: "Crafted", size: "sm" },
            { ...createBlock("text"), text: "Every detail chosen with care." },
          ],
          [
            { ...createBlock("heading"), text: "Considered", size: "sm" },
            { ...createBlock("text"), text: "Built to be enjoyed for years." },
          ],
          [
            { ...createBlock("heading"), text: "Yours", size: "sm" },
            { ...createBlock("text"), text: "Made to fit the way you live." },
          ],
        ]),
        { ...createBlock("button"), text: "Get in touch", url: "/contact" },
      ],
    },
  };
  return { ...base, ...defaults[type], ...overrides };
}
function withChildren(columns: Block, content: Block[][]): Block {
  return {
    ...columns,
    children: content.map((children) => ({
      ...createBlock("column"),
      children,
    })),
  };
}

export const page = (
  name: string,
  slug: string,
  description: string,
  sections: Section[],
  brand: string,
): Page => ({
  id: uid(),
  name,
  slug,
  title: `${name} — ${brand}`,
  description,
  sections,
});
/** An app form on a page; its heading and intro come from the form itself. */
export const appSection = (
  form: AppForm,
  overrides: Partial<Section> = {},
): Section =>
  createSection("app", {
    name: form.title,
    title: form.title,
    eyebrow: "",
    body: "",
    padding: form.kind === "lookup" ? 48 : 64,
    appForm: form.id,
    ...overrides,
  });
/** A list of a collection's items (cards link to item pages). */
export const listing = (
  collection: Collection,
  overrides: Partial<Section> & {
    columns?: number;
    limit?: number;
    style?: "grid" | "list";
  } = {},
): Section => {
  const { columns = 3, limit = 0, style = "grid", ...rest } = overrides;
  return createSection("collection", {
    name: collection.name,
    title: collection.name,
    eyebrow: "",
    body: "",
    listing: { collection: collection.id, style, columns, limit },
    ...rest,
  });
};
/** Everything a site template decides; createProject adds the rest. */
export interface SiteParts {
  header: Section[];
  footer: Section[];
  pages: Page[];
  theme: Project["theme"];
  collections?: Collection[];
  app?: App;
}
/** The announcement bar, header and footer every business template shares. */
export function chrome(
  brand: string,
  o: {
    announcement: string;
    announcementUrl: string;
    cta: [label: string, url: string];
    tagline: string;
    dark: string;
  },
) {
  return {
    header: [
      createSection("announcement", {
        title: o.announcement,
        eyebrow: "",
        body: "",
        buttonUrl: o.announcementUrl,
        background: o.dark,
        color: "#ffffff",
      }),
      createSection("header", {
        title: brand,
        eyebrow: "",
        body: "",
        buttonLabel: o.cta[0],
        buttonUrl: o.cta[1],
      }),
    ],
    footer: [
      createSection("footer", {
        title: brand,
        eyebrow: "",
        body: o.tagline,
        background: o.dark,
        color: "#ffffff",
      }),
    ],
  };
}
/**
 * Section makers in a site's colours: `tint` for soft bands, `dark` for the
 * call to action. Every maker sets its own words, so no default copy leaks in.
 */
export function styled(tint: string, dark: string) {
  return {
    features: (list: [string, string][], o: Partial<Section> = {}) =>
      createSection("features", {
        title: "",
        eyebrow: "",
        body: "",
        padding: 28,
        background: tint,
        items: list.map(([t, b]) => item(t, b)),
        ...o,
      }),
    quotes: (
      title: string,
      list: [string, string][],
      o: Partial<Section> = {},
    ) =>
      createSection("testimonials", {
        title,
        eyebrow: "FROM OUR CUSTOMERS",
        body: "",
        background: tint,
        items: list.map(([name, quote]) => item(name, `“${quote}”`)),
        ...o,
      }),
    faq: (title: string, qa: [string, string][], o: Partial<Section> = {}) =>
      createSection("faq", {
        title,
        eyebrow: "GOOD QUESTIONS",
        body: "",
        items: qa.map(([q, a]) => item(q, a)),
        ...o,
      }),
    story: (
      o: Pick<Section, "eyebrow" | "title" | "body" | "image" | "imageAlt"> &
        Partial<Section>,
    ) =>
      createSection("imageText", {
        background: tint,
        buttonLabel: "",
        buttonUrl: "/",
        ...o,
      }),
    cta: (
      eyebrow: string,
      title: string,
      body: string,
      button: [label: string, url: string],
      o: Partial<Section> = {},
    ) =>
      createSection("cta", {
        eyebrow,
        title,
        body,
        buttonLabel: button[0],
        buttonUrl: button[1],
        background: dark,
        color: "#ffffff",
        ...o,
      }),
    newsletter: (
      eyebrow: string,
      title: string,
      body: string,
      button: string,
      o: Partial<Section> = {},
    ) =>
      createSection("newsletter", {
        eyebrow,
        title,
        body,
        buttonLabel: button,
        background: tint,
        ...o,
      }),
    intro: (
      eyebrow: string,
      title: string,
      body: string,
      o: Partial<Section> = {},
    ) =>
      createSection("text", {
        eyebrow,
        title,
        body,
        align: "center",
        padding: 56,
        ...o,
      }),
    contact: (title: string, body: string, o: Partial<Section> = {}) =>
      createSection("contact", {
        title,
        eyebrow: "SAY HELLO",
        body,
        buttonLabel: "Send message",
        ...o,
      }),
  };
}
