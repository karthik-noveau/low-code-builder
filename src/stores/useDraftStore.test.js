import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import useDraftStore from './useDraftStore';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useDraftStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store before each test
    act(() => {
      useDraftStore.setState(useDraftStore.getInitialState());
    });
  });

  it('should initialize with default state', () => {
    const state = useDraftStore.getState();
    expect(state.pages).toHaveLength(1);
    expect(state.components).toHaveLength(2);
    expect(state.selectedComponentId).toBeNull();
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(0);
  });

  it('should update component content and track history', () => {
    const { updateComponentContent, history, components } = useDraftStore.getState();
    const initialContent = components[0].content;

    act(() => {
      updateComponentContent('comp-1', 'New Content');
    });

    const newState = useDraftStore.getState();
    expect(newState.components[0].content).toBe('New Content');
    expect(newState.history.past).toHaveLength(1);
    expect(newState.history.past[0].components[0].content).toBe(initialContent);
    expect(newState.history.future).toHaveLength(0);
  });

  it('should reorder components and track history', () => {
    const { reorderComponents, history, pages } = useDraftStore.getState();
    const initialChildren = pages[0].children;

    act(() => {
      reorderComponents('page-1', 0, 1);
    });

    const newState = useDraftStore.getState();
    expect(newState.pages[0].children).toEqual(['comp-2', 'comp-1']);
    expect(newState.history.past).toHaveLength(1);
    expect(newState.history.past[0].pages[0].children).toEqual(initialChildren);
    expect(newState.history.future).toHaveLength(0);
  });

  it('should update component styles and track history', () => {
    const { updateComponentStyles, history, components } = useDraftStore.getState();
    const initialFontSize = components[0].styles.fontSize;

    act(() => {
      updateComponentStyles('comp-1', 'fontSize', '30px');
    });

    const newState = useDraftStore.getState();
    expect(newState.components[0].styles.fontSize).toBe('30px');
    expect(newState.history.past).toHaveLength(1);
    expect(newState.history.past[0].components[0].styles.fontSize).toBe(initialFontSize);
    expect(newState.history.future).toHaveLength(0);
  });

  it('should undo and redo actions correctly', () => {
    const { updateComponentContent, undo, redo, components } = useDraftStore.getState();
    const initialContent = components[0].content;

    act(() => {
      updateComponentContent('comp-1', 'First Change');
    });
    act(() => {
      updateComponentContent('comp-1', 'Second Change');
    });

    expect(useDraftStore.getState().components[0].content).toBe('Second Change');
    expect(useDraftStore.getState().history.past).toHaveLength(2);

    act(() => {
      undo();
    });
    expect(useDraftStore.getState().components[0].content).toBe('First Change');
    expect(useDraftStore.getState().history.past).toHaveLength(1);
    expect(useDraftStore.getState().history.future).toHaveLength(1);

    act(() => {
      undo();
    });
    expect(useDraftStore.getState().components[0].content).toBe(initialContent);
    expect(useDraftStore.getState().history.past).toHaveLength(0);
    expect(useDraftStore.getState().history.future).toHaveLength(2);

    act(() => {
      redo();
    });
    expect(useDraftStore.getState().components[0].content).toBe('First Change');
    expect(useDraftStore.getState().history.past).toHaveLength(1);
    expect(useDraftStore.getState().history.future).toHaveLength(1);

    act(() => {
      redo();
    });
    expect(useDraftStore.getState().components[0].content).toBe('Second Change');
    expect(useDraftStore.getState().history.past).toHaveLength(2);
    expect(useDraftStore.getState().history.future).toHaveLength(0);
  });

  it('should clear draft and reset state', () => {
    const { updateComponentContent, clearDraft } = useDraftStore.getState();

    act(() => {
      updateComponentContent('comp-1', 'Some content');
    });
    expect(useDraftStore.getState().components[0].content).toBe('Some content');

    act(() => {
      clearDraft();
    });

    const newState = useDraftStore.getState();
    expect(newState.pages).toHaveLength(1);
    expect(newState.components).toHaveLength(2);
    expect(newState.components[0].content).not.toBe('Some content'); // Should be initial content
    expect(newState.history.past).toHaveLength(0);
    expect(newState.history.future).toHaveLength(0);
  });

  it('should persist state to localStorage', () => {
    const { updateComponentContent } = useDraftStore.getState();

    act(() => {
      updateComponentContent('comp-1', 'Persisted Content');
    });

    // Simulate rehydration
    const rehydratedStore = useDraftStore.persist.rehydrate();
    expect(rehydratedStore.components[0].content).toBe('Persisted Content');
  });
});
