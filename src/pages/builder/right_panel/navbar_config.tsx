import type { ComponentSchema } from '../../../types/component.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import styles from './style.module.css';

interface NavbarConfigProps {
  component: ComponentSchema;
}

export const NavbarConfig = ({ component }: NavbarConfigProps) => {
  const { updateComponentConfig } = useDraftStore();
  const config = (component as any).config || {};

  return (
    <div className={styles.subsection}>
      <h5>Navbar Configuration</h5>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.showAllPages || false}
            onChange={(e) => updateComponentConfig(component.id, 'showAllPages', e.target.checked)}
          />
          Auto-generate from pages
        </label>
        <p className={styles.helpText}>Automatically show all pages in navigation</p>
      </div>

      {!config.showAllPages && (
        <div className={styles.formGroup}>
          <label>Custom Links</label>
          <p className={styles.helpText}>Manual menu configuration coming soon</p>
        </div>
      )}
    </div>
  );
};
