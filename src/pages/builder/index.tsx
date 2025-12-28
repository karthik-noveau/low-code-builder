import { useCallback, useEffect, useMemo } from 'react';
import { useDraftStore } from '../../stores/use_draft_store';
import { useAutoSave } from '../../common/hooks/use_auto_save';
import { useKeyboardShortcuts } from '../../common/hooks/use_keyboard_shortcuts';
import { useToast } from '../../common/components/toast_container';
import { TopBar } from './top_bar';
import { LeftPanel } from './left_panel';
import { RightPanel } from './right_panel';
import { Canvas } from './canvas';
import { CodeEditor } from '../../common/components/code_editor';
import styles from './style.module.css';

export const Builder = () => {
  const store = useDraftStore();
  const toast = useToast();

  // Validate store data on mount
  useEffect(() => {
    const { pages, components } = store;

    console.log('🔍 Checking store data...');
    console.log('📊 Total components:', components.length);
    console.log('📍 Component positions:', components.map(c => ({
      id: c.id,
      type: c.type,
      position: c.position
    })));

    if (!Array.isArray(pages) || !Array.isArray(components)) {
      console.warn('Store data corrupted, clearing draft...');
      localStorage.removeItem('draft-storage');
      window.location.reload();
      return;
    }

    // Check if components have position properties (migration for v2)
    const missingPositions = components.some(comp => !comp.position);
    if (missingPositions) {
      console.warn('⚠️ Components missing position properties, clearing draft to reload updated schema...');
      console.log('Missing positions for:', components.filter(c => !c.position).map(c => c.id));
      localStorage.removeItem('draft-storage');
      window.location.reload();
    } else {
      console.log('✅ All components have positions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save callback
  const handleAutoSave = useCallback(() => {
    (store as any).lastAutoSave = Date.now();
  }, [store]);

  useAutoSave(handleAutoSave, 2000);

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => ({
      'ctrl+z': () => {
        store.undo();
        toast.info('Undo');
      },
      'ctrl+y': () => {
        store.redo();
        toast.info('Redo');
      },
      'ctrl+shift+z': () => {
        store.redo();
        toast.info('Redo');
      },
      delete: () => {
        if (store.selectedComponentId) {
          store.deleteComponent(store.selectedComponentId);
          toast.success('Component deleted');
        }
      },
      'ctrl+d': () => {
        if (store.selectedComponentId) {
          store.duplicateComponent(store.selectedComponentId);
          toast.success('Component duplicated');
        }
      },
      // Arrow keys for nudging components
      arrowup: () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              rowStart: Math.max(1, component.position.rowStart - 1),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      arrowdown: () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              rowStart: component.position.rowStart + 1,
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      arrowleft: () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              colStart: Math.max(1, component.position.colStart - 1),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      arrowright: () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              colStart: Math.min(13 - component.position.colSpan, component.position.colStart + 1),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      // Shift+Arrow for larger jumps
      'shift+arrowup': () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              rowStart: Math.max(1, component.position.rowStart - 5),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      'shift+arrowdown': () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              rowStart: component.position.rowStart + 5,
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      'shift+arrowleft': () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              colStart: Math.max(1, component.position.colStart - 2),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
      'shift+arrowright': () => {
        if (store.selectedComponentId) {
          const component = store.components.find((c) => c.id === store.selectedComponentId);
          if (component?.position) {
            const newPosition = {
              ...component.position,
              colStart: Math.min(13 - component.position.colSpan, component.position.colStart + 2),
            };
            store.updateComponentPosition(store.selectedComponentId, newPosition);
          }
        }
      },
    }),
    [store, toast]
  );

  useKeyboardShortcuts(shortcuts);

  const viewMode = store.viewMode || 'visual';

  return (
    <div className={styles.appLayout}>
      <div className={styles.topBar}>
        <TopBar />
      </div>
      {viewMode === 'visual' ? (
        <>
          <div className={styles.leftPanel}>
            <LeftPanel />
          </div>
          <div className={styles.centerCanvas}>
            <Canvas />
          </div>
          <div className={styles.rightPanel}>
            <RightPanel />
          </div>
        </>
      ) : (
        <div className={styles.codeEditorFull}>
          <CodeEditor />
        </div>
      )}
    </div>
  );
};
