import { useDraftStore } from '../../../stores/use_draft_store';
import { PageList } from './page_list';
import { ComponentLibrary } from './component_library';
import styles from './style.module.css';

export const LeftPanel = () => {
  const { pages, components, activePageId, selectedComponentId, setSelectedComponentId } = useDraftStore();

  const safePages = Array.isArray(pages) ? pages : [];
  const currentPage = safePages.find((page) => page.id === activePageId);

  const handleComponentClick = (id: string) => {
    setSelectedComponentId(id);
  };

  return (
    <div className={styles.leftPanel} onClick={(e) => e.stopPropagation()}>
      <PageList />

      <div className={styles.componentSection}>
        <h3>Components</h3>
        <ul className={styles.componentList}>
          {currentPage &&
            currentPage.children &&
            currentPage.children.map((componentId) => {
              const component = components.find((comp) => comp.id === componentId);
              if (!component) return null;
              return (
                <li
                  key={component.id}
                  onClick={() => handleComponentClick(component.id)}
                  className={`${styles.componentItem} ${selectedComponentId === component.id ? styles.selected : ''}`}
                >
                  {component.type} - {component.id}
                </li>
              );
            })}
        </ul>

        <ComponentLibrary />
      </div>
    </div>
  );
};
