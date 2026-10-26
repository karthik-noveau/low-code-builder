/**
 * Prebuilt sections: ready-made block trees owners insert from the Add panel
 * and then change freely. Each `build` returns a fresh `section` node (new
 * ids every call), using theme tokens for colour so it fits any site, light
 * or dark. Images come from /images (the bundled stock set).
 */
import type { Project } from "../studio/model";
import { createNode } from "./registry";
import type { Node, NodeType, Props, Style } from "./model";
import { DATA_PRESETS } from "./data/presets";
import { FORM_PRESETS } from "./forms/presets";

export type PresetCategory =
  | "header"
  | "hero"
  | "features"
  | "content"
  | "stats"
  | "pricing"
  | "testimonials"
  | "team"
  | "gallery"
  | "logos"
  | "faq"
  | "cta"
  | "contact"
  | "forms"
  | "data"
  | "footer";
export const PRESET_CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: "header", label: "Headers" },
  { id: "hero", label: "Heroes" },
  { id: "features", label: "Features" },
  { id: "content", label: "Text & media" },
  { id: "stats", label: "Numbers" },
  { id: "pricing", label: "Pricing" },
  { id: "testimonials", label: "Testimonials" },
  { id: "team", label: "Team" },
  { id: "gallery", label: "Gallery" },
  { id: "logos", label: "Logos" },
  { id: "faq", label: "Questions" },
  { id: "cta", label: "Call to action" },
  { id: "contact", label: "Contact" },
  { id: "forms", label: "Forms" },
  { id: "data", label: "Lists and live data" },
  { id: "footer", label: "Footers" },
];
export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  /** One line for the Add panel. */
  description: string;
  build: (ctx: { project: Project }) => Node;
}

/** A block with props, style and children in one call. */
export function n(
  type: NodeType,
  props: Props = {},
  style?: Style,
  children?: Node[],
): Node {
  const node = createNode(type, props);
  if (style) node.style = { ...node.style, ...style };
  if (children) node.children = children;
  return node;
}
/** Adds tablet and phone overrides to a block. */
function at(node: Node, tablet?: Style, mobile?: Style): Node {
  if (tablet) node.tablet = tablet;
  if (mobile) node.mobile = mobile;
  return node;
}

// Shorthands for the blocks presets use most.
const section = (style: Style, children: Node[], props: Props = {}) =>
  n("section", props, style, children);
const heading = (text: string, level = "2", style?: Style) =>
  n("heading", { text, level }, style);
const text = (value: string, variant = "body", style?: Style) =>
  n("text", { text: value, variant }, style);
const button = (
  label: string,
  url = "",
  variant = "primary",
  extra: Props = {},
  style?: Style,
) => n("button", { label, url, variant, ...extra }, style);
const image = (file: string, alt: string, ratio = "4/3", style?: Style) =>
  n("image", { src: `/images/${file}`, alt, ratio }, style);
const box = (
  variant: string,
  style: Style,
  children: Node[],
  props: Props = {},
) => n("box", { variant, ...props }, style, children);
const row = (style: Style, children: Node[]) => n("row", {}, style, children);
const grid = (columns: number, children: Node[], style: Style = {}) =>
  n("grid", {}, { columns, ...style }, children);
const icon = (name: string, variant = "tile", size = 22) =>
  n("icon", { icon: name, variant, size });
const columns = (
  cols: Node[][],
  style: Style = {},
  props: Props = {},
  columnStyles: Style[] = [],
) =>
  n(
    "columns",
    props,
    style,
    cols.map((c, i) => n("column", {}, { gap: 16, ...columnStyles[i] }, c)),
  );
const list = (items: string[], marker = "check", style?: Style) =>
  n("list", { items, marker }, style);

/** An eyebrow, a title and a lead line that open a section. */
function intro(
  eyebrow: string,
  title: string,
  lead: string,
  align: "center" | "left" = "center",
): Node {
  return box(
    "plain",
    { gap: 14, maxWidth: align === "center" ? 720 : 640, textAlign: align },
    [
      ...(eyebrow ? [text(eyebrow, "eyebrow")] : []),
      heading(title),
      ...(lead ? [text(lead, "lead")] : []),
    ],
  );
}
/** Standard section spacing, a little tighter on phones. */
const band = (top = 88): Style => ({ padding: [top, 24, top, 24], gap: 48 });
const bandPhone = (top = 64): Style => ({
  padding: [top, 18, top, 18],
  gap: 32,
});

/** A round badge of initials, standing in for a photo. */
const avatar = (initials: string, size = 44) =>
  box(
    "plain",
    {
      width: size,
      height: size,
      radius: "full",
      background: "accent",
      color: "accentText",
      align: "center",
      justify: "center",
      fontSize: size > 60 ? "xl" : "sm",
      fontWeight: 700,
      gap: 0,
    },
    [text(initials, "body", { lineHeight: 1 })],
  );
/** A person: avatar, name and a second line. */
const person = (initials: string, name: string, role: string) =>
  row({ gap: 12, wrap: false }, [
    avatar(initials),
    box("plain", { gap: 0 }, [
      text(name, "body", { fontWeight: 600 }),
      text(role, "small", { color: "muted" }),
    ]),
  ]);
const stars = () =>
  text("★★★★★", "body", { color: "accent", letterSpacing: 2, fontSize: "lg" });

const WHATSAPP = "https://wa.me/919800000000";
const PHONE = "tel:+919800000000";
const EMAIL = "mailto:hello@example.com";
const ADDRESS = "12 MG Road, Bengaluru 560001";
const SOCIAL = [
  "Instagram | https://instagram.com/",
  "Facebook | https://facebook.com/",
  "YouTube | https://youtube.com/",
  `WhatsApp | ${WHATSAPP}`,
];

