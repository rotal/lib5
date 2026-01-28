import { create } from 'zustand';
import { produce } from 'immer';
import {
  Graph,
  Edge,
  NodeInstance,
  ViewportState,
  createEmptyGraph,
  getPortEdges,
} from '../types';
import { NodeRegistry } from '../core/graph/NodeRegistry';
import { wouldCreateCycle } from '../core/graph/TopologicalSort';

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
}

interface GraphActions {
  newGraph: (name?: string) => void;
  loadGraph: (graph: Graph) => void;
  setGraphName: (name: string) => void;
  addNode: (type: string, x: number, y: number) => string | null;
  removeNode: (nodeId: string) => void;
  removeNodes: (nodeIds: string[]) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  updateNodeParameter: (nodeId: string, paramId: string, value: unknown) => void;
  setNodeCollapsed: (nodeId: string, collapsed: boolean) => void;
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

export const useGraphStore = create<GraphState & GraphActions>((set, get) => ({
  graph: createEmptyGraph(),
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  connectionDrag: null,
  clipboard: null,

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
        node.parameters[paramId] = value;
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

  addEdge: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
    const { graph } = get();

    if (!graph.nodes[sourceNodeId] || !graph.nodes[targetNodeId]) {
      return null;
    }

    if (wouldCreateCycle(graph, sourceNodeId, targetNodeId)) {
      return null;
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
}));
