/** Sunday Table: a restaurant that takes orders, payments and table bookings. */
import { catalog } from "../../apps/templates/catalog";
import {
  combineApps,
  formNamed,
  ordersApp,
  reservationsApp,
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

export function sundayTable(brand: string): SiteParts {
  const ui = styled("#f6ebdc", "#6f3122");
  const order = "/order";
  const menu = catalog({
    name: "Menu",
    slug: "dishes",
    singular: "Dish",
    blueprint: "menu",
    fields: [
      ["Dish", "text"],
      ["Price", "price"],
      [
        "Category",
        "choice",
        ["Starters", "Mains", "Breads", "Desserts", "Drinks"],
      ],
      ["Diet", "choice", ["Veg", "Non-veg"]],
      ["Photo", "image"],
      ["Description", "longText"],
      ["Order link", "link"],
    ],
    display: {
      title: "Dish",
      price: "Price",
      subtitle: "Diet",
      image: "Photo",
      summary: "Description",
      body: "Description",
      action: "Order link",
      actionLabel: "Order now",
    },
    rows: [
      [
        "Paneer tikka",
        "280",
        "Starters",
        "Veg",
        "/images/paneer-tikka.jpg",
        "Cottage cheese, hung-curd marinade, charred in the tandoor. Served with mint chutney.",
        order,
      ],
      [
        "Chicken 65",
        "320",
        "Starters",
        "Non-veg",
        "/images/chicken-65.jpg",
        "Crisp curry-leaf chicken with green chilli and a squeeze of lime.",
        order,
      ],
      [
        "Market salad",
        "220",
        "Starters",
        "Veg",
        "/images/salad.jpg",
        "Seasonal leaves, cucumber, roasted peanuts and a tamarind dressing.",
        order,
      ],
      [
        "Butter chicken",
        "420",
        "Mains",
        "Non-veg",
        "/images/butter-chicken.jpg",
        "Tandoor chicken in a slow-cooked tomato and butter gravy. Our most ordered dish.",
        order,
      ],
      [
        "Dal makhani",
        "300",
        "Mains",
        "Veg",
        "/images/dal-makhani.jpg",
        "Black lentils simmered overnight with cream and smoked butter.",
        order,
      ],
      [
        "Vegetable dum biryani",
        "340",
        "Mains",
        "Veg",
        "/images/biryani.jpg",
        "Basmati layered with vegetables, saffron and fried onions, sealed and slow-cooked. With raita.",
        order,
      ],
      [
        "Kerala fish curry",
        "460",
        "Mains",
        "Non-veg",
        "/images/fish-curry.jpg",
        "Seer fish in a coconut and kokum curry. Best with appam or rice.",
        order,
      ],
      [
        "Butter naan",
        "60",
        "Breads",
        "Veg",
        "/images/naan.jpg",
        "Soft, blistered and brushed with butter straight from the tandoor.",
        order,
      ],
      [
        "Garlic naan",
        "80",
        "Breads",
        "Veg",
        "/images/garlic-naan.jpg",
        "Topped with chopped garlic and coriander.",
        order,
      ],
      [
        "Tandoori roti",
        "40",
        "Breads",
        "Veg",
        "/images/roti.jpg",
        "Whole wheat, baked on the wall of the tandoor.",
        order,
      ],
      [
        "Gulab jamun",
        "120",
        "Desserts",
        "Veg",
        "/images/gulab-jamun.jpg",
        "Two warm milk dumplings in rose and cardamom syrup.",
        order,
      ],
      [
        "Rasmalai",
        "150",
        "Desserts",
        "Veg",
        "/images/rasmalai.jpg",
        "Soft cheese patties in chilled saffron milk with pistachio.",
        order,
      ],
      [
        "Sweet lassi",
        "110",
        "Drinks",
        "Veg",
        "/images/lassi.jpg",
        "Thick churned yoghurt, lightly sweetened, with a pinch of cardamom.",
        order,
      ],
      [
        "Fresh lime soda",
        "90",
        "Drinks",
        "Veg",
        "/images/lime-soda.jpg",
        "Sweet, salted or both. Made to order.",
        order,
      ],
    ],
  });
  const orders = ordersApp(brand, { menu, style: "kitchen" }).app;
  const tables = reservationsApp(brand, {
    times: ["12:30", "13:30", "14:30", "19:00", "20:00", "21:00", "22:00"],
    covers: 48,
  }).app;
  const app = combineApps(orders, tables);
  app.install = {
    enabled: true,
    name: `${brand} — order & reserve`.slice(0, 60),
    shortName: brand.slice(0, 20),
  };
  const placeOrder = formNamed(app, "Place an order");
  placeOrder.intro =
    "Pick your dishes, choose pickup or delivery (within 6 km) and pay online now or when your food arrives. Kitchen open 12–3 pm and 7–11 pm.";
  const { header, footer } = chrome(brand, {
    announcement:
      "Free delivery within 6 km on orders over ₹499 · Order online →",
    announcementUrl: order,
    cta: ["Order online", order],
    tagline:
      "North Indian and coastal kitchen · 14 Church Street, Bengaluru · 12–3 pm & 7–11 pm",
    dark: "#6f3122",
  });
  const pages = [
    page(
      "Home",
      "",
      "Order butter chicken, biryani and fresh naan online for pickup or delivery, or reserve a table at Sunday Table.",
      [
        createSection("hero", {
          title: "Good food.\nBetter company.",
          eyebrow: "ORDER ONLINE · RESERVE A TABLE",
          body: "Slow-cooked curries, breads from the tandoor and desserts worth saving room for. Delivered hot, or served at our table.",
          image: "/images/restaurant.jpg",
          imageAlt: "Plates of food on a restaurant table",
          color: "#ffffff",
          buttonLabel: "Order online",
          buttonUrl: order,
          overlay: 45,
        }),
        ui.features([
          ["Hot in 35 minutes", "Cooked to order and packed to travel."],
          ["Track every order", "See when it’s cooking and on the way."],
          ["Tables every evening", "Book a sitting in under a minute."],
        ]),
        listing(menu, {
          title: "Tonight’s favourites",
          eyebrow: "FROM THE MENU",
          body: "Tap a dish to see what’s in it, then add it to your order.",
          limit: 6,
        }),
        ui.story({
          eyebrow: "RESERVE A TABLE",
          title: "Long lunches. Late dinners.",
          body: "Forty-eight seats, a courtyard and a playlist chosen by the kitchen. Book a table for two or twenty; we confirm by message within the hour.",
          image: "/images/dish.jpg",
          imageAlt: "A shared plate at the table",
          buttonLabel: "Reserve a table",
          buttonUrl: "/reserve",
        }),
        ui.quotes("Regulars, in their words.", [
          [
            "Ananya R.",
            "The dal makhani tastes like it’s been cooking since morning — because it has. Our Friday order.",
          ],
          [
            "Farhan K.",
            "Ordered at 8, food at the door by 8:35 and still hot. The tracking page is a nice touch.",
          ],
          [
            "Meera & Joel",
            "Booked the courtyard for my mother’s birthday. They had a candle in the rasmalai without us asking.",
          ],
        ]),
        ui.cta(
          "HUNGRY ALREADY?",
          "Your table is one tap away.",
          "Order now and pay online or on delivery.",
          ["Start your order", order],
        ),
      ],
      brand,
    ),
    page(
      "Menu",
      "menu",
      "Starters, curries, biryani, breads, desserts and drinks with prices. Veg and non-veg dishes marked. Order online.",
      [
        ui.intro(
          "THE MENU",
          "Cooked fresh, twice a day.",
          "Veg and non-veg dishes are marked on every card. Prices include taxes; packing is free.",
        ),
        listing(menu, { title: "", columns: 3 }),
        ui.cta(
          "READY TO ORDER?",
          "Add dishes, choose pickup or delivery.",
          "Pay online with UPI or card, or pay when it arrives.",
          ["Order online", order],
        ),
      ],
      brand,
    ),
    page(
      "Order",
      "order",
      "Order online from Sunday Table for pickup or delivery within 6 km. Pay online or on delivery and track your order.",
      [
        appSection(placeOrder),
        ui.faq("Before you order", [
          [
            "Where do you deliver?",
            "Within 6 km of Church Street. Orders over ₹499 deliver free; below that it’s ₹40.",
          ],
          [
            "How do I pay?",
            "After placing your order you can pay by UPI or card straight away, or choose to pay cash when it arrives.",
          ],
          [
            "How long will it take?",
            "Most orders are ready in 25 minutes and reach you in about 35. Add your email and we’ll write at each step.",
          ],
          [
            "Can I change my order?",
            "Call us on +91 80 4123 7788 within five minutes of ordering and we’ll change it before it’s cooked.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Track order",
      "track",
      "Track your Sunday Table order with your order number and phone: cooking, ready for pickup, out for delivery or delivered.",
      [
        appSection(formNamed(app, "Track your order"), { padding: 64 }),
        ui.features([
          ["New", "We’ve got your order."],
          ["Preparing", "It’s on the stove."],
          ["Out for delivery", "On its way, or ready to collect."],
        ]),
      ],
      brand,
    ),
    page(
      "Reserve",
      "reserve",
      "Reserve a table at Sunday Table for lunch or dinner. Choose a date, time and party size; we confirm by message.",
      [
        appSection(formNamed(app, "Reserve a table")),
        appSection(formNamed(app, "My reservation")),
        ui.story({
          eyebrow: "OPENING HOURS",
          title: "Lunch 12–3 pm. Dinner 7–11 pm.",
          body: "Open every day except Monday lunch. Tables are held for 15 minutes; if you’re running late, call us and we’ll keep it.",
          image: "/images/salad.jpg",
          imageAlt: "A fresh salad ready to serve",
        }),
      ],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Find Sunday Table at 14 Church Street, Bengaluru. Call, message or write to us about orders, parties and catering.",
      [
        ui.contact(
          "Parties, catering or a question?",
          "14 Church Street, Bengaluru 560001 · +91 80 4123 7788\nWrite to us and we’ll reply the same day.",
        ),
        ui.faq("Good to know", [
          [
            "Do you cater events?",
            "Yes, from 20 to 200 guests. Tell us the date, headcount and menu ideas using the form above.",
          ],
          [
            "Is there parking?",
            "Valet parking after 7 pm; the Church Street multi-level car park is two minutes away.",
          ],
          [
            "Do you have Jain or vegan options?",
            "Most curries can be made without onion and garlic, and several dishes are vegan. Add a note to your order.",
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
    collections: [menu],
    app,
    theme: {
      accent: "#843d2b",
      background: "#fcf7ef",
      color: "#2d1f1a",
      font: "editorial",
      radius: 6,
    },
  };
}
