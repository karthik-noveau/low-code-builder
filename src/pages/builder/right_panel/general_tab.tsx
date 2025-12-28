import type { ComponentSchema } from '../../../types/component.types';
import type { PageSchema } from '../../../types/page.types';
import { ComponentSettings } from './component_settings';
import { PageSettings } from './page_settings';

interface GeneralTabProps {
  selectedComponent: ComponentSchema | null;
  currentPage: PageSchema | null;
}

export const GeneralTab = ({ selectedComponent, currentPage }: GeneralTabProps) => {
  if (selectedComponent) {
    return <ComponentSettings component={selectedComponent} />;
  } else if (currentPage) {
    return <PageSettings page={currentPage} />;
  }

  return null;
};
