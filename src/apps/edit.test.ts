import { describe, expect, it } from "vitest";
import { APP_TEMPLATES } from "./templates";
import {
  APP_FIELD_TYPES,
  REF_KEY,
  createAppField,
  validateApp,
  type App,
  type AppFieldType,
} from "./model";
import {
  actionSentence,
  addAction,
  addField,
  addForm,
  addStatus,
  addSteps,
  addTable,
  addTotal,
  addCapacity,
  capacitySentence,
  changeFieldCollection,
  changeFieldType,
  changeFieldTypeCheck,
  changeFormTable,
  changeLinkTarget,
  changeLinkTargetCheck,
  collectionUsedBy,
  createForm,
  moveField,
  removeField,
  removeFieldCheck,
  removeStatus,
  removeTable,
  removeTableCheck,
  removeTotal,
  setIdentify,
  setLookupKey,
  setOwnerOnly,
  setPayment,
  setPrefix,
  setUnique,
  setVerify,
  totalSentence,
  updateCapacity,
} from "./edit";
import { appIssues } from "./issues";

const rewards = () =>
  APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Dhanlaxmi");
const named = (app: App, name: string) =>
  app.tables.find((t) => t.name === name)!;
const field = (app: App, table: string, name: string) =>
  named(app, table).fields.find((f) => f.name === name)!;
/** Each template's app, with its collections' ids plus one spare collection. */
const bundles = () =>
  APP_TEMPLATES.map((t) => {
    const { app, collections } = t.create("Shop");
    return { id: t.id, app, ids: [...collections.map((c) => c.id), "spare"] };
  });
const templates = () => bundles().map((b) => [b.id, b.app] as const);

describe("safe app edits keep every template valid", () => {
  it("removing any field is refused or leaves a valid app", () => {
    for (const [id, app] of templates())
      for (const table of app.tables)
        for (const f of table.fields) {
          const check = removeFieldCheck(app, table.id, f.id);
          const next = removeField(app, table.id, f.id);
          if (check.blocked.length) expect(next).toBe(app);
          else
            expect([id, f.name, validateApp(next)]).toEqual([id, f.name, true]);
        }
  });
  it("changing any field to any type is refused or leaves a valid app", () => {
    for (const [id, app] of templates())
      for (const table of app.tables)
        for (const f of table.fields)
          for (const type of Object.keys(APP_FIELD_TYPES) as AppFieldType[]) {
            const check = changeFieldTypeCheck(app, table.id, f.id, type);
            const next = changeFieldType(app, table.id, f.id, type);
            if (check.blocked.length) expect(next).toBe(app);
            else
              expect([id, f.name, type, validateApp(next)]).toEqual([
                id,
                f.name,
                type,
                true,
              ]);
          }
  });
  it("every field change keeps the app valid against the site's collections", () => {
    for (const { id, app, ids } of bundles())
      for (const table of app.tables)
        for (const f of table.fields) {
          for (const type of Object.keys(APP_FIELD_TYPES) as AppFieldType[]) {
            const next = changeFieldType(app, table.id, f.id, type, "spare");
            expect([id, f.name, type, validateApp(next, ids)]).toEqual([
              id,
              f.name,
              type,
              true,
            ]);
          }
          const removed = removeField(app, table.id, f.id);
          expect([id, f.name, validateApp(removed, ids)]).toEqual([
            id,
            f.name,
            true,
          ]);
          if (f.type === "item" || f.type === "items")
            expect(
              validateApp(
                changeFieldCollection(app, table.id, f.id, "spare"),
                ids,
              ),
            ).toBe(true);
        }
  });
  it("removing any table, step or total is refused or leaves a valid app", () => {
    for (const [id, app] of templates()) {
      for (const table of app.tables) {
        const removed = removeTable(app, table.id);
        if (removeTableCheck(app, table.id).blocked.length)
          expect(removed.app).toBe(app);
        else
          expect([id, table.name, validateApp(removed.app)]).toEqual([
            id,
            table.name,
            true,
          ]);
        for (const s of table.statuses)
          expect(validateApp(removeStatus(app, table.id, s.id))).toBe(true);
        for (const t of table.totals)
          expect(validateApp(removeTotal(app, t.id))).toBe(true);
      }
    }
  });
  it("templates start with nothing to fix", () => {
    for (const [id, app] of templates())
      expect([id, appIssues(app)]).toEqual([id, []]);
  });
});

