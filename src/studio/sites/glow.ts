/** Glow Studio: a salon that books services into free time slots. */
import { catalog } from "../../apps/templates/catalog";
import { appointmentsApp, formNamed } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function glow(brand: string): SiteParts {
  const ui = styled("#f7e8e3", "#5a2f29");
  const book = "/book";
  const services = catalog({
    name: "Services",
    singular: "Service",
    blueprint: "services",
    fields: [
      ["Service", "text"],
      ["Price", "price"],
      ["Duration", "text"],
      ["Category", "choice", ["Hair", "Skin", "Nails", "Bridal"]],
      ["Description", "longText"],
      ["Booking link", "link"],
    ],
    display: {
      title: "Service",
      price: "Price",
      subtitle: "Duration",
      summary: "Description",
      body: "Description",
      action: "Booking link",
      actionLabel: "Book this",
    },
    rows: [
      [
        "Haircut and blow-dry",
        "650",
        "45 min",
        "Hair",
        "A consultation, wash, cut and finish by a senior stylist.",
        book,
      ],
      [
        "Global hair colour",
        "2800",
        "2 hr",
        "Hair",
        "Ammonia-free colour, root to tip, with a gloss treatment.",
        book,
      ],
      [
        "Keratin smoothening",
        "4500",
        "3 hr",
        "Hair",
        "Frizz-free, shiny hair for up to four months.",
        book,
      ],
      [
        "Hydrating facial",
        "1800",
        "60 min",
        "Skin",
        "Deep cleanse, exfoliation, hydrating mask and massage.",
        book,
      ],
      [
        "Express clean-up",
        "900",
        "40 min",
        "Skin",
        "A quick refresh before an event or after a long week.",
        book,
      ],
      [
        "Classic manicure",
        "700",
        "40 min",
        "Nails",
        "Shape, cuticle care, massage and a polish of your choice.",
        book,
      ],
      [
        "Spa pedicure",
        "950",
        "50 min",
        "Nails",
        "Soak, scrub, mask and massage for tired feet.",
        book,
      ],
      [
        "Gel nails",
        "1200",
        "60 min",
        "Nails",
        "Long-lasting gel polish, cured in minutes, chip-free for weeks.",
        book,
      ],
      [
        "Bridal makeup trial",
        "3500",
        "2 hr",
        "Bridal",
        "Try your wedding look with our lead artist, including hair styling.",
        book,
      ],
    ],
  });
  const app = appointmentsApp(brand, {
    services,
    times: [
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
    ],
    perSlot: 3,
  }).app;
  const { header, footer } = chrome(brand, {
    announcement: "New here? 15% off your first visit · Book online →",
    announcementUrl: book,
    cta: ["Book now", book],
    tagline:
      "Hair, skin and nails · 2nd floor, 88 Linking Road, Bandra West, Mumbai · Open 10 am–8 pm, Tuesday to Sunday",
    dark: "#5a2f29",
  });
  const pages = [
    page(
      "Home",
      "",
      "Glow Studio in Bandra: haircuts, colour, facials, nails and bridal makeup. See prices and book a free time slot online.",
      [
        createSection("hero", {
          title: "Leave glowing.",
          eyebrow: "HAIR · SKIN · NAILS",
          body: "Unhurried appointments with senior stylists, honest prices and products that are kind to your hair and skin.",
          image: "/images/salon.jpg",
          imageAlt: "A salon chair in front of a round mirror",
          color: "#ffffff",
          buttonLabel: "Book an appointment",
          buttonUrl: book,
          overlay: 30,
        }),
        ui.features([
          ["Book in a minute", "See open slots and pick one that suits you."],
          ["Prices on the menu", "What you see is what you pay."],
          [
            "Reminders by email",
            "We confirm and remind you before your visit.",
          ],
        ]),
        listing(services, {
          title: "Our most booked services",
          eyebrow: "THE MENU",
          style: "list",
          columns: 1,
          limit: 5,
        }),
        ui.story({
          eyebrow: "THE STUDIO",
          title: "Three chairs. Zero rush.",
          body: "We book only three guests an hour, so your stylist has time to listen. Tea, good music and a window seat over Linking Road.",
          image: "/images/salon.jpg",
          imageAlt: "Inside the studio",
          buttonLabel: "See all services",
          buttonUrl: "/services",
        }),
        ui.quotes("Kind words from our chairs.", [
          [
            "Aisha M.",
            "Best haircut I’ve had in years, and they actually listened to what I wanted.",
          ],
          [
            "Priyanka D.",
            "My keratin lasted four months. Booking online took less than a minute.",
          ],
          [
            "Rhea S.",
            "Did my bridal trial here and booked the wedding on the spot. Calm, kind and so talented.",
          ],
        ]),
        ui.cta(
          "TREAT YOURSELF",
          "Your chair is waiting.",
          "Pick a service and a time; we’ll confirm within the hour.",
          ["Book now", book],
        ),
      ],
      brand,
    ),
    page(
      "Services",
      "services",
      "Glow Studio price list: haircuts, global colour, keratin, facials, manicure, pedicure, gel nails and bridal makeup.",
      [
        ui.intro(
          "SERVICES & PRICES",
          "Something for every kind of day.",
          "Prices include taxes. Longer or thicker hair may take a little longer; we’ll let you know before we start.",
        ),
        listing(services, { title: "", style: "list", columns: 1 }),
        ui.cta(
          "FOUND IT?",
          "Book a time that suits you.",
          "Choose the service in the booking form and see what’s free.",
          ["Book now", book],
        ),
      ],
      brand,
    ),
    page(
      "Book",
      "book",
      "Book a haircut, facial, nails or bridal trial at Glow Studio. Choose a service, date and time; we confirm by email.",
      [
        appSection(formNamed(app, "Book an appointment")),
        ui.faq("Before your visit", [
          [
            "Can I cancel or move my booking?",
            "Of course — call or message us at least three hours before and we’ll find you another slot.",
          ],
          [
            "What if I’m late?",
            "We keep your slot for 15 minutes. After that we may need to shorten the service or rebook.",
          ],
          [
            "Do you do home visits?",
            "For bridal parties of four or more. Mention it in the notes and we’ll call you.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "My bookings",
      "my-bookings",
      "See your upcoming and past Glow Studio appointments and whether they’re confirmed, using the phone number you booked with.",
      [appSection(formNamed(app, "My bookings"), { padding: 64 })],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Visit Glow Studio on the 2nd floor, 88 Linking Road, Bandra West, Mumbai. Call or message us about bookings and bridal packages.",
      [
        ui.contact(
          "Questions, gift cards or bridal packages?",
          "2nd floor, 88 Linking Road, Bandra West, Mumbai 400050 · +91 98200 45612\nOpen 10 am–8 pm, Tuesday to Sunday.",
        ),
        ui.faq("Good to know", [
          [
            "Do you sell gift cards?",
            "Yes, from ₹1,000. Ask us here and we’ll send one by email.",
          ],
          [
            "Which products do you use?",
            "Olaplex, Kérastase and cruelty-free skincare. Tell us about any allergies when you book.",
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
    collections: [services],
    app,
    theme: {
      accent: "#a65a50",
      background: "#fdf8f6",
      color: "#3a2a27",
      font: "classic",
      radius: 18,
      buttons: "pill",
    },
  };
}
