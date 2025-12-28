import { useState } from 'react';
import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import styles from './style.module.css';

export const TextComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete, onUpdateContent}: ComponentRendererProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(component.content || '');

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  const handleDoubleClick = () => {
    if (isSelected) {
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    onUpdateContent(component.id, editedContent);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('componentId', component.id);
    e.dataTransfer.setData('sourceIndex', index.toString());
    e.dataTransfer.setData('pageId', pageId);
    setDraggedComponentId(component.id, component.type);
    hideDragPreview(e);
  };

  const handleDragEnd = () => {
    setDraggedComponentId(null, null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedComponentId = e.dataTransfer.getData('componentId');
    const draggedPageId = e.dataTransfer.getData('pageId');

    if (draggedPageId === pageId && draggedComponentId !== component.id) {
    }
  };

  const highlightStyle = isSelected
    ? { outline: '2px solid #4F46E5', outlineOffset: '2px', cursor: 'pointer' }
    : { cursor: 'pointer' };

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <p
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isEditing ? (
          <input
            type="text"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            style={{ width: '100%', border: 'none', background: 'transparent', ...component.styles }}
          />
        ) : (
          component.content
        )}
      </p>
    </div>
  );
};
