import { useCallback, useEffect, useRef } from 'react';
import { useGraphStore, useExecutionStore, useHistoryStore } from '../store';
import { getDownstreamNodes } from '../core/graph/TopologicalSort';

// Transform node parameters that should NOT trigger execution during drag
// These are applied visually in PreviewViewport for real-time feedback
const TRANSFORM_NODE_PARAMS = new Set([
  'offsetX', 'offsetY', 'angle', 'scaleX', 'scaleY',
  'pivotX', 'pivotY', 'uniformScale'
]);

/**
 * Hook for graph manipulation with history tracking
 */
export function useGraph() {
  const graphStore = useGraphStore();
  const historyStore = useHistoryStore();

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

      // LAZY EVALUATION: Mark downstream nodes as dirty (no execution)
      // Execution happens on-demand when preview requests output
      const exec = useExecutionStore.getState();
      exec.updateEngineGraph(freshGraph);
      exec.markDirtyWithDownstream(targetNodeId);
    }
    return edgeId;
  }, [graphStore, historyStore]);

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

    // LAZY EVALUATION: Mark downstream nodes as dirty (no execution)
    const exec = useExecutionStore.getState();
    exec.updateEngineGraph(freshGraph);
    for (const nodeId of targetNodes) {
      exec.markDirtyWithDownstream(nodeId);
    }
  }, [graphStore, historyStore]);

  // Update node parameter (called during drag)
  // LAZY EVALUATION: Only marks nodes dirty, no execution
  // Execution happens on-demand when preview requests output
  const updateNodeParameter = useCallback((
    nodeId: string,
    paramId: string,
    value: unknown
  ) => {
    // Always update parameters immediately for responsive UI
    graphStore.updateNodeParameter(nodeId, paramId, value);

    // Get fresh graph state after update (not stale closure reference)
    const freshGraph = useGraphStore.getState().graph;
    const exec = useExecutionStore.getState();

    // Check if this is a TransformNode parameter - these get real-time visual updates
    // without execution, so we only update the store (done above)
    const node = freshGraph.nodes[nodeId];
    const isTransformNodeParam = node?.type === 'transform/transform' && TRANSFORM_NODE_PARAMS.has(paramId);

    if (isTransformNodeParam) {
      // For TransformNode params: DON'T mark dirty or execute
      // PreviewViewport will compute the visual transform from current params
      // Just update engine with latest graph (already done above)
      exec.updateEngineGraph(freshGraph);
      return;
    }

    // Update engine with latest graph state
    exec.updateEngineGraph(freshGraph);

    // Check if this is a transform-only param (starts with _)
    // Transform params: _tx, _ty, _sx, _sy, _angle, _px, _py
    const isTransformParam = paramId.startsWith('_');

    if (isTransformParam) {
      // For transform params, try to update transform in-place
      // Only mark downstream nodes dirty for later lazy evaluation
      const downstreamNodes = getDownstreamNodes(freshGraph, nodeId);
      const downstreamArray = Array.from(downstreamNodes);

      // Try to update this node's transform in-place (no re-execution)
      exec.executeSingleNode(nodeId, downstreamArray);

      if (downstreamArray.length > 0) {
        exec.markNodesDirty(downstreamArray);
      }
    } else {
      // For non-transform params, mark node and all downstream as dirty
      // NO EXECUTION - lazy evaluation will compute on demand
      exec.markDirtyWithDownstream(nodeId);
    }
  }, [graphStore]);

  // Batch update multiple parameters atomically
  // LAZY EVALUATION: Only marks nodes dirty, no execution
  const batchUpdateNodeParameters = useCallback((
    nodeId: string,
    updates: Record<string, unknown>
  ) => {
    // Update all parameters directly in the store
    for (const [paramId, value] of Object.entries(updates)) {
      graphStore.updateNodeParameter(nodeId, paramId, value);
    }

    const freshGraph = useGraphStore.getState().graph;
    const exec = useExecutionStore.getState();

    // Check if this is a TransformNode and ALL updates are transform params
    const node = freshGraph.nodes[nodeId];
    const isTransformNode = node?.type === 'transform/transform';
    const allTransformNodeParams = isTransformNode &&
      Object.keys(updates).every(paramId => TRANSFORM_NODE_PARAMS.has(paramId));

    if (allTransformNodeParams) {
      // For TransformNode params: DON'T mark dirty or execute
      // PreviewViewport will compute the visual transform from current params
      exec.updateEngineGraph(freshGraph);
      return;
    }

    // Update engine with latest graph state
    exec.updateEngineGraph(freshGraph);

    // Check if ALL updates are transform-only params (legacy _ prefix)
    const allTransformParams = Object.keys(updates).every(paramId => paramId.startsWith('_'));

    if (allTransformParams) {
      // For transform params, try to update transform in-place
      const downstreamNodes = getDownstreamNodes(freshGraph, nodeId);
      const downstreamArray = Array.from(downstreamNodes);

      exec.executeSingleNode(nodeId, downstreamArray);

      if (downstreamArray.length > 0) {
        exec.markNodesDirty(downstreamArray);
      }
    } else {
      // For non-transform params, mark node and all downstream as dirty
      // NO EXECUTION - lazy evaluation will compute on demand
      exec.markDirtyWithDownstream(nodeId);
    }
  }, [graphStore]);

  // Save parameter change to history (debounced, called on mouse up)
  // LAZY EVALUATION: Nodes stay dirty until preview requests them
  const commitParameterChange = useCallback((nodeId: string, paramId: string) => {
    // Get fresh graph state
    const freshGraph = useGraphStore.getState().graph;
    historyStore.saveState(freshGraph, `Change ${paramId}`);

    const exec = useExecutionStore.getState();
    exec.updateEngineGraph(freshGraph);

    // For TransformNode params that were updated without execution during drag,
    // now mark the node and downstream as dirty to trigger lazy re-execution
    const node = freshGraph.nodes[nodeId];
    const isTransformNodeParam = node?.type === 'transform/transform' && TRANSFORM_NODE_PARAMS.has(paramId);
    if (isTransformNodeParam) {
      exec.markDirtyWithDownstream(nodeId);
    }

    // Clear visual dirty preview indicators (the dirtyNodes set remains)
    exec.clearDirtyPreviews();
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
