import { defineNode, ensureFloatImage } from '../defineNode';
import { createFloatImage } from '../../../types/data';

/**
 * Unified Transform node combining translate, rotate, and scale
 * with an interactive gizmo in the preview viewport.
 *
 * Transform order: Scale → Rotate → Translate (all around pivot point)
 */
export const TransformNode = defineNode({
  type: 'transform/transform',
  category: 'Transform',
  name: 'Transform',
  description: 'Translate, rotate, and scale an image with interactive controls',
  icon: 'transform',

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
      id: 'offsetX',
      name: 'Offset X',
      type: 'number',
      default: 0,
      constraints: { min: -4096, max: 4096, step: 1 },
      description: 'Horizontal translation in pixels',
    },
    {
      id: 'offsetY',
      name: 'Offset Y',
      type: 'number',
      default: 0,
      constraints: { min: -4096, max: 4096, step: 1 },
      description: 'Vertical translation in pixels',
    },
    {
      id: 'angle',
      name: 'Angle',
      type: 'number',
      default: 0,
      constraints: { min: -360, max: 360, step: 0.1 },
      description: 'Rotation angle in degrees',
    },
    {
      id: 'scaleX',
      name: 'Scale X',
      type: 'number',
      default: 100,
      constraints: { min: 1, max: 500, step: 1 },
      description: 'Horizontal scale as percentage (100 = 1x)',
    },
    {
      id: 'scaleY',
      name: 'Scale Y',
      type: 'number',
      default: 100,
      constraints: { min: 1, max: 500, step: 1 },
      description: 'Vertical scale as percentage (100 = 1x)',
    },
    {
      id: 'uniformScale',
      name: 'Uniform Scale',
      type: 'boolean',
      default: true,
      description: 'Lock aspect ratio when scaling',
    },
    {
      id: 'pivotX',
      name: 'Pivot X',
      type: 'number',
      default: 50,
      constraints: { min: 0, max: 100, step: 1 },
      description: 'Pivot point X as percentage (50 = center)',
    },
    {
      id: 'pivotY',
      name: 'Pivot Y',
      type: 'number',
      default: 50,
      constraints: { min: 0, max: 100, step: 1 },
      description: 'Pivot point Y as percentage (50 = center)',
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
      id: 'edgeMode',
      name: 'Edge Mode',
      type: 'select',
      default: 'transparent',
      options: [
        { label: 'Transparent', value: 'transparent' },
        { label: 'Wrap', value: 'wrap' },
        { label: 'Clamp', value: 'clamp' },
      ],
      description: 'How to handle pixels outside the image bounds',
    },
  ],

  // Define the interactive gizmo
  gizmo: {
    handles: [
      {
        id: 'pivot',
        type: 'point',
        params: ['pivotX', 'pivotY'],
        coordSystem: 'percent',
        label: 'Pivot',
        color: '#f59e0b', // Orange for pivot
      },
      {
        id: 'translate',
        type: 'point',
        params: ['offsetX', 'offsetY'],
        coordSystem: 'pixels',
        label: 'Position',
        color: '#3b82f6', // Blue for position
      },
    ],
    showBoundingBox: true,
    showRotation: true,
    rotationParam: 'angle',
    pivotParams: ['pivotX', 'pivotY'],
    scaleParams: ['scaleX', 'scaleY'],
    uniformScaleParam: 'uniformScale',
  },

  async execute(inputs, params, context) {
    const inputImage = ensureFloatImage(inputs.image, context);

    if (!inputImage) {
      return { image: null };
    }

    const offsetX = params.offsetX as number;
    const offsetY = params.offsetY as number;
    const angleDeg = params.angle as number;
    const scaleX = (params.scaleX as number) / 100;
    const scaleY = (params.scaleY as number) / 100;
    const pivotX = (params.pivotX as number) / 100;
    const pivotY = (params.pivotY as number) / 100;
    const interpolation = params.interpolation as string;
    const edgeMode = params.edgeMode as string;

    // No transform needed
    if (
      offsetX === 0 &&
      offsetY === 0 &&
      angleDeg === 0 &&
      scaleX === 1 &&
      scaleY === 1
    ) {
      return { image: inputImage };
    }

    const angle = angleDeg * (Math.PI / 180);
    const cos = Math.cos(-angle); // Inverse rotation for sampling
    const sin = Math.sin(-angle);

    const srcW = inputImage.width;
    const srcH = inputImage.height;
    const dstW = srcW;
    const dstH = srcH;

    const outputImage = createFloatImage(dstW, dstH);
    const srcData = inputImage.data;
    const dstData = outputImage.data;

    // Pivot point in pixel coordinates
    const px = srcW * pivotX;
    const py = srcH * pivotY;

    // Inverse scale
    const invScaleX = 1 / scaleX;
    const invScaleY = 1 / scaleY;

    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        // Inverse transform: destination → source
        // 1. Subtract translation
        let sx = x - offsetX;
        let sy = y - offsetY;

        // 2. Move to pivot-relative coordinates
        sx -= px;
        sy -= py;

        // 3. Inverse rotate around pivot
        const rx = sx * cos - sy * sin;
        const ry = sx * sin + sy * cos;

        // 4. Inverse scale
        sx = rx * invScaleX;
        sy = ry * invScaleY;

        // 5. Move back from pivot
        sx += px;
        sy += py;

        const dstIdx = (y * dstW + x) * 4;

        // Handle edge modes
        let srcX = sx;
        let srcY = sy;

        if (edgeMode === 'wrap') {
          srcX = ((srcX % srcW) + srcW) % srcW;
          srcY = ((srcY % srcH) + srcH) % srcH;
        } else if (edgeMode === 'clamp') {
          srcX = Math.max(0, Math.min(srcW - 1, srcX));
          srcY = Math.max(0, Math.min(srcH - 1, srcY));
        } else {
          // Transparent - check bounds
          if (srcX < 0 || srcX >= srcW || srcY < 0 || srcY >= srcH) {
            dstData[dstIdx] = 0;
            dstData[dstIdx + 1] = 0;
            dstData[dstIdx + 2] = 0;
            dstData[dstIdx + 3] = 0;
            continue;
          }
        }

        if (interpolation === 'nearest') {
          const ix = Math.round(srcX);
          const iy = Math.round(srcY);
          const clampedX = Math.max(0, Math.min(srcW - 1, ix));
          const clampedY = Math.max(0, Math.min(srcH - 1, iy));
          const srcIdx = (clampedY * srcW + clampedX) * 4;
          dstData[dstIdx] = srcData[srcIdx];
          dstData[dstIdx + 1] = srcData[srcIdx + 1];
          dstData[dstIdx + 2] = srcData[srcIdx + 2];
          dstData[dstIdx + 3] = srcData[srcIdx + 3];
        } else {
          // Bilinear interpolation
          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const x1 = Math.min(x0 + 1, srcW - 1);
          const y1 = Math.min(y0 + 1, srcH - 1);
          const fx = srcX - x0;
          const fy = srcY - y0;

          const x0c = Math.max(0, x0);
          const y0c = Math.max(0, y0);

          const idx00 = (y0c * srcW + x0c) * 4;
          const idx10 = (y0c * srcW + x1) * 4;
          const idx01 = (y1 * srcW + x0c) * 4;
          const idx11 = (y1 * srcW + x1) * 4;

          for (let c = 0; c < 4; c++) {
            const v00 = srcData[idx00 + c];
            const v10 = srcData[idx10 + c];
            const v01 = srcData[idx01 + c];
            const v11 = srcData[idx11 + c];

            const v0 = v00 * (1 - fx) + v10 * fx;
            const v1 = v01 * (1 - fx) + v11 * fx;
            dstData[dstIdx + c] = v0 * (1 - fy) + v1 * fy;
          }
        }
      }
    }

    return { image: outputImage };
  },
});
