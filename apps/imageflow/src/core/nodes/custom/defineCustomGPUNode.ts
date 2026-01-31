import type { NodeDefinition, ParameterDefinition, ExecutionContext } from '../../../types/node';
import type { GPUTexture } from '../../../types/gpu';
import type { PortValue, Color } from '../../../types/data';
import { isGPUTexture, isFloatImage } from '../../../types/data';
import type { CustomGPUNodeConfig, CustomParameterDefinition, UniformNormalize } from './types';
import { generateFragmentShader, getUniformName, getInputUniformName } from './ShaderGenerator';

/**
 * Apply normalization to a parameter value
 */
function normalizeValue(value: number, normalize: UniformNormalize): number {
  if ('divide' in normalize) {
    return value / normalize.divide;
  }
  if ('remap' in normalize) {
    const [inMin, inMax, outMin, outMax] = normalize.remap;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
  }
  return value;
}

/**
 * Convert a parameter value to its uniform value
 */
function paramToUniform(
  value: unknown,
  param: CustomParameterDefinition
): number | number[] | boolean | WebGLTexture {
  switch (param.type) {
    case 'number': {
      let numValue = value as number;
      if (param.uniform?.normalize) {
        numValue = normalizeValue(numValue, param.uniform.normalize);
      }
      return numValue;
    }
    case 'color': {
      const color = value as Color;
      return [color.r, color.g, color.b, color.a];
    }
    case 'boolean':
      return value as boolean;
    case 'select': {
      // Find the index of the selected value
      const selectValue = value as string | number;
      const index = param.options?.findIndex((opt) => opt.value === selectValue) ?? 0;
      return index;
    }
    case 'size': {
      const size = value as { width: number; height: number };
      return [size.width, size.height];
    }
    default:
      return 0;
  }
}

/**
 * Create a custom GPU node definition from a simplified config.
 * Generates the shader and execute function automatically.
 */
export function defineCustomGPUNode(config: CustomGPUNodeConfig): NodeDefinition {
  // Generate the shader source
  const shaderSource = generateFragmentShader(config);

  // Generate a unique shader name based on node type
  const shaderName = `custom_${config.type.replace(/\//g, '_')}`;

  // Check if preview parameter is already defined
  const hasPreviewParam = config.parameters.some((p) => p.id === 'preview');

  // Build the final parameters list (add preview if not present)
  const finalParameters: ParameterDefinition[] = [
    ...config.parameters,
    ...(hasPreviewParam
      ? []
      : [
          {
            id: 'preview',
            name: 'Preview',
            type: 'boolean' as const,
            default: false,
            description: 'Show preview (downloads from GPU)',
          },
        ]),
  ];

  // Create the execute function
  const execute = async (
    inputs: Record<string, PortValue>,
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<Record<string, PortValue>> => {
    // Find the primary image input
    const primaryInput = config.inputs.find(
      (input) => input.dataType === 'image' || input.dataType === 'mask'
    );

    if (!primaryInput) {
      throw new Error(`Custom GPU node ${config.type} requires at least one image/mask input`);
    }

    const input = inputs[primaryInput.id];

    if (!input) {
      return { image: null };
    }

    const preview = params.preview as boolean;

    // GPU is required for custom GPU nodes
    if (!context.gpu?.isAvailable) {
      throw new Error(`GPU is required for custom node ${config.type}`);
    }

    const gpu = context.gpu;

    // Register the shader if not already registered
    if (!gpu.hasShader(shaderName)) {
      gpu.registerShader(shaderName, shaderSource);
    }

    // Convert inputs to textures and track which ones need release
    const textureInputs: Map<string, { texture: GPUTexture; needsRelease: boolean }> = new Map();

    for (const inputDef of config.inputs) {
      if (inputDef.dataType !== 'image' && inputDef.dataType !== 'mask') {
        continue;
      }

      const inputValue = inputs[inputDef.id];
      if (!inputValue) {
        continue;
      }

      let texture: GPUTexture;
      let needsRelease = false;

      if (isGPUTexture(inputValue)) {
        texture = inputValue;
      } else if (isFloatImage(inputValue)) {
        texture = gpu.createTextureFromFloat(inputValue);
        needsRelease = true;
      } else if (inputValue instanceof ImageData) {
        texture = gpu.createTexture(inputValue);
        needsRelease = true;
      } else {
        continue;
      }

      textureInputs.set(inputDef.id, { texture, needsRelease });
    }

    // Get the primary input texture for dimensions
    const primaryTexInfo = textureInputs.get(primaryInput.id);
    if (!primaryTexInfo) {
      return { image: null };
    }

    const { width, height } = primaryTexInfo.texture;

    // Build uniforms object
    const uniforms: Record<string, unknown> = {
      u_texelSize: [1 / width, 1 / height],
      u_imageSize: [width, height],
    };

    // Add input texture uniforms
    for (const inputDef of config.inputs) {
      const texInfo = textureInputs.get(inputDef.id);
      if (texInfo) {
        uniforms[getInputUniformName(inputDef)] = texInfo.texture.texture;
      }
    }

    // Add parameter uniforms
    for (const param of config.parameters) {
      if (param.type === 'file' || param.type === 'string' || param.id === 'preview') {
        continue;
      }

      const value = params[param.id];
      const uniformName = getUniformName(param);
      uniforms[uniformName] = paramToUniform(value, param);
    }

    // Create output texture
    const outputTexture = gpu.createEmptyTexture(width, height);

    // Render
    try {
      gpu.renderToTexture(shaderName, uniforms, outputTexture);
    } finally {
      // Release input textures that we created
      for (const [, texInfo] of textureInputs) {
        if (texInfo.needsRelease) {
          gpu.releaseTexture(texInfo.texture.id);
        }
      }
    }

    // Return GPU texture or download based on preview setting
    if (preview) {
      const result = gpu.downloadTexture(outputTexture);
      gpu.releaseTexture(outputTexture.id);
      return { image: result };
    }

    return { image: outputTexture };
  };

  // Return the complete NodeDefinition
  return {
    type: config.type,
    category: config.category,
    name: config.name,
    description: config.description,
    icon: config.icon,
    hasLocalTransform: config.hasLocalTransform,
    inputs: config.inputs,
    outputs: config.outputs,
    parameters: finalParameters,
    execute,
  };
}
