import { defineNode } from '../defineNode';

export const PreviewNode = defineNode({
  type: 'output/preview',
  category: 'Output',
  name: 'Preview',
  description: 'Display image in preview viewport',
  icon: 'visibility',

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
      description: 'Pass-through of the input image',
    },
  ],

  parameters: [
    {
      id: 'label',
      name: 'Label',
      type: 'string',
      default: 'Preview',
      description: 'Label to display in the preview viewport',
    },
    {
      id: 'showInfo',
      name: 'Show Info',
      type: 'boolean',
      default: true,
      description: 'Show image dimensions and color info',
    },
  ],

  async execute(inputs, params, context) {
    const image = inputs.image as ImageData | null;

    if (!image) {
      return { image: null };
    }

    // Just pass through the image
    // The preview viewport will read this node's output
    return { image };
  },
});
