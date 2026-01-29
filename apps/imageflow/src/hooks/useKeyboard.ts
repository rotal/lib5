import { useEffect, useCallback } from 'react';
import { useGraph } from './useGraph';
import { useGraphStore } from '../store';

/**
 * Hook for keyboard shortcuts
 */
export function useKeyboard() {
  const {
    undo,
    redo,
    copy,
    cut,
    paste,
    selectAll,
    deleteSelection,
    canUndo,
    canRedo,
  } = useGraph();

  const toggleAllPreviews = useGraphStore((s) => s.toggleAllPreviews);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle shortcuts when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Undo: Ctrl/Cmd + Z
    if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (canUndo) undo();
      return;
    }

    // Redo: Ctrl/Cmd + Shift + Z or Ctrl + Y
    if (cmdOrCtrl && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      if (canRedo) redo();
      return;
    }

    // Copy: Ctrl/Cmd + C
    if (cmdOrCtrl && e.key === 'c') {
      e.preventDefault();
      copy();
      return;
    }

    // Cut: Ctrl/Cmd + X
    if (cmdOrCtrl && e.key === 'x') {
      e.preventDefault();
      cut();
      return;
    }

    // Paste: Ctrl/Cmd + V
    if (cmdOrCtrl && e.key === 'v') {
      e.preventDefault();
      paste();
      return;
    }

    // Select All: Ctrl/Cmd + A
    if (cmdOrCtrl && e.key === 'a') {
      e.preventDefault();
      selectAll();
      return;
    }

    // Delete: Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelection();
      return;
    }

    // Escape: Clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      // Could call clearSelection here
      return;
    }

    // V (without modifiers): Toggle all node previews
    if (e.key === 'v' && !cmdOrCtrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      toggleAllPreviews();
      return;
    }
  }, [undo, redo, copy, cut, paste, selectAll, deleteSelection, canUndo, canRedo, toggleAllPreviews]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
