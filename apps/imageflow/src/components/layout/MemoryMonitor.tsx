import { useState, useEffect, useCallback } from 'react';
import { useExecutionStore, useHistoryStore } from '../../store';
import { memoryProfiler, formatBytes, resetAllocationCounters } from '../../utils/memoryProfiler';

function generateReport(memory: MemoryInfo, stats: ReturnType<typeof memoryProfiler.getStats>): string {
  const lines: string[] = [];
  const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

  lines.push('=== Memory Report ===');
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('-- Heap Overview --');
  lines.push(`Used: ${formatBytes(memory.usedJSHeapSize)} (${usagePercent.toFixed(1)}%)`);
  lines.push(`Allocated: ${formatBytes(memory.totalJSHeapSize)}`);
  lines.push(`Limit: ${formatBytes(memory.jsHeapSizeLimit)}`);
  if (navigator.deviceMemory) {
    lines.push(`Device RAM: ~${navigator.deviceMemory} GB`);
  }
  lines.push('');
  lines.push('-- Tracked Allocations --');
  if (Object.entries(stats.allocations).length === 0) {
    lines.push('No allocations tracked');
  } else {
    for (const [category, data] of Object.entries(stats.allocations).sort((a, b) => b[1].totalBytes - a[1].totalBytes)) {
      lines.push(`${category}: ${data.count.toLocaleString()} allocations, ${formatBytes(data.totalBytes)}`);
    }
  }
  lines.push('');
  lines.push('-- Cache & Object Stats --');
  if (Object.entries(stats.caches).length === 0) {
    lines.push('No caches registered');
  } else {
    for (const [name, data] of Object.entries(stats.caches)) {
      lines.push(`${name}: ${data.description}`);
    }
  }

  return lines.join('\n');
}

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

// Chrome-specific APIs
declare global {
  interface Performance {
    memory?: MemoryInfo;
  }
  interface Navigator {
    deviceMemory?: number;
  }
}

function getUsageColor(percentage: number): string {
  if (percentage < 50) return 'text-green-400';
  if (percentage < 75) return 'text-yellow-400';
  if (percentage < 90) return 'text-orange-400';
  return 'text-red-400';
}

