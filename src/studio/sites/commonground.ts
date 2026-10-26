/** Common Ground: a community studio that sells workshop seats and hires hosts. */
import { catalog } from "../../apps/templates/catalog";
import {
  combineApps,
  eventsApp,
  formNamed,
  hiringApp,
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

export function commonGround(brand: string): SiteParts {
  const ui = styled("#f2ebdf", "#4a3a29");
  const register = "/register";
  const events = catalog({
    name: "Events",
    singular: "Event",
    blueprint: "events",
    fields: [
      ["Event", "text"],
      ["Date", "date"],
      ["Price", "price"],
      ["Seats", "number"],
      ["Time and venue", "text"],
      ["Photo", "image"],
      ["Details", "longText"],
      ["Register link", "link"],
    ],
    display: {
      title: "Event",
      subtitle: "Date",
      price: "Price",
      summary: "Time and venue",
      image: "Photo",
      body: "Details",
      action: "Register link",
      actionLabel: "Book seats",
    },
    rows: [
      [
        "Wheel pottery for beginners",
        "2026-11-08",
        "1800",
        "12",
        "Sat 10 am–1 pm · Clay studio",
        "/images/interior.jpg",
        "Centre, throw and trim your first bowls. Clay, tools and firing included; collect your glazed pieces two weeks later.",
        register,
      ],
      [
        "Sourdough Sunday",
        "2026-11-15",
        "1500",
        "10",
        "Sun 9 am–12 pm · Kitchen",
        "/images/breads.jpg",
        "Feed a starter, shape a loaf and bake it in our oven. You take home bread, starter and a printed guide.",
        register,
      ],
      [
        "Urban sketching walk",
        "2026-11-22",
        "900",
        "20",
        "Sun 7–10 am · Meet at the studio",
        "/images/architecture.jpg",
        "Sketch old Bengaluru’s doorways and balconies with a working illustrator. Bring any pen; we bring stools and paper.",
        register,
      ],
      [
        "Terrarium making",
        "2026-11-29",
        "1600",
        "14",
        "Sat 4–6 pm · Garden room",
        "/images/botanical.jpg",
        "Build a closed glass garden with moss, ferns and stones, and learn how to keep it happy for years.",
        register,
      ],
      [
        "Founders’ breakfast",
        "2026-12-06",
        "0",
        "40",
        "Sat 8:30–10 am · Café",
        "/images/restaurant.jpg",
        "A friendly morning for small-business owners: one short talk, good coffee and the people you should meet.",
        register,
      ],
    ],
  });
  const jobs = catalog({
    name: "Open roles",
    slug: "jobs",
    singular: "Role",
    blueprint: "jobs",
    fields: [
      ["Role", "text"],
      ["Location", "text"],
      ["Type", "choice", ["Full-time", "Part-time", "Contract"]],
      ["Description", "longText"],
      ["Apply link", "link"],
    ],
    display: {
      title: "Role",
      subtitle: "Type",
      summary: "Location",
      body: "Description",
      action: "Apply link",
      actionLabel: "Apply for this role",
    },
    rows: [
      [
        "Workshop host",
        "Indiranagar studio",
        "Part-time",
        "Welcome guests, set up rooms and keep workshops running on time. Weekends, 12–16 hours a week.",
        "/careers",
      ],
      [
        "Community manager",
        "Indiranagar studio",
        "Full-time",
        "Plan our calendar, look after members and teachers, and grow our newsletter. Two years’ experience in events or hospitality.",
        "/careers",
      ],
      [
        "Café barista",
        "Indiranagar studio",
        "Part-time",
        "Make great coffee for workshop guests and members. Mornings, five days a week.",
        "/careers",
      ],
    ],
  });
  const app = combineApps(
    eventsApp(brand, { events }).app,
    hiringApp(brand, { jobs }).app,
  );
  app.install = {
    enabled: true,
    name: `${brand} tickets`.slice(0, 60),
    shortName: "Tickets",
  };
  const { header, footer } = chrome(brand, {
    announcement: "New workshops every weekend · See what’s on →",
    announcementUrl: "/events",
    cta: ["Book seats", register],
    tagline:
      "Workshops, events and a café · 12th Main, Indiranagar, Bengaluru · Open 8 am–9 pm",
    dark: "#4a3a29",
  });
  const pages = [
    page(
      "Home",
      "",
      "Common Ground in Indiranagar: weekend workshops in pottery, baking, sketching and plants. Book seats online; we’re hiring too.",
      [
        createSection("hero", {
          title: "Make something.\nMeet someone.",
          eyebrow: "WORKSHOPS · EVENTS · COMMUNITY",
          body: "Small, hands-on workshops led by people who love their craft. Come alone, leave with something you made and a few new friends.",
          image: "/images/interior.jpg",
          imageAlt: "A bright studio space",
          color: "#ffffff",
          buttonLabel: "See what’s on",
          buttonUrl: "/events",
          overlay: 35,
        }),
        ui.features([
          ["Small groups", "Never more than twenty at a table."],
          ["Everything included", "Materials, tools and tea are on us."],
          ["Tickets on your phone", "Find your booking with your email."],
        ]),
        listing(events, {
          title: "Coming up",
          eyebrow: "EVENTS",
          body: "Seats are limited and bookings close when an event is full.",
          limit: 3,
        }),
        ui.story({
          eyebrow: "OUR SPACE",
          title: "A studio, a kitchen, a garden room and a café.",
          body: "Common Ground started as a pottery wheel in a garage. Today it’s a home for forty teachers and thousands of curious people every year.",
          image: "/images/garden.jpg",
          imageAlt: "Tools in the garden room",
          buttonLabel: "Join the team",
          buttonUrl: "/careers",
        }),
        ui.quotes("What guests say.", [
          [
            "Divya P.",
            "I booked the pottery class alone and ended up with a bowl, a new hobby and two friends.",
          ],
          [
            "Rohan M.",
            "The sourdough morning was perfectly paced. My loaf actually rose!",
          ],
          [
            "Nisha & Arun",
            "Booked four seats for the terrarium workshop in a minute. Our ticket was in the inbox right away.",
          ],
        ]),
        ui.cta(
          "THIS WEEKEND",
          "Grab a seat before they’re gone.",
          "Choose an event and how many seats you need.",
          ["Book seats", register],
        ),
      ],
      brand,
    ),
    page(
      "Events",
      "events",
      "Upcoming workshops and events at Common Ground: pottery, sourdough, urban sketching, terrariums and founders’ breakfasts.",
      [
        ui.intro(
          "WHAT’S ON",
          "Workshops and events this season.",
          "Every booking includes materials. Free events still need a seat booked.",
        ),
        listing(events, { title: "", columns: 3 }),
        ui.cta(
          "FOUND ONE YOU LIKE?",
          "Book your seats.",
          "We confirm by email with payment details for paid workshops.",
          ["Book seats", register],
        ),
      ],
      brand,
    ),
    page(
      "Book seats",
      "register",
      "Book seats for a Common Ground workshop or event. Pick the event and number of seats; we confirm by email.",
      [
        appSection(formNamed(app, "Register")),
        ui.faq("Booking questions", [
          [
            "How do I pay?",
            "We email payment details (UPI or card link) when we confirm your seats. Seats are held for 24 hours.",
          ],
          [
            "Can I cancel?",
            "Cancel up to 48 hours before for a full refund, or pass your seat to a friend any time.",
          ],
          [
            "Is there an age limit?",
            "Most workshops are for 16 and over. Family sessions are marked in the event details.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "My tickets",
      "my-tickets",
      "Find your Common Ground booking with your ticket reference and email: event, seats and whether it’s confirmed.",
      [appSection(formNamed(app, "My tickets"), { padding: 64 })],
      brand,
    ),
    page(
      "Careers",
      "careers",
      "Work at Common Ground: open roles for workshop hosts, a community manager and baristas in Indiranagar. Apply and track your application.",
      [
        ui.intro(
          "CAREERS",
          "Help people make things.",
          "We’re a small, friendly team. Pay is fair, schedules are predictable and every role comes with free workshops.",
        ),
        listing(jobs, { title: "Open roles", style: "list", columns: 1 }),
        appSection(formNamed(app, "Apply")),
        appSection(formNamed(app, "Application status")),
      ],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Contact Common Ground at 12th Main, Indiranagar, Bengaluru about private workshops, team events and teaching with us.",
      [
        ui.contact(
          "Private workshops, team days or teaching with us?",
          "12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560038 · +91 80 4098 2211",
        ),
        ui.faq("Good to know", [
          [
            "Can we book a private workshop?",
            "Yes, for groups of 8 to 30 — birthdays, team days or a hen party. Tell us the date and craft above.",
          ],
          [
            "I’d like to teach.",
            "Wonderful. Tell us what you make and send a few photos; we reply to every teacher.",
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
    collections: [events, jobs],
    app,
    theme: {
      accent: "#68533d",
      background: "#fbf8f2",
      color: "#2f281f",
      font: "editorial",
      radius: 4,
    },
  };
}
