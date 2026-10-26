// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PublicSite } from "../../src/brand/PublicSite";
import {
  Dashboard,
  NewWebsite,
  AuthPage,
} from "../../src/brand/WorkspacePages";
import {
  safeDestination,
  publicPaths,
  previewPaths,
  privatePaths,
} from "../../src/brand/navigation";
import * as cloud from "../../src/cloud/client";

vi.mock("../../src/cloud/client", async (original) => ({
  ...(await original<typeof import("../../src/cloud/client")>()),
  initializeCloud: vi.fn(),
  listSites: vi.fn(),
  createSite: vi.fn(),
  saveDraft: vi.fn(),
  signIn: vi.fn(),
}));
const account = { id: "qa-local", email: "qa@local.test" };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  history.replaceState({}, "", "/");
  vi.mocked(cloud.initializeCloud).mockResolvedValue({
    config: { enabled: true, mode: "local" },
    account,
  });
});
afterEach(cleanup);

describe("branded public pages", () => {
  it.each(publicPaths)(
    "renders %s with a single main heading and working internal links",
    (path) => {
      const { container } = render(<PublicSite path={path} />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      for (const anchor of container.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href")!;
        if (!href.startsWith("/")) continue;
        expect([...publicPaths, ...privatePaths, ...previewPaths]).toContain(
          href.split(/[?#]/)[0],
        );
      }
    },
  );
  it("filters templates by category and search with an actionable empty state", () => {
    render(<PublicSite path="/templates" />);
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(
      screen.getByRole("link", { name: "Preview Sunday Table" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Preview Botanical" }),
    ).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search templates" }),
      { target: { value: "missing" } },
    );
    expect(
      screen.queryByRole("link", { name: "Preview Sunday Table" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /See all templates/ }));
    expect(
      screen.getByRole("link", { name: "Preview Botanical" }),
    ).toBeTruthy();
  });
  it("opens mobile navigation with the correct accessible state", () => {
    render(<PublicSite path="/" />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen
        .getByRole("button", { name: "Close navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("keeps sign-in redirects inside the workspace", () => {
    expect(safeDestination("/editor?site=abc")).toBe("/editor?site=abc");
    for (const path of [
      "//evil.test",
      "/editor\\evil",
      "/editor-other",
      "https://evil.test",
    ])
      expect(safeDestination(path)).toBe("/workspace");
  });
});

describe("workspace pages", () => {
  it("shows saved projects and filters published websites", async () => {
    vi.mocked(cloud.listSites).mockResolvedValue({
      sites: [
        {
          id: "one",
          name: "Fern House",
          template: "botanical",
          status: "published",
          version: 3,
          updatedAt: new Date().toISOString(),
          publishedRelease: "live",
        },
        {
          id: "two",
          name: "Sunday",
          template: "table",
          status: "draft",
          version: 1,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    render(<Dashboard />);
    expect(
      (
        await screen.findByRole("link", { name: "Edit Fern House" })
      ).getAttribute("href"),
    ).toBe("/editor?site=one");
    fireEvent.click(
      screen.getByRole("button", { name: "Published", exact: true }),
    );
    expect(screen.queryByRole("link", { name: "Edit Sunday" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search websites" }), {
      target: { value: "absent" },
    });
    expect(screen.getByText(/No websites match/)).toBeTruthy();
  });
  it("creates the selected template, backs up the browser draft and saves it before opening", async () => {
    history.replaceState({}, "", "/new?template=table");
    localStorage.setItem("forma-studio-project-v1", '{"previous":"draft"}');
    const site = {
      id: "new-site",
      name: "Olive",
      version: 0,
      status: "draft",
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(cloud.createSite).mockResolvedValue({ site });
    vi.mocked(cloud.saveDraft).mockRejectedValue(
      new Error("Connection interrupted"),
    );
    render(<NewWebsite />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Create your website" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Olive" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create your website" }),
    );
    await screen.findByRole("alert");
    expect(cloud.createSite).toHaveBeenCalledWith("Olive");
    const saved = vi.mocked(cloud.saveDraft).mock.calls[0][1];
    expect(saved.template).toBe("table");
    expect(saved.name).toBe("Olive");
    expect(localStorage.getItem("forma-workspace-recovery")).toBe(
      '{"previous":"draft"}',
    );
    expect(
      JSON.parse(localStorage.getItem("forma-studio-project-v1")!),
    ).toEqual(saved);
    expect(
      screen.getByRole("link", { name: /Continue with your browser draft/ }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Create your website" }),
    );
    await waitFor(() => expect(cloud.saveDraft).toHaveBeenCalledTimes(2));
    expect(cloud.createSite).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cloud.saveDraft).mock.calls[1][1]).toEqual(saved);
  });
  it("shows sign-in errors without discarding the email", async () => {
    vi.mocked(cloud.initializeCloud).mockResolvedValue({
      config: { enabled: true, mode: "local" },
    });
    vi.mocked(cloud.signIn).mockRejectedValue(
      new Error("Incorrect email or password."),
    );
    render(<AuthPage />);
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Email address" }),
      { target: { value: "qa@local.test" } },
    );
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "local-test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Log in", exact: true }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Incorrect email",
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Email address",
        }) as HTMLInputElement
      ).value,
    ).toBe("qa@local.test");
  });
});
