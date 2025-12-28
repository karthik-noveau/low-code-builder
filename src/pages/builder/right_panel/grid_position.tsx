import type { ComponentSchema } from '../../../types/component.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import styles from './style.module.css';

interface GridPositionProps {
  component: ComponentSchema;
}

export const GridPosition = ({ component }: GridPositionProps) => {
  const { updateComponentPosition } = useDraftStore();
  const position = component.position || { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 };

  return (
    <div className={styles.section}>
      <h5 className={styles.subsectionTitle}>Grid Position</h5>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Column Start</label>
          <input
            type="number"
            min="1"
            max="12"
            value={position.colStart || 1}
            onChange={(e) => updateComponentPosition(component.id, { colStart: parseInt(e.target.value) })}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Column Span</label>
          <input
            type="number"
            min="1"
            max="12"
            value={position.colSpan || 12}
            onChange={(e) => updateComponentPosition(component.id, { colSpan: parseInt(e.target.value) })}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label>Row Start</label>
          <input
            type="number"
            min="1"
            value={position.rowStart || 1}
            onChange={(e) => updateComponentPosition(component.id, { rowStart: parseInt(e.target.value) })}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Row Span</label>
          <input
            type="number"
            min="1"
            max="10"
            value={position.rowSpan || 1}
            onChange={(e) => updateComponentPosition(component.id, { rowSpan: parseInt(e.target.value) })}
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.infoBox}>
        Width: {position.colSpan || 12} / 12 columns ({Math.round(((position.colSpan || 12) / 12) * 100)}%)
        <br />
        Height: {(position.rowSpan || 1) * 60}px
      </div>
    </div>
  );
};
