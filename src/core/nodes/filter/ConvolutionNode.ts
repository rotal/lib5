import { defineNode } from '../defineNode';

const PRESET_KERNELS: Record<string, number[][]> = {
  identity: [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  sharpen: [
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ],
  edgeDetect: [
    [-1, -1, -1],
    [-1, 8, -1],
    [-1, -1, -1],
  ],
  emboss: [
    [-2, -1, 0],
    [-1, 1, 1],
    [0, 1, 2],
  ],
  boxBlur: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  gaussianBlur: [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ],
  sobelX: [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ],
  sobelY: [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ],
};

export const ConvolutionNode = defineNode({
  type: 'filter/convolution',
  category: 'Filter',
  name: 'Convolution',
  description: 'Apply custom convolution kernel',
  icon: 'grid_3x3',

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
      id: 'preset',
      name: 'Preset',
      type: 'select',
      default: 'identity',
      options: [
        { label: 'Identity', value: 'identity' },
        { label: 'Sharpen', value: 'sharpen' },
        { label: 'Edge Detect', value: 'edgeDetect' },
        { label: 'Emboss', value: 'emboss' },
        { label: 'Box Blur', value: 'boxBlur' },
        { label: 'Gaussian Blur', value: 'gaussianBlur' },
        { label: 'Sobel X', value: 'sobelX' },
        { label: 'Sobel Y', value: 'sobelY' },
        { label: 'Custom', value: 'custom' },
      ],
    },
    {
      id: 'customKernel',
      name: 'Custom Kernel',
      type: 'string',
      default: '0,0,0;0,1,0;0,0,0',
      description: 'Custom 3x3 kernel (semicolon separated rows)',
    },
    {
      id: 'strength',
      name: 'Strength',
      type: 'number',
      default: 100,
      constraints: { min: 0, max: 200, step: 1 },
    },
    {
      id: 'normalize',
      name: 'Normalize',
      type: 'boolean',
      default: true,
      description: 'Normalize kernel weights',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const preset = params.preset as string;
    const customKernel = params.customKernel as string;
    const strength = (params.strength as number) / 100;
    const normalize = params.normalize as boolean;

    // Get kernel
    let kernel: number[][];
    if (preset === 'custom') {
      try {
        kernel = customKernel.split(';').map(row =>
          row.split(',').map(v => parseFloat(v.trim()))
        );
      } catch {
        kernel = PRESET_KERNELS.identity;
      }
    } else {
      kernel = PRESET_KERNELS[preset] || PRESET_KERNELS.identity;
    }

    const kernelHeight = kernel.length;
    const kernelWidth = kernel[0]?.length || 0;

    if (kernelHeight === 0 || kernelWidth === 0) {
      return {
        image: new ImageData(
          new Uint8ClampedArray(inputImage.data),
          inputImage.width,
          inputImage.height
        ),
      };
    }

    // Normalize kernel if requested
    if (normalize) {
      let sum = 0;
      for (const row of kernel) {
        for (const val of row) {
          sum += val;
        }
      }
      if (sum !== 0 && sum !== 1) {
        for (const row of kernel) {
          for (let i = 0; i < row.length; i++) {
            row[i] /= sum;
          }
        }
      }
    }

    const { width, height, data: srcData } = inputImage;
    const outputImage = new ImageData(width, height);
    const dstData = outputImage.data;

    const halfKH = Math.floor(kernelHeight / 2);
    const halfKW = Math.floor(kernelWidth / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;

        for (let ky = 0; ky < kernelHeight; ky++) {
          for (let kx = 0; kx < kernelWidth; kx++) {
            const sx = Math.max(0, Math.min(width - 1, x + kx - halfKW));
            const sy = Math.max(0, Math.min(height - 1, y + ky - halfKH));
            const srcIdx = (sy * width + sx) * 4;
            const weight = kernel[ky][kx];

            r += srcData[srcIdx] * weight;
            g += srcData[srcIdx + 1] * weight;
            b += srcData[srcIdx + 2] * weight;
          }
        }

        const dstIdx = (y * width + x) * 4;
        const origIdx = (y * width + x) * 4;

        // Blend with original based on strength
        dstData[dstIdx] = Math.max(0, Math.min(255, Math.round(
          srcData[origIdx] * (1 - strength) + r * strength
        )));
        dstData[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(
          srcData[origIdx + 1] * (1 - strength) + g * strength
        )));
        dstData[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(
          srcData[origIdx + 2] * (1 - strength) + b * strength
        )));
        dstData[dstIdx + 3] = srcData[origIdx + 3]; // Preserve alpha
      }

      if (y % 50 === 0) {
        context.reportProgress(y / height);
      }
    }

    context.reportProgress(1);
    return { image: outputImage };
  },
});
