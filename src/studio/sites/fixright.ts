/** FixRight: home services that take requests, schedule technicians and track visits. */
import { catalog } from "../../apps/templates/catalog";
import { formNamed, serviceApp } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function fixRight(brand: string): SiteParts {
  const ui = styled("#e9f0fb", "#14335f");
  const book = "/book-a-visit";
  const services = catalog({
    name: "Services",
    singular: "Service",
    blueprint: "services",
    fields: [
      ["Service", "text"],
      ["Price", "price"],
      [
        "Category",
        "choice",
        ["Electrical", "Plumbing", "AC & appliances", "Carpentry", "Cleaning"],
      ],
      ["Time", "text"],
      ["Description", "longText"],
      ["Booking link", "link"],
    ],
    display: {
      title: "Service",
      price: "Price",
      subtitle: "Category",
      summary: "Description",
      body: "Description",
      action: "Booking link",
      actionLabel: "Book a visit",
    },
    rows: [
      [
        "AC service (split or window)",
        "599",
        "AC & appliances",
        "45–60 min",
        "Filter and coil cleaning, gas pressure check and drain flush.",
        book,
      ],
      [
        "AC gas refill",
        "2499",
        "AC & appliances",
        "90 min",
        "Leak test, repair of minor leaks and a full refill. 30-day cooling guarantee.",
        book,
      ],
      [
        "Washing machine repair",
        "399",
        "AC & appliances",
        "1 hr",
        "Visit and diagnosis; parts quoted before we fit them.",
        book,
      ],
      [
        "Fan or light installation",
        "149",
        "Electrical",
        "30 min",
        "Ceiling fans, wall lights and chandeliers, safely mounted.",
        book,
      ],
      [
        "Switchboard or wiring repair",
        "249",
        "Electrical",
        "1 hr",
        "Sparking sockets, tripping MCBs, loose connections.",
        book,
      ],
      [
        "Tap, leak or flush repair",
        "199",
        "Plumbing",
        "45 min",
        "Dripping taps, leaking pipes and running flushes fixed.",
        book,
      ],
      [
        "Bathroom fittings installation",
        "499",
        "Plumbing",
        "1–2 hr",
        "Showers, geysers, basins and health faucets.",
        book,
      ],
      [
        "Door, hinge and lock repair",
        "299",
        "Carpentry",
        "1 hr",
        "Sagging doors, broken hinges, new locks and handles.",
        book,
      ],
      [
        "Deep home cleaning (2 BHK)",
        "3999",
        "Cleaning",
        "5–6 hr",
        "Kitchen degreasing, bathrooms, floors, windows and fans by a team of three.",
        book,
      ],
    ],
  });
  const app = serviceApp(brand, { services }).app;
  const { header, footer } = chrome(brand, {
    announcement: "Same-day visits in Hyderabad · Book before 2 pm →",
    announcementUrl: book,
    cta: ["Book a visit", book],
    tagline:
      "Verified technicians for repairs, installations and cleaning · Hyderabad and Secunderabad · 8 am–8 pm, all week",
    dark: "#14335f",
  });
  const pages = [
    page(
      "Home",
      "",
      "FixRight sends verified technicians for AC service, electrical, plumbing, carpentry and cleaning. Book online and track your visit.",
      [
        createSection("hero", {
          title: "Fixed right.\nThe first time.",
          eyebrow: "REPAIRS · INSTALLATION · CLEANING",
          body: "Background-checked technicians, fixed visit prices and a 30-day guarantee on every job. Book in a minute, track it to the door.",
          image: "/images/home-tools.jpg",
          imageAlt: "A toolbox, wrench and screwdriver",
          color: "#ffffff",
          buttonLabel: "Book a visit",
          buttonUrl: book,
          overlay: 35,
        }),
        ui.features([
          ["Fixed visit prices", "Parts quoted before we start. No surprises."],
          ["Track your request", "See when it’s scheduled and who’s coming."],
          ["30-day guarantee", "If it breaks again, we come back free."],
        ]),
        listing(services, {
          title: "What we fix",
          eyebrow: "SERVICES",
          style: "list",
          columns: 2,
          limit: 6,
        }),
        ui.story({
          eyebrow: "HOW IT WORKS",
          title: "Request. Schedule. Done.",
          body: "1. Choose a service and tell us what’s wrong.\n2. We schedule a technician and email you their name.\n3. They fix it; you pay only for what was done.\n4. Track every step with your reference number.",
          image: "/images/ac-service.jpg",
          imageAlt: "An air conditioner being serviced",
          buttonLabel: "Track a request",
          buttonUrl: "/track",
        }),
        ui.quotes("Homes we’ve looked after.", [
          [
            "Lakshmi V., Kondapur",
            "AC was cooling again within an hour. The technician showed me the dirty filter before and after.",
          ],
          [
            "Arjun T., Gachibowli",
            "Booked at 10, plumber at the door by 1. Price was exactly what the site said.",
          ],
          [
            "Nikhita R., Banjara Hills",
            "The deep clean team was on time, careful with our things and left the kitchen sparkling.",
          ],
        ]),
        ui.cta(
          "SOMETHING NOT WORKING?",
          "We’ll have someone there today.",
          "Book before 2 pm for a same-day visit.",
          ["Book a visit", book],
        ),
      ],
      brand,
    ),
    page(
      "Services",
      "services",
      "FixRight services and visit prices: AC service and gas refill, appliance repair, electrical, plumbing, carpentry and deep cleaning.",
      [
        ui.intro(
          "SERVICES & PRICES",
          "One call for everything at home.",
          "Prices are for the visit and labour. Any parts are quoted and agreed before we fit them.",
        ),
        listing(services, { title: "", style: "list", columns: 2 }),
        ui.cta(
          "KNOW WHAT YOU NEED?",
          "Book a technician.",
          "Pick the service and a time that suits you.",
          ["Book a visit", book],
        ),
      ],
      brand,
    ),
    page(
      "Book a visit",
      "book-a-visit",
      "Book a FixRight technician: choose the service, describe the problem and pick a date and time. We confirm by email.",
      [
        appSection(formNamed(app, "Request service")),
        ui.faq("Before we visit", [
          [
            "How do I pay?",
            "Pay the technician by UPI, card or cash once the job is done. You’ll see the final charge on your tracking page.",
          ],
          [
            "What if it can’t be fixed on the spot?",
            "We quote for the part, order it and come back. The second visit is free.",
          ],
          [
            "Do you work on Sundays?",
            "Yes, 8 am to 8 pm every day, including most holidays.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Track",
      "track",
      "Track your FixRight service request with your reference number and phone: scheduled, technician assigned, done and charge.",
      [appSection(formNamed(app, "Track request"), { padding: 64 })],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Contact FixRight for repairs, installations, cleaning and annual maintenance contracts for homes and offices in Hyderabad.",
      [
        ui.contact(
          "Offices, societies or a big job?",
          "Ask about annual maintenance contracts for homes, offices and apartment societies.\n+91 40 4852 1100 · Plot 21, Madhapur, Hyderabad 500081",
        ),
        ui.faq("Good to know", [
          [
            "Are your technicians verified?",
            "Every technician is ID- and police-verified and trained by us before their first visit.",
          ],
          [
            "Which areas do you cover?",
            "All of Hyderabad and Secunderabad within the Outer Ring Road.",
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
      accent: "#1f6feb",
      background: "#f7f9fc",
      color: "#1b2433",
      font: "modern",
      radius: 12,
    },
  };
}
