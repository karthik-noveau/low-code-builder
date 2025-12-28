/**
 * Professional pre-built component templates
 * Like Webflow/Framer component library
 */

import type { ComponentTemplateMap, ComponentTemplate } from '../../types';

export const COMPONENT_TEMPLATES: ComponentTemplateMap = {
  // Layout Components
  CONTAINER: {
    type: 'CONTAINER',
    label: '📦 Container',
    category: 'Layout',
    defaultProps: {
      children: [],
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      },
      config: {
        layout: 'flex',
        columns: 1,
        gap: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  GRID: {
    type: 'GRID',
    label: '🎨 Grid',
    category: 'Layout',
    defaultProps: {
      children: [],
      styles: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px',
        padding: '20px',
      },
      config: {
        columns: 3,
        rows: 'auto',
        gap: '20px',
        responsive: {
          mobile: 1,
          tablet: 2,
          desktop: 3,
        },
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  SECTION: {
    type: 'SECTION',
    label: '📄 Section',
    category: 'Layout',
    defaultProps: {
      children: [],
      styles: {
        padding: '60px 20px',
        backgroundColor: '#f9fafb',
        width: '100%',
      },
      config: {
        fullWidth: true,
        containerWidth: '1200px',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  COLUMN_LAYOUT: {
    type: 'COLUMN_LAYOUT',
    label: '🔲 Column Layout',
    category: 'Layout',
    defaultProps: {
      children: [[], []],
      config: {
        columns: 2,
        columnRatios: [6, 6],
        gap: '20px',
        alignItems: 'flex-start',
      },
      styles: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '20px',
        padding: '20px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  // Pre-built Components
  HERO: {
    type: 'HERO',
    label: '🎯 Hero Section',
    category: 'Blocks',
    defaultProps: {
      content: JSON.stringify({
        heading: 'Build Your Dream Website',
        subheading: 'Create stunning, professional websites without code',
        ctaText: 'Get Started',
        ctaLink: '#',
      }),
      styles: {
        padding: '80px 20px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 2,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  CARD: {
    type: 'CARD',
    label: '🎴 Card',
    category: 'Blocks',
    defaultProps: {
      content: JSON.stringify({
        title: 'Card Title',
        description: 'Card description goes here',
        image: '',
        link: '#',
      }),
      styles: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
      },
      position: {
        colStart: 1,
        colSpan: 4,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 4 },
        tablet: { colSpan: 6 },
        mobile: { colSpan: 12 },
      },
    },
  },

  FORM: {
    type: 'FORM',
    label: '📝 Form',
    category: 'Blocks',
    defaultProps: {
      config: {
        fields: [
          { type: 'text', label: 'Name', placeholder: 'Enter your name', required: true },
          { type: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
          { type: 'textarea', label: 'Message', placeholder: 'Your message', required: false },
        ],
        submitText: 'Submit',
        action: '',
        method: 'POST',
      },
      styles: {
        padding: '30px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      },
      position: {
        colStart: 1,
        colSpan: 8,
        rowStart: 1,
        rowSpan: 2,
      },
      responsive: {
        desktop: { colSpan: 8 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  // Basic Components
  TEXT: {
    type: 'TEXT',
    label: '📝 Text',
    category: 'Basic',
    defaultProps: {
      content: 'Your text here',
      styles: {
        fontSize: '16px',
        lineHeight: '1.6',
        color: '#374151',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  HEADING: {
    type: 'HEADING',
    label: '📰 Heading',
    category: 'Basic',
    defaultProps: {
      content: 'Heading Text',
      level: 'h2',
      styles: {
        fontSize: '32px',
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: '16px',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  BUTTON: {
    type: 'BUTTON',
    label: '🔘 Button',
    category: 'Basic',
    defaultProps: {
      content: 'Click Me',
      href: '#',
      styles: {
        padding: '12px 24px',
        fontSize: '16px',
        fontWeight: '600',
        backgroundColor: '#4F46E5',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
      },
      position: {
        colStart: 1,
        colSpan: 3,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 3 },
        tablet: { colSpan: 4 },
        mobile: { colSpan: 12 },
      },
    },
  },

  IMAGE: {
    type: 'IMAGE',
    label: '🖼️ Image',
    category: 'Basic',
    defaultProps: {
      src: '',
      alt: 'Image',
      styles: {
        width: '100%',
        height: 'auto',
        borderRadius: '8px',
        objectFit: 'cover',
      },
      position: {
        colStart: 1,
        colSpan: 6,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 6 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  LINK: {
    type: 'LINK',
    label: '🔗 Link',
    category: 'Basic',
    defaultProps: {
      content: 'Link Text',
      href: '#',
      styles: {
        color: '#4F46E5',
        textDecoration: 'underline',
        cursor: 'pointer',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  // Advanced Components
  NAVBAR: {
    type: 'NAVBAR',
    label: '🧭 Navbar',
    category: 'Navigation',
    defaultProps: {
      config: {
        showAllPages: true,
        selectedPageIds: [],
        customLinks: [],
        logo: '',
      },
      styles: {
        display: 'flex',
        gap: '20px',
        padding: '15px 30px',
        backgroundColor: '#4F46E5',
        color: '#ffffff',
        alignItems: 'center',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },

  FOOTER: {
    type: 'FOOTER',
    label: '👣 Footer',
    category: 'Navigation',
    defaultProps: {
      content: JSON.stringify({
        copyright: '© 2025 Your Company. All rights reserved.',
        links: [],
      }),
      styles: {
        padding: '40px 20px',
        backgroundColor: '#111827',
        color: '#9ca3af',
        textAlign: 'center',
      },
      position: {
        colStart: 1,
        colSpan: 12,
        rowStart: 1,
        rowSpan: 1,
      },
      responsive: {
        desktop: { colSpan: 12 },
        tablet: { colSpan: 12 },
        mobile: { colSpan: 12 },
      },
    },
  },
};

// Component categories for organization
export const COMPONENT_CATEGORIES = {
  LAYOUT: { label: 'Layout', icon: '📦' },
  BLOCKS: { label: 'Blocks', icon: '🎴' },
  BASIC: { label: 'Basic', icon: '📝' },
  NAVIGATION: { label: 'Navigation', icon: '🧭' },
};

// Get components by category
export const getComponentsByCategory = (): Record<string, Array<ComponentTemplate & { key: string }>> => {
  const categorized: Record<string, Array<ComponentTemplate & { key: string }>> = {};

  Object.entries(COMPONENT_TEMPLATES).forEach(([key, template]) => {
    const category = template.category || 'Basic';
    if (!categorized[category]) {
      categorized[category] = [];
    }
    categorized[category].push({ key, ...template });
  });

  return categorized;
};
