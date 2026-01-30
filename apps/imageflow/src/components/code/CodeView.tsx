import { useCallback, useRef, useEffect } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { Terminal } from './Terminal';
import { useClaudeSession } from '../../hooks/useClaudeSession';
import { useCodeStore } from '../../store/codeStore';
import { useUiStore } from '../../store/uiStore';

export function CodeView() {
  const terminalRef = useRef<XTerm | null>(null);
  const hasAutoConnected = useRef(false);
  const lastBypassRef = useRef<boolean | null>(null);
  const { projectPath, bypassPermissions } = useCodeStore();
  const { setViewMode } = useUiStore();

  const {
    isConnected,
    sessionId,
    connect,
    disconnect,
    sendInput,
    resize,
  } = useClaudeSession({
    onOutput: (data) => {
      terminalRef.current?.write(data);
    },
    onExit: () => {
      terminalRef.current?.writeln('\r\n\x1b[33m[Session ended]\x1b[0m');
      hasAutoConnected.current = false;
    },
    onError: (message) => {
      terminalRef.current?.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
    },
  });

  // Auto-connect when component mounts if projectPath is set
  useEffect(() => {
    if (projectPath && !isConnected && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      lastBypassRef.current = bypassPermissions;
      connect(projectPath, 80, 24, bypassPermissions);
    }
  }, [projectPath, isConnected, connect, bypassPermissions]);

  const handleReconnect = useCallback(() => {
    if (sessionId) {
      disconnect();
    }
    hasAutoConnected.current = false;
    lastBypassRef.current = bypassPermissions;
    terminalRef.current?.writeln('\r\n\x1b[33mReconnecting...\x1b[0m');
    setTimeout(() => {
      if (projectPath) {
        connect(projectPath, 80, 24, bypassPermissions);
        hasAutoConnected.current = true;
      }
    }, 100);
  }, [sessionId, disconnect, connect, projectPath, bypassPermissions]);

  // Check if bypass setting changed since connection
  const bypassChanged = lastBypassRef.current !== null && lastBypassRef.current !== bypassPermissions;

  const handleTerminalData = useCallback((data: string) => {
    if (sessionId) {
      sendInput(data);
    }
  }, [sessionId, sendInput]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    if (sessionId) {
      resize(cols, rows);
    }
  }, [sessionId, resize]);

  const handleTerminalReady = useCallback((terminal: XTerm) => {
    terminalRef.current = terminal;

    if (!projectPath) {
      terminal.writeln('\x1b[36mClaude Code Integration\x1b[0m');
      terminal.writeln('');
      terminal.writeln('No project path configured.');
      terminal.writeln('Go to \x1b[33mSettings\x1b[0m to set your project path.');
      terminal.writeln('');
    } else if (!isConnected) {
      terminal.writeln('\x1b[33mConnecting to Claude Code...\x1b[0m');
    }
  }, [isConnected, projectPath]);

  const handleGoToSettings = useCallback(() => {
    setViewMode('settings');
  }, [setViewMode]);

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-editor-bg overflow-hidden">
      {/* Header bar */}
      <div className="h-10 px-4 bg-editor-surface-solid border-b border-editor-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-editor-success' : 'bg-editor-text-dim'}`} />
          <span className="text-sm text-editor-text-secondary">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {isConnected && lastBypassRef.current && (
            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">
              BYPASS
            </span>
          )}
          {projectPath && (
            <span className="text-sm text-editor-text-dim truncate max-w-[300px]">
              {projectPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bypassChanged && isConnected && (
            <span className="text-xs text-yellow-400">Settings changed</span>
          )}
          {projectPath && (
            <button
              onClick={handleReconnect}
              className="px-2 py-1 text-xs text-editor-text-secondary hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
            >
              Reconnect
            </button>
          )}
          {!projectPath && (
            <button
              onClick={handleGoToSettings}
              className="px-3 py-1.5 text-sm bg-editor-accent text-white rounded-lg hover:bg-editor-accent/90 transition-colors"
            >
              Configure in Settings
            </button>
          )}
          {sessionId && (
            <span className="text-xs text-editor-text-dim font-mono">
              {sessionId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Terminal
          onData={handleTerminalData}
          onResize={handleTerminalResize}
          onReady={handleTerminalReady}
        />
      </div>
    </div>
  );
}
