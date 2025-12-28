import type { ComponentSchema, PageSchema, SiteConfig, AssetSchema } from '../../../types';

export interface DraftData {
  pages: PageSchema[];
  components: ComponentSchema[];
  siteConfig: SiteConfig;
  assets: AssetSchema[];
}

export interface AssetMap {
  [base64Data: string]: string; // Maps base64 to filename
}

export interface BuildFile {
  name: string;
  content: string | Blob;
}

export type BuildMode = 'static' | 'preview' | 'optimized-spa';
