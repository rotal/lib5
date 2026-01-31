import type { GPUTexture } from './gpu';

/**
 * Data types that can flow through node ports
 */

export type DataType =
  | 'image'
  | 'mask'
  | 'number'
  | 'color'
  | 'boolean'
  | 'string'
  | 'vector2'
  | 'rect'
  | 'selection'
  | 'videoFrame'
  | 'any';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Color with floating point channels (0.0-1.0 range)
 */
export interface Color {
  r: number; // 0.0-1.0
  g: number; // 0.0-1.0
  b: number; // 0.0-1.0
  a: number; // 0.0-1.0
}

/**
 * 2D Transform matrix (3x3 affine transform stored as 6 values)
 * [a, b, c, d, tx, ty] represents:
 * | a  b  tx |
 * | c  d  ty |
 * | 0  0  1  |
 *
 * For a point (x, y):
 *   x' = a*x + b*y + tx
 *   y' = c*x + d*y + ty
 */
export interface Transform2D {
  a: number;   // scale X, rotation component
  b: number;   // skew X, rotation component
  c: number;   // skew Y, rotation component
  d: number;   // scale Y, rotation component
  tx: number;  // translate X
  ty: number;  // translate Y
}

/** Identity transform (no transformation) */
export const IDENTITY_TRANSFORM: Transform2D = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0,
};

/**
 * Check if local transform parameters represent an identity transform (no change).
 * Used to skip transform computation when values are default.
 * @param params Node parameters containing _tx, _ty, _sx, _sy, _angle, _px, _py
 */
export function isIdentityLocalTransform(params: Record<string, unknown>): boolean {
  return (
    (params._tx ?? 0) === 0 &&
    (params._ty ?? 0) === 0 &&
    (params._sx ?? 1) === 1 &&
    (params._sy ?? 1) === 1 &&
    (params._angle ?? 0) === 0 &&
    (params._px ?? 0.5) === 0.5 &&
    (params._py ?? 0.5) === 0.5
  );
}

/** Create a translation transform */
export function translateTransform(tx: number, ty: number): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

/** Create a scale transform around origin */
export function scaleTransform(sx: number, sy: number): Transform2D {
  return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
}

/** Create a rotation transform around origin (angle in radians) */
export function rotateTransform(angle: number): Transform2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { a: cos, b: -sin, c: sin, d: cos, tx: 0, ty: 0 };
}

/** Multiply two transforms: result = a * b (apply b first, then a) */
export function multiplyTransform(a: Transform2D, b: Transform2D): Transform2D {
  return {
    a: a.a * b.a + a.b * b.c,
    b: a.a * b.b + a.b * b.d,
    c: a.c * b.a + a.d * b.c,
    d: a.c * b.b + a.d * b.d,
    tx: a.a * b.tx + a.b * b.ty + a.tx,
    ty: a.c * b.tx + a.d * b.ty + a.ty,
  };
}

/** Create a transform: scale and rotate around a pivot point, then translate */
export function createPivotTransform(
  scaleX: number,
  scaleY: number,
  angleRad: number,
  pivotX: number,
  pivotY: number,
  translateX: number,
  translateY: number,
): Transform2D {
  // Move pivot to origin
  const toPivot = translateTransform(-pivotX, -pivotY);
  // Scale
  const scale = scaleTransform(scaleX, scaleY);
  // Rotate
  const rotate = rotateTransform(angleRad);
  // Move back from pivot
  const fromPivot = translateTransform(pivotX, pivotY);
  // Final translation
  const translate = translateTransform(translateX, translateY);

  // Compose: translate * fromPivot * rotate * scale * toPivot
  let result = toPivot;
  result = multiplyTransform(scale, result);
  result = multiplyTransform(rotate, result);
  result = multiplyTransform(fromPivot, result);
  result = multiplyTransform(translate, result);
  return result;
}

