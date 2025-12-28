import { useEffect } from 'react';

/**
 * Keyboard shortcut map type
 * Example: { 'ctrl+z': undoFunction, 'ctrl+y': redoFunction, 'delete': deleteFunction }
 */
export interface KeyboardShortcutMap {
  [key: string]: (event: KeyboardEvent) => void;
}

/**
 * Custom hook for keyboard shortcuts
 * @param shortcuts - Map of key combinations to callback functions
 */
export const useKeyboardShortcuts = (shortcuts: KeyboardShortcutMap): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey, altKey } = event;

      // Build the key combination string
      let combination = '';
      if (ctrlKey || metaKey) combination += 'ctrl+';
      if (shiftKey) combination += 'shift+';
      if (altKey) combination += 'alt+';
      combination += key.toLowerCase();

      // Check if this combination has a handler
      const handler = shortcuts[combination];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};
