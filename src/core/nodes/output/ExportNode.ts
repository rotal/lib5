import { defineNode } from '../defineNode';

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

  outputs: [],

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
    {
      id: 'autoDownload',
      name: 'Auto Download',
      type: 'boolean',
      default: false,
      description: 'Automatically trigger download on execution',
    },
  ],

  async execute(inputs, params, context) {
    const image = inputs.image as ImageData | null;
    const filename = params.filename as string;
    const format = params.format as 'png' | 'jpeg' | 'webp';
    const quality = (params.quality as number) / 100;
    const autoDownload = params.autoDownload as boolean;

    if (!image) {
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

    // Auto download if enabled
    if (autoDownload && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Store blob URL in cache for manual download
    const blobUrl = URL.createObjectURL(blob);
    context.setCache('exportUrl', blobUrl as unknown as ImageData);
    context.setCache('exportBlob', blob as unknown as ImageData);

    return {};
  },
});