/** Invert a transform matrix */
export function invertTransform(t: Transform2D): Transform2D {
  const det = t.a * t.d - t.b * t.c;
  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
    return { ...IDENTITY_TRANSFORM };
  }
  const invDet = 1 / det;
  return {
    a: t.d * invDet,
    b: -t.b * invDet,
    c: -t.c * invDet,
    d: t.a * invDet,
    tx: (t.b * t.ty - t.d * t.tx) * invDet,
    ty: (t.c * t.tx - t.a * t.ty) * invDet,
  };
}

/** Apply transform to a point */
export function transformPoint(t: Transform2D, x: number, y: number): { x: number; y: number } {
  return {
    x: t.a * x + t.b * y + t.tx,
    y: t.c * x + t.d * y + t.ty,
  };
}

/** Check if a Transform2D is identity (no transformation) */
export function isIdentityTransform(t: Transform2D): boolean {
  const eps = 1e-6;
  return (
    Math.abs(t.a - 1) < eps &&
    Math.abs(t.b) < eps &&
    Math.abs(t.c) < eps &&
    Math.abs(t.d - 1) < eps &&
    Math.abs(t.tx) < eps &&
    Math.abs(t.ty) < eps
  );
}

/**
 * Float image data with 32-bit float channels (0.0-1.0 range)
 * Supports HDR and high precision color processing
 *
 * Images exist in an infinite coordinate space. The transform defines
 * how to map from image-local coordinates to world coordinates.
 * Pixel data is never modified by transforms - only the matrix changes.
 */
export interface FloatImage {
  /** RGBA pixel data as Float32Array (r,g,b,a,r,g,b,a,...) in 0.0-1.0 range */
  data: Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Origin position in infinite canvas space (default: 0,0) - DEPRECATED, use transform */
  origin?: { x: number; y: number };
  /** Transform matrix mapping image-local to world coordinates */
  transform?: Transform2D;
}

/**
 * Get the boundary rect of a FloatImage in infinite canvas space
 */
export function getImageBoundary(image: FloatImage): Rect {
  return {
    x: image.origin?.x ?? 0,
    y: image.origin?.y ?? 0,
    width: image.width,
    height: image.height,
  };
}

/**
 * Create a new FloatImage with specified dimensions
 * @param origin Optional origin position in infinite canvas space
 */
export function createFloatImage(
  width: number,
  height: number,
  origin?: { x: number; y: number }
): FloatImage {
  return {
    data: new Float32Array(width * height * 4),
    width,
    height,
    origin,
  };
}

/**
 * Convert ImageData (0-255) to FloatImage (0.0-1.0)
 */
export function imageDataToFloat(imageData: ImageData): FloatImage {
  const { width, height, data } = imageData;
  const floatData = new Float32Array(width * height * 4);
  const scale = 1 / 255;

  for (let i = 0; i < data.length; i++) {
    floatData[i] = data[i] * scale;
  }

  return { data: floatData, width, height };
}

/**
 * Convert FloatImage (0.0-1.0) to ImageData (0-255)
 */
export function floatToImageData(floatImage: FloatImage): ImageData {
  const { width, height, data } = floatImage;
  const imageData = new ImageData(width, height);
  const outData = imageData.data;

  for (let i = 0; i < data.length; i++) {
    // Clamp to 0-1 range and convert to 0-255
    outData[i] = Math.round(Math.max(0, Math.min(1, data[i])) * 255);
  }

  return imageData;
}

/**
 * Clone a FloatImage
 */
export function cloneFloatImage(source: FloatImage): FloatImage {
  return {
    data: new Float32Array(source.data),
    width: source.width,
    height: source.height,
    origin: source.origin ? { ...source.origin } : undefined,
  };
}

/**
 * Apply/bake the transform into a FloatImage by resampling pixels.
 * Output is sized to fit the transformed content exactly.
 * Uses bilinear interpolation for smooth results.
 */
