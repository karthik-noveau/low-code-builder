// scripts/build-site.js
import React3 from "react";
import ReactDOMServer from "react-dom/server";
import fs from "fs";
import path from "path";

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState2;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState2 = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    React.useCallback(() => selector(api.getInitialState()), [api, selector])
  );
  React.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// node_modules/zustand/esm/middleware.mjs
function createJSONStorage(getStorage, options) {
  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    return;
  }
  const persistStorage = {
    getItem: (name) => {
      var _a;
      const parse = (str2) => {
        if (str2 === null) {
          return null;
        }
        return JSON.parse(str2, options == null ? void 0 : options.reviver);
      };
      const str = (_a = storage.getItem(name)) != null ? _a : null;
      if (str instanceof Promise) {
        return str.then(parse);
      }
      return parse(str);
    },
    setItem: (name, newValue) => storage.setItem(name, JSON.stringify(newValue, options == null ? void 0 : options.replacer)),
    removeItem: (name) => storage.removeItem(name)
  };
  return persistStorage;
}
var toThenable = (fn) => (input) => {
  try {
    const result = fn(input);
    if (result instanceof Promise) {
      return result;
    }
    return {
      then(onFulfilled) {
        return toThenable(onFulfilled)(result);
      },
      catch(_onRejected) {
        return this;
      }
    };
  } catch (e) {
    return {
      then(_onFulfilled) {
        return this;
      },
      catch(onRejected) {
        return toThenable(onRejected)(e);
      }
    };
  }
};
var persistImpl = (config, baseOptions) => (set, get, api) => {
  let options = {
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => state,
    version: 0,
    merge: (persistedState, currentState) => ({
      ...currentState,
      ...persistedState
    }),
    ...baseOptions
  };
  let hasHydrated = false;
  const hydrationListeners = /* @__PURE__ */ new Set();
  const finishHydrationListeners = /* @__PURE__ */ new Set();
  let storage = options.storage;
  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        );
        set(...args);
      },
      get,
      api
    );
  }
  const setItem = () => {
    const state = options.partialize({ ...get() });
    return storage.setItem(options.name, {
      state,
      version: options.version
    });
  };
  const savedSetState = api.setState;
  api.setState = (state, replace) => {
    savedSetState(state, replace);
    return setItem();
  };
  const configResult = config(
    (...args) => {
      set(...args);
      return setItem();
    },
    get,
    api
  );
  api.getInitialState = () => configResult;
  let stateFromStorage;
  const hydrate = () => {
    var _a, _b;
    if (!storage) return;
    hasHydrated = false;
    hydrationListeners.forEach((cb) => {
      var _a2;
      return cb((_a2 = get()) != null ? _a2 : configResult);
    });
    const postRehydrationCallback = ((_b = options.onRehydrateStorage) == null ? void 0 : _b.call(options, (_a = get()) != null ? _a : configResult)) || void 0;
    return toThenable(storage.getItem.bind(storage))(options.name).then((deserializedStorageValue) => {
      if (deserializedStorageValue) {
        if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
          if (options.migrate) {
            const migration = options.migrate(
              deserializedStorageValue.state,
              deserializedStorageValue.version
            );
            if (migration instanceof Promise) {
              return migration.then((result) => [true, result]);
            }
            return [true, migration];
          }
          console.error(
            `State loaded from storage couldn't be migrated since no migrate function was provided`
          );
        } else {
          return [false, deserializedStorageValue.state];
        }
      }
      return [false, void 0];
    }).then((migrationResult) => {
      var _a2;
      const [migrated, migratedState] = migrationResult;
      stateFromStorage = options.merge(
        migratedState,
        (_a2 = get()) != null ? _a2 : configResult
      );
      set(stateFromStorage, true);
      if (migrated) {
        return setItem();
      }
    }).then(() => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(stateFromStorage, void 0);
      stateFromStorage = get();
      hasHydrated = true;
      finishHydrationListeners.forEach((cb) => cb(stateFromStorage));
    }).catch((e) => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
    });
  };
  api.persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions
      };
      if (newOptions.storage) {
        storage = newOptions.storage;
      }
    },
    clearStorage: () => {
      storage == null ? void 0 : storage.removeItem(options.name);
    },
    getOptions: () => options,
    rehydrate: () => hydrate(),
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb);
      return () => {
        hydrationListeners.delete(cb);
      };
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb);
      return () => {
        finishHydrationListeners.delete(cb);
      };
    }
  };
  if (!options.skipHydration) {
    hydrate();
  }
  return stateFromStorage || configResult;
};
var persist = persistImpl;

