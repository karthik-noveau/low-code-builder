/** Volt Electricals: a counter shop with a rewards club and a warranty register. */
import { catalog } from "../../apps/templates/catalog";
import {
  combineApps,
  formNamed,
  rewardsApp,
  warrantyApp,
} from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function volt(brand: string): SiteParts {
  const ui = styled("#fff1e3", "#26292e");
  const ask = "/contact";
  const products = catalog({
    name: "Products",
    singular: "Product",
    blueprint: "products",
    fields: [
      ["Product", "text"],
      ["Price", "price"],
      [
        "Category",
        "choice",
        [
          "Lighting",
          "Fans",
          "Switches & sockets",
          "Wires & cables",
          "Safety",
          "Appliances",
        ],
      ],
      ["Brand", "text"],
      ["Photo", "image"],
      ["Description", "longText"],
      ["Ask link", "link"],
    ],
    display: {
      title: "Product",
      price: "Price",
      subtitle: "Category",
      image: "Photo",
      summary: "Description",
      body: "Description",
      action: "Ask link",
      actionLabel: "Ask for today’s price",
    },
    rows: [
      [
        "LED bulb 9 W (pack of 4)",
        "396",
        "Lighting",
        "Havells, Philips, Syska",
        "/images/led-bulb.jpg",
        "Cool daylight, B22 base, 2-year replacement warranty.",
        ask,
      ],
      [
        "LED batten 20 W, 4 ft",
        "349",
        "Lighting",
        "Wipro, Philips",
        "/images/led-bulb.jpg",
        "Slim tube light with built-in driver. Fits standard clips.",
        ask,
      ],
      [
        "BLDC ceiling fan 1200 mm",
        "3290",
        "Fans",
        "Atomberg, Crompton, Orient",
        "/images/ceiling-fan.jpg",
        "Uses about 28 W at top speed, with a remote. 5-star rated.",
        ask,
      ],
      [
        "Wall fan 400 mm",
        "2150",
        "Fans",
        "Usha, Bajaj",
        "/images/ceiling-fan.jpg",
        "Three speeds, 90° oscillation, quiet motor.",
        ask,
      ],
      [
        "Modular switch 6 A (10 pcs)",
        "450",
        "Switches & sockets",
        "Anchor Roma, Legrand",
        "/images/switches.jpg",
        "One-way switches with a smooth click. White and grey.",
        ask,
      ],
      [
        "16 A socket with switch",
        "160",
        "Switches & sockets",
        "Anchor, GM",
        "/images/switches.jpg",
        "For ACs, geysers and kitchen appliances.",
        ask,
      ],
      [
        "FR wire 1.5 sq mm, 90 m",
        "1480",
        "Wires & cables",
        "Polycab, Finolex, Havells",
        "/images/wires.jpg",
        "Flame-retardant copper house wire for lights and fans.",
        ask,
      ],
      [
        "FR wire 2.5 sq mm, 90 m",
        "2350",
        "Wires & cables",
        "Polycab, Finolex, Havells",
        "/images/wires.jpg",
        "For sockets and power points up to 16 A.",
        ask,
      ],
      [
        "MCB 32 A double pole",
        "280",
        "Safety",
        "Schneider, Legrand",
        "/images/switches.jpg",
        "Protects your mains from overloads and short circuits.",
        ask,
      ],
      [
        "Storage water heater 15 L",
        "6490",
        "Appliances",
        "Racold, AO Smith, V-Guard",
        "/images/electrical-shop.jpg",
        "Glass-lined tank, 5-star rated, free wall-mounting kit.",
        ask,
      ],
    ],
  });
  const rewards = rewardsApp(brand, { register: true }).app;
  const warranty = warrantyApp(brand, { products }).app;
  const app = combineApps(rewards, warranty);
  formNamed(app, "Record a purchase").intro =
    "Enter the phone number you registered with, the bill amount and what you bought. We check it against our bill book and add 2% back as a reward, usually the same day.";
  const { header, footer } = chrome(brand, {
    announcement: "Earn 2% back on every bill · Join the rewards club →",
    announcementUrl: "/rewards",
    cta: ["My rewards", "/my-rewards"],
    tagline:
      "Lighting, fans, wires and appliances · Shop 7, MG Road, Pune · Open 9:30 am–9 pm, closed Sunday",
    dark: "#26292e",
  });
  const pages = [
    page(
      "Home",
      "",
      "Volt Electricals: genuine lighting, fans, wires and switches with expert advice, 2% rewards on every bill and easy warranty registration.",
      [
        createSection("hero", {
          title: "Wire it right.\nEarn on every bill.",
          eyebrow: "ELECTRICALS · REWARDS · WARRANTY",
          body: "Genuine brands at fair prices, advice from people who’ve wired a thousand homes, and 2% back on everything you buy.",
          image: "/images/electrical-shop.jpg",
          imageAlt: "Shelves of bulbs, fans, switches and cables",
          color: "#ffffff",
          buttonLabel: "Join the rewards club",
          buttonUrl: "/rewards",
          overlay: 40,
        }),
        ui.features([
          [
            "Only genuine brands",
            "Bought from authorised distributors, with bills.",
          ],
          [
            "2% back on every bill",
            "Rewards add up; redeem them at the counter.",
          ],
          [
            "Warranty in one place",
            "Register products and check cover any time.",
          ],
        ]),
        listing(products, {
          title: "Popular this month",
          eyebrow: "IN STOCK",
          body: "Prices change with copper and brand offers. Ask us for today’s price.",
          limit: 6,
        }),
        ui.story({
          eyebrow: "HOW REWARDS WORK",
          title: "Shop. Record. Redeem.",
          body: "1. Register once with your mobile number.\n2. After you buy, record the bill on our site.\n3. We approve it and add 2% to your rewards.\n4. Use your balance on your next purchase.",
          image: "/images/switches.jpg",
          imageAlt: "A modular switch plate",
          buttonLabel: "Record a purchase",
          buttonUrl: "/rewards",
        }),
        ui.quotes("Electricians and homeowners trust us.", [
          [
            "Ramesh P., electrician",
            "I buy for every site here. Bills are always right and the rewards cover my tea and petrol.",
          ],
          [
            "Sneha K.",
            "They told me which fan would save the most power and registered the warranty for me on the spot.",
          ],
          [
            "Imran S., contractor",
            "Polycab, Anchor, Havells — always in stock, never duplicate. That matters on a big job.",
          ],
        ]),
        ui.cta(
          "ALREADY A MEMBER?",
          "See what you’ve earned.",
          "Check your reward balance and every approved bill with your phone number.",
          ["Check my rewards", "/my-rewards"],
        ),
      ],
      brand,
    ),
    page(
      "Products",
      "products",
      "Browse LED lights, BLDC fans, modular switches, FR wires, MCBs and water heaters from genuine brands at Volt Electricals.",
      [
        ui.intro(
          "WHAT WE STOCK",
          "Everything to light, cool and power a home.",
          "Over 2,000 items from 40 brands in the shop. Here are the ones people ask for most.",
        ),
        listing(products, { title: "", columns: 3 }),
        ui.cta(
          "NEED A QUOTE FOR A FULL HOUSE?",
          "Send us your list.",
          "We’ll reply with brand options and prices within a day.",
          ["Get a quote", "/contact"],
        ),
      ],
      brand,
    ),
    page(
      "Rewards",
      "rewards",
      "Join the Volt Electricals rewards club with your phone number and record your purchases to earn 2% back on every bill.",
      [
        appSection(formNamed(app, "Join rewards")),
        appSection(formNamed(app, "Record a purchase")),
        ui.faq("About the rewards club", [
          [
            "How much do I earn?",
            "2% of every approved bill. Electricians and contractors earn 3% after ₹50,000 of purchases a year.",
          ],
          [
            "How do I use my rewards?",
            "Tell us at the counter and we take it off your bill. Rewards don’t expire while your account is active.",
          ],
          [
            "Why was my purchase rejected?",
            "We match each entry with our bill book. If the amount or date doesn’t match, we’ll tell you why on your rewards page.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "My rewards",
      "my-rewards",
      "Check your Volt Electricals reward balance and the history of your approved purchases with your registered phone number.",
      [appSection(formNamed(app, "My rewards"), { padding: 64 })],
      brand,
    ),
    page(
      "Warranty",
      "warranty",
      "Register your product warranty with its serial number, and check your warranty cover any time at Volt Electricals.",
      [
        appSection(formNamed(app, "Register a product")),
        appSection(formNamed(app, "Check warranty")),
        ui.faq("Warranty help", [
          [
            "Where is the serial number?",
            "On the sticker on the box and on the product itself — under a fan’s canopy, on the side of a geyser.",
          ],
          [
            "What if something stops working?",
            "Bring it with the bill, or call us. We handle the claim with the brand’s service centre for you.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Visit Volt Electricals at Shop 7, MG Road, Pune, call us, or send your list for a quote on lights, fans and wiring.",
      [
        ui.contact(
          "Ask for a price or send your list.",
          "Shop 7, MG Road, Pune 411001 · +91 20 2613 4455 · Open 9:30 am–9 pm, closed Sunday",
        ),
        ui.faq("Good to know", [
          [
            "Do you deliver?",
            "Free delivery in Pune on orders above ₹2,000, usually the same day.",
          ],
          [
            "Can you recommend an electrician?",
            "Yes. We work with licensed electricians in every part of the city and can share a few names.",
          ],
          [
            "Do you give GST bills?",
            "Always. Add your GSTIN when you buy and it appears on the bill.",
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
    collections: [products],
    app,
    theme: {
      accent: "#e8730c",
      background: "#fbfaf8",
      color: "#24272b",
      font: "modern",
      radius: 10,
    },
  };
}
