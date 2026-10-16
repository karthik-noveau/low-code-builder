import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview, startMouseDragTracking } from './index';
import styles from './style.module.css';

export const HeroComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Start immediate drag detection (1px threshold)
    startMouseDragTracking(e, component.id, component.type);
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

  const heading = content.heading || 'Build Your Dream Website';
  const subheading = content.subheading || 'Create stunning, professional websites without code';
  const ctaText = content.ctaText || 'Get Started';
  const ctaLink = content.ctaLink || '#';

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <div
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>{heading}</h1>
        <p style={{ fontSize: '20px', marginBottom: '32px', opacity: 0.9 }}>{subheading}</p>
        <a
          href={ctaLink}
          style={{
            display: 'inline-block',
            padding: '16px 32px',
            fontSize: '18px',
            fontWeight: '600',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'inherit',
            border: '2px solid currentColor',
            borderRadius: '8px',
            textDecoration: 'none',
            transition: 'all 0.3s'
          }}
          onClick={(e) => e.preventDefault()}
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
};
