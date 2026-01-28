import { defineNode, ensureImageData } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

export const SplitChannelsNode = defineNode({
  type: 'utility/split-channels',
  category: 'Utility',
  name: 'Split Channels',
  description: 'Split image into RGBA channels',
  icon: 'layers_clear',

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
      id: 'red',
      name: 'Red',
      dataType: 'mask',
    },
    {
      id: 'green',
      name: 'Green',
      dataType: 'mask',
    },
    {
      id: 'blue',
      name: 'Blue',
      dataType: 'mask',
    },
    {
      id: 'alpha',
      name: 'Alpha',
      dataType: 'mask',
    },
  ],

  parameters: [
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
      return { red: null, green: null, blue: null, alpha: null };
    }

    const preview = params.preview as boolean;

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      let inputTexture: GPUTexture;
      let needsInputRelease = false;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else {
        inputTexture = gpu.createTexture(input);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;

      // Create output textures for each channel
      const redTexture = gpu.createEmptyTexture(width, height);
      const greenTexture = gpu.createEmptyTexture(width, height);
      const blueTexture = gpu.createEmptyTexture(width, height);
      const alphaTexture = gpu.createEmptyTexture(width, height);

      // Extract each channel
      gpu.renderToTexture('channel_extract', {
        u_texture: inputTexture.texture,
        u_channel: 0,
      }, redTexture);

      gpu.renderToTexture('channel_extract', {
        u_texture: inputTexture.texture,
        u_channel: 1,
      }, greenTexture);

      gpu.renderToTexture('channel_extract', {
        u_texture: inputTexture.texture,
        u_channel: 2,
      }, blueTexture);

      gpu.renderToTexture('channel_extract', {
        u_texture: inputTexture.texture,
        u_channel: 3,
      }, alphaTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      if (preview) {
        const redResult = gpu.downloadTexture(redTexture);
        const greenResult = gpu.downloadTexture(greenTexture);
        const blueResult = gpu.downloadTexture(blueTexture);
        const alphaResult = gpu.downloadTexture(alphaTexture);
        gpu.releaseTexture(redTexture.id);
        gpu.releaseTexture(greenTexture.id);
        gpu.releaseTexture(blueTexture.id);
        gpu.releaseTexture(alphaTexture.id);
        return {
          red: redResult,
          green: greenResult,
          blue: blueResult,
          alpha: alphaResult,
        };
      }

      return {
        red: redTexture,
        green: greenTexture,
        blue: blueTexture,
        alpha: alphaTexture,
      };
    }

    // CPU fallback
    const inputImage = ensureImageData(input, context);
    if (!inputImage) {
      return { red: null, green: null, blue: null, alpha: null };
    }

    const { width, height, data: srcData } = inputImage;

    const redImage = new ImageData(width, height);
    const greenImage = new ImageData(width, height);
    const blueImage = new ImageData(width, height);
    const alphaImage = new ImageData(width, height);

    const redData = redImage.data;
    const greenData = greenImage.data;
    const blueData = blueImage.data;
    const alphaData = alphaImage.data;

    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];
      const a = srcData[i + 3];

      redData[i] = r;
      redData[i + 1] = r;
      redData[i + 2] = r;
      redData[i + 3] = 255;

      greenData[i] = g;
      greenData[i + 1] = g;
      greenData[i + 2] = g;
      greenData[i + 3] = 255;

      blueData[i] = b;
      blueData[i + 1] = b;
      blueData[i + 2] = b;
      blueData[i + 3] = 255;

      alphaData[i] = a;
      alphaData[i + 1] = a;
      alphaData[i + 2] = a;
      alphaData[i + 3] = 255;
    }

    return {
      red: redImage,
      green: greenImage,
      blue: blueImage,
      alpha: alphaImage,
    };
  },
});
