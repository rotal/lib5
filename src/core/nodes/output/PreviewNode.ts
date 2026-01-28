import { defineNode } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

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
    const input = inputs.image as ImageData | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    // If GPU texture, download to ImageData for preview rendering
    if (isGPUTexture(input)) {
      if (!context.gpu) {
        throw new Error('GPU context required to download texture');
      }
      const imageData = context.gpu.downloadTexture(input);
      return { image: imageData };
    }

    // Pass through ImageData
    return { image: input };
  },
});
