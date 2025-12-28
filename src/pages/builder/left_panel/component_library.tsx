import { useState } from 'react';
import { getComponentsByCategory, COMPONENT_CATEGORIES } from '../../../common/constants/component_templates';
import { setDraggedComponentType } from '../canvas';
import styles from './style.module.css';

export const ComponentLibrary = () => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Layout: true,
    Blocks: false,
    Basic: false,
    Navigation: false,
  });

  const handleDragStart = (e: React.DragEvent, componentType: string) => {
    console.log('🎯 Left panel drag started:', componentType);
    e.dataTransfer.effectAllowed = 'copy';

    // Set the component type in the module-level variable
    setDraggedComponentType(componentType);

    // Also set in dataTransfer as fallback
    e.dataTransfer.setData('text/plain', componentType);

    // Hide the browser's default drag preview (only show our custom ghost preview)
    const transparentImage = new Image();
    transparentImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(transparentImage, 0, 0);

    console.log('📦 Component type set via module variable');
  };

  const handleDragEnd = () => {
    console.log('🏁 Left panel drag ended');
    setDraggedComponentType(null);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className={styles.librarySection}>
      <h3 className={styles.libraryTitle}>Component Library</h3>
      <div className={styles.libraryContainer}>
        {Object.entries(getComponentsByCategory()).map(([category, componentList]) => (
          <div key={category} className={styles.category}>
            <div
              onClick={() => toggleCategory(category)}
              className={`${styles.categoryHeader} ${expandedCategories[category] ? styles.expanded : ''}`}
            >
              <span>
                {(COMPONENT_CATEGORIES as any)[category.toUpperCase()]?.icon || '📦'} {category}
              </span>
              <span className={styles.categoryIcon}>▶</span>
            </div>

            {expandedCategories[category] && (
              <div className={styles.categoryComponents}>
                {componentList.map(({ key, type, label }) => (
                  <div
                    key={key}
                    draggable="true"
                    onDragStart={(e) => handleDragStart(e, type)}
                    onDragEnd={handleDragEnd}
                    className={styles.componentCard}
                  >
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
