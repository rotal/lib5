import { create } from 'zustand';
import { GraphEngine, createGraphEngine, ExecutionCallbacks } from '../core/graph/GraphEngine';
import { Graph, NodeRuntimeState } from '../types';
import { PortValue, FloatImage } from '../types/data';
import { GPUTexture } from '../types/gpu';

interface ExecutionState {
  engine: GraphEngine | null;
  isExecuting: boolean;
  executionProgress: number;
  executionError: string | null;
  nodeStates: Record<string, NodeRuntimeState>;
  nodeOutputs: Record<string, Record<string, PortValue>>;
  lastExecutionTime: number | null;
}

interface ExecutionActions {
  initEngine: (graph: Graph) => void;
  updateEngineGraph: (graph: Graph) => void;
  execute: () => Promise<void>;
  executePartial: (dirtyNodeIds: string[]) => Promise<void>;
  abort: () => void;
  clearCache: () => void;
  markNodesDirty: (nodeIds: string[]) => void;
  setNodeErrors: (errors: Array<{ nodeId: string; message: string }>) => void;
  clearNodeErrors: () => void;
  getNodeOutput: (nodeId: string) => Record<string, PortValue> | undefined;
  downloadGPUTexture: (texture: GPUTexture) => FloatImage | null;
}

export const useExecutionStore = create<ExecutionState & ExecutionActions>((set, get) => ({
  engine: null,
  isExecuting: false,
  executionProgress: 0,
  executionError: null,
  nodeStates: {},
  nodeOutputs: {},
  lastExecutionTime: null,

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
    } catch (error) {
      console.error('Partial execution failed:', error);
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
      nodeStates: {}
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
      for (const nodeId of nodeIds) {
        if (newStates[nodeId]) {
          newStates[nodeId] = { ...newStates[nodeId], executionState: 'pending' };
        }
      }
      return { nodeStates: newStates };
    });
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
}));
