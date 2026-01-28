import { defineNode } from '../defineNode';

export const LevelsNode = defineNode({
  type: 'adjust/levels',
  category: 'Adjust',
  name: 'Levels',
  description: 'Adjust input/output levels with gamma',
  icon: 'tune',

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
      id: 'inputBlack',
      name: 'Input Black',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'Black point for input levels',
    },
    {
      id: 'inputWhite',
      name: 'Input White',
      type: 'number',
      default: 255,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'White point for input levels',
    },
    {
      id: 'gamma',
      name: 'Gamma',
      type: 'number',
      default: 1.0,
      constraints: { min: 0.1, max: 10, step: 0.01 },
      description: 'Gamma correction (midtones)',
    },
    {
      id: 'outputBlack',
      name: 'Output Black',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'Black point for output levels',
    },
    {
      id: 'outputWhite',
      name: 'Output White',
      type: 'number',
      default: 255,
      constraints: { min: 0, max: 255, step: 1 },
      description: 'White point for output levels',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const inputBlack = params.inputBlack as number;
    const inputWhite = params.inputWhite as number;
    const gamma = params.gamma as number;
    const outputBlack = params.outputBlack as number;
    const outputWhite = params.outputWhite as number;

    // Create output image
    const outputImage = new ImageData(
      new Uint8ClampedArray(inputImage.data),
      inputImage.width,
      inputImage.height
    );
    const data = outputImage.data;

    // Precompute lookup table for performance
    const lut = new Uint8Array(256);
    const inputRange = inputWhite - inputBlack || 1;
    const outputRange = outputWhite - outputBlack;

    for (let i = 0; i < 256; i++) {
      // Apply input levels
      let value = (i - inputBlack) / inputRange;
      value = Math.max(0, Math.min(1, value));

      // Apply gamma
      value = Math.pow(value, 1 / gamma);

      // Apply output levels
      value = value * outputRange + outputBlack;

      lut[i] = Math.round(Math.max(0, Math.min(255, value)));
    }

    // Apply lookup table
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
      // Alpha unchanged
    }

    return { image: outputImage };
  },
});
