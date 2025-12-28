import { COMPONENT_TEMPLATES } from '../../../common/constants';
import type { ComponentSchema } from '../../../types';
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
}

/**
 * Render component preview based on type
 */
const ComponentPreview = ({ component, componentType }: { component?: ComponentSchema; componentType: string }) => {
  // If we have the actual component data, use it
  if (component) {
    const componentStyles = {
      ...component.styles,
      opacity: 0.8,
      pointerEvents: 'none' as const,
      // Override any positioning that might interfere with grid layout
      margin: component.styles?.margin || 0,
      width: '100%',
      height: '100%',
      boxSizing: 'border-box' as const,
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
        return <img src={(component as any).src || 'https://via.placeholder.com/300'} alt="" style={componentStyles} />;
      default:
        break;
    }
  }

  // Fallback: Show template label
  const template = COMPONENT_TEMPLATES[componentType as keyof typeof COMPONENT_TEMPLATES];
  return <span className={styles.ghostPreviewLabel}>{template?.label || componentType}</span>;
};

/**
 * Ghost Preview Component
 * Shows actual component preview during drag
 */
export const GhostPreview = ({
  position,
  hasCollision,
  componentType,
  isSnapped = false,
  component
}: GhostPreviewProps) => {
  return (
    <div
      className={styles.ghostPreview}
      data-collision={hasCollision}
      data-snapped={isSnapped}
      style={{
        gridColumnStart: position.col,
        gridColumnEnd: Math.min(13, position.col + position.colSpan),
        gridRowStart: position.row,
        gridRowEnd: position.row + position.rowSpan,
      }}
    >
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