export function applyTransformToImage(image: FloatImage): FloatImage {
  const transform = image.transform;
  if (!transform || isIdentityTransform(transform)) {
    // No transform or identity - just clone without transform property
    return {
      data: new Float32Array(image.data),
      width: image.width,
      height: image.height,
    };
  }

  const { width: srcW, height: srcH, data: src } = image;

  // Transform all 4 corners to find bounding box of transformed content
  const corners = [
    transformPoint(transform, 0, 0),
    transformPoint(transform, srcW, 0),
    transformPoint(transform, srcW, srcH),
    transformPoint(transform, 0, srcH),
  ];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }

  // Round to integer bounds
  minX = Math.floor(minX);
  minY = Math.floor(minY);
  maxX = Math.ceil(maxX);
  maxY = Math.ceil(maxY);

  // Output dimensions = bounding box of transformed content
  const dstW = maxX - minX;
  const dstH = maxY - minY;

  // Sanity check
  if (dstW <= 0 || dstH <= 0 || dstW > 16384 || dstH > 16384) {
    return {
      data: new Float32Array(image.data),
      width: image.width,
      height: image.height,
    };
  }

  const dst = new Float32Array(dstW * dstH * 4);

  // Inverse transform maps world coords to source coords
  const inv = invertTransform(transform);

  // Get pixel from source with bilinear interpolation
  const sampleSource = (sx: number, sy: number, channel: number): number => {
    if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) {
      return 0; // Transparent black outside source bounds
    }
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, srcW - 1);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fx = sx - x0;
    const fy = sy - y0;

    const v00 = src[(y0 * srcW + x0) * 4 + channel];
    const v10 = src[(y0 * srcW + x1) * 4 + channel];
    const v01 = src[(y1 * srcW + x0) * 4 + channel];
    const v11 = src[(y1 * srcW + x1) * 4 + channel];

    const v0 = v00 * (1 - fx) + v10 * fx;
    const v1 = v01 * (1 - fx) + v11 * fx;
    return v0 * (1 - fy) + v1 * fy;
  };

  // Fill destination buffer
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      // Output pixel position in world coordinates
      const worldX = x + minX;
      const worldY = y + minY;

      // Map world coords to source image coords
      const srcX = inv.a * worldX + inv.b * worldY + inv.tx;
      const srcY = inv.c * worldX + inv.d * worldY + inv.ty;

      const dstIdx = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        dst[dstIdx + c] = sampleSource(srcX, srcY, c);
      }
    }
  }

  // Return image sized to fit transformed content
  // No transform attached - pixels are fully baked
  return {
    data: dst,
    width: dstW,
    height: dstH,
  };
}

export interface Selection {
  mask: FloatImage;
  bounds: Rect;
  feather: number;
}

export interface VideoFrame {
  image: FloatImage;
  timestamp: number;
  duration: number;
  frameIndex: number;
}

/**
 * Runtime values that nodes pass to each other
 */
export type PortValue =
  | FloatImage
  | ImageData
  | ImageBitmap
  | GPUTexture
  | number
  | boolean
  | string
  | Color
  | Vector2
  | Rect
  | Selection
  | VideoFrame
  | null
  | undefined;

/**
 * Mapping of data types to their TypeScript types
 */
export interface DataTypeMap {
  image: FloatImage | ImageData | ImageBitmap | GPUTexture;
  mask: FloatImage;
  number: number;
  color: Color;
  boolean: boolean;
  string: string;
  vector2: Vector2;
  rect: Rect;
  selection: Selection;
  videoFrame: VideoFrame;
  any: PortValue;
}

/**
 * Type guard functions
 */
export function isFloatImage(value: unknown): value is FloatImage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'width' in value &&
    'height' in value &&
    (value as FloatImage).data instanceof Float32Array
  );
}

export function isImageData(value: unknown): value is ImageData {
  return value instanceof ImageData;
}

export function isImageBitmap(value: unknown): value is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;
}

export function isColor(value: unknown): value is Color {
  return (
    typeof value === 'object' &&
    value !== null &&
    'r' in value &&
    'g' in value &&
    'b' in value &&
    'a' in value
  );
}

