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
 * Float image data with 32-bit float channels (0.0-1.0 range)
 * Supports HDR and high precision color processing
 *
 * Images exist in an infinite coordinate space. The origin defines
 * where this image's top-left corner sits in that space.
 */
export interface FloatImage {
  /** RGBA pixel data as Float32Array (r,g,b,a,r,g,b,a,...) in 0.0-1.0 range */
  data: Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Origin position in infinite canvas space (default: 0,0) */
  origin?: { x: number; y: number };
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
