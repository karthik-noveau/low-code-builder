import type { CSSProperties } from 'react';

// Component type enums
export type ComponentType =
  | 'TEXT'
  | 'HEADING'
  | 'BUTTON'
  | 'LINK'
  | 'IMAGE'
  | 'CONTAINER'
  | 'GRID'
  | 'SECTION'
  | 'COLUMN_LAYOUT'
  | 'NAVBAR'
  | 'FOOTER'
  | 'HERO'
  | 'CARD'
  | 'FORM';

// Position/Grid system
export interface GridPosition {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export interface ResponsiveConfig {
  desktop?: Partial<GridPosition>;
  tablet?: Partial<GridPosition>;
  mobile?: Partial<GridPosition>;
}

// Component configuration objects
export interface NavbarConfig {
  showAllPages: boolean;
  selectedPageIds: string[];
  customLinks: Array<{ label: string; url: string }>;
  logo?: string;
}

export interface ColumnLayoutConfig {
  columns: 2 | 3;
  columnRatios?: number[];
  gap?: string;
  alignItems?: string;
}

export interface FormField {
  type: 'text' | 'email' | 'textarea' | 'number';
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface FormConfig {
  fields: FormField[];
  submitText?: string;
  action?: string;
  method?: 'GET' | 'POST';
}

export type ComponentConfig = NavbarConfig | ColumnLayoutConfig | FormConfig | Record<string, any>;

// Base component schema
export interface BaseComponentSchema {
  id: string;
  type: ComponentType;
  content?: string;
  styles?: CSSProperties;
  position?: GridPosition;
  responsive?: ResponsiveConfig;
  config?: ComponentConfig;
}

// Specific component schemas for better type discrimination
export interface TextComponent extends BaseComponentSchema {
  type: 'TEXT';
  content: string;
}

export interface HeadingComponent extends BaseComponentSchema {
  type: 'HEADING';
  content: string;
  level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export interface ButtonComponent extends BaseComponentSchema {
  type: 'BUTTON';
  content: string;
  href?: string;
}

export interface LinkComponent extends BaseComponentSchema {
  type: 'LINK';
  content: string;
  href?: string;
}

export interface ImageComponent extends BaseComponentSchema {
  type: 'IMAGE';
  src: string;
  alt: string;
}

export interface NavbarComponent extends BaseComponentSchema {
  type: 'NAVBAR';
  config: NavbarConfig;
}

export interface ContainerComponent extends BaseComponentSchema {
  type: 'CONTAINER' | 'GRID' | 'SECTION';
  children?: string[];
}

export interface ColumnLayoutComponent extends BaseComponentSchema {
  type: 'COLUMN_LAYOUT';
  children: string[][];
  config: ColumnLayoutConfig;
}

export interface HeroComponent extends BaseComponentSchema {
  type: 'HERO';
  content?: string;
}

export interface CardComponent extends BaseComponentSchema {
  type: 'CARD';
  content?: string;
  children?: string[];
}

export interface FooterComponent extends BaseComponentSchema {
  type: 'FOOTER';
  content?: string;
  children?: string[];
}

export interface FormComponent extends BaseComponentSchema {
  type: 'FORM';
  config: FormConfig;
}

// Union type for all components
export type ComponentSchema =
  | TextComponent
  | HeadingComponent
  | ButtonComponent
  | LinkComponent
  | ImageComponent
  | NavbarComponent
  | ContainerComponent
  | ColumnLayoutComponent
  | HeroComponent
  | CardComponent
  | FooterComponent
  | FormComponent
  | BaseComponentSchema;
