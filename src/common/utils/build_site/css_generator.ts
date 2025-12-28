import type { SiteConfig } from '../../../types';

// Generate CSS content for the site
export const generateCssContent = (siteConfig: SiteConfig): string => {
  const customCSS = (siteConfig as any).customCSS || '';

  return `/* Generated styles for the website */
/* Critical CSS for above-the-fold content */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
}

/* Performance: Reduce layout shift */
img {
    max-width: 100%;
    height: auto;
    display: block;
}

/* Accessibility improvements */
a:focus,
button:focus {
    outline: 2px solid #4F46E5;
    outline-offset: 2px;
}

/* Skip to main content for screen readers */
.skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: #4F46E5;
    color: white;
    padding: 8px;
    text-decoration: none;
    z-index: 100;
}

.skip-link:focus {
    top: 0;
}

${customCSS ? `\n/* Custom CSS */\n${customCSS}\n` : ''}
`;
};

// Minify CSS by removing whitespace and comments
export const minifyCss = (css: string): string => {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove CSS comments
    .replace(/\s+/g, ' ') // Collapse spaces
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .trim();
};

// Generate sitemap.xml for SEO
export const generateSitemap = (pages: any[], siteConfig: SiteConfig): string => {
  const siteUrl = siteConfig.siteUrl || 'https://example.com';
  const today = new Date().toISOString().split('T')[0];

  const urlEntries = pages
    .map(page => {
      const loc = page.slug === '/' ? siteUrl : `${siteUrl}${page.slug}`;
      const priority = page.slug === '/' ? '1.0' : '0.8';

      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries}
</urlset>`;
};

// Generate robots.txt for crawler directives
export const generateRobotsTxt = (siteConfig: SiteConfig): string => {
  const siteUrl = siteConfig.siteUrl || 'https://example.com';

  return `# Robots.txt for ${siteConfig.title}
User-agent: *
Allow: /

# Sitemap location
Sitemap: ${siteUrl}/sitemap.xml

# Crawl-delay (optional, adjust as needed)
# Crawl-delay: 1

# Disallow specific paths (add as needed)
# Disallow: /private/
# Disallow: /temp/
`;
};
