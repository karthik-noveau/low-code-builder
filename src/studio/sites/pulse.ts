/** Pulse Fitness: a gym that sells plans online and rewards check-ins with points. */
import { catalog } from "../../apps/templates/catalog";
import { formNamed, membershipApp } from "../../apps/templates";
import {
  appSection,
  chrome,
  createSection,
  listing,
  page,
  styled,
  type SiteParts,
} from "./kit";

export function pulse(brand: string): SiteParts {
  const ui = styled("#eef0f6", "#151a25");
  const join = "/join";
  const plans = catalog({
    name: "Plans",
    singular: "Plan",
    blueprint: "services",
    fields: [
      ["Plan", "text"],
      ["Price per month", "price"],
      ["Includes", "text"],
      ["Description", "longText"],
      ["Join link", "link"],
    ],
    display: {
      title: "Plan",
      price: "Price per month",
      subtitle: "Includes",
      summary: "Description",
      body: "Description",
      action: "Join link",
      actionLabel: "Join on this plan",
    },
    rows: [
      [
        "Gym floor",
        "1499",
        "Weights, cardio and lockers",
        "Unlimited access 5 am–11 pm, a fitness assessment and a starter workout plan.",
        join,
      ],
      [
        "Gym and classes",
        "2299",
        "Everything in Gym floor, plus 30 classes a week",
        "HIIT, spin, yoga, Zumba and strength classes. Book a spot at the front desk.",
        join,
      ],
      [
        "All access with coaching",
        "4999",
        "Classes plus 8 personal training sessions",
        "A coach builds your programme, checks your form and updates your plan every month.",
        join,
      ],
      [
        "Student",
        "1199",
        "Gym floor, 6 am–4 pm on weekdays",
        "For college students with a valid ID. Weekends included.",
        join,
      ],
    ],
  });
  const app = membershipApp(brand, { plans }).app;
  formNamed(app, "Check in").intro =
    "At the front desk? Enter your member phone number to check in. Every confirmed visit earns 10 points; 300 points gets you a free month.";
  const { header, footer } = chrome(brand, {
    announcement: "First week free on every plan · Join online →",
    announcementUrl: join,
    cta: ["Join now", join],
    tagline:
      "Strength, cardio and classes · 1st floor, Galleria Mall, DLF Phase 4, Gurugram · 5 am–11 pm, every day",
    dark: "#151a25",
  });
  const pages = [
    page(
      "Home",
      "",
      "Pulse Fitness Gurugram: gym floor, 30 classes a week and personal coaching. Join online, check in and earn loyalty points.",
      [
        createSection("hero", {
          title: "Show up.\nWe’ll do the rest.",
          eyebrow: "GYM · CLASSES · COACHING",
          body: "Open 5 am to 11 pm, every day. Modern equipment, coaches who remember your name and points for every visit.",
          image: "/images/gym.jpg",
          imageAlt: "A dumbbell and kettlebell on the gym floor",
          color: "#ffffff",
          buttonLabel: "See plans",
          buttonUrl: "/plans",
          overlay: 30,
        }),
        ui.features([
          ["Join in two minutes", "Pick a plan and pay online."],
          ["Points for every visit", "300 points = a free month."],
          ["Your card on your phone", "See your visits and points any time."],
        ]),
        listing(plans, {
          title: "Plans for every goal",
          eyebrow: "MEMBERSHIP",
          body: "No joining fee, no lock-in. Choose how many months when you join.",
          style: "list",
          columns: 2,
        }),
        ui.story({
          eyebrow: "LOYALTY",
          title: "The more you come, the more you get.",
          body: "Check in at the front desk with your phone number. We confirm the visit and add 10 points. Watch your card fill up: free months, guest passes and Pulse kit.",
          image: "/images/gym.jpg",
          imageAlt: "Training equipment",
          buttonLabel: "Check my card",
          buttonUrl: "/my-card",
        }),
        ui.quotes("Members on Pulse.", [
          [
            "Varun S.",
            "Lost 9 kg in four months on the coaching plan. The 6 am spin class is the best part of my day.",
          ],
          [
            "Mehak J.",
            "Joined online on a Sunday night, trained Monday morning. Earned my free month in October.",
          ],
          [
            "Col. R. Batra (retd.)",
            "Clean, calm and the coaches actually correct your form. Worth every rupee.",
          ],
        ]),
        ui.cta(
          "YOUR FIRST WEEK IS FREE",
          "Start today.",
          "Pick a plan and how many months; pay online or at the desk.",
          ["Join now", join],
        ),
      ],
      brand,
    ),
    page(
      "Plans",
      "plans",
      "Pulse Fitness membership plans and monthly prices: gym floor, gym and classes, coaching and a student plan. No joining fee.",
      [
        ui.intro(
          "MEMBERSHIP PLANS",
          "Simple prices. No lock-in.",
          "Prices are per month and include GST. Pay for three months or more and get a free Pulse shaker and towel.",
        ),
        listing(plans, { title: "", style: "list", columns: 2 }),
        ui.faq("Membership questions", [
          [
            "Can I pause my membership?",
            "Yes, for up to 30 days a year for travel or illness. Ask at the front desk.",
          ],
          [
            "Is there a joining fee?",
            "No. You pay only for the months you choose.",
          ],
          [
            "Can I bring a friend?",
            "Every member gets two guest passes a month. Collect more with loyalty points.",
          ],
        ]),
      ],
      brand,
    ),
    page(
      "Join",
      "join",
      "Join Pulse Fitness online: choose a plan and number of months, pick a start date and pay online or at the front desk.",
      [appSection(formNamed(app, "Join"))],
      brand,
    ),
    page(
      "Check in",
      "check-in",
      "Pulse members: check in at the front desk with your phone number to record today’s visit and earn loyalty points.",
      [appSection(formNamed(app, "Check in"), { padding: 64 })],
      brand,
    ),
    page(
      "My card",
      "my-card",
      "See your Pulse Fitness loyalty card: your plan, visits, points and the date your membership is paid until.",
      [appSection(formNamed(app, "My card"), { padding: 64 })],
      brand,
    ),
    page(
      "Contact",
      "contact",
      "Visit Pulse Fitness on the 1st floor of Galleria Mall, DLF Phase 4, Gurugram, or ask about corporate and family plans.",
      [
        ui.contact(
          "Corporate plans, family plans or a question?",
          "1st floor, Galleria Mall, DLF Phase 4, Gurugram 122009 · +91 124 455 6600\nOpen 5 am–11 pm, every day.",
        ),
      ],
      brand,
    ),
  ];
  return {
    header,
    footer,
    pages,
    collections: [plans],
    app,
    theme: {
      accent: "#cf3439",
      background: "#f7f7f9",
      color: "#151a25",
      font: "modern",
      radius: 8,
    },
  };
}
