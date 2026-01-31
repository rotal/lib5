/**
 * Memory profiler for tracking allocations and identifying leaks.
 * Tracks various caches and allocation counts.
 */

interface AllocationEntry {
  count: number;
  totalBytes: number;
  lastAllocTime: number;
}

interface MemoryStats {
  allocations: Record<string, AllocationEntry>;
  caches: Record<string, { size: number; description: string }>;
  totalTrackedBytes: number;
}

class MemoryProfiler {
  private allocations: Map<string, AllocationEntry> = new Map();
  private cacheTrackers: Map<string, () => { size: number; description: string }> = new Map();
  private enabled = true;

  /**
   * Track an allocation
   */
  trackAllocation(category: string, bytes: number): void {
    if (!this.enabled) return;

    const existing = this.allocations.get(category) || { count: 0, totalBytes: 0, lastAllocTime: 0 };
    existing.count++;
    existing.totalBytes += bytes;
    existing.lastAllocTime = Date.now();
    this.allocations.set(category, existing);
  }

  /**
   * Track a deallocation (when something is freed)
   */
  trackDeallocation(category: string, bytes: number): void {
    if (!this.enabled) return;

    const existing = this.allocations.get(category);
    if (existing) {
      existing.totalBytes = Math.max(0, existing.totalBytes - bytes);
    }
  }

  /**
   * Register a cache tracker function
   */
  registerCache(name: string, tracker: () => { size: number; description: string }): void {
    this.cacheTrackers.set(name, tracker);
  }

  /**
   * Unregister a cache tracker
   */
  unregisterCache(name: string): void {
    this.cacheTrackers.delete(name);
  }

  /**
   * Get current memory stats
   */
  getStats(): MemoryStats {
    const allocations: Record<string, AllocationEntry> = {};
    let totalTrackedBytes = 0;

    for (const [key, value] of this.allocations) {
      allocations[key] = { ...value };
      totalTrackedBytes += value.totalBytes;
    }

    const caches: Record<string, { size: number; description: string }> = {};
    for (const [name, tracker] of this.cacheTrackers) {
      try {
        caches[name] = tracker();
      } catch {
        caches[name] = { size: 0, description: 'Error reading cache' };
      }
    }

    return { allocations, caches, totalTrackedBytes };
  }

  /**
   * Reset all tracked allocations
   */
  reset(): void {
    this.allocations.clear();
  }

  /**
   * Enable/disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Global singleton
export const memoryProfiler = new MemoryProfiler();

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Track Float32Array allocations using proxy approach
let float32ArrayCount = 0;
let float32ArrayTotalBytes = 0;

// We can't easily monkey-patch constructors in strict mode, so we track manually
// Register Float32Array stats based on our tracked values
memoryProfiler.registerCache('Float32Array (tracked)', () => ({
  size: float32ArrayCount,
  description: `${float32ArrayCount} arrays, ~${formatBytes(float32ArrayTotalBytes)} total allocated`
}));

// Track ImageData allocations
let imageDataCount = 0;
let imageDataTotalBytes = 0;

// Register ImageData stats
memoryProfiler.registerCache('ImageData (tracked)', () => ({
  size: imageDataCount,
  description: `${imageDataCount} images, ~${formatBytes(imageDataTotalBytes)} total allocated`
}));

/**
 * Call this when creating a Float32Array to track the allocation
 * @param source Optional source identifier for debugging (e.g., 'imageDataToFloat', 'cloneFloatImage')
 */
export function trackFloat32Array(arr: Float32Array, source?: string): void {
  const bytes = arr.byteLength;
  float32ArrayCount++;
  float32ArrayTotalBytes += bytes;
  memoryProfiler.trackAllocation('Float32Array', bytes);
  if (source) {
    memoryProfiler.trackAllocation(`Float32Array:${source}`, bytes);
  }
}

/**
 * Call this when creating an ImageData to track the allocation
 * @param source Optional source identifier for debugging
 */
export function trackImageData(data: ImageData, source?: string): void {
  const bytes = data.data.byteLength;
  imageDataCount++;
  imageDataTotalBytes += bytes;
  memoryProfiler.trackAllocation('ImageData', bytes);
  if (source) {
    memoryProfiler.trackAllocation(`ImageData:${source}`, bytes);
  }
}

// Function to reset allocation counters
export function resetAllocationCounters(): void {
  float32ArrayCount = 0;
  float32ArrayTotalBytes = 0;
  imageDataCount = 0;
  imageDataTotalBytes = 0;
  memoryProfiler.reset();
}
