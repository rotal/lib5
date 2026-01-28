import { defineNode } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
import type { GPUContext, GPUTexture } from '../../../types/gpu';

// Interpolation method to shader constant mapping
const INTERPOLATION_MAP: Record<string, number> = {
  nearest: 0,
  bilinear: 1,
  bicubic: 2,
};

/**
 * Calculate target dimensions based on mode and parameters
 */
function calculateTargetDimensions(
  srcW: number,
  srcH: number,
  mode: string,
  scalePercent: number,
  targetWidth: number,
  targetHeight: number,
  maintainAspect: boolean
): { dstW: number; dstH: number } {
  let dstW: number, dstH: number;

  switch (mode) {
    case 'percentage':
      dstW = Math.round(srcW * scalePercent / 100);
      dstH = Math.round(srcH * scalePercent / 100);
      break;
    case 'fit': {
      const scaleX = targetWidth / srcW;
      const scaleY = targetHeight / srcH;
      const scale = Math.min(scaleX, scaleY);
      dstW = Math.round(srcW * scale);
      dstH = Math.round(srcH * scale);
      break;
    }
    case 'pixels':
    default:
      if (maintainAspect) {
        const aspect = srcW / srcH;
        dstW = targetWidth;
        dstH = Math.round(targetWidth / aspect);
      } else {
        dstW = targetWidth;
        dstH = targetHeight;
      }
      break;
  }

  return {
    dstW: Math.max(1, dstW),
    dstH: Math.max(1, dstH),
  };
}

/**
 * GPU scale implementation
 */
function executeGPU(
  input: ImageData | GPUTexture,
  dstW: number,
  dstH: number,
  interpolation: string,
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

  const outputTexture = gpu.createEmptyTexture(dstW, dstH);

  gpu.renderToTexture('scale', {
    u_texture: inputTexture.texture,
    u_srcSize: [inputTexture.width, inputTexture.height],
    u_dstSize: [dstW, dstH],
    u_interpolation: INTERPOLATION_MAP[interpolation] ?? 1,
  }, outputTexture);

  if (needsInputRelease) {
    gpu.releaseTexture(inputTexture.id);
  }

  return outputTexture;
}

/**
 * CPU scale implementation (fallback)
 */
function executeCPU(
  inputImage: ImageData,
  dstW: number,
  dstH: number,
  interpolation: string
): ImageData {
  const srcW = inputImage.width;
  const srcH = inputImage.height;
  const srcData = inputImage.data;

  const outputImage = new ImageData(dstW, dstH);
  const dstData = outputImage.data;

  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = x * scaleX;
      const srcY = y * scaleY;
      const dstIdx = (y * dstW + x) * 4;

      if (interpolation === 'nearest') {
        const sx = Math.min(Math.floor(srcX), srcW - 1);
        const sy = Math.min(Math.floor(srcY), srcH - 1);
        const srcIdx = (sy * srcW + sx) * 4;
        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      } else if (interpolation === 'bilinear') {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const fx = srcX - x0;
        const fy = srcY - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        for (let c = 0; c < 4; c++) {
          const v00 = srcData[idx00 + c];
          const v10 = srcData[idx10 + c];
          const v01 = srcData[idx01 + c];
          const v11 = srcData[idx11 + c];

          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;
          dstData[dstIdx + c] = Math.round(v0 * (1 - fy) + v1 * fy);
        }
      } else {
        // Bicubic interpolation
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const fx = srcX - x0;
        const fy = srcY - y0;

        for (let c = 0; c < 4; c++) {
          let value = 0;

          for (let j = -1; j <= 2; j++) {
            for (let i = -1; i <= 2; i++) {
              const sx = Math.max(0, Math.min(srcW - 1, x0 + i));
              const sy = Math.max(0, Math.min(srcH - 1, y0 + j));
              const srcIdx = (sy * srcW + sx) * 4;

              const wx = cubicWeight(i - fx);
              const wy = cubicWeight(j - fy);
              value += srcData[srcIdx + c] * wx * wy;
            }
          }

          dstData[dstIdx + c] = Math.round(Math.max(0, Math.min(255, value)));
        }
      }
    }
  }

  return outputImage;
}

function cubicWeight(x: number): number {
  const a = -0.5;
  const abs = Math.abs(x);

  if (abs <= 1) {
    return (a + 2) * abs * abs * abs - (a + 3) * abs * abs + 1;
  } else if (abs < 2) {
    return a * abs * abs * abs - 5 * a * abs * abs + 8 * a * abs - 4 * a;
  }
  return 0;
}

export const ScaleNode = defineNode({
  type: 'transform/scale',
  category: 'Transform',
  name: 'Scale',
  description: 'Resize image to specified dimensions',
  icon: 'photo_size_select_large',

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
      id: 'mode',
      name: 'Mode',
      type: 'select',
      default: 'percentage',
      options: [
        { label: 'Percentage', value: 'percentage' },
        { label: 'Pixels', value: 'pixels' },
        { label: 'Fit', value: 'fit' },
      ],
    },
    {
      id: 'scalePercent',
      name: 'Scale %',
      type: 'number',
      default: 100,
      constraints: { min: 1, max: 1000, step: 1 },
      description: 'Scale percentage (for percentage mode)',
    },
    {
      id: 'width',
      name: 'Width',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 8192, step: 1 },
      description: 'Target width in pixels',
    },
    {
      id: 'height',
      name: 'Height',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 8192, step: 1 },
      description: 'Target height in pixels',
    },
    {
      id: 'maintainAspect',
      name: 'Maintain Aspect Ratio',
      type: 'boolean',
      default: true,
    },
    {
      id: 'interpolation',
      name: 'Interpolation',
      type: 'select',
      default: 'bilinear',
      options: [
        { label: 'Nearest', value: 'nearest' },
        { label: 'Bilinear', value: 'bilinear' },
        { label: 'Bicubic', value: 'bicubic' },
      ],
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

    const mode = params.mode as string;
    const scalePercent = params.scalePercent as number;
    const targetWidth = params.width as number;
    const targetHeight = params.height as number;
    const maintainAspect = params.maintainAspect as boolean;
    const interpolation = params.interpolation as string;

    const srcW = isGPUTexture(input) ? input.width : input.width;
    const srcH = isGPUTexture(input) ? input.height : input.height;

    const { dstW, dstH } = calculateTargetDimensions(
      srcW, srcH, mode, scalePercent, targetWidth, targetHeight, maintainAspect
    );

    // No scaling needed
    if (dstW === srcW && dstH === srcH) {
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

    // Try GPU path
    if (context.gpu?.isAvailable) {
      try {
        const gpuResult = executeGPU(input, dstW, dstH, interpolation, context.gpu);

        // Download only if preview is enabled
        if (params.preview) {
          const result = context.gpu.downloadTexture(gpuResult);
          context.gpu.releaseTexture(gpuResult.id);
          return { image: result };
        }

        return { image: gpuResult };
      } catch (error) {
        console.warn('GPU scale failed, falling back to CPU:', error);
      }
    }

    // CPU fallback
    let inputImage: ImageData;
    if (isGPUTexture(input)) {
      inputImage = context.gpu!.downloadTexture(input);
    } else {
      inputImage = input;
    }

    const result = executeCPU(inputImage, dstW, dstH, interpolation);
    return { image: result };
  },
});
