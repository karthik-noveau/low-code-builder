/**
 * Botanical: a plant shop. The catalogue, cart, checkout, customer accounts
 * and order tracking are Forma Store's (src/commerce); this template seeds its
 * products (`botanicalProducts`) and turns on the Shop button and catalogue
 * sections, so a published Botanical is a working online store.
 */
import {
  chrome,
  createSection,
  item,
  page,
  styled,
  type SiteParts,
} from "./kit";

/** A product as Forma Store's POST /sites/:id/commerce/products takes it. Prices in paise. */
export interface SeedProduct {
  title: string;
  description: string;
  image: string;
  collection: string;
  status: "active";
  variants: {
    title: string;
    sku: string;
    price: number;
    stock: number;
    prices: Record<string, number>;
  }[];
}
const product = (
  title: string,
  collection: string,
  image: string,
  description: string,
  variants: [title: string, rupees: number, stock: number][],
): SeedProduct => ({
  title,
  description,
  image,
  collection,
  status: "active",
  variants: variants.map(([name, rupees, stock], n) => ({
    title: name,
    sku: `${title
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 6)
      .toUpperCase()}-${n + 1}`,
    price: rupees * 100,
    stock,
    prices: {},
  })),
});
export const botanicalProducts: SeedProduct[] = [
  product(
    "Fiddle leaf fig",
    "Plants",
    "/images/plant-3.jpg",
    "Big, glossy leaves for a bright corner. Arrives 90–100 cm tall in a nursery pot. Water when the top 5 cm of soil is dry.",
    [
      ["Medium, 60 cm", 899, 14],
      ["Large, 100 cm", 1499, 8],
    ],
  ),
  product(
    "Desert succulent trio",
    "Plants",
    "/images/plant-2.jpg",
    "Three easy-going succulents for a sunny windowsill. Water every two weeks; less in winter.",
    [["Default", 549, 30]],
  ),
  product(
    "Rubber plant",
    "Plants",
    "/images/plant-1.jpg",
    "Forgiving, fast-growing and happy in medium light. A great first plant.",
    [
      ["Small, 30 cm", 449, 25],
      ["Medium, 60 cm", 799, 12],
    ],
  ),
  product(
    "Snake plant",
    "Plants",
    "/images/plant-4.jpg",
    "Thrives on neglect and low light, and cleans the air while you sleep.",
    [["Default", 499, 40]],
  ),
  product(
    "Monstera deliciosa",
    "Plants",
    "/images/botanical.jpg",
    "Dramatic split leaves that grow bigger every season. Bright, indirect light.",
    [["Medium, 50 cm", 999, 10]],
  ),
  product(
    "Money plant in hanging basket",
    "Plants",
    "/images/plant-1.jpg",
    "Trailing golden pothos in a jute basket, ready to hang.",
    [["Default", 399, 35]],
  ),
  product(
    "Terracotta pot",
    "Pots & planters",
    "/images/garden.jpg",
    "Hand-thrown, breathable clay pot with a drainage hole and saucer.",
    [
      ["Small, 15 cm", 249, 50],
      ["Medium, 25 cm", 449, 30],
    ],
  ),
  product(
    "Ceramic planter, sage",
    "Pots & planters",
    "/images/interior.jpg",
    "Matte glazed planter with a drainage hole. Fits a medium nursery pot.",
    [["Default", 699, 20]],
  ),
  product(
    "Organic potting mix, 5 kg",
    "Care",
    "/images/garden.jpg",
    "Cocopeat, compost and perlite blended for indoor plants.",
    [["Default", 299, 60]],
  ),
  product(
    "Plant care kit",
    "Care",
    "/images/garden.jpg",
    "Neem oil spray, liquid seaweed feed, a moisture meter and a care card.",
    [["Default", 649, 25]],
  ),
];

