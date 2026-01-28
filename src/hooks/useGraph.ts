import { useCallback, useEffect, useRef } from 'react';
import { useGraphStore, useExecutionStore, useHistoryStore, useUiStore } from '../store';
import { getDownstreamNodes } from '../core/graph/TopologicalSort';

/**
 * Hook for graph manipulation with history tracking
 */
export function useGraph() {
  const graphStore = useGraphStore();
  const executionStore = useExecutionStore();
  const historyStore = useHistoryStore();
  const uiStore = useUiStore();

  const isInitialized = useRef(false);

  // Initialize execution engine when graph changes
  useEffect(() => {
    if (!isInitialized.current) {
      executionStore.initEngine(graphStore.graph);
      historyStore.saveState(graphStore.graph, 'Initial state');
      isInitialized.current = true;
    } else {
      executionStore.updateEngineGraph(graphStore.graph);
    }
  }, [graphStore.graph, executionStore, historyStore]);

  // Add node with history
  const addNode = useCallback((type: string, x: number, y: number) => {
    const nodeId = graphStore.addNode(type, x, y);
    if (nodeId) {
      historyStore.saveState(graphStore.graph, `Add ${type} node`);
    }
    return nodeId;
  }, [graphStore, historyStore]);

  // Remove nodes with history
  const removeNodes = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    graphStore.removeNodes(nodeIds);
    historyStore.saveState(graphStore.graph, `Remove ${nodeIds.length} node(s)`);
  }, [graphStore, historyStore]);

  // Add edge with history
  const addEdge = useCallback((
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ) => {
    const edgeId = graphStore.addEdge(sourceNodeId, sourcePortId, targetNodeId, targetPortId);
    if (edgeId) {
      historyStore.saveState(graphStore.graph, 'Connect nodes');

      // Mark downstream nodes as dirty and execute
      const dirtyNodes = [targetNodeId, ...getDownstreamNodes(graphStore.graph, targetNodeId)];
      executionStore.markNodesDirty(Array.from(dirtyNodes));

      // Auto-execute if live edit is enabled
      if (uiStore.liveEdit && !executionStore.isExecuting) {
        executionStore.execute();
      }
    }
    return edgeId;
  }, [graphStore, historyStore, executionStore, uiStore.liveEdit]);

  // Remove edges with history
  const removeEdges = useCallback((edgeIds: string[]) => {
    if (edgeIds.length === 0) return;

    // Get target nodes before removing edges
    const targetNodes = edgeIds.map(id => {
      const edge = graphStore.graph.edges[id];
      return edge?.targetNodeId;
    }).filter(Boolean) as string[];

    graphStore.removeEdges(edgeIds);
    historyStore.saveState(graphStore.graph, `Remove ${edgeIds.length} connection(s)`);

    // Mark downstream nodes as dirty
    if (targetNodes.length > 0) {
      const dirtyNodes = new Set<string>();
      for (const nodeId of targetNodes) {
        dirtyNodes.add(nodeId);
        for (const downstream of getDownstreamNodes(graphStore.graph, nodeId)) {
          dirtyNodes.add(downstream);
        }
      }
      executionStore.markNodesDirty(Array.from(dirtyNodes));
    }
  }, [graphStore, historyStore, executionStore]);

  // Update node parameter with history
  const updateNodeParameter = useCallback((
    nodeId: string,
    paramId: string,
    value: unknown
  ) => {
    graphStore.updateNodeParameter(nodeId, paramId, value);

    // Mark node and downstream as dirty
    const dirtyNodes = [nodeId, ...getDownstreamNodes(graphStore.graph, nodeId)];
    executionStore.markNodesDirty(Array.from(dirtyNodes));
  }, [graphStore, executionStore]);

  // Save parameter change to history (debounced, called on mouse up)
  // Also triggers auto-execute if live edit is enabled
  const commitParameterChange = useCallback((_nodeId: string, paramId: string) => {
    historyStore.saveState(graphStore.graph, `Change ${paramId}`);

    // Auto-execute if live edit is enabled
    if (uiStore.liveEdit && !executionStore.isExecuting) {
      executionStore.execute();
    }
  }, [graphStore, historyStore, uiStore.liveEdit, executionStore]);

  // Move node (no history until commit)
  const moveNode = useCallback((nodeId: string, x: number, y: number) => {
    graphStore.updateNodePosition(nodeId, x, y);
  }, [graphStore]);

  // Commit node move to history
  const commitNodeMove = useCallback(() => {
    historyStore.saveState(graphStore.graph, 'Move node(s)');
  }, [graphStore, historyStore]);

  // Undo
  const undo = useCallback(() => {
    const state = historyStore.undo();
    if (state) {
      graphStore.loadGraph({
        ...graphStore.graph,
        nodes: state.nodes,
        edges: state.edges,
      });
      executionStore.clearCache();
    }
  }, [graphStore, historyStore, executionStore]);

  // Redo
  const redo = useCallback(() => {
    const state = historyStore.redo();
    if (state) {
      graphStore.loadGraph({
        ...graphStore.graph,
        nodes: state.nodes,
        edges: state.edges,
      });
      executionStore.clearCache();
    }
  }, [graphStore, historyStore, executionStore]);

  // Execute entire graph
  const executeGraph = useCallback(async () => {
    await executionStore.execute();
  }, [executionStore]);

  // Execute from a specific node
  const executeFromNode = useCallback(async (nodeId: string) => {
    await executionStore.executePartial([nodeId]);
  }, [executionStore]);

  // Delete selection
  const deleteSelection = useCallback(() => {
    const { selectedNodeIds, selectedEdgeIds } = graphStore;

    if (selectedEdgeIds.size > 0) {
      removeEdges(Array.from(selectedEdgeIds));
    }
    if (selectedNodeIds.size > 0) {
      removeNodes(Array.from(selectedNodeIds));
    }
  }, [graphStore, removeNodes, removeEdges]);

  // Copy/Paste
  const copy = useCallback(() => {
    graphStore.copy();
  }, [graphStore]);

  const cut = useCallback(() => {
    graphStore.copy();
    deleteSelection();
  }, [graphStore, deleteSelection]);

  const paste = useCallback((offsetX?: number, offsetY?: number) => {
    graphStore.paste(offsetX, offsetY);
    historyStore.saveState(graphStore.graph, 'Paste');
  }, [graphStore, historyStore]);

  // Select all
  const selectAll = useCallback(() => {
    graphStore.selectAll();
  }, [graphStore]);

  return {
    // State
    graph: graphStore.graph,
    selectedNodeIds: graphStore.selectedNodeIds,
    selectedEdgeIds: graphStore.selectedEdgeIds,
    connectionDrag: graphStore.connectionDrag,
    isExecuting: executionStore.isExecuting,
    nodeStates: executionStore.nodeStates,
    nodeOutputs: executionStore.nodeOutputs,
    canUndo: historyStore.canUndo(),
    canRedo: historyStore.canRedo(),

    // Node operations
    addNode,
    removeNodes,
    moveNode,
    commitNodeMove,
    updateNodeParameter,
    commitParameterChange,

    // Edge operations
    addEdge,
    removeEdges,

    // Selection
    selectNode: graphStore.selectNode,
    selectNodes: graphStore.selectNodes,
    selectEdge: graphStore.selectEdge,
    clearSelection: graphStore.clearSelection,
    selectAll,
    deleteSelection,

    // Connection drag
    startConnectionDrag: graphStore.startConnectionDrag,
    updateConnectionDrag: graphStore.updateConnectionDrag,
    endConnectionDrag: graphStore.endConnectionDrag,
    cancelConnectionDrag: graphStore.cancelConnectionDrag,

    // Clipboard
    copy,
    cut,
    paste,

    // History
    undo,
    redo,

    // Execution
    executeGraph,
    executeFromNode,
    getNodeOutput: executionStore.getNodeOutput,

    // Viewport
    setViewport: graphStore.setViewport,
    fitToContent: graphStore.fitToContent,
  };
}
