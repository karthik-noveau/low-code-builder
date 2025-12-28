import { useState, useRef, useEffect, useCallback } from 'react';
import { useDraftStore } from '../../../stores/use_draft_store';
import { GenericComponent } from '../component_renderer';
import { GhostPreview } from './ghost_preview';
import { ResizeHandles } from './resize_handles';
import { AlignmentGuides } from './components/alignment_guides';
import { getDeviceWidth, getResponsivePosition, calculateDropPosition, throttle } from './utils';
import { hasCollision, resolveCollisions, calculateResizePosition } from './drag_utils';
import { calculateSnapCandidates, findSnapTargets } from './services/snap_engine';
import { GRID_CONFIG, calculateColumnWidth } from './services/grid.config';
import { COMPONENT_TEMPLATES } from '../../../common/constants/component_templates';
import type { DragState, ResizeState, ResizeHandle } from './types';
import type { GridPosition } from '../../../types';
import styles from './style.module.css';

// Module-level variable to store dragged component type and ID
// This is set by the left panel or components during dragstart
let currentDraggedType: string | null = null;
// @ts-ignore - Stored for future validation logic
let _currentDraggedId: string | null = null;

// Export function for left panel to set the dragged type
export const setDraggedComponentType = (type: string | null) => {
  console.log('🎯 Setting dragged type:', type);
  currentDraggedType = type;
  _currentDraggedId = null; // Clear ID when dragging new component
};

// Export function for components to set when dragging existing component
export const setDraggedComponentId = (id: string | null, type: string | null) => {
  console.log('🔄 Setting dragged component ID:', id, 'Type:', type);
  _currentDraggedId = id;
  currentDraggedType = type; // Also set type for ghost preview
};

