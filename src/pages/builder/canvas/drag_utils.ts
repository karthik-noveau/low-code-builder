import type { ComponentSchema, GridPosition } from '../../../types';

/**
 * Collision Detection & Grid Snapping Utilities
 * Provides algorithms for detecting component overlaps and managing layout shifts
 */

// ============================================================================
// COLLISION DETECTION
// ============================================================================

/**
 * Check if two grid positions overlap
 * Uses rectangle overlap detection algorithm
 */
export function checkCollision(pos1: GridPosition, pos2: GridPosition): boolean {
  const pos1ColEnd = pos1.colStart + pos1.colSpan;
  const pos2ColEnd = pos2.colStart + pos2.colSpan;
  const pos1RowEnd = pos1.rowStart + pos1.rowSpan;
  const pos2RowEnd = pos2.rowStart + pos2.rowSpan;

  const horizontalOverlap = pos1.colStart < pos2ColEnd && pos1ColEnd > pos2.colStart;
  const verticalOverlap = pos1.rowStart < pos2RowEnd && pos1RowEnd > pos2.rowStart;

  return horizontalOverlap && verticalOverlap;
}

/**
 * Validate if a grid position is within bounds
 * Grid is 12 columns wide, rows start at 1
 */
export function isValidPosition(position: GridPosition): boolean {
  return (
    position.colStart >= 1 &&
    position.colStart + position.colSpan <= 13 && // colEnd must be <= 13 (12 columns)
    position.rowStart >= 1 &&
    position.colSpan >= 1 &&
    position.rowSpan >= 1
  );
}

/**
 * Get all components that collide with a given position
 * @param position - The grid position to check
 * @param components - Array of components to check against
 * @param excludeId - Optional component ID to exclude from check (for moving existing components)
 */
export function getCollidingComponents(
  position: GridPosition,
  components: ComponentSchema[],
  excludeId?: string
): ComponentSchema[] {
  return components.filter((comp) => {
    if (excludeId && comp.id === excludeId) return false;
    if (!comp.position) return false;
    return checkCollision(position, comp.position);
  });
}

/**
 * Check if a position collides with any component
 */
export function hasCollision(
  position: GridPosition,
  components: ComponentSchema[],
  excludeId?: string
): boolean {
  return getCollidingComponents(position, components, excludeId).length > 0;
}

// ============================================================================
// LAYOUT SHIFTING (PUSH DOWN)
// ============================================================================

/**
 * Shift components down to resolve collisions
 * Recursively handles cascading collisions
 * @param position - The position of the new/moved component
 * @param components - Array of all components on the page
 * @returns Updated array with shifted components
 */
export function shiftComponentsDown(
  position: GridPosition,
  components: ComponentSchema[]
): ComponentSchema[] {
  const positionEnd = position.rowStart + position.rowSpan;

  // Sort components by row position (top to bottom)
  const sortedComponents = [...components].sort((a, b) => {
    if (!a.position || !b.position) return 0;
    return a.position.rowStart - b.position.rowStart;
  });

  let result = [...components];

  // Process each component that overlaps
  for (const comp of sortedComponents) {
    if (!comp.position) continue;

    if (checkCollision(position, comp.position)) {
      // Calculate new row start (push to end of overlapping area)
      const newRowStart = Math.max(positionEnd, comp.position.rowStart);

      // Update this component's position
      result = result.map((c) =>
        c.id === comp.id && c.position
          ? { ...c, position: { ...c.position, rowStart: newRowStart } }
          : c
      );

      // Get the updated component
      const updatedComp = result.find((c) => c.id === comp.id);
      if (updatedComp?.position) {
        // Recursively check for cascading collisions
        // (this component might now collide with components below it)
        const remainingComponents = result.filter((c) => c.id !== comp.id);
        const furtherShifted = shiftComponentsDown(updatedComp.position, remainingComponents);

        // Merge the results
        result = furtherShifted.map((c) => (c.id === comp.id ? updatedComp : c));
      }
    }
  }

  return result;
}

