import { defineNode, ensureFloatImage } from '../defineNode';
import { createFloatImage } from '../../../types/data';

export const SharpenNode = defineNode({
  type: 'filter/sharpen',
  category: 'Filter',
  name: 'Sharpen',
  description: 'Sharpen image using unsharp mask',
  icon: 'details',
  hasLocalTransform: true,
  requiresSpatialCoherence: true,

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
      id: 'amount',
      name: 'Amount',
      type: 'number',
      default: 50,
      constraints: { min: 0, max: 500, step: 1 },
      description: 'Sharpening strength (%)',
    },
    {
      id: 'radius',
      name: 'Radius',
      type: 'number',
      default: 1,
      constraints: { min: 0.1, max: 10, step: 0.1 },
      description: 'Blur radius for unsharp mask',
    },
    {
      id: 'threshold',
      name: 'Threshold',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'Minimum difference to sharpen',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = ensureFloatImage(inputs.image, context);

    if (!inputImage) {
      return { image: null };
    }

    const amount = (params.amount as number) / 100;
    const radius = params.radius as number;
    const threshold = (params.threshold as number) / 255; // Convert to 0-1 range

    if (amount === 0) {
      return {
        image: createFloatImage(inputImage.width, inputImage.height),
      };
    }

    const { width, height, data: srcData } = inputImage;

    // First, create blurred version (simple box blur for performance)
    const kernelSize = Math.ceil(radius) * 2 + 1;
    const blurredData = new Float32Array(width * height * 4);

    // Horizontal pass
    const tempData = new Float32Array(width * height * 4);
    const halfKernel = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;

        for (let k = -halfKernel; k <= halfKernel; k++) {
          const sx = Math.max(0, Math.min(width - 1, x + k));
          const srcIdx = (y * width + sx) * 4;
          r += srcData[srcIdx];
          g += srcData[srcIdx + 1];
          b += srcData[srcIdx + 2];
          a += srcData[srcIdx + 3];
          count++;
        }

        const dstIdx = (y * width + x) * 4;
        tempData[dstIdx] = r / count;
        tempData[dstIdx + 1] = g / count;
        tempData[dstIdx + 2] = b / count;
        tempData[dstIdx + 3] = a / count;
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;

        for (let k = -halfKernel; k <= halfKernel; k++) {
          const sy = Math.max(0, Math.min(height - 1, y + k));
          const srcIdx = (sy * width + x) * 4;
          r += tempData[srcIdx];
          g += tempData[srcIdx + 1];
          b += tempData[srcIdx + 2];
          a += tempData[srcIdx + 3];
          count++;
        }

        const dstIdx = (y * width + x) * 4;
        blurredData[dstIdx] = r / count;
        blurredData[dstIdx + 1] = g / count;
        blurredData[dstIdx + 2] = b / count;
        blurredData[dstIdx + 3] = a / count;
      }
    }

    // Apply unsharp mask: output = original + amount * (original - blurred)
    const outputImage = createFloatImage(width, height);
    const dstData = outputImage.data;

    for (let i = 0; i < srcData.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = srcData[i + c];
        const blurred = blurredData[i + c];
        const diff = original - blurred;

        if (Math.abs(diff) >= threshold) {
          dstData[i + c] = Math.max(0, Math.min(1, original + amount * diff));
        } else {
          dstData[i + c] = original;
        }
      }
      dstData[i + 3] = srcData[i + 3]; // Preserve alpha
    }

    return { image: outputImage };
  },
});
