import { create } from 'zustand';
import { GraphEngine, createGraphEngine, ExecutionCallbacks } from '../core/graph/GraphEngine';
import { Graph, NodeRuntimeState } from '../types';
import { PortValue, FloatImage, isFloatImage } from '../types/data';
import { GPUTexture } from '../types/gpu';
import { memoryProfiler, formatBytes } from '../utils/memoryProfiler';
import { getUpstreamNodes, getDownstreamNodes } from '../core/graph/TopologicalSort';

interface ExecutionState {
  engine: GraphEngine | null;
  isExecuting: boolean;
  /** Counter for concurrent executions - isExecuting is true when > 0 */
  executingCount: number;
  /** Set of nodes currently being executed (prevents duplicate execution) */
  executingNodes: Set<string>;
  executionProgress: number;
  executionError: string | null;
  nodeStates: Record<string, NodeRuntimeState>;
  nodeOutputs: Record<string, Record<string, PortValue>>;
  lastExecutionTime: number | null;
  /** Nodes with dirty local previews (need re-execution but skipped during interactive editing) */
  dirtyPreviewNodes: Set<string>;
  /** Nodes that need re-computation (lazy evaluation) */
  dirtyNodes: Set<string>;
}

interface ExecutionActions {
  initEngine: (graph: Graph) => void;
  updateEngineGraph: (graph: Graph) => void;
  execute: () => Promise<void>;
  executePartial: (dirtyNodeIds: string[]) => Promise<void>;
  /** Execute only a single node using cached inputs (for interactive gizmo editing) */
  executeSingleNode: (nodeId: string, markOthersDirty?: string[]) => Promise<void>;
  abort: () => void;
  clearCache: () => void;
  markNodesDirty: (nodeIds: string[]) => void;
  /** Mark a node and all its downstream nodes as dirty (lazy evaluation) */
  markDirtyWithDownstream: (nodeId: string) => void;
  /** Mark nodes as having dirty local previews (yellow border) */
  markPreviewsDirty: (nodeIds: string[]) => void;
  /** Clear dirty preview markers */
  clearDirtyPreviews: () => void;
  setNodeErrors: (errors: Array<{ nodeId: string; message: string }>) => void;
  clearNodeErrors: () => void;
  getNodeOutput: (nodeId: string) => Record<string, PortValue> | undefined;
  downloadGPUTexture: (texture: GPUTexture) => FloatImage | null;
  /** Check if a node is dirty (needs re-computation) */
  isDirty: (nodeId: string) => boolean;
  /** Request output for a node - lazy evaluation entry point */
  requestOutput: (nodeId: string) => Promise<Record<string, PortValue> | null>;
}