export function MemoryMonitor() {
  const [memory, setMemory] = useState<MemoryInfo | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [stats, setStats] = useState(memoryProfiler.getStats());
  const clearCache = useExecutionStore((state) => state.clearCache);
  const clearHistory = useHistoryStore((state) => state.clear);

  useEffect(() => {
    const updateMemory = () => {
      if (performance.memory) {
        setMemory({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        });
      }
      // Also update profiler stats
      setStats(memoryProfiler.getStats());
    };

    // Update immediately
    updateMemory();

    // Update every second
    const interval = setInterval(updateMemory, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleClearCache = useCallback(() => {
    clearCache();
    resetAllocationCounters();
    setStats(memoryProfiler.getStats());
  }, [clearCache]);

  if (!memory) {
    return (
      <div className="text-xs text-editor-text-dim" title="Memory API not available (Chrome only)">
        Mem: N/A
      </div>
    );
  }

  const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className={`text-xs ${getUsageColor(usagePercent)} hover:bg-editor-surface-light px-2 py-0.5 rounded transition-colors`}
        title={`Memory: ${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.jsHeapSizeLimit)} (${usagePercent.toFixed(1)}%) - Click for details`}
      >
        Mem: {formatBytes(memory.usedJSHeapSize)} ({usagePercent.toFixed(0)}%)
      </button>

      {/* Memory Details Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setShowDialog(false)}>
          <div
            className="bg-editor-surface border border-editor-border rounded-lg shadow-2xl w-[500px] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border">
              <h2 className="text-sm font-semibold text-editor-text">Memory Allocation Details</h2>
              <button
                onClick={() => setShowDialog(false)}
                className="text-editor-text-dim hover:text-editor-text p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Overview Section */}
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-editor-text-dim uppercase tracking-wider mb-2">Heap Overview</h3>
                <div className="bg-editor-bg rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-editor-text-dim">Used</span>
                    <span className={getUsageColor(usagePercent)}>{formatBytes(memory.usedJSHeapSize)}</span>
                  </div>
                  <div className="h-2 bg-editor-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${usagePercent < 50 ? 'bg-green-500' : usagePercent < 75 ? 'bg-yellow-500' : usagePercent < 90 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-editor-text-dim">Allocated</span>
                    <span className="text-blue-400">{formatBytes(memory.totalJSHeapSize)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-editor-text-dim">Limit</span>
                    <span className="text-editor-text">{formatBytes(memory.jsHeapSizeLimit)}</span>
                  </div>
                  {navigator.deviceMemory && (
                    <div className="flex justify-between text-xs">
                      <span className="text-editor-text-dim">Device RAM</span>
                      <span className="text-editor-text">~{navigator.deviceMemory} GB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tracked Allocations Section */}
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-editor-text-dim uppercase tracking-wider mb-2">Tracked Allocations (since load/reset)</h3>
                <div className="bg-editor-bg rounded-lg divide-y divide-editor-border">
                  {Object.entries(stats.allocations).length === 0 ? (
                    <div className="p-3 text-xs text-editor-text-dim">No allocations tracked yet</div>
                  ) : (
                    Object.entries(stats.allocations)
                      .sort((a, b) => b[1].totalBytes - a[1].totalBytes)
                      .map(([category, data]) => (
                        <div key={category} className="p-3 flex justify-between items-start">
                          <div>
                            <div className="text-xs font-medium text-editor-text">{category}</div>
                            <div className="text-xs text-editor-text-dim">
                              {data.count.toLocaleString()} allocations
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono text-orange-400">{formatBytes(data.totalBytes)}</div>
                            <div className="text-xs text-editor-text-dim">
                              {new Date(data.lastAllocTime).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Cache Stats Section */}
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-editor-text-dim uppercase tracking-wider mb-2">Cache & Object Stats</h3>
                <div className="bg-editor-bg rounded-lg divide-y divide-editor-border">
                  {Object.entries(stats.caches).length === 0 ? (
                    <div className="p-3 text-xs text-editor-text-dim">No caches registered</div>
                  ) : (
                    Object.entries(stats.caches).map(([name, data]) => (
                      <div key={name} className="p-3 flex justify-between items-start">
                        <div>
                          <div className="text-xs font-medium text-editor-text">{name}</div>
                          <div className="text-xs text-editor-text-dim">{data.description}</div>
                        </div>
                        <div className="text-xs font-mono text-blue-400">{data.size}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Warning */}
              {usagePercent > 75 && (
                <div className="p-3 bg-yellow-500/20 border border-yellow-500/40 rounded-lg text-xs text-yellow-300 mb-4">
                  ⚠️ High memory usage detected. This may indicate a memory leak. Try clearing the cache or reloading the page.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2 px-4 py-3 border-t border-editor-border bg-editor-bg/50">
              <div className="flex gap-2">
                <button
                  onClick={handleClearCache}
                  className="flex-1 py-2 px-3 bg-editor-accent hover:bg-editor-accent/80 text-white text-xs rounded transition-colors"
                >
                  Clear Cache
                </button>
                <button
                  onClick={() => {
                    clearHistory();
                    setStats(memoryProfiler.getStats());
                  }}
                  className="flex-1 py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors"
                  title="Clear undo/redo history (can free significant memory if you have images)"
                >
                  Clear History
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    resetAllocationCounters();
                    setStats(memoryProfiler.getStats());
                  }}
                  className="flex-1 py-2 px-3 bg-editor-surface-light hover:bg-editor-surface text-editor-text text-xs rounded transition-colors"
                >
                  Reset Counters
                </button>
                <button
                  onClick={() => {
                    const report = generateReport(memory, stats);
                    navigator.clipboard.writeText(report).then(() => {
                      const btn = document.activeElement as HTMLButtonElement;
                      if (btn) {
                        const original = btn.textContent;
                        btn.textContent = 'Copied!';
                        setTimeout(() => { btn.textContent = original; }, 1000);
                      }
                    });
                  }}
                  className="flex-1 py-2 px-3 bg-editor-surface-light hover:bg-editor-surface text-editor-text text-xs rounded transition-colors"
                >
                  Copy Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
