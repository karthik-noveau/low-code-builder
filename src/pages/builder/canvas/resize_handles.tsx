import type { ResizeHandle } from './types';
import styles from './style.module.css';

interface ResizeHandlesProps {
  onResizeStart: (handle: ResizeHandle, e: React.MouseEvent) => void;
}

/**
 * Resize Handles Component
 * Renders draggable handles for resizing components
 * Supports 8 handles: 4 corners + 4 edges (like Figma/Canva)
 */
export const ResizeHandles = ({ onResizeStart }: ResizeHandlesProps) => {
  const handles: Array<{ type: ResizeHandle; className: string; title: string }> = [
    // Corners
    { type: 'nw', className: styles.resizeHandleNw, title: 'Resize top-left corner' },
    { type: 'ne', className: styles.resizeHandleNe, title: 'Resize top-right corner' },
    { type: 'se', className: styles.resizeHandleSe, title: 'Resize bottom-right corner' },
    { type: 'sw', className: styles.resizeHandleSw, title: 'Resize bottom-left corner' },
    // Edges
    { type: 'n', className: styles.resizeHandleN, title: 'Resize height (top)' },
    { type: 'e', className: styles.resizeHandleE, title: 'Resize width (right)' },
    { type: 's', className: styles.resizeHandleS, title: 'Resize height (bottom)' },
    { type: 'w', className: styles.resizeHandleW, title: 'Resize width (left)' },
  ];

  const handleMouseDown = (handle: ResizeHandle) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart(handle, e);
  };

  return (
    <div className={styles.resizeHandles}>
      {handles.map(({ type, className, title }) => (
        <div
          key={type}
          className={`${styles.resizeHandle} ${className}`}
          onMouseDown={handleMouseDown(type)}
          data-handle={type}
          title={title}
        />
      ))}
    </div>
  );
};
