import type { ComponentSchema } from '../../../types/component.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import styles from './style.module.css';

interface ColumnLayoutConfigProps {
  component: ComponentSchema;
}

export const ColumnLayoutConfig = ({ component }: ColumnLayoutConfigProps) => {
  const { updateComponentConfig, updateComponentProperty } = useDraftStore();
  const config = (component as any).config || {};

  const handleColumnChange = (columns: number) => {
    updateComponentConfig(component.id, 'columns', columns);
    const children = (component as any).children || [];
    const newChildren = Array.from({ length: columns }, (_, i) => children[i] || []);
    updateComponentProperty(component.id, 'children', newChildren);
  };

  return (
    <div className={styles.subsection}>
      <h5>Column Layout Settings</h5>

      <div className={styles.formGroup}>
        <label>Number of Columns</label>
        <div className={styles.buttonGroup}>
          <button
            className={config.columns === 2 ? styles.activeButton : styles.button}
            onClick={() => handleColumnChange(2)}
          >
            2 Columns
          </button>
          <button
            className={config.columns === 3 ? styles.activeButton : styles.button}
            onClick={() => handleColumnChange(3)}
          >
            3 Columns
          </button>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label>Gap</label>
        <input
          type="text"
          value={config.gap || '20px'}
          onChange={(e) => updateComponentConfig(component.id, 'gap', e.target.value)}
          className={styles.input}
          placeholder="20px"
        />
      </div>
    </div>
  );
};
