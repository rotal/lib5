import { defineNode, ensureFloatImage } from '../defineNode';
import { floatToImageData } from '../../../types/data';

export const AIEnhanceNode = defineNode({
  type: 'ai/enhance',
  category: 'AI',
  name: 'AI Enhance',
  description: 'Enhance image quality using AI (upscale, denoise, sharpen)',
  icon: 'auto_awesome',

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
      id: 'provider',
      name: 'Provider',
      type: 'select',
      default: 'local',
      options: [
        { label: 'Local (Placeholder)', value: 'local' },
        { label: 'REST API', value: 'api' },
      ],
    },
    {
      id: 'apiEndpoint',
      name: 'API Endpoint',
      type: 'string',
      default: '',
      description: 'REST API endpoint URL',
    },
    {
      id: 'apiKey',
      name: 'API Key',
      type: 'string',
      default: '',
      description: 'API authentication key',
    },
    {
      id: 'upscale',
      name: 'Upscale Factor',
      type: 'select',
      default: '1',
      options: [
        { label: '1x (No upscale)', value: '1' },
        { label: '2x', value: '2' },
        { label: '4x', value: '4' },
      ],
    },
    {
      id: 'denoise',
      name: 'Denoise',
      type: 'boolean',
      default: true,
    },
    {
      id: 'sharpen',
      name: 'Sharpen',
      type: 'boolean',
      default: true,
    },
  ],

  async execute(inputs, params, context) {
    const inputFloatImage = ensureFloatImage(inputs.image, context);

    if (!inputFloatImage) {
      return { image: null };
    }

    // Convert to ImageData for canvas operations
    const inputImage = floatToImageData(inputFloatImage);

    const provider = params.provider as string;
    const upscale = parseInt(params.upscale as string, 10);
    const denoise = params.denoise as boolean;
    const sharpen = params.sharpen as boolean;
    const apiEndpoint = params.apiEndpoint as string;
    const apiKey = params.apiKey as string;

    context.reportProgress(0.1);

    if (provider === 'api' && apiEndpoint) {
      // REST API integration
      try {
        // Convert image to base64
        const canvas = new OffscreenCanvas(inputImage.width, inputImage.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        ctx.putImageData(inputImage, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const base64 = await blobToBase64(blob);

        context.reportProgress(0.3);

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            image: base64,
            upscale,
            denoise,
            sharpen,
          }),
          signal: context.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        context.reportProgress(0.7);

        const result = await response.json();
        const resultImage = await base64ToImageData(result.image);

        context.reportProgress(1);
        return { image: resultImage };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw error;
        }
        console.error('AI API error:', error);
        // Fall through to local processing
      }
    }

    // Local placeholder - just do basic upscale with bilinear interpolation
    // In a real implementation, this would use transformers.js or similar
    const srcW = inputImage.width;
    const srcH = inputImage.height;
    const dstW = srcW * upscale;
    const dstH = srcH * upscale;

    const outputImage = new ImageData(dstW, dstH);
    const srcData = inputImage.data;
    const dstData = outputImage.data;

    context.reportProgress(0.3);

    // Bilinear upscale
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const srcX = (x / upscale);
        const srcY = (y / upscale);

        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const fx = srcX - x0;
        const fy = srcY - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;
        const dstIdx = (y * dstW + x) * 4;

        for (let c = 0; c < 4; c++) {
          const v00 = srcData[idx00 + c];
          const v10 = srcData[idx10 + c];
          const v01 = srcData[idx01 + c];
          const v11 = srcData[idx11 + c];

          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;
          dstData[dstIdx + c] = Math.round(v0 * (1 - fy) + v1 * fy);
        }
      }

      if (y % 100 === 0) {
        context.reportProgress(0.3 + (y / dstH) * 0.5);
      }
    }

    context.reportProgress(0.8);

    // Simple sharpening if enabled
    if (sharpen && upscale > 1) {
      // Apply simple unsharp mask
      const amount = 0.3;
      const tempData = new Uint8ClampedArray(dstData);

      for (let y = 1; y < dstH - 1; y++) {
        for (let x = 1; x < dstW - 1; x++) {
          const idx = (y * dstW + x) * 4;

          for (let c = 0; c < 3; c++) {
            const neighbors =
              tempData[((y - 1) * dstW + x) * 4 + c] +
              tempData[((y + 1) * dstW + x) * 4 + c] +
              tempData[(y * dstW + x - 1) * 4 + c] +
              tempData[(y * dstW + x + 1) * 4 + c];
            const avg = neighbors / 4;
            const diff = tempData[idx + c] - avg;
            dstData[idx + c] = Math.max(0, Math.min(255,
              Math.round(tempData[idx + c] + diff * amount)
            ));
          }
        }
      }
    }

    context.reportProgress(1);
    return { image: outputImage };
  },
});

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function base64ToImageData(base64: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/png;base64,${base64}`;
  });
}
