/**
 * Starting points for business apps. Each is an ordinary App the owner can
 * change freely; "Customer rewards" is the Dhanlaxmi Electricals scheme.
 *
 * Apps that choose from a menu, services, courses, events or roles come with
 * the site collection they need (`create`). The site templates
 * (src/studio/sites) build their businesses from these same functions, passing
 * their own collections and words, so each business app has one definition.
 */
import {
  REF_KEY,
  appId,
  createAppField,
  emptyApp,
  type App,
  type AppAction,
  type AppCapacity,
  type AppCard,
  type AppField,
  type AppForm,
  type AppList,
  type AppStatus,
  type AppTable,
  type AppTotal,
} from "./model";
import type { Collection } from "../studio/collections";
import { catalog, fieldNamed, type CatalogSpec } from "./templates/catalog";

export type AppTemplateId =
  | "rewards"
  | "membership"
  | "orders"
  | "appointments"
  | "reservations"
  | "service"
  | "classes"
  | "events"
  | "hiring"
  | "enquiries"
  | "warranty"
  | "blank";
/** An app and the site collections its item fields choose from. */
export interface AppBundle {
  app: App;
  /** New collections to add to the site; empty when the app needs none. */
  collections: Collection[];
}
export interface AppTemplateOptions {
  /** Collection slugs the site already uses, so new ones don't clash. */
  taken?: string[];
  /** Where sample items' "Order now" / "Book now" buttons lead, e.g. "/order". */
  link?: string;
}
export interface AppTemplate {
  id: AppTemplateId;
  name: string;
  description: string;
  /** Who it suits, shown under the name. */
  examples: string;
  /** The page its forms go on when the owner asks for one. */
  page: string;
  /** The app with the collections it needs; add both to the site together. */
  create: (siteName: string, options?: AppTemplateOptions) => AppBundle;
  /** Just the app. Its item fields point at collections from `create`, so prefer that when installing. */
  build: (siteName: string) => App;
}

/* ---------- small builders ---------- */

const review: AppStatus[] = [
  { id: "pending", name: "Waiting for review", tone: "waiting" },
  { id: "approved", name: "Approved", tone: "good" },
  { id: "rejected", name: "Rejected", tone: "bad" },
];
const action = (
  a: Partial<AppAction> & Pick<AppAction, "name" | "to">,
): AppAction => ({
  id: appId(),
  from: [],
  set: [],
  note: "none",
  limits: [],
  tone: "primary",
  ...a,
});
const table = (
  t: Partial<AppTable> & Pick<AppTable, "name" | "singular" | "fields">,
): AppTable => ({
  id: appId(),
  titleField: t.fields[0].id,
  statuses: [],
  initial: "",
  actions: [],
  totals: [],
  prefix: "",
  notify: false,
  ...t,
});
const form = (
  f: Partial<AppForm> & Pick<AppForm, "name" | "kind" | "table">,
): AppForm => ({
  id: appId(),
  fields: [],
  totals: [],
  title: f.name,
  intro: "",
  button: f.kind === "lookup" ? "Look up" : "Send",
  success: "Thanks — we’ve received it.",
  ...f,
});
const count = (t: AppTable, name: string, statuses: string[]): AppCard => ({
  id: appId(),
  name,
  table: t.id,
  op: "count",
  statuses,
});
const sum = (
  t: AppTable,
  name: string,
  field: AppField,
  statuses: string[],
): AppCard => ({
  id: appId(),
  name,
  table: t.id,
  op: "sum",
  field: field.id,
  statuses,
  money: field.type === "money" || field.type === "items",
});
const list = (
  t: AppTable,
  name: string,
  statuses: string[],
  limit = 8,
  sort = "",
): AppList => ({ id: appId(), name, table: t.id, sort, statuses, limit });
const capacity = (c: Omit<AppCapacity, "id">): AppCapacity => ({
  id: appId(),
  ...c,
});
const total = (t: Omit<AppTotal, "id">): AppTotal => ({ id: appId(), ...t });
/** People who identify by phone; the owner adds them, nobody signs up. */
function people(singular: string, plural: string) {
  const name = createAppField("Name", "text", { required: true });
  const phone = createAppField("Phone", "phone", {
    required: true,
    unique: true,
  });
  const email = createAppField("Email", "email");
  const address = createAppField("Address", "longText");
  const paused = createAppField("Paused", "yesNo");
  return {
    name,
    phone,
    email,
    paused,
    table: table({
      name: plural,
      singular,
      fields: [name, phone, email, address, paused],
      pausedField: paused.id,
      private: true,
    }),
  };
}
const visitor = () => ({
  name: createAppField("Your name", "text", { required: true }),
  phone: createAppField("Phone", "phone", { required: true }),
});
/** An email field for step updates ("Your order is out for delivery"). */
const updatesEmail = (required = false) =>
  createAppField(required ? "Email" : "Email for updates", "email", {
    required,
  });
const installAs = (app: App, name: string, shortName: string) => {
  app.install = {
    enabled: true,
    name: name.slice(0, 60),
    shortName: shortName.slice(0, 20),
  };
};
/** Collections an app uses: the site's own when given, else a sample one. */
function catalogs(options: AppTemplateOptions = {}) {
  const taken = [...(options.taken ?? [])];
  const made: Collection[] = [];
  return {
    made,
    use(given: Collection | undefined, spec: (link: string) => CatalogSpec) {
      if (given) return given;
      const c = catalog(spec(options.link ?? ""), taken);
      taken.push(c.slug);
      made.push(c);
      return c;
    },
  };
}
/** One app from several (e.g. orders and reservations for a restaurant). */
export function combineApps(first: App, ...rest: App[]): App {
  const all = [first, ...rest];
  return {
    ...first,
    tables: all.flatMap((a) => a.tables),
    forms: all.flatMap((a) => a.forms),
    dashboard: {
      cards: all.flatMap((a) => a.dashboard.cards),
      lists: all.flatMap((a) => a.dashboard.lists),
    },
  };
}
/** A form of an app by name, for site templates that reword or place it. */
export const formNamed = (app: App, name: string) => {
  const found = app.forms.find((f) => f.name === name);
  if (!found) throw new Error(`No form named ${name}`);
  return found;
};

/* ---------- sample collections (used when a site has none of its own) ---------- */