export const useExecutionStore = create<ExecutionState & ExecutionActions>((set, get) => ({
  engine: null,
  isExecuting: false,
  executingCount: 0,
  executingNodes: new Set(),
  executionProgress: 0,
  executionError: null,
  nodeStates: {},
  nodeOutputs: {},
  lastExecutionTime: null,
  dirtyPreviewNodes: new Set(),
  dirtyNodes: new Set(),

  initEngine: (graph) => {
    const engine = createGraphEngine(graph);

    const callbacks: ExecutionCallbacks = {
      onNodeStart: (nodeId) => {
        set((state) => ({
          nodeStates: {
            ...state.nodeStates,
            [nodeId]: { executionState: 'running', progress: 0 }
          }
        }));
      },
      onNodeProgress: (nodeId, progress) => {
        set((state) => ({
          nodeStates: {
            ...state.nodeStates,
            [nodeId]: { ...state.nodeStates[nodeId], progress }
          }
        }));
      },
      onNodeComplete: (nodeId, outputs) => {
        console.log('ExecutionStore - onNodeComplete:', nodeId, outputs);
        set((state) => ({
          nodeStates: {
            ...state.nodeStates,
            [nodeId]: { executionState: 'complete', progress: 1, outputs }
          },
          nodeOutputs: {
            ...state.nodeOutputs,
            [nodeId]: outputs as Record<string, PortValue>
          }
        }));
      },
      onNodeError: (nodeId, error) => {
        set((state) => ({
          nodeStates: {
            ...state.nodeStates,
            [nodeId]: { executionState: 'error', progress: 0, error: error.message }
          }
        }));
      },
      onExecutionStart: () => {
        console.log('ExecutionStore - onExecutionStart');
        set({
          isExecuting: true,
          executionProgress: 0,
          executionError: null
        });
      },
      onExecutionComplete: (totalTime) => {
        console.log('ExecutionStore - onExecutionComplete, time:', totalTime);
        set({
          isExecuting: false,
          executionProgress: 1,
          lastExecutionTime: totalTime
        });
      },
      onExecutionError: (error) => {
        set({
          isExecuting: false,
          executionError: error.message
        });
      },
    };

    engine.setCallbacks(callbacks);
    set({ engine });
  },

  updateEngineGraph: (graph) => {
    const { engine } = get();
    if (engine) {
      engine.updateGraph(graph);
    }
  },

  execute: async () => {
    const { engine } = get();
    if (!engine) {
      console.error('Engine not initialized');
      return;
    }

    try {
      await engine.execute();
      // Clear all dirty flags after successful execution
      set({ dirtyNodes: new Set() });
    } catch (error) {
      console.error('Execution failed:', error);
    }
  },

  executePartial: async (dirtyNodeIds) => {
    const { engine } = get();
    if (!engine) {
      console.error('Engine not initialized');
      return;
    }

    try {
      await engine.executePartial(dirtyNodeIds);
      // Clear dirty flags for executed nodes
      set((state) => ({
        dirtyNodes: new Set([...state.dirtyNodes].filter(id => !dirtyNodeIds.includes(id)))
      }));
    } catch (error) {
      console.error('Partial execution failed:', error);
    }
  },

  executeSingleNode: async (nodeId, markOthersDirty) => {
    const { engine } = get();
    if (!engine) {
      console.error('Engine not initialized');
      return;
    }

    // Mark other nodes as having dirty previews
    if (markOthersDirty && markOthersDirty.length > 0) {
      set((state) => ({
        dirtyPreviewNodes: new Set([...state.dirtyPreviewNodes, ...markOthersDirty])
      }));
    }

    try {
      await engine.executeSingleNode(nodeId);
    } catch (error) {
      console.error('Single node execution failed:', error);
    }
  },

  abort: () => {
    const { engine } = get();
    if (engine) {
      engine.abort();
    }
  },

  clearCache: () => {
    const { engine } = get();
    if (engine) {
      engine.clearCache();
    }
    set({
      nodeOutputs: {},
      nodeStates: {},
      dirtyNodes: new Set(),
      dirtyPreviewNodes: new Set(),
    });
  },

  markNodesDirty: (nodeIds) => {
    const { engine } = get();
    if (engine) {
      engine.markDirty(nodeIds);
    }
    // Don't delete nodeOutputs here - let execution replace them naturally.
    // This keeps preview working while heavy compute nodes are waiting for execution.
    set((state) => {
      const newStates = { ...state.nodeStates };
      const newDirtyNodes = new Set(state.dirtyNodes);
      for (const nodeId of nodeIds) {
        newDirtyNodes.add(nodeId);
        if (newStates[nodeId]) {
          newStates[nodeId] = { ...newStates[nodeId], executionState: 'pending' };
        }
      }
      return { nodeStates: newStates, dirtyNodes: newDirtyNodes };
    });
  },

  markDirtyWithDownstream: (nodeId) => {
    const { engine } = get();
    if (!engine) return;

    const graph = engine.getGraph();
    const downstream = getDownstreamNodes(graph, nodeId);
    const allDirty = [nodeId, ...Array.from(downstream)];

    // Mark in engine
    engine.markDirty(allDirty);

    // Update state
    set((state) => {
      const newStates = { ...state.nodeStates };
      const newDirtyNodes = new Set(state.dirtyNodes);
      for (const id of allDirty) {
        newDirtyNodes.add(id);
        if (newStates[id]) {
          newStates[id] = { ...newStates[id], executionState: 'pending' };
        }
      }
      return { nodeStates: newStates, dirtyNodes: newDirtyNodes };
    });
  },

  markPreviewsDirty: (nodeIds) => {
    set((state) => ({
      dirtyPreviewNodes: new Set([...state.dirtyPreviewNodes, ...nodeIds])
    }));
  },

  clearDirtyPreviews: () => {
    set({ dirtyPreviewNodes: new Set() });
  },

  setNodeErrors: (errors) => {
    set((state) => {
      const newStates = { ...state.nodeStates };
      for (const { nodeId, message } of errors) {
        newStates[nodeId] = { executionState: 'error', progress: 0, error: message };
      }
      return { nodeStates: newStates };
    });
  },

  clearNodeErrors: () => {
    set((state) => {
      const newStates = { ...state.nodeStates };
      for (const nodeId of Object.keys(newStates)) {
        if (newStates[nodeId]?.executionState === 'error') {
          newStates[nodeId] = { executionState: 'idle', progress: 0 };
        }
      }
      return { nodeStates: newStates };
    });
  },

  getNodeOutput: (nodeId) => {
    return get().nodeOutputs[nodeId];
  },

  downloadGPUTexture: (texture) => {
    const { engine } = get();
    if (!engine) return null;

    const gpuContext = engine.getGPUContext();
    if (!gpuContext) return null;

    try {
      return gpuContext.downloadTexture(texture);
    } catch (error) {
      console.error('Failed to download GPU texture:', error);
      return null;
    }
  },

  isDirty: (nodeId) => {
    return get().dirtyNodes.has(nodeId);
  },

  requestOutput: async (nodeId) => {
    const { engine, dirtyNodes, nodeOutputs, executingNodes } = get();
    if (!engine) return null;

    // If not dirty, return cached output
    if (!dirtyNodes.has(nodeId)) {
      return nodeOutputs[nodeId] || null;
    }

    // If this specific node is already being executed, wait and return cache
    if (executingNodes.has(nodeId)) {
      return nodeOutputs[nodeId] || null;
    }

    const graph = engine.getGraph();

    // Get upstream dependencies in topological order
    const upstream = getUpstreamNodes(graph, nodeId);

    // Recursively compute dirty upstream nodes first (in order)
    // We need to process them in topological order
    const dirtyUpstream = Array.from(upstream).filter(id => get().dirtyNodes.has(id));

    // Sort dirty upstream by topological order (simple: process all upstream first)
    for (const upId of dirtyUpstream) {
      // Recursively request output for dirty upstream nodes
      await get().requestOutput(upId);
    }

    // Double-check if still dirty (may have been computed by another concurrent request)
    if (!get().dirtyNodes.has(nodeId)) {
      return get().nodeOutputs[nodeId] || null;
    }

    // Mark this node as executing
    set((state) => ({
      isExecuting: true,
      executingCount: state.executingCount + 1,
      executingNodes: new Set([...state.executingNodes, nodeId]),
    }));

    // Now execute this node
    try {
      await engine.executeNode(nodeId);

      // Clear dirty flag and executing state for this node
      set((state) => {
        const newExecutingNodes = new Set(state.executingNodes);
        newExecutingNodes.delete(nodeId);
        const newCount = state.executingCount - 1;
        return {
          isExecuting: newCount > 0,
          executingCount: newCount,
          executingNodes: newExecutingNodes,
          dirtyNodes: new Set([...state.dirtyNodes].filter(id => id !== nodeId)),
        };
      });

      return get().nodeOutputs[nodeId] || null;
    } catch (error) {
      console.error('requestOutput failed for node:', nodeId, error);
      // Clear executing state on error
      set((state) => {
        const newExecutingNodes = new Set(state.executingNodes);
        newExecutingNodes.delete(nodeId);
        const newCount = state.executingCount - 1;
        return {
          isExecuting: newCount > 0,
          executingCount: newCount,
          executingNodes: newExecutingNodes,
        };
      });
      return get().nodeOutputs[nodeId] || null;
    }
  },
}));

