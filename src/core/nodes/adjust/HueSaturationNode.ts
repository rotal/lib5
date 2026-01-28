import { defineNode, ensureImageData } from '../defineNode';
import { isGPUTexture } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h, s, l];
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const HueSaturationNode = defineNode({
  type: 'adjust/hue-saturation',
  category: 'Adjust',
  name: 'Hue/Saturation',
  description: 'Adjust hue, saturation, and lightness',
  icon: 'color_lens',

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
      id: 'hue',
      name: 'Hue',
      type: 'number',
      default: 0,
      constraints: { min: -180, max: 180, step: 1 },
      description: 'Hue shift in degrees',
    },
    {
      id: 'saturation',
      name: 'Saturation',
      type: 'number',
      default: 0,
      constraints: { min: -100, max: 100, step: 1 },
    },
    {
      id: 'lightness',
      name: 'Lightness',
      type: 'number',
      default: 0,
      constraints: { min: -100, max: 100, step: 1 },
    },
    {
      id: 'preview',
      name: 'Preview',
      type: 'boolean',
      default: false,
      description: 'Show preview (downloads from GPU)',
    },
  ],

  async execute(inputs, params, context) {
    const input = inputs.image as ImageData | GPUTexture | null;

    if (!input) {
      return { image: null };
    }

    const hueShift = (params.hue as number) / 360;
    const saturationChange = (params.saturation as number) / 100;
    const lightnessChange = (params.lightness as number) / 100;
    const preview = params.preview as boolean;

    // GPU path
    if (context.gpu?.isAvailable) {
      const gpu = context.gpu;

      let inputTexture: GPUTexture;
      let needsInputRelease = false;

      if (isGPUTexture(input)) {
        inputTexture = input;
      } else {
        inputTexture = gpu.createTexture(input);
        needsInputRelease = true;
      }

      const { width, height } = inputTexture;
      const outputTexture = gpu.createEmptyTexture(width, height);

      gpu.renderToTexture('hue_saturation', {
        u_texture: inputTexture.texture,
        u_hueShift: hueShift,
        u_saturation: saturationChange,
        u_lightness: lightnessChange,
      }, outputTexture);

      if (needsInputRelease) {
        gpu.releaseTexture(inputTexture.id);
      }

      if (preview) {
        const result = gpu.downloadTexture(outputTexture);
        gpu.releaseTexture(outputTexture.id);
        return { image: result };
      }

      return { image: outputTexture };
    }

    // CPU fallback
    const inputImage = ensureImageData(input, context);
    if (!inputImage) {
      return { image: null };
    }

    const outputImage = new ImageData(
      new Uint8ClampedArray(inputImage.data),
      inputImage.width,
      inputImage.height
    );
    const data = outputImage.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      let [h, s, l] = rgbToHsl(r, g, b);

      h = (h + hueShift + 1) % 1;

      if (saturationChange >= 0) {
        s = s + (1 - s) * saturationChange;
      } else {
        s = s + s * saturationChange;
      }
      s = Math.max(0, Math.min(1, s));

      if (lightnessChange >= 0) {
        l = l + (1 - l) * lightnessChange;
      } else {
        l = l + l * lightnessChange;
      }
      l = Math.max(0, Math.min(1, l));

      const [newR, newG, newB] = hslToRgb(h, s, l);
      data[i] = newR;
      data[i + 1] = newG;
      data[i + 2] = newB;
    }

    return { image: outputImage };
  },
});
