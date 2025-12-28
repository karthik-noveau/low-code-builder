import { useState } from 'react';
import { useDraftStore } from '../../../stores/use_draft_store';
import { buildPreviewHtml, buildOptimizedSPA } from '../../../common/utils/build_site';
import { useToast } from '../../../common/components/toast_container';
import styles from './style.module.css';

export const TopBar = () => {
  const toast = useToast();
  const {
    undo,
    redo,
    history,
    pages,
    components,
    siteConfig,
    assets,
    devicePreview,
    setDevicePreview,
    viewMode,
    setViewMode,
  } = useDraftStore();

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const [_isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const draftData = { pages, components, assets, siteConfig };
      const zipBlob = await buildOptimizedSPA(draftData);

      (window as any).generatedSiteZip = zipBlob;

      toast.success(
        '🚀 Production site generated! Shopify-level SEO with pre-rendered HTML. Ready to export!',
        4000
      );
    } catch (error) {
      console.error('Error generating site:', error);
      toast.error('Error generating site. Check console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async () => {
    try {
      await handleGenerate();
      const draftData = { pages, components, assets, siteConfig };
      const previewHtml = buildPreviewHtml(draftData);

      const blob = new Blob([previewHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      window.open(url, '_blank');
      toast.info(
        'Preview opened (using hash routing for demo). Full export has separate HTML files with powerful SEO.',
        5000
      );

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error creating preview:', error);
      toast.error('Error creating preview. Check console for details.');
    }
  };

  const handleExport = async () => {
    await handleGenerate();

    if (!(window as any).generatedSiteZip) {
      toast.warning('Please generate the site first by clicking the Generate button.');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL((window as any).generatedSiteZip);
      link.download = 'website-export.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        '🎉 Production site exported! Pre-rendered HTML, JSON-LD schemas, Open Graph tags. Perfect for SEO!',
        5000
      );
    } catch (error) {
      console.error('Error saving site:', error);
      toast.error('Error saving site. Check console for details.');
    }
  };

  const handleImport = () => {
    toast.info('Import feature coming soon! You can manually restore your draft from localStorage.');
  };

  const handleResetDraft = () => {
    if (confirm('⚠️ This will clear all your changes and reload with fresh data. Continue?')) {
      localStorage.removeItem('draft-storage');
      toast.info('Draft cleared! Reloading...');
      setTimeout(() => window.location.reload(), 500);
    }
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.leftActions}>
        <div className={styles.viewModeToggle}>
          <button
            onClick={() => setViewMode('visual')}
            className={`${styles.viewModeButton} ${viewMode === 'visual' ? styles.active : ''}`}
          >
            📐 Visual
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`${styles.viewModeButton} ${viewMode === 'code' ? styles.active : ''}`}
          >
            💻 Code
          </button>
        </div>

        <div className={styles.divider}></div>

        <button onClick={undo} disabled={!canUndo} className={styles.button} style={{ opacity: canUndo ? 1 : 0.5 }}>
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} className={styles.button} style={{ opacity: canRedo ? 1 : 0.5 }}>
          Redo
        </button>

        <button onClick={handleResetDraft} className={styles.buttonSecondary} title="Clear cache and reload with fresh data">
          🔄 Reset Draft
        </button>

        <button onClick={handleImport} className={styles.buttonSecondary}>
          Import
        </button>
      </div>

      <div className={styles.rightActions}>
        <div className={styles.deviceSelector}>
          <label className={styles.deviceLabel}>Device:</label>
          <select
            value={devicePreview}
            onChange={(e) => setDevicePreview(e.target.value as 'desktop' | 'tablet' | 'mobile')}
            className={styles.deviceSelect}
          >
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>

        <button onClick={handlePreview} className={styles.buttonSuccess} title="Preview in browser (hash routing for demo)">
          Preview
        </button>

        <button
          onClick={handleExport}
          className={styles.buttonPrimary}
          title="Download production site with Shopify-level SEO (pre-rendered HTML, JSON-LD, Open Graph)"
        >
          Export build
        </button>
      </div>
    </div>
  );
};
