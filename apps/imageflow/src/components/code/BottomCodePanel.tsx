import { useCallback, useRef, useEffect, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { CodeView } from './CodeView';
import { LogView } from './LogView';

type TabId = 'code' | 'logs';

export function BottomCodePanel() {
  const {
    bottomPanelOpen,
    bottomPanelHeight,
    toggleBottomPanel,
    setPanelSize,
  } = useUiStore();

  const panelRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('code');

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = panelRef.current?.parentElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      setPanelSize('bottom', newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setPanelSize]);

  const handleTabClick = (tab: TabId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomPanelOpen) {
      toggleBottomPanel();
    }
    setActiveTab(tab);
  };

  const handleHeaderClick = () => {
    toggleBottomPanel();
  };

  // Tab height for the collapsed state
  const TAB_HEIGHT = 28;

  const tabs: { id: TabId; label: string; icon: JSX.Element }[] = [
    {
      id: 'code',
      label: 'Code',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
    },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-0 left-0 right-0 z-40 flex flex-col pointer-events-none"
      style={{ height: bottomPanelOpen ? bottomPanelHeight + TAB_HEIGHT : TAB_HEIGHT }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Resize handle (only when open) */}
      {bottomPanelOpen && (
        <div
          className="h-1 cursor-ns-resize pointer-events-auto group"
          onMouseDown={handleResizeStart}
        >
          <div className={`h-full transition-colors ${isResizing ? 'bg-editor-accent' : 'bg-transparent group-hover:bg-editor-accent/50'}`} />
        </div>
      )}

      {/* Tab bar / Header */}
      <div
        className={`h-7 flex items-center pointer-events-auto transition-all duration-200 ${
          bottomPanelOpen
            ? 'bg-editor-surface-solid border-t border-editor-border'
            : isHovered
              ? 'bg-editor-surface/95 backdrop-blur-sm'
              : 'bg-editor-surface/80 backdrop-blur-sm'
        }`}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={handleHeaderClick}
          className="flex items-center gap-1.5 px-2 h-full hover:bg-editor-surface-light/50 transition-colors"
        >
          <svg
            className={`w-3 h-3 text-editor-text-dim transition-transform duration-200 ${bottomPanelOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* Tabs */}
        <div className="flex items-center h-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={(e) => handleTabClick(tab.id, e)}
              className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id && bottomPanelOpen
                  ? 'text-editor-text border-editor-accent bg-editor-surface-light/30'
                  : 'text-editor-text-dim hover:text-editor-text border-transparent hover:bg-editor-surface-light/30'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Keyboard hint (only when collapsed) */}
        {!bottomPanelOpen && (
          <div className="ml-auto mr-3 text-[10px] text-editor-text-dim">
            <kbd className="px-1 py-0.5 bg-editor-surface rounded font-mono">`</kbd>
          </div>
        )}
      </div>

      {/* Panel content */}
      <div
        className={`flex-1 pointer-events-auto overflow-hidden transition-opacity duration-200 ${
          bottomPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {activeTab === 'code' && <CodeView />}
        {activeTab === 'logs' && <LogView />}
      </div>
    </div>
  );
}
