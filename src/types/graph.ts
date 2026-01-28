import { NodeInstance, NodeRuntimeState } from './node';

/**
 * Edge connecting two ports
 */
export interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

/**
 * Graph viewport state
 */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Complete graph state
 */
export interface Graph {
  id: string;
  name: string;
  nodes: Record<string, NodeInstance>;
  edges: Record<string, Edge>;
  viewport: ViewportState;
}

/**
 * Serialized graph for save/load
 */
export interface SerializedGraph {
  version: string;
  metadata: {
    name: string;
    created: string;
    modified: string;
  };
  nodes: NodeInstance[];
  edges: Edge[];
  viewport: ViewportState;
}

/**
 * Graph execution state
 */
export interface GraphExecutionState {
  isExecuting: boolean;
  executionOrder: string[];
  nodeStates: Record<string, NodeRuntimeState>;
  startTime?: number;
  endTime?: number;
  error?: string;
}

/**
 * Selection state
 */
export interface SelectionState {
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
}

/**
 * Drag state for creating connections
 */
export interface ConnectionDragState {
  sourceNodeId: string;
  sourcePortId: string;
  sourceDirection: 'input' | 'output';
  mousePosition: { x: number; y: number };
}

/**
 * History entry for undo/redo
 */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  nodes: Record<string, NodeInstance>;
  edges: Record<string, Edge>;
}

/**
 * History state
 */
export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  maxEntries: number;
}

/**
 * Graph validation error
 */
export interface GraphValidationError {
  type: 'cycle' | 'missing_input' | 'type_mismatch' | 'disconnected';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/**
 * Result of graph validation
 */
export interface GraphValidationResult {
  valid: boolean;
  errors: GraphValidationError[];
  warnings: GraphValidationError[];
}

/**
 * Convert graph to serialized format
 */
export function serializeGraph(graph: Graph): SerializedGraph {
  return {
    version: '1.0.0',
    metadata: {
      name: graph.name,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    nodes: Object.values(graph.nodes),
    edges: Object.values(graph.edges),
    viewport: graph.viewport,
  };
}

/**
 * Convert serialized graph to runtime format
 */
export function deserializeGraph(serialized: SerializedGraph): Graph {
  const nodes: Record<string, NodeInstance> = {};
  const edges: Record<string, Edge> = {};

  for (const node of serialized.nodes) {
    nodes[node.id] = node;
  }

  for (const edge of serialized.edges) {
    edges[edge.id] = edge;
  }

  return {
    id: crypto.randomUUID(),
    name: serialized.metadata.name,
    nodes,
    edges,
    viewport: serialized.viewport,
  };
}

/**
 * Create an empty graph
 */
export function createEmptyGraph(name: string = 'Untitled'): Graph {
  return {
    id: crypto.randomUUID(),
    name,
    nodes: {},
    edges: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Check if a node has any incoming edges
 */
export function hasIncomingEdges(graph: Graph, nodeId: string): boolean {
  return Object.values(graph.edges).some(edge => edge.targetNodeId === nodeId);
}

/**
 * Check if a node has any outgoing edges
 */
export function hasOutgoingEdges(graph: Graph, nodeId: string): boolean {
  return Object.values(graph.edges).some(edge => edge.sourceNodeId === nodeId);
}

/**
 * Get all edges connected to a node
 */
export function getNodeEdges(graph: Graph, nodeId: string): Edge[] {
  return Object.values(graph.edges).filter(
    edge => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
  );
}

/**
 * Get edges connected to a specific port
 */
export function getPortEdges(
  graph: Graph,
  nodeId: string,
  portId: string,
  direction: 'input' | 'output'
): Edge[] {
  return Object.values(graph.edges).filter(edge => {
    if (direction === 'input') {
      return edge.targetNodeId === nodeId && edge.targetPortId === portId;
    } else {
      return edge.sourceNodeId === nodeId && edge.sourcePortId === portId;
    }
  });
}
