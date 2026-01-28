import { defineNode, ensureFloatImage } from '../defineNode';
import { createFloatImage, cloneFloatImage } from '../../../types/data';

export const MaskOperationsNode = defineNode({
  type: 'mask/operations',
  category: 'Mask',
  name: 'Mask Operations',
  description: 'Modify mask with expand, contract, feather, invert',
  icon: 'select_all',

  inputs: [
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
      required: true,
    },
  ],

  outputs: [
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
    },
  ],

  parameters: [
    {
      id: 'operation',
      name: 'Operation',
      type: 'select',
      default: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Invert', value: 'invert' },
        { label: 'Expand', value: 'expand' },
        { label: 'Contract', value: 'contract' },
        { label: 'Feather', value: 'feather' },
      ],
    },
    {
      id: 'amount',
      name: 'Amount',
      type: 'number',
      default: 5,
      constraints: { min: 1, max: 50, step: 1 },
      description: 'Radius for expand/contract/feather',
    },
  ],

  async execute(inputs, params, context) {
    const inputMask = ensureFloatImage(inputs.mask, context);

    if (!inputMask) {
      return { mask: null };
    }

    const operation = params.operation as string;
    const amount = params.amount as number;

    const { width, height, data: srcData } = inputMask;

    if (operation === 'none') {
      return { mask: cloneFloatImage(inputMask) };
    }

    if (operation === 'invert') {
      const outputMask = createFloatImage(width, height);
      const outData = outputMask.data;

      for (let i = 0; i < srcData.length; i += 4) {
        outData[i] = 1.0 - srcData[i];
        outData[i + 1] = 1.0 - srcData[i + 1];
        outData[i + 2] = 1.0 - srcData[i + 2];
        outData[i + 3] = 1.0;
      }

      return { mask: outputMask };
    }

    if (operation === 'feather') {
      // Gaussian blur for feathering
      const outputMask = createFloatImage(width, height);
      const outData = outputMask.data;
      const radius = Math.round(amount);
      const sigma = radius / 3;

      // Generate kernel
      const kernelSize = radius * 2 + 1;
      const kernel = new Float32Array(kernelSize);
      let sum = 0;

      for (let i = 0; i < kernelSize; i++) {
        const x = i - radius;
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += kernel[i];
      }
      for (let i = 0; i < kernelSize; i++) {
        kernel[i] /= sum;
      }

      // Horizontal pass
      const tempData = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          for (let k = -radius; k <= radius; k++) {
            const sx = Math.max(0, Math.min(width - 1, x + k));
            const srcIdx = (y * width + sx) * 4;
            value += srcData[srcIdx] * kernel[k + radius];
          }
          tempData[y * width + x] = value;
        }
      }

      // Vertical pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          for (let k = -radius; k <= radius; k++) {
            const sy = Math.max(0, Math.min(height - 1, y + k));
            value += tempData[sy * width + x] * kernel[k + radius];
          }
          const dstIdx = (y * width + x) * 4;
          outData[dstIdx] = value;
          outData[dstIdx + 1] = value;
          outData[dstIdx + 2] = value;
          outData[dstIdx + 3] = 1.0;
        }
      }

      return { mask: outputMask };
    }

    if (operation === 'expand' || operation === 'contract') {
      // Morphological operation (dilation/erosion)
      const outputMask = createFloatImage(width, height);
      const outData = outputMask.data;
      const radius = Math.round(amount);
      const isExpand = operation === 'expand';

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let extremeValue = isExpand ? 0 : 1;

          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              // Circle check
              if (dx * dx + dy * dy > radius * radius) continue;

              const sx = Math.max(0, Math.min(width - 1, x + dx));
              const sy = Math.max(0, Math.min(height - 1, y + dy));
              const srcIdx = (sy * width + sx) * 4;
              const value = srcData[srcIdx];

              if (isExpand) {
                extremeValue = Math.max(extremeValue, value);
              } else {
                extremeValue = Math.min(extremeValue, value);
              }
            }
          }

          const dstIdx = (y * width + x) * 4;
          outData[dstIdx] = extremeValue;
          outData[dstIdx + 1] = extremeValue;
          outData[dstIdx + 2] = extremeValue;
          outData[dstIdx + 3] = 1.0;
        }

        if (y % 20 === 0) {
          context.reportProgress(y / height);
        }
      }

      context.reportProgress(1);
      return { mask: outputMask };
    }

    return { mask: cloneFloatImage(inputMask) };
  },
});