// src/stores/useDraftStore.js
var initialState = {
  pages: [
    {
      id: "page-1",
      name: "Home",
      slug: "/",
      children: ["comp-1", "comp-2"]
    }
  ],
  components: [
    {
      id: "comp-1",
      type: "TEXT",
      content: "Welcome to your new site!",
      styles: {
        padding: "10px",
        fontSize: "24px",
        textAlign: "center"
      }
    },
    {
      id: "comp-2",
      type: "TEXT",
      content: "Start building by dragging and dropping components.",
      styles: {
        padding: "10px",
        fontSize: "16px",
        textAlign: "center"
      }
    }
  ],
  siteConfig: {
    title: "My Awesome Site",
    description: "A site built with the low-code builder.",
    slug: "/",
    metaTags: [],
    theme: {},
    typography: {},
    header: null,
    footer: null
  },
  assets: [],
  selectedComponentId: null,
  activePageId: "page-1"
  // New: Active page ID
};
var useDraftStore = create(
  persist(
    (set, get) => ({
      ...initialState,
      history: {
        past: [],
        present: { ...initialState },
        // Initialize present with initialState directly
        future: []
      },
      // Action to set the entire draft state
      setDraft: (draft) => set(draft),
      // Action to clear the draft state
      clearDraft: () => set({
        ...initialState,
        history: { past: [], present: { ...initialState }, future: [] }
      }),
      // New action to set selected component ID
      setSelectedComponentId: (id) => set({ selectedComponentId: id }),
      // New action to set active page ID
      setActivePageId: (id) => set({ activePageId: id }),
      // New action
      // Helper to wrap actions for undo/redo
      _saveState: (newState) => {
        const { history } = get();
        const newPast = [...history.past, history.present];
        set({
          history: {
            past: newPast,
            present: newState,
            future: []
          }
        });
      },
      // New action to update component content
      updateComponentContent: (id, newContent) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(
          (comp) => comp.id === id ? { ...comp, content: newContent } : comp
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
        const newComponents = currentState.components.map(
          (comp) => comp.id === id ? { ...comp, styles: { ...comp.styles, [styleKey]: styleValue } } : comp
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
          children: []
        };
        const newPages = [...currentState.pages, newPage];
        const newState = {
          ...currentState,
          pages: newPages,
          selectedComponentId: null,
          activePageId: newPageId
        };
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
              styles: { padding: "10px", fontSize: "16px", textAlign: "left" }
            };
            break;
          case "IMAGE":
            newComponent = {
              id: newComponentId,
              type: "IMAGE",
              src: "https://via.placeholder.com/150",
              alt: "Placeholder Image",
              styles: { width: "150px", height: "150px" }
            };
            break;
          case "BUTTON":
            newComponent = {
              id: newComponentId,
              type: "BUTTON",
              content: "Click Me",
              styles: {
                padding: "10px 20px",
                backgroundColor: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: "5px"
              }
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
          selectedComponentId: newComponentId
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
            ...previous,
            // Apply previous state
            history: {
              past: newPast,
              present: previous,
              future: [present, ...future]
            }
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
            ...next,
            // Apply next state
            history: {
              past: [...past, present],
              present: next,
              future: newFuture
            }
          });
        }
      }
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
            useDraftStore.setState((s) => ({
              history: {
                past: [],
                present: { ...s, history: void 0 },
                // Set present to the rehydrated state
                future: []
              }
            }));
          }
        };
      }
    }
  )
);
var useDraftStore_default = useDraftStore;

