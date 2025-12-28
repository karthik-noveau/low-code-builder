import type { ComponentRendererProps } from './types';
import { ComponentToolbar } from './component_toolbar';
import { setDraggedComponentId, hideDragPreview } from './index';
import { useDraftStore } from '../../../stores';
import styles from './style.module.css';

export const NavbarComponent = ({ component, index, pageId, isSelected, onSelect, onDuplicate, onDelete}: ComponentRendererProps) => {
  const { pages, activePageId, setActivePageId } = useDraftStore();
  const navConfig = (component as any).config || { showAllPages: true, selectedPageIds: [], customLinks: [] };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(component.id);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('componentId', component.id);
    e.dataTransfer.setData('sourceIndex', index.toString());
    e.dataTransfer.setData('pageId', pageId);
    setDraggedComponentId(component.id, component.type);
    hideDragPreview(e);  };

  const handleDragEnd = () => {
    setDraggedComponentId(null, null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedComponentId = e.dataTransfer.getData('componentId');
    const draggedPageId = e.dataTransfer.getData('pageId');

    if (draggedPageId === pageId && draggedComponentId !== component.id) {
    }
  };

  const highlightStyle = isSelected
    ? { outline: '2px solid #4F46E5', outlineOffset: '2px', cursor: 'pointer' }
    : { cursor: 'pointer' };

  // Determine which pages to show
  const displayPages = navConfig.showAllPages
    ? pages
    : navConfig.selectedPageIds.map((id: string) => pages.find(p => p.id === id)).filter(Boolean);

  return (
    <div className={`${styles.componentWrapper} ${isSelected ? styles.selected : ''}`}>
      {isSelected && <ComponentToolbar onDuplicate={() => onDuplicate(component.id)} onDelete={() => onDelete(component.id)} />}
      <nav
        style={{ ...component.styles, ...highlightStyle }}
        onClick={handleClick}
        draggable="true"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {displayPages.map((page: any) => (
          <a
            key={page.id}
            href={page.slug}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActivePageId(page.id);
            }}
            style={{
              color: activePageId === page.id ? '#FCD34D' : '#fff',
              textDecoration: 'none',
              fontWeight: activePageId === page.id ? 'bold' : 'normal',
              cursor: 'pointer',
            }}
          >
            {page.name}
          </a>
        ))}
        {navConfig.customLinks &&
          navConfig.customLinks.map((link: any, idx: number) => (
            <a
              key={`custom-${idx}`}
              href={link.url}
              style={{
                color: '#fff',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {link.label}
            </a>
          ))}
      </nav>
    </div>
  );
};
