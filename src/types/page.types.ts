import type { CSSProperties } from 'react';

export interface PageMetadata {
  title: string;
  description: string;
  slug: string;
  keywords?: string;
  headScripts?: string;
  bodyStartScripts?: string;
  bodyEndScripts?: string;
}

export interface PageSchema {
  id: string;
  name: string;
  slug: string;
  children: string[];
  metadata: PageMetadata;
  styles?: CSSProperties;
}
