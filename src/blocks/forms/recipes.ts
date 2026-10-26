/**
 * What a prebuilt form section needs in the business app: a table and a
 * form. A preset's form block carries `recipe` instead of a form id; when it
 * lands on the page, `bindRecipes` (run by syncForms) reuses a matching
 * table or creates one, adds the form and binds the block. Field ids are
 * readable ("name", "email") so the preset's field blocks can name them.
 */
import {
  appId,
  emptyApp,
  MAX_FORMS,
  MAX_TABLES,
  REF_KEY,
  type App,
  type AppField,
  type AppForm,
  type AppTable,
} from "../../apps/model";

export interface Recipe {
  id: string;
  table: Omit<AppTable, "id">;
  form: Omit<AppForm, "id" | "table" | "fields">;
  /** Lookups: find a table of another recipe (or make one) to look in. */
  lookIn?: string[];
  /** Lookups: the fields of the found record shown, when the table has them. */
  show?: string[];
}

const field = (
  id: string,
  name: string,
  type: AppField["type"],
  extra: Partial<AppField> = {},
): AppField => ({ id, name, type, required: false, options: [], ...extra });

const workflow = (
  waiting: string,
  done: string,
): Pick<AppTable, "statuses" | "initial" | "actions"> => ({
  statuses: [
    { id: "new", name: waiting, tone: "waiting" },
    { id: "done", name: done, tone: "good" },
    { id: "cancelled", name: "Cancelled", tone: "bad" },
  ],
  initial: "new",
  actions: [
    {
      id: "finish",
      name: done,
      from: ["new"],
      to: "done",
      set: [],
      note: "optional",
      limits: [],
      tone: "primary",
      tellVisitor: true,
    },
    {
      id: "cancel",
      name: "Cancel",
      from: ["new", "done"],
      to: "cancelled",
      set: [],
      note: "optional",
      limits: [],
      tone: "danger",
      tellVisitor: true,
    },
  ],
});

const base = {
  totals: [],
  notify: true,
} satisfies Partial<AppTable>;

export const RECIPES: Recipe[] = [
  {
    id: "contact",
    table: {
      ...base,
      name: "Enquiries",
      singular: "Enquiry",
      prefix: "",
      titleField: "name",
      statuses: [],
      initial: "",
      actions: [],
      fields: [
        field("name", "Your name", "text", { required: true, maxLength: 80 }),
        field("email", "Email", "email", { required: true }),
        field("phone", "Phone", "phone"),
        field("message", "Message", "longText", {
          required: true,
          maxLength: 1000,
        }),
      ],
    },
    form: {
      name: "Contact form",
      kind: "submit",
      totals: [],
      title: "Get in touch",
      intro: "",
      button: "Send message",
      success: "Thanks — we’ll get back to you within a day.",
    },
  },
  {
    id: "booking",
    table: {
      ...base,
      ...workflow("Requested", "Confirmed"),
      name: "Bookings",
      singular: "Booking",
      prefix: "BK",
      titleField: "name",
      fields: [
        field("name", "Your name", "text", { required: true, maxLength: 80 }),
        field("phone", "Phone", "phone", { required: true }),
        field("service", "What would you like?", "choice", {
          required: true,
          options: ["Consultation", "Standard visit", "Follow-up"],
        }),
        field("date", "Preferred date", "date", { required: true }),
        field("time", "Preferred time", "choice", {
          required: true,
          options: ["Morning", "Afternoon", "Evening"],
        }),
        field("people", "How many people?", "number", { min: 1, max: 20 }),
        field("notes", "Anything we should know?", "longText", {
          maxLength: 500,
        }),
      ],
    },
    form: {
      name: "Booking form",
      kind: "submit",
      totals: [],
      title: "Book an appointment",
      intro: "",
      button: "Request booking",
      success:
        "Thanks — we’ve got your request and will confirm shortly. Your reference is {ref}.",
    },
  },
  {
    id: "order",
    table: {
      ...base,
      ...workflow("Received", "Delivered"),
      name: "Orders",
      singular: "Order",
      prefix: "ORD",
      titleField: "name",
      fields: [
        field("name", "Your name", "text", { required: true, maxLength: 80 }),
        field("phone", "Phone", "phone", { required: true }),
        field("product", "What would you like to order?", "longText", {
          required: true,
          maxLength: 600,
          placeholder: "e.g. 2 kg basmati rice, 1 litre olive oil",
        }),
        field("delivery", "Delivery or pickup", "choice", {
          required: true,
          options: ["Home delivery", "Store pickup"],
        }),
        field("address", "Delivery address", "longText", { maxLength: 300 }),
        field("date", "When do you need it?", "date"),
      ],
    },
    form: {
      name: "Order form",
      kind: "submit",
      totals: [],
      title: "Place an order",
      intro: "",
      button: "Place order",
      success:
        "Thanks — your order is in. Your reference is {ref}; keep it to track your order.",
    },
  },
  {
    id: "registration",
    table: {
      ...base,
      name: "Registrations",
      singular: "Registration",
      prefix: "REG",
      titleField: "name",
      statuses: [],
      initial: "",
      actions: [],
      fields: [
        field("name", "Full name", "text", { required: true, maxLength: 80 }),
        field("email", "Email", "email", { required: true, unique: true }),
        field("phone", "Phone", "phone", { required: true }),
        field("batch", "Which batch?", "choice", {
          required: true,
          options: ["Weekday mornings", "Weekday evenings", "Weekends"],
        }),
        field("updates", "Send me updates on WhatsApp", "yesNo"),
      ],
    },
    form: {
      name: "Registration form",
      kind: "submit",
      totals: [],
      title: "Register",
      intro: "",
      button: "Register",
      success: "You’re registered! Your registration number is {ref}.",
    },
  },
  {
    id: "feedback",
    table: {
      ...base,
      notify: false,
      name: "Feedback",
      singular: "Feedback",
      prefix: "",
      titleField: "name",
      statuses: [],
      initial: "",
      actions: [],
      fields: [
        field("rating", "How was your experience?", "choice", {
          required: true,
          options: ["Excellent", "Good", "Okay", "Poor"],
        }),
        field("comments", "Tell us more", "longText", { maxLength: 1000 }),
        field("name", "Your name", "text", { maxLength: 80 }),
        field("contact", "You may contact me about this", "yesNo"),
      ],
    },
    form: {
      name: "Feedback form",
      kind: "submit",
      totals: [],
      title: "Share your feedback",
      intro: "",
      button: "Send feedback",
      success: "Thank you — your feedback helps us get better.",
    },
  },
  {
    id: "track",
    lookIn: ["order", "booking"],
    show: ["product", "service", "delivery", "date", "time"],
    // Used only when no table to look in exists: the order table.
    table: {
      ...base,
      name: "",
      singular: "",
      prefix: "",
      titleField: "",
      statuses: [],
      initial: "",
      actions: [],
      fields: [],
    },
    form: {
      name: "Track your order",
      kind: "lookup",
      key: REF_KEY,
      verify: "phone",
      totals: [],
      title: "Track your order",
      intro: "Enter your reference number and phone to see where it’s up to.",
      button: "Track",
      success: "",
    },
  },
];
export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);

