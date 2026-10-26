/** Fresh Basket: grocery delivery with a cart, delivery slots, payment and tracking. */
import { catalog } from "../../apps/templates/catalog";
import { formNamed, ordersApp } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function freshBasket(brand: string): SiteParts {
  const ui = styled("#e8f3e1", "#1f5130");
  const order = "/order";
  const products = catalog({
    name: "Groceries",
    slug: "groceries",
    singular: "Product",
    blueprint: "products",
    fields: [
      ["Product", "text"],
      ["Price", "price"],
      ["Unit", "text"],
      [
        "Category",
        "choice",
        ["Fruits", "Vegetables", "Dairy & eggs", "Staples"],
      ],
      ["Photo", "image"],
      ["Description", "longText"],
      ["Order link", "link"],
    ],
    display: {
      title: "Product",
      price: "Price",
      subtitle: "Unit",
      image: "Photo",
      summary: "Description",
      body: "Description",
      action: "Order link",
      actionLabel: "Add to my order",
    },
    rows: [
      [
        "Shimla apples",
        "180",
        "1 kg",
        "Fruits",
        "/images/fruits.jpg",
        "Crisp and sweet, picked this week in Himachal.",
        order,
      ],
      [
        "Robusta bananas",
        "60",
        "1 dozen",
        "Fruits",
        "/images/fruits.jpg",
        "Ripe and ready to eat. Great for shakes.",
        order,
      ],
      [
        "Nagpur oranges",
        "120",
        "1 kg",
        "Fruits",
        "/images/fruits.jpg",
        "Juicy, easy-peel and full of vitamin C.",
        order,
      ],
      [
        "Tomatoes",
        "40",
        "1 kg",
        "Vegetables",
        "/images/vegetables.jpg",
        "Firm, red farm tomatoes for curries and salads.",
        order,
      ],
      [
        "Onions",
        "45",
        "1 kg",
        "Vegetables",
        "/images/vegetables.jpg",
        "Medium red onions, dry and long-lasting.",
        order,
      ],
      [
        "Spinach (palak)",
        "30",
        "250 g bunch",
        "Vegetables",
        "/images/vegetables.jpg",
        "Washed and bundled the morning it’s picked.",
        order,
      ],
      [
        "Carrots",
        "50",
        "500 g",
        "Vegetables",
        "/images/vegetables.jpg",
        "Sweet Ooty carrots for halwa, salads or juice.",
        order,
      ],
      [
        "Toned milk",
        "56",
        "1 litre",
        "Dairy & eggs",
        "/images/dairy.jpg",
        "Pasteurised, delivered chilled in the morning slot.",
        order,
      ],
      [
        "Farm eggs",
        "84",
        "12 eggs",
        "Dairy & eggs",
        "/images/dairy.jpg",
        "Brown eggs from free-range hens near Hosur.",
        order,
      ],
      [
        "Fresh paneer",
        "95",
        "200 g",
        "Dairy & eggs",
        "/images/dairy.jpg",
        "Soft malai paneer, made daily.",
        order,
      ],
      [
        "Sona masoori rice",
        "340",
        "5 kg",
        "Staples",
        "/images/staples.jpg",
        "Aged, light and fluffy everyday rice.",
        order,
      ],
      [
        "Toor dal",
        "165",
        "1 kg",
        "Staples",
        "/images/staples.jpg",
        "Unpolished, cooks soft in two whistles.",
        order,
      ],
      [
        "Cold-pressed groundnut oil",
        "290",
        "1 litre",
        "Staples",
        "/images/staples.jpg",
        "Wood-pressed, nothing added.",
        order,
      ],
      [
        "Whole wheat atta",
        "245",
        "5 kg",
        "Staples",
        "/images/staples.jpg",
        "Stone-ground for soft rotis.",
        order,
      ],
    ],
  });
  const app = ordersApp(brand, {
    menu: products,
    style: "shop",
    slots: { options: ["7–9 am", "9–11 am", "5–7 pm", "7–9 pm"], max: 25 },
  }).app;
  const { header, footer } = chrome(brand, {
    announcement: "Free delivery over ₹399 · Pick a slot that suits you →",
    announcementUrl: order,
    cta: ["Order now", order],
    tagline:
      "Fresh fruit, vegetables, dairy and staples delivered in two-hour slots across Whitefield, Bengaluru",
    dark: "#1f5130",
  });
  const pages = [
    page(
      "Home",
      "",
      "Fresh Basket delivers fruit, vegetables, milk and staples in Whitefield in two-hour slots. Order online, pay and track delivery.",
      [
        createSection("hero", {
          title: "Farm fresh.\nAt your door by 9.",
          eyebrow: "GROCERIES IN TWO-HOUR SLOTS",
          body: "Fruit and vegetables picked yesterday, milk from this morning and pantry staples at market prices. Choose your slot, we’ll be there.",
          image: "/images/groceries.jpg",
          imageAlt: "A basket of fresh vegetables and fruit",
          color: "#ffffff",
          buttonLabel: "Start shopping",
          buttonUrl: order,
          overlay: 35,
        }),
        ui.features([
          ["Pick your slot", "Morning or evening, today or tomorrow."],
          ["Pay your way", "UPI or card online, or cash on delivery."],
          ["Track every order", "From packing to your doorstep."],
        ]),
        listing(products, {
          title: "Fresh today",
          eyebrow: "THE SHOP",
          limit: 8,
          columns: 4,
        }),
        ui.story({
          eyebrow: "WHERE IT COMES FROM",
          title: "From 30 farms to 3,000 kitchens.",
          body: "We buy directly from farmers around Kolar and Hosur, pack orders at our Whitefield store and deliver on electric scooters. No cold storage, no long waits.",
          image: "/images/vegetables.jpg",
          imageAlt: "Fresh vegetables",
          buttonLabel: "See everything",
          buttonUrl: "/shop",
        }),
        ui.quotes("Neighbours who order every week.", [
          [
            "Shalini G., Brigade Metropolis",
            "Tomatoes that actually taste like tomatoes. The 7 am slot means milk before the kids wake up.",
          ],
          [
            "Abhishek N., Prestige Shantiniketan",
            "Order at night, tracked it in the morning, delivered right on time.",
          ],
          [
            "Fatima H., ITPL Main Road",
            "Prices are better than the supermarket and the paneer is the softest we’ve found.",
          ],
        ]),
        ui.cta(
          "YOUR WEEKLY SHOP, SORTED",
          "Fill your basket in five minutes.",
          "Free delivery over ₹399.",
          ["Order now", order],
        ),
      ],
      brand,
    ),
    page(
      "Shop",
      "shop",
      "Shop fresh fruit, vegetables, milk, eggs, paneer, rice, dal, oil and atta from Fresh Basket, with prices per unit.",
      [
        ui.intro(
          "THE SHOP",
          "Everything for this week’s kitchen.",
          "Prices are per unit shown. Fruit and vegetables are weighed when packed; we never charge more than the price you saw.",
        ),
        listing(products, { title: "", columns: 4 }),
        ui.cta(
          "GOT YOUR LIST?",
          "Add it to your basket.",
          "Choose quantities, a delivery slot and how you’d like to pay.",
          ["Order now", order],
        ),
      ],
      brand,
    ),
    page(
      "Order",
      "order",
      "Order groceries from Fresh Basket: add products, choose a delivery date and two-hour slot, and pay online or on delivery.",
      [
        appSection(formNamed(app, "Place an order")),
        ui.faq("Delivery and payment", [
          [
            "Where do you deliver?",
            "Whitefield, Brookefield, Kadugodi, Hoodi and Varthur. Delivery is free over ₹399, otherwise ₹30.",
          ],
          [
            "What if a slot is full?",
            "The form tells you straight away. Each slot takes 25 orders so we’re always on time; pick the next one.",
          ],
          [
            "What if something isn’t fresh?",
            "Tell the delivery partner or message us the same day and we refund it, no questions asked.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Track order",
      "track",
      "Track your Fresh Basket order with your order number and phone: packing, out for delivery or delivered, with your slot.",
      [appSection(formNamed(app, "Track your order"), { padding: 64 })],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Contact Fresh Basket in Whitefield, Bengaluru about an order, bulk buying for your apartment or selling your farm produce with us.",
      [
        ui.contact(
          "A question about your order?",
          "Fresh Basket, 41 ITPL Main Road, Whitefield, Bengaluru 560066 · +91 80 4567 2020 · 6 am–10 pm",
        ),
        ui.faq("Good to know", [
          [
            "Do you take bulk orders?",
            "Yes, for apartment associations, offices and events. Tell us what you need above.",
          ],
          [
            "I’m a farmer. Can I sell through you?",
            "We’re always looking for growers within 80 km. Write to us with what you grow.",
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
      accent: "#2f9e44",
      background: "#f8fbf5",
      color: "#1d2b1f",
      font: "modern",
      radius: 14,
      buttons: "pill",
    },
  };
}
