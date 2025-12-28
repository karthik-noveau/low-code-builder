import type { DraftData } from './types';
import { generateComponentHtml, generateInlineStyles } from './component_renderer';
import { generateCssContent } from './css_generator';

// Build preview HTML with hash-based routing for single-page demo
export const buildPreviewHtml = (draftData: DraftData): string => {
  const { pages, components, siteConfig } = draftData;

  // Generate content for each page
  const pageContents = pages.map(page => {
    const renderableComponents = page.children
      .map(componentId => components.find(comp => comp.id === componentId))
      .filter(Boolean);

    // Generate components HTML with hash routing for navbar
    const componentsHtml = renderableComponents
      .map(component => {
        if (component && component.type === 'NAVBAR') {
          const navConfig = (component as any).config || {
            showAllPages: true,
            selectedPageIds: [],
            customLinks: [],
          };

          const displayPages = navConfig.showAllPages
            ? pages
            : navConfig.selectedPageIds
                .map((pageId: string) => pages.find(p => p.id === pageId))
                .filter(Boolean);

          const styleAttr = generateInlineStyles(component.styles);
          const navLinks = displayPages
            .map((p: any) => {
              const href = p.slug === '/' ? '#home' : `#${p.slug.substring(1)}`;
              return `<a href="${href}" class="nav-link" style="color: #fff; text-decoration: none; margin: 0 10px;">${p.name}</a>`;
            })
            .join('\n      ');

          return `<nav style="${styleAttr}">
      ${navLinks}
    </nav>`;
        } else {
          return component ? generateComponentHtml(component, pages, true, components) : '';
        }
      })
      .join('\n    ');

    const pageId = page.slug === '/' ? 'home' : page.slug.substring(1).replace(/\//g, '-');
    return {
      id: pageId,
      title: page.metadata?.title || `${page.name} - ${siteConfig.title}`,
      html: componentsHtml,
    };
  });

  const css = generateCssContent(siteConfig);

  // Generate the single-page HTML with all pages embedded
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteConfig.title}</title>
    <meta name="description" content="${siteConfig.description || ''}">
    <style>
        ${css}

        /* Page container styles */
        .page {
            display: none;
        }
        .page.active {
            display: block;
        }

        /* Smooth transitions */
        .page {
            animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    </style>
</head>
<body>
    ${pageContents
      .map(
        page => `
    <div class="page" id="${page.id}">
      ${page.html}
    </div>`
      )
      .join('')}

    <script>
        // Simple hash-based routing
        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.add('active');
            }
        }

        // Handle hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1) || 'home';
            showPage(hash);
        });

        // Show initial page
        const initialHash = window.location.hash.substring(1) || 'home';
        showPage(initialHash);

        // Update active nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', function() {
                document.querySelectorAll('.nav-link').forEach(l => {
                    l.style.opacity = '0.7';
                });
                this.style.opacity = '1';
            });
        });
    </script>
</body>
</html>`;
};
