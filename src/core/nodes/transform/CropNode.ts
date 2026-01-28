import { defineNode, ensureImageData } from '../defineNode';

export const CropNode = defineNode({
  type: 'transform/crop',
  category: 'Transform',
  name: 'Crop',
  description: 'Crop image to specified region',
  icon: 'crop',

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
      id: 'mode',
      name: 'Mode',
      type: 'select',
      default: 'absolute',
      options: [
        { label: 'Absolute', value: 'absolute' },
        { label: 'Percentage', value: 'percentage' },
        { label: 'Aspect Ratio', value: 'aspect' },
      ],
    },
    {
      id: 'x',
      name: 'X',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 8192, step: 1 },
    },
    {
      id: 'y',
      name: 'Y',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 8192, step: 1 },
    },
    {
      id: 'width',
      name: 'Width',
      type: 'number',
      default: 100,
      constraints: { min: 1, max: 8192, step: 1 },
    },
    {
      id: 'height',
      name: 'Height',
      type: 'number',
      default: 100,
      constraints: { min: 1, max: 8192, step: 1 },
    },
    {
      id: 'aspectWidth',
      name: 'Aspect Width',
      type: 'number',
      default: 16,
      constraints: { min: 1, max: 100, step: 1 },
      description: 'Aspect ratio width (for aspect mode)',
    },
    {
      id: 'aspectHeight',
      name: 'Aspect Height',
      type: 'number',
      default: 9,
      constraints: { min: 1, max: 100, step: 1 },
      description: 'Aspect ratio height (for aspect mode)',
    },
    {
      id: 'center',
      name: 'Center Crop',
      type: 'boolean',
      default: true,
      description: 'Center the crop region (for aspect mode)',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = ensureImageData(inputs.image, context);

    if (!inputImage) {
      return { image: null };
    }

    const mode = params.mode as string;
    let x = params.x as number;
    let y = params.y as number;
    let cropWidth = params.width as number;
    let cropHeight = params.height as number;
    const aspectW = params.aspectWidth as number;
    const aspectH = params.aspectHeight as number;
    const center = params.center as boolean;

    const srcW = inputImage.width;
    const srcH = inputImage.height;

    if (mode === 'percentage') {
      x = Math.round((x / 100) * srcW);
      y = Math.round((y / 100) * srcH);
      cropWidth = Math.round((cropWidth / 100) * srcW);
      cropHeight = Math.round((cropHeight / 100) * srcH);
    } else if (mode === 'aspect') {
      const targetAspect = aspectW / aspectH;
      const srcAspect = srcW / srcH;

      if (srcAspect > targetAspect) {
        // Image is wider - crop width
        cropHeight = srcH;
        cropWidth = Math.round(srcH * targetAspect);
      } else {
        // Image is taller - crop height
        cropWidth = srcW;
        cropHeight = Math.round(srcW / targetAspect);
      }

      if (center) {
        x = Math.round((srcW - cropWidth) / 2);
        y = Math.round((srcH - cropHeight) / 2);
      } else {
        x = 0;
        y = 0;
      }
    }

    // Clamp values
    x = Math.max(0, Math.min(srcW - 1, x));
    y = Math.max(0, Math.min(srcH - 1, y));
    cropWidth = Math.max(1, Math.min(srcW - x, cropWidth));
    cropHeight = Math.max(1, Math.min(srcH - y, cropHeight));

    const outputImage = new ImageData(cropWidth, cropHeight);
    const srcData = inputImage.data;
    const dstData = outputImage.data;

    for (let dy = 0; dy < cropHeight; dy++) {
      for (let dx = 0; dx < cropWidth; dx++) {
        const srcIdx = ((y + dy) * srcW + (x + dx)) * 4;
        const dstIdx = (dy * cropWidth + dx) * 4;

        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }

    return { image: outputImage };
  },
});
