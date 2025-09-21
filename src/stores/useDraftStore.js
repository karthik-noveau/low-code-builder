import { create } from "zustand";
import { persist } from "zustand/middleware";

const initialState = {
  pages: [
    {
      id: "page-1",
      name: "Home",
      slug: "/",
      children: ["comp-1", "comp-2"],
    },
  ],
  components: [
    {
      id: "comp-1",
      type: "TEXT",
      content: "Welcome to your new site!",
      styles: {
        padding: "10px",
        fontSize: "24px",
        textAlign: "center",
      },
    },
    {
      id: "comp-2",
      type: "TEXT",
      content: "Start building by dragging and dropping components.",
      styles: {
        padding: "10px",
        fontSize: "16px",
        textAlign: "center",
      },
    },
  ],
  siteConfig: {
    title: "My Awesome Site",
    description: "A site built with the low-code builder.",
    slug: "/",
    metaTags: [],
    theme: {},
    typography: {},
    header: null,
    footer: null,
  },
  assets: [],
  selectedComponentId: null,
  activePageId: "page-1", // New: Active page ID
  devicePreview: "desktop", // New: Device preview mode ('desktop', 'tablet', 'mobile')
};

const useDraftStore = create(
  persist(
    (set, get) => ({
      ...initialState,
      history: {
        past: [],
        present: { ...initialState }, // Initialize present with initialState directly
        future: [],
      },

      // Action to set the entire draft state
      setDraft: (draft) => set(draft),

      // Action to clear the draft state
      clearDraft: () =>
        set({
          ...initialState,
          history: { past: [], present: { ...initialState }, future: [] },
        }),

      // New action to set selected component ID
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),

      // New action to set active page ID
      setActivePageId: (id) => set({ activePageId: id }), // New action

      // Helper to wrap actions for undo/redo
      _saveState: (newState) => {
        const { history } = get();
        // currentPresent will now always be a valid state
        const newPast = [...history.past, history.present];
        set({
          history: {
            past: newPast,
            present: newState,
            future: [],
          },
        });
      },

      // New action to update component content
      updateComponentContent: (id, newContent) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map((comp) =>
          comp.id === id ? { ...comp, content: newContent } : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
        set(newState);
      },

      // New action to reorder components within a page
      reorderComponents: (pageId, sourceIndex, destinationIndex) => {
        const currentState = get().history.present;
        const newPages = currentState.pages.map((page) => {
          if (page.id === pageId) {
            const newChildren = Array.from(page.children);
            const [removed] = newChildren.splice(sourceIndex, 1);
            newChildren.splice(destinationIndex, 0, removed);
            return { ...page, children: newChildren };
          }
          return page;
        });
        const newState = { ...currentState, pages: newPages };
        get()._saveState(newState);
        set(newState);
      },

      // New action to update component styles
      updateComponentStyles: (id, styleKey, styleValue) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map((comp) =>
          comp.id === id
            ? { ...comp, styles: { ...comp.styles, [styleKey]: styleValue } }
            : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
        set(newState);
      },

      // New action to add a new page
      addPage: (name) => {
        const currentState = get().history.present;
        const newPageId = `page-${currentState.pages.length + 1}`;
        const newPage = {
          id: newPageId,
          name: name || `New Page ${currentState.pages.length + 1}`,
          slug: `/${newPageId}`,
          children: [],
        };
        const newPages = [...currentState.pages, newPage];
        const newState = {
          ...currentState,
          pages: newPages,
          selectedComponentId: null,
          activePageId: newPageId,
        }; // Set new page as active
        get()._saveState(newState);
        set(newState);
      },

      // New action to add a component to a page
      addComponent: (pageId, componentType, positionIndex) => {
        const currentState = get().history.present;
        const newComponentId = `comp-${currentState.components.length + 1}`;
        let newComponent = {};

        switch (componentType) {
          case "TEXT":
            newComponent = {
              id: newComponentId,
              type: "TEXT",
              content: "New Text Block",
              styles: { padding: "10px", fontSize: "16px", textAlign: "left" },
            };
            break;
          case "LINK": // New case for LINK
            newComponent = {
              id: newComponentId,
              type: "LINK",
              content: "New Link",
              href: "#",
              styles: { color: "#007bff", textDecoration: "underline" },
            };
            break;
          case "BUTTON": // Existing case for BUTTON
            newComponent = {
              id: newComponentId,
              type: "BUTTON",
              content: "Click Me",
              styles: {
                padding: "10px 20px",
                backgroundColor: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
              },
            };
            break;
          default:
            console.warn("Unknown component type:", componentType);
            return;
        }

        const newComponents = [...currentState.components, newComponent];
        const newPages = currentState.pages.map((page) => {
          if (page.id === pageId) {
            const newChildren = Array.from(page.children);
            newChildren.splice(positionIndex, 0, newComponentId);
            return { ...page, children: newChildren };
          }
          return page;
        });

        const newState = {
          ...currentState,
          components: newComponents,
          pages: newPages,
          selectedComponentId: newComponentId,
        };
        get()._saveState(newState);
        set(newState);
      },

      // Undo action
      undo: () => {
        const { history } = get();
        const { past, present, future } = history;
        if (past.length > 0) {
          const previous = past[past.length - 1];
          const newPast = past.slice(0, past.length - 1);
          set({
            ...previous, // Apply previous state
            history: {
              past: newPast,
              present: previous,
              future: [present, ...future],
            },
          });
        }
      },

      // Redo action
      redo: () => {
        const { history } = get();
        const { past, present, future } = history;
        if (future.length > 0) {
          const next = future[0];
          const newFuture = future.slice(1);
          set({
            ...next, // Apply next state
            history: {
              past: [...past, present],
              present: next,
              future: newFuture,
            },
          });
        }
      },
    }),
    {
      name: "low-code-builder-draft",
      partialize: (state) => {
        const { history, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => {
        let stateFromStorage;
        return {
          getItem: (name) => {
            const item = localStorage.getItem(name);
            if (item) {
              stateFromStorage = JSON.parse(item);
            }
            return item;
          },
          onStoreHydrated: () => {
            // This is called after the store has been hydrated.
            // The store's state (including pages, components, etc.) is already updated by persist.
            // We just need to ensure history.present reflects this hydrated state.
            useDraftStore.setState((s) => ({
              history: {
                past: [],
                present: { ...s, history: undefined }, // Set present to the rehydrated state
                future: [],
              },
            }));
          },
        };
      },
    }
  )
);

export default useDraftStore;
