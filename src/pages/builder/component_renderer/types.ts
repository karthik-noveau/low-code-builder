import type { ComponentSchema } from '../../../types';

export interface ComponentRendererProps {
  component: ComponentSchema;
  index: number;
  pageId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
}

export interface DragHandlers {
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface ComponentWrapperProps {
  isSelected: boolean;
  children: React.ReactNode;
  showToolbar?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
}