export const Canvas = () => {
  const {
    pages,
    components,
    addComponent,
    activePageId,
    devicePreview,
    selectedComponentId,
    setSelectedComponentId,
    updateComponentPosition,
    batchUpdatePositions,
  } = useDraftStore();

  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedComponentType: null,
    currentPosition: null,
    hasCollision: false,
    snapActive: false,
    alignmentGuides: [],
  });

  // Resize state
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    componentId: null,
    handle: null,
    startPosition: { colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
    startMousePos: { x: 0, y: 0 },
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const draggedTypeRef = useRef<string | null>(null);

  const safePages = Array.isArray(pages) ? pages : [];
  const safeComponents = Array.isArray(components) ? components : [];
  const currentPage = safePages.find((page) => page.id === activePageId);

  // Global drag listeners for visual feedback
  useEffect(() => {
    const handleGlobalDragStart = () => {
      console.log('🌍 Global dragstart detected');
      console.log('📦 Current dragged type from module var:', currentDraggedType);

      // Clear selection to hide resize handles (prevents blocking drop area)
      setSelectedComponentId(null);

      // Use the module-level variable set by the left panel
      if (currentDraggedType) {
        console.log('✅ Setting isDragging to true');
        setDragState((prev) => ({
          ...prev,
          isDragging: true,
          draggedComponentType: currentDraggedType,
        }));
      }
    };

    const handleGlobalDragEnd = () => {
      console.log('🏁 Global dragend detected');
      currentDraggedType = null;
      _currentDraggedId = null;
      draggedTypeRef.current = null;
      setDragState({
        isDragging: false,
        draggedComponentType: null,
        currentPosition: null,
        hasCollision: false,
        snapActive: false,
        alignmentGuides: [],
      });
    };

    document.addEventListener('dragstart', handleGlobalDragStart);
    document.addEventListener('dragend', handleGlobalDragEnd);

    return () => {
      document.removeEventListener('dragstart', handleGlobalDragStart);
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  // Resize mouse event listeners
  useEffect(() => {
    if (!resizeState.isResizing || !canvasRef.current || !resizeState.handle) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const colWidth = (rect.width - 40) / 12; // 12 columns minus padding
      const rowHeight = 60;

      const deltaPixels = {
        x: e.clientX - resizeState.startMousePos.x,
        y: e.clientY - resizeState.startMousePos.y,
      };

      const newPosition = calculateResizePosition(
        resizeState.startPosition,
        deltaPixels,
        colWidth,
        rowHeight,
        resizeState.handle!
      );

      // Update component position in real-time (optimistic update)
      if (resizeState.componentId) {
        updateComponentPosition(resizeState.componentId, newPosition);
      }
    };

    const handleMouseUp = () => {
      setResizeState({
        isResizing: false,
        componentId: null,
        handle: null,
        startPosition: resizeState.startPosition,
        startMousePos: { x: 0, y: 0 },
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState, updateComponentPosition]);

  if (!currentPage) {
    return <div>No page selected or found.</div>;
  }

  const renderableComponents = currentPage.children
    .map((componentId) => safeComponents.find((comp) => comp.id === componentId))
    .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined);

  // Throttled drag state update (only throttle expensive calculations)
  const throttledUpdateDragState = useCallback(
    throttle((clientX: number, clientY: number, componentType: string) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const colWidth = calculateColumnWidth(rect.width);

      // Calculate base drop position
      const basePosition = calculateDropPosition(
        { clientX, clientY } as React.DragEvent,
        rect,
        componentType
      );

      console.log('🎨 Updating drag state, position:', basePosition);

      if (basePosition) {
        // Get component template for default size
        const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];
        const defaultPos = template?.defaultProps?.position || { colSpan: 12, rowSpan: 1 };

        // Calculate pixel bounds of dragged component
        const draggedBounds = {
          left: (basePosition.col - 1) * colWidth,
          right: (basePosition.col - 1 + defaultPos.colSpan) * colWidth,
          top: (basePosition.row - 1) * GRID_CONFIG.ROW_HEIGHT,
          bottom: (basePosition.row - 1 + defaultPos.rowSpan) * GRID_CONFIG.ROW_HEIGHT,
        };

        // Calculate snap candidates from existing components
        const candidates = calculateSnapCandidates(renderableComponents, null, colWidth);

        // Find snap targets (for visual guides only, not actual snapping)
        const snapResult = findSnapTargets(draggedBounds, candidates, colWidth, renderableComponents);

        // Use base position (no automatic snapping), but show alignment guides
        const finalPosition = {
          col: basePosition.col,  // Always use cursor position, no snap
          row: basePosition.row,  // Always use cursor position, no snap
          colSpan: defaultPos.colSpan,
          rowSpan: defaultPos.rowSpan,
        };

        // Check for collisions with final position
        const gridPosition: GridPosition = {
          colStart: finalPosition.col,
          colSpan: finalPosition.colSpan,
          rowStart: finalPosition.row,
          rowSpan: finalPosition.rowSpan,
        };

        const collision = hasCollision(gridPosition, renderableComponents);

        // Update drag state with snap information
        setDragState({
          isDragging: true,
          draggedComponentType: componentType,
          currentPosition: finalPosition,
          hasCollision: collision,
          snapActive: snapResult.snapped,
          alignmentGuides: snapResult.alignmentGuides,
        });
      }
    }, GRID_CONFIG.DRAG_THROTTLE_MS),
    [renderableComponents]
  );

  // Enhanced drag over with collision detection and magnetic snapping
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // CRITICAL: Call preventDefault immediately (before throttling)
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Use component type from module variable (more reliable than state)
      if (currentDraggedType && canvasRef.current) {
        // Only throttle the expensive calculations, not the event handling
        throttledUpdateDragState(e.clientX, e.clientY, currentDraggedType);
      }
    },
    [throttledUpdateDragState]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    console.log('🚪 Drag entered canvas, current type:', currentDraggedType);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.target === e.currentTarget) {
      setDragState((prev) => ({ ...prev, currentPosition: null }));
    }
  };

  // Enhanced drop with collision resolution
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    console.log('💧 Drop event fired');

    // Check if this is repositioning an existing component or adding a new one
    const componentId = e.dataTransfer.getData('componentId');
    const componentType = currentDraggedType;

    console.log('📦 Component ID (existing):', componentId);
    console.log('📦 Component type (new):', componentType);
    console.log('📍 Current position:', dragState.currentPosition);

    if (componentId && dragState.currentPosition) {
      // Repositioning existing component
      console.log('↔️ Repositioning existing component:', componentId);
      const gridPosition: GridPosition = {
        colStart: dragState.currentPosition.col,
        colSpan: dragState.currentPosition.colSpan,
        rowStart: dragState.currentPosition.row,
        rowSpan: dragState.currentPosition.rowSpan,
      };

      // Type guard to ensure componentId is string
      if (typeof componentId === 'string') {
        updateComponentPosition(componentId, gridPosition);
      }
    } else if (componentType && dragState.currentPosition) {
      console.log('✅ Adding new component');
      const finalPosition: GridPosition = {
        colStart: dragState.currentPosition.col,
        colSpan: dragState.currentPosition.colSpan,
        rowStart: dragState.currentPosition.row,
        rowSpan: dragState.currentPosition.rowSpan,
      };

      // Resolve collisions and get updated components
      if (dragState.hasCollision) {
        const updatedComponents = resolveCollisions(
          finalPosition,
          null, // New component, no existing ID
          safeComponents,
          renderableComponents
        );

        // Batch update if there were collisions
        if (updatedComponents !== safeComponents) {
          batchUpdatePositions(updatedComponents);
        }
      }

      // Add the new component
      addComponent(currentPage.id, componentType, renderableComponents.length, finalPosition);
    }

    setDragState({
      isDragging: false,
      draggedComponentType: null,
      currentPosition: null,
      hasCollision: false,
      snapActive: false,
      alignmentGuides: [],
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedComponentId(null);
    }
  };

  // Resize handlers
  const handleResizeStart = useCallback(
    (componentId: string, position: GridPosition) =>
      (handle: ResizeHandle, e: React.MouseEvent) => {
        e.stopPropagation();
        setResizeState({
          isResizing: true,
          componentId,
          handle,
          startPosition: position,
          startMousePos: { x: e.clientX, y: e.clientY },
        });
      },
    []
  );

  const deviceWidth = getDeviceWidth(devicePreview);

  return (
    <div
      ref={canvasRef}
      className={`${styles.canvas} ${dragState.isDragging ? styles.canvasGridOverlay : ''}`}
      style={{
        width: deviceWidth,
        maxWidth: deviceWidth,
        margin: devicePreview !== 'desktop' ? '0 auto' : '0',
        boxShadow: devicePreview !== 'desktop' ? '0 2px 10px rgba(0,0,0,0.1)' : 'none',
        border: dragState.isDragging ? '2px solid #4F46E5' : '1px dashed #ccc',
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleCanvasClick}
    >
      {/* Alignment guides overlay - shown when snapping is active */}
      {dragState.snapActive && canvasRef.current && (
        <AlignmentGuides
          guides={dragState.alignmentGuides}
          canvasRect={canvasRef.current.getBoundingClientRect()}
        />
      )}

      {/* Ghost preview during drag with collision indicator */}
      {dragState.isDragging && dragState.currentPosition && dragState.draggedComponentType && (() => {
        // Find the component being dragged if it exists (for repositioning)
        const draggedComponent = _currentDraggedId
          ? safeComponents.find(c => c.id === _currentDraggedId)
          : undefined;

        return (
          <GhostPreview
            position={dragState.currentPosition}
            hasCollision={dragState.hasCollision}
            componentType={dragState.draggedComponentType}
            isSnapped={dragState.snapActive}
            component={draggedComponent}
          />
        );
      })()}

      {/* Render components with resize handles */}
      {renderableComponents.length > 0 ? (
        renderableComponents.map((component, index) => {
          const pos = getResponsivePosition(component, devicePreview);
          const isSelected = selectedComponentId === component.id;

          return (
            <div
              key={component.id}
              style={{
                gridColumnStart: pos.colStart,
                gridColumnEnd: Math.min(13, pos.colStart + pos.colSpan),
                gridRowStart: pos.rowStart,
                gridRowEnd: pos.rowStart + pos.rowSpan,
                position: 'relative',
                // Disable pointer events during drag to allow dropping near components
                pointerEvents: dragState.isDragging ? 'none' : 'auto',
                // Ensure components fill the grid cell when resized
                width: '100%',
                height: '100%',
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <GenericComponent component={component} index={index} pageId={currentPage.id} />

              {/* Show resize handles for selected component */}
              {isSelected && !dragState.isDragging && (
                <ResizeHandles onResizeStart={handleResizeStart(component.id, pos)} />
              )}
            </div>
          );
        })
      ) : (
        <div className={styles.emptyState}>
          {dragState.isDragging ? (
            <p className={styles.emptyStateDragging}>📦 Drop component to add it to the canvas</p>
          ) : (
            <p className={styles.emptyStateDefault}>
              Drag and drop components here to start building your page!
            </p>
          )}
        </div>
      )}
    </div>
  );
};
