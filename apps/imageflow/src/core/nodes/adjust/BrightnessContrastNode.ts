import { defineNode, ensureFloatImage } from '../defineNode';
import { isGPUTexture, isFloatImage, createFloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

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

    const brightness = (params.brightness as number) / 100;
    const contrast = (params.contrast as number) / 100;
    const preview = params.preview as boolean;

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      // Get or create input texture
      let inputTexture: GPUTexture;
      let needsInputRelease = false;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else if (isFloatImage(input)) {
        inputTexture = gpu.createTextureFromFloat(input);
        needsInputRelease = true;
      } else {
        inputTexture = gpu.createTexture(input as ImageData);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;

      // Create output texture
      const outputTexture = gpu.createEmptyTexture(width, height);

      // Render
      gpu.renderToTexture('brightness_contrast', {
        u_texture: inputTexture.texture,
        u_brightness: brightness,
        u_contrast: contrast,
      }, outputTexture);

      // Release input if we created it
      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      // Return GPU texture or download based on preview setting
      if (preview) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        return { image: result };
      }

      return { image: outputTexture };
    }

    // CPU fallback
    const inputImage = ensureFloatImage(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const { width, height, data: srcData } = inputImage;
    const outputImage = createFloatImage(width, height);
    const data = outputImage.data;

    const contrastFactor = contrast >= 0 ? 1 + contrast * 2 : 1 + contrast;

    for (let i = 0; i < srcData.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let value = srcData[i + c];
        value += brightness;
        value = (value - 0.5) * contrastFactor + 0.5;
        data[i + c] = Math.max(0, Math.min(1, value));
      }
      data[i + 3] = srcData[i + 3]; // preserve alpha
    }

    return { image: outputImage };
  },
});