/**
 * Resolve all collisions for a new component position
 * Handles cascading collisions and returns updated component array
 * @param newPosition - Position of the new/moved component
 * @param newComponentId - ID of the component being added/moved (null for new components)
 * @param allComponents - All components in the store
 * @param pageComponents - Components on the current page only
 * @returns Updated array of all components with resolved positions
 */
export function resolveCollisions(
  newPosition: GridPosition,
  newComponentId: string | null,
  allComponents: ComponentSchema[],
  pageComponents: ComponentSchema[]
): ComponentSchema[] {
  // Find colliding components on this page
  const collidingComponents = getCollidingComponents(
    newPosition,
    pageComponents,
    newComponentId || undefined
  );

  if (collidingComponents.length === 0) {
    return allComponents; // No collisions, return as-is
  }

  // Shift all page components to resolve collisions
  const shiftedPageComponents = shiftComponentsDown(newPosition, pageComponents);

  // Create a map of updated positions
  const positionMap = new Map(
    shiftedPageComponents.map((comp) => [comp.id, comp.position])
  );

  // Apply updates to all components (preserving components on other pages)
  const updatedComponents = allComponents.map((comp) => {
    const newPosition = positionMap.get(comp.id);
    if (newPosition) {
      return { ...comp, position: newPosition };
    }
    return comp;
  });

  return updatedComponents;
}

// ============================================================================
// RESIZE UTILITIES
// ============================================================================

export type ResizeHandle = 'se' | 'e' | 's' | 'sw' | 'ne' | 'nw' | 'w' | 'n';

/**
 * Find the maximum allowed position for resize without collisions
 * @param proposedPosition - The desired position after resize
 * @param startPosition - The original position before resize started
 * @param componentId - ID of component being resized
 * @param components - All components on the page
 * @param handle - Which resize handle is being used
 * @returns Constrained position that doesn't collide
 */
