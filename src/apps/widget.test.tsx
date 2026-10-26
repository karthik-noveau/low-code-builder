// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_SCRIPT } from "./widget";
import { AppFormMarkup } from "./AppSection";
import { APP_TEMPLATES, formNamed } from "./templates";
import { dhanlaxmi } from "../studio/sites/dhanlaxmi";
import {
  REF_KEY,
  createAppField,
  createTable,
  emptyApp,
  validateApp,
  type App,
  type AppForm,
} from "./model";
import {
  createCollection,
  createField,
  createItem,
  type Collection,
} from "../studio/collections";

const API = "https://api.example.com/apps/site-1";
let app: App;
let collections: Collection[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
function mount(
  form: AppForm,
  appApi: string | undefined = API,
  mode: "live" | "editor" = "live",
) {
  document.body.innerHTML = renderToStaticMarkup(
    <AppFormMarkup
      app={app}
      form={form}
      appApi={appApi}
      mode={mode}
      prefix="s1"
      collections={collections}
    />,
  );
  // The published page loads the script; run it the same way (twice is harmless).
  new Function(APP_SCRIPT)();
  new Function(APP_SCRIPT)();
  return document.querySelector<HTMLElement>(".app-form")!;
}
const step = (name: string) =>
  document.querySelector<HTMLElement>(`[data-step="${name}"]`)!;
const visible = () =>
  [...document.querySelectorAll<HTMLElement>("[data-step]")]
    .filter((s) => !s.hidden)
    .map((s) => s.dataset.step);
const submit = (form: HTMLElement) =>
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const type = (name: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  input.value = value;
};

beforeEach(() => {
  app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Dhanlaxmi");
  collections = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("app widget", () => {
  it("is plain, CSP-safe script text", () => {
    expect(APP_SCRIPT).toMatch(/^\(function/);
    expect(APP_SCRIPT).not.toMatch(
      /\beval\(|innerHTML|new Function|import\(|__vite|__name/,
    );
  });

  it("walks a visitor through phone → Is this you? → details → reference", async () => {
    const form = app.forms[0];
    const [amount, description] = form.fields;
    const root = mount(form);
    expect(root.hasAttribute("data-ready")).toBe(true);
    expect(visible()).toEqual(["identify"]);

    // Required fields are checked before anything is sent.
    submit(step("identify"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      step("identify").querySelector(".app-field-error")!.textContent,
    ).toBe("Add phone.");

    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "match",
        fields: [
          { name: "Name", value: "Ravi Kumar" },
          { name: "Phone", value: "•••••3210" },
        ],
      }),
    );
    type("identity", "98765 43210");
    submit(step("identify"));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/forms/${form.id}/find?value=98765%2043210`,
    );
    expect(visible()).toEqual(["confirm"]);
    expect(
      step("confirm").querySelectorAll(".app-match dd")[0].textContent,
    ).toBe("Ravi Kumar");
    expect(document.activeElement?.textContent).toBe("Is this you?");

    step("confirm")
      .querySelector<HTMLButtonElement>('[data-action="confirm"]')!
      .click();
    expect(visible()).toEqual(["fields"]);
    expect(document.querySelector(".app-who-name")!.textContent).toBe(
      "Ravi Kumar",
    );

    type(amount, "2500");
    type(description, "Ceiling fans");
    // The first try fails on the network; the retry reuses its key, so a
    // double send adds one record.
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("offline")),
    );
    submit(step("fields"));
    await flush();
    expect(step("fields").querySelector(".app-error")!.textContent).toMatch(
      /Couldn’t reach the server/,
    );
    fetchMock.mockReturnValueOnce(
      json(201, {
        ref: "ESR-1001",
        message: "Sent for approval. Your reference is ESR-1001.",
      }),
    );
    submit(step("fields"));
    await flush();
    const first = JSON.parse(fetchMock.mock.calls[1][1].body);
    const second = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(fetchMock.mock.calls[2][0]).toBe(`${API}/forms/${form.id}`);
    expect(second).toEqual({
      identity: "98765 43210",
      values: { [amount]: "2500", [description]: "Ceiling fans" },
      key: first.key,
      website: "",
    });
    expect(second.key).toMatch(/\w{8,}/);
    expect(visible()).toEqual(["done"]);
    expect(document.querySelector(".app-done-text")!.textContent).toBe(
      "Sent for approval. Your reference is ESR-1001.",
    );

    step("done")
      .querySelector<HTMLButtonElement>('[data-action="again"]')!
      .click();
    expect(visible()).toEqual(["identify"]);
  });

  it("shows server errors next to the field and starts a new attempt after them", async () => {
    const form = app.forms[0];
    const [amount, description] = form.fields;
    mount(form);
    fetchMock.mockReturnValueOnce(
      json(404, { message: "We couldn’t find that phone number." }),
    );
    type("identity", "9000000000");
    submit(step("identify"));
    await flush();
    const error = step("identify").querySelector<HTMLElement>(".app-error")!;
    expect([error.hidden, error.textContent]).toEqual([
      false,
      "We couldn’t find that phone number.",
    ]);
    expect(error.getAttribute("role")).toBe("alert");

    fetchMock.mockReturnValueOnce(
      json(200, { kind: "match", fields: [{ name: "Name", value: "Asha" }] }),
    );
    submit(step("identify"));
    await flush();
    step("confirm")
      .querySelector<HTMLButtonElement>('[data-action="confirm"]')!
      .click();
    type(amount, "10");
    type(description, "Bulbs");
    fetchMock.mockReturnValueOnce(
      json(422, {
        message: "Purchase amount must be at least 50.",
        field: amount,
      }),
    );
    submit(step("fields"));
    await flush();
    const input = step("fields").querySelector<HTMLInputElement>(
      `[name="${amount}"]`,
    )!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(input.getAttribute("aria-describedby")!)!
        .textContent,
    ).toBe("Purchase amount must be at least 50.");
    expect(document.activeElement).toBe(input);
    fetchMock.mockReturnValueOnce(json(201, { ref: "ESR-1002", message: "" }));
    type(amount, "60");
    submit(step("fields"));
    await flush();
    const [, , third, fourth] = fetchMock.mock.calls.map(
      (c) => c[1]?.body && JSON.parse(c[1].body),
    );
    expect(fourth.key).not.toBe(third.key);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(document.querySelector(".app-done-text")!.textContent).toMatch(
      /ESR-1002/,
    );
  });

  it("lets visitors change the number from “Is this you?”", async () => {
    mount(app.forms[0]);
    fetchMock.mockReturnValueOnce(
      json(200, { kind: "match", fields: [{ name: "Name", value: "Ravi" }] }),
    );
    type("identity", "9876543210");
    submit(step("identify"));
    await flush();
    step("confirm")
      .querySelector<HTMLButtonElement>('[data-action="change"]')!
      .click();
    expect(visible()).toEqual(["identify"]);
    expect(document.activeElement?.getAttribute("name")).toBe("identity");
  });

  it("shows a lookup's totals and history with each step's colour and note", async () => {
    const form = app.forms[1];
    mount(form);
    expect(visible()).toEqual(["lookup"]);
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "record",
        fields: [{ name: "Name", value: "Ravi Kumar" }],
        totals: [
          { name: "Total reward", value: "₹1,250" },
          { name: "Waiting for review", value: "1" },
        ],
        history: [
          {
            ref: "ESR-1003",
            status: { name: "Rejected", tone: "bad" },
            note: "Bill not readable",
            createdAt: "2026-10-20T10:00:00.000Z",
            fields: [{ name: "Purchase amount", value: "₹900" }],
          },
          {
            ref: "ESR-1001",
            status: { name: "Approved", tone: "good" },
            note: "",
            createdAt: "2026-10-01T10:00:00.000Z",
            fields: [],
          },
        ],
      }),
    );
    type("value", "9876543210");
    submit(step("lookup"));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/forms/${form.id}/find?value=9876543210`,
    );
    expect(visible()).toEqual(["result"]);
    const values = [...document.querySelectorAll(".app-total-value")].map(
      (e) => e.textContent,
    );
    expect(values).toEqual(["₹1,250", "1"]);
    const entries = document.querySelectorAll(".app-timeline li");
    expect(entries).toHaveLength(2);
    expect(entries[0].querySelector(".app-pill")!.className).toBe(
      "app-pill tone-bad",
    );
    expect(entries[0].querySelector(".app-entry-note")!.textContent).toBe(
      "Bill not readable",
    );
    expect(entries[0].querySelector("time")!.getAttribute("datetime")).toBe(
      "2026-10-20T10:00:00.000Z",
    );
    expect(entries[1].querySelector(".app-entry-note")).toBeNull();
    expect(
      document.querySelector<HTMLElement>(".app-history-empty")!.hidden,
    ).toBe(true);
    // Values are text, never markup.
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "record",
        fields: [{ name: "Name", value: "<img src=x onerror=alert(1)>" }],
        totals: [],
        history: [],
      }),
    );
    step("result")
      .querySelector<HTMLButtonElement>('[data-action="change"]')!
      .click();
    submit(step("lookup"));
    await flush();
    expect(document.querySelector("img")).toBeNull();
    expect(
      document.querySelector<HTMLElement>(".app-history-empty")!.hidden,
    ).toBe(false);
  });

  it("sends a form without identify straight away, with the honeypot", async () => {
    const bundle = APP_TEMPLATES.find((t) => t.id === "service")!.create(
      "Shop",
    );
    const service = bundle.app;
    app = service;
    collections = bundle.collections;
    const form = service.forms.find((f) => f.kind === "submit" && !f.identify)!;
    mount(form);
    expect(visible()).toEqual(["fields"]);
    const table = service.tables.find((t) => t.id === form.table)!;
    for (const id of form.fields) {
      const f = table.fields.find((x) => x.id === id)!;
      const input = document.querySelector<HTMLInputElement>(`[name="${id}"]`)!;
      if (f.type === "item") {
        const radio = document.querySelector<HTMLInputElement>(
          `input[type=radio][name="${id}"]`,
        );
        if (radio) radio.checked = true;
        else
          input.value = [
            ...document.querySelectorAll<HTMLOptionElement>(
              `select[name="${id}"] option`,
            ),
          ].find((o) => o.value)!.value;
      } else if (f.type === "choice") input.value = f.options[0];
      else if (f.type === "email") input.value = "a@b.co";
      else if (f.type === "phone") input.value = "9876543210";
      else if (f.type === "date") input.value = "2026-11-02";
      else if (f.type === "number" || f.type === "money") input.value = "1";
      else if (f.type !== "yesNo") input.value = "Hello";
    }
    type("website", "spam.example");
    fetchMock.mockReturnValueOnce(json(201, { ref: "", message: "Thanks" }));
    submit(step("fields"));
    await flush();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.website).toBe("spam.example");
    expect(body.identity).toBeUndefined();
    expect(visible()).toEqual(["done"]);
  });

  it("leaves forms without an API alone", () => {
    mount(app.forms[0], "");
    expect(
      document.querySelector(".app-form")!.hasAttribute("data-ready"),
    ).toBe(false);
  });
});

