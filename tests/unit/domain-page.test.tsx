// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DomainsPage } from "../../src/brand/DomainsPage";
import * as cloud from "../../src/cloud/client";
import { useSession } from "../../src/brand/useSession";

vi.mock("../../src/brand/useSession");
vi.mock("../../src/cloud/client", async (original) => ({
  ...(await original<typeof import("../../src/cloud/client")>()),
  siteStatus: vi.fn(),
  listDomains: vi.fn(),
  releases: vi.fn(),
  addDomain: vi.fn(),
  domainAction: vi.fn(),
  saveLocalDns: vi.fn(),
  publish: vi.fn(),
}));
let site: cloud.Site;
let domain: cloud.DomainConnection;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    loading: false,
    error: "",
    config: { enabled: true, mode: "local" },
    account: { id: "owner", email: "owner@local.test" },
  });
  site = {
    id: "site",
    name: "Fern House",
    status: "draft",
    version: 3,
    updatedAt: "2026-10-10T10:00:00Z",
  };
  domain = {
    id: "domain",
    hostname: "fern.example.com",
    local: true,
    status: "ownership",
    records: [
      {
        type: "TXT",
        purpose: "ownership",
        name: "_forma.fern.example.com",
        value: "forma-verification=token",
      },
    ],
  };
  vi.mocked(cloud.siteStatus).mockImplementation(async () => ({ site }));
  vi.mocked(cloud.listDomains).mockImplementation(async () => ({
    domains: [domain],
  }));
  vi.mocked(cloud.releases).mockResolvedValue({ releases: [] });
});
afterEach(cleanup);

describe("domain workspace", () => {
  it("shows the required records, applies local DNS explicitly, and advances the connection", async () => {
    vi.mocked(cloud.saveLocalDns).mockImplementation(async () => ({ domain }));
    vi.mocked(cloud.domainAction).mockImplementation(async () => {
      domain = {
        ...domain,
        status: "certificate",
        message: "Add the certificate CNAME.",
      };
      return { domain };
    });
    render(<DomainsPage siteId="site" />);
    expect(await screen.findByText("_forma.fern.example.com")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Log in", exact: true }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /Create website/ }).getAttribute("href"),
    ).toBe("/new");
    expect(cloud.domainAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Local DNS simulator"));
    fireEvent.click(
      screen.getByRole("button", { name: "Apply displayed records locally" }),
    );
    await screen.findByText(/Records saved in the local DNS simulator/);
    expect(cloud.saveLocalDns).toHaveBeenCalledWith(
      "site",
      "domain",
      domain.records,
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Check connection" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    await screen.findByText("Set up HTTPS");
    expect(cloud.domainAction).toHaveBeenCalledWith("site", "domain", "check");
  });
  it("preserves the entered hostname on an API failure and supports a retry", async () => {
    vi.mocked(cloud.addDomain)
      .mockRejectedValueOnce(new Error("This website already has two domains."))
      .mockResolvedValue({ domain });
    render(<DomainsPage siteId="site" />);
    const input = await screen.findByRole("textbox", { name: "Domain name" });
    fireEvent.change(input, { target: { value: "www.fern.com" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Add domain", exact: true }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "two domains",
    );
    expect((input as HTMLInputElement).value).toBe("www.fern.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Add domain", exact: true }),
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    expect(cloud.addDomain).toHaveBeenLastCalledWith("site", "www.fern.com");
  });
  it("requires confirmation before disconnecting and publishes the saved draft version", async () => {
    domain = {
      ...domain,
      status: "connected",
      url: "https://fern.example.com/",
    };
    vi.mocked(cloud.domainAction).mockImplementation(async () => {
      domain = { ...domain, status: "disconnected" };
      return { domain };
    });
    vi.mocked(cloud.publish).mockImplementation(async () => {
      site = {
        ...site,
        status: "published",
        publishedRelease: "release",
        url: domain.url,
      };
      return { site };
    });
    render(<DomainsPage siteId="site" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Disconnect", exact: true }),
    );
    expect(cloud.domainAction).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect domain", exact: true }),
    );
    await screen.findByRole("button", { name: "Reconnect domain" });
    expect(cloud.domainAction).toHaveBeenCalledWith(
      "site",
      "domain",
      "disconnect",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish website", exact: true }),
    );
    await screen.findByRole("link", { name: /Visit published website/ });
    expect(vi.mocked(cloud.publish).mock.calls[0][0].version).toBe(3);
    expect(vi.mocked(cloud.publish).mock.calls[0][1]).toBe("publish");
  });
  it("keeps domain tools private and sends sign-in back to the selected website", () => {
    vi.mocked(useSession).mockReturnValue({
      loading: false,
      error: "",
      config: { enabled: true, mode: "aws" },
    });
    render(<DomainsPage siteId="site" />);
    const link = screen
      .getAllByRole("link", { name: /Log in/ })
      .find((item) => item.getAttribute("href")?.includes("next="));
    expect(link?.getAttribute("href")).toBe(
      "/login?next=%2Fdomains%3Fsite%3Dsite",
    );
    expect(cloud.listDomains).not.toHaveBeenCalled();
  });
});
