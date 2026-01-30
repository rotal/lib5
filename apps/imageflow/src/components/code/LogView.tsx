import { useEffect, useRef } from 'react';
import { useLogStore, LogLevel } from '../../store/logStore';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'bg-gray-500/10',
  info: 'bg-blue-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
};

export function LogView() {
  const { entries, filter, setFilter, clear } = useLogStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter((e) => e.level === filter);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEntries.length]);

  // Track if user has scrolled away from bottom
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  return (
    <div className="flex flex-col h-full bg-editor-bg">
      {/* Toolbar */}
      <div className="h-8 px-2 bg-editor-surface-solid border-b border-editor-border flex items-center gap-2">
        {/* Filter buttons */}
        <div className="flex items-center gap-1">
          {(['all', 'debug', 'info', 'warn', 'error'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                filter === level
                  ? 'bg-editor-accent text-white'
                  : 'text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light'
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Entry count */}
        <span className="text-[10px] text-editor-text-dim">
          {filteredEntries.length} entries
        </span>

        {/* Clear button */}
        <button
          onClick={clear}
          className="px-2 py-0.5 text-[10px] text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs"
      >
        {filteredEntries.length === 0 ? (
          <div className="p-4 text-center text-editor-text-dim">
            No log entries
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className={`px-2 py-1 border-b border-editor-border/50 flex gap-2 ${LEVEL_BG[entry.level]}`}
            >
              {/* Timestamp */}
              <span className="text-editor-text-dim flex-shrink-0 w-20">
                {formatTime(entry.timestamp)}
              </span>

              {/* Level badge */}
              <span className={`flex-shrink-0 w-12 ${LEVEL_COLORS[entry.level]}`}>
                [{entry.level.toUpperCase().slice(0, 4)}]
              </span>

              {/* Message */}
              <span className="text-editor-text whitespace-pre-wrap break-all">
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
