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
    const file = params.file as File | string | null;
    console.log('ImageInputNode execute - file:', file);

    if (!file) {
      // Return transparent 1x1 image as placeholder
      console.log('ImageInputNode - no file, returning 1x1 placeholder');
      const imageData = new ImageData(1, 1);
      return { image: imageData };
    }

    // If file is a File object, read it
    if (file instanceof File) {
      console.log('ImageInputNode - loading File:', file.name, file.type, file.size);
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

        reader.readAsDataURL(file);
      });
    }

    // If file is a data URL string
    if (typeof file === 'string' && file.startsWith('data:')) {
      console.log('ImageInputNode - loading from data URL, length:', file.length);
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

        img.src = file;
      });
    }

    // Placeholder
    const imageData = new ImageData(1, 1);
    return { image: imageData };
  },
});
