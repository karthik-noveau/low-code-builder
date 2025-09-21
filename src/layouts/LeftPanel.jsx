import React, { useState } from 'react';
import useDraftStore from '../stores/useDraftStore';

const LeftPanel = () => {
  const { pages, components, selectedComponentId, setSelectedComponentId, addPage, activePageId, setActivePageId } = useDraftStore();
  const [newPageName, setNewPageName] = useState('');

  const safePages = Array.isArray(pages) ? pages : [];

  // Find the current active page
  const currentPage = safePages.find(page => page.id === activePageId);

  const handleComponentClick = (id) => {
    setSelectedComponentId(id);
  };

  const handlePageClick = (id) => {
    setActivePageId(id);
    setSelectedComponentId(null);
  };

  const handleDragStart = (e, componentType) => {
    e.dataTransfer.setData('componentType', componentType);
  };

  const handleAddPage = () => {
    addPage(newPageName);
    setNewPageName('');
  };

  return (
    <div style={{ padding: '10px' }}>
      <h3>Pages</h3>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="New page name"
          value={newPageName}
          onChange={(e) => setNewPageName(e.target.value)}
          style={{ marginRight: '5px', padding: '5px' }}
        />
        <button onClick={handleAddPage}>Add Page</button>
      </div>
      <ul>
        {safePages.map((page) => (
          <li
            key={page.id}
            onClick={() => handlePageClick(page.id)}
            style={{
              fontWeight: page.id === activePageId ? 'bold' : 'normal',
              cursor: 'pointer',
              backgroundColor: page.id === activePageId ? '#e0e0e0' : 'transparent',
              padding: '5px',
              borderRadius: '3px',
              marginBottom: '2px',
            }}
          >
            {page.name}
          </li>
        ))}
      </ul>

      <h3>Components</h3>
      <ul>
        {currentPage && currentPage.children && currentPage.children.map((componentId) => {
          const component = components.find(comp => comp.id === componentId);
          if (!component) return null;
          return (
            <li
              key={component.id}
              onClick={() => handleComponentClick(component.id)}
              style={{
                cursor: 'pointer',
                backgroundColor: selectedComponentId === component.id ? '#e0e0e0' : 'transparent',
                padding: '5px',
                borderRadius: '3px',
                marginBottom: '2px',
              }}
            >
            {component.type} - {component.id}
            </li>
          );
        })}
      </ul>

      <h3 style={{ marginTop: '20px' }}>Component Palette</h3>
      <div style={{ border: '1px solid #eee', padding: '10px', borderRadius: '5px' }}>
        <div
          draggable="true"
          onDragStart={(e) => handleDragStart(e, 'TEXT')}
          style={{ padding: '8px', border: '1px solid #ccc', marginBottom: '5px', backgroundColor: '#f9f9f9', cursor: 'grab' }}
        >
          Text Block
        </div>
        <div
          draggable="true"
          onDragStart={(e) => handleDragStart(e, 'LINK')} // Changed from IMAGE to LINK
          style={{ padding: '8px', border: '1px solid #ccc', marginBottom: '5px', backgroundColor: '#f9f9f9', cursor: 'grab' }}
        >
          Link
        </div>
        <div
          draggable="true"
          onDragStart={(e) => handleDragStart(e, 'BUTTON')}
          style={{ padding: '8px', border: '1px solid #ccc', marginBottom: '5px', backgroundColor: '#f9f9f9', cursor: 'grab' }}
        >
          Button
        </div>
        {/* Add more component types here */}
      </div>
    </div>
  );
};

export default LeftPanel;

