import { useState } from 'react';
import { useCodeStore } from '../../store/codeStore';

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

export function SettingsView() {
  const {
    projectPath,
    recentPaths,
    bypassPermissions,
    setProjectPath,
    addRecentPath,
    clearRecentPaths,
    setBypassPermissions,
  } = useCodeStore();

  const [inputPath, setInputPath] = useState(projectPath || '');

  const handleSavePath = () => {
    if (inputPath.trim()) {
      setProjectPath(inputPath.trim());
      addRecentPath(inputPath.trim());
    }
  };

  const handleSelectRecent = (path: string) => {
    setInputPath(path);
    setProjectPath(path);
    addRecentPath(path);
  };

  return (
    <div className="h-full w-full bg-editor-bg overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold text-editor-text mb-8">Settings</h1>

        {/* Claude Code Section */}
        <section className="mb-8">
          <h2 className="text-lg font-medium text-editor-text mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-editor-accent/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-editor-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            Claude Code
          </h2>

          <div className="bg-editor-surface-solid rounded-xl border border-editor-border p-4 space-y-4">
            {/* Project Path */}
            <div>
              <label className="block text-sm font-medium text-editor-text-secondary mb-2">
                Project Path
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-editor-text-dim">
                    <FolderIcon />
                  </div>
                  <input
                    type="text"
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePath()}
                    placeholder="Enter project path..."
                    className="w-full h-10 pl-10 pr-4 bg-editor-surface border border-editor-border rounded-lg text-editor-text placeholder-editor-text-dim focus:outline-none focus:border-editor-accent focus:ring-2 focus:ring-editor-accent/20 transition-all"
                  />
                </div>
                <button
                  onClick={handleSavePath}
                  disabled={!inputPath.trim() || inputPath.trim() === projectPath}
                  className="h-10 px-4 bg-editor-accent text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-editor-accent/90 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-xs text-editor-text-dim">
                The project directory where Claude Code will run. When you switch to Code view, it will auto-connect to this path.
              </p>
            </div>

            {/* Bypass Permissions */}
            <div className="pt-2 border-t border-editor-border">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-editor-text">
                    Bypass Permissions
                  </label>
                  <p className="text-xs text-editor-text-dim mt-1">
                    Run Claude Code with --dangerously-skip-permissions flag
                  </p>
                </div>
                <button
                  onClick={() => setBypassPermissions(!bypassPermissions)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    bypassPermissions ? 'bg-editor-accent' : 'bg-editor-surface-light'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      bypassPermissions ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {bypassPermissions && (
                <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs text-yellow-400">
                    Warning: This bypasses all permission prompts. Only use this if you trust the operations being performed.
                  </p>
                </div>
              )}
            </div>

            {/* Recent Paths */}
            {recentPaths.length > 0 && (
              <div className="pt-2 border-t border-editor-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-editor-text-secondary flex items-center gap-1.5">
                    <ClockIcon />
                    Recent Projects
                  </label>
                  <button
                    onClick={clearRecentPaths}
                    className="text-xs text-editor-text-dim hover:text-editor-text flex items-center gap-1 transition-colors"
                  >
                    <TrashIcon />
                    Clear
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {recentPaths.map((path, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectRecent(path)}
                      className={`w-full px-3 py-2 text-left text-sm rounded-lg truncate transition-colors ${
                        path === projectPath
                          ? 'bg-editor-accent/20 text-editor-accent'
                          : 'text-editor-text hover:bg-editor-surface-light'
                      }`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
