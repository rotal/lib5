import { defineNode } from '../defineNode';

export const RotateNode = defineNode({
  type: 'transform/rotate',
  category: 'Transform',
  name: 'Rotate',
  description: 'Rotate image by angle',
  icon: 'rotate_right',

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
      id: 'angle',
      name: 'Angle',
      type: 'number',
      default: 0,
      constraints: { min: -360, max: 360, step: 0.1 },
      description: 'Rotation angle in degrees',
    },
    {
      id: 'expand',
      name: 'Expand Canvas',
      type: 'boolean',
      default: true,
      description: 'Expand canvas to fit rotated image',
    },
    {
      id: 'interpolation',
      name: 'Interpolation',
      type: 'select',
      default: 'bilinear',
      options: [
        { label: 'Nearest', value: 'nearest' },
        { label: 'Bilinear', value: 'bilinear' },
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
    const inputImage = inputs.image as ImageData | null;

    if (!inputImage) {
      return { image: null };
    }

    const angle = (params.angle as number) * (Math.PI / 180);
    const expand = params.expand as boolean;
    const interpolation = params.interpolation as string;
    const bg = params.backgroundColor as { r: number; g: number; b: number; a: number };

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const srcW = inputImage.width;
    const srcH = inputImage.height;

    // Calculate output dimensions
    let dstW: number, dstH: number;
    if (expand) {
      dstW = Math.ceil(Math.abs(srcW * cos) + Math.abs(srcH * sin));
      dstH = Math.ceil(Math.abs(srcW * sin) + Math.abs(srcH * cos));
    } else {
      dstW = srcW;
      dstH = srcH;
    }

    const outputImage = new ImageData(dstW, dstH);
    const srcData = inputImage.data;
    const dstData = outputImage.data;

    // Center points
    const srcCx = srcW / 2;
    const srcCy = srcH / 2;
    const dstCx = dstW / 2;
    const dstCy = dstH / 2;

    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        // Transform destination to source coordinates (inverse rotation)
        const dx = x - dstCx;
        const dy = y - dstCy;
        const srcX = dx * cos + dy * sin + srcCx;
        const srcY = -dx * sin + dy * cos + srcCy;

        const dstIdx = (y * dstW + x) * 4;

        if (srcX < 0 || srcX >= srcW || srcY < 0 || srcY >= srcH) {
          // Outside source bounds - use background color
          dstData[dstIdx] = bg.r;
          dstData[dstIdx + 1] = bg.g;
          dstData[dstIdx + 2] = bg.b;
          dstData[dstIdx + 3] = Math.round(bg.a * 255);
          continue;
        }

        if (interpolation === 'nearest') {
          const sx = Math.round(srcX);
          const sy = Math.round(srcY);
          if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
            const srcIdx = (sy * srcW + sx) * 4;
            dstData[dstIdx] = srcData[srcIdx];
            dstData[dstIdx + 1] = srcData[srcIdx + 1];
            dstData[dstIdx + 2] = srcData[srcIdx + 2];
            dstData[dstIdx + 3] = srcData[srcIdx + 3];
          }
        } else {
          // Bilinear interpolation
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
      }
    }

    return { image: outputImage };
  },
});
