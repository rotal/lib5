# Transform Baking Architecture

This document describes the lazy/deferred transform system used in imageflow for efficient interactive manipulation of image transforms.

## Overview

Transform nodes in imageflow use a **deferred baking strategy** where transform matrices are stored and composed without immediately resampling pixels. Baking (pixel resampling) only occurs when a downstream node requires **spatial coherence** - meaning it needs actual pixel data in a spatially correct arrangement.

This architecture enables:
- **Interactive gizmo performance**: Dragging transform handles updates matrices instantly without triggering expensive pixel operations
- **Transform composition**: Multiple transforms chain together as matrix multiplications
- **Minimal resampling**: Pixels are only resampled once, right before a node that needs them

## Key Components

### Transform2D

The 3x3 affine transform matrix stored as 6 values (`types/data.ts:54`):

```typescript
interface Transform2D {
  a: number;   // scale X, rotation component
  b: number;   // skew X, rotation component
  c: number;   // skew Y, rotation component
  d: number;   // scale Y, rotation component
  tx: number;  // translate X (pixels)
  ty: number;  // translate Y (pixels)
}
```

Matrix interpretation:
```
| a  b  tx |     x' = a*x + b*y + tx
| c  d  ty |     y' = c*x + d*y + ty
| 0  0  1  |
```

### FloatImage with Transform

Images carry an optional `transform` property:

```typescript
interface FloatImage {
  data: Float32Array;  // RGBA pixel data (0.0-1.0)
  width: number;
  height: number;
  transform?: Transform2D;  // Transform matrix for positioning and transforming
}
```

When `transform` is present:
- The pixel data remains unchanged from the source
- Preview rendering applies the transform visually via canvas operations
- The transform will be baked when passed to a spatial coherence node
- After baking, the image gets a pure translation transform to maintain position

### TransformNode

Located at `core/nodes/transform/TransformNode.ts`, this node:

1. Accepts an input image
2. Computes a transform matrix from parameters (offset, angle, scale, pivot)
3. **Composes** the new matrix with any existing transform on the input
4. Returns the image with the updated `transform` property
5. **Does NOT resample pixels**

```typescript
// From TransformNode.execute():
const combinedTransform = multiplyTransform(nodeTransform, existingTransform);
return {
  image: {
    data: inputImage.data,        // Same pixel data
    width: inputImage.width,
    height: inputImage.height,
    transform: combinedTransform, // New composed transform
    offset: inputImage.offset,
  },
};
```

### requiresSpatialCoherence Flag

Nodes that need baked pixel data declare this in their definition (`types/node.ts:185`):

```typescript
{
  type: 'filter/blur',
  requiresSpatialCoherence: true,  // Triggers baking on inputs
  // ...
}
```

### applyTransformToImage (Baking Function)

Located at `types/data.ts:301`, this function:

1. Calculates the transformed bounding box (AABB) from all four corners
2. Allocates a new image sized to fit the transformed content
3. Uses bilinear interpolation to resample pixels via inverse transform mapping
4. Updates the `offset` to reflect the new position in canvas space
5. Returns an image with **no transform property** (identity implied)

## Nodes Requiring Spatial Coherence

These nodes have `requiresSpatialCoherence: true` and trigger automatic baking:

| Node | File | Reason |
|------|------|--------|
| BlurNode | `core/nodes/filter/BlurNode.ts:264` | Kernel samples neighboring pixels |
| ConvolutionNode | `core/nodes/filter/ConvolutionNode.ts:200` | Kernel samples neighboring pixels |
| SharpenNode | `core/nodes/filter/SharpenNode.ts:10` | Uses blur internally |

## Data Flow

### Without Spatial Coherence Node

```
ImageInput → TransformNode → TransformNode → BlendNode → Output
              [matrix A]      [matrix B]       [no bake needed]

              Combined matrix = B * A
              Pixels never resampled
              Preview applies combined matrix visually
```

### With Spatial Coherence Node

```
ImageInput → TransformNode → BlurNode → Output
              [matrix stored]  [baking triggered]

              At BlurNode input:
              1. applyTransformToImage() called
              2. Pixels resampled with bilinear interpolation
              3. Output sized to transformed AABB
              4. offset updated, transform = identity
```

### GraphEngine Baking Logic

The baking decision happens in `GraphEngine.executeNode()` at line ~346:

```typescript
// Bake transforms when passing images to downstream nodes
if (isFloatImage(value) && value.transform) {
  const canvasWidth = this.graph.canvas?.width ?? 1920;
  const canvasHeight = this.graph.canvas?.height ?? 1080;
  const defaultColor = this.graph.canvas?.defaultColor ?? { r: 0, g: 0, b: 0, a: 0 };
  value = applyTransformToImage(value, canvasWidth, canvasHeight, defaultColor);
}
```

## Transform-Based Positioning

All positioning is handled through the transform matrix:

### transform.tx/ty (Pixel-Space Translation)

- Range: Any pixel value (can be negative)
- Purpose: Translation component of the transform matrix
- Set by: TransformNode's offset parameters, or baking operations

### Position Calculation

```
World position of pixel (localX, localY) in image:

If transform exists:
  worldX = a*localX + b*localY + tx
  worldY = c*localX + d*localY + ty

If no transform (identity implied):
  worldX = localX
  worldY = localY
```

### Baked Images

When an image with a complex transform (rotation, scale) is baked:
1. Pixels are resampled into a new image sized to the AABB
2. A pure translation transform is assigned that accounts for the preview's centering offset:
   ```typescript
   translateTransform(
     minX + (dstW - srcW) / 2,
     minY + (dstH - srcH) / 2
   )
   ```
3. This preserves the image's position in world space, compensating for the size difference between source and baked images

## Smart Baking Optimization

The system includes optimizations to avoid unnecessary baking (`types/data.ts:275`):

```typescript
function shouldBakeTransform(image: FloatImage, defaultColor: Color): boolean {
  const t = image.transform;

  // No transform or identity - no baking needed
  if (!t || isIdentityTransform(t)) return false;

  // Pure translation - never bake, just adjust offset
  if (isPureTranslation(t)) return false;

  // No rotation - scale alone doesn't change bounding box shape
  if (!hasRotation(t)) return false;

  // Has rotation - check if edges are empty
  // If edges match default color, content won't clip, so skip baking
  return !hasEmptyEdges(image, defaultColor);
}
```

This means:
- **Pure translations** are never baked (offset can be adjusted instead)
- **Scale-only transforms** don't require baking if edges are empty
- **Rotations** only require baking if edge pixels contain content (to prevent clipping)

## Implementation Files

| Component | Location |
|-----------|----------|
| Transform2D type & functions | `src/types/data.ts` |
| FloatImage interface | `src/types/data.ts` |
| applyTransformToImage | `src/types/data.ts` |
| bakeTransform | `src/types/data.ts` |
| TransformNode | `src/core/nodes/transform/TransformNode.ts` |
| GraphEngine (baking trigger) | `src/core/graph/GraphEngine.ts` |
| requiresSpatialCoherence flag | `src/types/node.ts:185` |
