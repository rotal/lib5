import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, FloatImage, createFloatImage } from '../../../types/data';
import type { GPUContext, GPUTexture } from '../../../types/gpu';
import type { ExecutionContext } from '../../../types/node';

/**
 * Generate Gaussian kernel weights
 */
function generateGaussianKernel(radius: number, sigma: number): Float32Array {
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let sum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    const g = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = g;
    sum += g;
  }

  // Normalize
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  return kernel;
}

/**
 * GPU blur implementation using separable two-pass Gaussian blur
 */
function executeGPU(
  input: ImageData | FloatImage | GPUTexture,
  radius: number,
  sigma: number,
  gpu: GPUContext
): GPUTexture {
  // Get or create input texture
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
  const kernel = generateGaussianKernel(radius, sigma);
  const kernelSize = radius * 2 + 1;

  // Pad kernel to fixed size for uniform array
  const paddedKernel = new Float32Array(101);
  paddedKernel.set(kernel);

  // Create intermediate texture for horizontal pass
  const tempTexture = gpu.createEmptyTexture(width, height);

  // Horizontal blur pass
  gpu.renderToTexture('blur', {
    u_texture: inputTexture.texture,
    u_texelSize: [1.0 / width, 1.0 / height],
    u_direction: [1.0, 0.0],
    u_kernel: paddedKernel,
    u_kernelSize: kernelSize,
    u_radius: radius,
  }, tempTexture);

  // Create output texture for vertical pass
  const outputTexture = gpu.createEmptyTexture(width, height);

  // Vertical blur pass
  gpu.renderToTexture('blur', {
    u_texture: tempTexture.texture,
    u_texelSize: [1.0 / width, 1.0 / height],
    u_direction: [0.0, 1.0],
    u_kernel: paddedKernel,
    u_kernelSize: kernelSize,
    u_radius: radius,
  }, outputTexture);

  // Cleanup
  gpu.releaseTexture(tempTexture.id);
  if (needsInputRelease) {
    gpu.releaseTexture(inputTexture.id);
  }

  return outputTexture;
}

/**
 * CPU blur implementation (fallback) - uses FloatImage (0.0-1.0)
 */
function executeCPU(
  inputImage: FloatImage,
  radius: number,
  sigma: number,
  context: ExecutionContext
): FloatImage {
  const kernel = generateGaussianKernel(radius, sigma);
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
  const outputImage = createFloatImage(width, height);
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
      dstData[dstIdx] = r;
      dstData[dstIdx + 1] = g;
      dstData[dstIdx + 2] = b;
      dstData[dstIdx + 3] = a;
    }

    if (y % 50 === 0) {
      context.reportProgress(0.5 + y / height * 0.5);
    }
  }

  return outputImage;
}

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

    const radius = Math.round(params.radius as number);
    let sigma = params.sigma as number;

    // No blur needed
    if (radius === 0) {
      if (isGPUTexture(input)) {
        // Return the GPU texture as-is (retain it)
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

    // Auto sigma
    if (sigma === 0) {
      sigma = radius / 3;
    }

    // Clamp radius to max 50 for GPU shader
    const effectiveRadius = Math.min(radius, 50);

    // Try GPU path
    if (context.gpu?.isAvailable) {
      try {
        const gpuResult = executeGPU(input, effectiveRadius, sigma, context.gpu);
        context.reportProgress(1);

        // Download only if preview is enabled
        if (params.preview) {
          const result = context.gpu.downloadTexture(gpuResult);
          context.gpu.releaseTexture(gpuResult.id);
          return { image: result };
        }

        return { image: gpuResult };
      } catch (error) {
        console.warn('GPU blur failed, falling back to CPU:', error);
      }
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const result = executeCPU(inputImage, effectiveRadius, sigma, context);
    context.reportProgress(1);
    return { image: result };
  },
});
