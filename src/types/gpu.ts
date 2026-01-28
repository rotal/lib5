import type { FloatImage } from './data';

/**
 * GPU acceleration types for WebGL 2.0 image processing
 */

/**
 * Represents a texture stored on the GPU
 */
export interface GPUTexture {
  id: string;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  refCount: number;
}

/**
 * GPU context for WebGL 2.0 operations
 */
export interface GPUContext {
  /** The WebGL 2.0 rendering context */
  gl: WebGL2RenderingContext;

  /** Whether GPU acceleration is available */
  isAvailable: boolean;

  /** Create a GPU texture from ImageData (legacy, for loading) */
  createTexture(source: ImageData): GPUTexture;

  /** Create a GPU texture from FloatImage */
  createTextureFromFloat(source: FloatImage): GPUTexture;

  /** Create an empty texture with specified dimensions */
  createEmptyTexture(width: number, height: number): GPUTexture;

  /** Increment reference count for a texture */
  retainTexture(id: string): void;

  /** Decrement reference count and release if zero */
  releaseTexture(id: string): void;

  /** Get a compiled shader program by name */
  getProgram(name: string): WebGLProgram | null;

  /** Render using a program to a target texture */
  renderToTexture(
    programName: string,
    uniforms: Record<string, unknown>,
    output: GPUTexture
  ): void;

  /** Download texture data from GPU to CPU as FloatImage (0.0-1.0) */
  downloadTexture(texture: GPUTexture): FloatImage;

  /** Download texture data from GPU to CPU as ImageData (for display) */
  downloadTextureAsImageData(texture: GPUTexture): ImageData;

  /** Release all GPU resources */
  dispose(): void;
}

/**
 * Shader program info for caching
 */
export interface ShaderProgramInfo {
  program: WebGLProgram;
  uniformLocations: Map<string, WebGLUniformLocation>;
  attributeLocations: Map<string, number>;
}

/**
 * Configuration for GPU context initialization
 */
export interface GPUContextConfig {
  /** Maximum texture pool size (default: 10) */
  maxPoolSize?: number;

  /** Whether to prefer high-performance GPU (default: true) */
  preferHighPerformance?: boolean;
}
