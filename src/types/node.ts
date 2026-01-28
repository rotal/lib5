import { DataType, PortValue } from './data';
import { GPUContext } from './gpu';

/**
 * Port definition for node inputs/outputs
 */
export interface PortDefinition {
  id: string;
  name: string;
  dataType: DataType;
  required?: boolean;
  defaultValue?: PortValue;
  description?: string;
}

/**
 * Parameter types for node configuration
 */
export type ParameterType = 'number' | 'color' | 'boolean' | 'select' | 'string' | 'file' | 'size';

/**
 * Size value with width, height, and optional aspect lock
 */
export interface SizeValue {
  width: number;
  height: number;
  locked?: boolean;
}

/**
 * Constraints for numeric parameters
 */
export interface NumberConstraints {
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Constraints for size parameters
 */
export interface SizeConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  step?: number;
}

/**
 * Option for select parameters
 */
export interface SelectOption {
  label: string;
  value: string | number;
}

/**
 * Parameter definition for node configuration
 */
export interface ParameterDefinition {
  id: string;
  name: string;
  type: ParameterType;
  default: unknown;
  description?: string;
  constraints?: NumberConstraints;
  sizeConstraints?: SizeConstraints;
  options?: SelectOption[];
  accept?: string; // For file type, e.g., 'image/*'
}

/**
 * Node categories for organization
 */
export type NodeCategory =
  | 'Input'
  | 'Output'
  | 'Transform'
  | 'Adjust'
  | 'Filter'
  | 'Composite'
  | 'Mask'
  | 'AI'
  | 'Utility';

/**
 * Context provided to node execution
 */
export interface ExecutionContext {
  nodeId: string;
  graphId: string;
  signal: AbortSignal;
  reportProgress: (progress: number) => void;
  getCache: (key: string) => PortValue | undefined;
  setCache: (key: string, value: PortValue) => void;
  /** GPU context for accelerated image processing (optional) */
  gpu?: GPUContext;
}

/**
 * Node execution function signature
 */
export type NodeExecuteFunction = (
  inputs: Record<string, PortValue>,
  params: Record<string, unknown>,
  context: ExecutionContext
) => Promise<Record<string, PortValue>>;

/**
 * Complete node type definition
 */
export interface NodeDefinition {
  type: string;
  category: NodeCategory;
  name: string;
  description: string;
  icon?: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  parameters: ParameterDefinition[];
  execute: NodeExecuteFunction;
}

/**
 * Runtime node instance in the graph
 */
export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  parameters: Record<string, unknown>;
  collapsed?: boolean;
  width?: number;
  height?: number;
}

/**
 * Port instance (runtime)
 */
export interface PortInstance {
  nodeId: string;
  portId: string;
  direction: 'input' | 'output';
}

/**
 * Node execution state
 */
export type NodeExecutionState = 'idle' | 'pending' | 'running' | 'complete' | 'error';

/**
 * Node runtime state during execution
 */
export interface NodeRuntimeState {
  executionState: NodeExecutionState;
  progress: number;
  error?: string;
  lastExecutionTime?: number;
  outputs?: Record<string, PortValue>;
}

/**
 * Helper to create a node definition with type safety
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  return definition;
}

/**
 * Get the default parameters for a node definition
 */
export function getDefaultParameters(definition: NodeDefinition): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const param of definition.parameters) {
    params[param.id] = param.default;
  }
  return params;
}

/**
 * Validate parameter value against definition
 */
export function validateParameter(
  value: unknown,
  definition: ParameterDefinition
): boolean {
  switch (definition.type) {
    case 'number': {
      if (typeof value !== 'number') return false;
      const { min, max } = definition.constraints || {};
      if (min !== undefined && value < min) return false;
      if (max !== undefined && value > max) return false;
      return true;
    }
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'select':
      return definition.options?.some(opt => opt.value === value) ?? false;
    case 'color':
      return (
        typeof value === 'object' &&
        value !== null &&
        'r' in value &&
        'g' in value &&
        'b' in value
      );
    case 'file':
      return typeof value === 'string' || value instanceof File || value === null;
    case 'size':
      return (
        typeof value === 'object' &&
        value !== null &&
        'width' in value &&
        'height' in value &&
        typeof (value as SizeValue).width === 'number' &&
        typeof (value as SizeValue).height === 'number'
      );
    default:
      return true;
  }
}
