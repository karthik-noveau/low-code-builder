// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CloudWorkspace } from "../../src/cloud/CloudWorkspace";
import * as cloud from "../../src/cloud/client";
import { useStudio } from "../../src/studio/store";
import { createProject } from "../../src/studio/templates";

vi.mock("../../src/cloud/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/cloud/client")>()),
  initializeCloud: vi.fn(),
  listSites: vi.fn(),
  createSite: vi.fn(),
  saveDraft: vi.fn(),
  releases: vi.fn(),
  publish: vi.fn(),
  loadDraft: vi.fn(),
  siteStatus: vi.fn(),
}));
const site: cloud.Site = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Botanical",
  status: "draft",
  version: 1,
  updatedAt: new Date().toISOString(),
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const project = createProject();
  useStudio.setState({ project, activePage: project.pages[0].id });
  vi.mocked(cloud.initializeCloud).mockResolvedValue({
    config: { enabled: true, mode: "local" },
    account: { id: "local-owner", email: "owner@local.test" },
  });
  vi.mocked(cloud.listSites).mockResolvedValue({ sites: [] });
  vi.mocked(cloud.createSite).mockResolvedValue({
    site: { ...site, version: 0 },
  });
  vi.mocked(cloud.saveDraft).mockResolvedValue({ site });
  vi.mocked(cloud.releases).mockResolvedValue({ releases: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function workspace() {
  render(<CloudWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
  await screen.findByText("owner@local.test");
}
describe("connected editor workflow", () => {
  it("opens a dashboard deep link without saving the previous browser draft over it", async () => {
    const previous = useStudio.getState().project;
    const project = { ...createProject("table"), name: "Sunday Table" };
    vi.mocked(cloud.loadDraft).mockResolvedValue({ project, version: 1 });
    vi.mocked(cloud.siteStatus).mockResolvedValue({ site });
    render(<CloudWorkspace initialSiteId={site.id} />);
    await waitFor(() =>
      expect(useStudio.getState().project.name).toBe("Sunday Table"),
    );
    expect(
      JSON.parse(localStorage.getItem("forma-workspace-recovery")!),
    ).toEqual(previous);
    expect(cloud.saveDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    expect(
      await screen.findByRole("button", { name: "Save now" }),
    ).toBeTruthy();
  });
  it("saves a site and publishes the saved version without duplicate saves", async () => {
    await workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save as a new site" }),
    );
    await screen.findByText(/Saved to local workspace/);
    expect(cloud.saveDraft).toHaveBeenCalledTimes(1);
    vi.mocked(cloud.publish).mockResolvedValue({
      site: {
        ...site,
        status: "published",
        publishedRelease: "release-1",
        url: "http://127.0.0.1:8788/sites/test/",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    await screen.findByRole("link", { name: /Visit published website/ });
    expect(cloud.publish).toHaveBeenCalledWith(site, "publish", undefined);
    expect(cloud.saveDraft).toHaveBeenCalledTimes(1);
  });
  it("keeps the draft after a conflict and never publishes stale changes", async () => {
    await workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save as a new site" }),
    );
    await screen.findByText(/Saved to local workspace/);
    act(() =>
      useStudio
        .getState()
        .commit((project) => ({ ...project, name: "My unsynced change" })),
    );
    vi.mocked(cloud.saveDraft).mockRejectedValue(
      new cloud.ApiError(409, "This draft changed in another session."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    await screen.findByRole("alert");
    expect(useStudio.getState().project.name).toBe("My unsynced change");
    expect(cloud.publish).not.toHaveBeenCalled();
  });
  it("keeps a recovery copy before replacing a browser draft", async () => {
    vi.mocked(cloud.listSites).mockResolvedValue({ sites: [site] });
    const previous = useStudio.getState().project;
    const project = { ...createProject(), name: "Opened from DynamoDB" };
    vi.mocked(cloud.loadDraft).mockResolvedValue({ project, version: 1 });
    vi.mocked(cloud.siteStatus).mockResolvedValue({ site });
    await workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep backup & open" }));
    await waitFor(() =>
      expect(useStudio.getState().project.name).toBe("Opened from DynamoDB"),
    );
    expect(
      JSON.parse(localStorage.getItem("forma-workspace-recovery")!),
    ).toEqual(previous);
  });
  it("debounces autosaving instead of writing for each keystroke", async () => {
    await workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save as a new site" }),
    );
    await screen.findByText(/Saved to local workspace/);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save now" }),
      ).not.toHaveProperty("disabled", true),
    );
    vi.useFakeTimers();
    act(() =>
      useStudio
        .getState()
        .commit((project) => ({ ...project, name: "First keystroke" })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() =>
      useStudio
        .getState()
        .commit((project) => ({ ...project, name: "Final edit" })),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });
    expect(cloud.saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(cloud.saveDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(cloud.saveDraft).mock.calls[1][1].name).toBe("Final edit");
  });
});