/* ---------- ordering, places, tracking and paying ---------- */

/** A restaurant: a menu with categories, orders with payment, tracking, tables and events. */
function restaurant() {
  const menu = createCollection("menu");
  const category = createField("Category", "choice", ["Mains", "Desserts"]);
  menu.fields.push(category);
  menu.currency = "₹";
  menu.items = [];
  const dish = (title: string, price: string, cat: string, hidden = false) => {
    const item = createItem(menu, {
      [menu.display.title]: title,
      [menu.display.price]: price,
      [menu.display.summary]: `${title}, made fresh.`,
      [category.id]: cat,
    });
    item.hidden = hidden;
    menu.items.push(item);
  };
  dish("Paneer tikka", "240", "Mains");
  dish("Dal makhani", "180", "Mains");
  dish("Gulab jamun", "77", "Desserts");
  dish("Secret special", "999", "Mains", true);
  const events = createCollection("events");
  const a = events.items[0].slug;
  const b = events.items[1].slug;

  const app = emptyApp("Spice");
  const orders = createTable("Orders", "Order");
  orders.prefix = "ORD";
  const phone = createAppField("Phone", "phone", { required: true });
  const dishes = createAppField("Dishes", "items", {
    required: true,
    collection: menu.id,
  });
  const how = createAppField("Delivery or pickup", "choice", {
    required: true,
    options: ["Delivery", "Pickup"],
  });
  orders.fields.push(phone, dishes, how);
  orders.statuses = [
    { id: "new", name: "Received", tone: "waiting" },
    { id: "cooking", name: "Cooking", tone: "waiting" },
    { id: "done", name: "Delivered", tone: "good" },
  ];
  orders.initial = "new";

  const bookings = createTable("Bookings", "Booking");
  const day = createAppField("Date", "date", { required: true });
  const time = createAppField("Time", "choice", {
    required: true,
    options: ["19:00", "20:00"],
  });
  const guests = createAppField("Guests", "number", { required: true });
  const event = createAppField("Event", "item", {
    required: true,
    collection: events.id,
  });
  bookings.fields.push(day, time, guests, event);
  bookings.statuses = [{ id: "ok", name: "Confirmed", tone: "good" }];
  bookings.initial = "ok";
  bookings.capacity = [
    {
      id: "tables",
      name: "Tables",
      group: [day.id, time.id],
      max: 40,
      size: guests.id,
      statuses: ["ok"],
      message: "That time is fully booked.",
    },
    {
      id: "seats",
      name: "Seats",
      group: [event.id],
      max: 0,
      maxField: "seats",
      statuses: ["ok"],
      message: "That event is sold out.",
    },
  ];
  app.tables = [orders, bookings];
  const base = { totals: [], intro: "", success: "Order {ref} placed." };
  app.forms = [
    {
      ...base,
      id: "order",
      name: "Order",
      kind: "submit",
      table: orders.id,
      fields: [orders.titleField, phone.id, dishes.id, how.id],
      payment: { field: dishes.id },
      title: "Order",
      button: "Place order",
    },
    {
      ...base,
      id: "track",
      name: "Track",
      kind: "lookup",
      table: orders.id,
      key: REF_KEY,
      verify: phone.id,
      fields: [how.id],
      title: "Track",
      button: "Track",
    },
    {
      ...base,
      id: "book",
      name: "Book",
      kind: "submit",
      table: bookings.id,
      fields: [bookings.titleField, day.id, time.id, guests.id],
      title: "Book",
      button: "Book",
    },
    {
      ...base,
      id: "event",
      name: "Event",
      kind: "submit",
      table: bookings.id,
      fields: [bookings.titleField, event.id],
      title: "Event",
      button: "Book",
    },
    {
      ...base,
      id: "mine",
      name: "My bookings",
      kind: "lookup",
      table: bookings.id,
      key: guests.id,
      fields: [],
      title: "My bookings",
      button: "Find",
    },
  ];
  return {
    app,
    collections: [menu, events],
    ids: { phone, dishes, how, day, time, guests, event, a, b, orders },
  };
}
const click = (selector: string, index = 0) =>
  document.querySelectorAll<HTMLElement>(selector)[index].click();
