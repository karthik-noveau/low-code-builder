export interface SiteConfig {
  title: string;
  description: string;
  slug: string;
  siteUrl?: string;
  keywords?: string;
  author?: string;
  metaTags?: Array<{ name: string; content: string }>;
  theme?: Record<string, any>;
  typography?: Record<string, any>;
  header?: string | null;
  footer?: string | null;
}
