// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { OwnerApp } from "./OwnerApp";
import * as api from "../apps/api";
import * as cloud from "../cloud/client";
import { useSession } from "../brand/useSession";
import { APP_TEMPLATES } from "../apps/templates";
import type { App, AppRecord, AppTable } from "../apps/model";
import type { RecordList } from "../apps/api-types";
import type { Project } from "../studio/model";
import { clearOwnerCache } from "./useOwnerData";
import {
  formatMoneyCompact,
  formatRelativeTime,
  greetingFor,
  firstNameOf,
  presetAmountFor,
  readRewardPresets,
} from "./format";
import { chartBars, ownerModel } from "./roles";
import { resolveRoute, readRaw } from "./route";

vi.mock("../brand/useSession");
vi.mock("../apps/api");
vi.mock("../cloud/client", async (original) => ({
  ...(await original<typeof import("../cloud/client")>()),
  loadDraft: vi.fn(),
  siteStatus: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  listSites: vi.fn(),
}));

const ACCOUNT = { id: "owner", email: "selvam.balaji@dhanlaxmi.in" };
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
  source: "visitor",
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
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
const signedIn = (account: typeof ACCOUNT | null = ACCOUNT) =>
  vi.mocked(useSession).mockReturnValue({
    loading: false,
    error: "",
    config: { enabled: true, mode: "local" },
    account: account ?? undefined,
  });
const go = (url: string) => history.replaceState(null, "", url);
const mount = () => render(<OwnerApp siteId="s1" />);

beforeEach(() => {
  vi.clearAllMocks();
  clearOwnerCache();
  localStorage.clear();
  signedIn();
  app = APP_TEMPLATES.find((t) => t.id === "rewards")!.build(
    "Dhanlaxmi Electricals",
  );
  [customers, purchases] = app.tables;
  const customer = field(purchases, "Customer");
  const amount = field(purchases, "Purchase amount");
  const what = field(purchases, "What did you buy?");
  const reward = field(purchases, "Reward");
  const [totalReward, totalSpent, waiting] = customers.totals.map((t) => t.id);
  records = {
    [customers.id]: [
      record(
        customers,
        "c1",
        {
          [customers.titleField]: "Ravi Kumar",
          [field(customers, "Phone")]: "9840012210",
        },
        { totals: { [totalReward]: 300, [totalSpent]: 6000, [waiting]: 1 } },
      ),
      record(customers, "c2", {
        [customers.titleField]: "Meena Lakshmi",
        [field(customers, "Phone")]: "9962118840",
      }),
    ],
    [purchases.id]: [
      record(
        purchases,
        "p1",
        {
          [customer]: "c1",
          [amount]: 18400,
          [what]: "6 sqmm Finolex wire 90m",
        },
        { ref: "ESR-1052", status: "pending" },
      ),
      record(
        purchases,
        "p2",
        { [customer]: "c2", [amount]: 4250, [what]: "Ceiling fan" },
        {
          ref: "ESR-1051",
          status: "pending",
          createdAt: new Date(Date.now() - 48 * 60_000).toISOString(),
        },
      ),
      record(
        purchases,
        "p3",
        { [customer]: "c1", [amount]: 6000, [what]: "Wiring", [reward]: 300 },
        {
          ref: "ESR-1040",
          status: "approved",
          history: [
            {
              action: "approve",
              status: "approved",
              by: "Owner",
              at: new Date().toISOString(),
            },
          ],
        },
      ),
      record(
        purchases,
        "p4",
        { [customer]: "c2", [amount]: 900, [what]: "Bulbs" },
        { ref: "ESR-1039", status: "rejected", note: "No bill" },
      ),
    ],
  };
  vi.mocked(api.loadAppInfo).mockResolvedValue({ app, published: true });
  vi.mocked(api.listRecords).mockImplementation(async (_s, t) => list(t));
  vi.mocked(api.listDevices).mockResolvedValue({ devices: [] });
  vi.mocked(api.runAction).mockImplementation(async (_s, id) => ({
    record: records[purchases.id].find((r) => r.id === id)!,
  }));
  vi.mocked(cloud.loadDraft).mockResolvedValue({
    project: {
      name: "Dhanlaxmi Electricals",
      theme: { accent: "#e07400", logo: "bolt" },
    } as unknown as Project,
    version: 1,
  });
  vi.mocked(cloud.siteStatus).mockResolvedValue({
    site: {
      id: "s1",
      name: "Dhanlaxmi Electricals",
      version: 1,
      status: "published",
      updatedAt: "2026-10-10T10:00:00Z",
    },
  });
  go("/owner?site=s1");
});
afterEach(cleanup);

