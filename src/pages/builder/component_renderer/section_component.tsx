import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const SectionComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('componentId', component.id);
    e.dataTransfer.setData('sourceIndex', index.toString());
    e.dataTransfer.setData('pageId', pageId);
    setDraggedComponentId(component.id, component.type);
    hideDragPreview(e);  };

  const handleDragEnd = () => {
    setDraggedComponentId(null, null);
  };

  const highlightStyle = isSelected
    ? { outline: '2px solid #4F46E5', outlineOffset: '2px', cursor: 'pointer' }
    : { cursor: 'pointer' };

  const config = (component as any).config || {};
  const containerWidth = config.containerWidth || '1200px';
  const sectionChildren = (component as any).children || [];

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <section
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{ maxWidth: containerWidth, margin: '0 auto' }}>
          {sectionChildren.length > 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
              Section with {sectionChildren.length} components
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999', border: '2px dashed #ddd', borderRadius: '8px' }}>
              Drop components in this section
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
