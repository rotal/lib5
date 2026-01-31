import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useUiStore, useExecutionStore, useAuthStore } from '../../store';
import { Button } from '../ui';
import { serializeGraph, deserializeGraph, DEFAULT_CANVAS } from '../../types/graph';
import { validateGraph } from '../../core/graph/GraphValidator';
import { LoginButton, DriveFileDialog, LocalFileDialog } from '../auth';
import { createFile as driveCreateFile, updateFile as driveUpdateFile } from '../../services/googleDrive';
import { writeLocalFile, pickLocalDir, hasLocalDir } from '../../services/localProject';
import { MemoryMonitor } from './MemoryMonitor';
import { Color } from '../../types/data';

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

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

  const { newGraph, loadGraph, setGraphName, setCanvas, setCanvasDefaultColor } = useGraphStore();
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
  const [widthDropdownOpen, setWidthDropdownOpen] = useState(false);
  const [heightDropdownOpen, setHeightDropdownOpen] = useState(false);
  const [ratioDropdownOpen, setRatioDropdownOpen] = useState(false);
  const [defaultColorDropdownOpen, setDefaultColorDropdownOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const widthDropdownRef = useRef<HTMLDivElement>(null);
  const heightDropdownRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const defaultColorRef = useRef<HTMLDivElement>(null);

  // Popular resolution presets
  const resolutionPresets = [
    { label: '256', value: 256 },
    { label: '512', value: 512 },
    { label: '1K', value: 1024 },
    { label: '1920', value: 1920 },
    { label: '2K', value: 2048 },
    { label: '4K', value: 4096 },
    { label: '8K', value: 8192 },
  ];

  // Aspect ratio presets
  const aspectRatioPresets = [
    { label: '1:1', width: 1, height: 1 },
    { label: '4:3', width: 4, height: 3 },
    { label: '16:9', width: 16, height: 9 },
    { label: '16:10', width: 16, height: 10 },
    { label: '21:9', width: 21, height: 9 },
    { label: '3:2', width: 3, height: 2 },
    { label: '2:3', width: 2, height: 3 },
    { label: '9:16', width: 9, height: 16 },
  ];

  // Default color presets (RGBA 0.0-1.0)
  const defaultColorPresets: { label: string; color: Color }[] = [
    { label: 'Transparent', color: { r: 0, g: 0, b: 0, a: 0 } },
    { label: 'Black', color: { r: 0, g: 0, b: 0, a: 1 } },
    { label: 'White', color: { r: 1, g: 1, b: 1, a: 1 } },
    { label: 'Gray', color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
  ];

  // Get current default color
  const currentDefaultColor = graph.canvas?.defaultColor ?? DEFAULT_CANVAS.defaultColor ?? { r: 0, g: 0, b: 0, a: 0 };

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
      // Set error states on nodes with validation errors
      const nodeErrors = validation.errors
        .filter(e => e.nodeId)
        .map(e => ({ nodeId: e.nodeId!, message: e.message }));
      executionStore.setNodeErrors(nodeErrors);

      const errorMsg = validation.errors.map(e => e.message).join('\n');
      showToast('error', errorMsg, 5000);
      console.error('Validation errors:', validation.errors);
      return;
    }

    // Clear any previous validation errors
    executionStore.clearNodeErrors();

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => {
        showToast('warning', w.message, 3000);
      });
    }

    try {
      showToast('info', 'Executing graph...', 2000);
      // Update engine with latest graph before executing
      executionStore.updateEngineGraph(graph);
      await executeGraph();
      showToast('success', 'Execution complete!', 2000);
    } catch (error) {
      showToast('error', `Execution failed: ${(error as Error).message}`, 5000);
      console.error('Execution error:', error);
    }
  }, [executeGraph, executionStore, graph, showToast]);

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
    if (!mobileMenuOpen && !fileMenuOpen && !widthDropdownOpen && !heightDropdownOpen && !ratioDropdownOpen && !defaultColorDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
      if (widthDropdownRef.current && !widthDropdownRef.current.contains(e.target as Node)) {
        setWidthDropdownOpen(false);
      }
      if (heightDropdownRef.current && !heightDropdownRef.current.contains(e.target as Node)) {
        setHeightDropdownOpen(false);
      }
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(e.target as Node)) {
        setRatioDropdownOpen(false);
      }
      if (defaultColorRef.current && !defaultColorRef.current.contains(e.target as Node)) {
        setDefaultColorDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen, fileMenuOpen, widthDropdownOpen, heightDropdownOpen, ratioDropdownOpen, defaultColorDropdownOpen]);

  // Handle width preset selection
  const handleWidthPreset = useCallback((width: number) => {
    const currentHeight = graph.canvas?.height ?? 1080;
    if (canvasLocked) {
      const currentWidth = graph.canvas?.width ?? 1920;
      const ratio = currentHeight / currentWidth;
      const newHeight = Math.round(width * ratio);
      setCanvas(width, newHeight);
      setCanvasWidthInput(String(width));
      setCanvasHeightInput(String(newHeight));
    } else {
      setCanvas(width, currentHeight);
      setCanvasWidthInput(String(width));
    }
    setWidthDropdownOpen(false);
  }, [graph.canvas, canvasLocked, setCanvas]);

  // Handle height preset selection
  const handleHeightPreset = useCallback((height: number) => {
    const currentWidth = graph.canvas?.width ?? 1920;
    if (canvasLocked) {
      const currentHeight = graph.canvas?.height ?? 1080;
      const ratio = currentWidth / currentHeight;
      const newWidth = Math.round(height * ratio);
      setCanvas(newWidth, height);
      setCanvasWidthInput(String(newWidth));
      setCanvasHeightInput(String(height));
    } else {
      setCanvas(currentWidth, height);
      setCanvasHeightInput(String(height));
    }
    setHeightDropdownOpen(false);
  }, [graph.canvas, canvasLocked, setCanvas]);

  // Handle aspect ratio preset selection
  const handleAspectRatioPreset = useCallback((ratioWidth: number, ratioHeight: number) => {
    const currentWidth = graph.canvas?.width ?? 1920;
    // Keep current width, adjust height to match aspect ratio
    const newHeight = Math.round(currentWidth * ratioHeight / ratioWidth);
    setCanvas(currentWidth, newHeight);
    setCanvasWidthInput(String(currentWidth));
    setCanvasHeightInput(String(newHeight));
    setCanvasLocked(true);
    setRatioDropdownOpen(false);
  }, [graph.canvas, setCanvas]);

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

      {/* Settings */}
      <button className="dropdown-item w-full" onClick={() => { setViewMode('settings'); setMobileMenuOpen(false); }}>
        <SettingsIcon /> Settings
      </button>

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
          <Button variant="primary" size="sm" onClick={handleExecute} disabled={isExecuting} title="Execute graph">
            {isExecuting ? (
              <div className="w-4 h-4 spinner" />
            ) : (
              <PlayIcon />
            )}
          </Button>

          <div className="flex-1" />

          {/* Project name */}
          <input
            type="text"
            value={graph.name}
            onChange={(e) => setGraphName(e.target.value)}
            className="h-7 px-3 bg-editor-surface-light/50 border border-editor-border rounded-lg text-sm text-editor-text text-center focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent/20 transition-all w-[180px]"
            placeholder="Project name"
          />

          {/* Canvas size */}
          <div className="flex items-center gap-1 text-sm text-editor-text-secondary">
            {/* Aspect ratio dropdown */}
            <div className="relative" ref={ratioDropdownRef}>
              <button
                onClick={() => setRatioDropdownOpen(!ratioDropdownOpen)}
                className="h-7 px-2 bg-editor-surface-light/50 border border-editor-border rounded-lg hover:bg-editor-surface-light transition-colors flex items-center gap-1"
                title="Aspect ratio presets"
              >
                {(() => {
                  const w = graph.canvas?.width ?? 1920;
                  const h = graph.canvas?.height ?? 1080;
                  const maxSize = 14;
                  const ratio = w / h;
                  const rectW = ratio >= 1 ? maxSize : Math.round(maxSize * ratio);
                  const rectH = ratio <= 1 ? maxSize : Math.round(maxSize / ratio);
                  const x = (maxSize - rectW) / 2;
                  const y = (maxSize - rectH) / 2;
                  return (
                    <svg className="w-3.5 h-3.5" viewBox={`0 0 ${maxSize} ${maxSize}`} fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <rect x={x} y={y} width={rectW} height={rectH} rx={1} />
                    </svg>
                  );
                })()}
                <ChevronDownIcon />
              </button>
              {ratioDropdownOpen && (
                <div className="dropdown-menu absolute top-full left-0 mt-1 z-50 min-w-[80px]">
                  {aspectRatioPresets.map((preset) => (
                    <button
                      key={preset.label}
                      className="dropdown-item w-full text-left"
                      onClick={() => handleAspectRatioPreset(preset.width, preset.height)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Width input with dropdown */}
            <div className="relative flex items-center" ref={widthDropdownRef}>
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
                className="w-14 h-7 px-2 bg-editor-surface-light/50 border border-editor-border rounded-l-lg text-center focus:outline-none focus:text-editor-text focus:border-editor-accent"
              />
              <button
                onClick={() => setWidthDropdownOpen(!widthDropdownOpen)}
                className="h-7 px-1.5 bg-editor-surface-light/50 border border-l-0 border-editor-border rounded-r-lg hover:bg-editor-surface-light transition-colors flex items-center"
                title="Width presets"
              >
                <ChevronDownIcon />
              </button>
              {widthDropdownOpen && (
                <div className="dropdown-menu absolute top-full left-0 mt-1 z-50 min-w-[70px]">
                  {resolutionPresets.map((preset) => (
                    <button
                      key={preset.value}
                      className="dropdown-item w-full text-left"
                      onClick={() => handleWidthPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lock button */}
            <button
              onClick={() => setCanvasLocked(!canvasLocked)}
              className={`h-7 w-7 flex items-center justify-center rounded-lg transition-colors ${
                canvasLocked
                  ? 'bg-editor-accent/20 text-editor-accent'
                  : 'text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light'
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

            {/* Height input with dropdown */}
            <div className="relative flex items-center" ref={heightDropdownRef}>
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
                className="w-14 h-7 px-2 bg-editor-surface-light/50 border border-editor-border rounded-l-lg text-center focus:outline-none focus:text-editor-text focus:border-editor-accent"
              />
              <button
                onClick={() => setHeightDropdownOpen(!heightDropdownOpen)}
                className="h-7 px-1.5 bg-editor-surface-light/50 border border-l-0 border-editor-border rounded-r-lg hover:bg-editor-surface-light transition-colors flex items-center"
                title="Height presets"
              >
                <ChevronDownIcon />
              </button>
              {heightDropdownOpen && (
                <div className="dropdown-menu absolute top-full left-0 mt-1 z-50 min-w-[70px]">
                  {resolutionPresets.map((preset) => (
                    <button
                      key={preset.value}
                      className="dropdown-item w-full text-left"
                      onClick={() => handleHeightPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Default color picker */}
            <div className="relative" ref={defaultColorRef}>
              <button
                onClick={() => setDefaultColorDropdownOpen(!defaultColorDropdownOpen)}
                className="h-7 w-7 flex items-center justify-center bg-editor-surface-light/50 border border-editor-border rounded-lg hover:bg-editor-surface-light transition-colors"
                title="Default background color (for smart transform baking)"
              >
                {/* Color swatch with checkerboard for alpha */}
                <div className="w-4 h-4 rounded relative overflow-hidden border border-editor-border">
                  {/* Checkerboard pattern for transparency */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: 'linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                    }}
                  />
                  {/* Actual color overlay */}
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: `rgba(${Math.round(currentDefaultColor.r * 255)}, ${Math.round(currentDefaultColor.g * 255)}, ${Math.round(currentDefaultColor.b * 255)}, ${currentDefaultColor.a})`,
                    }}
                  />
                </div>
              </button>
              {defaultColorDropdownOpen && (
                <div className="dropdown-menu absolute top-full right-0 mt-1 z-50 min-w-[120px]">
                  {defaultColorPresets.map((preset) => (
                    <button
                      key={preset.label}
                      className="dropdown-item w-full text-left flex items-center gap-2"
                      onClick={() => {
                        setCanvasDefaultColor(preset.color);
                        setDefaultColorDropdownOpen(false);
                      }}
                    >
                      <div className="w-4 h-4 rounded relative overflow-hidden border border-editor-border">
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundImage: 'linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)',
                            backgroundSize: '6px 6px',
                            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                          }}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: `rgba(${Math.round(preset.color.r * 255)}, ${Math.round(preset.color.g * 255)}, ${Math.round(preset.color.b * 255)}, ${preset.color.a})`,
                          }}
                        />
                      </div>
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1" />

          {/* View mode toggle */}
          <ViewModeToggle />

          {/* Memory monitor */}
          <MemoryMonitor />

          {/* Settings button */}
          <Button
            variant={viewMode === 'settings' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode(viewMode === 'settings' ? 'split' : 'settings')}
            title="Settings"
          >
            <SettingsIcon />
          </Button>

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