// Register execution store cache with memory profiler
memoryProfiler.registerCache('ExecutionStore nodeOutputs', () => {
  const state = useExecutionStore.getState();
  const nodeCount = Object.keys(state.nodeOutputs).length;
  let totalBytes = 0;

  for (const outputs of Object.values(state.nodeOutputs)) {
    for (const value of Object.values(outputs)) {
      if (isFloatImage(value)) {
        totalBytes += (value as FloatImage).data.byteLength;
      } else if (value instanceof ImageData) {
        totalBytes += value.data.byteLength;
      }
    }
  }

  return {
    size: nodeCount,
    description: `${nodeCount} nodes cached, ~${formatBytes(totalBytes)} in outputs`
  };
});

memoryProfiler.registerCache('ExecutionStore nodeStates', () => {
  const state = useExecutionStore.getState();
  return {
    size: Object.keys(state.nodeStates).length,
    description: `${Object.keys(state.nodeStates).length} node states tracked`
  };
});

memoryProfiler.registerCache('ExecutionStore dirtyPreviews', () => {
  const state = useExecutionStore.getState();
  return {
    size: state.dirtyPreviewNodes.size,
    description: `${state.dirtyPreviewNodes.size} nodes marked dirty (preview)`
  };
});

memoryProfiler.registerCache('ExecutionStore dirtyNodes', () => {
  const state = useExecutionStore.getState();
  return {
    size: state.dirtyNodes.size,
    description: `${state.dirtyNodes.size} nodes pending lazy computation`
  };
});
