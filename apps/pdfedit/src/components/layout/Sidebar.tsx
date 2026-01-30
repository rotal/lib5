import { useRef } from 'react';
import { usePDFStore } from '../../store';
import { TextItemList } from '../pdf';

// Icons
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const FileIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const ZoomInIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
  </svg>
);

interface SidebarProps {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  saving?: boolean;
}

export function Sidebar({ onFileSelect, onSave, saving }: SidebarProps) {
  const {
    fileName,
    pages,
    scale,
    setScale,
    loading,
    error,
    getModifiedCount,
    isMobile,
    sidebarOpen,
    toggleSidebar,
  } = usePDFStore();

  const fileInputRef = useRef<HTMLInputElement>(null!);
  const modifiedCount = getModifiedCount();

  // Mobile drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
            onClick={toggleSidebar}
          />
        )}

        {/* Drawer */}
        <div
          className={`fixed inset-y-0 left-0 w-[85%] max-w-sm z-50 transform transition-transform duration-300 ease-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-full bg-surface-900/95 backdrop-blur-xl border-r border-surface-700/30 flex flex-col safe-top safe-bottom">
            <SidebarContent
              fileName={fileName}
              pages={pages}
              scale={scale}
              setScale={setScale}
              loading={loading}
              error={error}
              modifiedCount={modifiedCount}
              fileInputRef={fileInputRef}
              onFileSelect={onFileSelect}
              onSave={onSave}
              onClose={toggleSidebar}
              saving={saving}
              isMobile
            />
          </div>
        </div>
      </>
    );
  }

  // Desktop sidebar
  return (
    <div className="w-80 bg-surface-900/50 backdrop-blur-xl border-r border-surface-700/30 flex flex-col relative z-20">
      <SidebarContent
        fileName={fileName}
        pages={pages}
        scale={scale}
        setScale={setScale}
        loading={loading}
        error={error}
        modifiedCount={modifiedCount}
        fileInputRef={fileInputRef}
        onFileSelect={onFileSelect}
        onSave={onSave}
        saving={saving}
      />
    </div>
  );
}

interface SidebarContentProps {
  fileName: string;
  pages: any[];
  scale: number;
  setScale: (scale: number) => void;
  loading: boolean;
  error: string | null;
  modifiedCount: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onClose?: () => void;
  saving?: boolean;
  isMobile?: boolean;
}

function SidebarContent({
  fileName,
  pages,
  scale,
  setScale,
  loading,
  error,
  modifiedCount,
  fileInputRef,
  onFileSelect,
  onClose,
  isMobile,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-surface-700/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-button">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-surface-100 tracking-tight">PDF Studio</h1>
              <p className="text-xs text-surface-500">Edit PDF text easily</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 rounded-xl transition-colors"
              aria-label="Close sidebar"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={onFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full btn btn-primary py-3"
        >
          {fileName ? (
            <>
              <FileIcon />
              <span className="truncate">{fileName}</span>
            </>
          ) : (
            <>
              <UploadIcon />
              Select PDF File
            </>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-6 flex flex-col items-center gap-3 text-surface-400">
          <span className="spinner w-8 h-8" />
          <span className="text-sm">Loading PDF...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Content when PDF is loaded */}
      {pages.length > 0 && !loading && (
        <>
          {/* Zoom control */}
          <div className="p-4 border-b border-surface-700/30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setScale(Math.max(0.5, scale - 0.25))}
                className="p-2 text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 rounded-lg transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOutIcon />
              </button>
              <div className="flex-1 relative">
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                onClick={() => setScale(Math.min(3, scale + 0.25))}
                className="p-2 text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 rounded-lg transition-colors"
                aria-label="Zoom in"
              >
                <ZoomInIcon />
              </button>
              <span className="w-14 text-right text-sm font-mono text-surface-300">
                {Math.round(scale * 100)}%
              </span>
            </div>
          </div>

          {/* Text Items List */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 flex items-center justify-between border-b border-surface-700/30">
              <span className="text-sm font-medium text-surface-300">Text Items</span>
              {modifiedCount > 0 && (
                <span className="px-2 py-0.5 bg-modified-500/20 text-modified-400 rounded-full text-xs font-medium">
                  {modifiedCount} modified
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <TextItemList />
            </div>
          </div>

          {/* Stats footer */}
          <div className="p-4 border-t border-surface-700/30 bg-surface-900/50">
            <div className="flex items-center justify-between text-xs text-surface-500">
              <span>{pages.length} page{pages.length > 1 ? 's' : ''}</span>
              <span>{pages.reduce((sum, p) => sum + p.textItems.length, 0)} text items</span>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {pages.length === 0 && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-surface-800/50 flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-surface-300 font-medium mb-1">No PDF loaded</h3>
          <p className="text-surface-500 text-sm">Select a PDF file to start editing text</p>
        </div>
      )}
    </div>
  );
}
