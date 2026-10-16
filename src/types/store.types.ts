import type { ComponentSchema, GridPosition } from './component.types';
import type { PageSchema } from './page.types';
import type { SiteConfig } from './site.types';
import type { AssetSchema } from './asset.types';

export interface DraftState {
  pages: PageSchema[];
  components: ComponentSchema[];
  siteConfig: SiteConfig;
  assets: AssetSchema[];
  selectedComponentId: string | null;
  activePageId: string;
  devicePreview: 'desktop' | 'tablet' | 'mobile';
  viewMode: 'visual' | 'code';
}

export interface HistoryState {
  past: DraftState[];
  present: DraftState;
  future: DraftState[];
}

export interface DraftStore extends DraftState {
  history: HistoryState;
  lastAutoSave: number;

  // Draft actions
  setDraft: (draft: Partial<DraftState>) => void;
  clearDraft: () => void;
  setSelectedComponentId: (id: string | null) => void;
  setActivePageId: (id: string) => void;
  setDevicePreview: (mode: 'desktop' | 'tablet' | 'mobile') => void;
  setViewMode: (mode: 'visual' | 'code') => void;

  // Component actions
  addComponent: (
    pageId: string,
    componentType: string,
    positionIndex: number,
    gridPosition?: Partial<GridPosition>,
    parentId?: string | null
  ) => void;
  updateComponentContent: (id: string, content: string) => void;
  updateComponentStyles: (id: string, styleKey: string, styleValue: any) => void;
  updateComponentProperty: (id: string, propertyKey: string, propertyValue: any) => void;
  updateComponentConfig: (id: string, configKey: string, configValue: any) => void;
  updateComponentPosition: (componentId: string, position: Partial<GridPosition>) => void;
  updateComponentPositionAndSize: (componentId: string, position: Partial<GridPosition>, width: string, height: string) => void;
  batchUpdatePositions: (updatedComponents: ComponentSchema[]) => void;
  deleteComponent: (componentId: string) => void;
  duplicateComponent: (componentId: string) => void;
  reorderComponents: (pageId: string, sourceIndex: number, destinationIndex: number) => void;
  addComponentToColumn: (
    pageId: string,
    columnLayoutId: string,
    columnIndex: number,
    componentType: string
  ) => void;
  moveComponentToColumn: (
    componentId: string,
    sourceColumnLayoutId: string,
    sourceColumnIndex: number,
    targetColumnLayoutId: string,
    targetColumnIndex: number
  ) => void;
  autoPushComponents: (newComponent: ComponentSchema) => void;

  // Page actions
  addPage: (name: string) => void;
  deletePage: (pageId: string) => void;
  renamePage: (pageId: string, newName: string) => void;
  updatePageMetadata: (pageId: string, metadataKey: string, metadataValue: any) => void;

  // Site config
  updateSiteConfig: (configKey: string, configValue: any) => void;

  // Asset management
  addAsset: (asset: AssetSchema) => void;
  deleteAsset: (assetId: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Internal
  _saveState: (newState: DraftState) => void;
}
