import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

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
    {
      id: 'preview',
      name: 'Preview',
      type: 'boolean',
      default: false,
      description: 'Show preview (downloads from GPU)',
    },
  ],

  async execute(inputs, params, context) {
    const input = inputs.image as ImageData | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    const { redSource, greenSource, blueSource, alphaSource } = params as {
      redSource: string;
      greenSource: string;
      blueSource: string;
      alphaSource: string;
    };
    const preview = params.preview as boolean;

    // Map channel names to indices
    const channelMap: Record<string, number> = {
      red: 0,
      green: 1,
      blue: 2,
      alpha: 3,
      zero: 4,
      one: 5,
    };

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      let inputTexture: GPUTexture;
      let needsInputRelease = false;
      // Preserve transform from input FloatImage (GPU textures can't store transform)
      let inputTransform: import('../../../types/data').Transform2D | undefined;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else if (isFloatImage(input)) {
        inputTexture = gpu.createTextureFromFloat(input);
        inputTransform = input.transform;
        needsInputRelease = true;
      } else {
        inputTexture = gpu.createTexture(input as ImageData);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('channel_reorder', {
        u_texture: inputTexture.texture,
        u_channelMap: [
          channelMap[redSource],
          channelMap[greenSource],
          channelMap[blueSource],
          channelMap[alphaSource],
        ],
      }, outputTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      // If input had transform, we must download to preserve it (GPUTexture can't store transform)
      if (preview || inputTransform) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        if (inputTransform) {
          result.transform = inputTransform;
        }
        return { image: result };
      }

      return { image: outputTexture };
    }

    // CPU fallback
    const image = ensureFloatImage(input, context);
    if (!image) {
      return { image: null };
    }

    const result = createFloatImage(image.width, image.height);
    const src = image.data;
    const dst = result.data;

    const getChannelValue = (i: number, channel: string): number => {
      switch (channel) {
        case 'red': return src[i];
        case 'green': return src[i + 1];
        case 'blue': return src[i + 2];
        case 'alpha': return src[i + 3];
        case 'zero': return 0;
        case 'one': return 1;
        default: return 0;
      }
    };

    const totalPixels = image.width * image.height;

    for (let p = 0; p < totalPixels; p++) {
      const i = p * 4;

      dst[i] = getChannelValue(i, redSource);
      dst[i + 1] = getChannelValue(i, greenSource);
      dst[i + 2] = getChannelValue(i, blueSource);
      dst[i + 3] = getChannelValue(i, alphaSource);
    }

    if (image.transform) {
      result.transform = image.transform;
    }
    return { image: result };
  },
});
