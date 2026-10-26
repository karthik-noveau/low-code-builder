/** Forma Studio: a design studio with case studies and a quote pipeline. */
import { catalog } from "../../apps/templates/catalog";
import { enquiriesApp, formNamed } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function formaStudio(brand: string): SiteParts {
  const ui = styled("#ecebe5", "#2f3439");
  const start = "/start-a-project";
  const work = catalog({
    name: "Work",
    singular: "Project",
    blueprint: "posts",
    fields: [
      ["Project", "text"],
      ["Type", "choice", ["Residential", "Workplace", "Hospitality", "Retail"]],
      ["Cover", "image"],
      ["Summary", "text"],
      ["Story", "longText"],
      ["Enquire link", "link"],
    ],
    display: {
      title: "Project",
      subtitle: "Type",
      image: "Cover",
      summary: "Summary",
      body: "Story",
      action: "Enquire link",
      actionLabel: "Start a project like this",
    },
    rows: [
      [
        "The Courtyard House",
        "Residential",
        "/images/architecture.jpg",
        "A 1970s bungalow opened around a planted courtyard.",
        "The family wanted light without losing privacy. We removed two internal walls, turned the old garage into a study and built the house around a courtyard with a neem tree at its centre.\n\nCompleted in 11 months · 3,200 sq ft · Alibaug",
        start,
      ],
      [
        "Fernhill offices",
        "Workplace",
        "/images/interior.jpg",
        "A 60-person office that feels like a library.",
        "Quiet zones, two kinds of meeting rooms and a kitchen people actually use. Acoustic timber ceilings cut noise by half compared with the client’s old floor.\n\nCompleted in 5 months · 9,000 sq ft · Lower Parel, Mumbai",
        start,
      ],
      [
        "Juniper café",
        "Hospitality",
        "/images/restaurant.jpg",
        "A neighbourhood café with a long shared table.",
        "Terrazzo made from local stone, lime-washed walls and one long table for strangers to share. Covers went from 40 to 70 without feeling crowded.\n\nCompleted in 10 weeks · 1,800 sq ft · Bandra",
        start,
      ],
      [
        "Rooftop kitchen garden",
        "Residential",
        "/images/garden.jpg",
        "An unused terrace turned into a garden that feeds a family.",
        "Raised beds, drip irrigation and a shaded seating deck on a 900 sq ft roof. The family now grows most of its greens.\n\nCompleted in 6 weeks · Pune",
        start,
      ],
      [
        "Botanical store",
        "Retail",
        "/images/botanical.jpg",
        "A plant shop designed around natural light.",
        "Tiered display shelves, a potting bench in the window and a layout that walks customers past every plant. Sales per square foot rose 30% in the first quarter.\n\nCompleted in 8 weeks · 1,200 sq ft · Koregaon Park, Pune",
        start,
      ],
    ],
  });
  const app = enquiriesApp(brand, {
    kinds: [
      "Home or apartment",
      "Office or studio",
      "Café, restaurant or hotel",
      "Shop or showroom",
    ],
  }).app;
  const { header, footer } = chrome(brand, {
    announcement: "Now taking projects for spring 2027 · Start a project →",
    announcementUrl: start,
    cta: ["Start a project", start],
    tagline:
      "Architecture and interiors · 4th floor, Kamala Mills, Lower Parel, Mumbai",
    dark: "#2f3439",
  });
  footer[0].body =
    "Architecture and interiors · 4th floor, Kamala Mills, Lower Parel, Mumbai · studio hours 10 am–7 pm";
  header[0].hidden = true;
  const pages = [
    page(
      "Home",
      "",
      "Forma Studio designs homes, workplaces, cafés and shops in Mumbai and Pune. See our work and start a project with a quote.",
      [
        createSection("hero", {
          title: "Considered spaces.\nLasting impressions.",
          eyebrow: "INDEPENDENT ARCHITECTURE & INTERIORS STUDIO",
          body: "We design homes, workplaces and places to eat that feel calm, work hard and age well.",
          image: "/images/architecture.jpg",
          imageAlt: "A modern building with clean lines",
          color: "#ffffff",
          buttonLabel: "See our work",
          buttonUrl: "/work",
          overlay: 30,
        }),
        ui.features([
          ["A clear quote", "Fixed design fee after a free first call."],
          ["One team, start to finish", "Design, drawings and site visits."],
          ["Track your enquiry", "See where it stands and any quote online."],
        ]),
        listing(work, {
          title: "Selected work",
          eyebrow: "CASE STUDIES",
          limit: 3,
        }),
        ui.story({
          eyebrow: "THE STUDIO",
          title: "Twelve people. Forty projects. One way of working.",
          body: "We listen first, draw second and stay on site until the last shelf is up. Most of our work comes from clients who’ve worked with us before.",
          image: "/images/interior.jpg",
          imageAlt: "A calm interior with timber details",
          buttonLabel: "About the studio",
          buttonUrl: "/studio",
        }),
        ui.quotes("Clients, in their words.", [
          [
            "Nandini & Rahul, The Courtyard House",
            "They found light in a house we thought was hopelessly dark. We still can’t believe it’s the same place.",
          ],
          [
            "Sameer K., Fernhill",
            "Our team asks to come into the office now. That says everything.",
          ],
          [
            "Tara J., Juniper café",
            "On time, on budget and they knew exactly where to spend and where to save.",
          ],
        ]),
        ui.cta(
          "HAVE A SPACE IN MIND?",
          "Tell us about it.",
          "Share your budget and timeline; we reply within two working days.",
          ["Start a project", start],
        ),
      ],
      brand,
    ),
    page(
      "Work",
      "work",
      "Forma Studio case studies: homes, offices, cafés and shops in Mumbai, Pune and Alibaug, with the story behind each project.",
      [
        ui.intro(
          "OUR WORK",
          "Work with a point of view.",
          "Every project starts with how people will use a space. Open one to read how it came together.",
        ),
        listing(work, { title: "", columns: 2 }),
      ],
      brand,
    ),
    page(
      "Studio",
      "studio",
      "About Forma Studio: an architecture and interiors practice of twelve in Lower Parel, Mumbai, and how we work with clients.",
      [
        ui.story({
          eyebrow: "ABOUT US",
          title: "People. Purpose. Possibility.",
          body: "Founded in 2014 by architects Ira Mehta and Dev Shah, Forma Studio works on a handful of projects at a time so every client gets a partner, not a junior.",
          image: "/images/interior.jpg",
          imageAlt: "The studio’s work table",
        }),
        ui.features([
          ["1. First call", "Free, 30 minutes, about your space and budget."],
          [
            "2. Quote and concept",
            "A fixed fee and a first idea within two weeks.",
          ],
          [
            "3. Design and build",
            "Drawings, approvals and weekly site visits.",
          ],
        ]),
        ui.contact(
          "Prefer to just say hello?",
          "4th floor, Kamala Mills, Lower Parel, Mumbai 400013 · +91 22 4970 3300",
        ),
      ],
      brand,
    ),
    page(
      "Start a project",
      "start-a-project",
      "Start a project with Forma Studio: tell us about your space, budget and timeline, and we’ll reply with next steps and a quote.",
      [
        appSection(formNamed(app, "Start a project")),
        ui.faq("Working with us", [
          [
            "How much does design cost?",
            "Our design fee is usually 8–12% of the build cost, fixed in writing before we start.",
          ],
          [
            "Do you work outside Mumbai?",
            "Yes — Pune, Alibaug and Goa regularly, and further for the right project.",
          ],
          [
            "How soon can you start?",
            "We’re taking projects for spring 2027. Small consultations can start within a month.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Track enquiry",
      "track-enquiry",
      "Check your Forma Studio enquiry with your reference and email: whether it’s been reviewed, your quote, and the decision.",
      [appSection(formNamed(app, "Track enquiry"), { padding: 64 })],
      brand,
    ),
  ];
  return {
    header,
    footer,
    pages,
    collections: [work],
    app,
    theme: {
      accent: "#2f3439",
      background: "#f6f5f1",
      color: "#1f2326",
      font: "modern",
      radius: 0,
    },
  };
}
