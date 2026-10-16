import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const FooterComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
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

  const copyright = content.copyright || '© 2025 Your Company. All rights reserved.';
  const links = content.links || [];

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <footer
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {links.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '20px',
              justifyContent: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}
          >
            {links.map((link: any, idx: number) => (
              <a
                key={idx}
                href={link.url || '#'}
                style={{ color: 'inherit', textDecoration: 'none', opacity: 0.8 }}
                onClick={(e) => e.preventDefault()}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
        <p style={{ fontSize: '14px', opacity: 0.7 }}>{copyright}</p>
      </footer>
    </div>
  );
};
