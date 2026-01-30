import { useEffect, useState, useCallback } from 'react';
import { useUiStore } from '../../store';
import { useKeyboard } from '../../hooks/useKeyboard';
import { TopToolbar } from './TopToolbar';
import { GraphCanvas, NodePalette } from '../graph';
import { PropertiesPanel } from '../properties';
import { PreviewViewport } from '../preview';
import { ToastContainer } from '../ui';
import { MobileBottomNav, MobileBottomSheet } from '../mobile';
import type { PanelId } from '../../store/uiStore';

// Panel toggle button component
function PanelToggle({
  direction,
  isOpen,
  onClick
}: {
  direction: 'left' | 'right';
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-3 flex-shrink-0 flex items-center justify-center relative transition-all duration-200 hover:w-4"
      aria-label={`${isOpen ? 'Close' : 'Open'} ${direction} panel`}
    >
      {/* Background gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-editor-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Divider line */}
      <div className={`absolute ${direction === 'left' ? 'right-0' : 'left-0'} top-0 bottom-0 w-px bg-editor-border group-hover:bg-editor-border-light transition-colors`} />

      {/* Arrow icon */}
      <svg
        className={`w-2.5 h-2.5 text-editor-text-dim group-hover:text-editor-text transition-all duration-200 ${
          direction === 'left'
            ? (isOpen ? '' : 'rotate-180')
            : (isOpen ? 'rotate-180' : '')
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

export function AppLayout() {
  const {
    isMobile,
    setMobile,
    viewMode,
    leftPanelOpen,
    leftPanelWidth,
    toggleLeftPanel,
    rightPanelOpen,
    rightPanelWidth,
    toggleRightPanel,
  } = useUiStore();

  // Initialize keyboard shortcuts
  useKeyboard();

  // Mobile panel state
  const [activeSheet, setActiveSheet] = useState<PanelId | null>(null);

  const handlePanelChange = useCallback((panel: PanelId | null) => {
    setActiveSheet(panel);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setActiveSheet(null);
    useUiStore.getState().setActiveMobilePanel(null);
  }, []);

  // Detect mobile with debounce
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setMobile(window.innerWidth < 768);
      }, 100);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkMobile);
    };
  }, [setMobile]);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-editor-bg">
        {/* Top toolbar */}
        <TopToolbar />

        {/* Toast container */}
        <ToastContainer />

        {/* Main content area */}
        <div className="flex-1 relative overflow-hidden">
          {viewMode === 'preview' ? (
            <PreviewViewport />
          ) : (
            <GraphCanvas />
          )}
        </div>

        {/* Bottom sheets */}
        <MobileBottomSheet
          isOpen={activeSheet === 'palette'}
          onClose={handleCloseSheet}
          title="Add Node"
        >
          <NodePalette />
        </MobileBottomSheet>

        <MobileBottomSheet
          isOpen={activeSheet === 'properties'}
          onClose={handleCloseSheet}
          title="Properties"
        >
          <PropertiesPanel />
        </MobileBottomSheet>

        {/* Bottom navigation */}
        <MobileBottomNav onPanelChange={handlePanelChange} />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col h-full bg-editor-bg">
      {/* Top toolbar */}
      <TopToolbar />

      {/* Toast container */}
      <ToastContainer />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel (Node Palette) */}
        <div
          className={`panel flex-shrink-0 overflow-hidden transition-all duration-300 ease-out ${
            leftPanelOpen ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
          style={{ width: leftPanelOpen ? leftPanelWidth : 0 }}
        >
          <div className="h-full overflow-y-auto">
            <NodePalette />
          </div>
        </div>

        {/* Left panel toggle */}
        <PanelToggle
          direction="left"
          isOpen={leftPanelOpen}
          onClick={toggleLeftPanel}
        />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden min-w-0">
          {viewMode === 'split' ? (
            <>
              {/* Graph canvas */}
              <div className="flex-1 overflow-hidden min-w-[200px]">
                <GraphCanvas />
              </div>

              {/* Vertical splitter */}
              <div className="w-px bg-editor-border flex-shrink-0 relative group cursor-col-resize">
                <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-editor-accent/20 transition-colors" />
              </div>

              {/* Preview viewport */}
              <div className="w-[400px] flex-shrink-0 overflow-hidden min-w-[300px]">
                <PreviewViewport />
              </div>
            </>
          ) : viewMode === 'preview' ? (
            <PreviewViewport />
          ) : (
            <GraphCanvas />
          )}
        </div>

        {/* Right panel toggle */}
        <PanelToggle
          direction="right"
          isOpen={rightPanelOpen}
          onClick={toggleRightPanel}
        />

        {/* Right panel (Properties) */}
        <div
          className={`panel panel-right flex-shrink-0 overflow-hidden transition-all duration-300 ease-out ${
            rightPanelOpen ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
          style={{ width: rightPanelOpen ? rightPanelWidth : 0 }}
        >
          <div className="h-full overflow-y-auto">
            <PropertiesPanel />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="h-7 bg-editor-surface-solid border-t border-editor-border flex items-center px-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-editor-success animate-pulse" />
          <span className="text-editor-text-secondary font-medium">ImageFlow</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-editor-text-dim">
          <span className="hidden sm:inline">
            <kbd className="px-1.5 py-0.5 bg-editor-surface rounded text-[10px] font-mono">Delete</kbd>
            <span className="ml-1.5">Remove selected</span>
          </span>
          <span className="hidden md:inline">
            <kbd className="px-1.5 py-0.5 bg-editor-surface rounded text-[10px] font-mono">Ctrl+S</kbd>
            <span className="ml-1.5">Save</span>
          </span>
        </div>
      </div>
    </div>
  );
}
