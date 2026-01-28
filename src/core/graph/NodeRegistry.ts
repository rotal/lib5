import { NodeDefinition, NodeCategory, getDefaultParameters } from '../../types/node';
import { NodeInstance } from '../../types';

/**
 * Registry for node type definitions
 * Manages registration and lookup of all available node types
 */
class NodeRegistryClass {
  private definitions: Map<string, NodeDefinition> = new Map();
  private categoryIndex: Map<NodeCategory, string[]> = new Map();

  /**
   * Register a node definition
   */
  register(definition: NodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`Node type "${definition.type}" is already registered. Overwriting.`);
    }

    this.definitions.set(definition.type, definition);

    // Update category index
    const categoryTypes = this.categoryIndex.get(definition.category) || [];
    if (!categoryTypes.includes(definition.type)) {
      categoryTypes.push(definition.type);
      this.categoryIndex.set(definition.category, categoryTypes);
    }
  }

  /**
   * Register multiple node definitions
   */
  registerAll(definitions: NodeDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Get a node definition by type
   */
  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Get all registered node definitions
   */
  getAll(): NodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get node definitions by category
   */
  getByCategory(category: NodeCategory): NodeDefinition[] {
    const types = this.categoryIndex.get(category) || [];
    return types.map(type => this.definitions.get(type)!).filter(Boolean);
  }

  /**
   * Get all categories with their node types
   */
  getCategories(): Map<NodeCategory, NodeDefinition[]> {
    const result = new Map<NodeCategory, NodeDefinition[]>();
    for (const [category, types] of this.categoryIndex) {
      result.set(
        category,
        types.map(type => this.definitions.get(type)!).filter(Boolean)
      );
    }
    return result;
  }

  /**
   * Check if a node type is registered
   */
  has(type: string): boolean {
    return this.definitions.has(type);
  }

  /**
   * Create a node instance from a type
   */
  createInstance(
    type: string,
    position: { x: number; y: number },
    id?: string
  ): NodeInstance | null {
    const definition = this.definitions.get(type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return null;
    }

    return {
      id: id || crypto.randomUUID(),
      type,
      position,
      parameters: getDefaultParameters(definition),
    };
  }

  /**
   * Unregister a node type
   */
  unregister(type: string): boolean {
    const definition = this.definitions.get(type);
    if (!definition) return false;

    this.definitions.delete(type);

    // Update category index
    const categoryTypes = this.categoryIndex.get(definition.category);
    if (categoryTypes) {
      const index = categoryTypes.indexOf(type);
      if (index !== -1) {
        categoryTypes.splice(index, 1);
      }
    }

    return true;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.definitions.clear();
    this.categoryIndex.clear();
  }

  /**
   * Get count of registered nodes
   */
  get size(): number {
    return this.definitions.size;
  }
}

// Export singleton instance
export const NodeRegistry = new NodeRegistryClass();

// Also export the class for testing
export { NodeRegistryClass };
