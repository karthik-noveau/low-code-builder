import React from 'react';
import useDraftStore from '../stores/useDraftStore';
import GenericComponent from '../components/GenericComponent';

const PageRenderer = () => {
  const { pages, components, reorderComponents, addComponent, activePageId } = useDraftStore();

  // Find the active page
  const currentPage = pages.find(page => page.id === activePageId);

  if (!currentPage) {
    return <div>No page selected or found.</div>;
  }

  const renderableComponents = currentPage.children
    .map(componentId => components.find(comp => comp.id === componentId))
    .filter(Boolean); // Filter out any undefined components

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const componentType = e.dataTransfer.getData('componentType'); // Check for new component type
    const draggedComponentId = e.dataTransfer.getData('componentId'); // Check for existing component ID
    const sourceIndex = parseInt(e.dataTransfer.getData('sourceIndex'), 10);
    const draggedPageId = e.dataTransfer.getData('pageId');

    const dropTargetIndex = renderableComponents.length; // Default to dropping at the end

    if (componentType) {
      // Dropping a new component from the palette
      addComponent(currentPage.id, componentType, dropTargetIndex);
    } else if (draggedComponentId && draggedPageId === currentPage.id) {
      // Reordering an existing component
      if (sourceIndex !== dropTargetIndex) {
        reorderComponents(currentPage.id, sourceIndex, dropTargetIndex);
      }
    }
  };

  return (
    <div
      style={{ padding: '20px', border: '1px dashed #ccc', minHeight: '100%' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {renderableComponents.length > 0 ? (
        renderableComponents.map((component, index) => (
          <GenericComponent
            key={component.id}
            component={component}
            index={index} // Pass index
            pageId={currentPage.id} // Pass pageId
          />
        ))
      ) : (
        <p>Drag and drop components here to start building your page!</p>
      )}
    </div>
  );
};

export default PageRenderer;
