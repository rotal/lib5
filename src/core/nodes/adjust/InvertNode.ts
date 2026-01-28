import { defineNode, ensureImageData } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
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

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else {
        inputTexture = gpu.createTexture(input);
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

    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];

      if (invertAlpha) {
        data[i + 3] = 255 - data[i + 3];
      }
    }

    return { image: outputImage };
  },
});
