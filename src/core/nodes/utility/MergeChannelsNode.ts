import { defineNode, ensureFloatImage } from '../defineNode';
import { createFloatImage } from '../../../types/data';

export const MergeChannelsNode = defineNode({
  type: 'utility/merge-channels',
  category: 'Utility',
  name: 'Merge Channels',
  description: 'Merge RGBA channels into single image',
  icon: 'layers',

  inputs: [
    {
      id: 'red',
      name: 'Red',
      dataType: 'mask',
      required: false,
    },
    {
      id: 'green',
      name: 'Green',
      dataType: 'mask',
      required: false,
    },
    {
      id: 'blue',
      name: 'Blue',
      dataType: 'mask',
      required: false,
    },
    {
      id: 'alpha',
      name: 'Alpha',
      dataType: 'mask',
      required: false,
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
      id: 'defaultRed',
      name: 'Default Red',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
    },
    {
      id: 'defaultGreen',
      name: 'Default Green',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
    },
    {
      id: 'defaultBlue',
      name: 'Default Blue',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
    },
    {
      id: 'defaultAlpha',
      name: 'Default Alpha',
      type: 'number',
      default: 255,
      constraints: { min: 0, max: 255, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const redImage = ensureFloatImage(inputs.red, context);
    const greenImage = ensureFloatImage(inputs.green, context);
    const blueImage = ensureFloatImage(inputs.blue, context);
    const alphaImage = ensureFloatImage(inputs.alpha, context);

    // Convert 0-255 defaults to 0.0-1.0
    const defaultRed = (params.defaultRed as number) / 255;
    const defaultGreen = (params.defaultGreen as number) / 255;
    const defaultBlue = (params.defaultBlue as number) / 255;
    const defaultAlpha = (params.defaultAlpha as number) / 255;

    // Determine output dimensions from first available input
    const referenceImage = redImage || greenImage || blueImage || alphaImage;
    if (!referenceImage) {
      return { image: null };
    }

    const { width, height } = referenceImage;
    const outputImage = createFloatImage(width, height);
    const outData = outputImage.data;

    const redData = redImage?.data;
    const greenData = greenImage?.data;
    const blueData = blueImage?.data;
    const alphaData = alphaImage?.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Get value from each channel image (use red channel of grayscale)
        outData[idx] = redData ? redData[idx] : defaultRed;
        outData[idx + 1] = greenData ? greenData[idx] : defaultGreen;
        outData[idx + 2] = blueData ? blueData[idx] : defaultBlue;
        outData[idx + 3] = alphaData ? alphaData[idx] : defaultAlpha;
      }
    }

    return { image: outputImage };
  },
});
