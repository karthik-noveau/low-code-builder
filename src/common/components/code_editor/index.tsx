import { useState, useEffect } from 'react';
import styles from './style.module.css';
import { useDraftStore } from '../../../stores';
import { useToast } from '../toast_container';
import type { ComponentSchema } from '../../../types';

type TabType = 'html' | 'css' | 'settings';

export const CodeEditor = () => {
  const [activeTab, setActiveTab] = useState<TabType>('html');
  const { pages, components, activePageId, siteConfig, updateSiteConfig } = useDraftStore();
  const toast = useToast();

  // Get current page
  const currentPage = pages.find(p => p.id === activePageId);
  const pageComponents =
    currentPage?.children
      .map(id => components.find(c => c.id === id))
      .filter((comp): comp is ComponentSchema => Boolean(comp)) || [];

  // Generate current page HTML
  const generatePageHTML = (): string => {
    let html = '';
    pageComponents.forEach(comp => {
      switch (comp.type) {
        case 'TEXT':
          html += `<p>${comp.content}</p>\n`;
          break;
        case 'LINK':
          html += `<a href="${(comp as any).href}">${comp.content}</a>\n`;
          break;
        case 'BUTTON':
          html += `<button>${comp.content}</button>\n`;
          break;
        case 'IMAGE':
          html += `<img src="${(comp as any).src}" alt="${(comp as any).alt}" />\n`;
          break;
        case 'NAVBAR':
          html += `<nav>\n`;
          pages.forEach(page => {
            html += `  <a href="${page.slug}">${page.name}</a>\n`;
          });
          html += `</nav>\n`;
          break;
        default:
          html += `<!-- ${comp.type} -->\n`;
      }
    });
    return html;
  };

  const [htmlCode, setHtmlCode] = useState(generatePageHTML());
  const [cssCode, setCssCode] = useState((siteConfig as any).customCSS || '');
  const [settingsCode, setSettingsCode] = useState(JSON.stringify(siteConfig, null, 2));

  // Update HTML when page changes
  useEffect(() => {
    setHtmlCode(generatePageHTML());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageId, components, currentPage]);

  const parseHTMLToComponents = (html: string): ComponentSchema[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const newComponents: ComponentSchema[] = [];

    const extractComponents = (element: Element) => {
      for (const node of element.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const tagName = element.tagName.toLowerCase();
          const id = `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          switch (tagName) {
            case 'p':
              newComponents.push({
                id,
                type: 'TEXT',
                content: element.textContent || '',
                styles: { padding: '10px', fontSize: '16px' },
              });
              break;
            case 'a':
              newComponents.push({
                id,
                type: 'LINK',
                content: element.textContent || '',
                href: element.getAttribute('href') || '#',
                styles: { color: '#007bff', textDecoration: 'underline' },
              } as any);
              break;
            case 'button':
              newComponents.push({
                id,
                type: 'BUTTON',
                content: element.textContent || '',
                styles: { padding: '10px 20px', backgroundColor: '#007bff', color: '#fff' },
              });
              break;
            case 'img':
              newComponents.push({
                id,
                type: 'IMAGE',
                src: element.getAttribute('src') || '',
                alt: element.getAttribute('alt') || 'Image',
                styles: { width: '200px', height: 'auto' },
              } as any);
              break;
            case 'nav':
              newComponents.push({
                id,
                type: 'NAVBAR',
                config: {
                  showAllPages: true,
                  selectedPageIds: pages.map(p => p.id),
                  customLinks: [],
                },
                styles: {
                  display: 'flex',
                  gap: '20px',
                  padding: '15px 30px',
                  backgroundColor: '#4F46E5',
                  color: '#fff',
                },
              });
              break;
            default:
              if (element.textContent?.trim()) {
                newComponents.push({
                  id,
                  type: 'TEXT',
                  content: element.textContent.trim(),
                  styles: { padding: '10px', fontSize: '16px' },
                });
              }
          }
        }
      }
    };

    const firstChild = doc.body.firstChild as Element;
    if (firstChild) {
      extractComponents(firstChild);
    }
    return newComponents;
  };

  const handleSaveHTML = () => {
    try {
      const newComponents = parseHTMLToComponents(htmlCode);

      if (newComponents.length === 0) {
        toast.warning('No valid components found in HTML');
        return;
      }

      const store = useDraftStore.getState();
      const currentState = store.history.present;

      // Remove old components for this page
      const otherComponents = currentState.components.filter(
        comp => !currentPage?.children.includes(comp.id)
      );

      // Add new components
      const allComponents = [...otherComponents, ...newComponents];

      // Update page children
      const updatedPages = currentState.pages.map(page =>
        page.id === activePageId ? { ...page, children: newComponents.map(c => c.id) } : page
      );

      const newState = {
        ...currentState,
        components: allComponents,
        pages: updatedPages,
      };

      store._saveState(newState);
      useDraftStore.setState(newState);

      toast.success('HTML saved! Switch to Visual mode to see changes.');
    } catch (_error) {
      console.error('Error parsing HTML:', _error);
      toast.error('Error parsing HTML. Check your syntax.');
    }
  };

  const handleSaveCSS = () => {
    updateSiteConfig('customCSS', cssCode);
    toast.success('Custom CSS saved!');
  };

  const handleSaveSettings = () => {
    try {
      const parsed = JSON.parse(settingsCode);
      Object.keys(parsed).forEach(key => {
        updateSiteConfig(key, parsed[key]);
      });
      toast.success('Settings saved!');
    } catch (_error) {
      toast.error('Invalid JSON format!');
    }
  };

  return (
    <div className={styles.codeEditor}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'html' ? styles.active : ''}`}
            onClick={() => setActiveTab('html')}
          >
            HTML (Editable)
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'css' ? styles.active : ''}`}
            onClick={() => setActiveTab('css')}
          >
            Custom CSS
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings (JSON)
          </button>
        </div>
        <div className={styles.actions}>
          {activeTab === 'html' && (
            <button onClick={handleSaveHTML} className={styles.saveButton}>
              Save HTML
            </button>
          )}
          {activeTab === 'css' && (
            <button onClick={handleSaveCSS} className={styles.saveButton}>
              Save CSS
            </button>
          )}
          {activeTab === 'settings' && (
            <button onClick={handleSaveSettings} className={styles.saveButton}>
              Save Settings
            </button>
          )}
        </div>
      </div>

      <div className={styles.editorContent}>
        {activeTab === 'html' && (
          <div className={styles.editorPanel}>
            <div className={styles.info}>
              <strong>Page:</strong> {currentPage?.name}
              <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                ✏️ <strong>Now Editable!</strong> Modify HTML directly. Click "Save HTML" to sync changes to Visual mode.
              </p>
            </div>
            <textarea
              className={styles.codeArea}
              value={htmlCode}
              onChange={e => setHtmlCode(e.target.value)}
              placeholder={`<p>Add your HTML here...</p>
<button>Click Me</button>
<img src='image.jpg' alt='Description' />`}
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'css' && (
          <div className={styles.editorPanel}>
            <div className={styles.info}>
              <strong>Custom CSS</strong>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Add custom styles that will be applied globally. This CSS will be included in your export.
              </p>
            </div>
            <textarea
              className={styles.codeArea}
              value={cssCode}
              onChange={e => setCssCode(e.target.value)}
              placeholder={`/* Add your custom CSS here */
.custom-class {
  color: #4F46E5;
}

/* Override component styles */
nav {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}`}
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className={styles.editorPanel}>
            <div className={styles.info}>
              <strong>Site Settings (JSON)</strong>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Advanced: Edit site configuration directly. Be careful with JSON syntax.
              </p>
            </div>
            <textarea
              className={styles.codeArea}
              value={settingsCode}
              onChange={e => setSettingsCode(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.tips}>
          💡 <strong>Tips:</strong>
          {activeTab === 'html' &&
            ' Edit HTML directly! Supports: <p>, <a>, <button>, <img>, <nav>. Changes sync to Visual mode.'}
          {activeTab === 'css' && ' Use CSS variables: var(--color-primary), var(--spacing-md), etc.'}
          {activeTab === 'settings' && ' Edit title, description, keywords, and other site-wide settings.'}
        </div>
      </div>
    </div>
  );
};
