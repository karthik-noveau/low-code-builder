import type { PageSchema, ComponentSchema, SiteConfig } from '../../../types';
import { generateComponentHtml } from './component_renderer';

// Minify HTML by removing comments and extra whitespace
export const minifyHtml = (html: string): string => {
  return html
    .replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/>\s+</g, '><') // Remove spaces between tags
    .trim();
};

// Generate comprehensive structured data (JSON-LD) for SEO
export const generateStructuredData = (
  page: PageSchema,
  siteConfig: SiteConfig,
  _allPages: PageSchema[]
): string => {
  const siteUrl = siteConfig.siteUrl || 'https://example.com';
  const pageUrl = `${siteUrl}${page.slug}`;

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.title,
    description: siteConfig.description || '',
    url: siteUrl,
  };

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.metadata?.title || page.name,
    description: page.metadata?.description || '',
    url: pageUrl,
  };

  return `<script type="application/ld+json">
${JSON.stringify([websiteSchema, webPageSchema], null, 2)}
</script>`;
};

// Generate advanced meta tags for SEO
export const generateAdvancedMetaTags = (
  page: PageSchema,
  siteConfig: SiteConfig,
  _allPages: PageSchema[]
): string => {
  const siteUrl = siteConfig.siteUrl || 'https://example.com';
  const pageUrl = `${siteUrl}${page.slug}`;
  const pageTitle = page.metadata?.title || `${page.name} - ${siteConfig.title}`;
  const pageDescription = page.metadata?.description || siteConfig.description || '';

  return `
    <!-- Primary Meta Tags -->
    <title>${pageTitle}</title>
    <meta name="title" content="${pageTitle}">
    <meta name="description" content="${pageDescription}">
    <meta name="keywords" content="${siteConfig.keywords || ''}">
    <meta name="author" content="${siteConfig.author || siteConfig.title}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${pageDescription}">
    <meta property="og:site_name" content="${siteConfig.title}">
    <meta property="og:locale" content="en_US">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${pageUrl}">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${pageDescription}">
`;
};

// Generate HTML for a page
export const generatePageHtml = (
  page: PageSchema,
  allComponents: ComponentSchema[],
  siteConfig: SiteConfig,
  allPages: PageSchema[],
  _siteUrl: string = '',
  isSPA: boolean = false
): string => {
  const renderableComponents = page.children
    .map(componentId => allComponents.find(comp => comp.id === componentId))
    .filter((comp): comp is ComponentSchema => Boolean(comp));

  const componentsHtml = renderableComponents
    .map(component => generateComponentHtml(component, allPages, isSPA, allComponents))
    .join('\n    ');

  // Find first image for og:image
  const firstImage = renderableComponents.find(comp => comp.type === 'IMAGE') as any;
  const ogImage = firstImage?.src || '';

  const structuredData = generateStructuredData(page, siteConfig, allPages);
  const headScripts = page.metadata?.headScripts || '';
  const bodyStartScripts = page.metadata?.bodyStartScripts || '';
  const bodyEndScripts = page.metadata?.bodyEndScripts || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">

    ${generateAdvancedMetaTags(page, siteConfig, allPages)}
    ${ogImage ? `<meta property="og:image" content="${ogImage}">
    <meta name="twitter:image" content="${ogImage}">` : ''}

    ${structuredData}

    <!-- Styles -->
    <link rel="stylesheet" href="styles.css">

    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="favicon.ico">

    ${headScripts ? `<!-- Custom Head Scripts -->\n    ${headScripts}` : ''}
</head>
<body>
    ${bodyStartScripts ? `<!-- Custom Body Start Scripts -->\n    ${bodyStartScripts}\n    ` : ''}

    <!-- Skip to main content for accessibility -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Main Content -->
    <main id="main-content">
    ${componentsHtml || '<p style="padding: 40px; text-align: center; color: #999;">No content yet</p>'}
    </main>

    ${bodyEndScripts ? `\n    <!-- Custom Body End Scripts -->\n    ${bodyEndScripts}` : ''}
</body>
</html>`;
};
