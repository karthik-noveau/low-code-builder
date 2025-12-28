import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COMPONENT_TEMPLATES } from '../common/constants';
import type {
  ComponentSchema,
  PageSchema,
  AssetSchema,
  DraftState,
  DraftStore,
  GridPosition,
} from '../types';

const initialState: DraftState = {
  pages: [
    {
      id: 'page-1',
      name: 'Home',
      slug: '/',
      children: ['comp-navbar-1', 'comp-1', 'comp-2', 'comp-3'],
      metadata: {
        title: 'Home - My Awesome Site',
        description: 'Welcome to my awesome website',
        slug: '/',
      },
    },
    {
      id: 'page-2',
      name: 'About',
      slug: '/about',
      children: ['comp-navbar-2', 'comp-4', 'comp-5', 'comp-6'],
      metadata: {
        title: 'About Us - My Awesome Site',
        description: 'Learn more about us',
        slug: '/about',
      },
    },
  ],
  components: [
    {
      id: 'comp-navbar-1',
      type: 'NAVBAR',
      config: {
        showAllPages: true,
        selectedPageIds: ['page-1', 'page-2'],
        customLinks: [],
      },
      styles: {
        display: 'flex',
        gap: '20px',
        padding: '15px 30px',
        backgroundColor: '#4F46E5',
        color: '#fff',
        alignItems: 'center',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-navbar-2',
      type: 'NAVBAR',
      config: {
        showAllPages: true,
        selectedPageIds: ['page-1', 'page-2'],
        customLinks: [],
      },
      styles: {
        display: 'flex',
        gap: '20px',
        padding: '15px 30px',
        backgroundColor: '#4F46E5',
        color: '#fff',
        alignItems: 'center',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-1',
      type: 'TEXT',
      content: 'Welcome to your new site!',
      styles: {
        padding: '20px',
        fontSize: '32px',
        textAlign: 'center',
        fontWeight: 'bold',
        color: '#4F46E5',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 2,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-2',
      type: 'TEXT',
      content: 'Start building by dragging and dropping components from the left panel.',
      styles: {
        padding: '10px 20px',
        fontSize: '18px',
        textAlign: 'center',
        color: '#6B7280',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 3,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-3',
      type: 'BUTTON',
      content: 'Get Started',
      styles: {
        padding: '12px 24px',
        fontSize: '16px',
        backgroundColor: '#4F46E5',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        margin: '20px auto',
        display: 'block',
      },
      position: {
        colStart: 5,
        colSpan: 4,
        rowStart: 4,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-4',
      type: 'TEXT',
      content: 'About Us',
      styles: {
        padding: '20px',
        fontSize: '28px',
        textAlign: 'center',
        fontWeight: 'bold',
        color: '#1F2937',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 2,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-5',
      type: 'TEXT',
      content: 'We are a team of passionate developers building amazing tools to help you create beautiful websites without writing code.',
      styles: {
        padding: '10px 40px',
        fontSize: '16px',
        textAlign: 'center',
        color: '#4B5563',
        lineHeight: '1.6',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 3,
        rowSpan: 1,
      },
    },
    {
      id: 'comp-6',
      type: 'LINK',
      content: 'Contact Us',
      href: '#contact',
      styles: {
        padding: '10px 20px',
        fontSize: '16px',
        color: '#4F46E5',
        textAlign: 'center',
        display: 'block',
        textDecoration: 'underline',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 4,
        rowSpan: 1,
      },
    },
  ],
  siteConfig: {
    title: 'My Awesome Site',
    description: 'A site built with the low-code builder.',
    slug: '/',
    siteUrl: '',
    keywords: '',
    author: '',
    metaTags: [],
    theme: {},
    typography: {},
    header: null,
    footer: null,
  },
  assets: [],
  selectedComponentId: null,
  activePageId: 'page-1',
  devicePreview: 'desktop',
  viewMode: 'visual',
};

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      history: {
        past: [],
        present: { ...initialState },
        future: [],
      },
      lastAutoSave: Date.now(),

      // Draft actions
      setDraft: (draft: Partial<DraftState>) => set(draft),

      clearDraft: () =>
        set({
          ...initialState,
          history: { past: [], present: { ...initialState }, future: [] },
        }),

      setSelectedComponentId: (id: string | null) => set({ selectedComponentId: id }),

      setActivePageId: (id: string) => set({ activePageId: id }),

      setDevicePreview: (mode: 'desktop' | 'tablet' | 'mobile') => set({ devicePreview: mode }),

      setViewMode: (mode: 'visual' | 'code') => set({ viewMode: mode }),

      // Helper to save state for undo/redo
      _saveState: (newState: DraftState) => {
        const { history, selectedComponentId, activePageId, devicePreview, viewMode } = get();
        const newPast = [...history.past, history.present];
        set({
          history: {
            past: newPast,
            present: newState,
            future: [],
          },
          pages: newState.pages,
          components: newState.components,
          siteConfig: newState.siteConfig,
          assets: newState.assets,
          selectedComponentId,
          activePageId,
          devicePreview,
          viewMode,
        });
      },

      // Component actions
      addComponent: (
        pageId: string,
        componentType: string,
        positionIndex: number,
        gridPosition?: Partial<GridPosition>,
        _parentId: string | null = null
      ) => {
        const currentState = get().history.present;
        const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];

        if (!template) return;

        const newComponentId = `comp-${Date.now()}`;
        const newComponent: ComponentSchema = {
          id: newComponentId,
          ...template.defaultProps,
          type: template.type,
          position: gridPosition ? { ...template.defaultProps.position, ...gridPosition } : template.defaultProps.position,
        } as ComponentSchema;

        const newComponents = [...currentState.components, newComponent];

        const newPages = currentState.pages.map(page => {
          if (page.id === pageId) {
            const newChildren = [...page.children];
            newChildren.splice(positionIndex, 0, newComponentId);
            return { ...page, children: newChildren };
          }
          return page;
        });

        const newState = { ...currentState, pages: newPages, components: newComponents };
        get()._saveState(newState);
        set({ selectedComponentId: newComponentId });
      },

      updateComponentContent: (id: string, content: string) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(comp =>
          comp.id === id ? { ...comp, content } : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      updateComponentStyles: (id: string, styleKey: string, styleValue: any) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(comp =>
          comp.id === id
            ? { ...comp, styles: { ...(comp.styles || {}), [styleKey]: styleValue } }
            : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      updateComponentProperty: (id: string, propertyKey: string, propertyValue: any) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(comp =>
          comp.id === id ? { ...comp, [propertyKey]: propertyValue } : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      updateComponentConfig: (id: string, configKey: string, configValue: any) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(comp =>
          comp.id === id
            ? { ...comp, config: { ...(comp.config || {}), [configKey]: configValue } }
            : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      updateComponentPosition: (componentId: string, position: Partial<GridPosition>) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.map(comp =>
          comp.id === componentId
            ? { ...comp, position: { ...(comp.position || {} as GridPosition), ...position } }
            : comp
        );
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      batchUpdatePositions: (updatedComponents: ComponentSchema[]) => {
        const currentState = get().history.present;
        const newState = { ...currentState, components: updatedComponents };
        get()._saveState(newState);
      },

      deleteComponent: (componentId: string) => {
        const currentState = get().history.present;
        const newComponents = currentState.components.filter(comp => comp.id !== componentId);
        const newPages = currentState.pages.map(page => ({
          ...page,
          children: page.children.filter(id => id !== componentId),
        }));
        const newState = { ...currentState, components: newComponents, pages: newPages };
        get()._saveState(newState);
        set({ selectedComponentId: null });
      },

      duplicateComponent: (componentId: string) => {
        const currentState = get().history.present;
        const component = currentState.components.find(comp => comp.id === componentId);
        if (!component) return;

        const newComponentId = `comp-${Date.now()}`;
        const duplicatedComponent = { ...component, id: newComponentId };
        const newComponents = [...currentState.components, duplicatedComponent];

        // Find which page contains this component and add the duplicate
        const newPages = currentState.pages.map(page => {
          const index = page.children.indexOf(componentId);
          if (index !== -1) {
            const newChildren = [...page.children];
            newChildren.splice(index + 1, 0, newComponentId);
            return { ...page, children: newChildren };
          }
          return page;
        });

        const newState = { ...currentState, components: newComponents, pages: newPages };
        get()._saveState(newState);
        set({ selectedComponentId: newComponentId });
      },

      reorderComponents: (pageId: string, sourceIndex: number, destinationIndex: number) => {
        const currentState = get().history.present;
        const newPages = currentState.pages.map(page => {
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
      },

      addComponentToColumn: (
        _pageId: string,
        columnLayoutId: string,
        columnIndex: number,
        componentType: string
      ) => {
        const currentState = get().history.present;
        const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];
        if (!template) return;

        const newComponentId = `comp-${Date.now()}`;
        const newComponent: ComponentSchema = {
          id: newComponentId,
          ...template.defaultProps,
          type: template.type,
        } as ComponentSchema;

        const newComponents = [...currentState.components, newComponent];

        const updatedComponents = newComponents.map(comp => {
          if (comp.id === columnLayoutId && comp.type === 'COLUMN_LAYOUT') {
            const newChildren = [...((comp as any).children || [[], []])];
            newChildren[columnIndex] = [...(newChildren[columnIndex] || []), newComponentId];
            return { ...comp, children: newChildren };
          }
          return comp;
        });

        const newState = { ...currentState, components: updatedComponents };
        get()._saveState(newState);
        set({ selectedComponentId: newComponentId });
      },

      moveComponentToColumn: (
        componentId: string,
        sourceColumnLayoutId: string,
        sourceColumnIndex: number,
        targetColumnLayoutId: string,
        targetColumnIndex: number
      ) => {
        const currentState = get().history.present;

        // Remove from source
        let updatedComponents = currentState.components.map(comp => {
          if (comp.id === sourceColumnLayoutId && comp.type === 'COLUMN_LAYOUT') {
            const newChildren = [...((comp as any).children || [])];
            newChildren[sourceColumnIndex] = (newChildren[sourceColumnIndex] || []).filter(
              (id: string) => id !== componentId
            );
            return { ...comp, children: newChildren };
          }
          return comp;
        });

        // Add to target
        updatedComponents = updatedComponents.map(comp => {
          if (comp.id === targetColumnLayoutId && comp.type === 'COLUMN_LAYOUT') {
            const newChildren = [...((comp as any).children || [])];
            newChildren[targetColumnIndex] = [...(newChildren[targetColumnIndex] || []), componentId];
            return { ...comp, children: newChildren };
          }
          return comp;
        });

        const newState = { ...currentState, components: updatedComponents };
        get()._saveState(newState);
      },

      autoPushComponents: (newComponent: ComponentSchema) => {
        // Simplified version - just add the component
        const currentState = get().history.present;
        const newComponents = [...currentState.components, newComponent];
        const newState = { ...currentState, components: newComponents };
        get()._saveState(newState);
      },

      // Page actions
      addPage: (name: string) => {
        const currentState = get().history.present;
        const newPageId = `page-${currentState.pages.length + 1}`;
        const navbarId = `comp-navbar-${Date.now()}`;

        const navbarComponent: ComponentSchema = {
          id: navbarId,
          type: 'NAVBAR',
          config: {
            showAllPages: true,
            selectedPageIds: [...currentState.pages.map(p => p.id), newPageId],
            customLinks: [],
          },
          styles: {
            display: 'flex',
            gap: '20px',
            padding: '15px 30px',
            backgroundColor: '#4F46E5',
            color: '#fff',
            alignItems: 'center',
          },
        };

        const newPage: PageSchema = {
          id: newPageId,
          name: name || `New Page ${currentState.pages.length + 1}`,
          slug: `/${newPageId}`,
          children: [navbarId],
          metadata: {
            title: `${name || `New Page ${currentState.pages.length + 1}`} - ${currentState.siteConfig.title}`,
            description: '',
            slug: `/${newPageId}`,
          },
        };

        const newPages = [...currentState.pages, newPage];
        const newComponents = [...currentState.components, navbarComponent];

        const newState = { ...currentState, pages: newPages, components: newComponents };
        get()._saveState(newState);
        set({ selectedComponentId: null, activePageId: newPageId });
      },

      deletePage: (pageId: string) => {
        const currentState = get().history.present;
        if (currentState.pages.length <= 1) return; // Don't delete the last page

        const pageToDelete = currentState.pages.find(p => p.id === pageId);
        if (!pageToDelete) return;

        const componentIdsToDelete = pageToDelete.children;
        const newComponents = currentState.components.filter(
          comp => !componentIdsToDelete.includes(comp.id)
        );
        const newPages = currentState.pages.filter(p => p.id !== pageId);

        const newState = { ...currentState, pages: newPages, components: newComponents };
        get()._saveState(newState);

        const { activePageId } = get();
        if (activePageId === pageId) {
          set({ activePageId: newPages[0].id, selectedComponentId: null });
        }
      },

      renamePage: (pageId: string, newName: string) => {
        const currentState = get().history.present;
        const newPages = currentState.pages.map(page =>
          page.id === pageId ? { ...page, name: newName } : page
        );
        const newState = { ...currentState, pages: newPages };
        get()._saveState(newState);
      },

      updatePageMetadata: (pageId: string, metadataKey: string, metadataValue: any) => {
        const currentState = get().history.present;
        const newPages = currentState.pages.map(page =>
          page.id === pageId
            ? { ...page, metadata: { ...page.metadata, [metadataKey]: metadataValue } }
            : page
        );
        const newState = { ...currentState, pages: newPages };
        get()._saveState(newState);
      },

      // Site config
      updateSiteConfig: (configKey: string, configValue: any) => {
        const currentState = get().history.present;
        const newSiteConfig = { ...currentState.siteConfig, [configKey]: configValue };
        const newState = { ...currentState, siteConfig: newSiteConfig };
        get()._saveState(newState);
      },

      // Asset management
      addAsset: (asset: AssetSchema) => {
        const currentState = get().history.present;
        const newAssets = [...currentState.assets, asset];
        const newState = { ...currentState, assets: newAssets };
        get()._saveState(newState);
      },

      deleteAsset: (assetId: string) => {
        const currentState = get().history.present;
        const newAssets = currentState.assets.filter(asset => asset.id !== assetId);
        const newState = { ...currentState, assets: newAssets };
        get()._saveState(newState);
      },

      // Undo/Redo
      undo: () => {
        const { history } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, history.past.length - 1);

        set({
          history: {
            past: newPast,
            present: previous,
            future: [history.present, ...history.future],
          },
          pages: previous.pages,
          components: previous.components,
          siteConfig: previous.siteConfig,
          assets: previous.assets,
        });
      },

      redo: () => {
        const { history } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        set({
          history: {
            past: [...history.past, history.present],
            present: next,
            future: newFuture,
          },
          pages: next.pages,
          components: next.components,
          siteConfig: next.siteConfig,
          assets: next.assets,
        });
      },
    }),
    {
      name: 'draft-storage',
      partialize: (state) => ({
        pages: state.pages,
        components: state.components,
        siteConfig: state.siteConfig,
        assets: state.assets,
        activePageId: state.activePageId,
      }),
    }
  )
);

export default useDraftStore;
