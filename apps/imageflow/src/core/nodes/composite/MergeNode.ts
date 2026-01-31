import { defineNode, ensureFloatImage } from '../defineNode';
import { FloatImage, createFloatImage, cloneFloatImage } from '../../../types/data';

export const MergeNode = defineNode({
  type: 'composite/merge',
  category: 'Composite',
  name: 'Merge',
  description: 'Merge multiple images into one',
  icon: 'merge',
  hasLocalTransform: true,

  inputs: [
    {
      id: 'image1',
      name: 'Image 1',
      dataType: 'image',
      required: false,
    },
    {
      id: 'image2',
      name: 'Image 2',
      dataType: 'image',
      required: false,
    },
    {
      id: 'image3',
      name: 'Image 3',
      dataType: 'image',
      required: false,
    },
    {
      id: 'image4',
      name: 'Image 4',
      dataType: 'image',
      required: false,
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
      id: 'operation',
      name: 'Operation',
      type: 'select',
      default: 'over',
      options: [
        { label: 'Over (Stack)', value: 'over' },
        { label: 'Add', value: 'add' },
        { label: 'Average', value: 'average' },
        { label: 'Maximum', value: 'max' },
        { label: 'Minimum', value: 'min' },
      ],
    },
    {
      id: 'backgroundColor',
      name: 'Background',
      type: 'color',
      default: { r: 0, g: 0, b: 0, a: 0 },
    },
  ],

  async execute(inputs, params, context) {
    const images = [
      ensureFloatImage(inputs.image1, context),
      ensureFloatImage(inputs.image2, context),
      ensureFloatImage(inputs.image3, context),
      ensureFloatImage(inputs.image4, context),
    ].filter(Boolean) as FloatImage[];

    if (images.length === 0) {
      return { image: null };
    }

    if (images.length === 1) {
      return { image: cloneFloatImage(images[0]) };
    }

    const operation = params.operation as string;
    const bg = params.backgroundColor as { r: number; g: number; b: number; a: number };

    // Determine output dimensions (max of all inputs)
    let maxWidth = 0;
    let maxHeight = 0;
    for (const img of images) {
      maxWidth = Math.max(maxWidth, img.width);
      maxHeight = Math.max(maxHeight, img.height);
    }

    const outputImage = createFloatImage(maxWidth, maxHeight);
    const outData = outputImage.data;

    // Initialize with background color (already 0.0-1.0)
    for (let i = 0; i < outData.length; i += 4) {
      outData[i] = bg.r;
      outData[i + 1] = bg.g;
      outData[i + 2] = bg.b;
      outData[i + 3] = bg.a;
    }

    // Process based on operation (all values in 0.0-1.0 range)
    if (operation === 'over') {
      // Stack images on top of each other
      for (const img of images) {
        const srcData = img.data;
        const srcW = img.width;
        const srcH = img.height;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const dstIdx = (y * maxWidth + x) * 4;

            const srcA = srcData[srcIdx + 3];
            const dstA = outData[dstIdx + 3];

            // Porter-Duff "over" operation
            const outA = srcA + dstA * (1 - srcA);

            if (outA > 0) {
              outData[dstIdx] = (srcData[srcIdx] * srcA + outData[dstIdx] * dstA * (1 - srcA)) / outA;
              outData[dstIdx + 1] = (srcData[srcIdx + 1] * srcA + outData[dstIdx + 1] * dstA * (1 - srcA)) / outA;
              outData[dstIdx + 2] = (srcData[srcIdx + 2] * srcA + outData[dstIdx + 2] * dstA * (1 - srcA)) / outA;
              outData[dstIdx + 3] = outA;
            }
          }
        }
      }
    } else if (operation === 'add') {
      for (const img of images) {
        const srcData = img.data;
        const srcW = img.width;
        const srcH = img.height;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const dstIdx = (y * maxWidth + x) * 4;

            outData[dstIdx] = Math.min(1, outData[dstIdx] + srcData[srcIdx]);
            outData[dstIdx + 1] = Math.min(1, outData[dstIdx + 1] + srcData[srcIdx + 1]);
            outData[dstIdx + 2] = Math.min(1, outData[dstIdx + 2] + srcData[srcIdx + 2]);
            outData[dstIdx + 3] = Math.min(1, outData[dstIdx + 3] + srcData[srcIdx + 3]);
          }
        }
      }
    } else if (operation === 'average') {
      // Sum all values
      const sumR = new Float32Array(maxWidth * maxHeight);
      const sumG = new Float32Array(maxWidth * maxHeight);
      const sumB = new Float32Array(maxWidth * maxHeight);
      const sumA = new Float32Array(maxWidth * maxHeight);
      const count = new Uint8Array(maxWidth * maxHeight);

      for (const img of images) {
        const srcData = img.data;
        const srcW = img.width;
        const srcH = img.height;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const idx = y * maxWidth + x;

            sumR[idx] += srcData[srcIdx];
            sumG[idx] += srcData[srcIdx + 1];
            sumB[idx] += srcData[srcIdx + 2];
            sumA[idx] += srcData[srcIdx + 3];
            count[idx]++;
          }
        }
      }

      for (let i = 0; i < count.length; i++) {
        if (count[i] > 0) {
          const dstIdx = i * 4;
          outData[dstIdx] = sumR[i] / count[i];
          outData[dstIdx + 1] = sumG[i] / count[i];
          outData[dstIdx + 2] = sumB[i] / count[i];
          outData[dstIdx + 3] = sumA[i] / count[i];
        }
      }
    } else if (operation === 'max') {
      for (const img of images) {
        const srcData = img.data;
        const srcW = img.width;
        const srcH = img.height;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const dstIdx = (y * maxWidth + x) * 4;

            outData[dstIdx] = Math.max(outData[dstIdx], srcData[srcIdx]);
            outData[dstIdx + 1] = Math.max(outData[dstIdx + 1], srcData[srcIdx + 1]);
            outData[dstIdx + 2] = Math.max(outData[dstIdx + 2], srcData[srcIdx + 2]);
            outData[dstIdx + 3] = Math.max(outData[dstIdx + 3], srcData[srcIdx + 3]);
          }
        }
      }
    } else if (operation === 'min') {
      // Initialize to max for min operation
      outData.fill(1);

      for (const img of images) {
        const srcData = img.data;
        const srcW = img.width;
        const srcH = img.height;

        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const dstIdx = (y * maxWidth + x) * 4;

            outData[dstIdx] = Math.min(outData[dstIdx], srcData[srcIdx]);
            outData[dstIdx + 1] = Math.min(outData[dstIdx + 1], srcData[srcIdx + 1]);
            outData[dstIdx + 2] = Math.min(outData[dstIdx + 2], srcData[srcIdx + 2]);
            outData[dstIdx + 3] = Math.min(outData[dstIdx + 3], srcData[srcIdx + 3]);
          }
        }
      }
    }

    return { image: outputImage };
  },
});
