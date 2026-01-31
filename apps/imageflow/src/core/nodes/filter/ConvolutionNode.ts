import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, FloatImage, createFloatImage } from '../../../types/data';
import type { GPUContext, GPUTexture } from '../../../types/gpu';
import type { ExecutionContext } from '../../../types/node';

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

/**
 * Get and optionally normalize a kernel
 */
function getKernel(preset: string, customKernel: string, normalize: boolean): number[][] {
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
    // Deep copy preset kernel
    kernel = (PRESET_KERNELS[preset] || PRESET_KERNELS.identity).map(row => [...row]);
  }

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

  return kernel;
}

/**
 * GPU convolution implementation
 */
function executeGPU(
  input: ImageData | GPUTexture,
  kernel: number[][],
  strength: number,
  gpu: GPUContext
): GPUTexture {
  let inputTexture: GPUTexture;
  let needsInputRelease = false;

  if (isGPUTexture(input)) {
    inputTexture = input;
  } else {
    inputTexture = gpu.createTexture(input);
    needsInputRelease = true;
  }

  const { width, height } = inputTexture;
  const kernelHeight = kernel.length;
  const kernelWidth = kernel[0]?.length || 0;

  // Flatten kernel and pad to max 49 elements (7x7)
  const flatKernel = new Float32Array(49);
  for (let y = 0; y < kernelHeight && y < 7; y++) {
    for (let x = 0; x < kernelWidth && x < 7; x++) {
      flatKernel[y * kernelWidth + x] = kernel[y][x];
    }
  }

  const outputTexture = gpu.createEmptyTexture(width, height);

  gpu.renderToTexture('convolution', {
    u_texture: inputTexture.texture,
    u_texelSize: [1.0 / width, 1.0 / height],
    u_kernel: flatKernel,
    u_kernelWidth: Math.min(kernelWidth, 7),
    u_kernelHeight: Math.min(kernelHeight, 7),
    u_strength: strength,
  }, outputTexture);

  if (needsInputRelease) {
    gpu.releaseTexture(inputTexture.id);
  }

  return outputTexture;
}

/**
 * CPU convolution implementation (fallback)
 */
function executeCPU(
  inputImage: FloatImage,
  kernel: number[][],
  strength: number,
  context: ExecutionContext
): FloatImage {
  const kernelHeight = kernel.length;
  const kernelWidth = kernel[0]?.length || 0;
  const { width, height, data: srcData } = inputImage;
  const outputImage = createFloatImage(width, height);
  // Preserve transform from input
  if (inputImage.transform) {
    outputImage.transform = inputImage.transform;
  }
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

      // Blend with original based on strength (values in 0.0-1.0)
      dstData[dstIdx] = Math.max(0, Math.min(1,
        srcData[origIdx] * (1 - strength) + r * strength
      ));
      dstData[dstIdx + 1] = Math.max(0, Math.min(1,
        srcData[origIdx + 1] * (1 - strength) + g * strength
      ));
      dstData[dstIdx + 2] = Math.max(0, Math.min(1,
        srcData[origIdx + 2] * (1 - strength) + b * strength
      ));
      dstData[dstIdx + 3] = srcData[origIdx + 3];
    }

    if (y % 50 === 0) {
      context.reportProgress(y / height);
    }
  }

  return outputImage;
}

export const ConvolutionNode = defineNode({
  type: 'filter/convolution',
  category: 'Filter',
  name: 'Convolution',
  description: 'Apply custom convolution kernel',
  icon: 'grid_3x3',
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

    const preset = params.preset as string;
    const customKernel = params.customKernel as string;
    const strength = (params.strength as number) / 100;
    const normalize = params.normalize as boolean;

    const kernel = getKernel(preset, customKernel, normalize);
    const kernelHeight = kernel.length;
    const kernelWidth = kernel[0]?.length || 0;

    if (kernelHeight === 0 || kernelWidth === 0) {
      if (isGPUTexture(input)) {
        context.gpu?.retainTexture(input.id);
        return { image: input };
      }
      return {
        image: new ImageData(
          new Uint8ClampedArray(input.data),
          input.width,
          input.height
        ),
      };
    }

    // Try GPU path (supports up to 7x7 kernels)
    if (context.gpu?.isAvailable && kernelWidth <= 7 && kernelHeight <= 7) {
      try {
        // Preserve transform from input FloatImage (GPU textures can't store transform)
        const inputTransform = isFloatImage(input) ? input.transform : undefined;

        const gpuResult = executeGPU(input, kernel, strength, context.gpu);
        context.reportProgress(1);

        // If input had transform, we must download to preserve it (GPUTexture can't store transform)
        if (params.preview || inputTransform) {
          const result = context.gpu.downloadTexture(gpuResult);
          context.gpu.releaseTexture(gpuResult.id);
          if (inputTransform) {
            result.transform = inputTransform;
          }
          return { image: result };
        }

        return { image: gpuResult };
      } catch (error) {
        console.warn('GPU convolution failed, falling back to CPU:', error);
      }
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const result = executeCPU(inputImage, kernel, strength, context);
    context.reportProgress(1);
    return { image: result };
  },
});
