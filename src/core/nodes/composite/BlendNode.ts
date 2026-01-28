import { defineNode } from '../defineNode';

type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' |
  'colorDodge' | 'colorBurn' | 'hardLight' | 'softLight' | 'difference' | 'exclusion';

function blendPixel(
  baseR: number, baseG: number, baseB: number,
  blendR: number, blendG: number, blendB: number,
  mode: BlendMode
): [number, number, number] {
  const blend = (base: number, blend: number): number => {
    const b = base / 255;
    const l = blend / 255;

    let result: number;
    switch (mode) {
      case 'multiply':
        result = b * l;
        break;
      case 'screen':
        result = 1 - (1 - b) * (1 - l);
        break;
      case 'overlay':
        result = b < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l);
        break;
      case 'darken':
        result = Math.min(b, l);
        break;
      case 'lighten':
        result = Math.max(b, l);
        break;
      case 'colorDodge':
        result = l >= 1 ? 1 : Math.min(1, b / (1 - l));
        break;
      case 'colorBurn':
        result = l <= 0 ? 0 : Math.max(0, 1 - (1 - b) / l);
        break;
      case 'hardLight':
        result = l < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l);
        break;
      case 'softLight':
        if (l < 0.5) {
          result = b - (1 - 2 * l) * b * (1 - b);
        } else {
          const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
          result = b + (2 * l - 1) * (d - b);
        }
        break;
      case 'difference':
        result = Math.abs(b - l);
        break;
      case 'exclusion':
        result = b + l - 2 * b * l;
        break;
      case 'normal':
      default:
        result = l;
        break;
    }

    return Math.round(result * 255);
  };

  return [
    blend(baseR, blendR),
    blend(baseG, blendG),
    blend(baseB, blendB),
  ];
}

export const BlendNode = defineNode({
  type: 'composite/blend',
  category: 'Composite',
  name: 'Blend',
  description: 'Blend two images with various blend modes',
  icon: 'layers',

  inputs: [
    {
      id: 'base',
      name: 'Base',
      dataType: 'image',
      required: true,
      description: 'Background/base image',
    },
    {
      id: 'blend',
      name: 'Blend',
      dataType: 'image',
      required: true,
      description: 'Image to blend on top',
    },
    {
      id: 'mask',
      name: 'Mask',
      dataType: 'mask',
      required: false,
      description: 'Optional blend mask',
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
      name: 'Blend Mode',
      type: 'select',
      default: 'normal',
      options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Multiply', value: 'multiply' },
        { label: 'Screen', value: 'screen' },
        { label: 'Overlay', value: 'overlay' },
        { label: 'Darken', value: 'darken' },
        { label: 'Lighten', value: 'lighten' },
        { label: 'Color Dodge', value: 'colorDodge' },
        { label: 'Color Burn', value: 'colorBurn' },
        { label: 'Hard Light', value: 'hardLight' },
        { label: 'Soft Light', value: 'softLight' },
        { label: 'Difference', value: 'difference' },
        { label: 'Exclusion', value: 'exclusion' },
      ],
    },
    {
      id: 'opacity',
      name: 'Opacity',
      type: 'number',
      default: 100,
      constraints: { min: 0, max: 100, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const baseImage = inputs.base as ImageData | null;
    const blendImage = inputs.blend as ImageData | null;
    const maskImage = inputs.mask as ImageData | null;

    if (!baseImage) {
      return { image: blendImage || null };
    }

    if (!blendImage) {
      return {
        image: new ImageData(
          new Uint8ClampedArray(baseImage.data),
          baseImage.width,
          baseImage.height
        ),
      };
    }

    const mode = params.mode as BlendMode;
    const opacity = (params.opacity as number) / 100;

    // Use base dimensions as output
    const { width, height } = baseImage;
    const outputImage = new ImageData(width, height);
    const baseData = baseImage.data;
    const blendData = blendImage.data;
    const maskData = maskImage?.data;
    const outData = outputImage.data;

    const blendW = blendImage.width;
    const blendH = blendImage.height;
    const maskW = maskImage?.width || 0;
    const maskH = maskImage?.height || 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const baseIdx = (y * width + x) * 4;

        // Get base pixel
        const baseR = baseData[baseIdx];
        const baseG = baseData[baseIdx + 1];
        const baseB = baseData[baseIdx + 2];
        const baseA = baseData[baseIdx + 3];

        // Check if within blend image bounds
        if (x >= blendW || y >= blendH) {
          outData[baseIdx] = baseR;
          outData[baseIdx + 1] = baseG;
          outData[baseIdx + 2] = baseB;
          outData[baseIdx + 3] = baseA;
          continue;
        }

        const blendIdx = (y * blendW + x) * 4;
        const blendR = blendData[blendIdx];
        const blendG = blendData[blendIdx + 1];
        const blendB = blendData[blendIdx + 2];
        let blendA = blendData[blendIdx + 3] / 255;

        // Apply mask if present
        if (maskData && x < maskW && y < maskH) {
          const maskIdx = (y * maskW + x) * 4;
          blendA *= maskData[maskIdx] / 255;
        }

        // Apply opacity
        blendA *= opacity;

        // Blend colors
        const [resultR, resultG, resultB] = blendPixel(
          baseR, baseG, baseB,
          blendR, blendG, blendB,
          mode
        );

        // Mix based on alpha
        outData[baseIdx] = Math.round(baseR * (1 - blendA) + resultR * blendA);
        outData[baseIdx + 1] = Math.round(baseG * (1 - blendA) + resultG * blendA);
        outData[baseIdx + 2] = Math.round(baseB * (1 - blendA) + resultB * blendA);
        outData[baseIdx + 3] = Math.round(Math.min(255, baseA + blendA * 255 * (1 - baseA / 255)));
      }
    }

    return { image: outputImage };
  },
});
