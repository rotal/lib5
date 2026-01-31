import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import {
  Graph,
  Edge,
  NodeInstance,
  ViewportState,
  createEmptyGraph,
  getPortEdges,
  areTypesCompatible,
  Color,
} from '../types';
import { NodeRegistry } from '../core/graph/NodeRegistry';
import { wouldCreateCycle } from '../core/graph/TopologicalSort';
import { memoryProfiler, formatBytes } from '../utils/memoryProfiler';

const STORAGE_KEY = 'lib5-graph';

// Debounced storage to prevent excessive localStorage writes during slider drags
function createDebouncedStorage() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: string | null = null;

  return {
    getItem: (name: string) => {
      const str = localStorage.getItem(name);
      if (!str) return null;
      return JSON.parse(str);
    },
    setItem: (name: string, value: unknown) => {
      pendingValue = JSON.stringify(value);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Debounce localStorage writes by 500ms
      timeoutId = setTimeout(() => {
        if (pendingValue !== null) {
          localStorage.setItem(name, pendingValue);
          pendingValue = null;
        }
        timeoutId = null;
      }, 500);
    },
    removeItem: (name: string) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pendingValue = null;
      localStorage.removeItem(name);
    },
  };
}

const debouncedStorage = createDebouncedStorage();

interface GraphState {
  graph: Graph;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  connectionDrag: {
    active: boolean;
    sourceNodeId: string;
    sourcePortId: string;
    sourceDirection: 'input' | 'output';
    mouseX: number;
    mouseY: number;
  } | null;
  clipboard: {
    nodes: NodeInstance[];
    edges: Edge[];
  } | null;
  // Stores node IDs that had preview enabled before toggling off (null = previews are showing)
  hiddenPreviewNodeIds: Set<string> | null;
}

