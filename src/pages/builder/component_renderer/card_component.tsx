import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const CardComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
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

  let content: any = {};
  try {
    content = typeof component.content === 'string' ? JSON.parse(component.content) : component.content || {};
  } catch {
    content = {};
  }

  const title = content.title || 'Card Title';
  const description = content.description || 'Card description goes here';
  const image = content.image || '';
  const link = content.link || '';

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <div
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {image && (
          <img
            src={image}
            alt={title}
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              borderRadius: '8px 8px 0 0',
              marginBottom: '16px'
            }}
            loading="lazy"
          />
        )}
        <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#111827' }}>{title}</h3>
        <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#6b7280', marginBottom: '16px' }}>{description}</p>
        {link && (
          <a
            href={link}
            style={{ color: '#4F46E5', fontWeight: '600', textDecoration: 'none' }}
            onClick={(e) => e.preventDefault()}
          >
            Learn More →
          </a>
        )}
      </div>
    </div>
  );
};
