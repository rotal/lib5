import { defineNode, ensureImageData } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

export const LevelsNode = defineNode({
  type: 'adjust/levels',
  category: 'Adjust',
  name: 'Levels',
  description: 'Adjust input/output levels with gamma',
  icon: 'tune',

  inputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
      required: true,
    },
  ],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
  ],

  parameters: [
    {
      id: 'inputBlack',
      name: 'Input Black',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'Black point for input levels',
    },
    {
      id: 'inputWhite',
      name: 'Input White',
      type: 'number',
      default: 255,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'White point for input levels',
    },
    {
      id: 'gamma',
      name: 'Gamma',
      type: 'number',
      default: 1.0,
      constraints: { min: 0.1, max: 10, step: 0.01 },
      description: 'Gamma correction (midtones)',
    },
    {
      id: 'outputBlack',
      name: 'Output Black',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'Black point for output levels',
    },
    {
      id: 'outputWhite',
      name: 'Output White',
      type: 'number',
      default: 255,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'White point for output levels',
    },
    {
      id: 'preview',
      name: 'Preview',
      type: 'boolean',
      default: false,
      description: 'Show preview (downloads from GPU)',
    },
  ],

  async execute(inputs, params, context) {
    const input = inputs.image as ImageData | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    const inputBlack = (params.inputBlack as number) / 255;
    const inputWhite = (params.inputWhite as number) / 255;
    const gamma = params.gamma as number;
    const outputBlack = (params.outputBlack as number) / 255;
    const outputWhite = (params.outputWhite as number) / 255;
    const preview = params.preview as boolean;

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      let inputTexture: GPUTexture;
      let needsInputRelease = false;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else {
        inputTexture = gpu.createTexture(input);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('levels', {
        u_texture: inputTexture.texture,
        u_inputBlack: inputBlack,
        u_inputWhite: inputWhite,
        u_gamma: gamma,
        u_outputBlack: outputBlack,
        u_outputWhite: outputWhite,
      }, outputTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      if (preview) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        return { image: result };
      }

      return { image: outputTexture };
    }

    // CPU fallback
    const inputImage = ensureImageData(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const outputImage = new ImageData(
      new Uint8ClampedArray(inputImage.data),
      inputImage.width,
      inputImage.height
    );
    const data = outputImage.data;

    // Precompute lookup table for performance
    const lut = new Uint8Array(256);
    const inputRange = (inputWhite - inputBlack) * 255 || 1;
    const outputRange = (outputWhite - outputBlack) * 255;

    for (let i = 0; i < 256; i++) {
      let value = (i - inputBlack * 255) / inputRange;
      value = Math.max(0, Math.min(1, value));
      value = Math.pow(value, 1 / gamma);
      value = value * outputRange + outputBlack * 255;
      lut[i] = Math.round(Math.max(0, Math.min(255, value)));
    }

    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }

    return { image: outputImage };
  },
});
