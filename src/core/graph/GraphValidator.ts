import { Graph, GraphValidationResult, GraphValidationError } from '../../types/graph';
import { NodeRegistry } from './NodeRegistry';
import { areTypesCompatible } from '../../types/data';
import { topologicalSort, wouldCreateCycle } from './TopologicalSort';

/**
 * Validate a graph for execution readiness
 */
export function validateGraph(graph: Graph): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const warnings: GraphValidationError[] = [];

  // Check for cycles
  const sortResult = topologicalSort(graph);
  if (sortResult.hasCycle) {
    errors.push({
      type: 'cycle',
      message: `Graph contains a cycle involving nodes: ${sortResult.cycleNodes?.join(', ')}`,
    });
  }

  // Validate each node
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const definition = NodeRegistry.get(node.type);

    if (!definition) {
      errors.push({
        type: 'disconnected',
        message: `Unknown node type: ${node.type}`,
        nodeId,
      });
      continue;
    }

    // Check required inputs are connected
    for (const input of definition.inputs) {
      if (input.required) {
        const hasConnection = Object.values(graph.edges).some(
          edge => edge.targetNodeId === nodeId && edge.targetPortId === input.id
        );

        if (!hasConnection && input.defaultValue === undefined) {
          errors.push({
            type: 'missing_input',
            message: `Node "${definition.name}" is missing required input "${input.name}"`,
            nodeId,
          });
        }
      }
    }
  }

  // Validate each edge
  for (const [edgeId, edge] of Object.entries(graph.edges)) {
    const sourceNode = graph.nodes[edge.sourceNodeId];
    const targetNode = graph.nodes[edge.targetNodeId];

    if (!sourceNode) {
      errors.push({
        type: 'disconnected',
        message: `Edge references non-existent source node: ${edge.sourceNodeId}`,
        edgeId,
      });
      continue;
    }

    if (!targetNode) {
      errors.push({
        type: 'disconnected',
        message: `Edge references non-existent target node: ${edge.targetNodeId}`,
        edgeId,
      });
      continue;
    }

    const sourceDef = NodeRegistry.get(sourceNode.type);
    const targetDef = NodeRegistry.get(targetNode.type);

    if (!sourceDef || !targetDef) continue;

    const sourcePort = sourceDef.outputs.find(p => p.id === edge.sourcePortId);
    const targetPort = targetDef.inputs.find(p => p.id === edge.targetPortId);

    if (!sourcePort) {
      errors.push({
        type: 'disconnected',
        message: `Edge references non-existent output port: ${edge.sourcePortId}`,
        edgeId,
      });
      continue;
    }

    if (!targetPort) {
      errors.push({
        type: 'disconnected',
        message: `Edge references non-existent input port: ${edge.targetPortId}`,
        edgeId,
      });
      continue;
    }

    // Check type compatibility
    if (!areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
      errors.push({
        type: 'type_mismatch',
        message: `Type mismatch: ${sourcePort.dataType} cannot connect to ${targetPort.dataType}`,
        edgeId,
      });
    }
  }

  // Check for disconnected subgraphs (warning only)
  const connectedNodes = new Set<string>();
  const visited = new Set<string>();

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    connectedNodes.add(nodeId);

    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceNodeId === nodeId && !visited.has(edge.targetNodeId)) {
        dfs(edge.targetNodeId);
      }
      if (edge.targetNodeId === nodeId && !visited.has(edge.sourceNodeId)) {
        dfs(edge.sourceNodeId);
      }
    }
  }

  // Start DFS from first node
  const nodeIds = Object.keys(graph.nodes);
  if (nodeIds.length > 0) {
    dfs(nodeIds[0]);

    const disconnectedNodes = nodeIds.filter(id => !connectedNodes.has(id));
    if (disconnectedNodes.length > 0) {
      warnings.push({
        type: 'disconnected',
        message: `Graph has disconnected nodes: ${disconnectedNodes.join(', ')}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a connection can be made between two ports
 */
export function canConnect(
  graph: Graph,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): { allowed: boolean; reason?: string } {
  // Can't connect node to itself
  if (sourceNodeId === targetNodeId) {
    return { allowed: false, reason: 'Cannot connect a node to itself' };
  }

  const sourceNode = graph.nodes[sourceNodeId];
  const targetNode = graph.nodes[targetNodeId];

  if (!sourceNode || !targetNode) {
    return { allowed: false, reason: 'Invalid node reference' };
  }

  const sourceDef = NodeRegistry.get(sourceNode.type);
  const targetDef = NodeRegistry.get(targetNode.type);

  if (!sourceDef || !targetDef) {
    return { allowed: false, reason: 'Unknown node type' };
  }

  const sourcePort = sourceDef.outputs.find(p => p.id === sourcePortId);
  const targetPort = targetDef.inputs.find(p => p.id === targetPortId);

  if (!sourcePort) {
    return { allowed: false, reason: `Invalid output port: ${sourcePortId}` };
  }

  if (!targetPort) {
    return { allowed: false, reason: `Invalid input port: ${targetPortId}` };
  }

  // Check type compatibility
  if (!areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
    return {
      allowed: false,
      reason: `Type mismatch: ${sourcePort.dataType} cannot connect to ${targetPort.dataType}`,
    };
  }

  // Check if input already has a connection (inputs can only have one connection)
  const existingConnection = Object.values(graph.edges).find(
    edge => edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId
  );

  if (existingConnection) {
    // Will replace existing connection - this is allowed
  }

  // Check for cycle
  if (wouldCreateCycle(graph, sourceNodeId, targetNodeId)) {
    return { allowed: false, reason: 'Connection would create a cycle' };
  }

  return { allowed: true };
}

/**
 * Synchronous version of canConnect for immediate UI feedback
 */
export function canConnectSync(
  graph: Graph,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): { allowed: boolean; reason?: string } {
  // Can't connect node to itself
  if (sourceNodeId === targetNodeId) {
    return { allowed: false, reason: 'Cannot connect a node to itself' };
  }

  const sourceNode = graph.nodes[sourceNodeId];
  const targetNode = graph.nodes[targetNodeId];

  if (!sourceNode || !targetNode) {
    return { allowed: false, reason: 'Invalid node reference' };
  }

  const sourceDef = NodeRegistry.get(sourceNode.type);
  const targetDef = NodeRegistry.get(targetNode.type);

  if (!sourceDef || !targetDef) {
    return { allowed: false, reason: 'Unknown node type' };
  }

  const sourcePort = sourceDef.outputs.find(p => p.id === sourcePortId);
  const targetPort = targetDef.inputs.find(p => p.id === targetPortId);

  if (!sourcePort) {
    return { allowed: false, reason: `Invalid output port: ${sourcePortId}` };
  }

  if (!targetPort) {
    return { allowed: false, reason: `Invalid input port: ${targetPortId}` };
  }

  // Check type compatibility
  if (!areTypesCompatible(sourcePort.dataType, targetPort.dataType)) {
    return {
      allowed: false,
      reason: `Type mismatch: ${sourcePort.dataType} cannot connect to ${targetPort.dataType}`,
    };
  }

  return { allowed: true };
}
