import { defineNode } from '../defineNode';

export const BrightnessContrastNode = defineNode({
  type: 'adjust/brightness-contrast',
  category: 'Adjust',
  name: 'Brightness/Contrast',
  description: 'Adjust image brightness and contrast',
  icon: 'brightness_6',

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
      id: 'brightness',
      name: 'Brightness',
      type: 'number',
      default: 0,
      constraints: { min: -100, max: 100, step: 1 },
    },
    {
      id: 'contrast',
      name: 'Contrast',
      type: 'number',
      default: 0,
      constraints: { min: -100, max: 100, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const brightness = (params.brightness as number) / 100;
    const contrast = (params.contrast as number) / 100;

    // Create output image
    const outputImage = new ImageData(
      new Uint8ClampedArray(inputImage.data),
      inputImage.width,
      inputImage.height
    );
    const data = outputImage.data;

    // Calculate contrast factor
    // contrast range: -1 to 1, we map to factor 0 to 2+
    const contrastFactor = contrast >= 0
      ? 1 + contrast * 2
      : 1 + contrast;

    // Apply brightness and contrast
    for (let i = 0; i < data.length; i += 4) {
      // Apply to RGB channels only, not alpha
      for (let c = 0; c < 3; c++) {
        let value = data[i + c];

        // Apply brightness (-255 to +255)
        value += brightness * 255;

        // Apply contrast (centered at 128)
        value = (value - 128) * contrastFactor + 128;

        // Clamp is handled by Uint8ClampedArray
        data[i + c] = value;
      }
    }

    return { image: outputImage };
  },
});
