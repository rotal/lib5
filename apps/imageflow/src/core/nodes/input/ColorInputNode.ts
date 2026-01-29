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
      id: 'size',
      name: 'Size',
      type: 'size',
      default: { width: 512, height: 512, locked: false },
      sizeConstraints: { minWidth: 1, maxWidth: 8192, minHeight: 1, maxHeight: 8192, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const color = params.color as Color;
    const size = params.size as { width: number; height: number };
    const width = size.width;
    const height = size.height;

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