export function constrainResizeToAvoidCollisions(
  proposedPosition: GridPosition,
  startPosition: GridPosition,
  componentId: string,
  components: ComponentSchema[],
  handle: ResizeHandle
): GridPosition {
  const otherComponents = components.filter(c => c.id !== componentId && c.position);

  let constrainedPosition = { ...proposedPosition };

  // Get the original bounds
  const startColEnd = startPosition.colStart + startPosition.colSpan;
  const startRowEnd = startPosition.rowStart + startPosition.rowSpan;

  // Process each component to find constraints
  for (const other of otherComponents) {
    if (!other.position) continue;

    const otherColEnd = other.position.colStart + other.position.colSpan;
    const otherRowEnd = other.position.rowStart + other.position.rowSpan;

    switch (handle) {
      case 'e': // East - growing right only
        // Check if component is to the right and overlaps vertically
        if (other.position.colStart >= startColEnd) { // Component is to the right
          // Check vertical overlap
          if (!(otherRowEnd <= proposedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + proposedPosition.rowSpan)) {
            // Would hit this component, constrain to its left edge
            const maxColEnd = other.position.colStart;
            const maxColSpan = maxColEnd - proposedPosition.colStart;
            if (maxColSpan > 0 && maxColSpan < constrainedPosition.colSpan) {
              constrainedPosition.colSpan = maxColSpan;
            }
          }
        }
        break;

      case 's': // South - growing down only
        // Check if component is below and overlaps horizontally
        if (other.position.rowStart >= startRowEnd) { // Component is below
          // Check horizontal overlap
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + proposedPosition.colSpan)) {
            // Would hit this component, constrain to its top edge
            const maxRowEnd = other.position.rowStart;
            const maxRowSpan = maxRowEnd - proposedPosition.rowStart;
            if (maxRowSpan > 0 && maxRowSpan < constrainedPosition.rowSpan) {
              constrainedPosition.rowSpan = maxRowSpan;
            }
          }
        }
        break;

      case 'se': // Southeast - growing right and down
        // Check right direction
        if (other.position.colStart >= startColEnd) {
          if (!(otherRowEnd <= proposedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + constrainedPosition.rowSpan)) {
            const maxColEnd = other.position.colStart;
            const maxColSpan = maxColEnd - proposedPosition.colStart;
            if (maxColSpan > 0 && maxColSpan < constrainedPosition.colSpan) {
              constrainedPosition.colSpan = maxColSpan;
            }
          }
        }
        // Check down direction
        if (other.position.rowStart >= startRowEnd) {
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + constrainedPosition.colSpan)) {
            const maxRowEnd = other.position.rowStart;
            const maxRowSpan = maxRowEnd - proposedPosition.rowStart;
            if (maxRowSpan > 0 && maxRowSpan < constrainedPosition.rowSpan) {
              constrainedPosition.rowSpan = maxRowSpan;
            }
          }
        }
        break;

      case 'w': // West - growing left
        if (otherColEnd <= startPosition.colStart) { // Component is to the left
          if (!(otherRowEnd <= proposedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + proposedPosition.rowSpan)) {
            const minColStart = otherColEnd;
            if (minColStart > constrainedPosition.colStart) {
              const rightEdge = proposedPosition.colStart + proposedPosition.colSpan;
              constrainedPosition.colStart = minColStart;
              constrainedPosition.colSpan = rightEdge - minColStart;
            }
          }
        }
        break;

      case 'n': // North - growing up
        if (otherRowEnd <= startPosition.rowStart) { // Component is above
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + proposedPosition.colSpan)) {
            const minRowStart = otherRowEnd;
            if (minRowStart > constrainedPosition.rowStart) {
              const bottomEdge = proposedPosition.rowStart + proposedPosition.rowSpan;
              constrainedPosition.rowStart = minRowStart;
              constrainedPosition.rowSpan = bottomEdge - minRowStart;
            }
          }
        }
        break;

      case 'sw': // Southwest
        // Left
        if (otherColEnd <= startPosition.colStart) {
          if (!(otherRowEnd <= proposedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + constrainedPosition.rowSpan)) {
            const minColStart = otherColEnd;
            if (minColStart > constrainedPosition.colStart) {
              const rightEdge = proposedPosition.colStart + proposedPosition.colSpan;
              constrainedPosition.colStart = minColStart;
              constrainedPosition.colSpan = rightEdge - minColStart;
            }
          }
        }
        // Down
        if (other.position.rowStart >= startRowEnd) {
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + constrainedPosition.colSpan)) {
            const maxRowEnd = other.position.rowStart;
            const maxRowSpan = maxRowEnd - proposedPosition.rowStart;
            if (maxRowSpan > 0 && maxRowSpan < constrainedPosition.rowSpan) {
              constrainedPosition.rowSpan = maxRowSpan;
            }
          }
        }
        break;

      case 'ne': // Northeast
        // Right
        if (other.position.colStart >= startColEnd) {
          if (!(otherRowEnd <= constrainedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + proposedPosition.rowSpan)) {
            const maxColEnd = other.position.colStart;
            const maxColSpan = maxColEnd - proposedPosition.colStart;
            if (maxColSpan > 0 && maxColSpan < constrainedPosition.colSpan) {
              constrainedPosition.colSpan = maxColSpan;
            }
          }
        }
        // Up
        if (otherRowEnd <= startPosition.rowStart) {
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + constrainedPosition.colSpan)) {
            const minRowStart = otherRowEnd;
            if (minRowStart > constrainedPosition.rowStart) {
              const bottomEdge = proposedPosition.rowStart + proposedPosition.rowSpan;
              constrainedPosition.rowStart = minRowStart;
              constrainedPosition.rowSpan = bottomEdge - minRowStart;
            }
          }
        }
        break;

      case 'nw': // Northwest
        // Left
        if (otherColEnd <= startPosition.colStart) {
          if (!(otherRowEnd <= constrainedPosition.rowStart || other.position.rowStart >= proposedPosition.rowStart + proposedPosition.rowSpan)) {
            const minColStart = otherColEnd;
            if (minColStart > constrainedPosition.colStart) {
              const rightEdge = proposedPosition.colStart + proposedPosition.colSpan;
              constrainedPosition.colStart = minColStart;
              constrainedPosition.colSpan = rightEdge - minColStart;
            }
          }
        }
        // Up
        if (otherRowEnd <= startPosition.rowStart) {
          if (!(otherColEnd <= proposedPosition.colStart || other.position.colStart >= proposedPosition.colStart + constrainedPosition.colSpan)) {
            const minRowStart = otherRowEnd;
            if (minRowStart > constrainedPosition.rowStart) {
              const bottomEdge = proposedPosition.rowStart + proposedPosition.rowSpan;
              constrainedPosition.rowStart = minRowStart;
              constrainedPosition.rowSpan = bottomEdge - minRowStart;
            }
          }
        }
        break;
    }
  }

  // Ensure minimum size
  constrainedPosition.colSpan = Math.max(1, constrainedPosition.colSpan);
  constrainedPosition.rowSpan = Math.max(1, constrainedPosition.rowSpan);

  return constrainedPosition;
}

