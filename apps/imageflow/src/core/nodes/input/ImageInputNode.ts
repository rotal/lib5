import { defineNode } from '../defineNode';

export const ImageInputNode = defineNode({
  type: 'input/image',
  category: 'Input',
  name: 'Image Input',
  description: 'Load an image from file',
  icon: 'image',

  inputs: [],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
  ],

  parameters: [
    {
      id: 'file',
      name: 'File',
      type: 'file',
      default: null,
      accept: 'image/*',
      description: 'Select an image file to load',
    },
  ],

  async execute(inputs, params, context) {
    const fileParam = params.file as File | string | { dataUrl: string; filename: string } | null;
    console.log('ImageInputNode execute - file:', fileParam);

    if (!fileParam) {
      // Return transparent 1x1 image as placeholder
      console.log('ImageInputNode - no file, returning 1x1 placeholder');
      const imageData = new ImageData(1, 1);
      return { image: imageData };
    }

    // If file is a File object, read it
    if (fileParam instanceof File) {
      console.log('ImageInputNode - loading File:', fileParam.name, fileParam.type, fileParam.size);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          console.log('ImageInputNode - FileReader loaded, creating Image');
          const img = new Image();

          img.onload = () => {
            console.log('ImageInputNode - Image loaded:', img.width, 'x', img.height);
            // Create canvas to get ImageData
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Failed to get canvas context'));
              return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            console.log('ImageInputNode - ImageData created:', imageData.width, 'x', imageData.height);

            resolve({ image: imageData });
          };

          img.onerror = (e) => {
            console.error('ImageInputNode - Image load error:', e);
            reject(new Error('Failed to load image'));
          };

          img.src = reader.result as string;
        };

        reader.onerror = (e) => {
          console.error('ImageInputNode - FileReader error:', e);
          reject(new Error('Failed to read file'));
        };

        reader.readAsDataURL(fileParam);
      });
    }

    // Extract data URL from either string or object format
    let dataUrl: string | null = null;
    let filename: string | null = null;

    if (typeof fileParam === 'string' && fileParam.startsWith('data:')) {
      dataUrl = fileParam;
    } else if (typeof fileParam === 'object' && fileParam.dataUrl?.startsWith('data:')) {
      dataUrl = fileParam.dataUrl;
      filename = fileParam.filename || null;
    }

    // If we have a data URL, load it
    if (dataUrl) {
      console.log('ImageInputNode - loading from data URL, length:', dataUrl.length, 'filename:', filename);
      return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
          console.log('ImageInputNode - data URL image loaded:', img.width, 'x', img.height);
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          console.log('ImageInputNode - ImageData from data URL:', imageData.width, 'x', imageData.height);

          resolve({ image: imageData });
        };

        img.onerror = (e) => {
          console.error('ImageInputNode - data URL image error:', e);
          reject(new Error('Failed to load image from data URL'));
        };

        img.src = dataUrl;
      });
    }

    // Placeholder
    const imageData = new ImageData(1, 1);
    return { image: imageData };
  },
});
