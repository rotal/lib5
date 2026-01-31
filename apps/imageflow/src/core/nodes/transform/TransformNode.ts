import { defineNode, ensureFloatImage } from '../defineNode';
import { createPivotTransform, multiplyTransform, IDENTITY_TRANSFORM, isGPUTexture, isFloatImage } from '../../../types/data';
import type { FloatImage } from '../../../types/data';
import type { GPUTexture } from '../../../types/gpu';

/**
 * Unified Transform node combining translate, rotate, and scale
 * with an interactive gizmo in the preview viewport.
 *
 * Transform order: Scale → Rotate → Translate (all around pivot point)
 *
 * This node does NOT bake/resample pixels. It composes a Transform2D matrix
 * that is stored on the output image. The preview viewport applies this
 * transform when rendering for real-time interactive feedback.
 *
 * Downstream nodes that require spatial coherence (blur, convolution) will
 * bake the transform before processing.
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
      id: 'pivotX',
      name: 'Pivot X',
      type: 'number',
      default: 0,
      constraints: { min: -2, max: 2, step: 0.01 },
      description: 'Pivot X (-1=left, 0=center, 1=right)',
    },
    {
      id: 'pivotY',
      name: 'Pivot Y',
      type: 'number',
      default: 0,
      constraints: { min: -2, max: 2, step: 0.01 },
      description: 'Pivot Y (-1=top, 0=center, 1=bottom)',
    },
    {
      id: 'reset',
      name: 'Reset Transform',
      type: 'button',
      default: null,
      action: 'reset',
      description: 'Reset all transform parameters to identity',
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
    // Maya-style 2D translate gizmo with X/Y axis arrows
    translateParams: ['offsetX', 'offsetY'],
    translateCoordSystem: 'pixels',
  },

  async execute(inputs, params, context) {
    const input = inputs.image as ImageData | GPUTexture | FloatImage | null;

    if (!input) {
      return { image: null };
    }

    // Convert input to FloatImage
    let inputImage: FloatImage | null = null;

    if (isGPUTexture(input)) {
      if (context.gpu) {
        inputImage = context.gpu.downloadTexture(input);
      }
    } else if (isFloatImage(input)) {
      inputImage = input;
    } else if (input instanceof ImageData) {
      inputImage = ensureFloatImage(input, context);
    }

    if (!inputImage) {
      return { image: null };
    }

    const offsetX = params.offsetX as number;
    const offsetY = params.offsetY as number;
    const angleDeg = params.angle as number;
    const scaleX = params.scaleX as number;
    const scaleY = params.scaleY as number;
    const pivotNormX = params.pivotX as number;
    const pivotNormY = params.pivotY as number;

    // Pivot is normalized -1 to 1 relative to image bounds (0 = center)
    // Convert to image-local coordinates (transform operates on image-local coords)
    // pivot (0,0) = image center = (width/2, height/2) in image-local
    const pivotLocalX = inputImage.width / 2 + pivotNormX * inputImage.width / 2;
    const pivotLocalY = inputImage.height / 2 + pivotNormY * inputImage.height / 2;

    // Create new transform for this node's parameters
    // Rotation/scale happens around pivot in image-local coordinates
    const angle = angleDeg * (Math.PI / 180);
    const nodeTransform = createPivotTransform(
      scaleX,
      scaleY,
      angle,
      pivotLocalX,
      pivotLocalY,
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
