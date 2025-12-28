import JSZip from 'jszip';
import type { DraftData, AssetMap } from './types';
import { generatePageHtml, minifyHtml } from './html_generator';
import { generateCssContent, minifyCss, generateSitemap, generateRobotsTxt } from './css_generator';

// Process assets and convert base64 to files
export const processAssets = (assets: any[]): Array<{name: string; mimeType: string; data: string}> => {
  const processedAssets: Array<{name: string; mimeType: string; data: string}> = [];

  assets.forEach((asset, index) => {
    if (asset.data && asset.data.startsWith('data:')) {
      const matches = asset.data.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];

        processedAssets.push({
          name: asset.name || `asset-${index}`,
          mimeType,
          data: base64Data,
        });
      }
    }
  });

  return processedAssets;
};

// Replace asset references in HTML
export const replaceAssetReferences = (htmlContent: string, assetMap: AssetMap): string => {
  let updatedHtml = htmlContent;

  Object.entries(assetMap).forEach(([base64Data, filename]) => {
    const regex = new RegExp(`data:[^;]+;base64,${base64Data.replace(/\+/g, '\\+').replace(/\//g, '\\/')}`, 'g');
    updatedHtml = updatedHtml.replace(regex, `assets/${filename}`);
  });

  return updatedHtml;
};

// Build static site (multi-page)
export const buildStaticSite = async (draftData: DraftData): Promise<Blob> => {
  const { pages, components, assets, siteConfig } = draftData;
  const zip = new JSZip();
  const siteUrl = siteConfig.siteUrl || '';

  // Generate CSS
  const cssContent = generateCssContent(siteConfig);
  const minifiedCss = minifyCss(cssContent);
  zip.file('styles.css', minifiedCss);

  // Generate HTML for each page
  pages.forEach(page => {
    const htmlContent = generatePageHtml(page, components, siteConfig, pages, siteUrl, false);
    const minified = minifyHtml(htmlContent);
    const filename = page.slug === '/' ? 'index.html' : `${page.slug.substring(1)}.html`;
    zip.file(filename, minified);
  });

  // Process and add assets
  const processedAssets = processAssets(assets);
  const assetsFolder = zip.folder('assets');
  processedAssets.forEach(asset => {
    if (assetsFolder) {
      assetsFolder.file(asset.name, asset.data, { base64: true });
    }
  });

  // Generate sitemap.xml
  const sitemap = generateSitemap(pages, siteConfig);
  zip.file('sitemap.xml', sitemap);

  // Generate robots.txt
  const robotsTxt = generateRobotsTxt(siteConfig);
  zip.file('robots.txt', robotsTxt);

  // Generate README
  const readme = `# ${siteConfig.title}

## Deployment Instructions

This is a static website. To deploy:

1. Upload all files to your web server's public directory
2. Ensure index.html is set as the default page
3. Configure your server to serve the sitemap.xml

### Hosting Options
- Netlify: Drag and drop this folder
- Vercel: Deploy from repository
- GitHub Pages: Push to gh-pages branch
- Traditional hosting: FTP upload

Generated with Low-Code Builder
`;
  zip.file('README.md', readme);

  return await zip.generateAsync({ type: 'blob' });
};

// Build optimized SPA (production-ready)
export const buildOptimizedSPA = async (draftData: DraftData): Promise<Blob> => {
  const { pages, components, assets, siteConfig } = draftData;
  const zip = new JSZip();
  const siteUrl = siteConfig.siteUrl || '';

  // Generate CSS
  const cssContent = generateCssContent(siteConfig);
  const minifiedCss = minifyCss(cssContent);
  zip.file('styles.css', minifiedCss);

  // Generate HTML for each page (pre-rendered for SEO)
  pages.forEach(page => {
    const htmlContent = generatePageHtml(page, components, siteConfig, pages, siteUrl, false);
    const minified = minifyHtml(htmlContent);
    const filename = page.slug === '/' ? 'index.html' : `${page.slug.substring(1)}.html`;
    zip.file(filename, minified);
  });

  // Process assets
  const processedAssets = processAssets(assets);
  const assetsFolder = zip.folder('assets');
  processedAssets.forEach(asset => {
    if (assetsFolder) {
      assetsFolder.file(asset.name, asset.data, { base64: true });
    }
  });

  // SEO files
  zip.file('sitemap.xml', generateSitemap(pages, siteConfig));
  zip.file('robots.txt', generateRobotsTxt(siteConfig));

  // PWA manifest
  const manifest = {
    name: siteConfig.title,
    short_name: siteConfig.title,
    description: siteConfig.description || '',
    start_url: '/',
    display: 'standalone',
    theme_color: '#4F46E5',
    background_color: '#ffffff',
    icons: [
      {
        src: '/assets/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/assets/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
  zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

  // .htaccess for Apache servers
  const htaccess = `# Enable gzip compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript
</IfModule>

# Browser caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>

# Security headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
</IfModule>
`;
  zip.file('.htaccess', htaccess);

  // README
  const readme = `# ${siteConfig.title}

Production-ready static site with SEO optimization.

## Features
- ✅ Pre-rendered HTML for all pages
- ✅ Minified CSS and HTML
- ✅ SEO-optimized (meta tags, structured data, sitemap)
- ✅ PWA manifest included
- ✅ Server configuration (.htaccess)

## Deployment
1. Upload all files to your hosting provider
2. Configure your domain
3. Enjoy your live website!

Generated with Low-Code Builder
`;
  zip.file('README.md', readme);

  return await zip.generateAsync({ type: 'blob' });
};
