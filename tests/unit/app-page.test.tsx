// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AppPage } from "../../src/apps/AppPage";
import * as api from "../../src/apps/api";
import * as cloud from "../../src/cloud/client";
import { useSession } from "../../src/brand/useSession";
import { APP_TEMPLATES } from "../../src/apps/templates";
import type { App, AppRecord, AppTable } from "../../src/apps/model";
import type { RecordList } from "../../src/apps/api-types";
import {
  defaultFilter,
  linkTitler,
  localDay,
  recordRows,
} from "../../src/apps/app-helpers";
import { deviceLabel, keyBytes } from "../../src/apps/push";

vi.mock("../../src/brand/useSession");
vi.mock("../../src/apps/api");
vi.mock("../../src/cloud/client", async (original) => ({
  ...(await original<typeof import("../../src/cloud/client")>()),
  listSites: vi.fn(),
  notificationsSeen: vi.fn(),
}));

let app: App;
let customers: AppTable;
let purchases: AppTable;
let records: Record<string, AppRecord[]>;
const field = (table: AppTable, name: string) =>
  table.fields.find((f) => f.name === name)!.id;
const record = (
  table: AppTable,
  id: string,
  values: AppRecord["values"],
  extra: Partial<AppRecord> = {},
): AppRecord => ({
  id,
  table: table.id,
  ref: "",
  values,
  status: "",
  note: "",
  history: [],
  source: "owner",
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  revision: 1,
  ...extra,
});
const list = (tableId: string): RecordList => ({
  records: records[tableId],
  links: {
    [customers.id]: Object.fromEntries(
      records[customers.id].map((r) => [
        r.id,
        String(r.values[customers.titleField]),
      ]),
    ),
  },
});
const go = (url: string) => history.replaceState(null, "", url);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    loading: false,
    error: "",
    config: { enabled: true, mode: "local" },
    account: { id: "owner", email: "owner@local.test" },
  });
  vi.mocked(cloud.listSites).mockResolvedValue({
    sites: [
      {
        id: "s1",
        name: "Dhanlaxmi",
        version: 1,
        status: "published",
        updatedAt: "2026-10-10T10:00:00Z",
      },
    ],
  });
  vi.mocked(cloud.notificationsSeen).mockResolvedValue({ seenAt: "" });
  app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build("Dhanlaxmi");
  [customers, purchases] = app.tables;
  const customer = field(purchases, "Customer");
  const amount = field(purchases, "Purchase amount");
  const what = field(purchases, "What did you buy?");
  const reward = field(purchases, "Reward");
  const total = customers.totals[0].id;
  records = {
    [customers.id]: [
      record(
        customers,
        "c1",
        {
          [customers.titleField]: "Ada Brooks",
          [field(customers, "Phone")]: "9876543210",
        },
        { totals: { [total]: 300 } },
      ),
      record(customers, "c2", {
        [customers.titleField]: "Ravi Kumar",
        [field(customers, "Phone")]: "9123456780",
      }),
    ],
    [purchases.id]: [
      record(
        purchases,
        "p1",
        { [customer]: "c1", [amount]: 18400, [what]: "LED panels" },
        {
          ref: "ESR-1001",
          status: "pending",
          createdAt: "2026-10-03T10:00:00Z",
        },
      ),
      record(
        purchases,
        "p2",
        { [customer]: "c2", [amount]: 2500, [what]: "Ceiling fan" },
        {
          ref: "ESR-1002",
          status: "pending",
          createdAt: "2026-10-02T10:00:00Z",
        },
      ),
      record(
        purchases,
        "p3",
        { [customer]: "c1", [amount]: 6000, [what]: "Wiring", [reward]: 300 },
        { ref: "ESR-1000", status: "approved" },
      ),
    ],
  };
  vi.mocked(api.loadAppInfo).mockResolvedValue({ app, published: true });
  vi.mocked(api.listRecords).mockImplementation(async (_site, table) =>
    list(table),
  );
  vi.mocked(api.loadSummary).mockResolvedValue({
    cards: [
      { id: "k1", name: "Rewards owed", value: 862300, money: true },
      { id: "k2", name: "Waiting for review", value: 2, money: false },
    ],
    lists: [
      {
        id: app.dashboard.lists[0].id,
        name: "Waiting for review",
        table: purchases.id,
        records: records[purchases.id].slice(0, 2),
      },
    ],
    links: list(customers.id).links,
  });
});
afterEach(() => {
  cleanup();
  go("/");
});