describe("sign in", () => {
  it("shows the branded sign-in when signed out, and signs in with Forma", async () => {
    signedIn(null);
    vi.mocked(cloud.signIn).mockRejectedValueOnce(
      new cloud.ApiError(401, "Invalid email or password."),
    );
    mount();
    expect(
      screen.getByRole("heading", { name: "Shop owner sign in" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your email address")).toBeTruthy();
    expect(cloud.signIn).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: ACCOUNT.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe(
      "text",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid sign-in details")).toBeTruthy();

    vi.mocked(cloud.signIn).mockResolvedValueOnce(ACCOUNT);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Selvam$/)).toBeTruthy();
    expect(cloud.signIn).toHaveBeenLastCalledWith(
      "login",
      ACCOUNT.email,
      "wrong",
    );
  });

  it("says so when the account can't manage the shop", async () => {
    vi.mocked(api.loadAppInfo).mockRejectedValue(
      new cloud.ApiError(403, "Your role does not allow this action."),
    );
    mount();
    expect(
      await screen.findByText("This account can't manage this shop"),
    ).toBeTruthy();
  });
});

describe("dashboard", () => {
  it("greets the owner, counts the queue and colours the cards", async () => {
    mount();
    const greeting = `${greetingFor(new Date())}, Selvam`;
    expect(await screen.findByRole("heading", { name: greeting })).toBeTruthy();
    expect(
      screen.getByText("2 submissions are waiting for your review."),
    ).toBeTruthy();
    const card = (name: string) =>
      screen
        .getByText(name, { selector: ".ow-statLabel" })
        .closest(".ow-stat")!;
    expect(card("Waiting for review").className).toContain("ow-stat-accent");
    expect(card("Customers").className).toContain("ow-stat-plain");
    expect(card("Approved sales").className).toContain("ow-stat-slate");
    expect(card("Rewards owed").className).toContain("ow-stat-dark");
    expect(
      within(card("Rewards owed") as HTMLElement).getByText("₹300"),
    ).toBeTruthy();
    expect(
      within(card("Waiting for review") as HTMLElement).getByText(
        "Waiting for you",
      ),
    ).toBeTruthy();
    expect(
      within(card("Customers") as HTMLElement).getByText(
        "1 rejected submission",
      ),
    ).toBeTruthy();
    expect(
      within(card("Approved sales") as HTMLElement).getByText("1 approved"),
    ).toBeTruthy();
    expect(
      within(card("Rewards owed") as HTMLElement).getByText(
        "Across all 2 customers",
      ),
    ).toBeTruthy();
    // The queue, top earners and the monthly chart.
    expect(screen.getByText("2 pending")).toBeTruthy();
    expect(screen.getByText("Reward by month")).toBeTruthy();
    expect(screen.getByText("₹300 awarded this month")).toBeTruthy();
    expect(screen.getByText("Top earners")).toBeTruthy();
    expect(document.title).toBe("Dhanlaxmi Electricals — Shop owner");
    // The sidebar: brand, nav, pending badge.
    expect(screen.getByText("DHANLAXMI")).toBeTruthy();
    expect(screen.getByText("ELECTRICALS")).toBeTruthy();
    expect(screen.getByLabelText("2 pending")).toBeTruthy();
  });

  it("approves inline: presets fill, the limit holds, the amount is read back", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve ESR-1052" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Approve submission" });
    expect(within(dialog).getByText("Ravi Kumar · 98400 12210")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "5%" }));
    const input = within(dialog).getByLabelText(
      "Reward amount",
    ) as HTMLInputElement;
    expect(input.value).toBe("920");
    expect(api.runAction).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(
        "Ravi Kumar will be awarded ₹920 for this purchase.",
      ),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: "20000" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and award" }),
    );
    expect(
      within(dialog).getByText("Reward cannot exceed the purchase amount"),
    ).toBeTruthy();
    expect(api.runAction).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and award" }),
    );
    expect(
      within(dialog).getByText("Enter the reward you are awarding"),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: "920" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and award" }),
    );
    await waitFor(() => expect(api.runAction).toHaveBeenCalledTimes(1));
    const approve = purchases.actions.find((a) => a.name === "Approve")!;
    expect(api.runAction).toHaveBeenCalledWith("s1", "p1", approve.id, {
      values: { [field(purchases, "Reward")]: 920 },
      note: "",
      revision: 1,
    });
    expect(await screen.findByText("Approved · ₹920 reward")).toBeTruthy();
  });

  it("keeps the dialog open on a 409 and says the queue was refreshed", async () => {
    vi.mocked(api.runAction).mockRejectedValueOnce(
      new cloud.ApiError(
        409,
        "This purchase is already approved. Refresh to see the latest.",
      ),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve ESR-1052" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Approve submission" });
    fireEvent.change(within(dialog).getByLabelText("Reward amount"), {
      target: { value: "500" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve and award" }),
    );
    expect(
      await within(dialog).findByText(
        "This purchase is already approved. Refresh to see the latest.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "The queue has been refreshed with what the server has.",
      ),
    ).toBeTruthy();
  });
});

