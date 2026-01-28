import { defineNode, ensureImageData } from '../defineNode';

export const AICustomNode = defineNode({
  type: 'ai/custom',
  category: 'AI',
  name: 'Custom AI',
  description: 'Connect to a custom AI endpoint with configurable input/output mapping',
  icon: 'smart_toy',

  inputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
      required: false,
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
      required: false,
    },
  ],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
    },
  ],

  parameters: [
    {
      id: 'endpoint',
      name: 'Endpoint URL',
      type: 'string',
      default: '',
      description: 'The API endpoint URL',
    },
    {
      id: 'method',
      name: 'HTTP Method',
      type: 'select',
      default: 'POST',
      options: [
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
      ],
    },
    {
      id: 'apiKey',
      name: 'API Key',
      type: 'string',
      default: '',
    },
    {
      id: 'authHeader',
      name: 'Auth Header',
      type: 'select',
      default: 'Authorization',
      options: [
        { label: 'Authorization: Bearer', value: 'Authorization' },
        { label: 'X-API-Key', value: 'X-API-Key' },
        { label: 'api-key', value: 'api-key' },
      ],
    },
    {
      id: 'imageInputKey',
      name: 'Image Input Key',
      type: 'string',
      default: 'image',
      description: 'JSON key for the input image (base64)',
    },
    {
      id: 'maskInputKey',
      name: 'Mask Input Key',
      type: 'string',
      default: 'mask',
      description: 'JSON key for the input mask (base64)',
    },
    {
      id: 'imageOutputKey',
      name: 'Image Output Key',
      type: 'string',
      default: 'image',
      description: 'JSON key for the output image (base64)',
    },
    {
      id: 'maskOutputKey',
      name: 'Mask Output Key',
      type: 'string',
      default: 'mask',
      description: 'JSON key for the output mask (base64)',
    },
    {
      id: 'prompt',
      name: 'Prompt',
      type: 'string',
      default: '',
      description: 'Text prompt to send with request',
    },
    {
      id: 'promptKey',
      name: 'Prompt Key',
      type: 'string',
      default: 'prompt',
      description: 'JSON key for the prompt',
    },
    {
      id: 'extraParams',
      name: 'Extra Parameters',
      type: 'string',
      default: '{}',
      description: 'Additional JSON parameters to include',
    },
  ],

  async execute(inputs, params, context) {
    const inputImage = ensureImageData(inputs.image, context);
    const inputMask = ensureImageData(inputs.mask, context);

    const endpoint = params.endpoint as string;
    const method = params.method as string;
    const apiKey = params.apiKey as string;
    const authHeader = params.authHeader as string;
    const imageInputKey = params.imageInputKey as string;
    const maskInputKey = params.maskInputKey as string;
    const imageOutputKey = params.imageOutputKey as string;
    const maskOutputKey = params.maskOutputKey as string;
    const prompt = params.prompt as string;
    const promptKey = params.promptKey as string;
    const extraParams = params.extraParams as string;

    if (!endpoint) {
      throw new Error('No endpoint URL configured');
    }

    context.reportProgress(0.1);

    // Build request body
    const body: Record<string, unknown> = {};

    // Add extra params
    try {
      const extra = JSON.parse(extraParams);
      Object.assign(body, extra);
    } catch {
      // Ignore invalid JSON
    }

    // Add prompt if provided
    if (prompt && promptKey) {
      body[promptKey] = prompt;
    }

    // Add image as base64
    if (inputImage && imageInputKey) {
      const base64 = await imageDataToBase64(inputImage);
      body[imageInputKey] = base64;
    }

    // Add mask as base64
    if (inputMask && maskInputKey) {
      const base64 = await imageDataToBase64(inputMask);
      body[maskInputKey] = base64;
    }

    context.reportProgress(0.3);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      if (authHeader === 'Authorization') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else {
        headers[authHeader] = apiKey;
      }
    }

    // Make request
    const response = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: context.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    context.reportProgress(0.7);

    const result = await response.json();

    // Extract outputs
    let outputImage: ImageData | null = null;
    let outputMask: ImageData | null = null;

    // Support nested keys like "data.image"
    const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
    };

    const imageBase64 = getNestedValue(result, imageOutputKey);
    if (typeof imageBase64 === 'string' && imageBase64) {
      outputImage = await base64ToImageData(imageBase64);
    }

    const maskBase64 = getNestedValue(result, maskOutputKey);
    if (typeof maskBase64 === 'string' && maskBase64) {
      outputMask = await base64ToImageData(maskBase64);
    }

    context.reportProgress(1);

    return {
      image: outputImage,
      mask: outputMask,
    };
  },
});

async function imageDataToBase64(imageData: ImageData): Promise<string> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });

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
  // Handle data URLs
  const src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;

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
    img.onerror = () => reject(new Error('Failed to load image from base64'));
    img.src = src;
  });
}