const sampleMenu = (link: string): CatalogSpec => ({
  name: "Menu",
  singular: "Dish",
  blueprint: "menu",
  fields: [
    ["Dish", "text"],
    ["Price", "price"],
    ["Category", "choice", ["Starters", "Mains", "Desserts", "Drinks"]],
    ["Diet", "choice", ["Veg", "Non-veg"]],
    ["Photo", "image"],
    ["Description", "longText"],
    ["Order link", "link"],
  ],
  display: {
    title: "Dish",
    price: "Price",
    subtitle: "Category",
    image: "Photo",
    summary: "Description",
    body: "Description",
    action: "Order link",
    actionLabel: link ? "Order now" : "",
  },
  rows: [
    [
      "Garden salad",
      "180",
      "Starters",
      "Veg",
      "/images/salad.jpg",
      "Crisp leaves, cucumber, lemon dressing.",
      link,
    ],
    [
      "House special plate",
      "320",
      "Mains",
      "Non-veg",
      "/images/dish.jpg",
      "Our cook’s plate of the day with rice.",
      link,
    ],
    [
      "Vegetable thali",
      "260",
      "Mains",
      "Veg",
      "/images/restaurant.jpg",
      "Dal, two sabzis, rice, roti and pickle.",
      link,
    ],
    [
      "Gulab jamun",
      "90",
      "Desserts",
      "Veg",
      "",
      "Two warm dumplings in cardamom syrup.",
      link,
    ],
    [
      "Masala chai",
      "40",
      "Drinks",
      "Veg",
      "",
      "Brewed with ginger and cardamom.",
      link,
    ],
  ],
});
const sampleServices = (link: string): CatalogSpec => ({
  name: "Services",
  singular: "Service",
  blueprint: "services",
  fields: [
    ["Service", "text"],
    ["Price", "price"],
    ["Duration", "text"],
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
    actionLabel: link ? "Book now" : "",
  },
  rows: [
    [
      "Consultation",
      "500",
      "30 min",
      "A first visit to understand what you need.",
      link,
    ],
    ["Standard session", "900", "45 min", "Our most booked appointment.", link],
    [
      "Extended session",
      "1500",
      "90 min",
      "More time for detailed work.",
      link,
    ],
  ],
});
const sampleCourses = (link: string): CatalogSpec => ({
  name: "Courses",
  singular: "Course",
  blueprint: "custom",
  fields: [
    ["Course", "text"],
    ["Monthly fee", "price"],
    ["Seats", "number"],
    ["Timings", "text"],
    ["Description", "longText"],
    ["Admission link", "link"],
  ],
  display: {
    title: "Course",
    price: "Monthly fee",
    subtitle: "Timings",
    summary: "Description",
    body: "Description",
    action: "Admission link",
    actionLabel: link ? "Ask for admission" : "",
  },
  rows: [
    [
      "Beginners batch",
      "1500",
      "20",
      "Mon, Wed, Fri · 5–6 pm",
      "Foundations, at an easy pace.",
      link,
    ],
    [
      "Intermediate batch",
      "2000",
      "15",
      "Tue, Thu · 5–7 pm",
      "Practice and problem solving.",
      link,
    ],
    [
      "Advanced batch",
      "2500",
      "12",
      "Sat, Sun · 10 am–1 pm",
      "Exam preparation with weekly tests.",
      link,
    ],
  ],
});
const sampleEvents = (link: string): CatalogSpec => ({
  name: "Events",
  singular: "Event",
  blueprint: "events",
  fields: [
    ["Event", "text"],
    ["Date", "date"],
    ["Price", "price"],
    ["Seats", "number"],
    ["Venue", "text"],
    ["Photo", "image"],
    ["Details", "longText"],
    ["Register link", "link"],
  ],
  display: {
    title: "Event",
    subtitle: "Date",
    price: "Price",
    summary: "Venue",
    image: "Photo",
    body: "Details",
    action: "Register link",
    actionLabel: link ? "Register" : "",
  },
  rows: [
    [
      "Open day",
      "2026-12-05",
      "0",
      "80",
      "Main hall",
      "/images/interior.jpg",
      "Meet the team and see how we work.",
      link,
    ],
    [
      "Hands-on workshop",
      "2026-12-12",
      "1200",
      "20",
      "Studio 2",
      "/images/garden.jpg",
      "Three hours, small group, take-home kit.",
      link,
    ],
  ],
});
const sampleJobs = (link: string): CatalogSpec => ({
  name: "Careers",
  slug: "careers",
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
    actionLabel: link ? "Apply for this role" : "",
  },
  rows: [
    [
      "Sales associate",
      "Main branch",
      "Full-time",
      "Help customers find the right thing and keep the floor tidy.",
      link,
    ],
    [
      "Delivery partner",
      "Across the city",
      "Part-time",
      "Two-wheeler and licence needed. Fuel paid weekly.",
      link,
    ],
  ],
});

/* ---------- the apps ---------- */

export interface RewardsOptions extends AppTemplateOptions {
  /** Customers register themselves with their phone (owner can pause anyone). */
  register?: boolean;
}
export function rewardsApp(
  siteName: string,
  options: RewardsOptions = {},
): AppBundle {
  const app = emptyApp(siteName);
  const customers = people("Customer", "Customers");
  const customer = createAppField("Customer", "link", {
    required: true,
    table: customers.table.id,
  });
  const amount = createAppField("Purchase amount", "money", {
    required: true,
    min: 1,
    max: 1000000,
  });
  const description = createAppField("What did you buy?", "longText", {
    required: true,
  });
  const reward = createAppField("Reward", "money", {
    ownerOnly: true,
    min: 0.01,
  });
  const purchases = table({
    name: "Purchases",
    singular: "Purchase",
    fields: [customer, amount, description, reward],
    titleField: description.id,
    statuses: review,
    initial: "pending",
    prefix: "ESR",
    notify: true,
    actions: [
      action({
        name: "Approve",
        from: ["pending"],
        to: "approved",
        set: [reward.id],
        limits: [{ field: reward.id, atMost: amount.id }],
      }),
      action({
        name: "Reject",
        from: ["pending"],
        to: "rejected",
        note: "required",
        tone: "danger",
      }),
    ],
  });
  reward.required = false;
  const totalReward = total({
    name: "Total reward",
    table: purchases.id,
    via: customer.id,
    op: "sum",
    field: reward.id,
    statuses: ["approved"],
    money: true,
  });
  const totalSpent = total({
    name: "Total purchases",
    table: purchases.id,
    via: customer.id,
    op: "sum",
    field: amount.id,
    statuses: ["approved"],
    money: true,
  });
  const pendingCount = total({
    name: "Waiting for review",
    table: purchases.id,
    via: customer.id,
    op: "count",
    statuses: ["pending"],
  });
  customers.table.totals = [totalReward, totalSpent, pendingCount];
  app.tables = [customers.table, purchases];
  app.forms = [
    form({
      name: "Record a purchase",
      kind: "submit",
      table: purchases.id,
      identify: {
        table: customers.table.id,
        field: customers.phone.id,
        link: customer.id,
        confirm: [customers.name.id, customers.phone.id],
      },
      fields: [amount.id, description.id],
      title: "Record a purchase",
      intro:
        "Enter the phone number the shop registered you with, then tell us what you bought. The owner checks it and adds your reward.",
      button: "Send for approval",
      success: "Sent for approval. Your reference is {ref}.",
    }),
    form({
      name: "My rewards",
      kind: "lookup",
      table: customers.table.id,
      key: customers.phone.id,
      fields: [customers.name.id],
      totals: [totalReward.id, pendingCount.id],
      history: {
        table: purchases.id,
        via: customer.id,
        fields: [amount.id, description.id, reward.id],
      },
      title: "My rewards",
      intro:
        "Enter your registered phone number to see your reward total and history.",
      button: "Show my rewards",
    }),
  ];
  if (options.register) {
    customers.table.private = false;
    customers.table.notify = true;
    app.forms.unshift(
      form({
        name: "Join rewards",
        kind: "submit",
        table: customers.table.id,
        fields: [customers.name.id, customers.phone.id, customers.email.id],
        title: "Join the rewards club",
        intro:
          "Register once with your mobile number. Every bill you record earns a reward once the shop approves it.",
        button: "Register",
        success:
          "You’re registered. Use this phone number to record purchases and check your rewards.",
      }),
    );
  }
  app.dashboard = {
    cards: [
      sum(purchases, "Rewards owed", reward, ["approved"]),
      count(purchases, "Waiting for review", ["pending"]),
      sum(purchases, "Approved sales", amount, ["approved"]),
      count(customers.table, "Customers", []),
    ],
    lists: [
      list(purchases, "Waiting for review", ["pending"], 5),
      list(customers.table, "Top earners", [], 5, totalReward.id),
    ],
  };
  installAs(app, `${siteName} Rewards`, "Rewards");
  return { app, collections: [] };
}

