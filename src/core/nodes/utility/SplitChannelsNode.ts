import { defineNode } from '../defineNode';

export const SplitChannelsNode = defineNode({
  type: 'utility/split-channels',
  category: 'Utility',
  name: 'Split Channels',
  description: 'Split image into RGBA channels',
  icon: 'layers_clear',

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
      id: 'red',
      name: 'Red',
      dataType: 'mask',
    },
    {
      id: 'green',
      name: 'Green',
      dataType: 'mask',
    },
    {
      id: 'blue',
      name: 'Blue',
      dataType: 'mask',
    },
    {
      id: 'alpha',
      name: 'Alpha',
      dataType: 'mask',
    },
  ],

  parameters: [],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { red: null, green: null, blue: null, alpha: null };
    }

    const { width, height, data: srcData } = inputImage;

    const redImage = new ImageData(width, height);
    const greenImage = new ImageData(width, height);
    const blueImage = new ImageData(width, height);
    const alphaImage = new ImageData(width, height);

    const redData = redImage.data;
    const greenData = greenImage.data;
    const blueData = blueImage.data;
    const alphaData = alphaImage.data;

    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];
      const a = srcData[i + 3];

      // Red channel as grayscale
      redData[i] = r;
      redData[i + 1] = r;
      redData[i + 2] = r;
      redData[i + 3] = 255;

      // Green channel as grayscale
      greenData[i] = g;
      greenData[i + 1] = g;
      greenData[i + 2] = g;
      greenData[i + 3] = 255;

      // Blue channel as grayscale
      blueData[i] = b;
      blueData[i + 1] = b;
      blueData[i + 2] = b;
      blueData[i + 3] = 255;

      // Alpha channel as grayscale
      alphaData[i] = a;
      alphaData[i + 1] = a;
      alphaData[i + 2] = a;
      alphaData[i + 3] = 255;
    }

    return {
      red: redImage,
      green: greenImage,
      blue: blueImage,
      alpha: alphaImage,
    };
  },
});