/**
 * Calculate new position during resize with snap-to-grid
 * @param startPosition - Position before resize started
 * @param deltaPixels - Change in pixels from drag start
 * @param colWidth - Width of one grid column in pixels
 * @param rowHeight - Height of one grid row in pixels
 * @param handle - Which resize handle is being dragged
 * @returns New GridPosition snapped to grid
 */
export function calculateResizePosition(
  startPosition: GridPosition,
  deltaPixels: { x: number; y: number },
  colWidth: number,
  rowHeight: number,
  handle: ResizeHandle
): GridPosition {
  // Convert pixel delta to grid units (with rounding for snap-to-grid)
  const deltaCol = Math.round(deltaPixels.x / colWidth);
  const deltaRow = Math.round(deltaPixels.y / rowHeight);

  let newPosition = { ...startPosition };

  // Apply delta based on handle type
  switch (handle) {
    case 'se': // Southeast corner - resize width and height
      newPosition.colSpan = Math.max(1, startPosition.colSpan + deltaCol);
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan + deltaRow);
      break;

    case 'e': // East edge - resize width only
      newPosition.colSpan = Math.max(1, startPosition.colSpan + deltaCol);
      break;

    case 's': // South edge - resize height only
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan + deltaRow);
      break;

    case 'sw': // Southwest corner - resize width (from left) and height
      newPosition.colStart = Math.max(1, startPosition.colStart + deltaCol);
      newPosition.colSpan = Math.max(1, startPosition.colSpan - deltaCol);
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan + deltaRow);
      break;

    case 'ne': // Northeast corner - resize width and height (from top)
      newPosition.colSpan = Math.max(1, startPosition.colSpan + deltaCol);
      newPosition.rowStart = Math.max(1, startPosition.rowStart + deltaRow);
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan - deltaRow);
      break;

    case 'nw': // Northwest corner - resize both from top-left
      newPosition.colStart = Math.max(1, startPosition.colStart + deltaCol);
      newPosition.colSpan = Math.max(1, startPosition.colSpan - deltaCol);
      newPosition.rowStart = Math.max(1, startPosition.rowStart + deltaRow);
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan - deltaRow);
      break;

    case 'w': // West edge - resize width from left
      newPosition.colStart = Math.max(1, startPosition.colStart + deltaCol);
      newPosition.colSpan = Math.max(1, startPosition.colSpan - deltaCol);
      break;

    case 'n': // North edge - resize height from top
      newPosition.rowStart = Math.max(1, startPosition.rowStart + deltaRow);
      newPosition.rowSpan = Math.max(1, startPosition.rowSpan - deltaRow);
      break;
  }

  // Ensure doesn't exceed grid bounds (12 columns)
  newPosition.colSpan = Math.min(newPosition.colSpan, 13 - newPosition.colStart);

  // Ensure minimum size (at least 1 column and 1 row)
  newPosition.colSpan = Math.max(1, newPosition.colSpan);
  newPosition.rowSpan = Math.max(1, newPosition.rowSpan);

  return newPosition;
}