export interface MembershipOptions extends AppTemplateOptions {
  /** Plans visitors join on (price per month); adds a Join form with payment. */
  plans?: Collection;
}
export function membershipApp(
  siteName: string,
  options: MembershipOptions = {},
): AppBundle {
  const app = emptyApp(siteName);
  const members = people("Member", "Members");
  const member = createAppField("Member", "link", {
    required: true,
    table: members.table.id,
  });
  const visitDate = createAppField("Date", "date", { required: true });
  const points = createAppField("Points", "number", {
    ownerOnly: true,
    min: 0,
    max: 1000,
  });
  const visits = table({
    name: "Visits",
    singular: "Visit",
    fields: [member, visitDate, points],
    titleField: visitDate.id,
    statuses: review,
    initial: "pending",
    prefix: "V",
    notify: true,
    actions: [
      action({
        name: "Confirm",
        from: ["pending"],
        to: "approved",
        set: [points.id],
      }),
      action({
        name: "Decline",
        from: ["pending"],
        to: "rejected",
        note: "required",
        tone: "danger",
      }),
    ],
  });
  const totalPoints = total({
    name: "Points",
    table: visits.id,
    via: member.id,
    op: "sum",
    field: points.id,
    statuses: ["approved"],
  });
  const visitCount = total({
    name: "Visits",
    table: visits.id,
    via: member.id,
    op: "count",
    statuses: ["approved"],
  });
  members.table.totals = [totalPoints, visitCount];
  const cardFields = [members.name.id];
  if (options.plans) {
    const plan = createAppField("Plan", "item", {
      collection: options.plans.id,
    });
    const until = createAppField("Paid until", "date");
    members.table.fields.splice(2, 0, plan, until);
    cardFields.push(plan.id, until.id);
  }
  app.tables = [members.table, visits];
  app.forms = [
    form({
      name: "Check in",
      kind: "submit",
      table: visits.id,
      identify: {
        table: members.table.id,
        field: members.phone.id,
        link: member.id,
        confirm: [members.name.id],
      },
      fields: [visitDate.id],
      title: "Check in",
      intro: "Enter your member phone number to collect today’s visit.",
      button: "Check in",
      success: "Checked in. We’ll confirm your points shortly.",
    }),
    form({
      name: "My card",
      kind: "lookup",
      table: members.table.id,
      key: members.phone.id,
      fields: cardFields,
      totals: [totalPoints.id, visitCount.id],
      history: {
        table: visits.id,
        via: member.id,
        fields: [visitDate.id, points.id],
      },
      title: "My loyalty card",
      intro: "See your points and visits.",
      button: "Show my card",
    }),
  ];
  app.dashboard = {
    cards: [
      count(members.table, "Members", []),
      count(visits, "Visits to confirm", ["pending"]),
      sum(visits, "Points given", points, ["approved"]),
    ],
    lists: [
      list(visits, "Visits to confirm", ["pending"], 5),
      list(members.table, "Most loyal", [], 5, totalPoints.id),
    ],
  };
  if (options.plans) {
    const { name, phone } = visitor();
    const email = updatesEmail(true);
    const plan = createAppField("Plan and months", "items", {
      required: true,
      collection: options.plans.id,
    });
    const start = createAppField("Start date", "date", { required: true });
    const goal = createAppField("Your goal", "choice", {
      options: [
        "Lose weight",
        "Build strength",
        "Get fitter",
        "Train for an event",
      ],
    });
    const joins = table({
      name: "Join requests",
      singular: "Join request",
      fields: [name, phone, email, plan, start, goal],
      statuses: [
        { id: "new", name: "New", tone: "waiting" },
        { id: "joined", name: "Joined", tone: "good" },
        { id: "declined", name: "Declined", tone: "bad" },
      ],
      initial: "new",
      prefix: "JN",
      notify: true,
      actions: [
        action({
          name: "Welcome aboard",
          from: ["new"],
          to: "joined",
          note: "optional",
          tellVisitor: true,
        }),
        action({
          name: "Decline",
          from: ["new"],
          to: "declined",
          note: "required",
          tone: "danger",
          tellVisitor: true,
        }),
      ],
    });
    app.tables.push(joins);
    app.forms.unshift(
      form({
        name: "Join",
        kind: "submit",
        table: joins.id,
        fields: [name.id, phone.id, email.id, plan.id, start.id, goal.id],
        payment: { field: plan.id },
        title: "Join today",
        intro:
          "Pick a plan and how many months. Pay online now, or at the front desk on your first visit.",
        button: "Join",
        success:
          "Welcome! Your reference is {ref}. Bring it on your first visit and we’ll set up your card.",
      }),
    );
    app.dashboard.cards.unshift(
      count(joins, "New joiners", ["new"]),
      sum(joins, "Joining fees", plan, ["joined"]),
    );
    app.dashboard.lists.unshift(list(joins, "New joiners", ["new"], 5));
  }
  installAs(app, `${siteName} Card`, "Card");
  return { app, collections: [] };
}

