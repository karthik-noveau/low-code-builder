import {
  uid,
  type Item,
  type Section,
  type SectionType,
  type Project,
  type TemplateId,
  type Page,
  sectionMeta,
  createBlock,
  type Block,
} from "./model";

const item = (
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
const page = (
  name: string,
  slug: string,
  sections: Section[],
  brand: string,
): Page => ({
  id: uid(),
  name,
  slug,
  title: `${name} — ${brand}`,
  description: `Discover ${brand}. Thoughtfully made, just for you.`,
  sections,
});
export const templateOptions: {
  id: TemplateId;
  name: string;
  category: string;
  description: string;
  image: string;
  color: string;
}[] = [
  {
    id: "botanical",
    name: "Botanical",
    category: "Online store",
    description: "An organic, editorial home for things worth discovering.",
    image: "/images/botanical.jpg",
    color: "#294b3b",
  },
  {
    id: "folio",
    name: "Forma Studio",
    category: "Portfolio",
    description: "Let your work speak. Clean lines, generous space.",
    image: "/images/architecture.jpg",
    color: "#2f3439",
  },
  {
    id: "studio",
    name: "Common Ground",
    category: "Business",
    description: "A thoughtful first impression for your next big thing.",
    image: "/images/interior.jpg",
    color: "#68533d",
  },
  {
    id: "table",
    name: "Sunday Table",
    category: "Restaurant",
    description: "A warm welcome, before they even walk through the door.",
    image: "/images/restaurant.jpg",
    color: "#843d2b",
  },
  {
    id: "blank",
    name: "A blank canvas",
    category: "Start fresh",
    description: "Your idea. Your direction. Build something entirely yours.",
    image: "",
    color: "#526954",
  },
];
export function createProject(template: TemplateId = "botanical"): Project {
  const option = templateOptions.find((t) => t.id === template)!;
  const name =
    template === "botanical"
      ? "Botanical"
      : template === "blank"
        ? "Untitled site"
        : option.name;
  const header = [
    createSection("announcement"),
    createSection("header", { title: name.toLowerCase() }),
  ];
  const footer = [createSection("footer", { title: name.toLowerCase() })];
  let pages: Page[];
  if (template === "botanical") {
    pages = [
      page(
        "Home",
        "",
        [
          createSection("hero"),
          createSection("features"),
          createSection("products"),
          createSection("imageText"),
          createSection("testimonials"),
          createSection("newsletter"),
        ],
        name,
      ),
      page(
        "Collection",
        "collection",
        [
          createSection("text", {
            title: "Find your kind of green.",
            eyebrow: "THE COLLECTION",
            body: "From your first plant to your urban jungle. There’s something here for every space.",
          }),
          createSection("products", { buttonLabel: "" }),
          createSection("faq"),
        ],
        name,
      ),
      page(
        "Our story",
        "our-story",
        [
          createSection("imageText"),
          createSection("text", {
            title: "Small beginnings. Growing possibilities.",
          }),
          createSection("gallery", { title: "Life, a little greener." }),
        ],
        name,
      ),
      page(
        "Contact",
        "contact",
        [createSection("contact"), createSection("faq")],
        name,
      ),
    ];
  } else {
    header[0] = createSection("announcement", {
      title:
        template === "table"
          ? "Seasonal plates. Good company. A place at our table."
          : "Independent minds. Thoughtful work. A fresh perspective.",
      hidden: template !== "table",
      buttonUrl: "/contact",
    });
    header[1] = createSection("header", {
      title: name,
      buttonLabel: "Get in touch",
      buttonUrl: "/contact",
    });
    footer[0] = createSection("footer", {
      title: name,
      body: "Made with care. Made for you.",
      background: option.color,
    });
    const hero = createSection("hero", {
      image: option.image,
      imageAlt: `${option.category} cover photograph`,
      title:
        template === "folio"
          ? "Considered spaces.\nLasting impressions."
          : template === "table"
            ? "Good food.\nBetter company."
            : "Big ideas.\nThoughtful spaces.",
      eyebrow:
        template === "folio"
          ? "INDEPENDENT DESIGN STUDIO"
          : template === "table"
            ? "SEASONAL · LOCAL · ALWAYS WELCOME"
            : "MAKE ROOM FOR POSSIBILITY",
      body:
        template === "table"
          ? "Seasonal ingredients, a familiar table, and a reason to stay a little longer."
          : "We bring clarity, craft, and a fresh perspective to the things that matter.",
      buttonLabel:
        template === "table" ? "Explore the menu" : "Explore our work",
      buttonUrl: "/explore",
    });
    pages = [
      page(
        "Home",
        "",
        template === "blank"
          ? []
          : [
              hero,
              createSection("features", {
                items:
                  template === "table"
                    ? [
                        item(
                          "Fresh from the season",
                          "Local ingredients, simply prepared.",
                        ),
                        item(
                          "A seat for everyone",
                          "Come as you are. Stay a little longer.",
                        ),
                        item(
                          "Made with a little love",
                          "Good food brings us together.",
                        ),
                      ]
                    : [
                        item(
                          "A considered approach",
                          "Every detail has a purpose.",
                        ),
                        item(
                          "Better, together",
                          "A collaborative process, from day one.",
                        ),
                        item(
                          "Built to last",
                          "Thoughtful work that stands the test of time.",
                        ),
                      ],
              }),
              createSection("gallery", {
                title:
                  template === "table"
                    ? "Fresh from our kitchen."
                    : "A selection of our work.",
                items:
                  template === "table"
                    ? [
                        item(
                          "Seasonal favorites",
                          "A taste of what’s fresh",
                          "/images/restaurant.jpg",
                        ),
                        item(
                          "From the garden",
                          "Bright, simple, delicious",
                          "/images/salad.jpg",
                        ),
                        item(
                          "Made for sharing",
                          "Something for the whole table",
                          "/images/dish.jpg",
                        ),
                      ]
                    : createSection("gallery").items,
              }),
              createSection("imageText", {
                image: option.image,
                title: "A thoughtful approach.",
                body: "We care about the details. About the people we work with. And about making something that lasts.",
                buttonUrl: "/about",
              }),
              createSection("cta"),
            ],
        name,
      ),
      page(
        template === "table" ? "Menu" : "Our work",
        "explore",
        [
          createSection(template === "table" ? "products" : "gallery", {
            title:
              template === "table"
                ? "A taste of the season."
                : "Work with a point of view.",
            items:
              template === "table"
                ? [
                    item(
                      "Market salad",
                      "Seasonal leaves, citrus, house dressing",
                      "/images/restaurant.jpg",
                      "$16",
                    ),
                    item(
                      "From the garden",
                      "Roasted vegetables, fresh herbs",
                      "/images/salad.jpg",
                      "$22",
                    ),
                    item(
                      "Sunday special",
                      "Ask us what’s fresh today",
                      "/images/dish.jpg",
                      "$28",
                    ),
                  ]
                : createSection("gallery").items,
            buttonLabel: "",
          }),
        ],
        name,
      ),
      page(
        "About",
        "about",
        [
          createSection("imageText", {
            image: option.image,
            title: "People. Purpose. Possibility.",
            body: "We’re a small team with a shared belief: the best things happen when you care deeply about what you do.",
            buttonUrl: "/contact",
            buttonLabel: "Meet us",
          }),
        ],
        name,
      ),
      page("Contact", "contact", [createSection("contact")], name),
    ];
  }
  if (template === "blank") {
    pages = [page("Home", "", [], name)];
    header[0].buttonUrl = "/";
    header[1].buttonLabel = "";
    header[1].buttonUrl = "/";
  }
  return {
    version: 1,
    name,
    template,
    header,
    footer,
    pages,
    assets: [],
    theme: {
      accent: option.color,
      background: "#fcfcf9",
      color: "#25352b",
      font: "editorial",
      radius: 2,
    },
  };
}
