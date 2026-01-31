import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

export const ThresholdNode = defineNode({
  type: 'mask/threshold',
  category: 'Mask',
  name: 'Threshold',
  description: 'Create mask from luminance threshold',
  icon: 'contrast',
  hasLocalTransform: true,

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
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
    },
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
      description: 'Thresholded black/white image',
    },
  ],

  parameters: [
    {
      id: 'threshold',
      name: 'Threshold',
      type: 'number',
      default: 128,
      constraints: { min: 0, max: 255, step: 1 },
    },
    {
      id: 'softness',
      name: 'Softness',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 127, step: 1 },
      description: 'Transition softness (0 = hard edge)',
    },
    {
      id: 'invert',
      name: 'Invert',
      type: 'boolean',
      default: false,
    },
    {
      id: 'channel',
      name: 'Channel',
      type: 'select',
      default: 'luminance',
      options: [
        { label: 'Luminance', value: 'luminance' },
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
        { label: 'Alpha', value: 'alpha' },
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
      return { mask: null, image: null };
    }

    const threshold = (params.threshold as number) / 255;
    const softness = (params.softness as number) / 255;
    const invert = params.invert as boolean;
    const channel = params.channel as string;
    const preview = params.preview as boolean;

    // Map channel names to indices
    const channelMap: Record<string, number> = {
      luminance: 0,
      red: 1,
      green: 2,
      blue: 3,
      alpha: 4,
    };

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

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('threshold', {
        u_texture: inputTexture.texture,
        u_threshold: threshold,
        u_softness: softness,
        u_invert: invert,
        u_channel: channelMap[channel],
      }, outputTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      if (preview) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        return { mask: result, image: result };
      }

      // Return same texture for both outputs (both are grayscale masks)
      return { mask: outputTexture, image: outputTexture };
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { mask: null, image: null };
    }

    const { width, height, data: srcData } = inputImage;
    const maskImage = createFloatImage(width, height);
    const outputImage = createFloatImage(width, height);
    const maskData = maskImage.data;
    const outData = outputImage.data;

    const lowThreshold = Math.max(0, threshold - softness);
    const highThreshold = Math.min(1, threshold + softness);
    const range = highThreshold - lowThreshold || 0.001;

    for (let i = 0; i < srcData.length; i += 4) {
      let value: number;

      switch (channel) {
        case 'red':
          value = srcData[i];
          break;
        case 'green':
          value = srcData[i + 1];
          break;
        case 'blue':
          value = srcData[i + 2];
          break;
        case 'alpha':
          value = srcData[i + 3];
          break;
        case 'luminance':
        default:
          value = 0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2];
          break;
      }

      let maskValue: number;
      if (softness === 0) {
        maskValue = value >= threshold ? 1.0 : 0.0;
      } else {
        if (value <= lowThreshold) {
          maskValue = 0;
        } else if (value >= highThreshold) {
          maskValue = 1;
        } else {
          maskValue = (value - lowThreshold) / range;
        }
      }

      if (invert) {
        maskValue = 1.0 - maskValue;
      }

      maskData[i] = maskValue;
      maskData[i + 1] = maskValue;
      maskData[i + 2] = maskValue;
      maskData[i + 3] = 1.0;

      outData[i] = maskValue;
      outData[i + 1] = maskValue;
      outData[i + 2] = maskValue;
      outData[i + 3] = srcData[i + 3];
    }

    return { mask: maskImage, image: outputImage };
  },
});
