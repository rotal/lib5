import { useCallback, useEffect, useRef } from 'react';
import { useGraphStore, useExecutionStore, useHistoryStore, useUiStore } from '../store';
import { getDownstreamNodes } from '../core/graph/TopologicalSort';

/**
 * Hook for graph manipulation with history tracking
 */
export function useGraph() {
  const graphStore = useGraphStore();
  const historyStore = useHistoryStore();
  const uiStore = useUiStore();

  // Only subscribe to the specific execution state we need for the return value
  // Use selectors to avoid re-renders on every callback
  const isExecuting = useExecutionStore((state) => state.isExecuting);
  const nodeStates = useExecutionStore((state) => state.nodeStates);
  const nodeOutputs = useExecutionStore((state) => state.nodeOutputs);

  const isInitialized = useRef(false);
  const lastGraphId = useRef<string | null>(null);

  // Initialize execution engine when graph changes
  // Access store methods directly from module to avoid dependency on changing state
  useEffect(() => {
    const exec = useExecutionStore.getState();
    const hist = useHistoryStore.getState();
    const graph = graphStore.graph;

    // Use graph.id to detect actual graph changes, not reference changes
    const graphId = graph.id;
    const graphChanged = graphId !== lastGraphId.current;

    if (!isInitialized.current) {
      exec.initEngine(graph);
      hist.saveState(graph, 'Initial state');
      isInitialized.current = true;
      lastGraphId.current = graphId;

      // Always execute on load
      exec.execute();
    } else if (graphChanged) {
      // Graph ID changed - this is a real graph change (load/new)
      exec.updateEngineGraph(graph);
      lastGraphId.current = graphId;

      // Re-execute after graph hydration from persist (graph changed but no outputs yet)
      const { nodeOutputs: outputs, isExecuting: executing, executionError } = exec;
      if (Object.keys(outputs).length === 0 &&
          Object.keys(graph.nodes).length > 0 &&
          !executing &&
          !executionError) {
        exec.execute();
      }
    } else {
      // Same graph ID, just update the engine with latest state
      exec.updateEngineGraph(graph);
    }
  }, [graphStore.graph]);

  // Add node with history
  const addNode = useCallback((type: string, x: number, y: number) => {
    const nodeId = graphStore.addNode(type, x, y);
    if (nodeId) {
      const freshGraph = useGraphStore.getState().graph;
      historyStore.saveState(freshGraph, `Add ${type} node`);
    }
    return nodeId;
  }, [graphStore, historyStore]);

  // Remove nodes with history
  const removeNodes = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    graphStore.removeNodes(nodeIds);
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, `Remove ${nodeIds.length} node(s)`);
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
      // Get fresh graph state after update
      const freshGraph = useGraphStore.getState().graph;
      historyStore.saveState(freshGraph, 'Connect nodes');

      // Mark downstream nodes as dirty and execute
      const exec = useExecutionStore.getState();
      const dirtyNodes = [targetNodeId, ...getDownstreamNodes(freshGraph, targetNodeId)];
      exec.markNodesDirty(Array.from(dirtyNodes));

      // Auto-execute if live edit is enabled
      if (uiStore.liveEdit && !exec.isExecuting) {
        // Ensure engine has the latest graph before executing
        exec.updateEngineGraph(freshGraph);
        exec.execute();
      }
    }
    return edgeId;
  }, [graphStore, historyStore, uiStore.liveEdit]);

  // Remove edges with history
  const removeEdges = useCallback((edgeIds: string[]) => {
    if (edgeIds.length === 0) return;

    // Get target nodes before removing edges (need old graph state here)
    const currentGraph = useGraphStore.getState().graph;
    const targetNodes = edgeIds.map(id => {
      const edge = currentGraph.edges[id];
      return edge?.targetNodeId;
    }).filter(Boolean) as string[];

    graphStore.removeEdges(edgeIds);

    // Get fresh graph state after removal
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, `Remove ${edgeIds.length} connection(s)`);

    // Mark downstream nodes as dirty
    if (targetNodes.length > 0) {
      const dirtyNodes = new Set<string>();
      for (const nodeId of targetNodes) {
        dirtyNodes.add(nodeId);
        for (const downstream of getDownstreamNodes(freshGraph, nodeId)) {
          dirtyNodes.add(downstream);
        }
      }
      useExecutionStore.getState().markNodesDirty(Array.from(dirtyNodes));
    }
  }, [graphStore, historyStore]);

  // Update node parameter (called during drag)
  const updateNodeParameter = useCallback((
    nodeId: string,
    paramId: string,
    value: unknown
  ) => {
    graphStore.updateNodeParameter(nodeId, paramId, value);

    // Get fresh graph state after update (not stale closure reference)
    const freshGraph = useGraphStore.getState().graph;
    const exec = useExecutionStore.getState();

    // Mark node and downstream as dirty
    const dirtyNodes = [nodeId, ...getDownstreamNodes(freshGraph, nodeId)];
    exec.markNodesDirty(Array.from(dirtyNodes));

    // In live mode, execute immediately on parameter change
    if (uiStore.liveEdit && !exec.isExecuting) {
      exec.updateEngineGraph(freshGraph);
      exec.execute();
    }
  }, [graphStore, uiStore.liveEdit]);

  // Batch update multiple parameters atomically (triggers execution once after all updates)
  const batchUpdateNodeParameters = useCallback((
    nodeId: string,
    updates: Record<string, unknown>
  ) => {
    // Update all parameters directly in the store (no execution trigger per update)
    for (const [paramId, value] of Object.entries(updates)) {
      graphStore.updateNodeParameter(nodeId, paramId, value);
    }

    // Trigger execution once with all updates applied
    const freshGraph = useGraphStore.getState().graph;
    const exec = useExecutionStore.getState();
    const dirtyNodes = [nodeId, ...getDownstreamNodes(freshGraph, nodeId)];
    exec.markNodesDirty(dirtyNodes);

    if (uiStore.liveEdit && !exec.isExecuting) {
      exec.updateEngineGraph(freshGraph);
      exec.execute();
    }
  }, [graphStore, uiStore.liveEdit]);

  // Save parameter change to history (debounced, called on mouse up)
  // Also triggers auto-execute
  const commitParameterChange = useCallback((_nodeId: string, paramId: string) => {
    // Get fresh graph state
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, `Change ${paramId}`);

    // Always execute after committing a parameter change
    const exec = useExecutionStore.getState();
    if (!exec.isExecuting) {
      // Ensure engine has the latest graph before executing
      exec.updateEngineGraph(freshGraph);
      exec.execute();
    }
  }, [historyStore]);

  // Move node (no history until commit)
  const moveNode = useCallback((nodeId: string, x: number, y: number) => {
    graphStore.updateNodePosition(nodeId, x, y);
  }, [graphStore]);

  // Commit node move to history
  const commitNodeMove = useCallback(() => {
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, 'Move node(s)');
  }, [historyStore]);

  // Undo
  const undo = useCallback(() => {
    const state = historyStore.undo();
    if (state) {
      graphStore.loadGraph({
        ...graphStore.graph,
        nodes: state.nodes,
        edges: state.edges,
      });
      useExecutionStore.getState().clearCache();
    }
  }, [graphStore, historyStore]);

  // Redo
  const redo = useCallback(() => {
    const state = historyStore.redo();
    if (state) {
      graphStore.loadGraph({
        ...graphStore.graph,
        nodes: state.nodes,
        edges: state.edges,
      });
      useExecutionStore.getState().clearCache();
    }
  }, [graphStore, historyStore]);

  // Execute entire graph
  const executeGraph = useCallback(async () => {
    await useExecutionStore.getState().execute();
  }, []);

  // Execute from a specific node
  const executeFromNode = useCallback(async (nodeId: string) => {
    await useExecutionStore.getState().executePartial([nodeId]);
  }, []);

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
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, 'Paste');
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
    isExecuting,
    nodeStates,
    nodeOutputs,
    canUndo: historyStore.canUndo(),
    canRedo: historyStore.canRedo(),

    // Node operations
    addNode,
    removeNodes,
    moveNode,
    commitNodeMove,
    updateNodeParameter,
    batchUpdateNodeParameters,
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
    getNodeOutput: useExecutionStore.getState().getNodeOutput,

    // Viewport
    setViewport: graphStore.setViewport,
    fitToContent: graphStore.fitToContent,
  };
}
