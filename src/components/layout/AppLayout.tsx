import { useEffect } from 'react';
import { useUiStore } from '../../store';
import { useKeyboard } from '../../hooks/useKeyboard';
import { TopToolbar } from './TopToolbar';
import { GraphCanvas, NodePalette } from '../graph';
import { PropertiesPanel } from '../properties';
import { PreviewViewport } from '../preview';
import { ToastContainer } from '../ui';

export function AppLayout() {
  const {
    isMobile,
    setMobile,
    viewMode,
    leftPanelOpen,
    leftPanelWidth,
    toggleLeftPanel,
  } = useUiStore();

  // Initialize keyboard shortcuts
  useKeyboard();

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [setMobile]);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <TopToolbar />
        <ToastContainer />
        <div className="flex-1 relative">
          {viewMode === 'preview' ? (
            <PreviewViewport />
          ) : (
            <GraphCanvas />
          )}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col h-full">
      <TopToolbar />
      <ToastContainer />

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel (Node Palette) */}
        {leftPanelOpen && (
          <div
            className="panel flex-shrink-0 overflow-hidden"
            style={{ width: leftPanelWidth }}
          >
            <NodePalette />
          </div>
        )}

        {/* Panel toggle button (left) */}
        <button
          onClick={toggleLeftPanel}
          className="w-4 flex-shrink-0 bg-editor-surface hover:bg-editor-surface-light border-r border-editor-border flex items-center justify-center text-editor-text-dim hover:text-editor-text transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${leftPanelOpen ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'split' ? (
            <>
              {/* Graph canvas */}
              <div className="flex-1 overflow-hidden">
                <GraphCanvas />
              </div>

              {/* Splitter */}
              <div className="w-1 bg-editor-border flex-shrink-0" />

              {/* Preview */}
              <div className="w-[400px] flex-shrink-0 overflow-hidden">
                <PreviewViewport />
              </div>
            </>
          ) : viewMode === 'preview' ? (
            <PreviewViewport />
          ) : (
            <GraphCanvas />
          )}
        </div>

        {/* Right panel (Properties) - Always visible */}
        <div
          className="panel panel-right flex-shrink-0 overflow-hidden"
          style={{ width: 280 }}
        >
          <PropertiesPanel />
        </div>
      </div>

      {/* Status bar */}
      <div className="h-6 bg-editor-surface border-t border-editor-border flex items-center px-3 text-xs text-editor-text-dim">
        <span>Node Graph Media Editor</span>
        <div className="flex-1" />
        <span>Press Delete to remove selected items</span>
      </div>
    </div>
  );
}
