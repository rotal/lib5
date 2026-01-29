import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage, cloneFloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

export const FlipNode = defineNode({
  type: 'transform/flip',
  category: 'Transform',
  name: 'Flip',
  description: 'Flip image horizontally or vertically',
  icon: 'flip',

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
      id: 'horizontal',
      name: 'Horizontal',
      type: 'boolean',
      default: false,
      description: 'Flip horizontally (mirror)',
    },
    {
      id: 'vertical',
      name: 'Vertical',
      type: 'boolean',
      default: false,
      description: 'Flip vertically',
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

    const horizontal = params.horizontal as boolean;
    const vertical = params.vertical as boolean;
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

      // If no flip, just pass through
      if (!horizontal && !vertical) {
        if (needsInputRelease) {
          // Return copy if we created the texture
          const { width, height } = inputTexture;
          const outputTexture = gpu.createEmptyTexture(width, height);
          gpu.renderToTexture('flip', {
            u_texture: inputTexture.texture,
            u_horizontal: false,
            u_vertical: false,
          }, outputTexture);
          gpu.releaseTexture(inputTexture.id);

          if (preview) {
            const result = gpu.downloadTexture(outputTexture);
            gpu.releaseTexture(outputTexture.id);
            return { image: result };
          }
          return { image: outputTexture };
        }
        // Pass through the existing texture
        if (preview) {
          return { image: gpu.downloadTexture(inputTexture) };
        }
        return { image: inputTexture };
      }

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('flip', {
        u_texture: inputTexture.texture,
        u_horizontal: horizontal,
        u_vertical: vertical,
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

    if (!horizontal && !vertical) {
      return { image: cloneFloatImage(inputImage) };
    }

    const { width, height } = inputImage;
    const srcData = inputImage.data;
    const outputImage = createFloatImage(width, height);
    const dstData = outputImage.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = horizontal ? width - 1 - x : x;
        const srcY = vertical ? height - 1 - y : y;

        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;

        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }

    return { image: outputImage };
  },
});
