import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useUiStore, useExecutionStore, useAuthStore } from '../../store';
import { Button } from '../ui';
import { serializeGraph, deserializeGraph } from '../../types/graph';
import { validateGraph } from '../../core/graph/GraphValidator';
import { LoginButton, DriveFileDialog, LocalFileDialog } from '../auth';
import { createFile as driveCreateFile, updateFile as driveUpdateFile } from '../../services/googleDrive';
import { writeLocalFile, pickLocalDir, hasLocalDir } from '../../services/localProject';

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

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  // Google Drive state
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentDriveFileId = useAuthStore((s) => s.currentDriveFileId);
  const setCurrentDriveFileId = useAuthStore((s) => s.setCurrentDriveFileId);
  const isLoggedIn = !!accessToken;
  const [driveDialogMode, setDriveDialogMode] = useState<'open' | 'save' | null>(null);

  // Local project folder state
  const [localDialogMode, setLocalDialogMode] = useState<'open' | 'save' | null>(null);
  const currentLocalFileName = useRef<string | null>(null);

  // New project
  const handleNew = useCallback(() => {
    if (Object.keys(graph.nodes).length > 0) {
      if (!confirm('Create a new project? Unsaved changes will be lost.')) {
        return;
      }
    }
    currentLocalFileName.current = null;
    setCurrentDriveFileId(null);
    clearAllPreviewSlots();
    newGraph('Untitled');
  }, [graph.nodes, newGraph, clearAllPreviewSlots, setCurrentDriveFileId]);

  // Open project
  const handleOpen = useCallback(() => {
    if (isLoggedIn) {
      setDriveDialogMode('open');
    } else {
      setLocalDialogMode('open');
    }
  }, [isLoggedIn]);

  // Build serialized graph with preview state
  const buildSaveData = useCallback(() => {
    const serialized = serializeGraph(graph);
    serialized.preview = {
      slots: previewSlots,
      backgroundActive: previewBackgroundActive,
      foregroundSlot: previewForegroundSlot,
    };
    return serialized;
  }, [graph, previewSlots, previewBackgroundActive, previewForegroundSlot]);

  // Save project silently - no dialog, creates new file if needed
  const handleSave = useCallback(async () => {
    const serialized = buildSaveData();

    if (isLoggedIn) {
      try {
        if (currentDriveFileId) {
          await driveUpdateFile(currentDriveFileId, serialized);
        } else {
          const file = await driveCreateFile(graph.name || 'Untitled', serialized);
          setCurrentDriveFileId(file.id);
        }
        showToast('success', 'Saved to Drive', 1500);
      } catch (err: any) {
        console.error('Drive save failed:', err);
        showToast('error', err?.message || 'Failed to save to Drive', 3000);
      }
      return;
    }

    // Local save
    try {
      if (!hasLocalDir()) {
        const picked = await pickLocalDir();
        if (!picked) return;
      }
      const fileName = currentLocalFileName.current || `${graph.name || 'Untitled'}.l5`;
      await writeLocalFile(fileName, serialized);
      currentLocalFileName.current = fileName.endsWith('.l5') ? fileName : `${fileName}.l5`;
      showToast('success', 'Saved', 1500);
    } catch (err: any) {
      console.error('Local save failed:', err);
      showToast('error', err?.message || 'Failed to save file', 3000);
    }
  }, [buildSaveData, graph.name, showToast, isLoggedIn, currentDriveFileId, setCurrentDriveFileId]);

  // Save As - show file dialog to pick name/location
  const handleSaveAs = useCallback(() => {
    if (isLoggedIn) {
      setDriveDialogMode('save');
    } else {
      setLocalDialogMode('save');
    }
  }, [isLoggedIn]);

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

  // Drive dialog: open file callback
  const handleDriveOpen = useCallback((content: any, fileId: string, fileName: string) => {
    try {
      const loadedGraph = deserializeGraph(content);
      if (content.preview) {
        restorePreviewSlots(content.preview.slots, content.preview.backgroundActive, content.preview.foregroundSlot);
      } else {
        clearAllPreviewSlots();
      }
      loadGraph(loadedGraph);
      setCurrentDriveFileId(fileId);
      currentLocalFileName.current = null;
      showToast('success', `Opened ${fileName}`, 2000);
    } catch (err) {
      console.error('Failed to load Drive file:', err);
      showToast('error', 'Failed to load file', 3000);
    }
    setDriveDialogMode(null);
  }, [loadGraph, clearAllPreviewSlots, restorePreviewSlots, setCurrentDriveFileId, showToast]);

  // Drive dialog: provide serialized content for saving
  const handleDriveSaveContent = useCallback(async (fileName: string): Promise<object> => {
    const serialized = serializeGraph(graph);
    serialized.preview = {
      slots: previewSlots,
      backgroundActive: previewBackgroundActive,
      foregroundSlot: previewForegroundSlot,
    };
    setGraphName(fileName);
    return serialized;
  }, [graph, previewSlots, previewBackgroundActive, previewForegroundSlot, setGraphName]);

  // Drive dialog: close handler (cancel or after action)
  const handleDriveDialogClose = useCallback(() => {
    setDriveDialogMode(null);
  }, []);

  // Drive dialog: save success handler
  const handleDriveSaved = useCallback(() => {
    showToast('success', 'Saved to Drive', 2000);
  }, [showToast]);

  // Local dialog: open file callback
  const handleLocalOpen = useCallback((content: any, fileName: string) => {
    try {
      const loadedGraph = deserializeGraph(content);
      if (content.preview) {
        restorePreviewSlots(content.preview.slots, content.preview.backgroundActive, content.preview.foregroundSlot);
      } else {
        clearAllPreviewSlots();
      }
      loadGraph(loadedGraph);
      currentLocalFileName.current = fileName;
      setCurrentDriveFileId(null);
      showToast('success', `Opened ${fileName}`, 2000);
    } catch (err) {
      console.error('Failed to load local file:', err);
      showToast('error', 'Failed to load file', 3000);
    }
    setLocalDialogMode(null);
  }, [loadGraph, clearAllPreviewSlots, restorePreviewSlots, setCurrentDriveFileId, showToast]);

  // Local dialog: provide serialized content for saving
  const handleLocalSaveContent = useCallback(async (fileName: string): Promise<object> => {
    const serialized = serializeGraph(graph);
    serialized.preview = {
      slots: previewSlots,
      backgroundActive: previewBackgroundActive,
      foregroundSlot: previewForegroundSlot,
    };
    setGraphName(fileName);
    currentLocalFileName.current = fileName.endsWith('.l5') ? fileName : `${fileName}.l5`;
    return serialized;
  }, [graph, previewSlots, previewBackgroundActive, previewForegroundSlot, setGraphName]);

  // Local dialog: close handler
  const handleLocalDialogClose = useCallback(() => {
    setLocalDialogMode(null);
  }, []);

  // Local dialog: save success handler
  const handleLocalSaved = useCallback(() => {
    showToast('success', 'Saved', 2000);
  }, [showToast]);

  // Ctrl+S global shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cmdOrCtrl = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

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

      {/* Google Login */}
      <LoginButton />

      {/* Drive file dialog */}
      {driveDialogMode && (
        <DriveFileDialog
          mode={driveDialogMode}
          defaultName={graph.name || 'Untitled'}
          onOpenFile={handleDriveOpen}
          onSaveFile={handleDriveSaveContent}
          onSaved={handleDriveSaved}
          onClose={handleDriveDialogClose}
        />
      )}

      {/* Local file dialog */}
      {localDialogMode && (
        <LocalFileDialog
          mode={localDialogMode}
          defaultName={graph.name || 'Untitled'}
          onOpenFile={handleLocalOpen}
          onSaveFile={handleLocalSaveContent}
          onSaved={handleLocalSaved}
          onClose={handleLocalDialogClose}
        />
      )}
    </div>
  );
}