// src/components/GenericComponent.jsx
import React2, { useState } from "react";
var GenericComponent = ({ component, index, pageId }) => {
  const { type, content, styles, id } = component;
  const {
    selectedComponentId,
    setSelectedComponentId,
    updateComponentContent,
    reorderComponents
  } = useDraftStore_default();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const isSelected = selectedComponentId === id;
  const handleClick = (e) => {
    e.stopPropagation();
    setSelectedComponentId(id);
  };
  const handleDoubleClick = () => {
    if (type === "TEXT" && isSelected) {
      setIsEditing(true);
    }
  };
  const handleChange = (e) => {
    setEditedContent(e.target.value);
  };
  const handleBlur = () => {
    setIsEditing(false);
    updateComponentContent(id, editedContent);
  };
  const highlightStyle = isSelected ? {
    outline: "2px solid blue",
    outlineOffset: "2px",
    cursor: "pointer"
  } : {
    cursor: "pointer"
  };
  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData("componentId", id);
    e.dataTransfer.setData("sourceIndex", index);
    e.dataTransfer.setData("pageId", pageId);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedComponentId = e.dataTransfer.getData("componentId");
    const sourceIndex = parseInt(e.dataTransfer.getData("sourceIndex"), 10);
    const draggedPageId = e.dataTransfer.getData("pageId");
    if (draggedPageId === pageId && draggedComponentId !== id) {
      const destinationIndex = index;
      reorderComponents(pageId, sourceIndex, destinationIndex);
    }
  };
  switch (type) {
    case "TEXT":
      return /* @__PURE__ */ React2.createElement(
        "p",
        {
          style: { ...styles, ...highlightStyle },
          onClick: handleClick,
          onDoubleClick: handleDoubleClick,
          draggable: "true",
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDrop: handleDrop
        },
        isEditing ? /* @__PURE__ */ React2.createElement(
          "input",
          {
            type: "text",
            value: editedContent,
            onChange: handleChange,
            onBlur: handleBlur,
            autoFocus: true,
            style: {
              width: "100%",
              border: "none",
              background: "transparent",
              ...styles
            }
          }
        ) : content
      );
    case "IMAGE":
      return /* @__PURE__ */ React2.createElement(
        "img",
        {
          src: component.src,
          alt: component.alt,
          style: { ...styles, ...highlightStyle },
          onClick: handleClick,
          draggable: "true",
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDrop: handleDrop
        }
      );
    case "BUTTON":
      return /* @__PURE__ */ React2.createElement(
        "button",
        {
          style: { ...styles, ...highlightStyle },
          onClick: handleClick,
          draggable: "true",
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDrop: handleDrop
        },
        content
      );
    default:
      return /* @__PURE__ */ React2.createElement(
        "div",
        {
          style: { ...styles, ...highlightStyle },
          onClick: handleClick,
          draggable: "true",
          onDragStart: handleDragStart,
          onDragOver: handleDragOver,
          onDrop: handleDrop
        },
        "Unknown Component Type: ",
        type
      );
  }
};
var GenericComponent_default = GenericComponent;

// scripts/build-site.js
var generatePageHtml = (page, allComponents) => {
  const renderableComponents = page.children.map((componentId) => allComponents.find((comp) => comp.id === componentId)).filter(Boolean);
  const appHtml = ReactDOMServer.renderToString(
    /* @__PURE__ */ React3.createElement("div", null, renderableComponents.map((component, index) => /* @__PURE__ */ React3.createElement(
      GenericComponent_default,
      {
        key: component.id,
        component,
        index,
        pageId: page.id
      }
    )))
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.name}</title>
    <style>
        body { margin: 0; font-family: sans-serif; }
        /* Basic styles for components - will be expanded */
        p { margin: 0; }
        button { cursor: pointer; }
        img { max-width: 100%; height: auto; display: block; }
    </style>
</head>
<body>
    <div id="root">${appHtml}</div>
</body>
</html>`;
};
var buildSite = () => {
  const state = useDraftStore_default.getState().history.present;
  const { pages, components, assets } = state;
  const distDir = path.resolve(process.cwd(), "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }
  pages.forEach((page) => {
    const htmlContent = generatePageHtml(page, components);
    const fileName = page.slug === "/" ? "index.html" : `${page.slug.substring(1)}.html`;
    fs.writeFileSync(path.join(distDir, fileName), htmlContent);
    console.log(`Generated ${fileName}`);
  });
  if (assets && assets.length > 0) {
    const assetsDir = path.join(distDir, "assets");
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir);
    }
    assets.forEach((asset) => {
      console.log(`Saving asset: ${asset.name} (placeholder)`);
    });
  }
  console.log("Site build complete in /dist directory.");
};
buildSite();
