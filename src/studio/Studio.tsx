import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Icon } from "./Icon";
import { IconButton, Modal, Field, type NotifyAction } from "./ui";
import { Website } from "./Website";
import { Inspector, type MediaTarget } from "./Inspector";
import { DataManager } from "./DataManager";
import { Inbox } from "./Inbox";
import { AppBuilder } from "../apps/AppBuilder";
import type { AppTarget } from "../apps/issues";
import { Sidebar, type Panel } from "./Sidebar";
import { flushSave, UNREADABLE_KEY, useStudio } from "./store";
import { templateOptions } from "./templates";
import {
  sectionMeta,
  findSection,
  safeImage,
  slugify,
  uid,
  validateProject,
  type SectionType,
  type TemplateId,
  type Asset,
} from "./model";
import "./studio.css";
import "./canvas-first.css";
import { Navigator } from "./Navigator";
import { CommandMenu, type StudioCommand } from "./CommandMenu";
import { reviewProject } from "./review";
import { ReviewScores } from "./ReviewScores";
import { Brand } from "../brand/Brand";
import "../brand/brand.css";
import "./product-ui.css";
import "./experience.css";
import "./blocks.css";
import "./chrome.css";
import "./data.css";
import "./editor-admin.css";
import { ThemeSwitch } from "../design/ThemeSwitch";
import { CloudWorkspace } from "../cloud/CloudWorkspace";
import type { TextEditTarget, TextField } from "./InlineText";

const unreadableSave = () => {
  try {
    return localStorage.getItem(UNREADABLE_KEY);
  } catch {
    return null;
  }
};
type Dialog =
  | "library"
  | "templates"
  | "page"
  | "export"
  | "help"
  | "assets"
  | "commands"
  | "review"
  | "data"
  | "inbox"
  | "app"
  | null;
