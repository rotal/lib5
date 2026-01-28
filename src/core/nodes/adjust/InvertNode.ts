import { defineNode } from '../defineNode';

export const InvertNode = defineNode({
  type: 'adjust/invert',
  category: 'Adjust',
  name: 'Invert',
  description: 'Invert image colors',
  icon: 'invert_colors',

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
      id: 'invertAlpha',
      name: 'Invert Alpha',
      type: 'boolean',
      default: false,
      description: 'Also invert the alpha channel',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const invertAlpha = params.invertAlpha as boolean;

    // Create output image
    const outputImage = new ImageData(
      new Uint8ClampedArray(inputImage.data),
      inputImage.width,
      inputImage.height
    );
    const data = outputImage.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];

      if (invertAlpha) {
        data[i + 3] = 255 - data[i + 3];
      }
    }

    return { image: outputImage };
  },
});
