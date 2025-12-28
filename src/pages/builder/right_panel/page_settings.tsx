import type { PageSchema } from '../../../types/page.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import styles from './style.module.css';

interface PageSettingsProps {
  page: PageSchema;
}

export const PageSettings = ({ page }: PageSettingsProps) => {
  const { updatePageMetadata } = useDraftStore();
  const metadata = page.metadata || {};

  return (
    <div className={styles.tabContent}>
      <h4 className={styles.sectionTitle}>Page SEO Configuration</h4>

      <div className={styles.formGroup}>
        <label>Page Title</label>
        <input
          type="text"
          value={metadata.title || ''}
          onChange={(e) => updatePageMetadata(page.id, 'title', e.target.value)}
          className={styles.input}
          placeholder="Home - My Site"
        />
        <p className={styles.helpText}>Shown in browser tab and search results</p>
      </div>

      <div className={styles.formGroup}>
        <label>Meta Description</label>
        <textarea
          value={metadata.description || ''}
          onChange={(e) => updatePageMetadata(page.id, 'description', e.target.value)}
          className={styles.textarea}
          rows={3}
          placeholder="Brief description for search engines..."
        />
        <p className={styles.helpText}>Max 160 characters recommended</p>
      </div>

      <div className={styles.formGroup}>
        <label>Slug (URL Path)</label>
        <input
          type="text"
          value={metadata.slug || page.slug || '/'}
          onChange={(e) => updatePageMetadata(page.id, 'slug', e.target.value)}
          className={styles.input}
          placeholder="/about"
        />
        <p className={styles.helpText}>URL path for this page</p>
      </div>

      <div className={styles.formGroup}>
        <label>Keywords (comma-separated)</label>
        <input
          type="text"
          value={metadata.keywords || ''}
          onChange={(e) => updatePageMetadata(page.id, 'keywords', e.target.value)}
          className={styles.input}
          placeholder="website builder, no-code, design"
        />
      </div>

      <div className={styles.section} style={{ marginTop: '24px' }}>
        <h4 className={styles.sectionTitle}>Code Injection (Advanced)</h4>

        <div className={styles.formGroup}>
          <label>Head Scripts</label>
          <textarea
            value={metadata.headScripts || ''}
            onChange={(e) => updatePageMetadata(page.id, 'headScripts', e.target.value)}
            className={styles.textarea}
            rows={4}
            placeholder="<!-- Google Tag Manager, verification codes, etc. -->"
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p className={styles.helpText}>
            Injected into {'<head>'} section. Use for: Google Tag Manager, Search Console verification, meta tags
          </p>
        </div>

        <div className={styles.formGroup}>
          <label>Body Start Scripts</label>
          <textarea
            value={metadata.bodyStartScripts || ''}
            onChange={(e) => updatePageMetadata(page.id, 'bodyStartScripts', e.target.value)}
            className={styles.textarea}
            rows={4}
            placeholder="<!-- Scripts to run at body start -->"
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p className={styles.helpText}>Injected right after {'<body>'} opening tag</p>
        </div>

        <div className={styles.formGroup}>
          <label>Body End Scripts</label>
          <textarea
            value={metadata.bodyEndScripts || ''}
            onChange={(e) => updatePageMetadata(page.id, 'bodyEndScripts', e.target.value)}
            className={styles.textarea}
            rows={4}
            placeholder="<!-- Google Analytics, tracking scripts, etc. -->"
            style={{ fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p className={styles.helpText}>
            Injected before {'</body>'} closing tag. Use for: Analytics, chat widgets, tracking pixels
          </p>
        </div>
      </div>
    </div>
  );
};
