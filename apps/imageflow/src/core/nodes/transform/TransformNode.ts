import { defineNode, ensureFloatImage } from '../defineNode';
import { createPivotTransform, multiplyTransform, IDENTITY_TRANSFORM } from '../../../types/data';

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
      default: 1,
      constraints: { min: 0.01, max: 5, step: 0.01 },
      description: 'Horizontal scale (1 = no scale)',
    },
    {
      id: 'scaleY',
      name: 'Scale Y',
      type: 'number',
      default: 1,
      constraints: { min: 0.01, max: 5, step: 0.01 },
      description: 'Vertical scale (1 = no scale)',
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
      default: 0.5,
      constraints: { min: 0, max: 1, step: 0.01 },
      description: 'Pivot point X (0.5 = center)',
    },
    {
      id: 'pivotY',
      name: 'Pivot Y',
      type: 'number',
      default: 0.5,
      constraints: { min: 0, max: 1, step: 0.01 },
      description: 'Pivot point Y (0.5 = center)',
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

  // Define the interactive gizmo with Maya-style translate axes
  gizmo: {
    handles: [
      {
        id: 'pivot',
        type: 'point',
        params: ['pivotX', 'pivotY'],
        coordSystem: 'normalized',
        label: 'Pivot',
        color: '#f59e0b', // Orange for pivot
      },
    ],
    showBoundingBox: true,
    showRotation: true,
    rotationParam: 'angle',
    pivotParams: ['pivotX', 'pivotY'],
    scaleParams: ['scaleX', 'scaleY'],
    uniformScaleParam: 'uniformScale',
    // Maya-style 2D translate gizmo with X/Y axis arrows
    translateParams: ['offsetX', 'offsetY'],
    translateCoordSystem: 'pixels',
  },

  async execute(inputs, params, _context) {
    const inputImage = ensureFloatImage(inputs.image, _context);

    if (!inputImage) {
      return { image: null };
    }

    const offsetX = params.offsetX as number;
    const offsetY = params.offsetY as number;
    const angleDeg = params.angle as number;
    const scaleX = params.scaleX as number;
    const scaleY = params.scaleY as number;
    const pivotX = params.pivotX as number;
    const pivotY = params.pivotY as number;

    // Pivot point in pixel coordinates
    const px = inputImage.width * pivotX;
    const py = inputImage.height * pivotY;

    // Create new transform for this node's parameters
    const angle = angleDeg * (Math.PI / 180);
    const nodeTransform = createPivotTransform(
      scaleX,
      scaleY,
      angle,
      px,
      py,
      offsetX,
      offsetY,
    );

    // Compose with existing transform (if any)
    const existingTransform = inputImage.transform ?? IDENTITY_TRANSFORM;
    const combinedTransform = multiplyTransform(nodeTransform, existingTransform);

    // Return image with updated transform - NO pixel resampling
    // The pixel data is passed through unchanged
    return {
      image: {
        data: inputImage.data,
        width: inputImage.width,
        height: inputImage.height,
        transform: combinedTransform,
      },
    };
  },
});
