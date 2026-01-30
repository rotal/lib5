import { useState, useEffect } from 'react';

interface ProjectPickerProps {
  currentPath: string | null;
  recentPaths: string[];
  onSelectPath: (path: string) => void;
  onClearRecent?: () => void;
}

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export function ProjectPicker({ currentPath, recentPaths, onSelectPath, onClearRecent }: ProjectPickerProps) {
  const [inputPath, setInputPath] = useState(currentPath || '');
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    if (currentPath) {
      setInputPath(currentPath);
    }
  }, [currentPath]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      onSelectPath(inputPath.trim());
    }
  };

  const handleSelectRecent = (path: string) => {
    setInputPath(path);
    onSelectPath(path);
    setShowRecent(false);
  };

  return (
    <div className="p-4 bg-editor-surface-solid border-b border-editor-border">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            placeholder="Enter project path..."
            className="w-full h-10 px-4 bg-editor-surface border border-editor-border rounded-lg text-editor-text placeholder-editor-text-dim focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent/20 transition-all"
          />

          {/* Recent paths dropdown */}
          {showRecent && recentPaths.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-editor-surface-solid border border-editor-border rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border">
                <span className="text-xs text-editor-text-dim flex items-center gap-1.5">
                  <ClockIcon />
                  Recent Projects
                </span>
                {onClearRecent && (
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-xs text-editor-text-dim hover:text-editor-text"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
                {recentPaths.map((path, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSelectRecent(path)}
                    className="w-full px-3 py-2 text-left text-sm text-editor-text hover:bg-editor-surface-light truncate"
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!inputPath.trim()}
          className="h-10 px-4 bg-editor-accent text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-editor-accent/90 transition-colors"
        >
          Connect
        </button>
      </form>

      {currentPath && (
        <div className="mt-2 text-xs text-editor-text-dim truncate">
          Connected to: <span className="text-editor-text">{currentPath}</span>
        </div>
      )}
    </div>
  );
}
