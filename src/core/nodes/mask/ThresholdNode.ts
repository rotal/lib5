import { defineNode } from '../defineNode';

export const ThresholdNode = defineNode({
  type: 'mask/threshold',
  category: 'Mask',
  name: 'Threshold',
  description: 'Create mask from luminance threshold',
  icon: 'contrast',

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
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { mask: null, image: null };
    }

    const threshold = params.threshold as number;
    const softness = params.softness as number;
    const invert = params.invert as boolean;
    const channel = params.channel as string;

    const { width, height, data: srcData } = inputImage;
    const maskImage = new ImageData(width, height);
    const outputImage = new ImageData(width, height);
    const maskData = maskImage.data;
    const outData = outputImage.data;

    const lowThreshold = Math.max(0, threshold - softness);
    const highThreshold = Math.min(255, threshold + softness);
    const range = highThreshold - lowThreshold || 1;

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
          // Standard luminance formula
          value = 0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2];
          break;
      }

      let maskValue: number;
      if (softness === 0) {
        maskValue = value >= threshold ? 255 : 0;
      } else {
        if (value <= lowThreshold) {
          maskValue = 0;
        } else if (value >= highThreshold) {
          maskValue = 255;
        } else {
          maskValue = Math.round(((value - lowThreshold) / range) * 255);
        }
      }

      if (invert) {
        maskValue = 255 - maskValue;
      }

      // Mask output (grayscale)
      maskData[i] = maskValue;
      maskData[i + 1] = maskValue;
      maskData[i + 2] = maskValue;
      maskData[i + 3] = 255;

      // Image output (B&W)
      outData[i] = maskValue;
      outData[i + 1] = maskValue;
      outData[i + 2] = maskValue;
      outData[i + 3] = srcData[i + 3];
    }

    return { mask: maskImage, image: outputImage };
  },
});
