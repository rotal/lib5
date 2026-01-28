import { defineNode } from '../defineNode';
import { Color } from '../../../types/data';

export const ColorInputNode = defineNode({
  type: 'input/color',
  category: 'Input',
  name: 'Color',
  description: 'Generate a solid color image',
  icon: 'palette',

  inputs: [],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
    {
      id: 'color',
      name: 'Color',
      dataType: 'color',
    },
  ],

  parameters: [
    {
      id: 'color',
      name: 'Color',
      type: 'color',
      default: { r: 128, g: 128, b: 128, a: 1 },
    },
    {
      id: 'width',
      name: 'Width',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 8192, step: 1 },
    },
    {
      id: 'height',
      name: 'Height',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 8192, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const color = params.color as Color;
    const width = params.width as number;
    const height = params.height as number;

    const imageData = new ImageData(width, height);
    const data = imageData.data;

    const r = Math.round(color.r);
    const g = Math.round(color.g);
    const b = Math.round(color.b);
    const a = Math.round(color.a * 255);

    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }

    return {
      image: imageData,
      color: color,
    };
  },
});
