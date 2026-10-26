import { create } from "zustand";
import {
  blueprints,
  createCollection,
  type Blueprint,
  type Collection,
} from "./collections";
import { createProject, createSection } from "./templates";
import {
  uid,
  slugify,
  findSection,
  mapSections,
  validateProject,
  createBlock,
  copyBlocks,
  findBlock,
  findBlockParent,
  mapBlockLists,
  mapSectionLinks,
  MAX_COLUMNS,
  type Block,
  type BlockType,
  type Project,
  type Section,
  type SectionType,
  type Page,
  type TemplateId,
} from "./model";
import { validateApp, type App } from "../apps/model";
import { collectionUsedBy } from "../apps/edit";

export const STORAGE_KEY = "forma-studio-project-v1";
/** Where a save that failed validation is kept instead of being overwritten. */
export const UNREADABLE_KEY = `${STORAGE_KEY}-unreadable`;
export const MAX_COLLECTIONS = 50;
/** Typing into one field within this window is one undo step. */
const COALESCE_MS = 1000;
let lastCommit = { key: "", at: 0 };
let initial: Project;
let loadError = "";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  let parsed: unknown = null;
  try {
    parsed = saved ? JSON.parse(saved) : null;
  } catch {
    parsed = null;
  }
  if (saved && !validateProject(parsed)) {
    // Keep the unreadable save: the next edit would otherwise overwrite it.
    if (!localStorage.getItem(UNREADABLE_KEY))
      localStorage.setItem(UNREADABLE_KEY, saved);
    loadError =
      "Your saved project couldn’t be opened, so a copy was kept in this browser. Download it from Help, or import a project backup.";
  }
  initial = validateProject(parsed) ? parsed : createProject();
} catch {
  initial = createProject();
  loadError =
    "Browser storage is unavailable. Export your project to keep a backup.";
}

interface StudioState {
  project: Project;
  past: Project[];
  future: Project[];
  activePage: string;
  selected: string | null;
  /** A block inside the selected section, when one is being edited. */
  selectedBlock: string | null;
  saveError: string;
  savedAt: number;
  /**
   * Set while a workspace site is open: its account save state ("Saving…",
   * "Saved to workspace", "Edits kept in browser") and whether it is live.
   */
  cloud?: { sync: string; live: boolean; failed: boolean };
  /**
   * Applies an edit. Edits that would make the project invalid are refused, so
   * a bad value can never be saved over a good project. Consecutive edits with
   * the same `coalesce` key (e.g. typing in one field) share one undo step.
   */
  commit: (update: (p: Project) => Project, coalesce?: string) => void;
  select: (id: string | null, block?: string | null) => void;
  updateBlock: (section: string, id: string, values: Partial<Block>) => void;
  /** Adds a block after `after`, or at the end of `parent` (a column) or the section. */
  addBlock: (
    section: string,
    type: BlockType,
    place?: { parent?: string; after?: string },
  ) => string | undefined;
  removeBlock: (section: string, id: string) => void;
  duplicateBlock: (section: string, id: string) => void;
  moveBlock: (section: string, id: string, offset: number) => void;
  /** Adds a collection (from a blueprint, or an imported one) and returns its id. */
  addCollection: (source: Blueprint | Collection) => string;
  updateCollection: (id: string, update: (c: Collection) => Collection) => void;
  /**
   * Deletes a collection. Refused (false) while the app's item fields choose
   * from it; `collectionUsedBy` says why.
   */
  removeCollection: (id: string) => boolean;
  /**
   * Changes the business app (creating an empty one is up to the caller).
   * Refused, returning false, if the result isn't a valid app. Sections that
   * showed a form this change deletes are removed with it.
   */
  updateApp: (update: (app: App) => App, coalesce?: string) => boolean;
  /**
   * Sets up the app from a template. With `page`, also adds a page of that
   * name holding one App form section per form; returns that page's id.
   */
  installApp: (
    app: App,
    page?: string,
    /** Collections the app's item fields choose from, added with it. */
    collections?: Collection[],
  ) => string | undefined;
  /** Deletes the app and every App form section. */
  removeApp: () => void;
  /** Adds an App form section showing `form` at the end of a page (default: the current one). */
  addAppSection: (form: string, page?: string) => string | undefined;
  goToPage: (id: string) => void;
  updateSection: (id: string, values: Partial<Section>) => void;
  addSection: (type: SectionType, after?: string) => string;
  removeSection: (id: string) => void;
  duplicateSection: (id: string) => void;
  moveSection: (id: string, offset: number) => void;
  reorderSection: (id: string, target: string) => void;
  addPage: (name: string) => void;
  duplicatePage: (id: string) => string | undefined;
  movePage: (id: string, offset: number) => void;
  saveSection: (id: string) => string | undefined;
  insertSavedSection: (id: string, after?: string) => string | undefined;
  removeSavedSection: (id: string) => void;
  updatePage: (id: string, values: Partial<Page>) => void;
  removePage: (id: string) => void;
  applyTemplate: (id: TemplateId) => void;
  importProject: (p: Project) => void;
  undo: () => void;
  redo: () => void;
}
let storageError = "";
let pendingSave: ReturnType<typeof setTimeout> | undefined;
function persist(project: Project) {
  clearTimeout(pendingSave);
  pendingSave = undefined;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    storageError = "";
  } catch {
    storageError =
      "Couldn’t save in this browser. Export a project backup before closing.";
  }
  return storageError;
}
/** Writes the latest project now if a save is waiting (typing defers saves briefly). */
export function flushSave() {
  if (pendingSave) {
    const saveError = persist(useStudio.getState().project);
    if (saveError !== useStudio.getState().saveError)
      useStudio.setState({ saveError });
  }
}
/**
 * Serialising a large project on every keystroke makes typing lag, so the
 * rest of a typing burst is saved once it pauses.
 */
