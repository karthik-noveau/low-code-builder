import { useState } from 'react';
import { useDraftStore } from '../../../stores/use_draft_store';
import { GeneralTab } from './general_tab';
import { StylesTab } from './styles_tab';
import styles from './style.module.css';

export const RightPanel = () => {
  const { selectedComponentId, components, pages, activePageId } = useDraftStore();
  const [activeTab, setActiveTab] = useState<'general' | 'styles'>('general');

  const safeComponents = Array.isArray(components) ? components : [];
  const selectedComponent = safeComponents.find((comp) => comp.id === selectedComponentId) || null;
  const currentPage = pages.find((p) => p.id === activePageId) || null;

  return (
    <div className={styles.rightPanel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{selectedComponent ? 'Component Properties' : 'Page Configuration'}</h3>
      </div>

      <div className={styles.tabs}>
        <button
          className={activeTab === 'general' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button className={activeTab === 'styles' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('styles')}>
          Styles
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'general' && <GeneralTab selectedComponent={selectedComponent} currentPage={currentPage} />}
        {activeTab === 'styles' && <StylesTab selectedComponent={selectedComponent} currentPage={currentPage} />}
      </div>
    </div>
  );
};
