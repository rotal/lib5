import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

export const InvertNode = defineNode({
  type: 'adjust/invert',
  category: 'Adjust',
  name: 'Invert',
  description: 'Invert image colors',
  icon: 'invert_colors',

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
      id: 'invertAlpha',
      name: 'Invert Alpha',
      type: 'boolean',
      default: false,
      description: 'Also invert the alpha channel',
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

    const invertAlpha = params.invertAlpha as boolean;
    const preview = params.preview as boolean;

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      let inputTexture: GPUTexture;
      let needsInputRelease = false;
      // Preserve transform from input FloatImage (GPU textures can't store transform)
      let inputTransform: import('../../../types/data').Transform2D | undefined;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else if (isFloatImage(input)) {
        inputTexture = gpu.createTextureFromFloat(input);
        inputTransform = input.transform;
        needsInputRelease = true;
      } else {
        inputTexture = gpu.createTexture(input as ImageData);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('invert', {
        u_texture: inputTexture.texture,
        u_invertAlpha: invertAlpha,
      }, outputTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      // If input had transform, we must download to preserve it (GPUTexture can't store transform)
      if (preview || inputTransform) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        if (inputTransform) {
          result.transform = inputTransform;
        }
        return { image: result };
      }

      return { image: outputTexture };
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const { width, height, data: srcData, transform } = inputImage;
    const outputImage = createFloatImage(width, height);
    const data = outputImage.data;

    for (let i = 0; i < srcData.length; i += 4) {
      data[i] = 1.0 - srcData[i];
      data[i + 1] = 1.0 - srcData[i + 1];
      data[i + 2] = 1.0 - srcData[i + 2];

      if (invertAlpha) {
        data[i + 3] = 1.0 - srcData[i + 3];
      } else {
        data[i + 3] = srcData[i + 3];
      }
    }

    if (transform) {
      outputImage.transform = transform;
    }
    return { image: outputImage };
  },
});
