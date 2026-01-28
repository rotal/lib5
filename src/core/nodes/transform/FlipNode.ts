import { defineNode } from '../defineNode';

export const FlipNode = defineNode({
  type: 'transform/flip',
  category: 'Transform',
  name: 'Flip',
  description: 'Flip image horizontally or vertically',
  icon: 'flip',

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
      id: 'horizontal',
      name: 'Horizontal',
      type: 'boolean',
      default: false,
      description: 'Flip horizontally (mirror)',
    },
    {
      id: 'vertical',
      name: 'Vertical',
      type: 'boolean',
      default: false,
      description: 'Flip vertically',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const horizontal = params.horizontal as boolean;
    const vertical = params.vertical as boolean;

    if (!horizontal && !vertical) {
      // No flip - return copy
      return {
        image: new ImageData(
          new Uint8ClampedArray(inputImage.data),
          inputImage.width,
          inputImage.height
        ),
      };
    }

    const { width, height } = inputImage;
    const srcData = inputImage.data;
    const outputImage = new ImageData(width, height);
    const dstData = outputImage.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = horizontal ? width - 1 - x : x;
        const srcY = vertical ? height - 1 - y : y;

        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * width + x) * 4;

        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }

    return { image: outputImage };
  },
});
