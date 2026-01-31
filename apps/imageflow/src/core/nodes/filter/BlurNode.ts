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

/**
 * GPU mask blend: mix original and blurred using mask red channel
 */
function applyMaskGPU(
  original: ImageData | FloatImage | GPUTexture,
  blurred: GPUTexture,
  mask: ImageData | FloatImage | GPUTexture,
  gpu: GPUContext
): GPUTexture {
  const texturesToRelease: string[] = [];

  let originalTexture: GPUTexture;
  if (isGPUTexture(original)) {
    originalTexture = original;
  } else if (isFloatImage(original)) {
    originalTexture = gpu.createTextureFromFloat(original as FloatImage);
    texturesToRelease.push(originalTexture.id);
  } else {
    originalTexture = gpu.createTexture(original as ImageData);
    texturesToRelease.push(originalTexture.id);
  }

  let maskTexture: GPUTexture;
  if (isGPUTexture(mask)) {
    maskTexture = mask;
  } else if (isFloatImage(mask)) {
    maskTexture = gpu.createTextureFromFloat(mask as FloatImage);
    texturesToRelease.push(maskTexture.id);
  } else {
    maskTexture = gpu.createTexture(mask as ImageData);
    texturesToRelease.push(maskTexture.id);
  }

  const outputTexture = gpu.createEmptyTexture(blurred.width, blurred.height);

  gpu.renderToTexture('mask_blend', {
    u_original: originalTexture.texture,
    u_processed: blurred.texture,
    u_mask: maskTexture.texture,
  }, outputTexture);

  for (const id of texturesToRelease) {
    gpu.releaseTexture(id);
  }

  return outputTexture;
}

/**
 * CPU mask blend: mix original and blurred using mask red channel
 */
function applyMaskCPU(
  original: FloatImage,
  blurred: FloatImage,
  mask: FloatImage
): FloatImage {
  const { width, height } = original;
  const result = createFloatImage(width, height);
  const origData = original.data;
  const blurData = blurred.data;
  const maskData = mask.data;
  const outData = result.data;
  const maskW = mask.width;
  const maskH = mask.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Sample mask (red channel), 0 outside mask bounds
      let m = 0;
      if (x < maskW && y < maskH) {
        m = maskData[(y * maskW + x) * 4];
      }

      // Lerp: original * (1 - m) + blurred * m
      outData[idx]     = origData[idx]     * (1 - m) + blurData[idx]     * m;
      outData[idx + 1] = origData[idx + 1] * (1 - m) + blurData[idx + 1] * m;
      outData[idx + 2] = origData[idx + 2] * (1 - m) + blurData[idx + 2] * m;
      outData[idx + 3] = origData[idx + 3] * (1 - m) + blurData[idx + 3] * m;
    }
  }

  return result;
}

export const BlurNode = defineNode({
  type: 'filter/blur',
  category: 'Filter',
  name: 'Blur',
  description: 'Apply Gaussian blur to image',
  icon: 'blur_on',
  hasLocalTransform: true,
  requiresSpatialCoherence: true,

  inputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
      required: true,
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
      required: false,
      description: 'Optional mask to control blur strength per pixel',
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
    const input = inputs.image as ImageData | FloatImage | GPUTexture | null;
    const maskInput = inputs.mask as ImageData | FloatImage | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    const radius = Math.round(params.radius as number);
    let sigma = params.sigma as number;

    // No blur needed
    if (radius === 0) {
      if (isGPUTexture(input)) {
        context.gpu?.retainTexture(input.id);
        return { image: input };
      }
      return {
        image: new ImageData(
          new Uint8ClampedArray((input as ImageData).data),
          (input as ImageData).width,
          (input as ImageData).height
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
        const blurredTexture = executeGPU(input, effectiveRadius, sigma, context.gpu);

        // Apply mask blend on GPU if mask provided
        let finalTexture = blurredTexture;
        if (maskInput) {
          finalTexture = applyMaskGPU(input, blurredTexture, maskInput, context.gpu);
          context.gpu.releaseTexture(blurredTexture.id);
        }

        context.reportProgress(1);

        if (params.preview) {
          const result = context.gpu.downloadTexture(finalTexture);
          context.gpu.releaseTexture(finalTexture.id);
          return { image: result };
        }

        return { image: finalTexture };
      } catch (error) {
        console.warn('GPU blur failed, falling back to CPU:', error);
      }
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const blurredImage = executeCPU(inputImage, effectiveRadius, sigma, context);

    // Apply mask blend on CPU if mask provided
    if (maskInput) {
      const maskImage = ensureFloatImage(maskInput, context);
      if (maskImage) {
        const result = applyMaskCPU(inputImage, blurredImage, maskImage);
        context.reportProgress(1);
        return { image: result };
      }
    }

    context.reportProgress(1);
    return { image: blurredImage };
  },
});
