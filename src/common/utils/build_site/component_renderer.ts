import type { ComponentSchema, PageSchema } from '../../../types';
import type { CSSProperties } from 'react';

// Generate inline styles from component styles object
export const generateInlineStyles = (styles?: CSSProperties): string => {
  if (!styles) return '';
  return Object.entries(styles)
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join('; ');
};

// Generate HTML for a single component (recursive for nested components)
export const generateComponentHtml = (
  component: ComponentSchema,
  allPages: PageSchema[],
  isSPA: boolean = false,
  allComponents: ComponentSchema[] = []
): string => {
  const { type, content, styles } = component;
  const styleAttr = generateInlineStyles(styles);

  switch (type) {
    case 'TEXT':
      return `<p style="${styleAttr}">${content || ''}</p>`;

    case 'HEADING': {
      const level = (component as any).level || 'h2';
      return `<${level} style="${styleAttr}">${content || ''}</${level}>`;
    }

    case 'LINK': {
      const href = (component as any).href || '#';
      return `<a href="${href}" style="${styleAttr}">${content || ''}</a>`;
    }

    case 'BUTTON':
      return `<button style="${styleAttr}">${content || ''}</button>`;

    case 'IMAGE': {
      const src = (component as any).src || '';
      const alt = (component as any).alt || 'Image';
      return `<img src="${src}" alt="${alt}" style="${styleAttr}" loading="lazy" decoding="async" />`;
    }

    case 'CONTAINER':
    case 'GRID':
    case 'SECTION': {
      const children = (component as any).children || [];
      const childrenHtml = children
        .map((childId: string) => {
          const childComponent = allComponents.find(c => c.id === childId);
          return childComponent
            ? generateComponentHtml(childComponent, allPages, isSPA, allComponents)
            : '';
        })
        .filter(Boolean)
        .join('\n      ');

      const tag = type === 'SECTION' ? 'section' : 'div';
      return `<${tag} style="${styleAttr}">
      ${childrenHtml || '<p style="color: #999;">Empty Container</p>'}
    </${tag}>`;
    }

    case 'COLUMN_LAYOUT': {
      const colLayout = component as any;
      const { children, config } = colLayout;
      const columnCount = config?.columns || 2;
      const columnArrays = children || [[], []];
      const gap = config?.gap || '20px';

      const columnsHtml = columnArrays
        .slice(0, columnCount)
        .map((columnChildren: string[], colIndex: number) => {
          const columnChildrenHtml = columnChildren
            .map(childId => {
              const childComponent = allComponents.find(c => c.id === childId);
              return childComponent
                ? generateComponentHtml(childComponent, allPages, isSPA, allComponents)
                : '';
            })
            .filter(Boolean)
            .join('\n        ');

          return `<div style="display: flex; flex-direction: column; gap: 10px;">
        ${columnChildrenHtml || `<p style="color: #999; text-align: center; padding: 40px 20px;">Column ${colIndex + 1}</p>`}
      </div>`;
        })
        .join('\n      ');

      return `<div style="${styleAttr}; display: grid; grid-template-columns: repeat(${columnCount}, 1fr); gap: ${gap};">
      ${columnsHtml}
    </div>`;
    }

    case 'HERO':
      // Fallthrough intentional - HERO, CARD, and FOOTER share parsing logic
      // falls through
    case 'CARD':
      // Fallthrough intentional
      // falls through
    case 'FOOTER': {
      // Parse content if it's a JSON string
      let parsedContent: any = {};
      try {
        parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        parsedContent = content;
      }

      if (type === 'HERO') {
        const heading = parsedContent.heading || 'Build Your Dream Website';
        const subheading = parsedContent.subheading || 'Create stunning, professional websites without code';
        const ctaText = parsedContent.ctaText || 'Get Started';
        const ctaLink = parsedContent.ctaLink || '#';

        return `<div style="${styleAttr}">
      <h1 style="font-size: 48px; font-weight: bold; margin-bottom: 16px;">${heading}</h1>
      <p style="font-size: 20px; margin-bottom: 32px; opacity: 0.9;">${subheading}</p>
      <a href="${ctaLink}" style="display: inline-block; padding: 16px 32px; font-size: 18px; font-weight: 600; background-color: rgba(255, 255, 255, 0.2); color: inherit; border: 2px solid currentColor; border-radius: 8px; text-decoration: none; transition: all 0.3s;">${ctaText}</a>
    </div>`;
      }

      if (type === 'CARD') {
        const title = parsedContent.title || 'Card Title';
        const description = parsedContent.description || 'Card description goes here';
        const image = parsedContent.image || '';
        const link = parsedContent.link || '';

        return `<div style="${styleAttr}">
      ${image ? `<img src="${image}" alt="${title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px 8px 0 0; margin-bottom: 16px;" loading="lazy" decoding="async" />` : ''}
      <h3 style="font-size: 24px; font-weight: bold; margin-bottom: 12px; color: #111827;">${title}</h3>
      <p style="font-size: 16px; line-height: 1.6; color: #6b7280; margin-bottom: 16px;">${description}</p>
      ${link ? `<a href="${link}" style="color: #4F46E5; font-weight: 600; text-decoration: none;">Learn More →</a>` : ''}
    </div>`;
      }

      if (type === 'FOOTER') {
        const copyright = parsedContent.copyright || '© 2025 Your Company. All rights reserved.';
        const links = parsedContent.links || [];

        const linksHtml = links.length > 0
          ? `<div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;">
        ${links.map((link: any) => `<a href="${link.url || '#'}" style="color: inherit; text-decoration: none; opacity: 0.8;">${link.label}</a>`).join('\n        ')}
      </div>`
          : '';

        return `<footer style="${styleAttr}">
      ${linksHtml}
      <p style="font-size: 14px; opacity: 0.7;">${copyright}</p>
    </footer>`;
      }

      return '';
    }

    case 'FORM': {
      const formConfig = (component as any).config || {};
      const fields = formConfig.fields || [];
      const submitText = formConfig.submitText || 'Submit';
      const action = formConfig.action || '';
      const method = formConfig.method || 'POST';

      const fieldsHtml = fields
        .map((field: any) => {
          const required = field.required ? 'required' : '';
          const requiredLabel = field.required ? '<span style="color: #dc2626;"> *</span>' : '';

          if (field.type === 'textarea') {
            return `<div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">${field.label}${requiredLabel}</label>
          <textarea name="${field.label.toLowerCase().replace(/\s+/g, '_')}" placeholder="${field.placeholder}" ${required} style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; min-height: 100px; resize: vertical;"></textarea>
        </div>`;
          } else {
            return `<div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">${field.label}${requiredLabel}</label>
          <input type="${field.type}" name="${field.label.toLowerCase().replace(/\s+/g, '_')}" placeholder="${field.placeholder}" ${required} style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;" />
        </div>`;
          }
        })
        .join('\n      ');

      return `<form action="${action}" method="${method}" style="${styleAttr}">
      ${fieldsHtml}
      <button type="submit" style="padding: 12px 24px; font-size: 16px; font-weight: 600; background-color: #4F46E5; color: #ffffff; border: none; border-radius: 8px; cursor: pointer;">${submitText}</button>
    </form>`;
    }

    case 'NAVBAR': {
      const navConfig = (component as any).config || {
        showAllPages: true,
        selectedPageIds: [],
        customLinks: [],
      };

      const pagesToShow = navConfig.showAllPages
        ? allPages
        : allPages.filter(p => navConfig.selectedPageIds.includes(p.id));

      const navLinks = pagesToShow
        .map(page => {
          const href = isSPA ? `#${page.slug}` : page.slug === '/' ? 'index.html' : `${page.slug.substring(1)}.html`;
          return `<a href="${href}" style="color: inherit; text-decoration: none; padding: 8px 12px; transition: opacity 0.2s;">${page.name}</a>`;
        })
        .join('\n        ');

      const customLinks = navConfig.customLinks
        .map((link: any) => `<a href="${link.url || '#'}" style="color: inherit; text-decoration: none; padding: 8px 12px; transition: opacity 0.2s;">${link.label}</a>`)
        .join('\n        ');

      return `<nav style="${styleAttr}">
      ${navConfig.logo ? `<img src="${navConfig.logo}" alt="Logo" style="height: 40px; margin-right: 20px;" />` : ''}
      <div style="display: flex; gap: 10px; align-items: center;">
        ${navLinks}
        ${customLinks}
      </div>
    </nav>`;
    }

    default:
      return `<div style="${styleAttr}">Unknown Component: ${type}</div>`;
  }
};
