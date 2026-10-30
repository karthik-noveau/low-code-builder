/**
 * Dhanlaxmi Electricals: the Dhanlaxmi Rewards app rebuilt in Forma. Customers
 * record purchases with the phone number the shop registered them with; the
 * owner approves each with a reward (never more than the purchase) or rejects
 * it with a reason; customers check their total. Only the owner adds
 * customers, and inactive customers can't use the forms.
 */
import { formNamed, rewardsApp } from "../../apps/templates";
import type { AppTable } from "../../apps/model";
import { OWNER_LINK } from "../model";
import { appSection, createSection, item, page, type SiteParts } from "./kit";

const ORANGE = "#b85600";
/** A list item with an icon and, for tabs, a link. */
const entry = (
  title: string,
  body: string,
  extra: { icon?: string; url?: string } = {},
) => ({ ...item(title, body, "", "", extra.url ?? ""), icon: extra.icon });

export function dhanlaxmi(brand: string): SiteParts {
  // "Dhanlaxmi Electricals" → the wordmark's two lines and the app's name.
  const [first, ...rest] = brand.trim().split(/\s+/);
  const second = rest.join(" ");
  const app = rewardsApp(brand).app;
  const [customers, purchases] = app.tables as [AppTable, AppTable];
  const named = (table: AppTable, name: string) =>
    table.fields.find((f) => f.name === name)!;
  // The original app's words for its records and statuses.
  named(customers, "Paused").name = "Inactive";
  purchases.name = "Submissions";
  purchases.singular = "Submission";
  purchases.statuses = [
    { id: "pending", name: "Pending", tone: "waiting" },
    { id: "approved", name: "Approved", tone: "good" },
    { id: "rejected", name: "Rejected", tone: "bad" },
  ];
  // The original's fields, hints and limits (LIMITS in common/utils/validate).
  Object.assign(named(customers, "Phone"), {
    name: "Phone number",
    hint: "10 digits, the number you gave at the shop counter.",
    placeholder: "98400 12210",
  });
  Object.assign(named(purchases, "Purchase amount"), {
    min: 0.01,
    max: 10_000_000,
    hint: "The total on your bill, in rupees.",
    placeholder: "18,400",
  });
  Object.assign(named(purchases, "What did you buy?"), {
    minLength: 3,
    maxLength: 500,
    hint: "A short description helps the owner match it to the bill.",
    placeholder: "6 sqmm Finolex wire 90m and two MCB distribution boards",
  });
  const [earned, spent, pending] = customers.totals;
  earned.name = "Total rewards earned";
  spent.name = "Purchases";
  pending.name = "Pending";
  const via = earned.via;
  // "18 approved submissions · ₹12,450 earned" on “Is this you?”, and the
  // Approved tile (which also gives the reward panel its "Across …" line).
  const approved = {
    id: "approved-count",
    name: "Approved",
    table: purchases.id,
    via,
    op: "count" as const,
    statuses: ["approved"],
  };
  const earnedShort = { ...earned, id: "earned", name: "Earned" };
  customers.totals.push(approved, earnedShort);
  const unreachable = {
    offlineTitle: "Can’t reach the shop",
    offlineBody: "Check your connection and try again.",
  };

  const submit = formNamed(app, "Record a purchase");
  Object.assign(submit, {
    name: "Add a purchase",
    title: "Add a purchase",
    intro: "",
    button: "Submit for approval",
    success:
      "Reference {ref}. The shop owner has been notified and usually reviews the same day.",
    steps: ["Phone", "Confirm", "Purchase"],
    confirmTotals: [approved.id, earnedShort.id],
    copy: {
      identifyTitle: "What’s your phone number?",
      identifyIntro:
        "We use it to find the profile the shop owner registered for you.",
      confirmTitle: "Is this you?",
      confirmIntro: "Confirm before recording the purchase.",
      fieldsTitle: "What did you buy?",
      fieldsIntro: "Recording as",
      fieldsNote:
        "The shop owner decides the reward when approving. You will see it on your rewards page once reviewed.",
      doneTitle: "Sent for approval",
      doneBadge: "Pending review",
      notFoundTitle: "This number isn’t registered",
      notFoundBody:
        "Only the shop owner can add a customer. Ask at the counter and you will be set up in a minute.",
      pausedTitle: "This account is inactive",
      pausedBody: "Please speak to the shop before recording another purchase.",
      ...unreachable,
    },
  });
  const lookup = formNamed(app, "My rewards");
  Object.assign(lookup, {
    title: "My rewards",
    intro: "",
    button: "Show my rewards",
    highlight: earned.id,
    since: true,
    totals: [earned.id, approved.id, pending.id, spent.id],
    copy: {
      identifyTitle: "Check your rewards",
      identifyIntro: "Enter the phone number registered at the shop.",
      identifyNote: "Nothing is stored on this device.",
      historyTitle: "Your submissions",
      emptyTitle: "No purchases recorded yet",
      emptyBody:
        "You’re registered, but haven’t recorded a purchase. The first one takes about 30 seconds.",
      notFoundTitle: "This number isn’t registered",
      notFoundBody:
        "Only the shop owner can add a customer. Ask at the counter and you can start recording purchases straight away.",
      pausedTitle: "This account is inactive",
      pausedBody: "Please speak to the shop about your account.",
      ...unreachable,
    },
  });
  const amount = named(purchases, "Purchase amount");
  // The owner dashboard of the original: four toned cards, the approval
  // queue with Approve / Reject in each row, top earners and rewards by month.
  app.dashboard = {
    cards: [
      {
        id: "customers",
        name: "Customers",
        table: customers.id,
        op: "count",
        statuses: [],
        tone: "plain",
      },
      {
        id: "pending",
        name: "Pending review",
        table: purchases.id,
        op: "count",
        statuses: ["pending"],
        tone: "accent",
      },
      {
        id: "approved",
        name: "Approved purchases",
        table: purchases.id,
        op: "sum",
        field: amount.id,
        statuses: ["approved"],
        money: true,
        tone: "slate",
      },
      {
        id: "rewards",
        name: "Total rewards",
        table: purchases.id,
        op: "sum",
        field: named(purchases, "Reward").id,
        statuses: ["approved"],
        money: true,
        tone: "dark",
      },
    ],
    lists: [
      {
        id: "queue",
        name: "Waiting for approval",
        table: purchases.id,
        sort: "",
        statuses: ["pending"],
        limit: 5,
        actions: true,
      },
      {
        id: "earners",
        name: "Top earners",
        table: customers.id,
        sort: earned.id,
        statuses: [],
        limit: 5,
      },
    ],
    charts: [
      {
        id: "monthly",
        name: "Reward by month",
        table: purchases.id,
        op: "sum",
        field: named(purchases, "Reward").id,
        statuses: ["approved"],
        money: true,
        months: 6,
      },
    ],
  };
  app.install = {
    enabled: true,
    name: `${first} Rewards`,
    shortName: first.slice(0, 12),
  };

  // The original's public layout: the bolt mark over a two-line wordmark,
  // the current page as an orange pill, a light/dark switch, phone tabs.
  const header = [
    createSection("announcement", {
      title: "Rewards for shopping with us",
      buttonUrl: "/submit",
      hidden: true,
    }),
    createSection("header", {
      variant: "brand",
      title: first,
      eyebrow: second,
      body: "",
      buttonLabel: "",
      buttonUrl: "/",
      background: "",
      color: "",
      items: [
        entry("Home", "", { url: "/", icon: "home" }),
        entry("Add", "", { url: "/submit", icon: "receipt" }),
        entry("Rewards", "", { url: "/my-rewards", icon: "wallet" }),
      ],
    }),
  ];
  const footer = [
    createSection("footer", {
      variant: "centered",
      title: `${brand} · Customer rewards`,
      eyebrow: "",
      body: "",
      buttonLabel: "Shop owner sign in",
      buttonUrl: OWNER_LINK,
      background: "",
      color: "",
    }),
  ];
  const steps = createSection("features", {
    variant: "cards",
    title: "How it works",
    eyebrow: "",
    body: "",
    background: "",
    color: "",
    items: [
      [
        "phone",
        "Enter your phone number",
        "We show your name so you can check it is your account.",
      ],
      [
        "receipt",
        "Add the amount and items",
        "A few words are enough — “90m wire and 2 MCB boards”.",
      ],
      [
        "bell",
        "The owner reviews your purchase",
        "Your purchase is sent to the shop owner for approval.",
      ],
      [
        "wallet",
        "You earn your reward",
        "Once approved, the amount is added to your total.",
      ],
    ].map(([icon, title, body]) => entry(title, body, { icon })),
  });

  const pages = [
    page(
      "Home",
      "",
      "Buy from Dhanlaxmi Electricals and earn rewards: record your purchase with your phone number and the owner adds your reward.",
      [
        createSection("hero", {
          variant: "badge",
          effect: "orbits",
          eyebrow: "Rewards for shopping with us",
          title: "Buy from us. *Earn rewards.*",
          body: "Tell us what you bought. Once the shop owner approves your purchase, your reward is added to your total.",
          image: "",
          imageAlt: "",
          background: "",
          color: "",
          align: "center",
          buttonLabel: "Add a purchase",
          buttonUrl: "/submit",
          secondaryLabel: "See my rewards",
          secondaryUrl: "/my-rewards",
          note: "No login needed. Just your registered phone number.",
          items: [
            entry("", "", { icon: "receipt" }),
            entry("", "", { icon: "wallet" }),
          ],
        }),
        steps,
        createSection("text", {
          variant: "notice",
          eyebrow: "",
          title: "Not registered yet?",
          body: "Only the shop owner can add you. Give your phone number at the counter and you can start straight away.",
          buttonLabel: "",
          background: "",
          color: "",
        }),
      ],
      brand,
    ),
    page(
      "Add purchase",
      "submit",
      "Record a purchase at Dhanlaxmi Electricals with your registered phone number, the bill amount and what you bought.",
      [appSection(submit, { padding: 40, align: "center" })],
      brand,
    ),
    page(
      "My rewards",
      "my-rewards",
      "Check your Dhanlaxmi Electricals reward total and the status of every purchase with your registered phone number.",
      [appSection(lookup, { padding: 40, align: "center" })],
      brand,
    ),
  ];
  return {
    header,
    footer,
    pages,
    collections: [],
    app,
    theme: {
      accent: ORANGE,
      background: "#f5f6f8",
      color: "#101623",
      font: "modern",
      radius: 20,
      logo: "bolt",
      darkToggle: true,
      // The shop's wordmark has no trailing dot.
      brandDot: false,
    },
  };
}