const text = (selector: string) =>
  document.querySelector(selector)?.textContent ?? "";
const menuItem = (title: string) =>
  [...document.querySelectorAll<HTMLElement>(".app-menu-item")].find(
    (i) => i.dataset.title === title,
  )!;

describe("ordering, places, tracking and paying", () => {
  let r: ReturnType<typeof restaurant>;
  beforeEach(() => {
    r = restaurant();
    app = r.app;
    collections = r.collections;
  });
  const form = (id: string) => app.forms.find((f) => f.id === id)!;

  it("shows the real menu, grouped, in the editor without letting anyone order", () => {
    mount(form("order"), undefined, "editor");
    expect(visible()).toEqual(["menu"]);
    const names = [...document.querySelectorAll(".app-menu-name")].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Paneer tikka", "Dal makhani", "Gulab jamun"]);
    expect(
      [...document.querySelectorAll(".app-chip")].map((c) => c.textContent),
    ).toEqual(["Mains", "Desserts"]);
    expect(text(".app-menu-price")).toBe("₹240");
    expect(
      document.querySelector<HTMLButtonElement>(".app-add")!.disabled,
    ).toBe(true);
    // Nothing in the preview can be used or focused.
    expect(
      document.querySelectorAll(
        ".app-form a[href], .app-form button:not([disabled]), .app-form input:not([disabled])",
      ),
    ).toHaveLength(0);
  });

  it("builds a cart, shows the order and posts slug → quantity", async () => {
    mount(form("order"));
    expect(visible()).toEqual(["menu"]);
    const bar = document.querySelector<HTMLElement>(".app-cartbar")!;
    expect(bar.hidden).toBe(true);

    const paneer = menuItem("Paneer tikka");
    paneer.querySelector<HTMLElement>("[data-action=add]")!.click();
    expect(paneer.querySelector<HTMLElement>(".app-add")!.hidden).toBe(true);
    expect(paneer.querySelector<HTMLElement>(".app-stepper")!.hidden).toBe(
      false,
    );
    paneer.querySelector<HTMLElement>("[data-action=more]")!.click();
    expect(paneer.querySelector(".app-count")!.textContent).toBe("2");
    expect(document.activeElement?.getAttribute("data-action")).toBe("more");
    const jamun = menuItem("Gulab jamun");
    jamun.querySelector<HTMLElement>("[data-action=add]")!.click();
    expect(bar.hidden).toBe(false);
    expect(text(".app-cartbar-count")).toBe("3 items");
    expect(text(".app-cartbar-total")).toBe("₹557");
    jamun.querySelector<HTMLElement>("[data-action=less]")!.click();
    expect(jamun.querySelector<HTMLElement>(".app-add")!.hidden).toBe(false);
    expect(text(".app-cartbar-total")).toBe("₹480");
    jamun.querySelector<HTMLElement>("[data-action=add]")!.click();

    click("[data-action=checkout]");
    expect(visible()).toEqual(["fields"]);
    expect(document.activeElement?.textContent).toBe("Your order");
    const lines = () =>
      [...document.querySelectorAll(".app-cart-line")].map((l) => [
        l.querySelector(".app-cart-name")!.textContent,
        l.querySelector(".app-count")!.textContent,
        l.querySelector(".app-cart-price")!.textContent,
      ]);
    expect(lines()).toEqual([
      ["Paneer tikka", "2", "₹480"],
      ["Gulab jamun", "1", "₹77"],
    ]);
    expect(text(".app-cart-sum")).toBe("₹557");
    // Quantities can change on the order too.
    click(".app-cart-line [data-action=less]", 1);
    expect(lines()).toEqual([["Paneer tikka", "2", "₹480"]]);
    expect(jamun.querySelector(".app-count")!.textContent).toBe("0");
    click("[data-action=menu]");
    expect(visible()).toEqual(["menu"]);
    click("[data-action=checkout]");

    const { phone, dishes, how } = r.ids;
    type(app.tables[0].titleField, "Asha");
    type(phone.id, "9876543210");
    document.querySelector<HTMLSelectElement>(`[name="${how.id}"]`)!.value =
      "Pickup";
    fetchMock.mockReturnValueOnce(
      json(201, { ref: "ORD-1001", message: "Order ORD-1001 placed." }),
    );
    submit(step("fields"));
    await flush();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/forms/order`);
    const body = JSON.parse(init.body);
    expect(body.values).toEqual({
      [app.tables[0].titleField]: "Asha",
      [phone.id]: "9876543210",
      [how.id]: "Pickup",
      [dishes.id]: { "paneer-tikka": 2 },
    });
    expect(visible()).toEqual(["done"]);
    expect(text(".app-done-text")).toBe("Order ORD-1001 placed.");
    // The next order starts with an empty cart.
    click("[data-action=again]");
    expect(visible()).toEqual(["menu"]);
    expect(paneer.querySelector(".app-count")!.textContent).toBe("0");
    expect(bar.hidden).toBe(true);
  });

  it("asks for payment after ordering and checks whether it arrived", async () => {
    mount(form("order"));
    click("[data-action=add]");
    click("[data-action=checkout]");
    type(app.tables[0].titleField, "Asha");
    type(r.ids.phone.id, "9876543210");
    document.querySelector<HTMLSelectElement>(
      `[name="${r.ids.how.id}"]`,
    )!.value = "Delivery";
    fetchMock.mockReturnValueOnce(
      json(201, {
        ref: "ORD-1002",
        message: "Order ORD-1002 placed.",
        payment: {
          amount: "₹240",
          status: "unpaid",
          reference: "ORD-1002",
          upi: "upi://pay?pa=spice@okhdfc&pn=Spice&am=240",
          checkout: "https://checkout.example.com/s/123",
          instructions: "Or pay cash on delivery.",
          recordId: "rec-9",
        },
      }),
    );
    submit(step("fields"));
    await flush();
    const key = JSON.parse(fetchMock.mock.calls[0][1].body).key;
    expect(visible()).toEqual(["pay"]);
    expect(text(".app-pay-amount")).toBe("₹240");
    expect(text(".app-pay-reference")).toBe("ORD-1002");
    expect(text(".app-pay-message")).toBe("Order ORD-1002 placed.");
    const upi = document.querySelector<HTMLAnchorElement>(".app-pay-upi")!;
    expect([upi.hidden, upi.getAttribute("href")]).toEqual([
      false,
      "upi://pay?pa=spice@okhdfc&pn=Spice&am=240",
    ]);
    // Not on a phone: the UPI id to pay from any app.
    expect(text(".app-pay-upi-id")).toBe("spice@okhdfc");
    const online =
      document.querySelector<HTMLAnchorElement>(".app-pay-online")!;
    expect([online.hidden, online.getAttribute("href")]).toEqual([
      false,
      "https://checkout.example.com/s/123",
    ]);
    expect(online.hasAttribute("target")).toBe(false);
    expect(text(".app-pay-instructions")).toBe("Or pay cash on delivery.");

    fetchMock.mockReturnValueOnce(
      json(200, { amount: "₹240", status: "unpaid", recordId: "rec-9" }),
    );
    click("[data-action=paid]");
    await flush();
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${API}/records/rec-9/pay?key=${encodeURIComponent(key)}`,
    );
    expect(text(".app-pay-state")).toMatch(/haven’t received it yet/);
    expect(
      document.querySelector<HTMLElement>(".app-pay-options")!.hidden,
    ).toBe(false);
    fetchMock.mockReturnValueOnce(
      json(200, { amount: "₹240", status: "paid", recordId: "rec-9" }),
    );
    click("[data-action=paid]");
    await flush();
    expect(text(".app-pay-state")).toBe("Payment received. Thank you!");
    expect(
      document.querySelector<HTMLElement>(".app-pay-options")!.hidden,
    ).toBe(true);
    expect(text(".app-pay-reference")).toBe("ORD-1002");
  });

  it("refuses links that aren't UPI or https", async () => {
    mount(form("order"));
    click("[data-action=add]");
    click("[data-action=checkout]");
    type(app.tables[0].titleField, "Asha");
    type(r.ids.phone.id, "9876543210");
    document.querySelector<HTMLSelectElement>(
      `[name="${r.ids.how.id}"]`,
    )!.value = "Delivery";
    fetchMock.mockReturnValueOnce(
      json(201, {
        ref: "ORD-1",
        message: "",
        payment: {
          amount: "₹240",
          status: "unpaid",
          reference: "ORD-1",
          upi: "javascript:alert(1)",
          checkout: "javascript:alert(1)",
          recordId: "r",
        },
      }),
    );
    submit(step("fields"));
    await flush();
    expect(document.querySelector<HTMLElement>(".app-pay-upi")!.hidden).toBe(
      true,
    );
    expect(document.querySelector<HTMLElement>(".app-pay-online")!.hidden).toBe(
      true,
    );
  });

  it("marks full times from availability and explains a 409", async () => {
    const { day, time, guests } = r.ids;
    fetchMock.mockReturnValueOnce(
      json(200, {
        capacities: [
          {
            id: "tables",
            group: [day.id, time.id],
            max: 40,
            left: { "2026-11-02|19:00": 0, "2026-11-02|20:00": 3 },
          },
        ],
      }),
    );
    mount(form("book"));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/forms/book/availability`);
    const options = () =>
      [
        ...document.querySelectorAll<HTMLOptionElement>(
          `[name="${time.id}"] option`,
        ),
      ]
        .filter((o) => o.value)
        .map((o) => [o.textContent, o.disabled]);
    expect(options()).toEqual([
      ["19:00", false],
      ["20:00", false],
    ]);
    const date = document.querySelector<HTMLInputElement>(
      `[name="${day.id}"]`,
    )!;
    date.value = "2026-11-02";
    date.dispatchEvent(new Event("change", { bubbles: true }));
    expect(options()).toEqual([
      ["19:00 — Full", true],
      ["20:00 — Only 3 left", false],
    ]);
    document.querySelector<HTMLSelectElement>(`[name="${time.id}"]`)!.value =
      "20:00";
    type(guests.id, "2");
    step("fields").dispatchEvent(new Event("input", { bubbles: true }));
    const places = document.querySelector<HTMLElement>(".app-places")!;
    expect([places.hidden, places.textContent]).toEqual([
      false,
      "Room for 3 more guests.",
    ]);
    // Another date has every place.
    date.value = "2026-11-03";
    date.dispatchEvent(new Event("change", { bubbles: true }));
    expect(places.textContent).toBe("Room for 40 more guests.");
    date.value = "2026-11-02";
    date.dispatchEvent(new Event("change", { bubbles: true }));

    type(app.tables[1].titleField, "Ravi");
    fetchMock.mockReturnValueOnce(
      json(409, { message: "That time is fully booked.", field: time.id }),
    );
    fetchMock.mockReturnValueOnce(
      json(200, {
        capacities: [
          {
            id: "tables",
            group: [day.id, time.id],
            max: 40,
            left: { "2026-11-02|19:00": 0, "2026-11-02|20:00": 0 },
          },
        ],
      }),
    );
    submit(step("fields"));
    await flush();
    const select = document.querySelector<HTMLSelectElement>(
      `[name="${time.id}"]`,
    )!;
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(select.getAttribute("aria-describedby")!)!
        .textContent,
    ).toBe("That time is fully booked.");
    expect(fetchMock.mock.calls[2][0]).toBe(`${API}/forms/book/availability`);
    expect(options()).toEqual([
      ["19:00 — Full", true],
      ["20:00 — Full", true],
    ]);
    expect(places.textContent).toBe("That time is fully booked.");
  });

  it("shows sold-out and nearly sold-out items as cards", async () => {
    const { event, a, b } = r.ids;
    fetchMock.mockReturnValueOnce(
      json(200, {
        capacities: [
          { id: "seats", group: [event.id], max: 0, left: { [a]: 0, [b]: 2 } },
        ],
      }),
    );
    mount(form("event"));
    await flush();
    const card = (slug: string) =>
      document
        .querySelector(`input[name="${event.id}"][value="${slug}"]`)!
        .closest<HTMLElement>(".app-choice")!;
    expect(card(a).classList.contains("is-full")).toBe(true);
    expect(card(a).querySelector<HTMLInputElement>("input")!.disabled).toBe(
      true,
    );
    expect(card(a).querySelector(".app-left")!.textContent).toBe("Sold out");
    expect(card(b).classList.contains("is-full")).toBe(false);
    expect(card(b).querySelector(".app-left")!.textContent).toBe("Only 2 left");
    // Choosing is required and checked before sending.
    type(app.tables[1].titleField, "Ravi");
    submit(step("fields"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      step("fields").querySelector(".app-field-error:not([hidden])")!
        .textContent,
    ).toBe("Choose event.");
  });

  it("tracks an order by reference and phone, with its steps, lines and note", async () => {
    mount(form("track"));
    expect(
      document.querySelector<HTMLInputElement>("[name=value]")!.placeholder,
    ).toBe("ORD-1001");
    const found = (status: string, steps: number) => ({
      kind: "record",
      ref: "ORD-1001",
      status: { name: status, tone: "waiting" },
      note: "Running 10 minutes late.",
      fields: [{ name: "Delivery or pickup", value: "Delivery" }],
      totals: [],
      lines: [
        { title: "Paneer tikka", quantity: 2, price: "₹480" },
        { title: "Gulab jamun", quantity: 1, price: "₹77" },
      ],
      steps: [
        { name: "Received", at: "2026-10-26T12:00:00.000Z" },
        { name: "Cooking", at: "2026-10-26T12:05:00.000Z" },
        { name: "Out for delivery", at: "2026-10-26T12:30:00.000Z" },
      ].slice(0, steps),
      history: [],
    });
    fetchMock.mockReturnValueOnce(json(200, found("Cooking", 2)));
    type("value", "ORD-1001");
    type("verify", "98765 43210");
    submit(step("lookup"));
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/forms/track/find?value=ORD-1001&verify=98765%2043210`,
    );
    expect(visible()).toEqual(["result"]);
    expect(text("[data-step=result] .app-step-title")).toBe("Order ORD-1001");
    const pill = document.querySelector<HTMLElement>(".app-result-status")!;
    expect([pill.hidden, pill.textContent, pill.className]).toEqual([
      false,
      "Cooking",
      "app-pill app-result-status tone-waiting",
    ]);
    const progress = () =>
      [...document.querySelectorAll(".app-progress")].map((li) => [
        li.querySelector("strong")!.textContent,
        li.classList.contains("is-current"),
      ]);
    expect(progress()).toEqual([
      ["Received", false],
      ["Cooking", true],
    ]);
    expect(
      [...document.querySelectorAll(".app-lines li")].map((l) => l.textContent),
    ).toEqual(["2 × Paneer tikka₹480", "1 × Gulab jamun₹77"]);
    expect(text(".app-result-note")).toBe("Running 10 minutes late.");

    fetchMock.mockReturnValueOnce(json(200, found("Out for delivery", 3)));
    click("[data-action=refresh]");
    await flush();
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
    expect(progress().at(-1)).toEqual(["Out for delivery", true]);
    expect(pill.textContent).toBe("Out for delivery");

    // A wrong phone is reported on the form.
    click("[data-action=change]");
    fetchMock.mockReturnValueOnce(
      json(404, { message: "We couldn’t find that order.", field: "verify" }),
    );
    submit(step("lookup"));
    await flush();
    expect(
      document.querySelector("[name=verify]")!.getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("lists every record found by a value that isn't unique", async () => {
    mount(form("mine"));
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "record",
        fields: [],
        totals: [],
        history: [
          {
            ref: "",
            status: { name: "Confirmed", tone: "good" },
            note: "",
            createdAt: "2026-10-20T10:00:00.000Z",
            fields: [{ name: "Date", value: "2 Nov 2026" }],
          },
          {
            ref: "",
            status: { name: "Confirmed", tone: "good" },
            note: "",
            createdAt: "2026-10-21T10:00:00.000Z",
            fields: [{ name: "Date", value: "9 Nov 2026" }],
          },
        ],
      }),
    );
    type("value", "2");
    submit(step("lookup"));
    await flush();
    expect(text("[data-step=result] .app-step-title")).toBe("Your bookings");
    expect(document.querySelectorAll(".app-timeline .app-entry")).toHaveLength(
      2,
    );
    expect(
      document.querySelector<HTMLElement>(".app-result-status")!.hidden,
    ).toBe(true);
  });

  it("keeps several app sections on one page apart", () => {
    document.body.innerHTML = ["order", "track"]
      .map((id, i) =>
        renderToStaticMarkup(
          <AppFormMarkup
            app={app}
            form={form(id)}
            appApi={API}
            mode="live"
            prefix={`s${i}`}
            collections={collections}
          />,
        ),
      )
      .join("");
    new Function(APP_SCRIPT)();
    const [order, track] = document.querySelectorAll<HTMLElement>(".app-form");
    expect(order.dataset.ready).toBe("");
    expect(track.dataset.ready).toBe("");
    order.querySelector<HTMLElement>("[data-action=add]")!.click();
    expect(order.querySelector(".app-cartbar-count")!.textContent).toBe(
      "1 item",
    );
    expect(
      track.querySelector<HTMLElement>('[data-step="lookup"]')!.hidden,
    ).toBe(false);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("step-by-step forms (the Dhanlaxmi Rewards customer pages)", () => {
  const site = () => dhanlaxmi("Dhanlaxmi Electricals");
  const links = {
    lookup: { href: "/my-rewards", label: "View my rewards" },
    submit: { href: "/submit", label: "Add a purchase" },
  };
  function mountFlow(name: string, mode: "live" | "editor" = "live") {
    const parts = site();
    app = parts.app!;
    const form = formNamed(app, name);
    document.body.innerHTML = renderToStaticMarkup(
      <AppFormMarkup
        app={app}
        form={form}
        appApi={API}
        mode={mode}
        prefix="s1"
        links={links}
      />,
    );
    new Function(APP_SCRIPT)();
    return form;
  }
  const wizard = () =>
    [...document.querySelectorAll<HTMLElement>("[data-wizard]")].map(
      (s) => s.dataset.state,
    );
  const offline = () =>
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError("offline")),
    );

  it("is a valid app", () => {
    expect(validateApp(site().app)).toBe(true);
  });

  it("shows the first step in the editor, inert, with the step indicator", () => {
    mountFlow("Add a purchase", "editor");
    expect(text(".app-wizard")).toBe("1Phone2Confirm3Purchase");
    expect(wizard()).toEqual(["active", "todo", "todo"]);
    expect(text(".app-step-title")).toBe("What’s your phone number?");
    expect(text(".app-lead")).toBe(
      "We use it to find the profile the shop owner registered for you.",
    );
    expect(text(".app-input-prefix")).toBe("+91");
    expect(text(".app-hint-text")).toBe(
      "10 digits, the number you gave at the shop counter.",
    );
    const input = document.querySelector<HTMLInputElement>("[name=identity]")!;
    expect([input.disabled, input.placeholder]).toEqual([true, "98400 12210"]);
    expect(text("button[type=submit]")).toBe("Continue");
    expect(document.querySelectorAll("[data-step]")).toHaveLength(1);
  });

  it("walks phone → Is this you? → purchase → sent, as the reference does", async () => {
    const form = mountFlow("Add a purchase");
    const [amount, description] = form.fields;
    expect(visible()).toEqual(["identify"]);

    type("identity", "98400");
    submit(step("identify"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      step("identify").querySelector(".app-field-error")!.textContent,
    ).toBe("Enter your 10-digit mobile number");

    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "match",
        title: "Ravi Kumar",
        initials: "RK",
        fields: [
          { name: "Name", value: "Ravi Kumar" },
          { name: "Phone number", value: "•••••2210" },
        ],
        totals: [
          {
            id: "a",
            name: "Approved",
            value: "18",
            amount: 18,
            money: false,
            phrase: "18 approved submissions",
          },
          {
            id: "e",
            name: "Earned",
            value: "₹12,450",
            amount: 12450,
            money: true,
            phrase: "₹12,450 earned",
          },
        ],
      }),
    );
    type("identity", "+91 98400 12210");
    submit(step("identify"));
    await flush();
    expect(visible()).toEqual(["confirm"]);
    expect(wizard()).toEqual(["done", "active", "todo"]);
    expect(text(".app-identity .app-avatar")).toBe("RK");
    expect(text(".app-identity-name")).toBe("Ravi Kumar");
    expect(text(".app-identity-meta")).toBe("•••••2210");
    expect(text(".app-identity-detail")).toBe(
      "18 approved submissions · ₹12,450 earned",
    );
    expect(text("[data-step=confirm] .app-lead")).toBe(
      "Confirm before recording the purchase.",
    );
    expect(text("[data-action=confirm]")).toBe("Yes, continue");
    expect(text("[data-step=confirm] [data-action=change]")).toBe(
      "Use a different number",
    );

    click("[data-action=confirm]");
    expect(visible()).toEqual(["fields"]);
    expect(wizard()).toEqual(["done", "done", "active"]);
    expect(text("[data-step=fields] .app-step-title")).toBe(
      "What did you buy?",
    );
    expect(text("[data-step=fields] .app-lead")).toBe(
      "Recording as Ravi Kumar · •••••2210",
    );
    expect(text("[data-step=fields] .app-input-prefix")).toBe("₹");
    expect(text(".app-counter")).toBe("0 / 500");
    const box = document.querySelector<HTMLTextAreaElement>(
      `[name="${description}"]`,
    )!;
    expect(box.maxLength).toBe(500);
    box.value = "MCB";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    expect(text(".app-counter")).toBe("3 / 500");
    expect(text(".app-info")).toMatch(/^The shop owner decides the reward/);

    // Checked here before anything is sent.
    submit(step("fields"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text(`#app-s1-${amount}-error`)).toBe("Enter the purchase amount.");
    type(amount, "18,400");
    type(description, "ab");
    submit(step("fields"));
    expect(text(`#app-s1-${description}-error`)).toBe(
      "Use 3 to 500 characters.",
    );

    type(description, "6 sqmm Finolex wire 90m");
    fetchMock.mockReturnValueOnce(
      json(201, {
        ref: "ESR-1052",
        status: { name: "Pending", tone: "waiting" },
        message:
          "Reference ESR-1052. The shop owner has been notified and usually reviews the same day.",
      }),
    );
    submit(step("fields"));
    await flush();
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.identity).toBe("+91 98400 12210");
    expect(sent.values).toEqual({
      [amount]: "18,400",
      [description]: "6 sqmm Finolex wire 90m",
    });
    expect(visible()).toEqual(["done"]);
    expect(document.querySelector<HTMLElement>(".app-wizard")!.hidden).toBe(
      true,
    );
    expect(text("[data-step=done] .app-step-title")).toBe("Sent for approval");
    expect(text(".app-done-text .app-mono")).toBe("ESR-1052");
    const badge = document.querySelector<HTMLElement>(".app-done-badge")!;
    expect([badge.textContent, badge.hidden]).toEqual([
      "Pending review",
      false,
    ]);
    expect(badge.querySelector(".app-dot")).not.toBeNull();
    expect(
      document.querySelector("[data-step=done] a")!.getAttribute("href"),
    ).toBe("/my-rewards");
    expect(text("[data-step=done] a")).toBe("View my rewards");

    // Record another: same customer, a fresh purchase.
    click("[data-step=done] [data-action=again]");
    expect(visible()).toEqual(["fields"]);
    expect(text(".app-counter")).toBe("0 / 500");
  });

  it("answers an unknown number, a paused account and no connection with their screens", async () => {
    mountFlow("Add a purchase");
    type("identity", "98765 43210");
    fetchMock.mockReturnValueOnce(
      json(404, {
        message: "We couldn’t find that phone number.",
        field: "value",
      }),
    );
    submit(step("identify"));
    await flush();
    expect(visible()).toEqual(["notfound"]);
    expect(document.querySelector<HTMLElement>(".app-wizard")!.hidden).toBe(
      true,
    );
    expect(text("[data-step=notfound] .app-step-title")).toBe(
      "This number isn’t registered",
    );
    expect(text("[data-step=notfound] .app-state-text")).toBe(
      "Only the shop owner can add a customer. Ask at the counter and you will be set up in a minute.",
    );
    click("[data-step=notfound] [data-action=change]");
    expect(visible()).toEqual(["identify"]);

    fetchMock.mockReturnValueOnce(
      json(403, { message: "This account is paused. Please contact us." }),
    );
    submit(step("identify"));
    await flush();
    expect(visible()).toEqual(["paused"]);
    expect(text("[data-step=paused] .app-step-title")).toBe(
      "This account is inactive",
    );
    expect(text("[data-step=paused] .app-state-text")).toBe(
      "Please speak to the shop before recording another purchase.",
    );
    click("[data-step=paused] [data-action=change]");

    offline();
    submit(step("identify"));
    await flush();
    expect(visible()).toEqual(["identify"]);
    const box = document.querySelector<HTMLElement>(".app-offline")!;
    expect(box.hidden).toBe(false);
    expect(box.querySelector(".app-step-title")!.textContent).toBe(
      "Can’t reach the shop",
    );
    expect(box.querySelector(".app-state-text")!.textContent).toBe(
      "Check your connection and try again.",
    );
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "match",
        title: "Asha",
        fields: [{ name: "Name", value: "Asha" }],
      }),
    );
    click("[data-action=retry]");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(visible()).toEqual(["confirm"]);
    expect(box.hidden).toBe(true);
  });

  it("shows the rewards page: header, highlighted total, tiles and the timeline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    try {
      mountFlow("My rewards");
      expect(text("[data-step=lookup] .app-step-title")).toBe(
        "Check your rewards",
      );
      expect(text("[data-step=lookup] .app-lead")).toBe(
        "Enter the phone number registered at the shop.",
      );
      expect(text(".app-note")).toBe("Nothing is stored on this device.");
      let answer!: (r: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => (answer = resolve)),
      );
      type("value", "9840012210");
      submit(step("lookup"));
      expect(visible()).toEqual(["loading"]);
      expect(document.querySelectorAll(".app-skeleton").length).toBeGreaterThan(
        3,
      );
      answer(
        new Response(
          JSON.stringify({
            kind: "record",
            title: "Ravi Kumar",
            initials: "RK",
            key: "•••••2210",
            since: "2025-03-14T10:00:00.000Z",
            fields: [{ name: "Name", value: "Ravi Kumar" }],
            highlight: {
              id: "t",
              name: "Total rewards earned",
              value: "₹12,450",
              amount: 12450,
              money: true,
              phrase: "₹12,450 total rewards earned",
              across: {
                id: "a",
                name: "Approved",
                value: "18",
                amount: 18,
                money: false,
                phrase: "18 approved submissions",
              },
            },
            totals: [
              {
                id: "a",
                name: "Approved",
                value: "18",
                amount: 18,
                money: false,
                tone: "good",
                phrase: "",
              },
              {
                id: "p",
                name: "Pending",
                value: "2",
                amount: 2,
                money: false,
                tone: "waiting",
                phrase: "",
              },
              {
                id: "s",
                name: "Purchases",
                value: "₹2,40,000",
                short: "₹2.4L",
                amount: 240000,
                money: true,
                tone: "good",
                phrase: "",
              },
            ],
            history: [
              {
                ref: "ESR-1052",
                status: { name: "Pending", tone: "waiting" },
                note: "",
                createdAt: "2026-10-26T09:00:00.000Z",
                fields: [
                  { name: "Purchase amount", value: "₹18,400", type: "money" },
                  {
                    name: "What did you buy?",
                    value: "Finolex wire",
                    type: "longText",
                  },
                ],
              },
              {
                ref: "ESR-1046",
                status: { name: "Approved", tone: "good" },
                note: "",
                createdAt: "2026-10-20T09:00:00.000Z",
                at: "2026-10-24T09:00:00.000Z",
                fields: [
                  { name: "Purchase amount", value: "₹9,800", type: "money" },
                  {
                    name: "What did you buy?",
                    value: "Anchor switches",
                    type: "longText",
                  },
                  { name: "Reward", value: "₹450", type: "money", owner: true },
                ],
              },
              {
                ref: "ESR-1030",
                status: { name: "Rejected", tone: "bad" },
                note: "no matching bill on that date",
                createdAt: "2026-08-01T09:00:00.000Z",
                at: "2026-08-02T09:00:00.000Z",
                fields: [
                  { name: "Purchase amount", value: "₹2,000", type: "money" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
      await flush();
      expect(visible()).toEqual(["result"]);
      expect(text(".app-person .app-avatar")).toBe("RK");
      expect(text(".app-person-name")).toBe("Ravi Kumar");
      expect(text(".app-person-meta")).toBe(
        "•••••2210 · customer since March 2025",
      );
      expect(
        document.querySelectorAll(".app-record-fields > div"),
      ).toHaveLength(0);
      expect(text(".app-panel-label")).toBe("Total rewards earned");
      expect(text(".app-panel-value")).toBe("₹12,450");
      expect(text(".app-panel-meta")).toBe("Across 18 approved submissions");
      const tiles = [...document.querySelectorAll(".app-tile")];
      expect(
        tiles.map((t) => [
          t.className,
          t.querySelector(".app-tile-label")!.textContent,
          t.querySelector(".app-tile-value")!.textContent,
        ]),
      ).toEqual([
        ["app-tile tone-good", "Approved", "18"],
        ["app-tile tone-waiting", "Pending", "2"],
        ["app-tile tone-brand", "Purchases", "₹2.4L"],
      ]);
      expect(tiles.every((t) => t.querySelector(".app-tile-icon svg"))).toBe(
        true,
      );
      expect(text(".app-history h4")).toBe("Your submissions");
      const rows = [...document.querySelectorAll(".app-tl-item")];
      expect(
        rows.map((r) => r.querySelector(".app-tl-top")!.textContent),
      ).toEqual([
        "ESR-1052₹18,400Pending",
        "ESR-1046₹9,800Approved+₹450",
        "ESR-1030₹2,000Rejected",
      ]);
      expect(
        rows.map((r) => r.querySelector(".app-tl-meta")!.textContent),
      ).toEqual([
        "Recorded 3 hours ago",
        "Approved 2 days ago",
        "Reason: no matching bill on that date",
      ]);
      expect(rows[0].querySelector(".app-tl-text")!.textContent).toBe(
        "Finolex wire",
      );
      expect(rows[0].querySelector(".app-pill .app-dot")).not.toBeNull();
      expect(rows[1].querySelector(".app-tl-dot svg")).not.toBeNull();
      expect(
        document.querySelector<HTMLElement>(".app-history-empty")!.hidden,
      ).toBe(true);
      expect(text("[data-step=result] [data-action=change]")).toBe(
        "Check a different number",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an empty history, an unknown number and no connection on the rewards page", async () => {
    mountFlow("My rewards");
    type("value", "9840012210");
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "record",
        title: "Naveen Kumar",
        initials: "NK",
        fields: [],
        totals: [],
        history: [],
      }),
    );
    submit(step("lookup"));
    await flush();
    const empty = document.querySelector<HTMLElement>(".app-history-empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.querySelector(".app-state-title")!.textContent).toBe(
      "No purchases recorded yet",
    );
    expect(empty.querySelector("a")!.getAttribute("href")).toBe("/submit");
    expect(document.querySelector<HTMLElement>(".app-panel")!.hidden).toBe(
      true,
    );

    click("[data-step=result] [data-action=change]");
    fetchMock.mockReturnValueOnce(json(404, { message: "Not found." }));
    submit(step("lookup"));
    await flush();
    expect(visible()).toEqual(["notfound"]);
    expect(text("[data-step=notfound] .app-state-text")).toBe(
      "Only the shop owner can add a customer. Ask at the counter and you can start recording purchases straight away.",
    );
    click("[data-step=notfound] [data-action=change]");

    offline();
    submit(step("lookup"));
    await flush();
    expect(visible()).toEqual(["offline"]);
    expect(text("[data-step=offline] .app-step-title")).toBe(
      "Can’t reach the shop",
    );
    fetchMock.mockReturnValueOnce(
      json(200, {
        kind: "record",
        title: "Naveen",
        fields: [],
        totals: [],
        history: [],
      }),
    );
    click("[data-step=offline] [data-action=retry]");
    await flush();
    expect(visible()).toEqual(["result"]);

    // A rejected lookup value stays inline on the first step.
    click("[data-step=result] [data-action=change]");
    fetchMock.mockReturnValueOnce(
      json(429, { message: "Too many tries. Wait a minute and try again." }),
    );
    submit(step("lookup"));
    await flush();
    expect(visible()).toEqual(["lookup"]);
    expect(text("[data-step=lookup] .app-error")).toBe(
      "Too many tries. Wait a minute and try again.",
    );
  });
});