function persistSoon() {
  clearTimeout(pendingSave);
  pendingSave = setTimeout(flushSave, SAVE_DELAY_MS);
}
const SAVE_DELAY_MS = 400;
if (typeof window !== "undefined")
  window.addEventListener("pagehide", flushSave);
/** Points every link to `from` at `to`, including links inside saved sections. */
function relink(project: Project, from: string, to: string): Project {
  const fix = (s: Section) =>
    mapSectionLinks(s, (url) => (url === from ? to : url));
  const next = mapSections(project, (sections) => sections.map(fix));
  if (next.savedSections) next.savedSections = next.savedSections.map(fix);
  return next;
}
function copySection(section: Section): Section {
  const copy: Section = {
    ...structuredClone(section),
    id: uid(),
    items: section.items.map((item) => ({ ...item, id: uid() })),
  };
  if (section.blocks) copy.blocks = copyBlocks(section.blocks);
  return copy;
}
/** An App form section; its heading and intro come from the form itself. */
function appSection(form: string | undefined, title: string, padding = 64) {
  return createSection("app", {
    ...(form ? { name: title } : {}),
    title,
    eyebrow: "",
    body: "",
    padding,
    ...(form ? { appForm: form } : {}),
  });
}
/** The blueprint that fits a template, for a first Collection list section. */
const templateBlueprint: Record<TemplateId, Blueprint> = {
  botanical: "products",
  table: "menu",
  studio: "services",
  folio: "posts",
  volt: "products",
  dhanlaxmi: "products",
  glow: "services",
  fixright: "services",
  brightminds: "custom",
  pulse: "services",
  freshbasket: "products",
  blank: "products",
};
function updateBlocks(
  project: Project,
  section: string,
  fn: (blocks: Block[]) => Block[],
) {
  return mapSections(project, (sections) =>
    sections.map((s) =>
      s.id === section ? { ...s, blocks: fn(s.blocks ?? []) } : s,
    ),
  );
}
function validSelection(
  project: Project,
  active: string,
  selected: string | null,
  selectedBlock: string | null = null,
) {
  const pg = project.pages.find((p) => p.id === active) ?? project.pages[0];
  const sections = [...project.header, ...pg.sections, ...project.footer];
  const section = sections.find((s) => s.id === selected);
  return {
    activePage: pg.id,
    selected: section ? section.id : null,
    selectedBlock:
      section && findBlock(section.blocks, selectedBlock)
        ? selectedBlock
        : null,
  };
}
export const useStudio = create<StudioState>((set, get) => ({
  project: initial,
  past: [],
  future: [],
  activePage: initial.pages[0].id,
  selected: null,
  selectedBlock: null,
  saveError: loadError,
  savedAt: Date.now(),
  commit: (update, coalesce) => {
    const state = get();
    const project = update(state.project);
    if (project === state.project) return;
    if (!validateProject(project)) {
      set({
        saveError:
          "That change wasn’t applied because it doesn’t fit (a value may be too long or there are too many items).",
      });
      return;
    }
    const now = Date.now();
    const merge =
      !!coalesce &&
      lastCommit.key === coalesce &&
      now - lastCommit.at < COALESCE_MS &&
      state.past.length > 0;
    let saveError = storageError;
    if (merge) persistSoon();
    else saveError = persist(project);
    lastCommit = { key: coalesce ?? "", at: now };
    set({
      project,
      past: merge ? state.past : [...state.past.slice(-49), state.project],
      future: [],
      saveError,
      savedAt: Date.now(),
      ...validSelection(
        project,
        state.activePage,
        state.selected,
        state.selectedBlock,
      ),
    });
  },
  select: (selected, selectedBlock = null) => set({ selected, selectedBlock }),
  goToPage: (activePage) => {
    if (get().project.pages.some((p) => p.id === activePage))
      set({ activePage, selected: null, selectedBlock: null });
  },
  updateBlock: (section, id, values) =>
    get().commit(
      (p) =>
        updateBlocks(p, section, (blocks) =>
          mapBlockLists(blocks, (list) =>
            list.map((b) => (b.id === id ? { ...b, ...values } : b)),
          ),
        ),
      `block:${id}:${Object.keys(values).sort().join()}`,
    ),
  addBlock: (section, type, place = {}) => {
    const s = findSection(get().project, section);
    if (!s) return;
    const blocks = s.blocks ?? [];
    const anchor = place.after
      ? findBlockParent(blocks, place.after)
      : undefined;
    const parentId = anchor
      ? (anchor.parent?.id ?? null)
      : (place.parent ?? null);
    const parent = parentId ? findBlock(blocks, parentId) : undefined;
    if (parentId && !parent) return;
    // Columns hold only columns; columns can't be nested; sections can't hold a bare column.
    if (parent?.type === "columns" && type !== "column") return;
    if (type === "column" && parent?.type !== "columns") return;
    if (type === "columns" && parent) return;
    if (parent?.type === "columns" && parent.children.length >= MAX_COLUMNS)
      return;
    const block = createBlock(type);
    get().commit((p) =>
      updateBlocks(p, section, (list) => {
        const insert = (siblings: Block[]) => {
          const next = [...siblings];
          const index = place.after
            ? next.findIndex((b) => b.id === place.after)
            : -1;
          next.splice(index < 0 ? next.length : index + 1, 0, block);
          return next;
        };
        if (!parentId) return insert(list);
        return mapBlockLists(list, (siblings) =>
          siblings.map((b) =>
            b.id === parentId ? { ...b, children: insert(b.children) } : b,
          ),
        );
      }),
    );
    set({ selected: section, selectedBlock: block.id });
    return block.id;
  },
  removeBlock: (section, id) => {
    const s = findSection(get().project, section);
    const found = s && findBlockParent(s.blocks ?? [], id);
    if (!found) return;
    // Removing the last column removes the whole columns block.
    const target =
      found.parent?.type === "columns" && found.list.length === 1
        ? found.parent.id
        : id;
    get().commit((p) =>
      updateBlocks(p, section, (blocks) =>
        mapBlockLists(blocks, (list) => list.filter((b) => b.id !== target)),
      ),
    );
    set({ selectedBlock: null });
  },
  duplicateBlock: (section, id) => {
    const s = findSection(get().project, section);
    const found = s && findBlockParent(s.blocks ?? [], id);
    const source = found?.list.find((b) => b.id === id);
    if (!found || !source) return;
    if (found.parent?.type === "columns" && found.list.length >= MAX_COLUMNS)
      return;
    const [copy] = copyBlocks([source]);
    get().commit((p) =>
      updateBlocks(p, section, (blocks) =>
        mapBlockLists(blocks, (list) =>
          list.flatMap((b) => (b.id === id ? [b, copy] : [b])),
        ),
      ),
    );
    set({ selectedBlock: copy.id });
  },
  addCollection: (source) => {
    if ((get().project.collections ?? []).length >= MAX_COLLECTIONS) return "";
    const taken = (get().project.collections ?? []).map((c) => c.slug);
    const collection =
      typeof source === "string" ? createCollection(source, taken) : source;
    get().commit((p) => ({
      ...p,
      collections: [...(p.collections ?? []), collection],
    }));
    return collection.id;
  },
  updateCollection: (id, update) =>
    get().commit(
      (p) => ({
        ...p,
        collections: (p.collections ?? []).map((c) =>
          c.id === id ? update(c) : c,
        ),
      }),
      `collection:${id}`,
    ),
  removeCollection: (id) => {
    if (collectionUsedBy(get().project.app, id).length) return false;
    get().commit((p) => ({
      ...p,
      collections: (p.collections ?? []).filter((c) => c.id !== id),
    }));
    return !(get().project.collections ?? []).some((c) => c.id === id);
  },
  updateApp: (update, coalesce) => {
    const current = get().project;
    if (!current.app) return false;
    const app = update(current.app);
    if (app === current.app) return true;
    const collections = (current.collections ?? []).map((c) => c.id);
    if (!validateApp(app, collections)) {
      set({
        saveError:
          "That app change wasn’t applied because it would leave the app unable to work.",
      });
      return false;
    }
    const kept = new Set(app.forms.map((f) => f.id));
    const gone = new Set(
      current.app.forms.filter((f) => !kept.has(f.id)).map((f) => f.id),
    );
    get().commit(
      (p) => {
        const next = { ...p, app };
        return gone.size
          ? mapSections(next, (sections) =>
              sections.filter(
                (s) => !(s.type === "app" && s.appForm && gone.has(s.appForm)),
              ),
            )
          : next;
      },
      coalesce && `app:${coalesce}`,
    );
    return get().project.app === app;
  },
  installApp: (app, pageName, collections = []) => {
    const project = get().project;
    const had = new Set((project.collections ?? []).map((c) => c.id));
    const added = collections.filter((c) => !had.has(c.id));
    if (!validateApp(app, [...had, ...added.map((c) => c.id)])) return;
    let page: Page | undefined;
    if (pageName && app.forms.length) {
      const stem = slugify(pageName);
      let slug = stem;
      let n = 2;
      while (project.pages.some((pg) => pg.slug === slug))
        slug = `${stem}-${n++}`;
      page = {
        id: uid(),
        name: pageName,
        slug,
        title: `${pageName} — ${project.name}`,
        description: app.forms[0].intro.slice(0, 160),
        sections: app.forms.map((form) =>
          appSection(form.id, form.title, form.kind === "lookup" ? 48 : 64),
        ),
      };
    }
    get().commit((p) => ({
      ...p,
      app,
      ...(added.length
        ? { collections: [...(p.collections ?? []), ...added] }
        : {}),
      ...(page ? { pages: [...p.pages, page] } : {}),
    }));
    if (page && get().project.pages.some((pg) => pg.id === page.id)) {
      set({ activePage: page.id, selected: null, selectedBlock: null });
      return page.id;
    }
  },
  removeApp: () =>
    get().commit((p) => {
      const next = mapSections(p, (sections) =>
        sections.filter((s) => s.type !== "app"),
      );
      delete next.app;
      if (next.savedSections)
        next.savedSections = next.savedSections.filter((s) => s.type !== "app");
      return next;
    }),
  addAppSection: (formId, pageId) => {
    const p = get().project;
    const form = p.app?.forms.find((f) => f.id === formId);
    const target = pageId ?? get().activePage;
    if (!form || !p.pages.some((pg) => pg.id === target)) return;
    const section = appSection(form.id, form.title);
    get().commit((p) => ({
      ...p,
      pages: p.pages.map((pg) =>
        pg.id === target ? { ...pg, sections: [...pg.sections, section] } : pg,
      ),
    }));
    set({ activePage: target, selected: section.id, selectedBlock: null });
    return section.id;
  },
  moveBlock: (section, id, offset) =>
    get().commit((p) =>
      updateBlocks(p, section, (blocks) =>
        mapBlockLists(blocks, (list) => {
          const from = list.findIndex((b) => b.id === id);
          const to = from + offset;
          if (from < 0 || to < 0 || to >= list.length) return list;
          const next = [...list];
          const [b] = next.splice(from, 1);
          next.splice(to, 0, b);
          return next;
        }),
      ),
    ),
  updateSection: (id, values) =>
    get().commit(
      (p) =>
        mapSections(p, (sections) =>
          sections.map((s) => (s.id === id ? { ...s, ...values } : s)),
        ),
      `section:${id}:${Object.keys(values).sort().join()}`,
    ),
  addSection: (type, after) => {
    const section = createSection(type);
    // Library defaults link to the Botanical pages; point them at a page this site has.
    const pages = get().project.pages;
    const internal = /^\/[a-z0-9-]+$/;
    const onSite = (url: string) =>
      !internal.test(url) || pages.some((p) => `/${p.slug}` === url);
    const fallback = `/${pages[0].slug}`;
    if (section.buttonUrl && !onSite(section.buttonUrl))
      section.buttonUrl = fallback;
    for (const i of section.items)
      if (i.url && !onSite(i.url)) i.url = fallback;
    let created: Collection | undefined;
    if (type === "app") {
      const form = get().project.app?.forms[0];
      Object.assign(section, appSection(form?.id, form?.title ?? "App form"), {
        id: section.id,
      });
    }
    if (type === "collection") {
      const p = get().project;
      const existing = p.collections?.[0];
      const collection =
        existing ?? (created = createCollection(templateBlueprint[p.template]));
      section.listing = {
        collection: collection.id,
        style: "grid",
        columns: 3,
        limit: 0,
      };
      section.title = collection.name;
      section.eyebrow = blueprints[collection.blueprint].label.toUpperCase();
      section.body = "";
    }
    const active = get().activePage;
    get().commit((current) => {
      const p = created
        ? { ...current, collections: [...(current.collections ?? []), created] }
        : current;
      if (type === "announcement" || type === "header")
        return { ...p, header: [...p.header, section] };
      if (type === "footer") return { ...p, footer: [...p.footer, section] };
      return {
        ...p,
        pages: p.pages.map((pg) => {
          if (pg.id !== active) return pg;
          const sections = [...pg.sections];
          const index = after ? sections.findIndex((s) => s.id === after) : -1;
          sections.splice(
            after === "start" ? 0 : index < 0 ? sections.length : index + 1,
            0,
            section,
          );
          return { ...pg, sections };
        }),
      };
    });
    set({ selected: section.id });
    return section.id;
  },
  removeSection: (id) =>
    get().commit((p) =>
      mapSections(p, (sections) => sections.filter((s) => s.id !== id)),
    ),
  duplicateSection: (id) => {
    const source = findSection(get().project, id);
    if (!source) return;
    const copy = {
      ...copySection(source),
      name: `${source.name} copy`,
    };
    get().commit((p) =>
      mapSections(p, (sections) =>
        sections.flatMap((s) => (s.id === id ? [s, copy] : [s])),
      ),
    );
    set({ selected: copy.id });
  },
  moveSection: (id, offset) =>
    get().commit((p) =>
      mapSections(p, (sections) => {
        const index = sections.findIndex((s) => s.id === id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= sections.length)
          return sections;
        const next = [...sections];
        const [s] = next.splice(index, 1);
        next.splice(target, 0, s);
        return next;
      }),
    ),
  reorderSection: (id, target) =>
    get().commit((p) =>
      mapSections(p, (sections) => {
        const from = sections.findIndex((s) => s.id === id);
        const to = sections.findIndex((s) => s.id === target);
        if (from < 0 || to < 0 || from === to) return sections;
        const next = [...sections];
        const [s] = next.splice(from, 1);
        next.splice(to, 0, s);
        return next;
      }),
    ),
  addPage: (name) => {
    const p = get().project;
    const stem = slugify(name);
    let slug = stem;
    let n = 2;
    while (slug === "index" || p.pages.some((pg) => pg.slug === slug))
      slug = `${stem}-${n++}`;
    const pg: Page = {
      id: uid(),
      name: name.trim() || "Untitled page",
      slug,
      title: `${name} — ${p.name}`,
      description: "",
      sections: [],
    };
    get().commit((p) => ({ ...p, pages: [...p.pages, pg] }));
    set({ activePage: pg.id, selected: null });
  },
  duplicatePage: (id) => {
    const project = get().project;
    const source = project.pages.find((page) => page.id === id);
    if (!source) return;
    const stem = `${source.slug || slugify(source.name)}-copy`;
    let slug = stem;
    let n = 2;
    while (project.pages.some((page) => page.slug === slug))
      slug = `${stem}-${n++}`;
    const copy: Page = {
      ...source,
      id: uid(),
      name: `${source.name} copy`,
      slug,
      sections: source.sections.map(copySection),
    };
    get().commit((p) => ({
      ...p,
      pages: p.pages.flatMap((page) =>
        page.id === id ? [page, copy] : [page],
      ),
    }));
    set({ activePage: copy.id, selected: null });
    return copy.id;
  },
  movePage: (id, offset) =>
    get().commit((p) => {
      const from = p.pages.findIndex((page) => page.id === id);
      const to = from + offset;
      if (from <= 0 || to <= 0 || to >= p.pages.length) return p;
      const pages = [...p.pages];
      const [page] = pages.splice(from, 1);
      pages.splice(to, 0, page);
      return { ...p, pages };
    }),
  saveSection: (id) => {
    const source = findSection(get().project, id);
    if (!source) return;
    const copy = copySection(source);
    get().commit((p) => ({
      ...p,
      savedSections: [...(p.savedSections ?? []), copy],
    }));
    return copy.id;
  },
  insertSavedSection: (id, after) => {
    const source = get().project.savedSections?.find((s) => s.id === id);
    if (!source) return;
    const copy = copySection(source);
    const active = get().activePage;
    get().commit((p) => {
      if (copy.type === "header" || copy.type === "announcement")
        return { ...p, header: [...p.header, copy] };
      if (copy.type === "footer") return { ...p, footer: [...p.footer, copy] };
      return {
        ...p,
        pages: p.pages.map((page) => {
          if (page.id !== active) return page;
          const sections = [...page.sections];
          const index = after ? sections.findIndex((s) => s.id === after) : -1;
          sections.splice(
            after === "start" ? 0 : index < 0 ? sections.length : index + 1,
            0,
            copy,
          );
          return { ...page, sections };
        }),
      };
    });
    set({ selected: copy.id });
    return copy.id;
  },
  removeSavedSection: (id) =>
    get().commit((p) => ({
      ...p,
      savedSections: (p.savedSections ?? []).filter((s) => s.id !== id),
    })),
  updatePage: (id, values) =>
    get().commit(
      (p) => {
        const old = p.pages.find((pg) => pg.id === id);
        if (!old) return p;
        const slug =
          id === p.pages[0].id
            ? ""
            : values.slug === undefined
              ? old.slug
              : slugify(values.slug);
        if (
          slug === "index" ||
          p.pages.some((pg) => pg.id !== id && pg.slug === slug)
        )
          return p;
        const updated = {
          ...p,
          pages: p.pages.map((pg) =>
            pg.id === id ? { ...pg, ...values, slug } : pg,
          ),
        };
        return slug === old.slug
          ? updated
          : relink(updated, `/${old.slug}`, `/${slug}`);
      },
      `page:${id}:${Object.keys(values).sort().join()}`,
    ),
  removePage: (id) =>
    get().commit((p) => {
      const page = p.pages.find((pg) => pg.id === id);
      if (!page || p.pages.length < 2 || p.pages[0].id === id) return p;
      return relink(
        { ...p, pages: p.pages.filter((pg) => pg.id !== id) },
        `/${page.slug}`,
        "/",
      );
    }),
  applyTemplate: (id) => {
    // A template replaces the layout, not the business: keep data, uploads and saved sections.
    const current = get().project;
    const p = createProject(id);
    // A business template brings its collections and app; an existing app wins,
    // and the template's form sections for an app that isn't there are dropped.
    if (current.collections?.length) {
      const slugs = new Set(current.collections.map((c) => c.slug));
      p.collections = [
        ...current.collections,
        ...(p.collections ?? []).filter((c) => !slugs.has(c.slug)),
      ];
    }
    if (current.savedSections?.length) p.savedSections = current.savedSections;
    if (current.app) p.app = current.app;
    const kept = new Set((p.collections ?? []).map((c) => c.id));
    if (
      p.app?.tables.some((t) =>
        t.fields.some((f) => f.collection && !kept.has(f.collection)),
      )
    )
      delete p.app;
    const forms = new Set((p.app?.forms ?? []).map((f) => f.id));
    const keep = (s: Section) =>
      !(s.type === "app" && !forms.has(s.appForm ?? "")) &&
      !(s.type === "collection" && !kept.has(s.listing?.collection ?? ""));
    p.pages = p.pages.map((pg) => ({
      ...pg,
      sections: pg.sections.filter(keep),
    }));
    p.assets = [
      ...current.assets,
      ...p.assets.filter((a) => !current.assets.some((x) => x.url === a.url)),
    ];
    get().importProject(p);
  },
  importProject: (project) => {
    get().commit(() => project);
    set({
      activePage: project.pages[0].id,
      selected: null,
      selectedBlock: null,
    });
  },
  undo: () => {
    const s = get();
    const project = s.past.at(-1);
    if (!project) return;
    set({
      project,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future],
      saveError: persist(project),
      savedAt: Date.now(),
      ...validSelection(project, s.activePage, s.selected, s.selectedBlock),
    });
  },
  redo: () => {
    const s = get();
    const project = s.future[0];
    if (!project) return;
    set({
      project,
      past: [...s.past, s.project],
      future: s.future.slice(1),
      saveError: persist(project),
      savedAt: Date.now(),
      ...validSelection(project, s.activePage, s.selected, s.selectedBlock),
    });
  },
}));
