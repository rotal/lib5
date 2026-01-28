import { defineNode, ensureFloatImage } from '../defineNode';
import { floatToImageData } from '../../../types/data';

export const AIRemoveBackgroundNode = defineNode({
  type: 'ai/remove-background',
  category: 'AI',
  name: 'Remove Background',
  description: 'Remove background from image using AI',
  icon: 'content_cut',

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
      description: 'Image with transparent background',
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
      description: 'Foreground mask',
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
    },
    {
      id: 'threshold',
      name: 'Edge Threshold',
      type: 'number',
      default: 50,
      constraints: { min: 0, max: 100, step: 1 },
      description: 'Threshold for edge detection (local mode)',
    },
    {
      id: 'feather',
      name: 'Edge Feather',
      type: 'number',
      default: 2,
      constraints: { min: 0, max: 20, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const inputFloatImage = ensureFloatImage(inputs.image, context);

    if (!inputFloatImage) {
      return { image: null, mask: null };
    }

    // Convert to ImageData for canvas operations
    const inputImage = floatToImageData(inputFloatImage);

    const provider = params.provider as string;
    const apiEndpoint = params.apiEndpoint as string;
    const apiKey = params.apiKey as string;
    const threshold = params.threshold as number;
    const feather = params.feather as number;

    context.reportProgress(0.1);

    if (provider === 'api' && apiEndpoint) {
      // REST API integration
      try {
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
            feather,
          }),
          signal: context.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        context.reportProgress(0.7);

        const result = await response.json();
        const resultImage = await base64ToImageData(result.image);
        const maskImage = result.mask ? await base64ToImageData(result.mask) : null;

        context.reportProgress(1);
        return { image: resultImage, mask: maskImage };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw error;
        }
        console.error('AI API error:', error);
        // Fall through to local processing
      }
    }

    // Local placeholder - simple color-based background removal
    // This is a very basic implementation for demonstration
    // Real implementation would use proper ML models
    const { width, height, data: srcData } = inputImage;
    const outputImage = new ImageData(width, height);
    const maskImage = new ImageData(width, height);
    const outData = outputImage.data;
    const maskData = maskImage.data;

    // Sample corners to estimate background color
    const corners = [
      0, // top-left
      (width - 1) * 4, // top-right
      ((height - 1) * width) * 4, // bottom-left
      ((height - 1) * width + width - 1) * 4, // bottom-right
    ];

    let bgR = 0, bgG = 0, bgB = 0;
    for (const idx of corners) {
      bgR += srcData[idx];
      bgG += srcData[idx + 1];
      bgB += srcData[idx + 2];
    }
    bgR /= 4;
    bgG /= 4;
    bgB /= 4;

    context.reportProgress(0.3);

    // Calculate color distance threshold
    const colorThreshold = (255 * threshold) / 100;

    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i];
      const g = srcData[i + 1];
      const b = srcData[i + 2];

      // Calculate color distance from background
      const distance = Math.sqrt(
        (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2
      );

      // Determine alpha based on distance
      let alpha: number;
      if (distance < colorThreshold) {
        alpha = 0;
      } else if (distance < colorThreshold + 50) {
        alpha = ((distance - colorThreshold) / 50) * 255;
      } else {
        alpha = 255;
      }

      // Apply to output
      outData[i] = r;
      outData[i + 1] = g;
      outData[i + 2] = b;
      outData[i + 3] = Math.round(alpha);

      // Create mask
      const maskVal = Math.round(alpha);
      maskData[i] = maskVal;
      maskData[i + 1] = maskVal;
      maskData[i + 2] = maskVal;
      maskData[i + 3] = 255;
    }

    context.reportProgress(0.7);

    // Apply feathering to mask and output alpha
    if (feather > 0) {
      const radius = feather;
      const sigma = radius / 3;
      const kernelSize = radius * 2 + 1;
      const kernel = new Float32Array(kernelSize);
      let sum = 0;

      for (let k = 0; k < kernelSize; k++) {
        const x = k - radius;
        kernel[k] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += kernel[k];
      }
      for (let k = 0; k < kernelSize; k++) {
        kernel[k] /= sum;
      }

      // Horizontal pass
      const tempAlpha = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          for (let k = -radius; k <= radius; k++) {
            const sx = Math.max(0, Math.min(width - 1, x + k));
            const idx = (y * width + sx) * 4;
            value += outData[idx + 3] * kernel[k + radius];
          }
          tempAlpha[y * width + x] = value;
        }
      }

      // Vertical pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          for (let k = -radius; k <= radius; k++) {
            const sy = Math.max(0, Math.min(height - 1, y + k));
            value += tempAlpha[sy * width + x] * kernel[k + radius];
          }
          const idx = (y * width + x) * 4;
          outData[idx + 3] = Math.round(value);
          maskData[idx] = Math.round(value);
          maskData[idx + 1] = Math.round(value);
          maskData[idx + 2] = Math.round(value);
        }
      }
    }

    context.reportProgress(1);
    return { image: outputImage, mask: maskImage };
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
