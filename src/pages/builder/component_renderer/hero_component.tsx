import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const HeroComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
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

  const heading = content.heading || 'Build Your Dream Website';
  const subheading = content.subheading || 'Create stunning websites';
  const ctaText = content.ctaText || 'Get Started';

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <div
        style={{ ...component.styles, ...highlightStyle, textAlign: 'center', padding: '80px 20px' }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>{heading}</h1>
        <p style={{ fontSize: '20px', marginBottom: '32px', opacity: 0.9 }}>{subheading}</p>
        <button style={{ padding: '16px 32px', fontSize: '18px', fontWeight: '600' }}>{ctaText}</button>
      </div>
    </div>
  );
};
