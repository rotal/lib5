import React, { useCallback, useRef, useState } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useUiStore, useExecutionStore } from '../../store';
import { Button } from '../ui';
import { serializeGraph, deserializeGraph } from '../../types/graph';
import { validateGraph } from '../../core/graph/GraphValidator';

export function TopToolbar() {
  const {
    graph,
    canUndo,
    canRedo,
    undo,
    redo,
    executeGraph,
    isExecuting,
  } = useGraph();

  const { newGraph, loadGraph, setGraphName } = useGraphStore();
  const {
    setViewMode,
    viewMode,
    showToast,
    liveEdit,
    toggleLiveEdit,
    clearAllPreviewSlots,
    restorePreviewSlots,
    previewSlots,
    previewBackgroundActive,
    previewForegroundSlot,
  } = useUiStore();
  const executionStore = useExecutionStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const currentFileHandle = useRef<any>(null);

  // New project
  const handleNew = useCallback(() => {
    if (Object.keys(graph.nodes).length > 0) {
      if (!confirm('Create a new project? Unsaved changes will be lost.')) {
        return;
      }
    }
    currentFileHandle.current = null;
    clearAllPreviewSlots();
    newGraph('Untitled');
  }, [graph.nodes, newGraph, clearAllPreviewSlots]);

  // Open project
  const handleOpen = useCallback(async () => {
    // Use File System Access API if available
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const file = await handle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);
        const loadedGraph = deserializeGraph(json);

        // Restore preview state if available, otherwise clear
        if (json.preview) {
          restorePreviewSlots(json.preview.slots, json.preview.backgroundActive, json.preview.foregroundSlot);
        } else {
          clearAllPreviewSlots();
        }

        loadGraph(loadedGraph);

        // Remember file handle for future Save operations
        currentFileHandle.current = handle;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Open failed:', err);
          showToast('error', 'Failed to open file', 3000);
        }
      }
    } else {
      // Fallback to file input
      fileInputRef.current?.click();
    }
  }, [loadGraph, showToast, clearAllPreviewSlots, restorePreviewSlots]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const loadedGraph = deserializeGraph(json);

        // Restore preview state if available, otherwise clear
        if (json.preview) {
          restorePreviewSlots(json.preview.slots, json.preview.backgroundActive, json.preview.foregroundSlot);
        } else {
          clearAllPreviewSlots();
        }

        loadGraph(loadedGraph);
        // Clear file handle since we used fallback input
        currentFileHandle.current = null;
      } catch (error) {
        alert('Failed to load project file');
        console.error('Load error:', error);
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  }, [loadGraph, clearAllPreviewSlots, restorePreviewSlots]);

  // Save As - show file picker to choose location
  const handleSaveAs = useCallback(async () => {
    const serialized = serializeGraph(graph);
    // Add preview state
    serialized.preview = {
      slots: previewSlots,
      backgroundActive: previewBackgroundActive,
      foregroundSlot: previewForegroundSlot,
    };
    const json = JSON.stringify(serialized, null, 2);

    // Use File System Access API if available
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${graph.name || 'project'}.json`,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();

        // Remember file handle for future Save operations
        currentFileHandle.current = handle;

        // Update graph name from saved filename
        const newName = handle.name.replace(/\.json$/, '');
        setGraphName(newName);
        showToast('success', `Saved as ${handle.name}`, 2000);
      } catch (err: any) {
        // User cancelled the picker
        if (err.name !== 'AbortError') {
          console.error('Save failed:', err);
          showToast('error', 'Failed to save file', 3000);
        }
      }
    } else {
      // Fallback for browsers without File System Access API
      const newName = prompt('Save as:', graph.name || 'project');
      if (!newName) return;

      setGraphName(newName);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${newName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [graph, setGraphName, showToast, previewSlots, previewBackgroundActive, previewForegroundSlot]);

  // Save project - use existing file handle if available, otherwise run Save As
  const handleSave = useCallback(async () => {
    // If no file handle, run Save As instead
    if (!currentFileHandle.current) {
      handleSaveAs();
      return;
    }

    const serialized = serializeGraph(graph);
    // Add preview state
    serialized.preview = {
      slots: previewSlots,
      backgroundActive: previewBackgroundActive,
      foregroundSlot: previewForegroundSlot,
    };
    const json = JSON.stringify(serialized, null, 2);

    try {
      const writable = await currentFileHandle.current.createWritable();
      await writable.write(json);
      await writable.close();
      showToast('success', 'Saved', 1500);
    } catch (err: any) {
      console.error('Save failed:', err);
      showToast('error', 'Failed to save file', 3000);
    }
  }, [graph, showToast, handleSaveAs, previewSlots, previewBackgroundActive, previewForegroundSlot]);

  // Toggle live mode and execute if turning on
  const handleToggleLiveEdit = useCallback(() => {
    const wasOff = !liveEdit;
    toggleLiveEdit();

    // If turning on live mode, trigger execution
    if (wasOff && !executionStore.isExecuting) {
      const freshGraph = useGraphStore.getState().graph;
      executionStore.updateEngineGraph(freshGraph);
      executionStore.execute();
    }
  }, [liveEdit, toggleLiveEdit, executionStore]);

  // Execute
  const handleExecute = useCallback(async () => {
    // Validate first
    const validation = validateGraph(graph);
    if (!validation.valid) {
      const errorMsg = validation.errors.map(e => e.message).join('\n');
      showToast('error', errorMsg, 5000);
      console.error('Validation errors:', validation.errors);
      return;
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => {
        showToast('warning', w.message, 3000);
      });
    }

    try {
      showToast('info', 'Executing graph...', 2000);
      await executeGraph();
      showToast('success', 'Execution complete!', 2000);
    } catch (error) {
      showToast('error', `Execution failed: ${(error as Error).message}`, 5000);
      console.error('Execution error:', error);
    }
  }, [executeGraph, graph, showToast]);

  return (
    <div className="h-12 bg-editor-surface border-b border-editor-border flex items-center px-3 gap-2">
      {/* File menu */}
      <div className="relative" ref={fileMenuRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFileMenuOpen(!fileMenuOpen)}
          onBlur={(e) => {
            // Close menu if focus leaves the menu entirely
            if (!fileMenuRef.current?.contains(e.relatedTarget as Node)) {
              setFileMenuOpen(false);
            }
          }}
        >
          File
          <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
        {fileMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-editor-surface border border-editor-border rounded shadow-lg py-1 min-w-[120px] z-50">
            <button
              className="w-full px-3 py-1.5 text-sm text-left text-editor-text hover:bg-editor-surface-light"
              onClick={() => { handleNew(); setFileMenuOpen(false); }}
            >
              New
            </button>
            <button
              className="w-full px-3 py-1.5 text-sm text-left text-editor-text hover:bg-editor-surface-light"
              onClick={() => { handleOpen(); setFileMenuOpen(false); }}
            >
              Open
            </button>
            <div className="h-px bg-editor-border my-1" />
            <button
              className="w-full px-3 py-1.5 text-sm text-left text-editor-text hover:bg-editor-surface-light"
              onClick={() => { handleSave(); setFileMenuOpen(false); }}
            >
              Save
            </button>
            <button
              className="w-full px-3 py-1.5 text-sm text-left text-editor-text hover:bg-editor-surface-light"
              onClick={() => { handleSaveAs(); setFileMenuOpen(false); }}
            >
              Save As...
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="w-px h-6 bg-editor-border" />

      {/* History */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </Button>
      </div>

      <div className="w-px h-6 bg-editor-border" />

      {/* Execute */}
      <Button
        variant="primary"
        size="sm"
        onClick={handleExecute}
        disabled={isExecuting}
      >
        {isExecuting ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Running...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Execute
          </>
        )}
      </Button>

      {/* Live Edit Toggle */}
      <button
        onClick={handleToggleLiveEdit}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
          liveEdit
            ? 'bg-green-600 text-white'
            : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
        }`}
        title="Auto-execute when parameters change"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Live
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Project name */}
      <input
        type="text"
        value={graph.name}
        onChange={(e) => setGraphName(e.target.value)}
        className="px-2 py-1 bg-transparent border-none text-sm text-editor-text text-center focus:outline-none focus:bg-editor-surface-light rounded"
        style={{ width: '200px' }}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex items-center bg-editor-surface-light rounded overflow-hidden">
        <button
          onClick={() => setViewMode('graph')}
          className={`px-3 py-1 text-xs ${
            viewMode === 'graph'
              ? 'bg-editor-accent text-white'
              : 'text-editor-text-dim hover:text-editor-text'
          }`}
        >
          Graph
        </button>
        <button
          onClick={() => setViewMode('split')}
          className={`px-3 py-1 text-xs ${
            viewMode === 'split'
              ? 'bg-editor-accent text-white'
              : 'text-editor-text-dim hover:text-editor-text'
          }`}
        >
          Split
        </button>
        <button
          onClick={() => setViewMode('preview')}
          className={`px-3 py-1 text-xs ${
            viewMode === 'preview'
              ? 'bg-editor-accent text-white'
              : 'text-editor-text-dim hover:text-editor-text'
          }`}
        >
          Preview
        </button>
      </div>
    </div>
  );
}
