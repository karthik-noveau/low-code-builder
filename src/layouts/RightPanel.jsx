import React, { useState } from 'react';
import useDraftStore from '../stores/useDraftStore';

const RightPanel = () => {
  const { selectedComponentId, components, updateComponentStyles, siteConfig } = useDraftStore();
  const [activeTab, setActiveTab] = useState('styles'); // 'styles', 'content', 'seo'

  // Ensure components is always an array before using it
  const safeComponents = Array.isArray(components) ? components : [];

  const selectedComponent = safeComponents.find(comp => comp.id === selectedComponentId);

  const handleStyleChange = (styleKey, value) => {
    if (selectedComponentId) {
      updateComponentStyles(selectedComponentId, styleKey, value);
    }
  };

  return (
    <div style={{ padding: '10px' }}>
      <h3>Property Editor</h3>

      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => setActiveTab('styles')} style={{ marginRight: '5px', fontWeight: activeTab === 'styles' ? 'bold' : 'normal' }}>Styles</button>
        <button onClick={() => setActiveTab('content')} style={{ marginRight: '5px', fontWeight: activeTab === 'content' ? 'bold' : 'normal' }}>Content</button>
        <button onClick={() => setActiveTab('seo')} style={{ fontWeight: activeTab === 'seo' ? 'bold' : 'normal' }}>SEO</button>
      </div>

      {selectedComponent ? (
        <div>
          <h4>Editing Component: {selectedComponent.id} ({selectedComponent.type})</h4>
          {activeTab === 'styles' && (
            <div>
              <h5>Styles</h5>
              <div>
                <label>Padding:</label>
                <input
                  type="text"
                  value={selectedComponent.styles.padding || ''}
                  onChange={(e) => handleStyleChange('padding', e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
              <div>
                <label>Font Size:</label>
                <input
                  type="text"
                  value={selectedComponent.styles.fontSize || ''}
                  onChange={(e) => handleStyleChange('fontSize', e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
              <div>
                <label>Text Align:</label>
                <select
                  value={selectedComponent.styles.textAlign || 'left'}
                  onChange={(e) => handleStyleChange('textAlign', e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label>Color:</label>
                <input
                  type="text"
                  value={selectedComponent.styles.color || ''}
                  onChange={(e) => handleStyleChange('color', e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
              <div>
                <label>Background Color:</label>
                <input
                  type="text"
                  value={selectedComponent.styles.backgroundColor || ''}
                  onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
              {/* Add more style properties as needed */}
            </div>
          )}

          {activeTab === 'content' && (
            <div>
              <h5>Content</h5>
              {/* Content editor for selected component */}
              <p>Content editor for {selectedComponent.type} component.</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {activeTab === 'seo' && (
            <div>
              <h4>Site SEO Settings</h4>
              {/* SEO editor for site config */}
              <p>Editing SEO for the entire site.</p>
              <div>
                <label>Title:</label>
                <input
                  type="text"
                  value={siteConfig.title || ''}
                  onChange={(e) => console.log('Update site title', e.target.value)} // Placeholder
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
              <div>
                <label>Description:</label>
                <textarea
                  value={siteConfig.description || ''}
                  onChange={(e) => console.log('Update site description', e.target.value)} // Placeholder
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              </div>
            </div>
          )}
          {!selectedComponent && activeTab !== 'seo' && (
            <p>Select a component or switch to SEO tab to edit site properties.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default RightPanel;
