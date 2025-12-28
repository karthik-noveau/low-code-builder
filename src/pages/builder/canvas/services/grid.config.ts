/**
 * Grid Configuration Service
 * Centralized configuration for the canvas grid system
 *
 * This service provides:
 * - Grid constants (columns, row height, padding, etc.)
 * - Pixel ↔ Grid coordinate conversions
 * - Snap threshold configuration
 */

import type { GridPosition } from '../../../../types';

/**
 * Grid Configuration Constants
 */
export const GRID_CONFIG = {
  /** Number of columns in the grid */
  COLUMNS: 12,

  /** Height of each row in pixels */
  ROW_HEIGHT: 60,

  /** Canvas padding in pixels */
  PADDING: 20,

  /** Grid gap in pixels */
  GAP: 0,

  /** Snap threshold for magnetic snapping (pixels) */
  SNAP_THRESHOLD: 14,

  /** Alignment tolerance for detecting aligned edges (pixels) */
  ALIGNMENT_THRESHOLD: 2,

  /** Drag event throttle interval (milliseconds) */
  DRAG_THROTTLE_MS: 16, // ~60fps
} as const;

/**
 * Calculate column width based on canvas width
 * @param canvasWidth - Width of the canvas element in pixels
 * @returns Width of a single column in pixels
 */
export function calculateColumnWidth(canvasWidth: number): number {
  return (canvasWidth - GRID_CONFIG.PADDING * 2) / GRID_CONFIG.COLUMNS;
}

/**
 * Convert grid position to pixel bounds
 * @param position - Grid position object
 * @param colWidth - Width of a single column in pixels
 * @returns Pixel bounds (left, right, top, bottom)
 */
export function gridToPixelBounds(
  position: GridPosition,
  colWidth: number
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: (position.colStart - 1) * colWidth,
    right: (position.colStart - 1 + position.colSpan) * colWidth,
    top: (position.rowStart - 1) * GRID_CONFIG.ROW_HEIGHT,
    bottom: (position.rowStart - 1 + position.rowSpan) * GRID_CONFIG.ROW_HEIGHT,
  };
}

/**
 * Convert pixel position to grid coordinates
 * @param x - X coordinate in pixels (relative to canvas)
 * @param y - Y coordinate in pixels (relative to canvas)
 * @param colWidth - Width of a single column in pixels
 * @returns Grid coordinates (col, row)
 */
export function pixelToGrid(
  x: number,
  y: number,
  colWidth: number
): { col: number; row: number } {
  return {
    col: Math.max(1, Math.min(GRID_CONFIG.COLUMNS, Math.floor(x / colWidth) + 1)),
    row: Math.max(1, Math.floor(y / GRID_CONFIG.ROW_HEIGHT) + 1),
  };
}

/**
 * Calculate grid cell coordinates from pixel bounds
 * Useful for reverse mapping after magnetic snapping
 * @param bounds - Pixel bounds
 * @param colWidth - Width of a single column
 * @returns Grid position
 */
export function pixelBoundsToGrid(
  bounds: { left: number; top: number; width: number; height: number },
  colWidth: number
): GridPosition {
  const colStart = Math.max(1, Math.round(bounds.left / colWidth) + 1);
  const rowStart = Math.max(1, Math.round(bounds.top / GRID_CONFIG.ROW_HEIGHT) + 1);
  const colSpan = Math.max(1, Math.round(bounds.width / colWidth));
  const rowSpan = Math.max(1, Math.round(bounds.height / GRID_CONFIG.ROW_HEIGHT));

  return {
    colStart,
    colSpan,
    rowStart,
    rowSpan,
  };
}
