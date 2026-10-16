import { COMPONENT_TEMPLATES } from '../../../common/constants';
import type { ComponentSchema } from '../../../types';
import { GRID_CONFIG } from './services/grid.config';
import styles from './style.module.css';

interface GhostPreviewProps {
  position: {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
  };
  hasCollision: boolean;
  componentType: string;
  isSnapped?: boolean;
  component?: ComponentSchema; // Optional: actual component being repositioned
  pixelPosition?: { x: number; y: number } | null; // Optional: exact mouse position for smooth preview
  colWidth?: number; // Required when using pixelPosition
}

/**
 * Render component preview based on type
 */
const ComponentPreview = ({ component, componentType }: { component?: ComponentSchema; componentType: string }) => {
  // If we have the actual component data, use it
  if (component) {
    const { content } = component;
    const componentStyles = {
      ...component.styles,
      opacity: 0.8,
      pointerEvents: 'none' as const,
      boxSizing: 'border-box' as const,
      // Fill the ghost preview container (which is sized by grid position)
      width: '100%',
      height: '100%',
    };

    switch (component.type) {
      case 'TEXT':
        return <p style={componentStyles}>{component.content}</p>;
      case 'HEADING':
        return <h2 style={componentStyles}>{component.content}</h2>;
      case 'BUTTON':
        return <button style={componentStyles}>{component.content}</button>;
      case 'LINK':
        return <a style={componentStyles}>{component.content}</a>;
      case 'IMAGE':
        return <img src={(component as any).src || 'https://via.placeholder.com/300'} alt="" style={{...componentStyles, objectFit: 'cover'}} />;
      case 'NAVBAR':
      case 'HERO':
      case 'CARD':
      case 'FOOTER':
      case 'CONTAINER':
      case 'GRID':
      case 'SECTION':
      case 'COLUMN_LAYOUT':
      case 'FORM':
        // For complex components, render a styled preview with the component's actual styles
        return (
          <div style={{
            ...componentStyles,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'inherit',
            }}>
              {component.content || COMPONENT_TEMPLATES[component.type as keyof typeof COMPONENT_TEMPLATES]?.label}
            </div>
          </div>
        );
      default:
        // Fallback for unknown component types
        return (
          <div style={componentStyles}>
            <span className={styles.ghostPreviewLabel}>{content || componentType}</span>
          </div>
        );
    }
  }

  // Fallback: Show template label
  const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];
  return <span className={styles.ghostPreviewLabel}>{template?.label || componentType}</span>;
};

/**
 * Ghost Preview Component
 * Shows actual component preview during drag
 * Supports both grid-snapped and smooth pixel-level positioning
 */
export const GhostPreview = ({
  position,
  hasCollision,
  componentType,
  isSnapped = false,
  component,
  pixelPosition,
  colWidth
}: GhostPreviewProps) => {
  // Use pixel positioning for smooth preview if available
  const usePixelPositioning = pixelPosition && colWidth;

  // Calculate pixel dimensions based on grid position
  const width = usePixelPositioning ? position.colSpan * colWidth : undefined;
  const height = usePixelPositioning ? position.rowSpan * GRID_CONFIG.ROW_HEIGHT : undefined;

  // Calculate absolute position (offset by half the component size to center on cursor)
  const left = usePixelPositioning ? pixelPosition.x - (width! / 2) : undefined;
  const top = usePixelPositioning ? pixelPosition.y - (height! / 2) : undefined;

  return (
    <div
      className={styles.ghostPreview}
      data-collision={hasCollision}
      data-snapped={isSnapped}
      style={usePixelPositioning ? {
        // Absolute positioning for smooth pixel-level tracking
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        // Remove from grid layout
        gridColumn: 'unset',
        gridRow: 'unset',
        // Ensure smooth rendering
        willChange: 'left, top',
      } : {
        // Grid positioning for snapped preview (fallback)
        gridColumnStart: position.col,
        gridColumnEnd: Math.min(13, position.col + position.colSpan),
        gridRowStart: position.row,
        gridRowEnd: position.row + position.rowSpan,
      }}
    >
      {/* Precision crosshair for pixel-level positioning */}
      {usePixelPositioning && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '20px',
          height: '20px',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 1002,
        }}>
          {/* Crosshair lines */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '0',
            width: '1px',
            height: '100%',
            background: '#4f46e5',
            transform: 'translateX(-50%)',
          }} />
          <div style={{
            position: 'absolute',
            left: '0',
            top: '50%',
            width: '100%',
            height: '1px',
            background: '#4f46e5',
            transform: 'translateY(-50%)',
          }} />
          {/* Center dot */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: '#4f46e5',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 2px white, 0 0 4px rgba(79, 70, 229, 0.5)',
          }} />
        </div>
      )}

      <div className={styles.ghostPreviewContent}>
        <ComponentPreview component={component} componentType={componentType} />
        {(isSnapped || hasCollision) && (
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {isSnapped && (
              <span className={styles.snapIndicator}>
                🧲 Snapped
              </span>
            )}
            {hasCollision && (
              <span className={styles.collisionWarning}>
                ⚠️ Will push down
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
