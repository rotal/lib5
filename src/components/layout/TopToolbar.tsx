import React, { useCallback, useRef } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useUiStore } from '../../store';
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
  const { setViewMode, viewMode, showToast, liveEdit, toggleLiveEdit } = useUiStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // New project
  const handleNew = useCallback(() => {
    if (Object.keys(graph.nodes).length > 0) {
      if (!confirm('Create a new project? Unsaved changes will be lost.')) {
        return;
      }
    }
    newGraph('Untitled');
  }, [graph.nodes, newGraph]);

  // Open project
  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const loadedGraph = deserializeGraph(json);
        loadGraph(loadedGraph);
      } catch (error) {
        alert('Failed to load project file');
        console.error('Load error:', error);
      }
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = '';
  }, [loadGraph]);

  // Save project
  const handleSave = useCallback(() => {
    const serialized = serializeGraph(graph);
    const json = JSON.stringify(serialized, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${graph.name || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [graph]);

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
      {/* File operations */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleNew}>
          New
        </Button>
        <Button variant="ghost" size="sm" onClick={handleOpen}>
          Open
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSave}>
          Save
        </Button>
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
        onClick={toggleLiveEdit}
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