describe("app page", () => {
  it("shows the dashboard figures and opens a waiting record from its list", async () => {
    go("/apps?site=s1");
    render(<AppPage siteId="s1" />);
    expect(await screen.findByText("₹8,62,300")).toBeTruthy();
    expect(screen.getByText("Rewards owed")).toBeTruthy();
    // The sidebar lists the app's sections.
    const nav = screen.getByRole("navigation", {
      name: "Workspace navigation",
    });
    expect(
      within(nav).getByRole("link", { name: "Purchases" }).getAttribute("href"),
    ).toBe(`/apps?site=s1&table=${purchases.id}`);
    fireEvent.click(screen.getByRole("button", { name: /LED panels/ }));
    const drawer = await screen.findByRole("dialog", { name: "LED panels" });
    expect(location.search).toBe(`?site=s1&table=${purchases.id}&record=p1`);
    expect(
      within(drawer).getByRole("button", { name: "Ada Brooks" }),
    ).toBeTruthy();
    expect(
      within(drawer).getByRole("button", { name: "Approve" }),
    ).toBeTruthy();
  });

  it("opens a table on its waiting records, with counts, search and sort", async () => {
    go(`/apps?site=s1&table=${purchases.id}`);
    render(<AppPage siteId="s1" />);
    const waiting = await screen.findByRole("button", {
      name: /Waiting for review 2/,
    });
    expect(waiting.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Ceiling fan")).toBeTruthy();
    expect(screen.queryByText("Wiring")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All 3/ }));
    expect(screen.getByText("Wiring")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search purchases" }),
      {
        target: { value: "ravi" },
      },
    );
    expect(screen.getByText("Ceiling fan")).toBeTruthy();
    expect(screen.queryByText("LED panels")).toBeNull();
    expect(screen.getByText(/Showing 1 of 3/)).toBeTruthy();
    expect(defaultFilter(purchases, [])).toBe("all");
  });

  it("checks a new record's fields and shows the server's field errors", async () => {
    go(`/apps?site=s1&table=${customers.id}`);
    vi.mocked(api.createRecord).mockRejectedValueOnce(
      new cloud.ApiError(
        422,
        "This phone number is already registered.",
        field(customers, "Phone"),
      ),
    );
    render(<AppPage siteId="s1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add customer" }),
    );
    // Owner-only fields aren't on the add form; the active flag isn't owner-only.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add customer" }).at(-1)!,
    );
    expect(await screen.findByText("Add name.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Meera" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "12" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add customer" }).at(-1)!,
    );
    expect(await screen.findByText("Add a valid phone number.")).toBeTruthy();
    expect(api.createRecord).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "+91 98765 43210" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add customer" }).at(-1)!,
    );
    expect(
      await screen.findByText("This phone number is already registered."),
    ).toBeTruthy();
    expect(api.createRecord).toHaveBeenCalledWith(
      "s1",
      customers.id,
      expect.objectContaining({
        [customers.titleField]: "Meera",
        [field(customers, "Phone")]: "9876543210",
      }),
    );
    expect(screen.getByLabelText("Phone").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("explains the limit, fills presets without submitting, and reads the reward back", async () => {
    go(`/apps?site=s1&table=${purchases.id}&record=p1`);
    vi.mocked(api.runAction).mockResolvedValue({
      record: records[purchases.id][0],
    });
    render(<AppPage siteId="s1" />);
    const drawer = await screen.findByRole("dialog", { name: "LED panels" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Approve ESR-1001/,
    });
    expect(dialog.textContent).toContain(
      "Reward can't be more than the purchase amount: ₹18,400",
    );
    const reward = within(dialog).getByLabelText("Reward") as HTMLInputElement;
    fireEvent.change(reward, { target: { value: "20000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(
      await within(dialog).findByText(
        "Reward can't be more than the purchase amount.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Fill 5%/ }));
    expect(reward.value).toBe("920");
    expect(api.runAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(
      await within(dialog).findByText(
        "Approve “LED panels” for Ada Brooks with reward ₹920?",
      ),
    ).toBeTruthy();
    expect(api.runAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Yes, approve" }),
    );
    await waitFor(() =>
      expect(api.runAction).toHaveBeenCalledWith(
        "s1",
        "p1",
        purchases.actions[0].id,
        {
          values: { [field(purchases, "Reward")]: 920 },
          note: "",
          revision: 1,
        },
      ),
    );
    expect(
      await screen.findByText(/Approve: “LED panels” is done/),
    ).toBeTruthy();
  });

  it("needs a reason to reject and reloads when someone else got there first", async () => {
    go(`/apps?site=s1&table=${purchases.id}&record=p1`);
    vi.mocked(api.runAction).mockRejectedValue(
      new cloud.ApiError(409, "This purchase has changed."),
    );
    render(<AppPage siteId="s1" />);
    const drawer = await screen.findByRole("dialog", { name: "LED panels" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Reject ESR-1001/,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(await within(dialog).findByText("Add a reason.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "No bill" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Yes, reject" }),
    );
    expect(
      await screen.findByText(/Someone else changed this purchase first/),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Reject/ })).toBeNull();
    await waitFor(() =>
      expect(
        vi
          .mocked(api.listRecords)
          .mock.calls.filter(([, t]) => t === purchases.id).length,
      ).toBeGreaterThan(1),
    );
  });

  it("shows why a record can't be deleted", async () => {
    go(`/apps?site=s1&table=${customers.id}&record=c1`);
    vi.mocked(api.deleteRecord).mockRejectedValue(
      new cloud.ApiError(
        409,
        "Ada Brooks has 2 purchases. Delete those first.",
      ),
    );
    render(<AppPage siteId="s1" />);
    const drawer = await screen.findByRole("dialog", { name: "Ada Brooks" });
    // Their purchases are listed with the customer.
    expect(await within(drawer).findByText("LED panels")).toBeTruthy();
    expect(within(drawer).getByText("₹300")).toBeTruthy();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Delete customer" }),
    );
    fireEvent.click(within(drawer).getByRole("button", { name: "Delete" }));
    expect(
      await within(drawer).findByText(
        "Ada Brooks has 2 purchases. Delete those first.",
      ),
    ).toBeTruthy();
  });

  it("invites building an app when the site has none", async () => {
    go("/apps?site=s1");
    vi.mocked(api.loadAppInfo).mockResolvedValue({
      app: null,
      published: false,
    });
    render(<AppPage siteId="s1" />);
    const build = await screen.findByRole("link", { name: "Build an app" });
    expect(build.getAttribute("href")).toBe("/editor?site=s1");
    expect(screen.getByText(/Customer rewards, Loyalty card/)).toBeTruthy();
  });

  it("says forms wait for publishing, and lists an empty table plainly", async () => {
    go(`/apps?site=s1&table=${customers.id}`);
    vi.mocked(api.loadAppInfo).mockResolvedValue({ app, published: false });
    records[customers.id] = [];
    render(<AppPage siteId="s1" />);
    expect(await screen.findByText("No customers yet")).toBeTruthy();
    expect(
      screen.getByText(/Visitors can use your forms once you publish the site/),
    ).toBeTruthy();
  });

  it("offers a retry when records can't load", async () => {
    go(`/apps?site=s1&table=${purchases.id}`);
    vi.mocked(api.listRecords).mockRejectedValueOnce(
      new Error("Network down."),
    );
    render(<AppPage siteId="s1" />);
    expect(await screen.findByText("Network down.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("LED panels")).toBeTruthy();
  });

  it("names devices and decodes push keys", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      ),
    ).toBe("Chrome on Mac");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect([...keyBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("business app owner tools", () => {
  const text = (id: string, name: string, extra = {}) => ({
    id,
    name,
    type: "text" as const,
    required: false,
    options: [],
    ...extra,
  });
  let food: App;
  let orders: AppTable;
  let bookings: AppTable;
  const paneer = { slug: "paneer", title: "Paneer tikka", price: 220 };
  const naan = { slug: "naan", title: "Naan", price: 40 };
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Not available: views just aren't remembered.
    }
    orders = {
      id: "orders",
      name: "Orders",
      singular: "Order",
      fields: [
        text("name", "Name", { required: true }),
        text("email", "Email", { type: "email" }),
        text("dishes", "Dishes", {
          type: "items",
          required: true,
          collection: "menu",
        }),
      ],
      titleField: "name",
      statuses: [
        { id: "new", name: "New", tone: "waiting" },
        { id: "cooking", name: "Preparing", tone: "neutral" },
        { id: "done", name: "Delivered", tone: "good" },
        { id: "cancelled", name: "Cancelled", tone: "bad" },
      ],
      initial: "new",
      actions: [
        {
          id: "start",
          name: "Start",
          from: ["new"],
          to: "cooking",
          set: [],
          note: "none",
          limits: [],
          tone: "primary",
          tellVisitor: true,
        },
        {
          id: "cancel",
          name: "Cancel",
          from: ["new", "cooking"],
          to: "cancelled",
          set: [],
          note: "required",
          limits: [],
          tone: "danger",
        },
        {
          id: "deliver",
          name: "Deliver",
          from: ["cooking"],
          to: "done",
          set: [],
          note: "optional",
          limits: [],
          tone: "primary",
          tellVisitor: true,
        },
      ],
      totals: [],
      prefix: "ORD",
      notify: true,
    };
    bookings = {
      id: "bookings",
      name: "Bookings",
      singular: "Booking",
      fields: [
        text("guest", "Name", { required: true }),
        text("day", "Date", { type: "date", required: true }),
        text("time", "Time", {
          type: "choice",
          required: true,
          options: ["19:00", "20:00"],
        }),
        text("guests", "Guests", { type: "number", required: true }),
      ],
      titleField: "guest",
      statuses: [
        { id: "requested", name: "Requested", tone: "waiting" },
        { id: "confirmed", name: "Confirmed", tone: "good" },
        { id: "cancelled", name: "Cancelled", tone: "bad" },
      ],
      initial: "requested",
      actions: [],
      totals: [],
      prefix: "TBL",
      notify: true,
      capacity: [
        {
          id: "slots",
          name: "Tables",
          group: ["day", "time"],
          max: 20,
          size: "guests",
          statuses: ["requested", "confirmed"],
          message: "That time is fully booked.",
        },
      ],
    };
    food = {
      tables: [orders, bookings],
      forms: [],
      dashboard: { cards: [], lists: [] },
      currency: "INR",
      install: { enabled: false, name: "Spice", shortName: "Spice" },
    };
    const booking = (
      id: string,
      day: string,
      time: string,
      guests: number,
      status: string,
    ) =>
      record(
        bookings,
        id,
        { guest: `Guest ${id}`, day, time, guests },
        { status, ref: `TBL-${id}` },
      );
    records = {
      orders: [
        record(
          orders,
          "o1",
          { name: "Asha", email: "asha@example.com", dishes: 480 },
          {
            ref: "ORD-1004",
            status: "new",
            createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
            lines: {
              dishes: [
                { ...paneer, quantity: 2 },
                { ...naan, quantity: 1 },
              ],
            },
            payment: {
              amount: 480,
              currency: "INR",
              status: "unpaid",
              reference: "ORD-1004",
            },
          },
        ),
        record(
          orders,
          "o2",
          { name: "Ben", dishes: 40 },
          {
            ref: "ORD-1003",
            status: "cooking",
            lines: { dishes: [{ ...naan, quantity: 1 }] },
            payment: {
              amount: 40,
              currency: "INR",
              status: "paid",
              reference: "ORD-1003",
              confirmedBy: "provider",
            },
          },
        ),
        record(
          orders,
          "o3",
          { name: "Chen", dishes: 220 },
          {
            ref: "ORD-1002",
            status: "done",
            lines: { dishes: [{ ...paneer, quantity: 1 }] },
          },
        ),
      ],
      bookings: [
        booking("1", localDay(0), "19:00", 4, "confirmed"),
        booking("2", localDay(0), "19:00", 2, "requested"),
        booking("3", localDay(0), "19:00", 5, "cancelled"),
        booking("4", localDay(1), "20:00", 20, "confirmed"),
        booking("5", localDay(-1), "19:00", 8, "confirmed"),
        booking("6", localDay(10), "19:00", 8, "confirmed"),
      ],
    };
    vi.mocked(api.loadAppInfo).mockResolvedValue({
      app: food,
      published: true,
    });
    vi.mocked(api.listRecords).mockImplementation(async (_site, table) => ({
      records: [...records[table]],
      links: {},
    }));
    vi.mocked(api.loadCatalog).mockResolvedValue({
      menu: [paneer, naan, { slug: "lassi", title: "Lassi", price: 60 }],
    });
  });

  it("shows what was ordered in the list, the panel and the CSV, and finds orders by item or reference", async () => {
    go("/apps?site=s1&table=orders");
    render(<AppPage siteId="s1" />);
    expect(
      await screen.findByText("2 × Paneer tikka, 1 × Naan · ₹480"),
    ).toBeTruthy();
    expect(screen.getByText("Unpaid ₹480")).toBeTruthy();
    // Only new orders show first; a full reference finds a delivered one.
    expect(screen.queryByText("Chen")).toBeNull();
    const search = screen.getByRole("searchbox", { name: "Search orders" });
    fireEvent.change(search, { target: { value: "ORD-1002" } });
    expect(screen.getByText("Chen")).toBeTruthy();
    fireEvent.change(search, { target: { value: "naan" } });
    expect(screen.getByText("Asha")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    // The unpaid filter.
    fireEvent.click(screen.getByRole("button", { name: /Unpaid 1/ }));
    expect(screen.getByText("Asha")).toBeTruthy();
    expect(screen.queryByText("Ben")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Asha" }));
    const drawer = await screen.findByRole("dialog", { name: "Asha" });
    const order = within(drawer).getByRole("region", { name: "Dishes" });
    const rows = within(order).getAllByRole("row");
    expect(rows[1].textContent).toBe("Paneer tikka2₹220₹440");
    expect(rows.at(-1)!.textContent).toBe("Subtotal₹480");
    expect(
      within(drawer).getByRole("region", { name: "Payment" }).textContent,
    ).toContain("Reference ORD-1004");

    const csv = recordRows(food, orders, records.orders, linkTitler({}));
    expect(csv[0]).toEqual(
      expect.arrayContaining(["Dishes", "Dishes total", "Payment"]),
    );
    expect(csv[1]).toEqual(
      expect.arrayContaining([
        "ORD-1004",
        "2 × Paneer tikka, 1 × Naan",
        "480",
        "Unpaid ₹480",
      ]),
    );
  });

  it("adds an order with a quantity picker over the menu", async () => {
    go("/apps?site=s1&table=orders");
    vi.mocked(api.createRecord).mockResolvedValue({
      record: records.orders[0],
    });
    render(<AppPage siteId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add order" }));
    const add = await screen.findByRole("button", {
      name: "Add one Paneer tikka",
    });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Add one Naan" }));
    fireEvent.click(screen.getByRole("button", { name: "Add one Lassi" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove one Lassi" }));
    expect(screen.getByText("3 items · ₹480")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Meera" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add order" }).at(-1)!,
    );
    await waitFor(() =>
      expect(api.createRecord).toHaveBeenCalledWith(
        "s1",
        "orders",
        expect.objectContaining({ name: "Meera", dishes: "paneer:2,naan:1" }),
      ),
    );
  });

  it("marks a payment paid after confirming, and reloads when it changed first", async () => {
    go("/apps?site=s1&table=orders&record=o1");
    vi.mocked(api.markPaid).mockResolvedValueOnce({
      record: records.orders[0],
    });
    render(<AppPage siteId="s1" />);
    const drawer = await screen.findByRole("dialog", { name: "Asha" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Mark as paid" }),
    );
    expect(api.markPaid).not.toHaveBeenCalled();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Yes, mark paid" }),
    );
    await waitFor(() =>
      expect(api.markPaid).toHaveBeenCalledWith("s1", "o1", 1),
    );
    expect(await screen.findByText("ORD-1004 is marked paid.")).toBeTruthy();
    vi.mocked(api.markPaid).mockRejectedValueOnce(
      new cloud.ApiError(409, "This record changed. Refresh and try again."),
    );
    const again = await screen.findByRole("dialog", { name: "Asha" });
    fireEvent.click(
      within(again).getByRole("button", { name: "Mark as paid" }),
    );
    fireEvent.click(
      within(again).getByRole("button", { name: "Yes, mark paid" }),
    );
    expect(
      await screen.findByText(
        /Someone else changed this order first, so it wasn't marked paid/,
      ),
    ).toBeTruthy();
  });

  it("shows a board of steps still in progress, takes a step in one tap and remembers the view", async () => {
    go("/apps?site=s1&table=orders");
    vi.mocked(api.runAction).mockResolvedValue({ record: records.orders[0] });
    const { unmount } = render(<AppPage siteId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Board" }));
    const board = screen.getByRole("list", { name: "Orders board" });
    const columns = within(board).getAllByRole("listitem", {
      name: /, \d+$/,
    });
    expect(columns.map((c) => c.getAttribute("aria-label"))).toEqual([
      "New, 1",
      "Preparing, 1",
    ]);
    expect(columns[0].textContent).toContain("12 min ago");
    expect(columns[0].textContent).toContain("2 × Paneer tikka, 1 × Naan");
    expect(columns[0].textContent).toContain("Unpaid ₹480");
    fireEvent.click(
      within(board).getByRole("button", { name: "Start ORD-1004" }),
    );
    await waitFor(() =>
      expect(api.runAction).toHaveBeenCalledWith("s1", "o1", "start", {
        values: {},
        note: "",
        revision: 1,
      }),
    );
    expect(await screen.findByText("Start: “Asha” is done.")).toBeTruthy();
    // A step that needs a reason asks for it first.
    fireEvent.click(
      within(board).getByRole("button", { name: "Cancel ORD-1003" }),
    );
    expect(
      await screen.findByRole("dialog", { name: /Cancel ORD-1003/ }),
    ).toBeTruthy();
    unmount();
    render(<AppPage siteId="s1" />);
    expect(
      await screen.findByRole("list", { name: "Orders board" }),
    ).toBeTruthy();
  });

  it("says whether the visitor will be emailed about a step", async () => {
    go("/apps?site=s1&table=orders&record=o1");
    render(<AppPage siteId="s1" />);
    const drawer = await screen.findByRole("dialog", { name: "Asha" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Start ORD-1004/,
    });
    expect(dialog.textContent).toContain(
      "We’ll email asha@example.com that it’s now preparing.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    cleanup();
    go("/apps?site=s1&table=orders&record=o2");
    render(<AppPage siteId="s1" />);
    const ben = await screen.findByRole("dialog", { name: "Ben" });
    fireEvent.click(within(ben).getByRole("button", { name: "Deliver" }));
    expect(
      (await screen.findByRole("dialog", { name: /Deliver ORD-1003/ }))
        .textContent,
    ).toContain("No email on this record, so they won’t be told.");
  });

  it("counts places taken per upcoming slot and shows a full slot at its field", async () => {
    go("/apps?site=s1&table=bookings");
    vi.mocked(api.createRecord).mockRejectedValueOnce(
      new cloud.ApiError(409, "That time is fully booked.", "time"),
    );
    render(<AppPage siteId="s1" />);
    const places = await screen.findByRole("region", { name: "Tables" });
    const rows = within(places).getAllByRole("listitem");
    // Cancelled, past and far-off bookings don't count.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("19:00" + "6 of 20 taken · 14 left"),
      expect.stringContaining("20:00" + "20 of 20 taken · Full"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add booking" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Om" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: localDay(1) },
    });
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("Guests"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add booking" }).at(-1)!,
    );
    expect(await screen.findByText("That time is fully booked.")).toBeTruthy();
    expect(screen.getByLabelText("Time").getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("checks for new records every 30 seconds and highlights them in place", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      go("/apps?site=s1&table=orders");
      render(<AppPage siteId="s1" />);
      expect(await screen.findByText("Asha")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /New: / })).toBeNull();
      records.orders = [
        record(
          orders,
          "o4",
          { name: "Dev", dishes: 40 },
          {
            ref: "ORD-1005",
            status: "new",
            createdAt: new Date().toISOString(),
          },
        ),
        ...records.orders,
      ];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      const badge = await screen.findByRole("button", { name: /New: 1/ });
      expect(screen.getByText("Dev").closest("tr")!.className).toBe("is-new");
      expect(screen.getByText("Asha").closest("tr")!.className).toBe("");
      fireEvent.click(badge);
      expect(screen.queryByRole("button", { name: /New: / })).toBeNull();
      expect(screen.getByText("Dev").closest("tr")!.className).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