/** A table that already serves this recipe: same name, every field there. */
function matchingTable(app: App, recipe: Recipe) {
  return app.tables.find(
    (t) =>
      t.name.toLowerCase() === recipe.table.name.toLowerCase() &&
      recipe.table.fields.every((f) =>
        t.fields.some((x) => x.id === f.id && x.type === f.type),
      ),
  );
}
function uniqueName(app: App, name: string) {
  const taken = new Set(app.tables.map((t) => t.name.toLowerCase()));
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${name} ${n}`;
  return out;
}
/** The table a recipe's form goes on: an existing match, or a new one (null when the app is full). */
function tableFor(app: App, recipe: Recipe): [App, AppTable] | null {
  if (recipe.lookIn) {
    for (const id of recipe.lookIn) {
      const r = recipeById(id)!;
      const found = matchingTable(app, r);
      if (found) return [app, found];
    }
    return tableFor(app, recipeById(recipe.lookIn[0])!);
  }
  const found = matchingTable(app, recipe);
  if (found) return [app, found];
  if (app.tables.length >= MAX_TABLES) return null;
  const table: AppTable = {
    ...structuredClone(recipe.table),
    id: appId(),
    name: uniqueName(app, recipe.table.name),
  };
  return [{ ...app, tables: [...app.tables, table] }, table];
}

/**
 * Adds the recipe's form (and its table when needed) to `app` (a new app
 * when there's none). `fields`: the field ids the block asks for. Null when
 * the app can't take another form or table.
 */
export function applyRecipe(
  app: App | undefined,
  recipe: Recipe,
  fields: string[],
  siteName: string,
): { app: App; form: AppForm } | null {
  const start = app ?? emptyApp(siteName || "My app");
  if (start.forms.length >= MAX_FORMS) return null;
  const placed = tableFor(start, recipe);
  if (!placed) return null;
  const [withTable, table] = placed;
  const form: AppForm = {
    ...structuredClone(recipe.form),
    id: appId(),
    table: table.id,
    fields:
      recipe.form.kind === "lookup"
        ? [table.titleField, ...(recipe.show ?? [])].filter(
            (f, i, all) =>
              all.indexOf(f) === i && table.fields.some((x) => x.id === f),
          )
        : fields.filter((f) => table.fields.some((x) => x.id === f)),
  };
  if (form.kind === "lookup") {
    if (!table.prefix) form.key = table.fields.find((f) => f.unique)?.id;
    if (!form.key) return null;
    if (form.verify && !table.fields.some((f) => f.id === form.verify))
      delete form.verify;
  }
  return { app: { ...withTable, forms: [...withTable.forms, form] }, form };
}

/**
 * A stand-in app with the recipe's table and form, for drawing a preset
 * before it's placed (the Add panel's miniatures).
 */
export function recipePreview(recipe: Recipe) {
  const target = recipe.lookIn ? recipeById(recipe.lookIn[0])! : recipe;
  const table: AppTable = { ...structuredClone(target.table), id: "preview" };
  const form: AppForm = {
    ...structuredClone(recipe.form),
    id: "preview",
    table: "preview",
    fields:
      recipe.form.kind === "lookup"
        ? [table.titleField, ...(recipe.show ?? [])].filter((f) =>
            table.fields.some((x) => x.id === f),
          )
        : table.fields.map((f) => f.id),
  };
  const app: App = { ...emptyApp("Preview"), tables: [table], forms: [form] };
  return { app, form, table };
}
