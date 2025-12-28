import type { GridPosition } from '../../../types';
import type { ResizeHandle } from './drag_utils';
import type { AlignmentGuide } from './services/snap_engine';

/**
 * State management types for drag and drop operations
 */

export interface DragState {
  isDragging: boolean;
  draggedComponentType: string | null;
  currentPosition: {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
  } | null;
  hasCollision: boolean;
  snapActive: boolean; // NEW: Indicates if magnetic snap is active
  alignmentGuides: AlignmentGuide[]; // NEW: Guides to render during drag
}

export interface ResizeState {
  isResizing: boolean;
  componentId: string | null;
  handle: ResizeHandle | null;
  startPosition: GridPosition;
  startMousePos: { x: number; y: number };
}

export type { ResizeHandle };
