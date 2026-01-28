import { defineNode } from '../defineNode';

export const BlurNode = defineNode({
  type: 'filter/blur',
  category: 'Filter',
  name: 'Blur',
  description: 'Apply Gaussian blur to image',
  icon: 'blur_on',

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
      id: 'radius',
      name: 'Radius',
      type: 'number',
      default: 5,
      constraints: { min: 0, max: 100, step: 1 },
      description: 'Blur radius in pixels',
    },
    {
      id: 'sigma',
      name: 'Sigma',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 50, step: 0.1 },
      description: 'Gaussian sigma (0 = auto)',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const radius = Math.round(params.radius as number);
    let sigma = params.sigma as number;

    if (radius === 0) {
      return {
        image: new ImageData(
          new Uint8ClampedArray(inputImage.data),
          inputImage.width,
          inputImage.height
        ),
      };
    }

    // Auto sigma
    if (sigma === 0) {
      sigma = radius / 3;
    }

    // Generate Gaussian kernel
    const kernelSize = radius * 2 + 1;
    const kernel = new Float32Array(kernelSize);
    let sum = 0;

    for (let i = 0; i < kernelSize; i++) {
      const x = i - radius;
      const g = Math.exp(-(x * x) / (2 * sigma * sigma));
      kernel[i] = g;
      sum += g;
    }

    // Normalize kernel
    for (let i = 0; i < kernelSize; i++) {
      kernel[i] /= sum;
    }

    const { width, height, data: srcData } = inputImage;

    // Two-pass separable blur
    // First pass: horizontal
    const tempData = new Float32Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;

        for (let k = -radius; k <= radius; k++) {
          const sx = Math.max(0, Math.min(width - 1, x + k));
          const srcIdx = (y * width + sx) * 4;
          const weight = kernel[k + radius];

          r += srcData[srcIdx] * weight;
          g += srcData[srcIdx + 1] * weight;
          b += srcData[srcIdx + 2] * weight;
          a += srcData[srcIdx + 3] * weight;
        }

        const dstIdx = (y * width + x) * 4;
        tempData[dstIdx] = r;
        tempData[dstIdx + 1] = g;
        tempData[dstIdx + 2] = b;
        tempData[dstIdx + 3] = a;
      }

      if (y % 50 === 0) {
        context.reportProgress(y / height * 0.5);
      }
    }

    // Second pass: vertical
    const outputImage = new ImageData(width, height);
    const dstData = outputImage.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;

        for (let k = -radius; k <= radius; k++) {
          const sy = Math.max(0, Math.min(height - 1, y + k));
          const srcIdx = (sy * width + x) * 4;
          const weight = kernel[k + radius];

          r += tempData[srcIdx] * weight;
          g += tempData[srcIdx + 1] * weight;
          b += tempData[srcIdx + 2] * weight;
          a += tempData[srcIdx + 3] * weight;
        }

        const dstIdx = (y * width + x) * 4;
        dstData[dstIdx] = Math.round(r);
        dstData[dstIdx + 1] = Math.round(g);
        dstData[dstIdx + 2] = Math.round(b);
        dstData[dstIdx + 3] = Math.round(a);
      }

      if (y % 50 === 0) {
        context.reportProgress(0.5 + y / height * 0.5);
      }
    }

    context.reportProgress(1);
    return { image: outputImage };
  },
});
