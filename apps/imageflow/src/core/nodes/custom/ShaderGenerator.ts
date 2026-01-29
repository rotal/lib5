import type { CustomGPUNodeConfig, CustomParameterDefinition } from './types';
import type { PortDefinition } from '../../../types/node';

/**
 * Map parameter type to GLSL type
 */
function paramTypeToGLSL(param: CustomParameterDefinition): string {
  switch (param.type) {
    case 'number':
      return 'float';
    case 'color':
      return 'vec4';
    case 'boolean':
      return 'bool';
    case 'select':
      return 'int';
    case 'size':
      return 'vec2';
    default:
      return 'float';
  }
}

/**
 * Get the uniform name for a parameter
 */
export function getUniformName(param: CustomParameterDefinition): string {
  return param.uniform?.name ?? `u_${param.id}`;
}

/**
 * Get the uniform name for an input
 */
export function getInputUniformName(input: PortDefinition): string {
  return `u_${input.id}`;
}

/**
 * Generate uniform declarations for inputs
 */
function generateInputUniforms(inputs: PortDefinition[]): string {
  return inputs
    .filter((input) => input.dataType === 'image' || input.dataType === 'mask')
    .map((input) => `uniform sampler2D ${getInputUniformName(input)};`)
    .join('\n');
}

/**
 * Generate uniform declarations for parameters
 */
function generateParameterUniforms(parameters: CustomParameterDefinition[]): string {
  return parameters
    .filter((param) => param.type !== 'file' && param.type !== 'string')
    .map((param) => {
      const glslType = paramTypeToGLSL(param);
      const uniformName = getUniformName(param);
      return `uniform ${glslType} ${uniformName};`;
    })
    .join('\n');
}

/**
 * Generate a complete GLSL ES 300 fragment shader from a custom node config
 */
export function generateFragmentShader(config: CustomGPUNodeConfig): string {
  const inputUniforms = generateInputUniforms(config.inputs);
  const paramUniforms = generateParameterUniforms(config.parameters);

  const shaderSource = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

// Built-in uniforms
uniform vec2 u_texelSize;
uniform vec2 u_imageSize;

// Input uniforms
${inputUniforms}

// Parameter uniforms
${paramUniforms}

${config.shaderFunctions ?? ''}

void main() {
${config.shaderBody}
}
`;

  return shaderSource;
}