export function botanical(brand: string): SiteParts {
  const ui = styled("#f2f3ed", "#294b3b");
  const shop = "/collection";
  const bestsellers = botanicalProducts
    .slice(0, 6)
    .map((p) =>
      item(
        p.title,
        p.description.split(". ")[0] + ".",
        p.image,
        `₹${(p.variants[0].price / 100).toLocaleString("en-IN")}`,
        shop,
      ),
    );
  const { header, footer } = chrome(
    brand === "Botanical" ? "botanical" : brand,
    {
      announcement:
        "Free delivery on orders over ₹999 · Healthy-plant guarantee →",
      announcementUrl: shop,
      cta: ["Shop plants", shop],
      tagline:
        "Good things take root. Plants, pots and care delivered across India.",
      dark: "#294b3b",
    },
  );
  footer[0].background = "#213e32";
  const pages = [
    page(
      "Home",
      "",
      "Shop healthy indoor plants, handmade pots and plant care online at Botanical. Delivered in 2–4 days with a 30-day guarantee.",
      [
        createSection("hero", { buttonLabel: "Shop plants", buttonUrl: shop }),
        ui.features([
          ["Healthy-plant guarantee", "Not happy in 30 days? We replace it."],
          ["Delivered in 2–4 days", "Packed to travel, across India."],
          ["Care help on chat", "Plant people, just a message away."],
        ]),
        createSection("products", {
          title: "Meet your new roommates.",
          eyebrow: "BESTSELLERS",
          body: "Add to cart, check out in a minute and track your order from your account.",
          buttonLabel: "Shop all plants",
          buttonUrl: shop,
          items: bestsellers,
        }),
        ui.story({
          eyebrow: "OUR STORY",
          title: "Rooted in something good.",
          body: "What started with a windowsill and a few cuttings is now a nursery in Pune that grows most of what we sell.\n\nEvery plant is checked, potted and packed by hand, and leaves with a care card written by the person who grew it.",
          image: "/images/garden.jpg",
          imageAlt: "Gardening tools ready for planting",
          buttonLabel: "A little about us",
          buttonUrl: "/our-story",
        }),
        ui.quotes("Nice words. Happy people.", [
          [
            "Alisha M., Pune",
            "My fiddle leaf fig arrived without a single bent leaf. Six months on, it’s doubled.",
          ],
          [
            "Jaideep R., Delhi",
            "Ordered on Monday, delivered Wednesday, tracked the whole way from my account.",
          ],
          [
            "Meghna S., Bengaluru",
            "The care kit and the little handwritten card made it feel like a gift to myself.",
          ],
        ]),
        ui.newsletter(
          "STAY IN THE GROW",
          "A little green in your inbox.",
          "New arrivals, seasonal care tips and early access to sales. Once a month, never more.",
          "Count me in",
          { align: "center", background: "#e7ecdf" },
        ),
      ],
      brand,
    ),
    page(
      "Collection",
      "collection",
      "Shop indoor plants, terracotta and ceramic pots, potting mix and care kits. Add to cart, pay securely and track your order.",
      [
        createSection("text", {
          title: "Find your kind of green.",
          eyebrow: "THE SHOP",
          body: "From your first plant to your urban jungle. Choose a size, add to cart and check out; your account shows every order and its tracking.",
          align: "center",
        }),
        createSection("products", {
          title: "Plants, pots and care",
          eyebrow: "EVERYTHING IN STOCK",
          body: "",
          buttonLabel: "",
          items: botanicalProducts.map((p) =>
            item(
              p.title,
              p.description.split(". ")[0] + ".",
              p.image,
              `₹${(p.variants[0].price / 100).toLocaleString("en-IN")}`,
              shop,
            ),
          ),
        }),
        ui.faq("Ordering, delivery and returns", [
          [
            "How do I track my order?",
            "Sign in to your account from the shop with the email you ordered with. Every order shows its status and tracking.",
          ],
          [
            "How are plants packed?",
            "In breathable boxes with the pot wrapped and soil secured, so they arrive upright and unbruised.",
          ],
          [
            "What if my plant arrives damaged?",
            "Send us a photo within 48 hours and we’ll replace it or refund you in full.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Our story",
      "our-story",
      "Botanical grows most of its plants at its own nursery in Pune. Meet the growers, and read their simple plant care guide.",
      [
        ui.story({
          eyebrow: "OUR STORY",
          title: "Small beginnings. Growing possibilities.",
          body: "We started selling cuttings from a balcony in 2019. Today a team of eleven grows, pots and packs every plant at our nursery outside Pune.",
          image: "/images/garden.jpg",
          imageAlt: "Gardening tools ready for planting",
        }),
        createSection("gallery", {
          title: "Life, a little greener.",
          eyebrow: "FROM OUR NURSERY",
          body: "A few corners our customers have filled.",
          items: [
            item(
              "Living rooms",
              "Monstera and rubber plants",
              "/images/interior.jpg",
            ),
            item(
              "Window sills",
              "Succulents that love the sun",
              "/images/plant-2.jpg",
            ),
            item(
              "Slow mornings",
              "A fig in the light",
              "/images/botanical.jpg",
            ),
          ],
        }),
        ui.faq(
          "Plant care, simply",
          [
            [
              "How much light is enough?",
              "Most indoor plants want bright, indirect light: near a window, out of harsh afternoon sun. Snake plants and money plants cope with less.",
            ],
            [
              "How often should I water?",
              "Push a finger 5 cm into the soil. Dry? Water until it drains. Damp? Wait. Overwatering kills more plants than forgetting.",
            ],
            [
              "When should I repot?",
              "When roots come out of the drainage hole, usually every 12–18 months. Go one pot size up, in spring or the monsoon.",
            ],
            [
              "Why are the leaves turning yellow?",
              "Usually too much water or too little light. Let the soil dry out and move the plant somewhere brighter.",
            ],
          ],
          { eyebrow: "FROM OUR GROWERS" },
        ),
        ui.cta(
          "NEED SUPPLIES?",
          "Potting mix, feed and care kits.",
          "Everything our growers use, in sizes for home.",
          ["Shop care", shop],
        ),
      ],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Contact Botanical about an order, plant care, corporate gifting or bulk plants for offices and cafés. We reply within a day.",
      [
        ui.contact(
          "Let’s start a conversation.",
          "Questions about an order, a sick plant or gifting for your team? We reply within a day.",
        ),
        ui.faq("Good to know", [
          [
            "Do you do corporate gifting?",
            "Yes, from 20 plants with your card and branded sleeves. Tell us your date and budget.",
          ],
          [
            "Can I visit the nursery?",
            "On Saturdays, 10 am–4 pm, at Mulshi Road, Pune. Message us before you come.",
          ],
        ]),
      ],
      brand,
    ),
  ];
  return {
    header,
    footer,
    pages,
    theme: {
      accent: "#294b3b",
      background: "#fcfcf9",
      color: "#25352b",
      font: "editorial",
      radius: 2,
    },
  };
}