const starterAssets: Asset[] = [
  { id: "botanical", name: "Fern & foliage", url: "/images/botanical.jpg" },
  { id: "plant-1", name: "The everyday succulent", url: "/images/plant-1.jpg" },
  { id: "plant-2", name: "Desert greens", url: "/images/plant-2.jpg" },
  { id: "plant-3", name: "Rubber plant", url: "/images/plant-3.jpg" },
  { id: "interior", name: "Room to breathe", url: "/images/interior.jpg" },
  {
    id: "architecture",
    name: "New perspectives",
    url: "/images/architecture.jpg",
  },
  { id: "restaurant", name: "At the table", url: "/images/restaurant.jpg" },
  { id: "garden", name: "In the garden", url: "/images/garden.jpg" },
];
async function readImage(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  if (file.size > 3 * 1024 * 1024)
    throw new Error(`${file.name} is too large. Choose an image under 3 MB.`);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("That image format could not be loaded."));
    image.src = data;
  });
  if (file.type === "image/gif") return data;
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return data;
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.88);
}
export function Studio({ initialSiteId }: { initialSiteId?: string } = {}) {
  const store = useStudio();
  const { project } = store;
  const page = project.pages.find((p) => p.id === store.activePage)!;
  const [panel, setPanel] = useState<Panel>("sections");
  // Notifications link to /editor?site=…&open=inbox; the app page to …&open=app.
  const [dialog, setDialog] = useState<Dialog>(() => {
    const open = new URLSearchParams(location.search).get("open");
    return open === "inbox" || open === "app" ? open : null;
  });
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  );
  const [zoom, setZoom] = useState(100);
  const [dataCollection, setDataCollection] = useState<string | undefined>();
  const [dataTab, setDataTab] = useState<"items" | "settings">("items");
  const [appTarget, setAppTarget] = useState<AppTarget | undefined>();
  /** Bumped to ask the workspace button to start publishing. */
  const [publishSignal, setPublishSignal] = useState(0);
  const [itemView, setItemView] = useState<{
    collection: string;
    item: string;
  } | null>(null);
  const viewedCollection = project.collections?.find(
    (c) => c.id === itemView?.collection,
  );
  const viewedItem = viewedCollection?.items.find(
    (i) => i.id === itemView?.item && !i.hidden,
  );
  const [preview, setPreview] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSession, setInspectorSession] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<TextField | null>(null);
  const [editingText, setEditingText] = useState<TextEditTarget | null>(null);
  const [draftText, setDraftText] = useState("");
  const [navigatorOpen, setNavigatorOpen] = useState(
    () => window.innerWidth > 760,
  );
  const [insertAfter, setInsertAfter] = useState<string | undefined>();
  const reviewItems = reviewProject(project);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All sections");
  const [template, setTemplate] = useState<TemplateId>(project.template);
  const [pageName, setPageName] = useState("");
  const [mediaTarget, setMediaTarget] = useState<MediaTarget | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    action?: NotifyAction;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasScroll = useRef<HTMLDivElement>(null);
  const notify = useCallback((text: string, action?: NotifyAction) => {
    setToast({ text, action });
    if (timer.current) clearTimeout(timer.current);
    // A notification with a button (e.g. Undo) stays a little longer to reach it.
    timer.current = setTimeout(() => setToast(null), action ? 8000 : 4000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Leaving the editor: a late typing save must not overwrite what the next page stores.
      flushSave();
    },
    [],
  );
  /** Opens what a review item points at and focuses the field that fixes it. */
  const openIssue = (pageId: string, section?: string, label?: string) => {
    navigate(pageId);
    store.select(section ?? null);
    setInspectorSession((n) => n + 1);
    setInspectorOpen(true);
    setDialog(null);
    if (section) focusSection(section);
    if (!label) return;
    requestAnimationFrame(() => {
      const field = Array.from(
        document.querySelectorAll<HTMLLabelElement>(".inspector label"),
      ).find((node) => node.textContent === label);
      const input = field?.htmlFor
        ? document.getElementById(field.htmlFor)
        : null;
      input?.focus();
      input?.scrollIntoView({ block: "nearest" });
    });
  };
  const openLibrary = (after?: string) => {
    setInsertAfter(after);
    setSearch("");
    setCategory("All sections");
    setDialog("library");
  };
  const selectCanvasSection = (
    id: string,
    field?: TextField,
    block?: string,
  ) => {
    store.select(id, block ?? null);
    setSelectedField(field ?? null);
    setPanel("sections");
    setPreview(false);
    setInspectorOpen(true);
    if (window.innerWidth <= 760) setNavigatorOpen(false);
  };
  const focusSection = (id: string) => {
    selectCanvasSection(id);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-section-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };
  const startTextEdit = (target: TextEditTarget) => {
    store.select(target.section);
    setSelectedField(target.field);
    setHovered(null);
    setPanel("sections");
    setInspectorOpen(window.innerWidth > 1050);
    setDraftText(
      findSection(store.project, target.section)?.[target.field] ?? "",
    );
    setEditingText(target);
    const fieldName =
      target.field === "title"
        ? "heading"
        : target.field === "body"
          ? "description"
          : target.field;
    requestAnimationFrame(() => {
      document
        .querySelector(
          `[data-section-id="${CSS.escape(target.section)}"] [data-edit-field$=" ${fieldName}"]`,
        )
        ?.scrollIntoView({ block: "nearest" });
    });
  };
  const finishCanvasText = (cancel = false) => {
    const active = document.querySelector<HTMLElement>(
      ".inline-copy.is-editing",
    );
    if (!active) return;
    if (cancel)
      active.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    else active.blur();
  };
  const navigate = (id: string, keepNavigator = false) => {
    setHovered(null);
    setSelectedField(null);
    store.goToPage(id);
    if (window.innerWidth <= 760 && !keepNavigator) setNavigatorOpen(false);
    setPanel("sections");
    setInspectorOpen(false);
    canvasScroll.current?.scrollTo({ top: 0 });
  };
  const backup = async () => {
    const { exportProject } = await import("./export");
    exportProject(project);
    notify("Project backup downloaded");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog((d) => (d === "commands" ? null : "commands"));
        return;
      }
      if (
        dialog ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStudio.getState().redo();
        else useStudio.getState().undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useStudio.getState().redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const { saveError, cloud } = useStudio.getState();
        notify(
          saveError ||
            (cloud
              ? "Changes save to your workspace automatically"
              : "All changes are saved in this browser"),
        );
      }
      if (e.key === "Escape") {
        setPreview(false);
        setInspectorOpen(false);
        setPanel("sections");
        useStudio.getState().select(null);
        setHovered(null);
        setSelectedField(null);
      }
      if (e.key === "?") setDialog("help");
    };
    const finishTextEdit = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches(".inline-copy"))
        active.blur();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", finishTextEdit);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", finishTextEdit);
    };
  }, [dialog, notify]);
  const applyImage = (url: string) => {
    if (!safeImage(url)) {
      notify("Use an HTTPS image URL or choose an image from your library.");
      return;
    }
    if (mediaTarget) {
      const s = findSection(useStudio.getState().project, mediaTarget.section);
      if (s) {
        if (mediaTarget.block)
          store.updateBlock(s.id, mediaTarget.block, { image: url });
        else if (mediaTarget.item)
          store.updateSection(s.id, {
            items: s.items.map((i) =>
              i.id === mediaTarget.item ? { ...i, image: url } : i,
            ),
          });
        else store.updateSection(s.id, { image: url });
      }
    } else {
      const id = store.addSection("imageText");
      store.updateSection(id, { image: url });
      setPanel("sections");
    }
    setDialog(null);
    setMediaTarget(null);
    notify("Image added");
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const assets: Asset[] = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: uid(),
          name: file.name,
          url: await readImage(file),
        })),
      );
      store.commit((p) => ({ ...p, assets: [...p.assets, ...assets] }));
      if (mediaTarget) applyImage(assets[0].url);
      else
        notify(
          `${assets.length} image${assets.length === 1 ? "" : "s"} added to your library`,
        );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not upload the image.",
      );
    } finally {
      setBusy(false);
    }
  };
  const importProject = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Choose a project under 20 MB.");
      const data: unknown = JSON.parse(await file.text());
      if (!validateProject(data))
        throw new Error("This is not a valid Forma project backup.");
      store.importProject(data);
      setPanel("sections");
      notify("Project imported. Use Undo to return to your previous project.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not read this project.",
      );
    }
  };
  const downloadSite = async () => {
    setBusy(true);
    try {
      const { buildSiteArchive, downloadBlob } = await import("./export");
      const blob = await buildSiteArchive(project);
      downloadBlob(blob, `${slugify(project.name)}-website.zip`);
      notify("Your website is ready. ZIP downloaded.");
      setDialog(null);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Could not export your website. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const availableSections = (
    Object.entries(sectionMeta) as [
      SectionType,
      (typeof sectionMeta)[SectionType],
    ][]
  ).filter(
    ([, m]) =>
      (category === "All sections" || m.category === category) &&
      `${m.label} ${m.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const openUtility = (next: Panel) => {
    setPreview(false);
    setPanel(next);
    setInspectorOpen(false);
    if (window.innerWidth <= 760) setNavigatorOpen(false);
  };
  const openPageSettings = () => {
    setSelectedField(null);
    if (window.innerWidth <= 760) setNavigatorOpen(false);
    store.select(null);
    setPanel("sections");
    setInspectorOpen(true);
  };
  const openData = (
    collection?: string,
    tab: "items" | "settings" = "items",
  ) => {
    setDataCollection(collection);
    setDataTab(tab);
    setDialog("data");
  };
  const openApp = (target?: AppTarget) => {
    setAppTarget(target);
    setDialog("app");
  };
  // The owner's app page (records, approvals) exists for workspace sites only.
  const cloudSite = store.cloud
    ? new URLSearchParams(location.search).get("site")
    : null;
  const recordsUrl = cloudSite
    ? `/apps?site=${encodeURIComponent(cloudSite)}`
    : undefined;
  const startPublish = () => {
    setDialog(null);
    setPublishSignal((n) => n + 1);
  };
  const openSavedSections = () => {
    setInsertAfter(undefined);
    setSearch("");
    setCategory("Saved sections");
    setDialog("library");
  };
  const commands: StudioCommand[] = [
    {
      id: "add",
      title: "Add a section",
      description: "Insert a new building block",
      icon: "plus",
      run: () => openLibrary(),
    },
    {
      id: "colors",
      title: "Change site colors & typography",
      description: "Open your design kit, fonts, styles, theme",
      icon: "palette",
      run: () => openUtility("theme"),
    },
    {
      id: "media",
      title: "Open media library",
      description: "Upload or find images and photos",
      icon: "image",
      run: () => openUtility("assets"),
    },
    {
      id: "review",
      title: "Review your website",
      description: "Find missing links, descriptions, and payment setup",
      icon: "checklist",
      run: () => setDialog("review"),
    },
    {
      id: "publish",
      title: "Publish your site",
      description: "Put your latest edits live",
      icon: "arrowUpRight",
      run: startPublish,
    },
    {
      id: "export",
      title: "Export site",
      description: "Download your website as a ZIP to host anywhere",
      icon: "export",
      run: () => setDialog("export"),
    },
    {
      id: "inbox",
      title: "Open Inbox",
      description: "Messages, bookings and orders from your published site",
      icon: "mail",
      run: () => setDialog("inbox"),
    },
    {
      id: "app",
      title: project.app ? "Open App" : "Build a business app",
      description: project.app
        ? "Tables, steps, forms and dashboard of your business app"
        : "Rewards, loyalty cards, service requests, warranties and more",
      icon: "activity",
      run: () => openApp(),
    },
    ...(project.app
      ? [
          {
            id: "app-forms",
            title: "Edit app forms",
            description: "What visitors fill in or look up on your site",
            icon: "send",
            run: () => openApp({ tab: "forms" }),
          },
        ]
      : []),
    ...(project.app && recordsUrl
      ? [
          {
            id: "app-records",
            title: "Open app records",
            description:
              "Approve, reject and add records from your published site",
            icon: "arrowUpRight",
            run: () => window.location.assign(recordsUrl),
          },
        ]
      : []),
    {
      id: "data",
      title: "Manage content (Data)",
      description: "Services, products, menus and other lists your site shows",
      icon: "layers",
      run: () => openData(),
    },
    {
      id: "page",
      title: "Create a new page",
      description: "Add a page to your website",
      icon: "pages",
      run: () => {
        setPageName("");
        setDialog("page");
      },
    },
    {
      id: "saved-sections",
      title: "Open saved sections",
      description: "Reuse your saved content and designs on any page",
      icon: "folder",
      run: openSavedSections,
    },
    {
      id: "duplicate-page",
      title: "Duplicate current page",
      description: `Make an independent copy of ${page.name} and all its sections`,
      icon: "copy",
      run: () => {
        const id = store.duplicatePage(page.id);
        if (id) navigate(id);
        notify("Page duplicated with all its sections");
      },
    },
    {
      id: "get-paid",
      title: "Get paid",
      description:
        "Add your UPI ID, a payment link or bank details for orders and bookings",
      icon: "settings",
      run: () => openUtility("settings"),
    },
    {
      id: "settings",
      title: "Project settings",
      description: "Import a backup, rename or download your project",
      icon: "settings",
      run: () => openUtility("settings"),
    },
    {
      id: "templates",
      title: "Templates",
      description: "Choose a different website template",
      icon: "grid",
      run: () => {
        setTemplate(project.template);
        setDialog("templates");
      },
    },
    {
      id: "help",
      title: "Help & keyboard shortcuts",
      description: "Learn how to edit your website",
      icon: "help",
      run: () => setDialog("help"),
    },
    ...project.pages.map((p) => ({
      id: p.id,
      title: `Open ${p.name}`,
      description: `Page /${p.slug}`,
      icon: "pages",
      run: () => navigate(p.id),
    })),
    ...[
      ...project.header,
      ...project.pages.flatMap((p) => p.sections),
      ...project.footer,
    ].map((section) => ({
      id: section.id,
      title: `Edit ${section.name}`,
      description: `${project.pages.find((p) => p.sections.some((s) => s.id === section.id))?.name ?? "Shared section"} · ${section.title.replace(/\n/g, " ")}`,
      icon: sectionMeta[section.type].icon,
      run: () => {
        const owner = project.pages.find((p) =>
          p.sections.some((s) => s.id === section.id),
        );
        if (owner && owner.id !== page.id) navigate(owner.id);
        focusSection(section.id);
      },
    })),
    ...Object.entries(sectionMeta).map(([type, meta]) => ({
      id: `add-${type}`,
      title: `Add ${meta.label.toLowerCase()}`,
      description: meta.description,
      icon: meta.icon,
      run: () => {
        const id = store.addSection(type as SectionType);
        focusSection(id);
      },
    })),
  ];
  const closeDialog = () => {
    if (!busy) {
      setDialog(null);
      setMediaTarget(null);
    }
  };
  return (
    <div
      className={`studio canvas-first ${preview ? "is-preview" : ""} ${navigatorOpen ? "" : "map-closed"}`}
    >
      <header className="studio-header">
        <div className="header-start">
          <a
            href="/workspace"
            className="forma-brand"
            aria-label="Forma website builder"
            title="Your websites"
          >
            <Brand />
          </a>
          <div className="project-breadcrumb">
            <button onClick={() => openUtility("settings")}>
              <span className="project-label">
                <strong>{project.name}</strong>
              </span>
              <Icon name="down" size={12} />
            </button>
            <span
              className="project-local-badge"
              title={
                store.cloud
                  ? store.cloud.live
                    ? "Published. Edits stay in your draft until you publish again."
                    : "Saved to your workspace. Not published yet."
                  : "This project is saved in your browser"
              }
            >
              {store.cloud?.live ? "Live" : "Draft"}
            </span>
          </div>
        </div>
        {!editingText && (
          <div className="header-center">
            {!preview && (
              <div className="history-actions">
                <IconButton
                  icon="undo"
                  label="Undo (⌘Z)"
                  disabled={!store.past.length}
                  onClick={store.undo}
                />
                <IconButton
                  icon="redo"
                  label="Redo (⌘⇧Z)"
                  disabled={!store.future.length}
                  onClick={store.redo}
                />
              </div>
            )}
            <div className="stage-page-name">
              <Icon
                name={page.id === project.pages[0].id ? "home" : "pages"}
                size={15}
              />
              <select
                aria-label="Current page"
                value={page.id}
                onChange={(e) => navigate(e.target.value)}
              >
                {project.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Icon name="down" size={12} />
            </div>
            <div className="device-controls" aria-label="Preview device">
              {(["desktop", "tablet", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  className={`icon-button device-option ${device === d ? "active" : ""}`}
                  aria-label={`${d[0].toUpperCase() + d.slice(1)} preview`}
                  aria-pressed={device === d}
                  title={`${d[0].toUpperCase() + d.slice(1)} preview`}
                  onClick={() => setDevice(d)}
                >
                  <Icon name={d} size={16} />
                </button>
              ))}
            </div>
            <div className="zoom-control">
              <select
                className="zoom-select"
                aria-label="Canvas zoom"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
              </select>
              <Icon name="down" size={12} />
            </div>
          </div>
        )}
        <div className="header-actions">
          <span
            className={`save-indicator ${store.saveError || store.cloud?.failed ? "error" : ""}`}
            role="status"
            title={
              store.saveError ||
              (store.cloud
                ? `${store.cloud.sync}. A browser copy was kept at ${new Date(store.savedAt).toLocaleTimeString()}.`
                : `Saved locally at ${new Date(store.savedAt).toLocaleTimeString()}`)
            }
          >
            <Icon
              name={store.saveError || store.cloud?.failed ? "help" : "check"}
              size={14}
            />
            <span>
              {store.saveError
                ? "Not saved"
                : store.cloud?.failed
                  ? "Not synced"
                  : store.cloud?.sync === "Saving…"
                    ? "Saving…"
                    : "Saved"}
            </span>
          </span>
          <IconButton
            icon="search"
            label="Find anything, do anything"
            onClick={() => setDialog("commands")}
          />
          <IconButton
            icon="export"
            label="Export site"
            onClick={() => setDialog("export")}
          />
          <ThemeSwitch variant="button" className="studio-theme" />
          <button
            className="preview-button"
            aria-label={preview ? "Back to editor" : "Preview"}
            onClick={() => {
              setItemView(null);
              setPreview(!preview);
            }}
          >
            <Icon name={preview ? "edit" : "eye"} size={16} />
            <span>{preview ? "Back to editor" : "Preview"}</span>
          </button>
          <CloudWorkspace
            initialSiteId={initialSiteId}
            notify={notify}
            publishSignal={publishSignal}
          />
        </div>
      </header>
      <div
        className={`studio-workspace ${!preview && (inspectorOpen || panel !== "sections") ? "has-inspector" : ""}`}
      >
        {!preview && navigatorOpen && (
          <Navigator
            onNavigate={navigate}
            hovered={editingText ? null : hovered}
            onHover={(id) => {
              if (!editingText) setHovered(id);
            }}
            onSelect={focusSection}
            onPageSettings={openPageSettings}
            onAddPage={() => {
              setPageName("");
              setDialog("page");
            }}
            onAdd={() => openLibrary()}
            onStyles={() => openUtility("theme")}
            onMedia={() => openUtility("assets")}
            onHelp={() => setDialog("help")}
            onTemplates={() => {
              setTemplate(project.template);
              setDialog("templates");
            }}
            onSaved={openSavedSections}
            onData={() => openData()}
            onInbox={() => setDialog("inbox")}
            onApp={() => openApp()}
            notify={notify}
            onReview={() => setDialog("review")}
            issueCount={reviewItems.length}
            onClose={() => setNavigatorOpen(false)}
          />
        )}
        <main className="canvas-workspace">
          {editingText ? (
            <div className="canvas-toolbar text-edit-bar">
              <div className="text-edit-status">
                <Icon name="edit" size={16} />
                <strong>
                  Editing{" "}
                  {editingText.field === "title"
                    ? "heading"
                    : editingText.field === "body"
                      ? "description"
                      : editingText.field === "buttonLabel"
                        ? "button text"
                        : "eyebrow"}
                </strong>
                <span>Esc to cancel</span>
              </div>
              <div className="text-edit-actions">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => finishCanvasText(true)}
                >
                  Cancel
                </button>
                <button
                  className="text-edit-done"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => finishCanvasText()}
                >
                  <Icon name="check" size={15} />
                  Done
                </button>
              </div>
            </div>
          ) : (
            !preview &&
            !navigatorOpen && (
              <div className="canvas-float-tools">
                <IconButton
                  icon="panel"
                  label="Show site map"
                  onClick={() => {
                    setNavigatorOpen(true);
                    if (window.innerWidth <= 760) {
                      setInspectorOpen(false);
                      setPanel("sections");
                    }
                  }}
                />
                <IconButton
                  icon="plus"
                  label="Add section"
                  onClick={() => openLibrary(store.selected ?? undefined)}
                />
              </div>
            )
          )}
          {store.saveError && (
            <div className="storage-warning">
              <Icon name="help" size={15} />
              {store.saveError}
              <button onClick={backup}>Download backup</button>
            </div>
          )}
          <div
            className="canvas-scroll"
            ref={canvasScroll}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                store.select(null);
                setInspectorOpen(false);
                setPanel("sections");
              }
            }}
          >
            <div
              className={`canvas-device device-${device}`}
              style={{ zoom: zoom / 100 }}
            >
              <Website
                project={project}
                page={page}
                ownerHref={
                  cloudSite
                    ? `/owner?site=${encodeURIComponent(cloudSite)}`
                    : undefined
                }
                selected={store.selected}
                selectedBlock={store.selectedBlock}
                onSelect={selectCanvasSection}
                hovered={hovered}
                onHover={(id) => {
                  if (!editingText) setHovered(id);
                }}
                editingText={editingText}
                onStartEdit={startTextEdit}
                onFinishEdit={() => setEditingText(null)}
                onDraft={setDraftText}
                onNavigate={(id) => {
                  setItemView(null);
                  navigate(id);
                }}
                onOpenItem={(collection, item) => {
                  setItemView({ collection, item });
                  canvasScroll.current?.scrollTo({ top: 0 });
                }}
                item={
                  preview && viewedCollection && viewedItem
                    ? { collection: viewedCollection, item: viewedItem }
                    : undefined
                }
                onAdd={() => openLibrary("start")}
                onEdit={store.updateSection}
                preview={preview}
              />
            </div>
            {!preview && page.sections.length > 0 && (
              <div className="canvas-append">
                <button
                  className="canvas-add"
                  aria-label="Add section at end"
                  onClick={() => openLibrary()}
                >
                  <Icon name="plus" size={15} />
                  Add section
                </button>
              </div>
            )}
          </div>
        </main>
        {!preview && inspectorOpen && panel === "sections" && (
          <div className="context-drawer">
            <Inspector
              key={`${store.selected ?? store.activePage}-${selectedField ?? "section"}-${inspectorSession}`}
              focusField={selectedField}
              device={device}
              onDevice={setDevice}
              draft={
                editingText?.section === store.selected
                  ? { field: editingText.field, text: draftText }
                  : undefined
              }
              onEditText={(field) =>
                store.selected &&
                startTextEdit({ section: store.selected, field })
              }
              onClose={() => setInspectorOpen(false)}
              pickMedia={(target) => {
                setMediaTarget(target);
                setImageUrl("");
                setDialog("assets");
              }}
              notify={notify}
              onManageData={(id) => {
                setDataCollection(id);
                setDialog("data");
              }}
              onOpenApp={(form) =>
                openApp(form ? { tab: "forms", id: form } : undefined)
              }
            />
          </div>
        )}
        {!preview && panel !== "sections" && (
          <div className="context-drawer utility-drawer">
            <Sidebar
              panel={panel}
              setPanel={setPanel}
              openTemplates={() => {
                setTemplate(project.template);
                setDialog("templates");
              }}
              openLibrary={() => openLibrary()}
              openPage={() => {
                setPageName("");
                setDialog("page");
              }}
              openAssets={() => {
                setMediaTarget(null);
                setDialog("assets");
              }}
              upload={upload}
              onImport={importProject}
              onBackup={backup}
              notify={notify}
              focusSection={focusSection}
              onPageSettings={openPageSettings}
            />
          </div>
        )}
      </div>
      {dialog === "commands" && (
        <CommandMenu commands={commands} onClose={() => setDialog(null)} />
      )}
      {dialog === "data" && (
        <DataManager
          initial={dataCollection}
          initialTab={dataTab}
          onClose={closeDialog}
          notify={notify}
        />
      )}
      {dialog === "inbox" && <Inbox onClose={closeDialog} />}
      {dialog === "app" && (
        <AppBuilder
          initial={appTarget}
          onClose={closeDialog}
          notify={notify}
          recordsUrl={recordsUrl}
          onShowSection={(id) => {
            setDialog(null);
            focusSection(id);
          }}
        />
      )}
      {dialog === "review" && (
        <Modal
          title="Review your website"
          subtitle="Select an item to open the page or section that needs attention."
          onClose={closeDialog}
        >
          <div className="review-summary">
            <span>
              <Icon
                name={reviewItems.length ? "checklist" : "check"}
                size={25}
              />
            </span>
            <div>
              <strong>
                {reviewItems.length
                  ? `${reviewItems.length} ${reviewItems.length === 1 ? "thing" : "things"} worth a look`
                  : "Looking good."}
              </strong>
              <p>
                Checked search titles and descriptions, headings, image sizes,
                image descriptions, links and forms.
              </p>
            </div>
          </div>
          <ReviewScores
            project={project}
            onOpen={(check) =>
              openIssue(check.page, check.section, check.field)
            }
          />
          <div className="review-items">
            {reviewItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id.startsWith("empty-")) {
                    navigate(item.page);
                    openLibrary("start");
                    return;
                  }
                  if (item.target === "payments") {
                    setDialog(null);
                    openUtility("settings");
                    requestAnimationFrame(() =>
                      document
                        .getElementById("get-paid")
                        ?.scrollIntoView({ block: "start" }),
                    );
                    return;
                  }
                  if (item.target && "app" in item.target) {
                    openApp(item.target.app);
                    return;
                  }
                  if (item.target) {
                    openData(item.target.collection, "settings");
                    return;
                  }
                  openIssue(
                    item.page,
                    item.section,
                    item.kind === "forms"
                      ? undefined
                      : item.kind === "images"
                        ? "Image description"
                        : item.kind === "links"
                          ? "Link URL"
                          : "Meta description",
                  );
                }}
              >
                <span className={`review-kind kind-${item.kind}`}>
                  <Icon
                    name={
                      item.kind === "forms"
                        ? "mail"
                        : item.kind === "images"
                          ? "image"
                          : item.kind === "links"
                            ? "arrowUpRight"
                            : "pages"
                    }
                    size={16}
                  />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Icon name="arrow" size={15} />
              </button>
            ))}
            {!reviewItems.length && (
              <p className="review-clear">
                Take a look on mobile, check your copy, and you’re ready to
                publish.
              </p>
            )}
          </div>
          <div className="modal-footer review-footer">
            <p>Forms send messages to your Inbox once published.</p>
            <button
              className="subtle-button"
              onClick={() => setDialog("export")}
            >
              Export
            </button>
            <button className="primary-button" onClick={startPublish}>
              Continue to publish
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="studio-toast" role="status">
          <span>
            <Icon name="check" size={16} />
          </span>
          {toast.text}
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <IconButton
            icon="x"
            label="Dismiss notification"
            onClick={() => setToast(null)}
          />
        </div>
      )}
      {dialog === "library" && (
        <Modal
          wide
          title="Add a section"
          subtitle={
            category === "Saved sections"
              ? "Reuse your content and design. Each insertion creates an independent copy."
              : insertAfter === "start"
                ? "Your new section will start this page."
                : insertAfter
                  ? `Your new section goes right after ${findSection(project, insertAfter)?.name ?? "the selected section"}.`
                  : "Choose a building block. We’ll add it to the end of this page."
          }
          onClose={closeDialog}
        >
          <div className="library-placement">
            <label htmlFor="section-insert-position">Add to {page.name}</label>
            <select
              id="section-insert-position"
              aria-label="Section position"
              value={insertAfter ?? "end"}
              onChange={(e) =>
                setInsertAfter(
                  e.target.value === "end" ? undefined : e.target.value,
                )
              }
            >
              <option value="end">At the end of the page</option>
              <option value="start">At the beginning of the page</option>
              {page.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  After {section.name}
                </option>
              ))}
            </select>
          </div>
          <div className="library-search">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections…"
                aria-label="Search sections"
              />
              <kbd>⌕</kbd>
            </label>
          </div>
          <div className="library-layout">
            <nav>
              {[
                "All sections",
                "Saved sections",
                "Essentials",
                "Commerce",
                "Social proof",
                "Forms",
                "Navigation",
              ].map((c) => (
                <button
                  className={category === c ? "selected" : ""}
                  key={c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                  <span>
                    {c === "Saved sections"
                      ? project.savedSections?.length || 0
                      : Object.values(sectionMeta).filter(
                          (m) => c === "All sections" || m.category === c,
                        ).length}
                  </span>
                </button>
              ))}
            </nav>
            <div className="section-library">
              {availableSections.map(([type, meta]) => (
                <button
                  className="section-tile"
                  key={type}
                  onClick={() => {
                    const id = store.addSection(type, insertAfter);
                    setDialog(null);
                    setPanel("sections");
                    focusSection(id);
                    notify(`${meta.label} added`);
                  }}
                >
                  <div className={`section-mini mini-${type}`}>
                    <SectionMini type={type} />
                    <span className="tile-plus">
                      <Icon name="plus" size={16} />
                    </span>
                  </div>
                  <h3>{meta.label}</h3>
                  <p>{meta.description}</p>
                </button>
              ))}
              {category === "Saved sections" &&
                (project.savedSections ?? [])
                  .filter((section) =>
                    `${section.name} ${section.title}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((section) => (
                    <div className="saved-section-card" key={section.id}>
                      <button
                        className="section-tile"
                        onClick={() => {
                          const id = store.insertSavedSection(
                            section.id,
                            insertAfter,
                          );
                          if (!id) return;
                          setDialog(null);
                          setPanel("sections");
                          focusSection(id);
                          notify(
                            `${section.name} added as an independent copy`,
                          );
                        }}
                      >
                        <div className={`section-mini mini-${section.type}`}>
                          {section.image ? (
                            <img
                              className="saved-section-image"
                              src={safeImage(section.image)}
                              alt=""
                            />
                          ) : (
                            <SectionMini type={section.type} />
                          )}
                          <span className="tile-plus">
                            <Icon name="plus" size={16} />
                          </span>
                        </div>
                        <h3>{section.name}</h3>
                        <p>
                          {section.title ||
                            sectionMeta[section.type].description}
                        </p>
                      </button>
                      <div className="saved-section-meta">
                        <span>{sectionMeta[section.type].label}</span>
                        <IconButton
                          icon="trash"
                          label={`Remove saved ${section.name}`}
                          onClick={() => {
                            store.removeSavedSection(section.id);
                            notify(
                              "Removed from library. Use Undo to restore it.",
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
              {category === "Saved sections" &&
                !(project.savedSections ?? []).some((section) =>
                  `${section.name} ${section.title}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && (
                  <div className="empty-results">
                    <Icon name="folder" size={30} />
                    <h3>
                      {search
                        ? "No matching saved sections"
                        : "Keep your best sections"}
                    </h3>
                    <p>
                      {search
                        ? "Try another name or clear the search."
                        : "Open a section’s actions and choose Save to library. Reuse its content and design on any page."}
                    </p>
                  </div>
                )}
              {category !== "Saved sections" && !availableSections.length && (
                <div className="empty-results">
                  <Icon name="search" size={30} />
                  <h3>No matching sections</h3>
                  <p>Try a different word or category.</p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {dialog === "templates" && (
        <Modal
          wide
          title="Templates"
          subtitle="Start with a template, then make it your own."
          onClose={closeDialog}
        >
          <div className="template-gallery">
            {templateOptions.map((t) => (
              <button
                className={`template-card ${template === t.id ? "chosen" : ""}`}
                key={t.id}
                onClick={() => setTemplate(t.id)}
              >
                <div
                  className="template-preview"
                  style={{ background: t.color }}
                >
                  {t.image ? (
                    <img src={t.image} alt={`${t.name} template`} />
                  ) : (
                    <div className="blank-template">
                      <Icon name="plus" size={30} />
                    </div>
                  )}
                  <div className="template-preview-text">
                    <span>{t.category}</span>
                    <strong>
                      {t.name}
                      {t.id !== "blank" && <span>.</span>}
                    </strong>
                  </div>
                  {template === t.id && (
                    <span className="template-check">
                      <Icon name="check" size={15} />
                    </span>
                  )}
                </div>
                <div className="template-card-copy">
                  <h3>
                    {t.name}
                    <span>{t.category}</span>
                  </h3>
                  <p>{t.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="modal-footer">
            <p>
              This replaces your current layout. You can undo it.
              <br />
              <button className="text-button" onClick={backup}>
                Download a backup first
              </button>
            </p>
            <button
              className="primary-button"
              onClick={() => {
                store.applyTemplate(template);
                setPanel("sections");
                setDialog(null);
                canvasScroll.current?.scrollTo({ top: 0 });
                notify(
                  `${templateOptions.find((t) => t.id === template)?.name} is ready to make your own`,
                );
              }}
            >
              Use this template
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "page" && (
        <Modal
          title="Create a page"
          subtitle="Give it a name. You can change the details anytime."
          onClose={closeDialog}
        >
          <form
            className="simple-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              if (pageName.trim()) {
                store.addPage(pageName);
                setPanel("sections");
                setInspectorOpen(false);
                setDialog(null);
                canvasScroll.current?.scrollTo({ top: 0 });
                notify("Page created");
              }
            }}
          >
            <Field
              label="Page name"
              value={pageName}
              onChange={setPageName}
              placeholder="e.g. Our story"
              hint={
                pageName
                  ? `Your page will live at /${slugify(pageName)}`
                  : "A name that tells visitors what to expect."
              }
            />
            <button
              className="primary-button full-width"
              disabled={!pageName.trim()}
              type="submit"
            >
              <Icon name="plus" size={16} />
              Create page
            </button>
          </form>
        </Modal>
      )}
      {dialog === "assets" && (
        <Modal
          wide
          title="Media library"
          subtitle="Choose from your library, upload something new, or add an image link."
          onClose={closeDialog}
        >
          <div className="media-modal-top">
            <label className="subtle-button upload-inline">
              <Icon name="upload" size={15} />
              {busy ? "Uploading…" : "Upload images"}
              <input
                disabled={busy}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="image-url">
              <input
                placeholder="Or paste an image URL…"
                aria-label="Image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <button
                disabled={!imageUrl || busy}
                onClick={() => applyImage(imageUrl)}
              >
                <Icon name="arrow" size={17} />
                <span className="sr-only">Use image URL</span>
              </button>
            </div>
          </div>
          <div className="media-library">
            {project.assets.length > 0 && (
              <>
                <h4>YOUR UPLOADS</h4>
                <div className="media-grid">
                  {project.assets.map((a) => (
                    <button
                      disabled={busy}
                      key={a.id}
                      onClick={() => applyImage(a.url)}
                    >
                      <img src={safeImage(a.url)} alt="" />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h4>
              THE STARTER COLLECTION <span>Photography from Unsplash</span>
            </h4>
            <div className="media-grid">
              {starterAssets.map((a) => (
                <button
                  disabled={busy}
                  key={a.id}
                  onClick={() => applyImage(a.url)}
                >
                  <img src={a.url} alt="" />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal
          title="Export your website"
          subtitle="Download your pages, styles, images, and an editable project backup."
          onClose={closeDialog}
        >
          <div className="simple-modal-body">
            <div className="export-preview">
              <div className="export-icon">
                <Icon name="globe" size={28} />
              </div>
              <div>
                <h3>{project.name}</h3>
                <p>{project.pages.length} pages · Responsive website</p>
              </div>
              <span className="small-badge">HTML / CSS</span>
            </div>
            <div className="export-includes">
              {[
                "Every page, styled and ready",
                "Uploaded images and starter photography",
                "A project backup to keep editing",
              ].map((text) => (
                <p key={text}>
                  <Icon name="check" size={15} />
                  {text}
                </p>
              ))}
            </div>
            <button
              className="primary-button full-width export-download"
              disabled={busy}
              onClick={downloadSite}
            >
              <Icon name="download" size={17} />
              {busy ? "Preparing your website…" : "Download website (.zip)"}
            </button>
            <p className="export-note">
              Upload the extracted files to your favorite static host. Forms
              need a configured endpoint; payments and orders need an external
              commerce provider.
            </p>
            <button className="text-button" onClick={backup}>
              Just download the editable project
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="Editor guide"
          subtitle="The essentials for building and editing your website."
          onClose={closeDialog}
        >
          <div className="simple-modal-body">
            {unreadableSave() && (
              <div className="help-recovery">
                <p>
                  A saved project in this browser couldn’t be opened. Download
                  it to keep it safe or send it to support.
                </p>
                <button
                  className="subtle-button"
                  onClick={async () => {
                    const { downloadBlob } = await import("./export");
                    downloadBlob(
                      new Blob([unreadableSave() ?? ""], {
                        type: "application/json",
                      }),
                      "forma-unreadable-save.json",
                    );
                  }}
                >
                  <Icon name="download" size={14} />
                  Download saved copy
                </button>
              </div>
            )}
            <div className="help-step">
              <span>01</span>
              <div>
                <h3>Start with a section</h3>
                <p>
                  Add a banner, collection, gallery, or form. Choose its
                  position in the section library, or drag the page outline to
                  rearrange it.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>02</span>
              <div>
                <h3>Make it your own</h3>
                <p>
                  Click a section to open its settings. Double-click text to
                  write on the page, then choose Done to save or Cancel to
                  discard. You can also use Edit on canvas beside a text field.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>03</span>
              <div>
                <h3>See the big picture</h3>
                <p>
                  Preview every screen size, then export a website you can host
                  anywhere. Your work saves in this browser, and to your
                  workspace when you open a saved site.
                </p>
              </div>
            </div>
            <div className="shortcuts">
              <span>
                Undo<kbd>⌘ / Ctrl Z</kbd>
              </span>
              <span>
                Redo<kbd>⌘ / Ctrl ⇧ Z</kbd>
              </span>
              <span>
                Find anything<kbd>⌘ / Ctrl K</kbd>
              </span>
              <span>
                Open help<kbd>?</kbd>
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SectionMini({ type }: { type: SectionType }) {
  if (type === "hero")
    return (
      <div className="mini-banner">
        <span />
        <i />
        <i />
        <b />
      </div>
    );
  if (type === "imageText")
    return (
      <div className="mini-split">
        <span />
        <div>
          <i />
          <i />
          <b />
        </div>
      </div>
    );
  if (["products", "gallery", "features", "testimonials"].includes(type))
    return (
      <div className="mini-grid">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            {type === "features" ? (
              <Icon name="leaf" size={17} />
            ) : type === "testimonials" ? (
              <Icon name="quote" size={17} />
            ) : (
              <span />
            )}
            <i />
            <b />
          </div>
        ))}
      </div>
    );
  if (type === "faq")
    return (
      <div className="mini-faq">
        {[1, 2, 3].map((i) => (
          <span key={i}>
            <i />
            <Icon name="plus" size={10} />
          </span>
        ))}
      </div>
    );
  if (["contact", "newsletter"].includes(type))
    return (
      <div className="mini-form">
        <i />
        <span />
        <span />
        <b />
      </div>
    );
  if (["header", "footer", "announcement"].includes(type))
    return (
      <div className="mini-nav">
        <b />
        <i />
        <i />
        <i />
      </div>
    );
  return (
    <div className="mini-text">
      <b />
      <i />
      <i />
      <span />
    </div>
  );
}