describe("submissions", () => {
  it("tabs by status and rejects only with a reason", async () => {
    go("/owner?site=s1&page=submissions");
    mount();
    const tab = await screen.findByRole("tab", { name: /Pending/ });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(within(tab).getByText("2")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Approved/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Rejected/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reject ESR-1051" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Reject submission",
    });
    expect(within(dialog).getByText(/awards no reward/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reject submission" }),
    );
    expect(
      within(dialog).getByText("Give a reason so the customer can correct it"),
    ).toBeTruthy();
    expect(api.runAction).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), {
      target: { value: "No matching bill" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reject submission" }),
    );
    await waitFor(() => expect(api.runAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAction).mock.calls[0][3].note).toBe(
      "No matching bill",
    );
  });

  it("opens a record's drawer with its timeline from a deep link", async () => {
    go(`/owner?site=s1&table=${purchases.id}&record=p3`);
    mount();
    const drawer = await screen.findByRole("dialog", { name: "ESR-1040" });
    expect(within(drawer).getByText("Timeline")).toBeTruthy();
    expect(within(drawer).getByText("View customer profile")).toBeTruthy();
  });
});

describe("customers", () => {
  it("refuses a phone number that's already registered", async () => {
    go("/owner?site=s1&page=customers");
    mount();
    await screen.findByText("All customers");
    // The topbar and the page header both offer it.
    fireEvent.click(screen.getAllByRole("button", { name: "New customer" })[1]);
    const drawer = screen.getAllByRole("dialog").at(-1)!;
    fireEvent.change(within(drawer).getByLabelText("Name"), {
      target: { value: "Ravi K" },
    });
    fireEvent.change(within(drawer).getByLabelText("Phone"), {
      target: { value: "98400 12210" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Add customer" }),
    );
    expect(
      within(drawer).getByText(
        "This number is already registered to Ravi Kumar",
      ),
    ).toBeTruthy();
    expect(api.createRecord).not.toHaveBeenCalled();
  });

  it("won't delete a customer with history and offers Mark inactive", async () => {
    vi.mocked(api.updateRecord).mockResolvedValue({
      record: records[customers.id][0],
    });
    go("/owner?site=s1&page=customers");
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for Ravi Kumar" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete customer" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Ravi Kumar?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete customer" }),
    );
    expect(
      within(dialog).getByText("This customer has submissions"),
    ).toBeTruthy();
    expect(api.deleteRecord).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Mark inactive" }),
    );
    await waitFor(() =>
      expect(api.updateRecord).toHaveBeenCalledWith(
        "s1",
        "c1",
        { [customers.pausedField!]: true },
        1,
      ),
    );
  });

  it("shows the server's refusal when it knows of history we don't", async () => {
    records[purchases.id] = records[purchases.id].filter(
      (r) => r.values[field(purchases, "Customer")] !== "c2",
    );
    vi.mocked(api.deleteRecord).mockRejectedValue(
      new cloud.ApiError(
        409,
        "This customer has a linked record, so it can't be deleted — their history would be lost. Mark them inactive instead.",
      ),
    );
    go("/owner?site=s1&page=customers");
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for Meena Lakshmi" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete customer" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Meena Lakshmi?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete customer" }),
    );
    expect(
      await within(dialog).findByText(/Mark them inactive instead/),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Mark inactive" }),
    ).toBeTruthy();
  });

  it("shows a profile with the total reward", async () => {
    go("/owner?site=s1&page=customer&record=c1");
    mount();
    expect(
      await screen.findByRole("heading", { name: "Ravi Kumar" }),
    ).toBeTruthy();
    const card = screen
      .getByText("Reward earned")
      .closest(".ow-stat") as HTMLElement;
    expect(within(card).getByText("₹300")).toBeTruthy();
    expect(screen.getByText("Submission history")).toBeTruthy();
    expect(screen.getByText("+₹300")).toBeTruthy();
  });
});