export const PRESETS: Preset[] = [
  // Headers
  {
    id: "header-simple",
    name: "Logo and menu",
    category: "header",
    description: "Your logo on the left, page links and a button on the right",
    build: ({ project }) =>
      section(
        { padding: [16, 24, 16, 24], contentWidth: "wide" },
        [
          row({ justify: "between", gap: 16, wrap: false }, [
            n("logo", { text: project.name }),
            row({ gap: 8, wrap: false }, [
              n("menu"),
              button("Contact us", "/contact", "primary", { size: "sm" }),
            ]),
          ]),
        ],
        { tag: "header", sticky: true },
      ),
  },
  {
    id: "header-centered",
    name: "Centred logo",
    category: "header",
    description: "Your name centred with a short line, the menu underneath",
    build: ({ project }) =>
      at(
        section(
          { padding: [22, 24, 10, 24], gap: 10, align: "center" },
          [
            n("logo", { text: project.name, tagline: "Since 2012" }),
            n("menu", { variant: "underline" }),
          ],
          { tag: "header" },
        ),
        undefined,
        { padding: [14, 18, 14, 18], direction: "row", justify: "between" },
      ),
  },
  {
    id: "header-theme",
    name: "Menu with dark mode",
    category: "header",
    description: "Logo, menu, a light/dark switch and a button",
    build: ({ project }) =>
      section(
        { padding: [14, 24, 14, 24], contentWidth: "wide" },
        [
          row({ justify: "between", gap: 16, wrap: false }, [
            n("logo", { text: project.name, image: "bolt", dot: false }),
            row({ gap: 6, wrap: false }, [
              n("menu", { variant: "pill" }),
              n("themeToggle"),
            ]),
          ]),
        ],
        { tag: "header", sticky: true },
      ),
  },
  {
    id: "header-shop",
    name: "Shop header",
    category: "header",
    description: "Two-line name, a pill menu and an order-on-WhatsApp button",
    build: ({ project }) =>
      section(
        { padding: [14, 24, 14, 24], contentWidth: "wide" },
        [
          row({ justify: "between", gap: 16, wrap: false }, [
            n("logo", { text: project.name, tagline: "Fresh every day" }),
            at(
              box(
                "plain",
                {
                  padding: [4, 4, 4, 4],
                  radius: "full",
                  background: "surface",
                  borderWidth: 1,
                },
                [n("menu", { variant: "pill" })],
              ),
              {
                padding: [0, 0, 0, 0],
                background: "background",
                borderWidth: 0,
              },
            ),
            row({ gap: 8, wrap: false }, [
              button("Order", WHATSAPP, "primary", {
                size: "sm",
                icon: "send",
                newTab: true,
              }),
            ]),
          ]),
        ],
        { tag: "header", sticky: true },
      ),
  },

  // Heroes
  {
    id: "hero-centered",
    name: "Centred hero",
    category: "hero",
    description: "A badge, a big headline with accent words and two buttons",
    build: () =>
      at(
        section({ padding: [120, 24, 120, 24], gap: 24, textAlign: "center" }, [
          n("badge", { text: "New this season", icon: "sparkles" }),
          heading("Everything your customers need, *in one place*", "1", {
            maxWidth: 860,
          }),
          text(
            "Say in one sentence what you do, who it is for and why people choose you over anyone else.",
            "lead",
            { maxWidth: 600 },
          ),
          row({ justify: "center", gap: 12, margin: [8, 0, 0, 0] }, [
            button("Get started", "/contact", "primary", {
              size: "lg",
              icon: "arrow",
            }),
            button("See our work", "", "secondary", { size: "lg" }),
          ]),
          text("★ 4.9 on Google  ·  2,000+ happy customers", "small", {
            color: "muted",
          }),
        ]),
        undefined,
        { padding: [80, 18, 80, 18], gap: 20 },
      ),
  },
  {
    id: "hero-split",
    name: "Split hero with image",
    category: "hero",
    description: "Headline and buttons beside a large photo",
    build: () =>
      at(
        section({ padding: [80, 24, 80, 24] }, [
          columns(
            [
              [
                text("Open 7 days a week", "eyebrow"),
                at(
                  heading("Beautiful spaces, *made simple*", "1", {
                    fontSize: "60",
                  }),
                  { fontSize: "48" },
                  { fontSize: "36" },
                ),
                text(
                  "Tell visitors what you offer and what makes it special. Keep it short and friendly.",
                  "lead",
                ),
                row({ gap: 12, margin: [8, 0, 8, 0] }, [
                  button("Book a visit", "/contact", "primary", { size: "lg" }),
                  button("View services", "", "link", { size: "lg" }),
                ]),
                list(
                  ["Free consultation", "Trusted by 500+ families"],
                  "check",
                  {
                    direction: "row",
                    wrap: true,
                    gap: 20,
                  },
                ),
              ],
              [
                image(
                  "interior.jpg",
                  "A bright, minimal room with a desk and chair",
                  "1/1",
                  { shadow: "lg" },
                ),
              ],
            ],
            { gap: 64, align: "center" },
          ),
        ]),
        { padding: [56, 24, 64, 24] },
        { padding: [40, 18, 56, 18] },
      ),
  },
  {
    id: "hero-image",
    name: "Hero on a photo",
    category: "hero",
    description: "White text over a full-width photo with a dark overlay",
    build: () =>
      at(
        section(
          {
            padding: [168, 24, 168, 24],
            backgroundImage: "/images/restaurant.jpg",
            overlay: 62,
          },
          [
            box("plain", { gap: 20, maxWidth: 640 }, [
              n("badge", { text: "Now taking reservations", variant: "solid" }),
              heading("Food worth *gathering* for", "1"),
              text(
                "Seasonal dishes, warm service and a table that is always ready for one more.",
                "lead",
              ),
              row({ gap: 12, margin: [8, 0, 0, 0] }, [
                button("Reserve a table", "/contact", "primary", {
                  size: "lg",
                }),
                button("See the menu", "", "secondary", { size: "lg" }),
              ]),
            ]),
          ],
          { tone: "dark" },
        ),
        { padding: [128, 24, 128, 24] },
        { padding: [96, 18, 96, 18] },
      ),
  },
  {
    id: "hero-app",
    name: "App-style hero",
    category: "hero",
    description: "Headline and ratings beside a phone-like order card",
    build: () =>
      at(
        section({ padding: [80, 24, 80, 24] }, [
          columns(
            [
              [
                n("badge", { text: "Order online in a minute", icon: "zap" }),
                at(
                  heading("Order, pay and track *in a tap*", "1", {
                    fontSize: "60",
                  }),
                  { fontSize: "48" },
                  { fontSize: "36" },
                ),
                text(
                  "Browse today's menu, pay with UPI and get updates on WhatsApp. No app to install.",
                  "lead",
                ),
                row({ gap: 12, margin: [8, 0, 8, 0] }, [
                  button("Start an order", "/order", "primary", {
                    size: "lg",
                    icon: "arrow",
                  }),
                  button("How it works", "", "ghost", { size: "lg" }),
                ]),
                at(
                  row({ gap: 32, margin: [8, 0, 0, 0] }, [
                    box("plain", { gap: 0 }, [
                      heading("4.8★", "3"),
                      text("Average rating", "small", { color: "muted" }),
                    ]),
                    box("plain", { gap: 0 }, [
                      heading("25 min", "3"),
                      text("Average delivery", "small", { color: "muted" }),
                    ]),
                    box("plain", { gap: 0 }, [
                      heading("10k+", "3"),
                      text("Orders delivered", "small", { color: "muted" }),
                    ]),
                  ]),
                  undefined,
                  { gap: 16, wrap: false, justify: "between" },
                ),
              ],
              [
                box(
                  "card",
                  {
                    width: 360,
                    padding: [14, 14, 20, 14],
                    radius: 32,
                    shadow: "lg",
                    gap: 14,
                  },
                  [
                    image(
                      "dish.jpg",
                      "A plate of grilled paneer with salad and dip",
                      "4/3",
                      { radius: 22 },
                    ),
                    box("plain", { gap: 6, padding: [4, 8, 0, 8] }, [
                      row({ justify: "between", wrap: false }, [
                        heading("Today's special", "4"),
                        n("badge", { text: "In stock" }),
                      ]),
                      text(
                        "Grilled paneer platter with mint dip and fresh salad.",
                        "small",
                        {
                          color: "muted",
                        },
                      ),
                      row(
                        {
                          justify: "between",
                          wrap: false,
                          margin: [10, 0, 0, 0],
                        },
                        [
                          heading("₹249", "3"),
                          button("Add to order", "/order", "primary", {
                            size: "sm",
                            icon: "plus",
                          }),
                        ],
                      ),
                    ]),
                  ],
                ),
              ],
            ],
            { gap: 56, align: "center" },
            {},
            [{}, { align: "center" }],
          ),
        ]),
        { padding: [56, 24, 64, 24] },
        { padding: [40, 18, 56, 18] },
      ),
  },

  // Features
  {
    id: "features-cards",
    name: "Feature cards",
    category: "features",
    description: "Six cards with an icon, a title and a line each",
    build: () =>
      at(
        section(band(), [
          intro(
            "Why choose us",
            "Everything you need, *done well*",
            "A few reasons customers keep coming back. Replace these with what makes you different.",
          ),
          grid(
            3,
            [
              [
                "truck",
                "Fast delivery",
                "Same-day delivery across the city on orders placed before 4 pm.",
              ],
              [
                "heart",
                "Made with care",
                "Every order is checked by hand before it leaves our shop.",
              ],
              [
                "wallet",
                "Fair prices",
                "Clear prices with no hidden charges. Pay by UPI, card or cash.",
              ],
              [
                "phone",
                "Help on WhatsApp",
                "Questions? Message us and a real person replies within minutes.",
              ],
              [
                "leaf",
                "Fresh and local",
                "We work with local makers and suppliers we know by name.",
              ],
              [
                "lock",
                "Safe and secure",
                "Your details stay private and payments are fully protected.",
              ],
            ].map(([i, title, body]) =>
              at(
                box("card", { gap: 12, padding: [28, 28, 28, 28] }, [
                  icon(i),
                  heading(title, "3", { margin: [8, 0, 0, 0], fontSize: "xl" }),
                  text(body, "muted"),
                ]),
                undefined,
                { padding: [22, 22, 22, 22], gap: 8 },
              ),
            ),
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "features-steps",
    name: "Numbered steps",
    category: "features",
    description: "How it works, in four numbered steps",
    build: () =>
      at(
        section(band(), [
          intro(
            "How it works",
            "Up and running in *four simple steps*",
            "",
            "left",
          ),
          grid(
            4,
            [
              [
                "Tell us what you need",
                "Call, message or fill in a short form. It takes two minutes.",
              ],
              [
                "Get a clear quote",
                "We reply the same day with a price and a time that suits you.",
              ],
              [
                "We get to work",
                "Our team arrives on time, with everything needed to finish the job.",
              ],
              [
                "Pay when happy",
                "Check the work, then pay by UPI, card or cash. No advance.",
              ],
            ].map(([title, body], i) =>
              box("plain", { gap: 10 }, [
                n("divider", {}, { margin: [0, 0, 10, 0] }),
                text(String(i + 1).padStart(2, "0"), "body", {
                  color: "accent",
                  fontSize: "2xl",
                  fontWeight: 700,
                  font: "heading",
                }),
                heading(title, "3"),
                text(body, "muted"),
              ]),
            ),
            { gap: 32 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "features-alternating",
    name: "Image and text rows",
    category: "features",
    description: "Two rows of image and text, sides swapped",
    build: () =>
      at(
        section({ ...band(), gap: 80 }, [
          columns(
            [
              [
                image(
                  "salad.jpg",
                  "A colourful bowl of salad with grains and vegetables",
                  "4/3",
                ),
              ],
              [
                text("Fresh ingredients", "eyebrow"),
                heading("Cooked fresh, *every single day*"),
                text(
                  "Explain the first benefit in two or three sentences. What does the customer get, and why does it matter to them?",
                  "lead",
                ),
                button("See the menu", "", "link"),
              ],
            ],
            { gap: 64 },
          ),
          columns(
            [
              [
                text("Catering", "eyebrow"),
                heading("Parties and events, *taken care of*"),
                text(
                  "Explain the second benefit. Mention numbers where you can: guests served, years of experience, dishes on offer.",
                  "lead",
                ),
                list([
                  "Menus for 20 to 500 guests",
                  "Set-up and service included",
                  "Veg and Jain options",
                ]),
              ],
              [
                image(
                  "restaurant.jpg",
                  "A dinner table laid with plates, glasses and food",
                  "4/3",
                ),
              ],
            ],
            { gap: 64 },
            { reverse: true },
          ),
        ]),
        undefined,
        { ...bandPhone(), gap: 56 },
      ),
  },
  {
    id: "features-checklist",
    name: "Checklist with image",
    category: "features",
    description:
      "A short pitch with ticked points and a button beside an image",
    build: () =>
      at(
        section(band(), [
          columns(
            [
              [
                box("plain", { gap: 16, padding: [0, 24, 0, 0] }, [
                  text("What you get", "eyebrow"),
                  heading("Classes that fit *your child's pace*"),
                  text(
                    "Small batches, patient teachers and regular feedback, so every student keeps moving forward.",
                    "lead",
                  ),
                  list(
                    [
                      "Batches of 8 students or fewer",
                      "Weekly progress notes for parents",
                      "Free doubt-clearing sessions",
                      "Online and in-centre options",
                    ],
                    "check",
                    { gap: 12, margin: [8, 0, 8, 0] },
                  ),
                  button("Book a free demo class", "/contact", "primary", {
                    icon: "arrow",
                  }),
                ]),
              ],
              [
                box("panel", { padding: [32, 32, 32, 32], gap: 0 }, [
                  image(
                    "classroom.jpg",
                    "A classroom with a blackboard, books and an apple",
                    "4/3",
                  ),
                ]),
              ],
            ],
            { gap: 48 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Text and media
  {
    id: "content-text-image",
    name: "Story with image",
    category: "content",
    description: "An image beside a heading and a couple of paragraphs",
    build: ({ project }) =>
      at(
        section(band(), [
          columns(
            [
              [
                at(
                  image(
                    "plant-3.jpg",
                    "A young plant with fresh green leaves",
                    "3/4",
                    { maxWidth: 480 },
                  ),
                  { height: 420 },
                  { height: 300 },
                ),
              ],
              [
                text("Our story", "eyebrow"),
                heading(`How ${project.name} *began*`),
                text(
                  "Start with why you began. A small idea, a gap you noticed, a family tradition. People remember stories more than lists.",
                  "lead",
                ),
                text(
                  "Then say where you are today: how many customers you serve, what you are proud of and what you are working on next. Keep it warm and personal.",
                ),
                row({ gap: 40, margin: [12, 0, 0, 0] }, [
                  box("plain", { gap: 0 }, [
                    heading("12", "3"),
                    text("Years open", "small", { color: "muted" }),
                  ]),
                  box("plain", { gap: 0 }, [
                    heading("3", "3"),
                    text("Locations", "small", { color: "muted" }),
                  ]),
                  box("plain", { gap: 0 }, [
                    heading("40+", "3"),
                    text("Team members", "small", { color: "muted" }),
                  ]),
                ]),
              ],
            ],
            { gap: 72 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "content-quote",
    name: "Big quote",
    category: "content",
    description: "One memorable line, centred, with who said it",
    build: () =>
      at(
        section(
          {
            ...band(104),
            gap: 28,
            textAlign: "center",
            contentWidth: "narrow",
          },
          [
            text("“", "body", {
              fontSize: "96",
              font: "heading",
              color: "accent",
              lineHeight: 1,
              height: 56,
              fontWeight: 700,
            }),
            heading(
              "We don't just sell products. We remember names, birthdays and favourite orders, because that's what a *neighbourhood shop* is for.",
              "3",
              { fontSize: "2xl", lineHeight: 1.3, fontWeight: 500 },
            ),
            row({ justify: "center", gap: 12 }, [
              person("AK", "Anita Kumar", "Founder"),
            ]),
          ],
        ),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "content-video",
    name: "Video",
    category: "content",
    description: "A heading and a large video, on a soft band",
    build: () =>
      at(
        section(
          band(),
          [
            intro(
              "See it for yourself",
              "Take a look *inside*",
              "A two-minute tour of what we do and the people who do it.",
            ),
            n(
              "video",
              {
                url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
                title: "A short tour",
              },
              { radius: "theme", shadow: "lg", maxWidth: 960 },
            ),
          ],
          { tone: "soft" },
        ),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "content-rich-text",
    name: "Article text",
    category: "content",
    description: "A readable column of headings, paragraphs and a list",
    build: () =>
      at(
        section({ ...band(), gap: 20, contentWidth: "narrow" }, [
          text("About us", "eyebrow"),
          heading("A little more about how we work"),
          text(
            "Use this section for longer writing: an about page, your policies or a guide for customers. It keeps lines short so it is easy to read.",
            "lead",
          ),
          heading("What we believe", "3", { margin: [16, 0, 0, 0] }),
          text(
            "Write a paragraph or two here. Be specific: real examples and numbers are more convincing than general claims. Break long thoughts into short paragraphs.",
          ),
          list(
            [
              "Honest advice, even when it means a smaller sale",
              "Clear prices, written down before we start",
              "Work we stand behind, with a guarantee",
            ],
            "bullet",
          ),
          heading("Our promise", "3", { margin: [16, 0, 0, 0] }),
          text(
            "End with what customers can expect from you, and how to reach you if something isn't right.",
          ),
        ]),
        undefined,
        { ...bandPhone(), gap: 16 },
      ),
  },

  // Numbers
  {
    id: "stats-row",
    name: "Numbers in a row",
    category: "stats",
    description: "Four big numbers with labels, on a soft band",
    build: () =>
      at(
        section(
          { ...band(64), textAlign: "center" },
          [
            at(
              grid(
                4,
                [
                  ["12+", "Years in business"],
                  ["8,500", "Happy customers"],
                  ["4.9★", "Google rating"],
                  ["24 hrs", "Average turnaround"],
                ].map(([value, label]) =>
                  box("plain", { gap: 4 }, [
                    text(value, "body", {
                      fontSize: "3xl",
                      fontWeight: 700,
                      font: "heading",
                      lineHeight: 1.1,
                      color: "accent",
                    }),
                    text(label, "muted"),
                  ]),
                ),
                { gap: 32 },
              ),
              undefined,
              { columns: 2, gap: 28 },
            ),
          ],
          { tone: "soft" },
        ),
        { padding: [56, 24, 56, 24] },
        { padding: [48, 18, 48, 18] },
      ),
  },
  {
    id: "stats-dark",
    name: "Numbers on dark",
    category: "stats",
    description: "A heading and four numbers on a dark band",
    build: () =>
      at(
        section(
          band(),
          [
            columns(
              [
                [
                  text("By the numbers", "eyebrow"),
                  heading("Growing with our *community*"),
                  text(
                    "A few numbers that show the trust our customers place in us, year after year.",
                    "lead",
                  ),
                ],
                [
                  at(
                    grid(
                      2,
                      [
                        ["15k+", "Orders delivered"],
                        ["98%", "On-time delivery"],
                        ["320", "Products in stock"],
                        ["4.8★", "Average review"],
                      ].map(([value, label]) =>
                        box("plain", { gap: 4, padding: [20, 0, 0, 0] }, [
                          text(value, "body", {
                            fontSize: "3xl",
                            fontWeight: 700,
                            font: "heading",
                            lineHeight: 1.1,
                          }),
                          text(label, "muted"),
                        ]),
                      ),
                      { gap: 24, columns: 2 },
                    ),
                    undefined,
                    { columns: 2, gap: 16 },
                  ),
                ],
              ],
              { gap: 64 },
            ),
          ],
          { tone: "dark" },
        ),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "stats-cards",
    name: "Number cards",
    category: "stats",
    description: "Three cards, each with an icon, a number and a line",
    build: () =>
      at(
        section(band(), [
          intro("Results", "Numbers we are *proud of*", ""),
          grid(
            3,
            [
              ["users", "2,400+", "Students taught since we opened"],
              ["chart", "92%", "Scored above 80% in board exams"],
              ["heart", "4.9 / 5", "Average rating from parents"],
            ].map(([i, value, label]) =>
              box("card", { gap: 8, padding: [28, 28, 28, 28] }, [
                icon(i, "circle", 20),
                text(value, "body", {
                  fontSize: "3xl",
                  fontWeight: 700,
                  font: "heading",
                  lineHeight: 1.1,
                  margin: [12, 0, 0, 0],
                }),
                text(label, "muted"),
              ]),
            ),
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Pricing
  {
    id: "pricing-tiers",
    name: "Three plans",
    category: "pricing",
    description: "Three price cards, the middle one highlighted",
    build: () => {
      const plan = (
        name: string,
        blurb: string,
        price: string,
        items: string[],
        featured = false,
      ) =>
        box(
          "card",
          {
            gap: 16,
            padding: [32, 28, 28, 28],
            ...(featured
              ? { borderWidth: 2, borderColor: "accent", shadow: "lg" }
              : {}),
          },
          [
            row({ justify: "between", wrap: false }, [
              heading(name, "3"),
              ...(featured
                ? [n("badge", { text: "Most popular", variant: "solid" })]
                : []),
            ]),
            text(blurb, "muted"),
            row({ gap: 6, align: "end", wrap: false }, [
              text(price, "body", {
                fontSize: "3xl",
                fontWeight: 700,
                font: "heading",
                lineHeight: 1,
              }),
              text("/ month", "muted", { padding: [0, 0, 4, 0] }),
            ]),
            n("divider"),
            list(items, "check", { gap: 12 }),
            button(
              featured ? "Choose Standard" : `Choose ${name}`,
              "/contact",
              featured ? "primary" : "secondary",
              {},
              { width: "full" },
            ),
          ],
        );
      return at(
        section(band(), [
          intro(
            "Pricing",
            "Simple plans, *no surprises*",
            "Pick the plan that suits you. Change or cancel any time.",
          ),
          at(
            grid(
              3,
              [
                plan("Basic", "For trying us out.", "₹499", [
                  "One visit a month",
                  "Standard products",
                  "Support on WhatsApp",
                ]),
                plan(
                  "Standard",
                  "Our most loved plan.",
                  "₹999",
                  [
                    "Two visits a month",
                    "Premium products",
                    "Priority booking",
                    "10% off add-ons",
                  ],
                  true,
                ),
                plan("Premium", "For regulars.", "₹1,999", [
                  "Four visits a month",
                  "Premium products",
                  "Home visits",
                  "20% off add-ons",
                ]),
              ],
              { gap: 24 },
            ),
            { columns: 1 },
          ),
        ]),
        undefined,
        bandPhone(),
      );
    },
  },
  {
    id: "pricing-list",
    name: "Price list",
    category: "pricing",
    description: "Services and prices in two columns, like a rate card",
    build: () => {
      const item = (name: string, note: string, price: string) =>
        box("plain", { gap: 2, padding: [14, 0, 14, 0] }, [
          row({ justify: "between", wrap: false, gap: 16, align: "start" }, [
            text(name, "body", { fontWeight: 600 }),
            text(price, "body", { fontWeight: 600, color: "accent" }),
          ]),
          text(note, "small", { color: "muted" }),
        ]);
      const group = (title: string, items: [string, string, string][]) => [
        heading(title, "3"),
        n("divider", {}, { margin: [0, 0, 0, 0] }),
        ...items.map(([a, b, c]) => item(a, b, c)),
      ];
      return at(
        section(band(), [
          intro(
            "Rate card",
            "Our *services*",
            "All prices include taxes. Ask us about packages for weddings and events.",
          ),
          columns(
            [
              group("Hair", [
                ["Haircut and styling", "Wash, cut and blow-dry", "₹450"],
                ["Hair spa", "Deep conditioning, 45 minutes", "₹900"],
                ["Global colour", "Ammonia-free, any length", "from ₹2,200"],
              ]),
              group("Skin and nails", [
                ["Classic facial", "Cleanse, exfoliate and mask", "₹1,200"],
                ["Manicure", "Shape, cuticle care and polish", "₹500"],
                ["Pedicure", "Soak, scrub and massage", "₹650"],
              ]),
            ],
            { gap: 56, align: "start" },
          ),
        ]),
        undefined,
        bandPhone(),
      );
    },
  },
  {
    id: "pricing-single",
    name: "One plan",
    category: "pricing",
    description: "A single offer with what's included and a big button",
    build: () =>
      at(
        section(band(), [
          box("card", { padding: [0, 0, 0, 0], gap: 0, shadow: "md" }, [
            columns(
              [
                [
                  at(
                    box("plain", { padding: [40, 8, 40, 40], gap: 16 }, [
                      heading("Monthly membership", "3"),
                      text(
                        "Everything you need to stay on track, with no joining fee and no lock-in.",
                        "muted",
                      ),
                      text("What's included", "eyebrow", {
                        margin: [12, 0, 0, 0],
                      }),
                      n(
                        "list",
                        {
                          items: [
                            "Unlimited gym access",
                            "Two personal-training sessions",
                            "Diet plan and check-ins",
                            "Locker and towel service",
                          ],
                          marker: "check",
                        },
                        { gap: 12 },
                      ),
                    ]),
                    undefined,
                    { padding: [28, 24, 28, 24] },
                  ),
                ],
                [
                  box(
                    "panel",
                    {
                      padding: [40, 32, 40, 32],
                      gap: 12,
                      textAlign: "center",
                      radius: 0,
                    },
                    [
                      text("Pay monthly", "muted"),
                      text("₹1,499", "body", {
                        fontSize: "4xl",
                        fontWeight: 700,
                        font: "heading",
                        lineHeight: 1,
                      }),
                      text("per month, taxes included", "small", {
                        color: "muted",
                      }),
                      button(
                        "Join today",
                        "/contact",
                        "primary",
                        { size: "lg" },
                        { width: "full" },
                      ),
                      text("Cancel any time", "small", { color: "muted" }),
                    ],
                  ),
                ],
              ],
              { gap: 0, align: "stretch" },
            ),
          ]),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Testimonials
  {
    id: "testimonials-cards",
    name: "Review cards",
    category: "testimonials",
    description: "Three customer reviews with stars and names",
    build: () =>
      at(
        section(band(), [
          intro(
            "Reviews",
            "Loved by *our customers*",
            "Real words from people we have worked with.",
          ),
          grid(
            3,
            [
              [
                "PR",
                "Priya Raman",
                "Regular customer",
                "The quality is consistent every single time, and they always remember how I like things. It feels like a family shop.",
              ],
              [
                "AM",
                "Arjun Mehta",
                "Ordered for an event",
                "They handled our order for 200 guests without a single problem. On time, well packed and everyone loved it.",
              ],
              [
                "SN",
                "Sneha Nair",
                "Customer since 2019",
                "Quick replies on WhatsApp, fair prices and honest advice. I have recommended them to all my friends.",
              ],
            ].map(([initials, name, role, quote]) =>
              box("card", { gap: 16, padding: [28, 28, 28, 28] }, [
                stars(),
                text(`“${quote}”`, "body", { lineHeight: 1.65 }),
                person(initials, name, role),
              ]),
            ),
            { gap: 24 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "testimonials-quote",
    name: "Featured review",
    category: "testimonials",
    description: "One big review on an accent band",
    build: () =>
      at(
        section(
          { ...band(96), gap: 28, textAlign: "center", contentWidth: "narrow" },
          [
            text("★★★★★", "body", { letterSpacing: 4, fontSize: "xl" }),
            heading(
              "“From the first call to the final result, everything was easy. I finally found a team I trust completely.”",
              "3",
              { fontSize: "2xl", lineHeight: 1.3, fontWeight: 500 },
            ),
            box("plain", { gap: 2 }, [
              text("Kavya Iyer", "body", { fontWeight: 600 }),
              text("Home owner, Chennai", "small", { color: "muted" }),
            ]),
          ],
          { tone: "accent" },
        ),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "testimonials-rating",
    name: "Rating and reviews",
    category: "testimonials",
    description: "Your overall rating beside two reviews",
    build: () =>
      at(
        section(
          band(),
          [
            columns(
              [
                [
                  text("Google reviews", "eyebrow"),
                  heading("Rated *4.9 out of 5* by 1,200 customers"),
                  text(
                    "We read every review and reply to each one. Here's what people say most often.",
                    "lead",
                  ),
                  row({ gap: 12, margin: [8, 0, 0, 0] }, [
                    button("Read all reviews", "", "secondary", {
                      icon: "arrowUpRight",
                      newTab: true,
                    }),
                  ]),
                ],
                [
                  ...[
                    [
                      "RV",
                      "Rahul Verma",
                      "Booked a home service",
                      "Arrived on time, explained everything clearly and left the place spotless. Exactly what you hope for.",
                    ],
                    [
                      "FS",
                      "Fatima Shaikh",
                      "Monthly customer",
                      "Friendly, reliable and always fairly priced. I don't go anywhere else now.",
                    ],
                  ].map(([initials, name, role, quote]) =>
                    box("card", { gap: 14, padding: [24, 24, 24, 24] }, [
                      stars(),
                      text(`“${quote}”`),
                      person(initials, name, role),
                    ]),
                  ),
                ],
              ],
              { gap: 56, align: "center" },
            ),
          ],
          { tone: "soft" },
        ),
        undefined,
        bandPhone(),
      ),
  },

  // Team
  {
    id: "team-grid",
    name: "Team cards",
    category: "team",
    description: "Four people with initials, names and roles",
    build: () =>
      at(
        section(band(), [
          intro(
            "Our team",
            "The people *behind the work*",
            "Friendly, experienced and always happy to help.",
          ),
          at(
            grid(
              4,
              [
                ["DS", "Dr. Deepa Shah", "Founder and lead"],
                ["RK", "Ravi Kumar", "Senior specialist"],
                ["MJ", "Meera Joshi", "Customer care"],
                ["AT", "Aman Thakur", "Operations"],
              ].map(([initials, name, role]) =>
                box(
                  "card",
                  {
                    gap: 4,
                    padding: [28, 20, 24, 20],
                    textAlign: "center",
                    align: "center",
                  },
                  [
                    at(avatar(initials, 88), undefined, {
                      width: 72,
                      height: 72,
                    }),
                    heading(name, "4", { margin: [14, 0, 0, 0] }),
                    text(role, "small", { color: "muted" }),
                  ],
                ),
              ),
              { gap: 20 },
            ),
            undefined,
            { columns: 2, gap: 12 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "team-list",
    name: "Team with contacts",
    category: "team",
    description: "People in rows, each with a short bio and a call button",
    build: () =>
      at(
        section(band(), [
          intro("Meet the experts", "Talk to *the right person*", "", "left"),
          grid(
            2,
            [
              [
                "NG",
                "Nikhil Gupta",
                "Sales and quotes",
                "Helps you choose the right product and gets you the best price.",
              ],
              [
                "SP",
                "Sana Patel",
                "Service and repairs",
                "Books visits, tracks repairs and keeps you updated on WhatsApp.",
              ],
              [
                "VR",
                "Vikram Rao",
                "Projects",
                "Plans larger orders and installations for homes and offices.",
              ],
              [
                "LM",
                "Lakshmi Menon",
                "Accounts",
                "Invoices, GST bills and payment questions, sorted quickly.",
              ],
            ].map(([initials, name, role, bio]) =>
              box(
                "panel",
                {
                  direction: "row",
                  gap: 16,
                  align: "start",
                  padding: [24, 24, 24, 24],
                },
                [
                  avatar(initials, 52),
                  box("plain", { gap: 4 }, [
                    heading(name, "4"),
                    text(role, "small", { color: "accent", fontWeight: 600 }),
                    text(bio, "muted", { margin: [4, 0, 8, 0] }),
                    button("Call", PHONE, "link", {
                      size: "sm",
                      icon: "phone",
                    }),
                  ]),
                ],
              ),
            ),
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Gallery
  {
    id: "gallery-grid",
    name: "Photo grid",
    category: "gallery",
    description: "Six photos in an even grid",
    build: () =>
      at(
        section(band(), [
          intro("Gallery", "A look at *our work*", ""),
          at(
            grid(
              3,
              [
                ["dish.jpg", "Grilled paneer with salad and dip"],
                ["salad.jpg", "A bowl of salad with grains and vegetables"],
                ["restaurant.jpg", "A dinner table set with food and glasses"],
                ["interior.jpg", "A minimal room with a desk and chair"],
                ["plant-1.jpg", "A succulent in a mint-green pot"],
                ["botanical.jpg", "Close-up of green fern leaves"],
              ].map(([file, alt]) => image(file, alt, "4/3")),
              { gap: 16 },
            ),
            undefined,
            { columns: 2, gap: 10 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "gallery-mosaic",
    name: "Photo mosaic",
    category: "gallery",
    description: "One large photo beside four small ones",
    build: () =>
      at(
        section(band(), [
          row({ justify: "between", align: "end", gap: 20 }, [
            intro("Our space", "Come and *see us*", "", "left"),
            button("Plan a visit", "/contact", "secondary", { icon: "arrow" }),
          ]),
          columns(
            [
              [
                image(
                  "restaurant.jpg",
                  "Diners at a table with plates and wine glasses",
                  "1/1",
                ),
              ],
              [
                at(
                  grid(
                    2,
                    [
                      ["dish.jpg", "A grilled starter platter"],
                      ["salad.jpg", "A fresh salad bowl"],
                      ["plant-2.jpg", "Shelves of books at a market stall"],
                      ["interior.jpg", "A quiet corner with a desk"],
                    ].map(([file, alt]) => image(file, alt, "1/1")),
                    { gap: 16, columns: 2 },
                  ),
                  undefined,
                  { columns: 2, gap: 12 },
                ),
              ],
            ],
            { gap: 16, align: "stretch" },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },
  {
    id: "gallery-products",
    name: "Product cards",
    category: "gallery",
    description: "Four products with a photo, price and button",
    build: () =>
      at(
        section(band(), [
          row({ justify: "between", align: "end", gap: 20 }, [
            intro("Bestsellers", "Picked *fresh this week*", "", "left"),
            button("View all products", "/shop", "link"),
          ]),
          at(
            grid(
              4,
              [
                [
                  "vegetables.jpg",
                  "Farm vegetables",
                  "Seasonal basket, 3 kg",
                  "₹299",
                ],
                [
                  "fruits.jpg",
                  "Fresh fruit box",
                  "Apples, oranges and grapes",
                  "₹449",
                ],
                [
                  "dairy.jpg",
                  "Dairy essentials",
                  "Milk, eggs and butter",
                  "₹199",
                ],
                ["breads.jpg", "Bakery bundle", "Baked this morning", "₹149"],
              ].map(([file, name, note, price]) =>
                box("card", { gap: 10, padding: [10, 10, 16, 10] }, [
                  image(file, name, "1/1"),
                  box("plain", { gap: 2, padding: [6, 6, 0, 6] }, [
                    heading(name, "4"),
                    text(note, "small", { color: "muted" }),
                  ]),
                  row(
                    { justify: "between", wrap: false, padding: [6, 6, 0, 6] },
                    [
                      text(price, "body", { fontWeight: 700 }),
                      button("Add", WHATSAPP, "ghost", {
                        size: "sm",
                        icon: "plus",
                      }),
                    ],
                  ),
                ]),
              ),
              { gap: 20 },
            ),
            undefined,
            { columns: 2, gap: 12 },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Logos
  {
    id: "logos-row",
    name: "Logo strip",
    category: "logos",
    description: "A short line and a row of client or brand names",
    build: () =>
      at(
        section({ padding: [48, 24, 48, 24], gap: 24, textAlign: "center" }, [
          text("Trusted by businesses across the city", "small", {
            color: "muted",
          }),
          at(
            row(
              { justify: "center", gap: 48, opacity: 70 },
              [
                ["Kaveri", { font: "heading", italic: true }],
                ["BANYAN", { letterSpacing: 4 }],
                ["saffron.", {}],
                ["Monsoon & Co", { font: "heading" }],
                ["NEEM", { letterSpacing: 6, fontWeight: 800 }],
              ].map(([name, style]) =>
                text(name as string, "body", {
                  fontSize: "xl",
                  fontWeight: 700,
                  ...(style as Style),
                }),
              ),
            ),
            undefined,
            { gap: 28 },
          ),
        ]),
        undefined,
        { padding: [40, 18, 40, 18] },
      ),
  },
  {
    id: "logos-grid",
    name: "Brands we stock",
    category: "logos",
    description: "Brand names in a grid of tiles, with a heading",
    build: () =>
      at(
        section(band(72), [
          intro(
            "Brands",
            "Genuine brands, *trusted quality*",
            "Authorised dealer for the names you know, with full warranty.",
          ),
          at(
            grid(
              6,
              ["Kaveri", "Banyan", "Saffron", "Monsoon", "Neem", "Lotus"].map(
                (name) =>
                  box(
                    "panel",
                    {
                      padding: [26, 12, 26, 12],
                      align: "center",
                      justify: "center",
                      gap: 0,
                    },
                    [
                      text(name, "body", {
                        fontSize: "lg",
                        fontWeight: 700,
                        color: "muted",
                        letterSpacing: 1,
                      }),
                    ],
                  ),
              ),
              { gap: 12 },
            ),
            { columns: 3 },
            { columns: 2 },
          ),
        ]),
        undefined,
        bandPhone(56),
      ),
  },

  // Questions
  {
    id: "faq-centered",
    name: "Questions, centred",
    category: "faq",
    description: "A heading and questions that open to show answers",
    build: () =>
      at(
        section({ ...band(), gap: 40, contentWidth: "narrow" }, [
          intro(
            "FAQ",
            "Questions, *answered*",
            "Can't find what you're looking for? Message us on WhatsApp.",
          ),
          n("accordion", {
            items: [
              "Do you deliver? | Yes, across the city. Orders placed before 4 pm arrive the same day.",
              "How can I pay? | UPI, debit and credit cards, net banking or cash on delivery.",
              "Can I change or cancel my order? | Yes, any time before it's packed. Just message us on WhatsApp.",
              "Do you offer bulk or corporate orders? | We do. Tell us what you need and we'll send a quote within a day.",
              "What if something isn't right? | Tell us within 7 days and we'll replace it or refund you, no questions asked.",
            ],
          }),
        ]),
        undefined,
        { ...bandPhone(), gap: 28 },
      ),
  },
  {
    id: "faq-split",
    name: "Questions with contact",
    category: "faq",
    description: "A heading and WhatsApp button beside the questions",
    build: () =>
      at(
        section(band(), [
          columns(
            [
              [
                text("Help", "eyebrow"),
                heading("Frequently asked *questions*"),
                text(
                  "Still have a question? We usually reply within a few minutes.",
                  "lead",
                ),
                row({ gap: 12, margin: [8, 0, 0, 0] }, [
                  button("Ask on WhatsApp", WHATSAPP, "primary", {
                    icon: "send",
                    newTab: true,
                  }),
                  button("Call us", PHONE, "secondary", { icon: "phone" }),
                ]),
              ],
              [
                n("accordion", {
                  items: [
                    "Do I need an appointment? | Walk-ins are welcome, but booking ahead means no waiting.",
                    "What are your opening hours? | Monday to Saturday, 9 am to 8 pm. Sundays 10 am to 2 pm.",
                    "Is there parking nearby? | Yes, free parking is available right outside.",
                    "Do you offer packages? | We have monthly and festive packages. Ask us for the current offers.",
                  ],
                }),
              ],
            ],
            { gap: 64, align: "start" },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Call to action
  {
    id: "cta-banner",
    name: "Accent banner",
    category: "cta",
    description: "A full-width accent band with a headline and buttons",
    build: () =>
      at(
        section(
          { ...band(96), gap: 20, textAlign: "center" },
          [
            heading("Ready to get started?", "2", { maxWidth: 720 }),
            text(
              "Book in under a minute. We'll confirm on WhatsApp right away.",
              "lead",
              { maxWidth: 560 },
            ),
            row({ justify: "center", gap: 12, margin: [12, 0, 0, 0] }, [
              button("Book now", "/contact", "primary", { size: "lg" }),
              button("Chat on WhatsApp", WHATSAPP, "secondary", {
                size: "lg",
                icon: "send",
                newTab: true,
              }),
            ]),
          ],
          { tone: "accent" },
        ),
        undefined,
        { ...bandPhone(), gap: 16 },
      ),
  },
  {
    id: "cta-box",
    name: "Call to action card",
    category: "cta",
    description: "A rounded accent card with a line and a button",
    build: () =>
      at(
        section(band(64), [
          at(
            box(
              "accent",
              {
                direction: "row",
                justify: "between",
                align: "center",
                gap: 32,
                padding: [48, 56, 48, 56],
                wrap: true,
              },
              [
                box("plain", { gap: 10, maxWidth: 560 }, [
                  heading("Get 10% off your first order", "2", {
                    fontSize: "2xl",
                  }),
                  text(
                    "Join over 8,000 customers who shop with us every week.",
                    "lead",
                  ),
                ]),
                row({ gap: 12 }, [
                  button("Order now", "/shop", "primary", {
                    size: "lg",
                    icon: "arrow",
                  }),
                ]),
              ],
            ),
            { padding: [40, 32, 40, 32] },
            { padding: [32, 24, 32, 24], gap: 24 },
          ),
        ]),
        undefined,
        bandPhone(48),
      ),
  },
  {
    id: "cta-dark",
    name: "Dark card with image",
    category: "cta",
    description: "A dark card with text and buttons beside a photo",
    build: () =>
      at(
        section(band(64), [
          box("dark", { padding: [0, 0, 0, 0], gap: 0 }, [
            columns(
              [
                [
                  at(
                    box("plain", { padding: [56, 16, 56, 56], gap: 16 }, [
                      text("Visit us", "eyebrow"),
                      heading("Your table is *waiting*", "2"),
                      text(
                        "Book for lunch, dinner or a private party. Walk-ins welcome too.",
                        "lead",
                      ),
                      row({ gap: 12, margin: [8, 0, 0, 0] }, [
                        button("Reserve a table", "/contact", "primary"),
                        button("Call us", PHONE, "secondary", {
                          icon: "phone",
                        }),
                      ]),
                    ]),
                    { padding: [40, 32, 44, 32] },
                    { padding: [28, 22, 32, 22] },
                  ),
                ],
                [
                  image(
                    "dish.jpg",
                    "A grilled starter platter with salad and dip",
                    "4/3",
                    { radius: 0 },
                  ),
                ],
              ],
              { gap: 0, align: "stretch" },
              { reverse: true },
            ),
          ]),
        ]),
        undefined,
        bandPhone(48),
      ),
  },

  // Contact
  {
    id: "contact-map",
    name: "Contact details and map",
    category: "contact",
    description: "Address, phone, hours and quick buttons beside a map",
    build: () => {
      const detail = (i: string, label: string, value: string) =>
        row({ gap: 14, align: "start", wrap: false }, [
          icon(i, "tile", 18),
          box("plain", { gap: 0 }, [
            text(label, "small", { color: "muted" }),
            text(value, "body", { fontWeight: 600 }),
          ]),
        ]);
      return at(
        section(band(), [
          columns(
            [
              [
                text("Contact", "eyebrow"),
                heading("Come and *say hello*"),
                text("Drop by, call or message us. We'd love to help.", "lead"),
                box("plain", { gap: 18, margin: [12, 0, 12, 0] }, [
                  detail("home", "Address", ADDRESS),
                  detail("phone", "Phone", "+91 98000 00000"),
                  detail("mail", "Email", "hello@example.com"),
                  detail("bell", "Open", "Mon–Sat, 9 am – 8 pm"),
                ]),
                row({ gap: 10 }, [
                  button("WhatsApp", WHATSAPP, "primary", {
                    icon: "send",
                    newTab: true,
                  }),
                  button("Call", PHONE, "secondary", { icon: "phone" }),
                  button("Email", EMAIL, "secondary", { icon: "mail" }),
                ]),
              ],
              [
                n(
                  "map",
                  { address: ADDRESS, zoom: 15 },
                  { height: 460, radius: "theme", borderWidth: 1 },
                ),
              ],
            ],
            { gap: 56, align: "center" },
          ),
        ]),
        undefined,
        bandPhone(),
      );
    },
  },
  {
    id: "contact-cards",
    name: "Ways to reach us",
    category: "contact",
    description: "WhatsApp, call and email cards above a wide map",
    build: () =>
      at(
        section(band(), [
          intro(
            "Get in touch",
            "We're *one message away*",
            "Pick whatever's easiest for you. We reply within the hour during opening times.",
          ),
          grid(
            3,
            [
              [
                "send",
                "WhatsApp",
                "Quickest way to reach us",
                "Chat now",
                WHATSAPP,
              ],
              ["phone", "Call", "+91 98000 00000", "Call now", PHONE],
              ["mail", "Email", "hello@example.com", "Write to us", EMAIL],
            ].map(([i, title, line, action, url]) =>
              box(
                "card",
                { gap: 10, padding: [28, 28, 28, 28] },
                [
                  icon(i, "circle"),
                  heading(title, "3", { margin: [8, 0, 0, 0], fontSize: "xl" }),
                  text(line, "muted"),
                  text(`${action} →`, "body", {
                    color: "accent",
                    fontWeight: 600,
                  }),
                ],
                { link: url },
              ),
            ),
            { gap: 20 },
          ),
          n(
            "map",
            { address: ADDRESS, zoom: 14 },
            { height: 360, radius: "theme" },
          ),
        ]),
        undefined,
        bandPhone(),
      ),
  },

  // Footers
  {
    id: "footer-columns",
    name: "Footer with link columns",
    category: "footer",
    description: "Your name and social links beside columns of links",
    build: ({ project }) => {
      const links = (title: string, items: string[]) =>
        box("plain", { gap: 10 }, [
          text(title, "small", { fontWeight: 700 }),
          n("menu", { source: "custom", variant: "stack", links: items }),
        ]);
      return at(
        section(
          { padding: [72, 24, 32, 24], gap: 48 },
          [
            at(
              grid(
                4,
                [
                  box("plain", { gap: 14 }, [
                    n("logo", { text: project.name }),
                    text(
                      "Good things, made with care. Visit us or order online any day of the week.",
                      "muted",
                      {
                        maxWidth: 300,
                      },
                    ),
                    n("social", { links: SOCIAL.slice(0, 3) }, { gap: 8 }),
                  ]),
                  links("Shop", [
                    "All products | /shop",
                    "New arrivals | /shop",
                    "Offers | /offers",
                    "Gift cards | /gift-cards",
                  ]),
                  links("Company", [
                    "About us | /about",
                    "Our team | /about",
                    "Careers | /careers",
                    "Contact | /contact",
                  ]),
                  links("Help", [
                    "Delivery | /delivery",
                    "Returns | /returns",
                    "Privacy | /privacy",
                    "Terms | /terms",
                  ]),
                ],
                { gap: 40 },
              ),
              { columns: 2 },
              { columns: 1, gap: 32 },
            ),
            n("divider", {}, { margin: [0, 0, 0, 0] }),
            row({ justify: "between", gap: 12 }, [
              text(
                `© ${new Date().getFullYear()} ${project.name}. All rights reserved.`,
                "small",
                { color: "muted" },
              ),
              text("Made in India", "small", { color: "muted" }),
            ]),
          ],
          { tag: "footer", tone: "soft" },
        ),
        undefined,
        { padding: [56, 18, 28, 18], gap: 32 },
      );
    },
  },
  {
    id: "footer-centered",
    name: "Centred footer",
    category: "footer",
    description: "Name, links and social icons, centred",
    build: ({ project }) =>
      at(
        section(
          {
            padding: [56, 24, 40, 24],
            gap: 20,
            textAlign: "center",
            align: "center",
          },
          [
            n("logo", { text: project.name }),
            n("menu", { variant: "inline" }),
            n("social", { links: SOCIAL }, { justify: "center", gap: 8 }),
            text(`© ${new Date().getFullYear()} ${project.name}`, "small", {
              color: "muted",
              margin: [8, 0, 0, 0],
            }),
          ],
          { tag: "footer" },
        ),
        undefined,
        { padding: [44, 18, 32, 18], gap: 16 },
      ),
  },
  {
    id: "footer-dark",
    name: "Dark footer with contact",
    category: "footer",
    description: "A dark band with a call to action, contact details and links",
    build: ({ project }) =>
      at(
        section(
          { padding: [72, 24, 32, 24], gap: 40 },
          [
            row({ justify: "between", align: "end", gap: 24 }, [
              box("plain", { gap: 10, maxWidth: 560 }, [
                heading("Have a question? *Let's talk.*", "2", {
                  fontSize: "2xl",
                }),
                text(
                  "Call or message us, Monday to Saturday, 9 am to 8 pm.",
                  "muted",
                ),
              ]),
              row({ gap: 10 }, [
                button("WhatsApp us", WHATSAPP, "primary", {
                  icon: "send",
                  newTab: true,
                }),
                button("+91 98000 00000", PHONE, "secondary", {
                  icon: "phone",
                }),
              ]),
            ]),
            n("divider", {}, { margin: [0, 0, 0, 0] }),
            row({ justify: "between", align: "start", gap: 24 }, [
              box("plain", { gap: 8 }, [
                n("logo", { text: project.name }),
                text(ADDRESS, "small", { color: "muted" }),
              ]),
              n("menu", { variant: "inline" }),
            ]),
            row({ justify: "between", gap: 12 }, [
              text(`© ${new Date().getFullYear()} ${project.name}`, "small", {
                color: "muted",
              }),
              n("social", { links: SOCIAL }, { gap: 8 }),
            ]),
          ],
          { tag: "footer", tone: "dark" },
        ),
        undefined,
        { padding: [56, 18, 28, 18], gap: 28 },
      ),
  },
  ...DATA_PRESETS,
  ...FORM_PRESETS,
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
