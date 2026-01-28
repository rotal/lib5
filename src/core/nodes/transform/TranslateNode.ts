import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, FloatImage, createFloatImage } from '../../../types/data';
import type { GPUContext, GPUTexture } from '../../../types/gpu';

// Edge mode to shader constant mapping
const EDGE_MODE_MAP: Record<string, number> = {
  transparent: 0,
  wrap: 1,
  clamp: 2,
};

/**
 * GPU translate implementation
 */
function executeGPU(
  input: GPUTexture,
  offsetX: number,
  offsetY: number,
  edgeMode: string,
  gpu: GPUContext
): GPUTexture {
  const outputTexture = gpu.createEmptyTexture(input.width, input.height);

  gpu.renderToTexture('translate', {
    u_texture: input.texture,
    u_offset: [offsetX, offsetY],
    u_size: [input.width, input.height],
    u_edgeMode: EDGE_MODE_MAP[edgeMode] ?? 0,
    u_bgColor: [0, 0, 0, 0],
  }, outputTexture);

  return outputTexture;
}

/**
 * CPU translate implementation (fallback)
 */
function executeCPU(
  inputImage: FloatImage,
  offsetX: number,
  offsetY: number,
  edgeMode: string
): FloatImage {
  const width = inputImage.width;
  const height = inputImage.height;
  const srcData = inputImage.data;

  const outputImage = createFloatImage(width, height);
  const dstData = outputImage.data;

  // Round offsets to integers for pixel-perfect translation
  const ox = Math.round(offsetX);
  const oy = Math.round(offsetY);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      // Calculate source coordinates
      let srcX = x - ox;
      let srcY = y - oy;

      if (edgeMode === 'wrap') {
        srcX = ((srcX % width) + width) % width;
        srcY = ((srcY % height) + height) % height;
      } else if (edgeMode === 'clamp') {
        srcX = Math.max(0, Math.min(width - 1, srcX));
        srcY = Math.max(0, Math.min(height - 1, srcY));
      } else {
        // Transparent - check bounds
        if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) {
          dstData[dstIdx] = 0;
          dstData[dstIdx + 1] = 0;
          dstData[dstIdx + 2] = 0;
          dstData[dstIdx + 3] = 0;
          continue;
        }
      }

      const srcIdx = (srcY * width + srcX) * 4;
      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return outputImage;
}

export const TranslateNode = defineNode({
  type: 'transform/translate',
  category: 'Transform',
  name: 'Translate',
  description: 'Move image by specified offset',
  icon: 'open_with',

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
      id: 'offsetX',
      name: 'Offset X',
      type: 'number',
      default: 0,
      constraints: { min: -4096, max: 4096, step: 1 },
      description: 'Horizontal offset in pixels',
    },
    {
      id: 'offsetY',
      name: 'Offset Y',
      type: 'number',
      default: 0,
      constraints: { min: -4096, max: 4096, step: 1 },
      description: 'Vertical offset in pixels',
    },
    {
      id: 'edgeMode',
      name: 'Edge Mode',
      type: 'select',
      default: 'transparent',
      options: [
        { label: 'Transparent', value: 'transparent' },
        { label: 'Wrap', value: 'wrap' },
        { label: 'Clamp', value: 'clamp' },
      ],
      description: 'How to handle pixels outside the image bounds',
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
    const input = inputs.image as FloatImage | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    const offsetX = params.offsetX as number;
    const offsetY = params.offsetY as number;
    const edgeMode = params.edgeMode as string;

    // No translation needed
    if (offsetX === 0 && offsetY === 0) {
      if (isGPUTexture(input)) {
        context.gpu?.retainTexture(input.id);
        return { image: input };
      }
      return { image: input };
    }

    // Try GPU path
    if (context.gpu?.isAvailable && isGPUTexture(input)) {
      try {
        const gpuResult = executeGPU(input, offsetX, offsetY, edgeMode, context.gpu);

        // Download only if preview is enabled
        if (params.preview) {
          const result = context.gpu.downloadTexture(gpuResult);
          context.gpu.releaseTexture(gpuResult.id);
          return { image: result };
        }

        return { image: gpuResult };
      } catch (error) {
        console.warn('GPU translate failed, falling back to CPU:', error);
      }
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const result = executeCPU(inputImage, offsetX, offsetY, edgeMode);
    return { image: result };
  },
});
