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
 */
export interface FloatImage {
  /** RGBA pixel data as Float32Array (r,g,b,a,r,g,b,a,...) in 0.0-1.0 range */
  data: Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
}

/**
 * Create a new FloatImage with specified dimensions
 */
export function createFloatImage(width: number, height: number): FloatImage {
  return {
    data: new Float32Array(width * height * 4),
    width,
    height,
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
 * Check if two data types are compatible for connection
 */
export function areTypesCompatible(source: DataType, target: DataType): boolean {
  if (source === target) return true;
  if (target === 'any') return true;
  if (source === 'any') return true;

  // Image and mask are compatible (mask is grayscale image)
  if ((source === 'image' && target === 'mask') || (source === 'mask' && target === 'image')) {
    return true;
  }

  return false;
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
