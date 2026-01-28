import { defineNode } from '../defineNode';

export const ApplyMaskNode = defineNode({
  type: 'mask/apply',
  category: 'Mask',
  name: 'Apply Mask',
  description: 'Apply mask to image alpha channel',
  icon: 'photo_filter',

  inputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
      required: true,
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
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
      id: 'mode',
      name: 'Mode',
      type: 'select',
      default: 'multiply',
      options: [
        { label: 'Replace Alpha', value: 'replace' },
        { label: 'Multiply Alpha', value: 'multiply' },
        { label: 'Add Alpha', value: 'add' },
        { label: 'Subtract Alpha', value: 'subtract' },
      ],
    },
    {
      id: 'invert',
      name: 'Invert Mask',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;
    const maskImage = inputs.mask as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    if (!maskImage) {
      return {
        image: new ImageData(
          new Uint8ClampedArray(inputImage.data),
          inputImage.width,
          inputImage.height
        ),
      };
    }

    const mode = params.mode as string;
    const invert = params.invert as boolean;

    const { width, height } = inputImage;
    const outputImage = new ImageData(width, height);
    const srcData = inputImage.data;
    const maskData = maskImage.data;
    const outData = outputImage.data;

    const maskW = maskImage.width;
    const maskH = maskImage.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;

        // Copy RGB
        outData[srcIdx] = srcData[srcIdx];
        outData[srcIdx + 1] = srcData[srcIdx + 1];
        outData[srcIdx + 2] = srcData[srcIdx + 2];

        // Get mask value (use nearest if sizes don't match)
        let maskValue: number;
        if (x < maskW && y < maskH) {
          const maskIdx = (y * maskW + x) * 4;
          maskValue = maskData[maskIdx]; // Use red channel as grayscale
        } else {
          maskValue = 0;
        }

        if (invert) {
          maskValue = 255 - maskValue;
        }

        // Apply mask to alpha
        const srcAlpha = srcData[srcIdx + 3];
        let newAlpha: number;

        switch (mode) {
          case 'replace':
            newAlpha = maskValue;
            break;
          case 'multiply':
            newAlpha = Math.round((srcAlpha * maskValue) / 255);
            break;
          case 'add':
            newAlpha = Math.min(255, srcAlpha + maskValue);
            break;
          case 'subtract':
            newAlpha = Math.max(0, srcAlpha - maskValue);
            break;
          default:
            newAlpha = srcAlpha;
        }

        outData[srcIdx + 3] = newAlpha;
      }
    }

    return { image: outputImage };
  },
});
