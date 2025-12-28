import type { ComponentType, ComponentSchema } from './component.types';

export interface ComponentTemplate {
  type: ComponentType;
  label: string;
  category: 'Layout' | 'Blocks' | 'Basic' | 'Navigation';
  defaultProps: Partial<ComponentSchema>;
}

export type ComponentTemplateMap = Record<ComponentType, ComponentTemplate>;
