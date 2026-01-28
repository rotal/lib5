import { Graph } from '../../types/graph';

/**
 * Result of topological sort
 */
export interface TopologicalSortResult {
  order: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

/**
 * Perform topological sort on graph nodes using Kahn's algorithm
 * Returns execution order from inputs to outputs
 */
export function topologicalSort(graph: Graph): TopologicalSortResult {
  const nodes = Object.keys(graph.nodes);
  const edges = Object.values(graph.edges);

  // Build adjacency list and in-degree count
  const adjacency: Map<string, string[]> = new Map();
  const inDegree: Map<string, number> = new Map();

  // Initialize
  for (const nodeId of nodes) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }

  // Build graph structure
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.sourceNodeId);
    if (neighbors) {
      neighbors.push(edge.targetNodeId);
    }

    const degree = inDegree.get(edge.targetNodeId) || 0;
    inDegree.set(edge.targetNodeId, degree + 1);
  }

  // Find all nodes with no incoming edges (sources)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Process nodes
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const degree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, degree);

      if (degree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycle
  if (order.length !== nodes.length) {
    // Find nodes in cycle
    const cycleNodes = nodes.filter(id => !order.includes(id));
    return {
      order: [],
      hasCycle: true,
      cycleNodes,
    };
  }

  return {
    order,
    hasCycle: false,
  };
}

/**
 * Get all upstream nodes (dependencies) for a given node
 */
export function getUpstreamNodes(graph: Graph, nodeId: string): Set<string> {
  const upstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all edges where current is the target
    for (const edge of Object.values(graph.edges)) {
      if (edge.targetNodeId === current && !visited.has(edge.sourceNodeId)) {
        upstream.add(edge.sourceNodeId);
        queue.push(edge.sourceNodeId);
      }
    }
  }

  return upstream;
}

/**
 * Get all downstream nodes (dependents) for a given node
 */
export function getDownstreamNodes(graph: Graph, nodeId: string): Set<string> {
  const downstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all edges where current is the source
    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceNodeId === current && !visited.has(edge.targetNodeId)) {
        downstream.add(edge.targetNodeId);
        queue.push(edge.targetNodeId);
      }
    }
  }

  return downstream;
}

/**
 * Get execution order for a subset of nodes (for partial updates)
 */
export function getPartialExecutionOrder(
  graph: Graph,
  dirtyNodeIds: string[]
): string[] {
  // Get all downstream nodes from dirty nodes
  const nodesToExecute = new Set<string>(dirtyNodeIds);

  for (const nodeId of dirtyNodeIds) {
    const downstream = getDownstreamNodes(graph, nodeId);
    for (const id of downstream) {
      nodesToExecute.add(id);
    }
  }

  // Get full topological order
  const { order, hasCycle } = topologicalSort(graph);

  if (hasCycle) {
    return [];
  }

  // Filter to only nodes that need execution, maintaining order
  return order.filter(id => nodesToExecute.has(id));
}

/**
 * Check if adding an edge would create a cycle
 */
export function wouldCreateCycle(
  graph: Graph,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  // If target can reach source, adding edge source->target creates cycle
  const reachableFromTarget = getDownstreamNodes(graph, targetNodeId);
  return reachableFromTarget.has(sourceNodeId) || sourceNodeId === targetNodeId;
}
