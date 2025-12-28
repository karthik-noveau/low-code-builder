import { memo } from 'react';
import type { ComponentSchema } from '../../../types/component.types';
import { useDraftStore } from '../../../stores/use_draft_store';
import { setDraggedComponentId } from '../canvas';
import { TextComponent } from './text_component';
import { HeadingComponent } from './heading_component';
import { ButtonComponent } from './button_component';
import { LinkComponent } from './link_component';
import { ImageComponent } from './image_component';
import { NavbarComponent } from './navbar_component';
import { ContainerComponent } from './container_component';
import { GridComponent } from './grid_component';
import { SectionComponent } from './section_component';
import { ColumnLayoutComponent } from './column_layout_component';
import { HeroComponent } from './hero_component';
import { CardComponent } from './card_component';
import { FormComponent } from './form_component';
import { FooterComponent } from './footer_component';

// Export helper for drag handlers
export { setDraggedComponentId };

// Helper to hide the browser's default drag preview
export const hideDragPreview = (e: React.DragEvent) => {
  const transparentImage = new Image();
  transparentImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  e.dataTransfer.setDragImage(transparentImage, 0, 0);
};

interface GenericComponentProps {
  component: ComponentSchema;
  index: number;
  pageId: string;
}

const GenericComponentInner = ({ component, index, pageId }: GenericComponentProps) => {
  const {
    selectedComponentId,
    setSelectedComponentId,
    updateComponentContent,
    deleteComponent,
    duplicateComponent,
  } = useDraftStore();

  const isSelected = selectedComponentId === component.id;

  const handleSelect = (id: string) => {
    setSelectedComponentId(id);
  };

  const handleDuplicate = (id: string) => {
    duplicateComponent(id);
  };

  const handleDelete = (id: string) => {
    deleteComponent(id);
  };

  const handleUpdateContent = (id: string, content: string) => {
    updateComponentContent(id, content);
  };

  const sharedProps = {
    component,
    index,
    pageId,
    isSelected,
    onSelect: handleSelect,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onUpdateContent: handleUpdateContent,
  };

  switch (component.type) {
    case 'TEXT':
      return <TextComponent {...sharedProps} />;
    case 'HEADING':
      return <HeadingComponent {...sharedProps} />;
    case 'BUTTON':
      return <ButtonComponent {...sharedProps} />;
    case 'LINK':
      return <LinkComponent {...sharedProps} />;
    case 'IMAGE':
      return <ImageComponent {...sharedProps} />;
    case 'NAVBAR':
      return <NavbarComponent {...sharedProps} />;
    case 'CONTAINER':
      return <ContainerComponent {...sharedProps} />;
    case 'GRID':
      return <GridComponent {...sharedProps} />;
    case 'SECTION':
      return <SectionComponent {...sharedProps} />;
    case 'COLUMN_LAYOUT':
      return <ColumnLayoutComponent {...sharedProps} />;
    case 'HERO':
      return <HeroComponent {...sharedProps} />;
    case 'CARD':
      return <CardComponent {...sharedProps} />;
    case 'FORM':
      return <FormComponent {...sharedProps} />;
    case 'FOOTER':
      return <FooterComponent {...sharedProps} />;
    default: {
      // Type assertion needed because TypeScript considers this unreachable
      const unknownComponent = component as ComponentSchema;
      return (
        <div
          style={{ padding: '20px', border: '2px solid red', cursor: 'pointer' }}
          onClick={() => handleSelect(unknownComponent.id)}
        >
          Unknown Component Type: {unknownComponent.type}
        </div>
      );
    }
  }
};

/**
 * Memoized Generic Component
 * Uses custom comparison to prevent unnecessary re-renders during drag operations
 * Only re-renders when component data actually changes
 */
export const GenericComponent = memo(
  GenericComponentInner,
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if truly changed
    return (
      prevProps.component.id === nextProps.component.id &&
      prevProps.component.type === nextProps.component.type &&
      JSON.stringify(prevProps.component.position) === JSON.stringify(nextProps.component.position) &&
      JSON.stringify(prevProps.component.styles) === JSON.stringify(nextProps.component.styles) &&
      prevProps.component.content === nextProps.component.content &&
      prevProps.index === nextProps.index &&
      prevProps.pageId === nextProps.pageId
    );
  }
);
