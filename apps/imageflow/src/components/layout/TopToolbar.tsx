import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useUiStore, useExecutionStore, useAuthStore } from '../../store';
import { Button } from '../ui';
import { serializeGraph, deserializeGraph } from '../../types/graph';
import { validateGraph } from '../../core/graph/GraphValidator';
import { LoginButton, DriveFileDialog, LocalFileDialog } from '../auth';
import { createFile as driveCreateFile, updateFile as driveUpdateFile } from '../../services/googleDrive';
import { writeLocalFile, pickLocalDir, hasLocalDir } from '../../services/localProject';

// Modern icon components
const UndoIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

const RedoIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
  </svg>
);

const LiveIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-3 h-3 ml-1 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const FileIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

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

  const { newGraph, loadGraph, setGraphName, setCanvas } = useGraphStore();
  const {
    isMobile,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [canvasLocked, setCanvasLocked] = useState(false); // Lock aspect ratio
  const [canvasWidthInput, setCanvasWidthInput] = useState(String(graph.canvas?.width ?? 1920));
  const [canvasHeightInput, setCanvasHeightInput] = useState(String(graph.canvas?.height ?? 1080));
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Sync local canvas inputs when graph canvas changes externally
  useEffect(() => {
    setCanvasWidthInput(String(graph.canvas?.width ?? 1920));
    setCanvasHeightInput(String(graph.canvas?.height ?? 1080));
  }, [graph.canvas?.width, graph.canvas?.height]);

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

  // Save project
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

  // Save As
  const handleSaveAs = useCallback(() => {
    if (isLoggedIn) {
      setDriveDialogMode('save');
    } else {
      setLocalDialogMode('save');
    }
  }, [isLoggedIn]);

  // Toggle live edit
  const handleToggleLiveEdit = useCallback(() => {
    const wasOff = !liveEdit;
    toggleLiveEdit();

    if (wasOff && !executionStore.isExecuting) {
      const freshGraph = useGraphStore.getState().graph;
      executionStore.updateEngineGraph(freshGraph);
      executionStore.execute();
    }
  }, [liveEdit, toggleLiveEdit, executionStore]);

  // Execute
  const handleExecute = useCallback(async () => {
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

  // Drive dialog handlers
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

  const handleDriveDialogClose = useCallback(() => {
    setDriveDialogMode(null);
  }, []);

  const handleDriveSaved = useCallback(() => {
    showToast('success', 'Saved to Drive', 2000);
  }, [showToast]);

  // Local dialog handlers
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

  const handleLocalDialogClose = useCallback(() => {
    setLocalDialogMode(null);
  }, []);

  const handleLocalSaved = useCallback(() => {
    showToast('success', 'Saved', 2000);
  }, [showToast]);

  // Ctrl+S shortcut
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

  // Close menus on click outside
  useEffect(() => {
    if (!mobileMenuOpen && !fileMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen, fileMenuOpen]);

  // View mode toggle
  const ViewModeToggle = () => (
    <div className="flex items-center bg-editor-surface-solid rounded-lg p-0.5 border border-editor-border">
      {(['graph', 'split', 'preview'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            viewMode === mode
              ? 'bg-editor-accent text-white shadow-sm'
              : 'text-editor-text-dim hover:text-editor-text'
          }`}
        >
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );

  // File menu dropdown
  const FileMenuDropdown = ({ onClose }: { onClose: () => void }) => (
    <div className="dropdown-menu absolute top-full left-0 mt-1.5 z-50 min-w-[140px]">
      <button className="dropdown-item w-full" onClick={() => { handleNew(); onClose(); }}>
        <FileIcon />
        New
        <span className="ml-auto text-editor-text-dim text-[10px]">Ctrl+N</span>
      </button>
      <button className="dropdown-item w-full" onClick={() => { handleOpen(); onClose(); }}>
        Open...
        <span className="ml-auto text-editor-text-dim text-[10px]">Ctrl+O</span>
      </button>
      <div className="dropdown-divider" />
      <button className="dropdown-item w-full" onClick={() => { handleSave(); onClose(); }}>
        Save
        <span className="ml-auto text-editor-text-dim text-[10px]">Ctrl+S</span>
      </button>
      <button className="dropdown-item w-full" onClick={() => { handleSaveAs(); onClose(); }}>
        Save As...
      </button>
    </div>
  );

  // Mobile menu content
  const MobileMenuContent = () => (
    <div className="dropdown-menu absolute top-full right-0 mt-1.5 z-50 min-w-[200px]">
      {/* File section */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-editor-text-dim uppercase tracking-wider">File</div>
      <button className="dropdown-item w-full" onClick={() => { handleNew(); setMobileMenuOpen(false); }}>New</button>
      <button className="dropdown-item w-full" onClick={() => { handleOpen(); setMobileMenuOpen(false); }}>Open</button>
      <button className="dropdown-item w-full" onClick={() => { handleSave(); setMobileMenuOpen(false); }}>Save</button>
      <button className="dropdown-item w-full" onClick={() => { handleSaveAs(); setMobileMenuOpen(false); }}>Save As...</button>

      <div className="dropdown-divider" />

      {/* History section */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-editor-text-dim uppercase tracking-wider">History</div>
      <button
        className={`dropdown-item w-full ${!canUndo ? 'disabled' : ''}`}
        onClick={() => { if (canUndo) { undo(); setMobileMenuOpen(false); } }}
        disabled={!canUndo}
      >
        <UndoIcon /> Undo
      </button>
      <button
        className={`dropdown-item w-full ${!canRedo ? 'disabled' : ''}`}
        onClick={() => { if (canRedo) { redo(); setMobileMenuOpen(false); } }}
        disabled={!canRedo}
      >
        <RedoIcon /> Redo
      </button>

      <div className="dropdown-divider" />

      {/* View section */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-editor-text-dim uppercase tracking-wider">View</div>
      <div className="px-3 py-2">
        <ViewModeToggle />
      </div>

      <div className="dropdown-divider" />

      {/* Account section */}
      <div className="px-3 py-2">
        <LoginButton />
      </div>
    </div>
  );

  return (
    <div className="h-12 bg-editor-surface-solid/95 backdrop-blur-xl border-b border-editor-border flex items-center px-3 gap-2 safe-area-pt relative z-50 overflow-visible">
      {/* Mobile layout */}
      {isMobile ? (
        <>
          {/* Execute button */}
          <Button variant="primary" size="sm" onClick={handleExecute} disabled={isExecuting}>
            {isExecuting ? (
              <div className="w-4 h-4 spinner" />
            ) : (
              <PlayIcon />
            )}
          </Button>

          {/* Live toggle */}
          <button
            onClick={handleToggleLiveEdit}
            className={`p-2 rounded-lg transition-all duration-200 ${
              liveEdit
                ? 'bg-editor-success text-white shadow-sm'
                : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
            }`}
            title="Auto-execute on changes"
          >
            <LiveIcon />
          </button>

          <div className="flex-1" />

          {/* Project name */}
          <input
            type="text"
            value={graph.name}
            onChange={(e) => setGraphName(e.target.value)}
            className="px-2 py-1 bg-transparent text-sm text-editor-text text-center focus:outline-none focus:bg-editor-surface rounded-lg max-w-[100px] transition-colors"
          />

          <div className="flex-1" />

          {/* Menu button */}
          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-editor-text-secondary hover:text-editor-text hover:bg-editor-surface-light rounded-lg transition-colors"
            >
              <MenuIcon />
            </button>
            {mobileMenuOpen && <MobileMenuContent />}
          </div>
        </>
      ) : (
        /* Desktop layout */
        <>
          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-editor-accent to-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5z" />
              </svg>
            </div>
          </div>

          {/* File menu */}
          <div className="relative" ref={fileMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFileMenuOpen(!fileMenuOpen)}
            >
              File
              <ChevronDownIcon />
            </Button>
            {fileMenuOpen && <FileMenuDropdown onClose={() => setFileMenuOpen(false)} />}
          </div>

          <div className="w-px h-5 bg-editor-border mx-1" />

          {/* History buttons */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <UndoIcon />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              <RedoIcon />
            </Button>
          </div>

          <div className="w-px h-5 bg-editor-border mx-1" />

          {/* Execute */}
          <Button variant="primary" size="sm" onClick={handleExecute} disabled={isExecuting}>
            {isExecuting ? (
              <>
                <div className="w-3 h-3 spinner" />
                Running...
              </>
            ) : (
              <>
                <PlayIcon />
                Execute
              </>
            )}
          </Button>

          {/* Live toggle */}
          <button
            onClick={handleToggleLiveEdit}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              liveEdit
                ? 'bg-editor-success text-white shadow-sm'
                : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text border border-editor-border'
            }`}
            title="Auto-execute on changes"
          >
            <LiveIcon />
            Live
          </button>

          <div className="flex-1" />

          {/* Project name */}
          <input
            type="text"
            value={graph.name}
            onChange={(e) => setGraphName(e.target.value)}
            className="px-3 py-1.5 bg-editor-surface-light/50 border border-editor-border rounded-lg text-sm text-editor-text text-center focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent/20 transition-all w-[180px]"
            placeholder="Project name"
          />

          {/* Canvas size */}
          <div className="flex items-center gap-1 px-2 py-1 bg-editor-surface-light/50 border border-editor-border rounded-lg text-xs text-editor-text-secondary">
            <input
              type="text"
              value={canvasWidthInput}
              onChange={(e) => setCanvasWidthInput(e.target.value)}
              onBlur={() => {
                const newWidth = Math.max(1, Math.min(8192, parseInt(canvasWidthInput) || 1920));
                const currentWidth = graph.canvas?.width ?? 1920;
                const currentHeight = graph.canvas?.height ?? 1080;
                if (canvasLocked && currentWidth > 0) {
                  const ratio = currentHeight / currentWidth;
                  const newHeight = Math.round(newWidth * ratio);
                  setCanvas(newWidth, newHeight);
                  setCanvasHeightInput(String(newHeight));
                } else {
                  setCanvas(newWidth, currentHeight);
                }
                setCanvasWidthInput(String(newWidth));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-12 bg-transparent text-center focus:outline-none focus:text-editor-text"
            />
            <button
              onClick={() => setCanvasLocked(!canvasLocked)}
              className={`p-0.5 rounded transition-colors ${
                canvasLocked
                  ? 'text-editor-accent'
                  : 'text-editor-text-dim hover:text-editor-text'
              }`}
              title={canvasLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            >
              {canvasLocked ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>
            <input
              type="text"
              value={canvasHeightInput}
              onChange={(e) => setCanvasHeightInput(e.target.value)}
              onBlur={() => {
                const newHeight = Math.max(1, Math.min(8192, parseInt(canvasHeightInput) || 1080));
                const currentWidth = graph.canvas?.width ?? 1920;
                const currentHeight = graph.canvas?.height ?? 1080;
                if (canvasLocked && currentHeight > 0) {
                  const ratio = currentWidth / currentHeight;
                  const newWidth = Math.round(newHeight * ratio);
                  setCanvas(newWidth, newHeight);
                  setCanvasWidthInput(String(newWidth));
                } else {
                  setCanvas(currentWidth, newHeight);
                }
                setCanvasHeightInput(String(newHeight));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-12 bg-transparent text-center focus:outline-none focus:text-editor-text"
            />
          </div>

          <div className="flex-1" />

          {/* View mode toggle */}
          <ViewModeToggle />

          {/* Login button */}
          <LoginButton />
        </>
      )}

      {/* Dialogs */}
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
