import { useState, useEffect } from 'react';
import type { ComponentSchema } from '../../../types/component.types';
import type { PageSchema } from '../../../types/page.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import { GridPosition } from './grid_position';
import styles from './style.module.css';

interface StylesTabProps {
  selectedComponent: ComponentSchema | null;
  currentPage: PageSchema | null;
}

export const StylesTab = ({ selectedComponent, currentPage }: StylesTabProps) => {
  const { updateComponentStyles, updateComponentProperty } = useDraftStore();
  const [localStyles, setLocalStyles] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (selectedComponent) {
      setLocalStyles(selectedComponent.styles || {});
    } else {
      setLocalStyles({});
    }
  }, [selectedComponent]);

  const handleStyleChange = (styleKey: string, value: string) => {
    setLocalStyles((prev) => ({ ...prev, [styleKey]: value }));
    if (selectedComponent) {
      updateComponentStyles(selectedComponent.id, styleKey, value);
    }
  };

  const isPageLevel = !selectedComponent;
  const targetStyles: any = isPageLevel ? currentPage?.styles || {} : localStyles;

  return (
    <div className={styles.tabContent}>
      <h4 className={styles.sectionTitle}>{isPageLevel ? 'Page Styles' : 'Component Styles'}</h4>

      {selectedComponent && <GridPosition component={selectedComponent} />}

      {/* Layout Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Layout</h5>

        <div className={styles.formGroup}>
          <label>Display</label>
          <select
            value={targetStyles.display || 'block'}
            onChange={(e) => handleStyleChange('display', e.target.value)}
            className={styles.select}
          >
            <option value="block">Block</option>
            <option value="flex">Flex</option>
            <option value="grid">Grid</option>
            <option value="inline-block">Inline Block</option>
          </select>
        </div>

        {targetStyles.display === 'flex' && (
          <>
            <div className={styles.formGroup}>
              <label>Flex Direction</label>
              <select
                value={targetStyles.flexDirection || 'row'}
                onChange={(e) => handleStyleChange('flexDirection', e.target.value)}
                className={styles.select}
              >
                <option value="row">Horizontal</option>
                <option value="column">Vertical</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Align Items</label>
              <select
                value={targetStyles.alignItems || 'flex-start'}
                onChange={(e) => handleStyleChange('alignItems', e.target.value)}
                className={styles.select}
              >
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Justify Content</label>
              <select
                value={targetStyles.justifyContent || 'flex-start'}
                onChange={(e) => handleStyleChange('justifyContent', e.target.value)}
                className={styles.select}
              >
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
                <option value="space-between">Space Between</option>
                <option value="space-around">Space Around</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Gap</label>
              <input
                type="text"
                value={targetStyles.gap || ''}
                onChange={(e) => handleStyleChange('gap', e.target.value)}
                className={styles.input}
                placeholder="10px"
              />
            </div>
          </>
        )}
      </div>

      {/* Size Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Size</h5>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>Width</label>
            <input
              type="text"
              value={targetStyles.width || ''}
              onChange={(e) => handleStyleChange('width', e.target.value)}
              className={styles.input}
              placeholder="auto"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Height</label>
            <input
              type="text"
              value={targetStyles.height || ''}
              onChange={(e) => handleStyleChange('height', e.target.value)}
              className={styles.input}
              placeholder="auto"
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>Max Width</label>
            <input
              type="text"
              value={targetStyles.maxWidth || ''}
              onChange={(e) => handleStyleChange('maxWidth', e.target.value)}
              className={styles.input}
              placeholder="none"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Max Height</label>
            <input
              type="text"
              value={targetStyles.maxHeight || ''}
              onChange={(e) => handleStyleChange('maxHeight', e.target.value)}
              className={styles.input}
              placeholder="none"
            />
          </div>
        </div>
      </div>

      {/* Appearance Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Appearance</h5>

        <div className={styles.formGroup}>
          <label>Background Color</label>
          <div className={styles.colorInput}>
            <input
              type="color"
              value={targetStyles.backgroundColor || '#ffffff'}
              onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
              className={styles.colorPicker}
            />
            <input
              type="text"
              value={targetStyles.backgroundColor || ''}
              onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
              className={styles.input}
              placeholder="#ffffff"
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Text Color</label>
          <div className={styles.colorInput}>
            <input
              type="color"
              value={targetStyles.color || '#000000'}
              onChange={(e) => handleStyleChange('color', e.target.value)}
              className={styles.colorPicker}
            />
            <input
              type="text"
              value={targetStyles.color || ''}
              onChange={(e) => handleStyleChange('color', e.target.value)}
              className={styles.input}
              placeholder="#000000"
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Font Size</label>
          <input
            type="text"
            value={targetStyles.fontSize || ''}
            onChange={(e) => handleStyleChange('fontSize', e.target.value)}
            className={styles.input}
            placeholder="16px"
          />
        </div>

        <div className={styles.formGroup}>
          <label>Font Weight</label>
          <select
            value={targetStyles.fontWeight || 'normal'}
            onChange={(e) => handleStyleChange('fontWeight', e.target.value)}
            className={styles.select}
          >
            <option value="normal">Normal (400)</option>
            <option value="500">Medium (500)</option>
            <option value="600">Semibold (600)</option>
            <option value="bold">Bold (700)</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>Text Align</label>
          <div className={styles.buttonGroup}>
            <button
              className={targetStyles.textAlign === 'left' ? styles.activeButton : styles.button}
              onClick={() => handleStyleChange('textAlign', 'left')}
            >
              Left
            </button>
            <button
              className={targetStyles.textAlign === 'center' ? styles.activeButton : styles.button}
              onClick={() => handleStyleChange('textAlign', 'center')}
            >
              Center
            </button>
            <button
              className={targetStyles.textAlign === 'right' ? styles.activeButton : styles.button}
              onClick={() => handleStyleChange('textAlign', 'right')}
            >
              Right
            </button>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>Border Width</label>
            <input
              type="text"
              value={targetStyles.borderWidth || ''}
              onChange={(e) => handleStyleChange('borderWidth', e.target.value)}
              className={styles.input}
              placeholder="1px"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Border Color</label>
            <input
              type="text"
              value={targetStyles.borderColor || ''}
              onChange={(e) => handleStyleChange('borderColor', e.target.value)}
              className={styles.input}
              placeholder="#ccc"
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Border Radius</label>
          <input
            type="text"
            value={targetStyles.borderRadius || ''}
            onChange={(e) => handleStyleChange('borderRadius', e.target.value)}
            className={styles.input}
            placeholder="0px"
          />
        </div>

        <div className={styles.formGroup}>
          <label>Box Shadow</label>
          <input
            type="text"
            value={targetStyles.boxShadow || ''}
            onChange={(e) => handleStyleChange('boxShadow', e.target.value)}
            className={styles.input}
            placeholder="0 2px 4px rgba(0,0,0,0.1)"
          />
        </div>
      </div>

      {/* Padding Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Padding</h5>

        <div className={styles.spacingGrid}>
          <div className={styles.formGroup}>
            <label>Top</label>
            <input
              type="text"
              value={targetStyles.paddingTop || ''}
              onChange={(e) => handleStyleChange('paddingTop', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Right</label>
            <input
              type="text"
              value={targetStyles.paddingRight || ''}
              onChange={(e) => handleStyleChange('paddingRight', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Bottom</label>
            <input
              type="text"
              value={targetStyles.paddingBottom || ''}
              onChange={(e) => handleStyleChange('paddingBottom', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Left</label>
            <input
              type="text"
              value={targetStyles.paddingLeft || ''}
              onChange={(e) => handleStyleChange('paddingLeft', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>All Sides</label>
          <input
            type="text"
            value={targetStyles.padding || ''}
            onChange={(e) => handleStyleChange('padding', e.target.value)}
            className={styles.input}
            placeholder="10px"
          />
        </div>
      </div>

      {/* Margin Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Margin</h5>

        <div className={styles.spacingGrid}>
          <div className={styles.formGroup}>
            <label>Top</label>
            <input
              type="text"
              value={targetStyles.marginTop || ''}
              onChange={(e) => handleStyleChange('marginTop', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Right</label>
            <input
              type="text"
              value={targetStyles.marginRight || ''}
              onChange={(e) => handleStyleChange('marginRight', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Bottom</label>
            <input
              type="text"
              value={targetStyles.marginBottom || ''}
              onChange={(e) => handleStyleChange('marginBottom', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Left</label>
            <input
              type="text"
              value={targetStyles.marginLeft || ''}
              onChange={(e) => handleStyleChange('marginLeft', e.target.value)}
              className={styles.input}
              placeholder="0px"
            />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>All Sides</label>
          <input
            type="text"
            value={targetStyles.margin || ''}
            onChange={(e) => handleStyleChange('margin', e.target.value)}
            className={styles.input}
            placeholder="0px"
          />
        </div>
      </div>

      {/* Custom CSS Section */}
      <div className={styles.section}>
        <h5 className={styles.subsectionTitle}>Custom CSS</h5>

        <div className={styles.formGroup}>
          <label>Raw CSS Properties</label>
          <textarea
            value={(selectedComponent as any)?.customCSS || ''}
            onChange={(e) =>
              selectedComponent && updateComponentProperty(selectedComponent.id, 'customCSS', e.target.value)
            }
            className={styles.textarea}
            rows={6}
            placeholder="Custom CSS properties..."
            disabled={!selectedComponent}
          />
          <p className={styles.helpText}>Add custom CSS properties (experimental)</p>
        </div>
      </div>
    </div>
  );
};
