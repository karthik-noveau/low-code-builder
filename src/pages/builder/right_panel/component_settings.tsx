import { useState } from 'react';
import type { ComponentSchema } from '../../../types/component.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import { AssetManager } from '../../../common/components/asset_manager';
import { NavbarConfig } from './navbar_config';
import { ColumnLayoutConfig } from './column_layout_config';
import styles from './style.module.css';

interface ComponentSettingsProps {
  component: ComponentSchema;
}

export const ComponentSettings = ({ component }: ComponentSettingsProps) => {
  const { updateComponentContent, updateComponentProperty, deleteComponent } = useDraftStore();
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);

  const renderComponentContent = () => {
    const type = component.type;

    switch (type) {
      case 'TEXT':
      case 'HEADING':
        return (
          <div className={styles.formGroup}>
            <label>Text Content</label>
            <textarea
              value={component.content || ''}
              onChange={(e) => updateComponentContent(component.id, e.target.value)}
              className={styles.textarea}
              rows={4}
            />
          </div>
        );

      case 'BUTTON':
        return (
          <>
            <div className={styles.formGroup}>
              <label>Button Label</label>
              <input
                type="text"
                value={component.content || ''}
                onChange={(e) => updateComponentContent(component.id, e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Link/Action</label>
              <input
                type="text"
                value={(component as any).href || ''}
                onChange={(e) => updateComponentProperty(component.id, 'href', e.target.value)}
                className={styles.input}
                placeholder="#"
              />
            </div>
          </>
        );

      case 'LINK':
        return (
          <>
            <div className={styles.formGroup}>
              <label>Link Text</label>
              <input
                type="text"
                value={component.content || ''}
                onChange={(e) => updateComponentContent(component.id, e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>URL or Page</label>
              <input
                type="text"
                value={(component as any).href || ''}
                onChange={(e) => updateComponentProperty(component.id, 'href', e.target.value)}
                className={styles.input}
                placeholder="/page or https://..."
              />
            </div>
          </>
        );

      case 'IMAGE':
        return (
          <>
            <div className={styles.formGroup}>
              <label>Image Source</label>
              <div className={styles.imageControls}>
                <input
                  type="text"
                  value={(component as any).src || ''}
                  onChange={(e) => updateComponentProperty(component.id, 'src', e.target.value)}
                  className={styles.input}
                  placeholder="URL or select from assets"
                />
                <button onClick={() => setIsAssetManagerOpen(true)} className={styles.assetButton}>
                  Browse
                </button>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Alt Text (SEO Required)</label>
              <input
                type="text"
                value={(component as any).alt || ''}
                onChange={(e) => updateComponentProperty(component.id, 'alt', e.target.value)}
                className={styles.input}
                placeholder="Describe the image"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.tabContent}>
      <h4 className={styles.sectionTitle}>Component Settings</h4>

      <div className={styles.formGroup}>
        <label>ID</label>
        <input
          type="text"
          value={component.id}
          disabled
          className={styles.input}
          title="Component ID (read-only)"
        />
      </div>

      <div className={styles.formGroup}>
        <label>Type</label>
        <input type="text" value={component.type} disabled className={styles.input} />
      </div>

      {renderComponentContent()}

      {component.type === 'NAVBAR' && <NavbarConfig component={component} />}

      {component.type === 'COLUMN_LAYOUT' && <ColumnLayoutConfig component={component} />}

      <button
        onClick={() => {
          if (window.confirm('Delete this component?')) {
            deleteComponent(component.id);
          }
        }}
        className={styles.deleteButton}
      >
        Delete Component
      </button>

      <AssetManager
        isOpen={isAssetManagerOpen}
        onClose={() => setIsAssetManagerOpen(false)}
        onSelectAsset={(asset) => {
          updateComponentProperty(component.id, 'src', asset.data);
        }}
      />
    </div>
  );
};