export function isVector2(value: unknown): value is Vector2 {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    !('width' in value)
  );
}

export function isRect(value: unknown): value is Rect {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    'width' in value &&
    'height' in value
  );
}

/**
 * Type guard for GPUTexture
 */
export function isGPUTexture(value: unknown): value is GPUTexture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'texture' in value &&
    'framebuffer' in value &&
    'width' in value &&
    'height' in value &&
    'id' in value
  );
}

/**
 * Check if two data types are compatible for connection.
 * This is directional: areTypesCompatible(source, target).
 *
 * Allowed cross-type connections (with auto-coercion):
 *   mask   → image   (R channel duplicated to RGB, A=1.0)
 *   number → image   (solid constant FloatImage)
 *   number → mask    (solid constant FloatImage)
 *
 * Banned:
 *   image  → mask    (ambiguous: which channel?)
 */
export function areTypesCompatible(source: DataType, target: DataType): boolean {
  if (source === target) return true;
  if (target === 'any') return true;
  if (source === 'any') return true;

  // mask → image is allowed (auto-coerced)
  if (source === 'mask' && target === 'image') return true;

  // number → image or number → mask (auto-coerced to solid constant)
  if (source === 'number' && (target === 'image' || target === 'mask')) return true;

  return false;
}

/**
 * Coerce a port value from one data type to another.
 * Only handles the allowed cross-type conversions:
 *   mask   → image  : duplicate R channel to RGB, A = 1.0
 *   number → image  : solid constant FloatImage (RGB = value, A = 1.0)
 *   number → mask   : solid constant FloatImage (all channels = value)
 *
 * If sourceType === targetType or either is 'any', value is returned unchanged.
 *
 * @param width  Output width for number→image/mask coercion
 * @param height Output height for number→image/mask coercion
 */
export function coercePortValue(
  value: PortValue,
  sourceType: DataType,
  targetType: DataType,
  width: number = 512,
  height: number = 512,
): PortValue {
  // No coercion needed for identical types or 'any' ports
  if (sourceType === targetType || sourceType === 'any' || targetType === 'any') {
    return value;
  }

  // mask → image: duplicate R channel to RGB, A = 1.0
  if (sourceType === 'mask' && targetType === 'image') {
    const src = value as FloatImage;
    if (!src || !src.data) return value;
    const dst = createFloatImage(src.width, src.height);
    const srcData = src.data;
    const dstData = dst.data;
    const pixelCount = src.width * src.height;
    for (let i = 0; i < pixelCount; i++) {
      const si = i * 4;
      const gray = srcData[si]; // R channel as the grayscale value
      dstData[si] = gray;
      dstData[si + 1] = gray;
      dstData[si + 2] = gray;
      dstData[si + 3] = 1.0;
    }
    return dst;
  }

  // number → image: solid constant (RGB = value, A = 1.0)
  if (sourceType === 'number' && targetType === 'image') {
    const v = value as number;
    const img = createFloatImage(width, height);
    const data = img.data;
    const pixelCount = width * height;
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 1.0;
    }
    return img;
  }

  // number → mask: solid constant (all channels = value)
  if (sourceType === 'number' && targetType === 'mask') {
    const v = value as number;
    const img = createFloatImage(width, height);
    const data = img.data;
    data.fill(v);
    return img;
  }

  // Fallback: return value unchanged
  return value;
}

/**
 * Get color for a data type (for UI)
 */
export function getDataTypeColor(type: DataType): string {
  const colors: Record<DataType, string> = {
    image: '#f59e0b',
    mask: '#8b5cf6',
    number: '#3b82f6',
    color: '#ec4899',
    boolean: '#22c55e',
    string: '#6366f1',
    vector2: '#14b8a6',
    rect: '#f97316',
    selection: '#a855f7',
    videoFrame: '#ef4444',
    any: '#9ca3af',
  };
  return colors[type];
}
