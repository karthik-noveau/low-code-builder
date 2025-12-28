/**
 * Snap Engine Service
 * Handles magnetic snapping to component edges
 *
 * This service provides:
 * - Edge detection for all components
 * - Distance calculation for snap candidates
 * - Alignment guide generation
 * - Magnetic snapping algorithm (O(n) complexity)
 */

import type { ComponentSchema } from '../../../../types';
import { GRID_CONFIG, gridToPixelBounds } from './grid.config';

/**
 * Snap candidate - represents a potential snap target (component edge)
 */
export interface SnapCandidate {
  componentId: string;
  edge: 'left' | 'right' | 'top' | 'bottom';
  position: number; // pixel position of the edge
  isVertical: boolean; // true for left/right, false for top/bottom
}

/**
 * Snap result after calculation
 */
export interface SnapResult {
  snapped: boolean;
  snapPosition?: {
    col?: number;
    row?: number;
  };
  snapCandidates: SnapCandidate[]; // All edges that snapped
  alignmentGuides: AlignmentGuide[]; // Guides to render
}

/**
 * Alignment guide for visual feedback
 */
export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number; // pixel position (x for vertical, y for horizontal)
  start: number; // start of line (y for vertical, x for horizontal)
  end: number; // end of line
}

/**
 * Calculate snap candidates from all components
 * This runs O(n) where n is number of components
 *
 * @param components - All components on the canvas
 * @param excludeId - Component ID to exclude (usually the dragged component)
 * @param colWidth - Width of a grid column in pixels
 * @returns Array of snap candidates (component edges)
 */
export function calculateSnapCandidates(
  components: ComponentSchema[],
  excludeId: string | null,
  colWidth: number
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  for (const comp of components) {
    // Skip components without position or the excluded component
    if (!comp.position || comp.id === excludeId) continue;

    // Convert grid position to pixel bounds
    const bounds = gridToPixelBounds(comp.position, colWidth);

    // Add all four edges as snap candidates
    candidates.push(
      {
        componentId: comp.id,
        edge: 'left',
        position: bounds.left,
        isVertical: true,
      },
      {
        componentId: comp.id,
        edge: 'right',
        position: bounds.right,
        isVertical: true,
      },
      {
        componentId: comp.id,
        edge: 'top',
        position: bounds.top,
        isVertical: false,
      },
      {
        componentId: comp.id,
        edge: 'bottom',
        position: bounds.bottom,
        isVertical: false,
      }
    );
  }

  return candidates;
}

/**
 * Find snap targets for a dragged component
 * Returns the best snap position or null if no snap
 *
 * @param draggedBounds - Pixel bounds of the dragged component
 * @param candidates - All snap candidates (from calculateSnapCandidates)
 * @param colWidth - Width of a grid column in pixels
 * @param components - All components (needed for guide generation)
 * @returns Snap result with position and guides
 */
export function findSnapTargets(
  draggedBounds: { left: number; right: number; top: number; bottom: number },
  candidates: SnapCandidate[],
  colWidth: number,
  components: ComponentSchema[]
): SnapResult {
  const threshold = GRID_CONFIG.SNAP_THRESHOLD;
  let bestHorizontalSnap: { candidate: SnapCandidate; distance: number; dragEdge: 'top' | 'bottom' } | null = null;
  let bestVerticalSnap: { candidate: SnapCandidate; distance: number; dragEdge: 'left' | 'right' } | null = null;

  // Check vertical edges (left/right)
  for (const candidate of candidates.filter((c) => c.isVertical)) {
    // Check if dragged left edge is close to candidate
    const leftDistance = Math.abs(draggedBounds.left - candidate.position);
    if (leftDistance < threshold) {
      if (!bestVerticalSnap || leftDistance < bestVerticalSnap.distance) {
        bestVerticalSnap = { candidate, distance: leftDistance, dragEdge: 'left' };
      }
    }

    // Check if dragged right edge is close to candidate
    const rightDistance = Math.abs(draggedBounds.right - candidate.position);
    if (rightDistance < threshold) {
      if (!bestVerticalSnap || rightDistance < bestVerticalSnap.distance) {
        bestVerticalSnap = { candidate, distance: rightDistance, dragEdge: 'right' };
      }
    }
  }

  // Check horizontal edges (top/bottom)
  for (const candidate of candidates.filter((c) => !c.isVertical)) {
    // Check if dragged top edge is close to candidate
    const topDistance = Math.abs(draggedBounds.top - candidate.position);
    if (topDistance < threshold) {
      if (!bestHorizontalSnap || topDistance < bestHorizontalSnap.distance) {
        bestHorizontalSnap = { candidate, distance: topDistance, dragEdge: 'top' };
      }
    }

    // Check if dragged bottom edge is close to candidate
    const bottomDistance = Math.abs(draggedBounds.bottom - candidate.position);
    if (bottomDistance < threshold) {
      if (!bestHorizontalSnap || bottomDistance < bestHorizontalSnap.distance) {
        bestHorizontalSnap = { candidate, distance: bottomDistance, dragEdge: 'bottom' };
      }
    }
  }

  // Build result
  const snappedCandidates: SnapCandidate[] = [];
  const guides: AlignmentGuide[] = [];
  let snapCol: number | undefined;
  let snapRow: number | undefined;

  if (bestVerticalSnap) {
    snappedCandidates.push(bestVerticalSnap.candidate);
    snapCol = Math.round(bestVerticalSnap.candidate.position / colWidth) + 1;

    // Create alignment guide
    const targetComp = components.find((c) => c.id === bestVerticalSnap!.candidate.componentId);
    if (targetComp && targetComp.position) {
      const targetBounds = gridToPixelBounds(targetComp.position, colWidth);

      guides.push({
        type: 'vertical',
        position: bestVerticalSnap.candidate.position,
        start: Math.min(draggedBounds.top, targetBounds.top),
        end: Math.max(draggedBounds.bottom, targetBounds.bottom),
      });
    }
  }

  if (bestHorizontalSnap) {
    snappedCandidates.push(bestHorizontalSnap.candidate);
    snapRow = Math.round(bestHorizontalSnap.candidate.position / GRID_CONFIG.ROW_HEIGHT) + 1;

    // Create alignment guide
    const targetComp = components.find((c) => c.id === bestHorizontalSnap!.candidate.componentId);
    if (targetComp && targetComp.position) {
      const targetBounds = gridToPixelBounds(targetComp.position, colWidth);

      guides.push({
        type: 'horizontal',
        position: bestHorizontalSnap.candidate.position,
        start: Math.min(draggedBounds.left, targetBounds.left),
        end: Math.max(draggedBounds.right, targetBounds.right),
      });
    }
  }

  return {
    snapped: snappedCandidates.length > 0,
    snapPosition: snapCol || snapRow ? { col: snapCol, row: snapRow } : undefined,
    snapCandidates: snappedCandidates,
    alignmentGuides: guides,
  };
}