describe("settings", () => {
  it("saves reward presets for the site and the approve dialog uses them", async () => {
    go("/owner?site=s1&page=settings");
    mount();
    const preset = await screen.findByLabelText("Preset 1");
    fireEvent.change(preset, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save presets" }));
    expect(screen.getByText("1–100, up to two decimals.")).toBeTruthy();
    fireEvent.change(preset, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save presets" }));
    expect(readRewardPresets("s1")).toEqual({
      mode: "percent",
      values: ["4", "3", "5", "7"],
    });
    expect(await screen.findByText("Presets saved")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fixed amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Save presets" }));
    expect(readRewardPresets("s1")).toEqual({
      mode: "amount",
      values: ["100", "250", "500", "1000"],
    });
  });

  it("remembers the theme", async () => {
    go("/owner?site=s1&page=settings");
    const { container } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Dark" }));
    expect(container.querySelector(".ow")!.getAttribute("data-theme")).toBe(
      "dark",
    );
    expect(localStorage.getItem("forma-owner-theme")).toBe("dark");
  });
});

describe("helpers", () => {
  it("formats like the reference", () => {
    expect(formatMoneyCompact(862300, "INR")).toBe("₹8.6L");
    expect(formatMoneyCompact(47440, "INR")).toBe("₹47,440");
    const now = new Date("2026-10-26T12:00:00Z");
    expect(formatRelativeTime("2026-10-26T11:48:00Z", now)).toBe(
      "12 minutes ago",
    );
    expect(formatRelativeTime("2026-10-26T10:00:00Z", now)).toBe("2 hours ago");
    expect(formatRelativeTime("2026-10-25T10:00:00Z", now)).toBe("yesterday");
    expect(firstNameOf("selvam.balaji@shop.in")).toBe("Selvam");
    expect(presetAmountFor("5", "percent", 18400)).toBe(920);
    expect(presetAmountFor("250", "amount", 18400)).toBe(250);
  });

  it("charts six months by when records were approved", () => {
    const model = ownerModel(app);
    const reward = field(purchases, "Reward");
    const bars = chartBars(
      {
        id: "c",
        name: "Reward by month",
        table: purchases.id,
        op: "sum",
        field: reward,
        statuses: ["approved"],
        months: 6,
      },
      records[purchases.id],
    );
    expect(bars).toHaveLength(6);
    expect(bars[5].value).toBe(300);
    expect(model.primaryWorkflow?.table.id).toBe(purchases.id);
    expect(model.primaryPeople?.table.id).toBe(customers.id);
  });

  it("reads push notification links (table + record)", () => {
    const model = ownerModel(app);
    expect(
      resolveRoute(readRaw(`?site=s1&table=${purchases.id}&record=p1`), model),
    ).toEqual({ page: "table", table: purchases.id, record: "p1" });
    expect(resolveRoute(readRaw("?site=s1&page=customers"), model)).toEqual({
      page: "table",
      table: customers.id,
    });
    expect(
      resolveRoute(readRaw("?site=s1&section=notifications"), model),
    ).toEqual({
      page: "settings",
    });
  });
});
