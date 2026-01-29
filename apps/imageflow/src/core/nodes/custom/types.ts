import type { NodeCategory, ParameterDefinition, PortDefinition } from '../../../types/node';

/**
 * Normalization options for uniform values
 */
export type UniformNormalize =
  | { divide: number }
  | { remap: [number, number, number, number] }; // [inMin, inMax, outMin, outMax]

/**
 * Mapping configuration for parameter → uniform
 */
export interface UniformMapping {
  /** Custom uniform name (defaults to u_<parameterId>) */
  name?: string;
  /** Normalization to apply to the parameter value */
  normalize?: UniformNormalize;
}

/**
 * Extended parameter definition with optional uniform mapping
 */
export interface CustomParameterDefinition extends ParameterDefinition {
  /** Uniform mapping configuration for GPU shaders */
  uniform?: UniformMapping;
}

/**
 * Configuration for a custom GPU node
 */
export interface CustomGPUNodeConfig {
  /** Unique node type identifier (e.g., 'custom/sepia') */
  type: string;
  /** Node category for organization */
  category: NodeCategory;
  /** Display name */
  name: string;
  /** Description of what the node does */
  description: string;
  /** Material icon name */
  icon?: string;

  /** Input port definitions */
  inputs: PortDefinition[];
  /** Output port definitions */
  outputs: PortDefinition[];
  /** Parameter definitions with optional uniform mappings */
  parameters: CustomParameterDefinition[];

  /**
   * The GLSL fragment shader body (code inside main()).
   * Available built-in uniforms:
   *   - u_texelSize: vec2 (1/width, 1/height)
   *   - u_imageSize: vec2 (width, height)
   * Input textures are named u_<inputId> (e.g., u_image for input 'image').
   * Parameters become uniforms named u_<parameterId> or custom name via uniform.name.
   */
  shaderBody: string;

  /**
   * Optional GLSL helper functions to include before main().
   * Use for reusable functions like color space conversions.
   */
  shaderFunctions?: string;
}
