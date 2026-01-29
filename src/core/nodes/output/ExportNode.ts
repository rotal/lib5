import { defineNode } from '../defineNode';
import { floatToImageData } from '../../../types/data';

export const ExportNode = defineNode({
  type: 'output/export',
  category: 'Output',
  name: 'Export',
  description: 'Export image to file (PNG, JPEG, WebP)',
  icon: 'download',

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
      id: 'filename',
      name: 'Filename',
      type: 'string',
      default: 'output',
      description: 'Name of the exported file (without extension)',
    },
    {
      id: 'format',
      name: 'Format',
      type: 'select',
      default: 'png',
      options: [
        { label: 'PNG', value: 'png' },
        { label: 'JPEG', value: 'jpeg' },
        { label: 'WebP', value: 'webp' },
      ],
    },
    {
      id: 'quality',
      name: 'Quality',
      type: 'number',
      default: 90,
      constraints: { min: 1, max: 100, step: 1 },
      description: 'Quality for JPEG/WebP (1-100)',
    },
  ],

  async execute(inputs, params) {
    const input = inputs.image;
    const filename = params.filename as string;
    const format = params.format as 'png' | 'jpeg' | 'webp';
    const quality = (params.quality as number) / 100;

    if (!input) {
      return {};
    }

    // Convert to ImageData for canvas
    let image: ImageData;
    if (input instanceof ImageData) {
      image = input;
    } else if (typeof input === 'object' && input !== null && 'data' in input && (input as { data: unknown }).data instanceof Float32Array) {
      image = floatToImageData(input as Parameters<typeof floatToImageData>[0]);
    } else {
      return {};
    }

    // Create canvas and draw image
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.putImageData(image, 0, 0);

    // Convert to blob
    const mimeType = `image/${format}`;
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: format === 'png' ? undefined : quality,
    });

    // Create blob URL for download
    const blobUrl = URL.createObjectURL(blob);

    // Return image passthrough + download data
    return {
      image: input,
      _downloadData: JSON.stringify({
        url: blobUrl,
        filename: `${filename}.${format}`,
      }),
    };
  },
});