export interface OrdersOptions extends AppTemplateOptions {
  /** The menu or products visitors order from; a sample menu otherwise. */
  menu?: Collection;
  /** "kitchen" prepares food; "shop" packs groceries or goods. */
  style?: "kitchen" | "shop";
  /** Delivery slots, each taking at most `max` orders per day. */
  slots?: { options: string[]; max: number };
}
export function ordersApp(
  siteName: string,
  options: OrdersOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const menu = owned.use(options.menu, sampleMenu);
  const kitchen = (options.style ?? "kitchen") === "kitchen";
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = updatesEmail();
  const cart = createAppField("Your order", "items", {
    required: true,
    collection: menu.id,
  });
  const mode = createAppField("Pickup or delivery", "choice", {
    required: true,
    options: ["Delivery", "Pickup"],
  });
  const address = createAppField("Delivery address", "longText");
  const day = createAppField("Delivery date", "date", { required: true });
  const slot = createAppField("Delivery slot", "choice", {
    required: true,
    options: options.slots?.options ?? [],
  });
  const notes = createAppField(
    kitchen ? "Notes for the kitchen" : "Delivery instructions",
    "longText",
  );
  const fields = [
    name,
    phone,
    email,
    cart,
    mode,
    address,
    ...(options.slots ? [day, slot] : []),
    notes,
  ];
  const active = ["new", "preparing", "ready", "out", "delivered"];
  const orders = table({
    name: "Orders",
    singular: "Order",
    fields,
    titleField: name.id,
    statuses: [
      { id: "new", name: "New", tone: "waiting" },
      {
        id: "preparing",
        name: kitchen ? "Preparing" : "Packing",
        tone: "neutral",
      },
      { id: "ready", name: "Ready for pickup", tone: "neutral" },
      { id: "out", name: "Out for delivery", tone: "neutral" },
      { id: "delivered", name: "Delivered", tone: "good" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "new",
    prefix: "ORD",
    notify: true,
    actions: [
      action({
        name: kitchen ? "Accept and cook" : "Accept and pack",
        from: ["new"],
        to: "preparing",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Ready for pickup",
        from: ["preparing"],
        to: "ready",
        tellVisitor: true,
      }),
      action({
        name: "Send out",
        from: ["preparing"],
        to: "out",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Mark delivered",
        from: ["ready", "out"],
        to: "delivered",
        tellVisitor: true,
      }),
      action({
        name: "Cancel",
        from: ["new", "preparing"],
        to: "cancelled",
        note: "required",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  if (options.slots)
    orders.capacity = [
      capacity({
        name: "Orders per delivery slot",
        group: [day.id, slot.id],
        max: options.slots.max,
        statuses: active,
        message:
          "That delivery slot is full. Please choose another slot or day.",
      }),
    ];
  app.tables = [orders];
  app.forms = [
    form({
      name: "Place an order",
      kind: "submit",
      table: orders.id,
      fields: fields.map((f) => f.id),
      payment: { field: cart.id },
      title: kitchen ? "Order online" : "Place your order",
      intro: kitchen
        ? "Choose your dishes, tell us pickup or delivery, and pay online or when it reaches you."
        : "Add what you need, pick a delivery slot and pay online or on delivery.",
      button: "Place order",
      success:
        "Order placed! Your order number is {ref}. Track it any time with this number and your phone.",
    }),
    form({
      name: "Track your order",
      kind: "lookup",
      table: orders.id,
      key: REF_KEY,
      verify: phone.id,
      fields: [cart.id, mode.id, ...(options.slots ? [day.id, slot.id] : [])],
      title: "Track your order",
      intro:
        "Enter your order number (like ORD-1001) and the phone you ordered with.",
      button: "Track order",
    }),
  ];
  app.dashboard = {
    cards: [
      count(orders, "New orders", ["new"]),
      count(orders, kitchen ? "In the kitchen" : "Being packed", ["preparing"]),
      count(orders, "Ready or on the way", ["ready", "out"]),
      sum(orders, "Sales delivered", cart, ["delivered"]),
    ],
    lists: [
      list(orders, "New orders", ["new"]),
      list(orders, kitchen ? "Cooking now" : "Packing now", ["preparing"]),
    ],
  };
  installAs(app, `${siteName} Orders`, "Orders");
  return { app, collections: owned.made };
}

export interface ReservationsOptions extends AppTemplateOptions {
  times?: string[];
  /** Guests seated per date and time. */
  covers?: number;
}
export function reservationsApp(
  siteName: string,
  options: ReservationsOptions = {},
): AppBundle {
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = updatesEmail();
  const day = createAppField("Date", "date", { required: true });
  const time = createAppField("Time", "choice", {
    required: true,
    options: options.times ?? ["12:30", "13:30", "19:00", "20:00", "21:00"],
  });
  const guests = createAppField("Guests", "number", {
    required: true,
    min: 1,
    max: 20,
  });
  const occasion = createAppField("Occasion", "choice", {
    options: ["None", "Birthday", "Anniversary", "Business"],
  });
  const tableNo = createAppField("Table", "text", { ownerOnly: true });
  const reservations = table({
    name: "Reservations",
    singular: "Reservation",
    fields: [name, phone, email, day, time, guests, occasion, tableNo],
    statuses: [
      { id: "requested", name: "Requested", tone: "waiting" },
      { id: "confirmed", name: "Confirmed", tone: "good" },
      { id: "seated", name: "Seated", tone: "neutral" },
      { id: "declined", name: "Fully booked", tone: "bad" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "requested",
    prefix: "RES",
    notify: true,
    actions: [
      action({
        name: "Confirm",
        from: ["requested"],
        to: "confirmed",
        set: [tableNo.id],
        tellVisitor: true,
      }),
      action({ name: "Seat", from: ["confirmed"], to: "seated" }),
      action({
        name: "Decline",
        from: ["requested"],
        to: "declined",
        note: "required",
        tone: "danger",
        tellVisitor: true,
      }),
      action({
        name: "Cancel",
        from: ["requested", "confirmed"],
        to: "cancelled",
        note: "optional",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
    capacity: [
      capacity({
        name: "Guests per sitting",
        group: [day.id, time.id],
        max: options.covers ?? 40,
        size: guests.id,
        statuses: ["requested", "confirmed", "seated"],
        message:
          "We’re fully booked at that time. Please try another time or date.",
      }),
    ],
  });
  app.tables = [reservations];
  app.forms = [
    form({
      name: "Reserve a table",
      kind: "submit",
      table: reservations.id,
      fields: [name, phone, email, day, time, guests, occasion].map(
        (f) => f.id,
      ),
      title: "Reserve a table",
      intro:
        "We hold tables for 15 minutes. For groups over 20, please call us.",
      button: "Request a table",
      success:
        "Table requested. Your reference is {ref}. We’ll confirm shortly.",
    }),
    form({
      name: "My reservation",
      kind: "lookup",
      table: reservations.id,
      key: REF_KEY,
      verify: phone.id,
      fields: [day.id, time.id, guests.id, tableNo.id],
      title: "Check your reservation",
      intro: "Enter your reference (like RES-1001) and phone number.",
      button: "Check",
    }),
  ];
  app.dashboard = {
    cards: [
      count(reservations, "Tables to confirm", ["requested"]),
      count(reservations, "Confirmed", ["confirmed"]),
      sum(reservations, "Guests confirmed", guests, ["confirmed", "seated"]),
    ],
    lists: [list(reservations, "Tables to confirm", ["requested"])],
  };
  return { app, collections: [] };
}

export interface AppointmentsOptions extends AppTemplateOptions {
  services?: Collection;
  times?: string[];
  /** Bookings taken per date and time (chairs, rooms or staff). */
  perSlot?: number;
}
export function appointmentsApp(
  siteName: string,
  options: AppointmentsOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const services = owned.use(options.services, sampleServices);
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = updatesEmail();
  const service = createAppField("Service", "item", {
    required: true,
    collection: services.id,
  });
  const day = createAppField("Date", "date", { required: true });
  const time = createAppField("Time", "choice", {
    required: true,
    options: options.times ?? [
      "10:00",
      "11:00",
      "12:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
    ],
  });
  const notes = createAppField("Anything we should know?", "longText");
  const fee = createAppField("Amount charged", "money", {
    ownerOnly: true,
    min: 0,
  });
  const bookings = table({
    name: "Appointments",
    singular: "Appointment",
    fields: [name, phone, email, service, day, time, notes, fee],
    statuses: [
      { id: "requested", name: "Requested", tone: "waiting" },
      { id: "confirmed", name: "Confirmed", tone: "neutral" },
      { id: "done", name: "Done", tone: "good" },
      { id: "missed", name: "Didn’t come", tone: "bad" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "requested",
    prefix: "APT",
    notify: true,
    actions: [
      action({
        name: "Confirm",
        from: ["requested"],
        to: "confirmed",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Mark done",
        from: ["confirmed"],
        to: "done",
        set: [fee.id],
      }),
      action({
        name: "Didn’t come",
        from: ["confirmed"],
        to: "missed",
        tone: "danger",
      }),
      action({
        name: "Cancel",
        from: ["requested", "confirmed"],
        to: "cancelled",
        note: "required",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
    capacity: [
      capacity({
        name: "Bookings per time slot",
        group: [day.id, time.id],
        max: options.perSlot ?? 2,
        statuses: ["requested", "confirmed"],
        message: "That time is fully booked. Please pick another time.",
      }),
    ],
  });
  app.tables = [bookings];
  app.forms = [
    form({
      name: "Book an appointment",
      kind: "submit",
      table: bookings.id,
      fields: [name, phone, email, service, day, time, notes].map((f) => f.id),
      title: "Book an appointment",
      intro:
        "Choose a service and a time that suits you. We’ll confirm by message and email.",
      button: "Request appointment",
      success:
        "Booking requested. Your reference is {ref}. We’ll confirm it shortly.",
    }),
    form({
      name: "My bookings",
      kind: "lookup",
      table: bookings.id,
      key: phone.id,
      fields: [service.id, day.id, time.id],
      title: "My bookings",
      intro: "Enter the phone number you booked with to see your appointments.",
      button: "Show my bookings",
    }),
  ];
  app.dashboard = {
    cards: [
      count(bookings, "To confirm", ["requested"]),
      count(bookings, "Coming up", ["confirmed"]),
      sum(bookings, "Earned", fee, ["done"]),
    ],
    lists: [
      list(bookings, "To confirm", ["requested"]),
      list(bookings, "Coming up", ["confirmed"]),
    ],
  };
  installAs(app, `${siteName} Bookings`, "Bookings");
  return { app, collections: owned.made };
}

export interface ServiceOptions extends AppTemplateOptions {
  services?: Collection;
}
export function serviceApp(
  siteName: string,
  options: ServiceOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const services = owned.use(options.services, sampleServices);
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = updatesEmail();
  const service = createAppField("Service", "item", {
    required: true,
    collection: services.id,
  });
  const address = createAppField("Address", "longText", { required: true });
  const problem = createAppField("What needs doing?", "longText", {
    required: true,
  });
  const date = createAppField("Preferred date", "date", { required: true });
  const time = createAppField("Preferred time", "choice", {
    required: true,
    options: ["Morning (9–12)", "Afternoon (12–4)", "Evening (4–8)"],
  });
  const technician = createAppField("Technician", "text", { ownerOnly: true });
  const charge = createAppField("Charge", "money", { ownerOnly: true, min: 0 });
  const tickets = table({
    name: "Service requests",
    singular: "Service request",
    fields: [
      name,
      phone,
      email,
      service,
      address,
      problem,
      date,
      time,
      technician,
      charge,
    ],
    titleField: name.id,
    statuses: [
      { id: "new", name: "New", tone: "waiting" },
      { id: "scheduled", name: "Scheduled", tone: "neutral" },
      { id: "done", name: "Done", tone: "good" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "new",
    prefix: "SR",
    notify: true,
    actions: [
      action({
        name: "Schedule",
        from: ["new"],
        to: "scheduled",
        set: [technician.id],
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Mark done",
        from: ["new", "scheduled"],
        to: "done",
        set: [charge.id],
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Cancel",
        from: ["new", "scheduled"],
        to: "cancelled",
        note: "required",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  app.tables = [tickets];
  app.forms = [
    form({
      name: "Request service",
      kind: "submit",
      table: tickets.id,
      fields: [name, phone, email, service, address, problem, date, time].map(
        (f) => f.id,
      ),
      title: "Request a service visit",
      intro:
        "Tell us what you need and when suits you. We’ll confirm a time and send the technician’s name.",
      button: "Send request",
      success:
        "Request received. Your reference is {ref}. Track it with this number and your phone.",
    }),
    form({
      name: "Track request",
      kind: "lookup",
      table: tickets.id,
      key: REF_KEY,
      verify: phone.id,
      fields: [service.id, date.id, time.id, technician.id, charge.id],
      title: "Track your request",
      intro:
        "Enter your reference (like SR-1001) and the phone you booked with.",
      button: "Track",
    }),
  ];
  app.dashboard = {
    cards: [
      count(tickets, "New requests", ["new"]),
      count(tickets, "Scheduled", ["scheduled"]),
      sum(tickets, "Earned", charge, ["done"]),
    ],
    lists: [
      list(tickets, "Newest requests", ["new"]),
      list(tickets, "Scheduled visits", ["scheduled"]),
    ],
  };
  installAs(app, `${siteName} Service`, "Service");
  return { app, collections: owned.made };
}

export interface ClassesOptions extends AppTemplateOptions {
  /** Courses with a "Seats" number field: admissions stop when a course is full. */
  courses?: Collection;
}
export function classesApp(
  siteName: string,
  options: ClassesOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const courses = owned.use(options.courses, sampleCourses);
  const app = emptyApp(siteName);
  const students = people("Student", "Students");
  const course = createAppField("Course", "item", {
    collection: courses.id,
  });
  const fee = createAppField("Monthly fee", "money", { min: 0 });
  students.table.fields.splice(2, 0, course, fee);
  const student = createAppField("Student", "link", {
    required: true,
    table: students.table.id,
  });
  const amount = createAppField("Amount", "money", { required: true, min: 1 });
  const month = createAppField("For month", "text", { required: true });
  const method = createAppField("Paid by", "choice", {
    required: true,
    options: ["Cash", "UPI", "Bank transfer"],
  });
  const payments = table({
    name: "Fee payments",
    singular: "Fee payment",
    fields: [student, month, amount, method],
    titleField: month.id,
    prefix: "FEE",
    private: true,
  });
  const paidTotal = total({
    name: "Fees paid",
    table: payments.id,
    via: student.id,
    op: "sum",
    field: amount.id,
    statuses: [],
    money: true,
  });
  students.table.totals = [paidTotal];
  // Parents ask for a place; the owner adds the student once they join.
  const childName = createAppField("Student’s name", "text", {
    required: true,
  });
  const parent = createAppField("Parent’s name", "text", { required: true });
  const phone = createAppField("Phone", "phone", { required: true });
  const email = updatesEmail();
  const wanted = createAppField("Course", "item", {
    required: true,
    collection: courses.id,
  });
  const grade = createAppField("Current class or level", "text");
  const enquiries = table({
    name: "Admission enquiries",
    singular: "Admission enquiry",
    fields: [childName, parent, phone, email, wanted, grade],
    statuses: [
      { id: "new", name: "New", tone: "waiting" },
      { id: "joined", name: "Joined", tone: "good" },
      { id: "closed", name: "Closed", tone: "bad" },
    ],
    initial: "new",
    prefix: "ADM",
    notify: true,
    actions: [
      action({
        name: "Mark joined",
        from: ["new"],
        to: "joined",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Close",
        from: ["new"],
        to: "closed",
        note: "optional",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  const seats = fieldNamed(courses, "Seats");
  if (seats)
    enquiries.capacity = [
      capacity({
        name: "Seats per course",
        group: [wanted.id],
        max: 30,
        maxField: seats,
        statuses: ["new", "joined"],
        message:
          "That course is full this term. Choose another course or call us to join the waiting list.",
      }),
    ];
  app.tables = [students.table, payments, enquiries];
  app.forms = [
    form({
      name: "Admission enquiry",
      kind: "submit",
      table: enquiries.id,
      fields: [childName, parent, phone, email, wanted, grade].map((f) => f.id),
      title: "Ask for admission",
      intro:
        "Tell us about the student and the course. We’ll call you about timings, a free trial class and fees.",
      button: "Send enquiry",
      success: "Thanks! Your reference is {ref}. We’ll call you within a day.",
    }),
    form({
      name: "My fees",
      kind: "lookup",
      table: students.table.id,
      key: students.phone.id,
      fields: [students.name.id, course.id, fee.id],
      totals: [paidTotal.id],
      history: {
        table: payments.id,
        via: student.id,
        fields: [month.id, amount.id, method.id],
      },
      title: "Fee record",
      intro: "Enter the phone number you registered with to see payments.",
      button: "Show fees",
    }),
  ];
  app.dashboard = {
    cards: [
      count(students.table, "Students", []),
      sum(payments, "Fees collected", amount, []),
      count(enquiries, "New enquiries", ["new"]),
    ],
    lists: [
      list(enquiries, "New enquiries", ["new"], 5),
      list(payments, "Latest payments", [], 5),
    ],
  };
  installAs(app, `${siteName} Parents`, "Parents");
  return { app, collections: owned.made };
}

export interface EventsOptions extends AppTemplateOptions {
  /** Events with a "Seats" number field: registrations stop when it's full. */
  events?: Collection;
}
export function eventsApp(
  siteName: string,
  options: EventsOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const events = owned.use(options.events, sampleEvents);
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = createAppField("Email", "email", { required: true });
  const event = createAppField("Event", "item", {
    required: true,
    collection: events.id,
  });
  const seats = createAppField("Seats", "number", {
    required: true,
    min: 1,
    max: 10,
  });
  const paid = createAppField("Amount paid", "money", {
    ownerOnly: true,
    min: 0,
  });
  const registrations = table({
    name: "Registrations",
    singular: "Registration",
    fields: [name, email, phone, event, seats, paid],
    statuses: [
      { id: "registered", name: "Registered", tone: "waiting" },
      { id: "confirmed", name: "Confirmed", tone: "good" },
      { id: "attended", name: "Attended", tone: "neutral" },
      { id: "cancelled", name: "Cancelled", tone: "bad" },
    ],
    initial: "registered",
    prefix: "EVT",
    notify: true,
    actions: [
      action({
        name: "Confirm",
        from: ["registered"],
        to: "confirmed",
        set: [paid.id],
        tellVisitor: true,
      }),
      action({ name: "Check in", from: ["confirmed"], to: "attended" }),
      action({
        name: "Cancel",
        from: ["registered", "confirmed"],
        to: "cancelled",
        note: "optional",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  const seatsField = fieldNamed(events, "Seats");
  registrations.capacity = [
    capacity({
      name: "Seats per event",
      group: [event.id],
      max: 50,
      ...(seatsField ? { maxField: seatsField } : {}),
      size: seats.id,
      statuses: ["registered", "confirmed", "attended"],
      message: "Sorry, there aren’t enough seats left for that event.",
    }),
  ];
  app.tables = [registrations];
  app.forms = [
    form({
      name: "Register",
      kind: "submit",
      table: registrations.id,
      fields: [name, email, phone, event, seats].map((f) => f.id),
      title: "Register for an event",
      intro:
        "Pick an event and how many seats you need. We confirm by email with payment details for paid events.",
      button: "Register",
      success:
        "You’re registered. Your ticket reference is {ref}; we’ve noted your seats.",
    }),
    form({
      name: "My tickets",
      kind: "lookup",
      table: registrations.id,
      key: REF_KEY,
      verify: email.id,
      fields: [event.id, seats.id, paid.id],
      title: "My tickets",
      intro: "Enter your ticket reference (like EVT-1001) and email.",
      button: "Find my tickets",
    }),
  ];
  app.dashboard = {
    cards: [
      count(registrations, "New registrations", ["registered"]),
      sum(registrations, "Seats confirmed", seats, ["confirmed", "attended"]),
      sum(registrations, "Collected", paid, ["confirmed", "attended"]),
    ],
    lists: [list(registrations, "New registrations", ["registered"])],
  };
  return { app, collections: owned.made };
}

export interface HiringOptions extends AppTemplateOptions {
  jobs?: Collection;
}
export function hiringApp(
  siteName: string,
  options: HiringOptions = {},
): AppBundle {
  const owned = catalogs(options);
  const jobs = owned.use(options.jobs, sampleJobs);
  const app = emptyApp(siteName);
  const { name, phone } = visitor();
  const email = createAppField("Email", "email", { required: true });
  const role = createAppField("Role", "item", {
    required: true,
    collection: jobs.id,
  });
  const years = createAppField("Years of experience", "number", {
    min: 0,
    max: 60,
  });
  const about = createAppField("About you", "longText", { required: true });
  const cv = createAppField("CV or portfolio link", "text");
  const applications = table({
    name: "Applications",
    singular: "Application",
    fields: [name, email, phone, role, years, about, cv],
    statuses: [
      { id: "new", name: "New", tone: "waiting" },
      { id: "shortlisted", name: "Shortlisted", tone: "neutral" },
      { id: "interview", name: "Interview", tone: "neutral" },
      { id: "hired", name: "Hired", tone: "good" },
      { id: "declined", name: "Not this time", tone: "bad" },
    ],
    initial: "new",
    prefix: "JOB",
    notify: true,
    actions: [
      action({ name: "Shortlist", from: ["new"], to: "shortlisted" }),
      action({
        name: "Invite to interview",
        from: ["new", "shortlisted"],
        to: "interview",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Hire",
        from: ["interview"],
        to: "hired",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Decline",
        from: ["new", "shortlisted", "interview"],
        to: "declined",
        note: "optional",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  app.tables = [applications];
  app.forms = [
    form({
      name: "Apply",
      kind: "submit",
      table: applications.id,
      fields: [name, email, phone, role, years, about, cv].map((f) => f.id),
      title: "Apply for a role",
      intro: "Choose the role and tell us a little about yourself.",
      button: "Send application",
      success:
        "Application received. Your reference is {ref}. Check its status any time with your email.",
    }),
    form({
      name: "Application status",
      kind: "lookup",
      table: applications.id,
      key: REF_KEY,
      verify: email.id,
      fields: [role.id],
      title: "Check your application",
      intro:
        "Enter your reference (like JOB-1001) and the email you applied with.",
      button: "Check status",
    }),
  ];
  app.dashboard = {
    cards: [
      count(applications, "New applications", ["new"]),
      count(applications, "Interviews", ["interview"]),
      count(applications, "Hired", ["hired"]),
    ],
    lists: [list(applications, "New applications", ["new"])],
  };
  return { app, collections: owned.made };
}

export interface EnquiriesOptions extends AppTemplateOptions {
  /** What visitors can ask about; a choice of project types otherwise. */
  kinds?: string[];
  budgets?: string[];
}
export function enquiriesApp(
  siteName: string,
  options: EnquiriesOptions = {},
): AppBundle {
  const app = emptyApp(siteName);
  const name = createAppField("Your name", "text", { required: true });
  const email = createAppField("Email", "email", { required: true });
  const phone = createAppField("Phone", "phone");
  const company = createAppField("Company", "text");
  const kind = createAppField("What do you need?", "choice", {
    required: true,
    options: options.kinds ?? [
      "New project",
      "Redesign",
      "Ongoing support",
      "Something else",
    ],
  });
  const budget = createAppField("Budget", "choice", {
    required: true,
    options: options.budgets ?? [
      "Under ₹2 lakh",
      "₹2–5 lakh",
      "₹5–15 lakh",
      "Above ₹15 lakh",
    ],
  });
  const timeline = createAppField("Timeline", "choice", {
    required: true,
    options: [
      "As soon as possible",
      "In 1–3 months",
      "In 3–6 months",
      "Just exploring",
    ],
  });
  const brief = createAppField("Tell us about it", "longText", {
    required: true,
  });
  const quote = createAppField("Quote", "money", { ownerOnly: true, min: 1 });
  const enquiries = table({
    name: "Enquiries",
    singular: "Enquiry",
    fields: [name, email, phone, company, kind, budget, timeline, brief, quote],
    statuses: [
      { id: "new", name: "New", tone: "waiting" },
      { id: "quoted", name: "Quoted", tone: "neutral" },
      { id: "won", name: "Won", tone: "good" },
      { id: "lost", name: "Lost", tone: "bad" },
    ],
    initial: "new",
    prefix: "ENQ",
    notify: true,
    actions: [
      action({
        name: "Send quote",
        from: ["new", "quoted"],
        to: "quoted",
        set: [quote.id],
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Mark won",
        from: ["quoted"],
        to: "won",
        note: "optional",
        tellVisitor: true,
      }),
      action({
        name: "Mark lost",
        from: ["new", "quoted"],
        to: "lost",
        note: "optional",
        tone: "danger",
      }),
    ],
  });
  app.tables = [enquiries];
  app.forms = [
    form({
      name: "Start a project",
      kind: "submit",
      table: enquiries.id,
      fields: [name, email, phone, company, kind, budget, timeline, brief].map(
        (f) => f.id,
      ),
      title: "Start a project",
      intro:
        "A few details help us reply with a useful first answer and, when it fits, a quote.",
      button: "Send enquiry",
      success:
        "Thanks — your reference is {ref}. We reply within two working days.",
    }),
    form({
      name: "Track enquiry",
      kind: "lookup",
      table: enquiries.id,
      key: REF_KEY,
      verify: email.id,
      fields: [kind.id, budget.id, quote.id],
      title: "Track your enquiry",
      intro:
        "Enter your reference (like ENQ-1001) and email to see where it stands and any quote.",
      button: "Track",
    }),
  ];
  app.dashboard = {
    cards: [
      count(enquiries, "New enquiries", ["new"]),
      sum(enquiries, "Quoted, waiting", quote, ["quoted"]),
      sum(enquiries, "Won", quote, ["won"]),
    ],
    lists: [
      list(enquiries, "New enquiries", ["new"]),
      list(enquiries, "Waiting on a decision", ["quoted"]),
    ],
  };
  return { app, collections: [] };
}

export interface WarrantyOptions extends AppTemplateOptions {
  /** Products buyers choose from; typed in otherwise. */
  products?: Collection;
}
export function warrantyApp(
  siteName: string,
  options: WarrantyOptions = {},
): AppBundle {
  const app = emptyApp(siteName);
  const name = createAppField("Your name", "text", { required: true });
  const phone = createAppField("Phone", "phone", { required: true });
  const email = updatesEmail();
  const product = options.products
    ? createAppField("Product", "item", {
        required: true,
        collection: options.products.id,
      })
    : createAppField("Product", "text", { required: true });
  const model = createAppField("Brand and model", "text");
  const serial = createAppField("Serial number", "text", {
    required: true,
    unique: true,
  });
  const bought = createAppField("Date of purchase", "date", { required: true });
  const until = createAppField("Covered until", "date", { ownerOnly: true });
  const registrations = table({
    name: "Warranties",
    singular: "Warranty",
    fields: [serial, name, phone, email, product, model, bought, until],
    statuses: [
      { id: "pending", name: "Checking", tone: "waiting" },
      { id: "active", name: "Covered", tone: "good" },
      { id: "refused", name: "Not covered", tone: "bad" },
    ],
    initial: "pending",
    prefix: "W",
    notify: true,
    actions: [
      action({
        name: "Activate",
        from: ["pending"],
        to: "active",
        set: [until.id],
        tellVisitor: true,
      }),
      action({
        name: "Refuse",
        from: ["pending"],
        to: "refused",
        note: "required",
        tone: "danger",
        tellVisitor: true,
      }),
    ],
  });
  until.required = false;
  app.tables = [registrations];
  app.forms = [
    form({
      name: "Register a product",
      kind: "submit",
      table: registrations.id,
      fields: [name, phone, email, product, model, serial, bought].map(
        (f) => f.id,
      ),
      title: "Register your warranty",
      intro:
        "Register within 30 days of purchase. Keep your bill; we check it before activating cover.",
      button: "Register",
      success: "Registered. Your reference is {ref}.",
    }),
    form({
      name: "Check warranty",
      kind: "lookup",
      table: registrations.id,
      key: serial.id,
      fields: [product.id, model.id, bought.id, until.id],
      totals: [],
      title: "Check your warranty",
      intro: "Enter the serial number from the product label.",
      button: "Check",
    }),
  ];
  app.dashboard = {
    cards: [
      count(registrations, "To check", ["pending"]),
      count(registrations, "Covered", ["active"]),
    ],
    lists: [list(registrations, "To check", ["pending"])],
  };
  return { app, collections: [] };
}

const appOnly =
  (create: AppTemplate["create"]) =>
  (siteName: string): App =>
    create(siteName).app;
const template = (
  t: Omit<AppTemplate, "build" | "create"> & {
    create: (siteName: string, options?: AppTemplateOptions) => AppBundle;
  },
): AppTemplate => ({
  ...t,
  // Sample items' buttons lead to the page the forms go on.
  create: (siteName, options = {}) =>
    t.create(siteName, {
      link: `/${t.page.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ...options,
    }),
  build: appOnly(t.create),
});

export const APP_TEMPLATES: AppTemplate[] = [
  template({
    id: "rewards",
    name: "Customer rewards",
    examples: "Electrical, hardware, pharmacy, any counter shop",
    description:
      "Customers record purchases with their phone number; you approve and add a reward; they check their total.",
    page: "Rewards",
    create: rewardsApp,
  }),
  template({
    id: "membership",
    name: "Loyalty card",
    examples: "Cafés, gyms, salons",
    description:
      "Members check in, you confirm and add points, they see their card.",
    page: "Loyalty card",
    create: membershipApp,
  }),
  template({
    id: "orders",
    name: "Orders & delivery",
    examples: "Restaurants, home kitchens, groceries, bakeries",
    description:
      "Customers order from your menu and pay; you cook or pack, send it out and they track it with their order number.",
    page: "Order",
    create: ordersApp,
  }),
  template({
    id: "appointments",
    name: "Appointments",
    examples: "Salons, clinics, consultants, tutors",
    description:
      "Visitors pick a service and a free time slot; you confirm, mark it done and record the fee; they see their bookings.",
    page: "Book",
    create: appointmentsApp,
  }),
  template({
    id: "reservations",
    name: "Table reservations",
    examples: "Restaurants, cafés, bars",
    description:
      "Guests request a table for a sitting with room left; you confirm with a table number or say you’re full.",
    page: "Reserve",
    create: reservationsApp,
  }),
  template({
    id: "service",
    name: "Service requests",
    examples: "Repairs, installers, cleaners",
    description:
      "Visitors choose a service and ask for a visit; you schedule a technician, finish it and record the charge; they track it.",
    page: "Book a visit",
    create: serviceApp,
  }),
  template({
    id: "classes",
    name: "Classes & fees",
    examples: "Tuition centres, music and dance schools, coaching",
    description:
      "Parents ask for a seat in a course until it’s full; you keep students and fee payments; families check their fee record.",
    page: "Admissions",
    create: classesApp,
  }),
  template({
    id: "events",
    name: "Event registrations",
    examples: "Workshops, open days, community events",
    description:
      "People book seats for an event until it’s full; you confirm, record payment and check them in; they find their tickets.",
    page: "Register",
    create: eventsApp,
  }),
  template({
    id: "hiring",
    name: "Job applications",
    examples: "Any business that’s hiring",
    description:
      "Candidates apply for an open role; you shortlist, interview and hire; they check their status.",
    page: "Careers",
    create: hiringApp,
  }),
  template({
    id: "enquiries",
    name: "Quotes & enquiries",
    examples: "Agencies, studios, contractors, consultants",
    description:
      "Visitors describe a project with budget and timeline; you send a quote and mark it won or lost; they track it.",
    page: "Start a project",
    create: enquiriesApp,
  }),
  template({
    id: "warranty",
    name: "Warranty register",
    examples: "Appliance and electronics sellers",
    description:
      "Buyers register a product by serial number and can check their cover.",
    page: "Warranty",
    create: warrantyApp,
  }),
  template({
    id: "blank",
    name: "Start from scratch",
    examples: "Anything else",
    description: "Make your own tables, steps, forms and dashboard.",
    page: "App",
    create: (siteName) => ({ app: emptyApp(siteName), collections: [] }),
  }),
];
