import { useState } from 'react';
import { useDraftStore } from '../../../stores/use_draft_store';
import { useToast } from '../../../common/components/toast_container';
import styles from './style.module.css';

export const PageList = () => {
  const { pages, activePageId, setActivePageId, addPage, deletePage, renamePage, setSelectedComponentId } =
    useDraftStore();
  const toast = useToast();
  const [newPageName, setNewPageName] = useState('');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState('');

  const safePages = Array.isArray(pages) ? pages : [];

  const handlePageClick = (id: string) => {
    setActivePageId(id);
    setSelectedComponentId(null);
  };

  const handleAddPage = () => {
    if (newPageName.trim()) {
      addPage(newPageName);
      setNewPageName('');
    }
  };

  const handleStartRename = (pageId: string, pageName: string) => {
    setEditingPageId(pageId);
    setEditingPageName(pageName);
  };

  const handleFinishRename = () => {
    if (editingPageId && editingPageName.trim()) {
      renamePage(editingPageId, editingPageName.trim());
    }
    setEditingPageId(null);
    setEditingPageName('');
  };

  const handleDeletePage = (pageId: string) => {
    if (safePages.length <= 1) {
      toast.warning('Cannot delete the last page');
      return;
    }
    deletePage(pageId);
    toast.success('Page deleted successfully');
  };

  return (
    <div className={styles.pageSection}>
      <h3>Pages</h3>
      <div className={styles.addPageForm}>
        <input
          type="text"
          placeholder="New page name"
          value={newPageName}
          onChange={(e) => setNewPageName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddPage()}
          className={styles.addPageInput}
        />
        <button onClick={handleAddPage} className={styles.addPageButton}>
          Add Page
        </button>
      </div>
      <ul className={styles.pageList}>
        {safePages.map((page) => (
          <li
            key={page.id}
            className={`${styles.pageItem} ${page.id === activePageId ? styles.active : ''}`}
          >
            {editingPageId === page.id ? (
              <input
                type="text"
                value={editingPageName}
                onChange={(e) => setEditingPageName(e.target.value)}
                onBlur={handleFinishRename}
                onKeyPress={(e) => e.key === 'Enter' && handleFinishRename()}
                autoFocus
                className={styles.pageRenameInput}
              />
            ) : (
              <>
                <span onClick={() => handlePageClick(page.id)} className={styles.pageName}>
                  {page.name}
                </span>
                <div className={styles.pageActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(page.id, page.name);
                    }}
                    className={styles.pageActionButton}
                    title="Rename page"
                  >
                    ✏️
                  </button>
                  {safePages.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePage(page.id);
                      }}
                      className={`${styles.pageActionButton} ${styles.danger}`}
                      title="Delete page"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
