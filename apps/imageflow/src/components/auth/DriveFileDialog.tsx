import { useCallback, useEffect, useState } from 'react';
import { listFiles, readFile, createFile, deleteFile, type DriveFile } from '../../services/googleDrive';

interface DriveFileDialogProps {
  mode: 'open' | 'save';
  defaultName?: string;
  onOpenFile: (content: any, fileId: string, fileName: string) => void;
  onSaveFile: (fileName: string) => Promise<object>;
  onSaved?: () => void;
  onClose: () => void;
}

export function DriveFileDialog({ mode, defaultName, onOpenFile, onSaveFile, onSaved, onClose }: DriveFileDialogProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState(defaultName || '');
  const [busy, setBusy] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFiles();
      setFiles(result);
    } catch (err: any) {
      setError(err.message || 'Failed to list files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleOpen = useCallback(async (file: DriveFile) => {
    setBusy(true);
    try {
      const content = await readFile(file.id);
      onOpenFile(content, file.id, file.name);
    } catch (err: any) {
      setError(err.message || 'Failed to open file');
    } finally {
      setBusy(false);
    }
  }, [onOpenFile]);

  const handleSave = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const content = await onSaveFile(name);
      await createFile(name, content);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
      setBusy(false);
    }
  }, [saveName, onSaveFile, onSaved, onClose]);

  const handleOverwrite = useCallback(async (file: DriveFile) => {
    if (!confirm(`Overwrite "${file.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const content = await onSaveFile(file.name.replace(/\.(l5|json)$/, ''));
      // Delete old, create new to keep it simple
      await deleteFile(file.id);
      await createFile(file.name, content);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save file');
      setBusy(false);
    }
  }, [onSaveFile, onSaved, onClose]);

  const handleDelete = useCallback(async (file: DriveFile) => {
    if (!confirm(`Delete "${file.name}" from Google Drive?`)) return;
    try {
      await deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
    }
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-editor-surface border border-editor-border rounded-lg shadow-xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border">
          <h2 className="text-sm font-medium text-editor-text">
            {mode === 'open' ? 'Open from Google Drive' : 'Save to Google Drive'}
          </h2>
          <button
            onClick={onClose}
            className="text-editor-text-dim hover:text-editor-text"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Save name input */}
        {mode === 'save' && (
          <div className="px-4 py-3 border-b border-editor-border flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="File name..."
              className="flex-1 px-2 py-1.5 text-sm bg-editor-surface-light border border-editor-border rounded text-editor-text focus:outline-none focus:border-editor-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') onClose();
              }}
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim() || busy}
              className="px-3 py-1.5 text-xs font-medium bg-editor-accent text-white rounded hover:bg-editor-accent/80 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save New'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs text-red-400 bg-red-900/20">
            {error}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-editor-text-dim">
              Loading files...
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-editor-text-dim">
              {mode === 'open' ? 'No files found in Drive.' : 'No existing files. Enter a name above to save.'}
            </div>
          ) : (
            <div className="py-1">
              {mode === 'save' && (
                <div className="px-4 py-1.5 text-xs text-editor-text-dim">
                  Or overwrite an existing file:
                </div>
              )}
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center px-4 py-2 hover:bg-editor-surface-light group cursor-pointer"
                  onClick={() => {
                    if (mode === 'open') handleOpen(file);
                    else handleOverwrite(file);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-editor-text truncate">
                      {file.name}
                    </div>
                    <div className="text-xs text-editor-text-dim">
                      {formatDate(file.modifiedTime)}
                    </div>
                  </div>
                  <button
                    className="ml-2 p-1 text-editor-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file);
                    }}
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {busy && mode === 'open' && (
          <div className="px-4 py-2 border-t border-editor-border text-xs text-editor-text-dim text-center">
            Opening file...
          </div>
        )}
      </div>
    </div>
  );
}