describe("fields", () => {
  it("refuses to delete the phone visitors use to find themselves", () => {
    const app = rewards();
    const phone = field(app, "Customers", "Phone");
    const check = removeFieldCheck(app, named(app, "Customers").id, phone.id);
    expect(check.blocked.join(" ")).toMatch(/My rewards.*finds records by it/);
    expect(check.blocked.join(" ")).toMatch(/Record a purchase.*asks visitors/);
  });
  it("cleans every use of a deleted reward field", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    const reward = field(app, "Purchases", "Reward");
    const check = removeFieldCheck(app, purchases.id, reward.id);
    expect(check.blocked).toEqual([]);
    expect(check.cleaned).toEqual(
      expect.arrayContaining([
        "“Approve” will stop asking you for it.",
        "The limit on “Approve” will be removed.",
        "The total “Total reward” will be removed.",
        "“My rewards” will stop showing it in the history.",
      ]),
    );
    const next = removeField(app, purchases.id, reward.id);
    expect(validateApp(next)).toBe(true);
    const customers = named(next, "Customers");
    expect(customers.totals.map((t) => t.name)).not.toContain("Total reward");
    expect(
      next.forms.find((f) => f.name === "My rewards")!.totals,
    ).toHaveLength(1);
    expect(named(next, "Purchases").actions[0].set).toEqual([]);
  });
  it("refuses to delete the title field or the last field", () => {
    let app = addTable(rewards(), "Notes", "Note");
    const notes = named(app, "Notes");
    expect(
      removeFieldCheck(app, notes.id, notes.fields[0].id).blocked,
    ).toHaveLength(2);
    app = addField(app, notes.id, "longText", "Body");
    const body = field(app, "Notes", "Body");
    expect(removeFieldCheck(app, notes.id, body.id).blocked).toEqual([]);
  });
  it("adds, moves and shapes fields by type", () => {
    let app = rewards();
    const id = named(app, "Purchases").id;
    app = addField(app, id, "choice", "Brand");
    const brand = field(app, "Purchases", "Brand");
    expect(brand.options.length).toBeGreaterThan(0);
    app = addField(app, id, "link", "Shop");
    expect(field(app, "Purchases", "Shop").table).toBeTruthy();
    app = moveField(app, id, brand.id, -1);
    expect(named(app, "Purchases").fields.at(-3)!.name).toBe("Brand");
    expect(validateApp(app)).toBe(true);
  });
  it("won't turn a lookup key into a number, or drop its uniqueness", () => {
    const app = rewards();
    const customers = named(app, "Customers");
    const phone = field(app, "Customers", "Phone");
    expect(
      changeFieldTypeCheck(app, customers.id, phone.id, "number").blocked,
    ).not.toEqual([]);
    expect(setUnique(app, customers.id, phone.id, false)).toBe(app);
    const email = field(app, "Customers", "Email");
    const unique = setUnique(app, customers.id, email.id, true);
    expect(field(unique, "Customers", "Email").unique).toBe(true);
  });
  it("drops sums and limits when a money field becomes text", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    const amount = field(app, "Purchases", "Purchase amount");
    const next = changeFieldType(app, purchases.id, amount.id, "text");
    expect(validateApp(next)).toBe(true);
    expect(named(next, "Purchases").actions[0].limits).toEqual([]);
    expect(named(next, "Customers").totals.map((t) => t.name)).not.toContain(
      "Total purchases",
    );
  });
  it("won't repoint a link others add up through", () => {
    let app = rewards();
    const purchases = named(app, "Purchases");
    const customer = field(app, "Purchases", "Customer");
    expect(
      changeLinkTargetCheck(app, purchases.id, customer.id).blocked,
    ).not.toEqual([]);
    expect(changeLinkTarget(app, purchases.id, customer.id, purchases.id)).toBe(
      app,
    );
    app = addField(app, purchases.id, "link", "Referred by");
    const ref = field(app, "Purchases", "Referred by");
    const next = changeLinkTarget(app, purchases.id, ref.id, purchases.id);
    expect(field(next, "Purchases", "Referred by").table).toBe(purchases.id);
  });
  it("takes owner-only fields off visitors' forms", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    const amount = field(app, "Purchases", "Purchase amount");
    const next = setOwnerOnly(app, purchases.id, amount.id, true);
    expect(next.forms[0].fields).not.toContain(amount.id);
    expect(validateApp(next)).toBe(true);
  });
});

