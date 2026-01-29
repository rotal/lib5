import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage } from '../../../types/data';
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
      } else if (isFloatImage(input)) {
        inputTexture = gpu.createTextureFromFloat(input);
        needsInputRelease = true;
      } else {
        inputTexture = gpu.createTexture(input as ImageData);
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
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const { width, height, data: srcData } = inputImage;
    const outputImage = createFloatImage(width, height);
    const data = outputImage.data;

    const inputRange = inputWhite - inputBlack || 0.001;
    const outputRange = outputWhite - outputBlack;
    const invGamma = 1 / gamma;

    for (let i = 0; i < srcData.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let value = (srcData[i + c] - inputBlack) / inputRange;
        value = Math.max(0, Math.min(1, value));
        value = Math.pow(value, invGamma);
        value = value * outputRange + outputBlack;
        data[i + c] = Math.max(0, Math.min(1, value));
      }
      data[i + 3] = srcData[i + 3]; // preserve alpha
    }

    return { image: outputImage };
  },
});