interface GraphActions {
  newGraph: (name?: string) => void;
  loadGraph: (graph: Graph) => void;
  setGraphName: (name: string) => void;
  setCanvas: (width: number, height: number) => void;
  setCanvasDefaultColor: (color: Color) => void;
  addNode: (type: string, x: number, y: number) => string | null;
  removeNode: (nodeId: string) => void;
  removeNodes: (nodeIds: string[]) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  updateNodeParameter: (nodeId: string, paramId: string, value: unknown) => void;
  setNodeCollapsed: (nodeId: string, collapsed: boolean) => void;
  setNodeLocalPreview: (nodeId: string, show: boolean) => void;
  toggleAllPreviews: () => void;
  addEdge: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => string | null;
  removeEdge: (edgeId: string) => void;
  removeEdges: (edgeIds: string[]) => void;
  selectNode: (nodeId: string, additive?: boolean) => void;
  selectNodes: (nodeIds: string[], additive?: boolean) => void;
  selectEdge: (edgeId: string, additive?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  startConnectionDrag: (nodeId: string, portId: string, direction: 'input' | 'output', mouseX: number, mouseY: number) => void;
  updateConnectionDrag: (mouseX: number, mouseY: number) => void;
  endConnectionDrag: (targetNodeId?: string, targetPortId?: string) => void;
  cancelConnectionDrag: () => void;
  setViewport: (viewport: Partial<ViewportState>) => void;
  resetViewport: () => void;
  fitToContent: () => void;
  copy: () => void;
  cut: () => void;
  paste: (offsetX?: number, offsetY?: number) => void;
  getNode: (nodeId: string) => NodeInstance | undefined;
  getEdge: (edgeId: string) => Edge | undefined;
}

export const useGraphStore = create<GraphState & GraphActions>()(
  persist(
    (set, get) => ({
      graph: createEmptyGraph(),
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      connectionDrag: null,
      clipboard: null,
      hiddenPreviewNodeIds: null,

  newGraph: (name = 'Untitled') => {
    set({
      graph: createEmptyGraph(name),
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      connectionDrag: null,
    });
  },

  loadGraph: (graph) => {
    set({
      graph,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      connectionDrag: null,
    });
  },

  setGraphName: (name) => {
    set(produce((state: GraphState) => {
      state.graph.name = name;
    }));
  },

  setCanvas: (width, height) => {
    set(produce((state: GraphState) => {
      state.graph.canvas = {
        ...state.graph.canvas,
        width,
        height,
      };
    }));
  },

  setCanvasDefaultColor: (color) => {
    set(produce((state: GraphState) => {
      if (!state.graph.canvas) {
        state.graph.canvas = { width: 1920, height: 1080 };
      }
      state.graph.canvas.defaultColor = color;
    }));
  },

  addNode: (type, x, y) => {
    const instance = NodeRegistry.createInstance(type, { x, y });
    if (!instance) return null;

    set(produce((state: GraphState) => {
      state.graph.nodes[instance.id] = instance;
    }));

    return instance.id;
  },

  removeNode: (nodeId) => {
    set(produce((state: GraphState) => {
      const edgesToRemove = Object.values(state.graph.edges).filter(
        edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
      );
      for (const edge of edgesToRemove) {
        delete state.graph.edges[edge.id];
      }
      delete state.graph.nodes[nodeId];
      state.selectedNodeIds.delete(nodeId);
    }));
  },

  removeNodes: (nodeIds) => {
    set(produce((state: GraphState) => {
      for (const nodeId of nodeIds) {
        const edgesToRemove = Object.values(state.graph.edges).filter(
          edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
        );
        for (const edge of edgesToRemove) {
          delete state.graph.edges[edge.id];
          state.selectedEdgeIds.delete(edge.id);
        }
        delete state.graph.nodes[nodeId];
        state.selectedNodeIds.delete(nodeId);
      }
    }));
  },

  updateNodePosition: (nodeId, x, y) => {
    set(produce((state: GraphState) => {
      const node = state.graph.nodes[nodeId];
      if (node) {
        node.position = { x, y };
      }
    }));
  },

  updateNodeParameter: (nodeId, paramId, value) => {
    set(produce((state: GraphState) => {
      const node = state.graph.nodes[nodeId];
      if (node) {
        // Check for NaN values and reset to default
        let finalValue = value;
        if (typeof value === 'number' && Number.isNaN(value)) {
          // Get default value from node definition
          const def = NodeRegistry.get(node.type);
          const paramDef = def?.parameters.find(p => p.id === paramId);
          finalValue = paramDef?.default ?? 0;
          console.warn(`[GraphStore] NaN detected for ${paramId}, resetting to default:`, finalValue);
        }
        node.parameters[paramId] = finalValue;
      }
    }));
  },

  setNodeCollapsed: (nodeId, collapsed) => {
    set(produce((state: GraphState) => {
      const node = state.graph.nodes[nodeId];
      if (node) {
        node.collapsed = collapsed;
      }
    }));
  },

  setNodeLocalPreview: (nodeId, show) => {
    set(produce((state: GraphState) => {
      // If previews are currently hidden and user is enabling a new preview
      if (state.hiddenPreviewNodeIds !== null && show) {
        // Clear the hidden state - start fresh with only the new preview
        state.hiddenPreviewNodeIds = null;
        // Don't restore old previews - they stay off
      }

      // Apply the user's requested change
      const node = state.graph.nodes[nodeId];
      if (node) {
        node.localPreview = show;
      }
    }));
  },

  toggleAllPreviews: () => {
    const { graph, hiddenPreviewNodeIds } = get();

    if (hiddenPreviewNodeIds === null) {
      // Previews are currently showing - hide them and remember which ones
      const nodesWithPreview = new Set<string>();
      for (const node of Object.values(graph.nodes)) {
        if (node.localPreview) {
          nodesWithPreview.add(node.id);
        }
      }

      // Only toggle if there are previews to hide
      if (nodesWithPreview.size > 0) {
        set(produce((state: GraphState) => {
          for (const nodeId of nodesWithPreview) {
            const node = state.graph.nodes[nodeId];
            if (node) {
              node.localPreview = false;
            }
          }
          state.hiddenPreviewNodeIds = nodesWithPreview;
        }));
      }
    } else {
      // Previews are hidden - restore them
      set(produce((state: GraphState) => {
        for (const nodeId of hiddenPreviewNodeIds) {
          const node = state.graph.nodes[nodeId];
          if (node) {
            node.localPreview = true;
          }
        }
        state.hiddenPreviewNodeIds = null;
      }));
    }
  },

  addEdge: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
    const { graph } = get();

    if (!graph.nodes[sourceNodeId] || !graph.nodes[targetNodeId]) {
      return null;
    }

    if (wouldCreateCycle(graph, sourceNodeId, targetNodeId)) {
      return null;
    }

    // Check type compatibility
    const sourceNode = graph.nodes[sourceNodeId];
    const targetNode = graph.nodes[targetNodeId];
    const sourceDef = NodeRegistry.get(sourceNode.type);
    const targetDef = NodeRegistry.get(targetNode.type);
    if (sourceDef && targetDef) {
      const sourcePort = sourceDef.outputs.find(p => p.id === sourcePortId);
      const targetPort = targetDef.inputs.find(p => p.id === targetPortId);
      if (sourcePort && targetPort && !areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
        return null;
      }
    }

    const existingEdges = getPortEdges(graph, targetNodeId, targetPortId, 'input');
    const edgeId = crypto.randomUUID();

    set(produce((state: GraphState) => {
      for (const edge of existingEdges) {
        delete state.graph.edges[edge.id];
      }
      state.graph.edges[edgeId] = {
        id: edgeId,
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
      };
    }));

    return edgeId;
  },

  removeEdge: (edgeId) => {
    set(produce((state: GraphState) => {
      delete state.graph.edges[edgeId];
      state.selectedEdgeIds.delete(edgeId);
    }));
  },

  removeEdges: (edgeIds) => {
    set(produce((state: GraphState) => {
      for (const edgeId of edgeIds) {
        delete state.graph.edges[edgeId];
        state.selectedEdgeIds.delete(edgeId);
      }
    }));
  },

  selectNode: (nodeId, additive = false) => {
    set((state) => {
      const newSelectedNodes = additive ? new Set(state.selectedNodeIds) : new Set<string>();
      const newSelectedEdges = additive ? new Set(state.selectedEdgeIds) : new Set<string>();

      if (newSelectedNodes.has(nodeId)) {
        newSelectedNodes.delete(nodeId);
      } else {
        newSelectedNodes.add(nodeId);
      }

      return {
        selectedNodeIds: newSelectedNodes,
        selectedEdgeIds: newSelectedEdges,
      };
    });
  },

  selectNodes: (nodeIds, additive = false) => {
    set((state) => {
      const newSelectedNodes = additive ? new Set(state.selectedNodeIds) : new Set<string>();
      const newSelectedEdges = additive ? new Set(state.selectedEdgeIds) : new Set<string>();

      for (const nodeId of nodeIds) {
        newSelectedNodes.add(nodeId);
      }

      return {
        selectedNodeIds: newSelectedNodes,
        selectedEdgeIds: newSelectedEdges,
      };
    });
  },

  selectEdge: (edgeId, additive = false) => {
    set((state) => {
      const newSelectedNodes = additive ? new Set(state.selectedNodeIds) : new Set<string>();
      const newSelectedEdges = additive ? new Set(state.selectedEdgeIds) : new Set<string>();

      if (newSelectedEdges.has(edgeId)) {
        newSelectedEdges.delete(edgeId);
      } else {
        newSelectedEdges.add(edgeId);
      }

      return {
        selectedNodeIds: newSelectedNodes,
        selectedEdgeIds: newSelectedEdges,
      };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedNodeIds: new Set(Object.keys(state.graph.nodes)),
      selectedEdgeIds: new Set(Object.keys(state.graph.edges)),
    }));
  },

  clearSelection: () => {
    set({
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
    });
  },

  deleteSelection: () => {
    const { selectedNodeIds, selectedEdgeIds, removeNodes, removeEdges } = get();
    if (selectedEdgeIds.size > 0) {
      removeEdges(Array.from(selectedEdgeIds));
    }
    if (selectedNodeIds.size > 0) {
      removeNodes(Array.from(selectedNodeIds));
    }
  },

  startConnectionDrag: (nodeId, portId, direction, mouseX, mouseY) => {
    set({
      connectionDrag: {
        active: true,
        sourceNodeId: nodeId,
        sourcePortId: portId,
        sourceDirection: direction,
        mouseX,
        mouseY,
      },
    });
  },

  updateConnectionDrag: (mouseX, mouseY) => {
    set((state) => {
      if (!state.connectionDrag) return state;
      return {
        connectionDrag: {
          ...state.connectionDrag,
          mouseX,
          mouseY,
        },
      };
    });
  },

  endConnectionDrag: (targetNodeId, targetPortId) => {
    const { connectionDrag, addEdge } = get();

    if (connectionDrag && targetNodeId && targetPortId) {
      if (connectionDrag.sourceDirection === 'output') {
        addEdge(connectionDrag.sourceNodeId, connectionDrag.sourcePortId, targetNodeId, targetPortId);
      } else {
        addEdge(targetNodeId, targetPortId, connectionDrag.sourceNodeId, connectionDrag.sourcePortId);
      }
    }

    set({ connectionDrag: null });
  },

  cancelConnectionDrag: () => {
    set({ connectionDrag: null });
  },

  setViewport: (viewport) => {
    set(produce((state: GraphState) => {
      Object.assign(state.graph.viewport, viewport);
    }));
  },

  resetViewport: () => {
    set(produce((state: GraphState) => {
      state.graph.viewport = { x: 0, y: 0, zoom: 1 };
    }));
  },

  fitToContent: () => {
    const { graph } = get();
    const nodes = Object.values(graph.nodes);

    if (nodes.length === 0) {
      set(produce((state: GraphState) => {
        state.graph.viewport = { x: 0, y: 0, zoom: 1 };
      }));
      return;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      const width = node.width || 200;
      const height = node.height || 100;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    set(produce((state: GraphState) => {
      state.graph.viewport = {
        x: -centerX,
        y: -centerY,
        zoom: 1,
      };
    }));
  },

  copy: () => {
    const { graph, selectedNodeIds } = get();
    if (selectedNodeIds.size === 0) return;

    const nodes = Array.from(selectedNodeIds)
      .map(id => graph.nodes[id])
      .filter(Boolean);

    const nodeIdSet = new Set(selectedNodeIds);
    const edges = Object.values(graph.edges).filter(
      edge => nodeIdSet.has(edge.sourceNodeId) && nodeIdSet.has(edge.targetNodeId)
    );

    set({ clipboard: { nodes, edges } });
  },

  cut: () => {
    const { copy, deleteSelection } = get();
    copy();
    deleteSelection();
  },

  paste: (offsetX = 50, offsetY = 50) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    const idMap = new Map<string, string>();

    set(produce((state: GraphState) => {
      for (const node of clipboard.nodes) {
        const newId = crypto.randomUUID();
        idMap.set(node.id, newId);

        state.graph.nodes[newId] = {
          ...node,
          id: newId,
          position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
          },
          parameters: { ...node.parameters },
        };
      }

      for (const edge of clipboard.edges) {
        const newSourceId = idMap.get(edge.sourceNodeId);
        const newTargetId = idMap.get(edge.targetNodeId);

        if (newSourceId && newTargetId) {
          const newEdgeId = crypto.randomUUID();
          state.graph.edges[newEdgeId] = {
            id: newEdgeId,
            sourceNodeId: newSourceId,
            sourcePortId: edge.sourcePortId,
            targetNodeId: newTargetId,
            targetPortId: edge.targetPortId,
          };
        }
      }

      state.selectedNodeIds = new Set(idMap.values());
      state.selectedEdgeIds = new Set();
    }));
  },

      getNode: (nodeId) => get().graph.nodes[nodeId],
      getEdge: (edgeId) => get().graph.edges[edgeId],
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        // Only persist the graph, not selections or other transient state
        graph: state.graph,
      }),
      storage: debouncedStorage,
    }
  )
);

// Register graph store with memory profiler
memoryProfiler.registerCache('Graph node params', () => {
  const state = useGraphStore.getState();
  let totalBytes = 0;
  let dataUrlCount = 0;

  for (const node of Object.values(state.graph.nodes)) {
    for (const value of Object.values(node.parameters)) {
      if (typeof value === 'string') {
        totalBytes += value.length * 2; // UTF-16
        if (value.startsWith('data:')) {
          dataUrlCount++;
        }
      } else if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.dataUrl === 'string') {
          totalBytes += obj.dataUrl.length * 2;
          dataUrlCount++;
        }
      }
    }
  }

  return {
    size: Object.keys(state.graph.nodes).length,
    description: `${Object.keys(state.graph.nodes).length} nodes, ${dataUrlCount} data URLs, ~${formatBytes(totalBytes)}`
  };
});
