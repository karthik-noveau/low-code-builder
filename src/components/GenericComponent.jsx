import React, { useState } from 'react';
import useDraftStore from '../stores/useDraftStore';

const GenericComponent = ({ component, index, pageId }) => {
  const { type, content, styles, id } = component;
  const { selectedComponentId, setSelectedComponentId, updateComponentContent, reorderComponents } = useDraftStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  const isSelected = selectedComponentId === id;

  const handleClick = (e) => {
    e.stopPropagation(); // Prevent event bubbling to parent components
    setSelectedComponentId(id);
  };

  const handleDoubleClick = () => {
    if (type === 'TEXT' && isSelected) {
      setIsEditing(true);
    }
  };

  const handleChange = (e) => {
    setEditedContent(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateComponentContent(id, editedContent);
  };

  const highlightStyle = isSelected ? {
    outline: '2px solid blue',
    outlineOffset: '2px',
    cursor: 'pointer',
  } : {
    cursor: 'pointer',
  };

  // Drag and Drop Handlers
  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('componentId', id);
    e.dataTransfer.setData('sourceIndex', index);
    e.dataTransfer.setData('pageId', pageId); // Pass pageId for reordering
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedComponentId = e.dataTransfer.getData('componentId');
    const sourceIndex = parseInt(e.dataTransfer.getData('sourceIndex'), 10);
    const draggedPageId = e.dataTransfer.getData('pageId');

    if (draggedPageId === pageId && draggedComponentId !== id) { // Ensure same page and not dropping on itself
      const destinationIndex = index; // Dropping before this component
      reorderComponents(pageId, sourceIndex, destinationIndex);
    }
  };


  switch (type) {
    case 'TEXT':
      return (
        <p
          style={{ ...styles, ...highlightStyle }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          draggable="true"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isEditing ? (
            <input
              type="text"
              value={editedContent}
              onChange={handleChange}
              onBlur={handleBlur}
              autoFocus
              style={{ width: '100%', border: 'none', background: 'transparent', ...styles }}
            />
          ) : (
            content
          )}
        </p>
      );
    case 'LINK': // New case for LINK
      return (
        <a
          href={component.href}
          style={{ ...styles, ...highlightStyle }}
          onClick={handleClick}
          draggable="true"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {content}
        </a>
      );
    case 'BUTTON':
      return (
        <button
          style={{ ...styles, ...highlightStyle }}
          onClick={handleClick}
          draggable="true"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {content}
        </button>
      );
    default:
      return (
        <div
          style={{ ...styles, ...highlightStyle }}
          onClick={handleClick}
          draggable="true"
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          Unknown Component Type: {type}
        </div>
      );
  }
};

export default GenericComponent;

