// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import * as cloud from "../../src/cloud/client";
import { GlobalSearch, Notifications } from "../../src/brand/ShellTools";

vi.mock("../../src/cloud/client", async (original) => ({
  ...(await original<typeof import("../../src/cloud/client")>()),
  listSites: vi.fn(),
  request: vi.fn(),
  notificationsSeen: vi.fn(),
  markNotificationsSeen: vi.fn(),
}));
const site = (id: string, name: string, extra = {}): cloud.Site => ({
  id,
  name,
  version: 1,
  status: "draft",
  updatedAt: "2026-10-10T10:00:00Z",
  ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(cloud.notificationsSeen).mockResolvedValue({ seenAt: "" });
  vi.mocked(cloud.markNotificationsSeen).mockResolvedValue({ seenAt: "" });
  vi.mocked(cloud.listSites).mockResolvedValue({
    sites: [
      site("s1", "Fern House"),
      site("s2", "Bakery", { error: "Build failed" }),
    ],
  });
});
afterEach(cleanup);

describe("top bar search", () => {
  it("opens with ⌘K, finds websites and page items, and runs the chosen one", async () => {
    const run = vi.fn();
    render(
      <GlobalSearch
        extra={[{ id: "p", label: "Clay mug", group: "Products", run }]}
      />,
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "fern domains" } });
    expect(
      await screen.findByRole("option", {
        name: /Fern House · Domains & publishing/,
      }),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "mug" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps Tab inside the open search", async () => {
    render(<GlobalSearch />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
  });
});

describe("notifications", () => {
  it("lists new requests, payments and publish problems, and clears the unread count once opened", async () => {
    vi.mocked(cloud.request).mockImplementation(async (path: string) => {
      if (path === "/sites/s1/inbox")
        return {
          requests: [
            {
              id: "r1",
              kind: "order",
              collection: "c",
              collectionName: "Products",
              item: "mug",
              itemTitle: "Clay mug",
              name: "Ada Brooks",
              email: "ada@example.com",
              fields: {},
              status: "new",
              createdAt: "2026-10-12T10:00:00Z",
              payment: {
                amount: 1800,
                currency: "$",
                reference: "ABC",
                status: "paid",
                paidAt: "2026-10-12T10:05:00Z",
              },
            },
          ],
        } as never;
      // Viewers can't read an inbox: the bell still works.
      throw new Error("Forbidden");
    });
    render(<Notifications account="owner@local.test" />);
    const bell = await screen.findByRole("button", {
      name: "Notifications, 3 new",
    });
    fireEvent.click(bell);
    expect(
      await screen.findByText("Payment received from Ada Brooks"),
    ).toBeTruthy();
    expect(screen.getByText("New order from Ada Brooks")).toBeTruthy();
    expect(screen.getByText("Publishing needs attention")).toBeTruthy();
    expect(
      screen
        .getByText("New order from Ada Brooks")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("/editor?site=s1&open=inbox");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeTruthy(),
    );
    // Reading is saved to the account, so other browsers agree.
    expect(cloud.markNotificationsSeen).toHaveBeenCalled();
  });
  it("uses the account's read mark from another browser", async () => {
    vi.mocked(cloud.notificationsSeen).mockResolvedValue({
      seenAt: "2030-01-01T00:00:00Z",
    });
    vi.mocked(cloud.request).mockRejectedValue(new Error("Forbidden"));
    render(<Notifications account="owner@local.test" />);
    await waitFor(() => expect(cloud.notificationsSeen).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeTruthy(),
    );
  });
});
