import { defineNode } from '../defineNode';

export const ReorderChannelsNode = defineNode({
  type: 'utility/reorder-channels',
  category: 'Utility',
  name: 'Reorder Channels',
  description: 'Remap and reorder RGBA channels',
  icon: 'shuffle',

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
      id: 'redSource',
      name: 'Red Source',
      type: 'select',
      default: 'red',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
        { label: 'Alpha', value: 'alpha' },
        { label: 'Zero', value: 'zero' },
        { label: 'One', value: 'one' },
      ],
      description: 'Source channel for red output',
    },
    {
      id: 'greenSource',
      name: 'Green Source',
      type: 'select',
      default: 'green',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
        { label: 'Alpha', value: 'alpha' },
        { label: 'Zero', value: 'zero' },
        { label: 'One', value: 'one' },
      ],
      description: 'Source channel for green output',
    },
    {
      id: 'blueSource',
      name: 'Blue Source',
      type: 'select',
      default: 'blue',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
        { label: 'Alpha', value: 'alpha' },
        { label: 'Zero', value: 'zero' },
        { label: 'One', value: 'one' },
      ],
      description: 'Source channel for blue output',
    },
    {
      id: 'alphaSource',
      name: 'Alpha Source',
      type: 'select',
      default: 'alpha',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
        { label: 'Alpha', value: 'alpha' },
        { label: 'Zero', value: 'zero' },
        { label: 'One', value: 'one' },
      ],
      description: 'Source channel for alpha output',
    },
  ],

  async execute(inputs, params, context) {
    const image = inputs.image as ImageData | null;

    if (!image) {
      return { image: null };
    }

    const { redSource, greenSource, blueSource, alphaSource } = params as {
      redSource: string;
      greenSource: string;
      blueSource: string;
      alphaSource: string;
    };

    const result = new ImageData(image.width, image.height);
    const src = image.data;
    const dst = result.data;

    // Helper to get channel value
    const getChannelValue = (i: number, channel: string): number => {
      switch (channel) {
        case 'red': return src[i];
        case 'green': return src[i + 1];
        case 'blue': return src[i + 2];
        case 'alpha': return src[i + 3];
        case 'zero': return 0;
        case 'one': return 255;
        default: return 0;
      }
    };

    const totalPixels = image.width * image.height;
    const reportInterval = Math.floor(totalPixels / 10);

    for (let p = 0; p < totalPixels; p++) {
      const i = p * 4;

      dst[i] = getChannelValue(i, redSource);
      dst[i + 1] = getChannelValue(i, greenSource);
      dst[i + 2] = getChannelValue(i, blueSource);
      dst[i + 3] = getChannelValue(i, alphaSource);

      if (p % reportInterval === 0) {
        context.reportProgress(p / totalPixels);
      }
    }

    return { image: result };
  },
});
