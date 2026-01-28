import { NodeDefinition } from '../../types/node';

/**
 * Helper function to define a node with full type safety
 * This is a pass-through function that provides type checking
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  return definition;
}