describe("tables, steps and totals", () => {
  it("refuses to delete a table another links to, and cleans up after one that isn't", () => {
    const app = rewards();
    const customers = named(app, "Customers");
    expect(removeTableCheck(app, customers.id).blocked[0]).toMatch(
      /Purchases has the field “Customer”/,
    );
    const purchases = named(app, "Purchases");
    const { app: next, forms } = removeTable(app, purchases.id);
    expect(forms).toEqual([app.forms[0].id]);
    expect(validateApp(next)).toBe(true);
    expect(next.forms.map((f) => f.name)).toEqual(["My rewards"]);
    expect(next.forms[0].history).toBeUndefined();
    expect(named(next, "Customers").totals).toEqual([]);
  });
  it("gives a table steps, more steps and actions", () => {
    let app = addTable(rewards(), "Tickets", "Ticket");
    const id = named(app, "Tickets").id;
    app = addSteps(app, id);
    app = addStatus(app, id);
    app = addAction(app, id);
    const t = named(app, "Tickets");
    expect(t.statuses).toHaveLength(3);
    expect(t.actions).toHaveLength(2);
    expect(actionSentence(t, t.actions[0])).toBe("Mark done: from New → Done.");
    expect(validateApp(app)).toBe(true);
  });
  it("removing the last step removes every action", () => {
    let app = rewards();
    const purchases = named(app, "Purchases");
    for (const s of purchases.statuses)
      app = removeStatus(app, purchases.id, s.id);
    const t = named(app, "Purchases");
    expect([t.statuses, t.actions, t.initial]).toEqual([[], [], ""]);
    expect(validateApp(app)).toBe(true);
  });
  it("removing the starting step moves new records to the next", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    const next = removeStatus(app, purchases.id, "pending");
    expect(named(next, "Purchases").initial).toBe("approved");
    expect(
      named(next, "Purchases").actions.every((a) => a.from.length === 0),
    ).toBe(true);
    expect(validateApp(next)).toBe(true);
  });
  it("reads actions and totals as sentences", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    expect(actionSentence(purchases, purchases.actions[0])).toBe(
      "Approve: from Waiting for review → Approved; you fill Reward; Reward can’t be more than purchase amount.",
    );
    expect(actionSentence(purchases, purchases.actions[1])).toBe(
      "Reject: from Waiting for review → Rejected; you must add a note.",
    );
    expect(totalSentence(app, named(app, "Customers").totals[0])).toBe(
      "Total reward = sum of Reward from Purchases where the step is Approved.",
    );
  });
  it("adds a total from the table that links here", () => {
    const fresh = rewards();
    const next = addTotal(fresh, named(fresh, "Customers").id);
    expect(named(next, "Customers").totals).toHaveLength(4);
    expect(validateApp(next)).toBe(true);
    // Nothing links to Purchases, so there's nothing to add up.
    expect(addTotal(fresh, named(fresh, "Purchases").id)).toBe(fresh);
  });
});

describe("forms", () => {
  it("creates sensible submit and lookup forms", () => {
    const app = rewards();
    const submit = createForm(app, "submit")!;
    expect(submit.table).toBe(named(app, "Purchases").id);
    expect(submit.identify?.table).toBe(named(app, "Customers").id);
    const lookup = createForm(app, "lookup")!;
    expect(lookup.key).toBe(field(app, "Customers", "Phone").id);
    expect(lookup.history?.table).toBe(named(app, "Purchases").id);
    const added = addForm(addForm(app, "submit")!.app, "lookup")!;
    expect(validateApp(added.app)).toBe(true);
    expect(appIssues(added.app)).toEqual([]);
  });
  it("has no lookup without a unique field", () => {
    const app = APP_TEMPLATES.find((t) => t.id === "blank")!.build("Shop");
    expect(createForm(app, "lookup")).toBeUndefined();
    expect(createForm(addTable(app), "lookup")).toBeUndefined();
  });
  it("moves a form to another table and switches identify off and on", () => {
    let app = rewards();
    const form = app.forms[0];
    app = setIdentify(app, form.id, false);
    expect(app.forms[0].identify).toBeUndefined();
    expect(appIssues(app).map((i) => i.id)).toContain(`app-missing-${form.id}`);
    app = setIdentify(app, form.id, true);
    expect(app.forms[0].identify).toBeTruthy();
    const moved = changeFormTable(app, form.id, named(app, "Customers").id);
    expect(validateApp(moved)).toBe(true);
    expect(appIssues(moved).map((i) => i.id)).toContain(
      `app-private-${form.id}`,
    );
  });
});

/** Bookings with Date + Time, Guests, Phone and Requested / Confirmed / Cancelled. */
function bookings() {
  let app = addTable(rewards(), "Bookings", "Booking");
  const id = app.tables.at(-1)!.id;
  app = {
    ...app,
    tables: app.tables.map((t) =>
      t.id === id
        ? {
            ...t,
            prefix: "BK",
            fields: [
              ...t.fields,
              createAppField("Date", "date"),
              createAppField("Time", "choice", { options: ["19:00"] }),
              createAppField("Guests", "number"),
              createAppField("Phone", "phone"),
              createAppField("Deposit", "money"),
            ],
            statuses: [
              { id: "req", name: "Requested", tone: "waiting" },
              { id: "ok", name: "Confirmed", tone: "good" },
              { id: "no", name: "Cancelled", tone: "bad" },
            ],
            initial: "req",
          }
        : t,
    ),
  };
  app = addCapacity(app, id);
  return { app, id };
}
const f = (app: App, table: string, name: string) =>
  app.tables.find((t) => t.id === table)!.fields.find((x) => x.name === name)!;

describe("item fields, places, tracking and payment", () => {
  it("won't make an item field without a collection", () => {
    const app = rewards();
    const purchases = named(app, "Purchases");
    const description = field(app, "Purchases", "What did you buy?");
    expect(
      changeFieldTypeCheck(app, purchases.id, description.id, "items").blocked,
    ).toEqual([
      "Choose the collection it picks from, like your menu or services.",
    ]);
    expect(changeFieldType(app, purchases.id, description.id, "items")).toBe(
      app,
    );
    const next = changeFieldType(
      app,
      purchases.id,
      description.id,
      "items",
      "menu-1",
    );
    expect(field(next, "Purchases", "What did you buy?").collection).toBe(
      "menu-1",
    );
    expect(validateApp(next, ["menu-1"])).toBe(true);
    expect(validateApp(next, [])).toBe(false);
    expect(collectionUsedBy(next, "menu-1")).toEqual([
      "Purchases chooses “What did you buy?” from it. Change that field in your app first.",
    ]);
    // Back to text drops the collection.
    const text = changeFieldType(next, purchases.id, description.id, "text");
    expect(
      field(text, "Purchases", "What did you buy?").collection,
    ).toBeUndefined();
    expect(collectionUsedBy(text, "menu-1")).toEqual([]);
  });
  it("starts a limit per date and time, sized by guests, held while not cancelled", () => {
    const { app, id } = bookings();
    const table = app.tables.find((t) => t.id === id)!;
    const [c] = table.capacity!;
    expect(c.group).toEqual([f(app, id, "Date").id, f(app, id, "Time").id]);
    expect(c.size).toBe(f(app, id, "Guests").id);
    const forty = updateCapacity(app, id, c.id, { max: 40 });
    const t = forty.tables.find((x) => x.id === id)!;
    expect(capacitySentence(t, t.capacity![0])).toBe(
      "At most 40 guests per Date + Time while Requested or Confirmed.",
    );
    expect(validateApp(forty)).toBe(true);
    // A per-item number needs an item first in the group.
    const bad = updateCapacity(app, id, c.id, { maxField: "seats" });
    expect(bad.tables.find((x) => x.id === id)!.capacity![0].maxField).toBe(
      undefined,
    );
  });
  it("cleans limits when their fields or steps go", () => {
    const { app, id } = bookings();
    const time = f(app, id, "Time");
    const guests = f(app, id, "Guests");
    expect(removeFieldCheck(app, id, time.id).cleaned).toContain(
      "The limit “Places” will stop counting per time.",
    );
    const noTime = removeField(app, id, time.id);
    expect(noTime.tables.find((t) => t.id === id)!.capacity![0].group).toEqual([
      f(app, id, "Date").id,
    ]);
    expect(validateApp(noTime)).toBe(true);
    const textGuests = changeFieldType(app, id, guests.id, "text");
    expect(
      textGuests.tables.find((t) => t.id === id)!.capacity![0].size,
    ).toBeUndefined();
    const noDate = removeField(noTime, id, f(app, id, "Date").id);
    expect(noDate.tables.find((t) => t.id === id)!.capacity).toEqual([]);
    expect(validateApp(noDate)).toBe(true);
    const noOk = removeStatus(app, id, "ok");
    expect(noOk.tables.find((t) => t.id === id)!.capacity![0].statuses).toEqual(
      ["req"],
    );
  });
  it("tracks by reference with a phone, and keeps the prefix it needs", () => {
    let { app } = bookings();
    const table = app.tables.at(-1)!;
    const phone = table.fields.find((x) => x.name === "Phone")!;
    const added = {
      form: {
        id: "track",
        name: "Track",
        kind: "lookup" as const,
        table: table.id,
        key: phone.id,
        fields: [table.titleField],
        totals: [],
        title: "Track",
        intro: "",
        button: "Track",
        success: "",
      },
    };
    app = { ...app, forms: [...app.forms, added.form] };
    app = setLookupKey(app, added.form.id, REF_KEY);
    app = setVerify(app, added.form.id, phone.id);
    const form = app.forms.find((x) => x.id === added.form.id)!;
    expect([form.key, form.verify]).toEqual([REF_KEY, phone.id]);
    expect(validateApp(app)).toBe(true);
    expect(appIssues(app).map((i) => i.id)).not.toContain(
      `app-ref-verify-${form.id}`,
    );
    expect(setPrefix(app, table.id, "")).toBe(app);
    expect(setPrefix(app, table.id, "bk-2").tables.at(-1)!.prefix).toBe("BK2");
    // Without "Also ask for", anyone with a reference could look.
    const open = setVerify(app, form.id, "");
    expect(appIssues(open).map((i) => i.id)).toContain(
      `app-ref-verify-${form.id}`,
    );
    // Removing the phone stops asking for it.
    const check = removeFieldCheck(app, table.id, phone.id);
    expect(check.cleaned).toContain(
      `“${form.name}” will stop asking for it to check it’s them.`,
    );
    const gone = removeField(app, table.id, phone.id);
    expect(gone.forms.find((x) => x.id === form.id)!.verify).toBeUndefined();
    expect(validateApp(gone)).toBe(true);
  });
  it("asks to pay only a money or order field, and stops when it changes", () => {
    const app = rewards();
    const form = app.forms[0];
    const amount = field(app, "Purchases", "Purchase amount");
    const description = field(app, "Purchases", "What did you buy?");
    expect(setPayment(app, form.id, description.id)).toBe(app);
    const paying = setPayment(app, form.id, amount.id);
    expect(paying.forms[0].payment).toEqual({ field: amount.id });
    expect(validateApp(paying)).toBe(true);
    const purchases = named(app, "Purchases");
    expect(
      changeFieldTypeCheck(paying, purchases.id, amount.id, "text").cleaned,
    ).toContain(`“${form.name}” will stop asking visitors to pay.`);
    const text = changeFieldType(paying, purchases.id, amount.id, "text");
    expect(text.forms[0].payment).toBeUndefined();
    expect(validateApp(text)).toBe(true);
    expect(setPayment(paying, form.id, "").forms[0].payment).toBeUndefined();
  });
  it("creates a tracking lookup for a table with references but nothing unique", () => {
    const blank = APP_TEMPLATES.find((t) => t.id === "blank")!.build("Shop");
    const app = addTable(blank, "Orders", "Order");
    app.tables[0].prefix = "ORD";
    const lookup = createForm(app, "lookup")!;
    expect([lookup.key, lookup.button]).toEqual([REF_KEY, "Track"]);
    expect(validateApp({ ...app, forms: [lookup] })).toBe(true);
  });
});
