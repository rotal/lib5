import * as twgl from 'twgl.js';
import type { GPUContext, GPUTexture, GPUContextConfig } from '../../types/gpu';
import { TexturePool } from './TexturePool';
import { ShaderRegistry } from './ShaderRegistry';

/**
 * Creates and manages the WebGL 2.0 GPU context for image processing.
 * Uses OffscreenCanvas for headless rendering.
 */
export class GPUContextImpl implements GPUContext {
  public gl: WebGL2RenderingContext;
  public isAvailable: boolean;

  private canvas: OffscreenCanvas;
  private texturePool: TexturePool;
  private shaderRegistry: ShaderRegistry;
  private quadBufferInfo: twgl.BufferInfo;

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: OffscreenCanvas,
    config: GPUContextConfig
  ) {
    this.gl = gl;
    this.canvas = canvas;
    this.isAvailable = true;
    this.texturePool = new TexturePool(gl, config.maxPoolSize ?? 10);
    this.shaderRegistry = new ShaderRegistry(gl);

    // Create fullscreen quad for rendering
    this.quadBufferInfo = twgl.createBufferInfoFromArrays(gl, {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, 1, 1],
      },
      texcoord: {
        numComponents: 2,
        data: [0, 0, 1, 0, 0, 1, 1, 1],
      },
    });
  }

  /**
   * Create a GPU context with WebGL 2.0
   */
  static create(config: GPUContextConfig = {}): GPUContext | null {
    // Check for OffscreenCanvas support
    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('OffscreenCanvas not supported');
      return null;
    }

    try {
      // Create offscreen canvas with reasonable default size
      const canvas = new OffscreenCanvas(1, 1);

      const contextOptions: WebGLContextAttributes = {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: config.preferHighPerformance !== false ? 'high-performance' : 'default',
      };

      const gl = canvas.getContext('webgl2', contextOptions) as WebGL2RenderingContext | null;

      if (!gl) {
        console.warn('WebGL 2.0 not supported');
        return null;
      }

      // Check for required extensions
      const floatTexExt = gl.getExtension('EXT_color_buffer_float');
      if (!floatTexExt) {
        console.warn('EXT_color_buffer_float extension not available');
        // Continue anyway, we can work with UNSIGNED_BYTE textures
      }

      return new GPUContextImpl(gl, canvas, config);
    } catch (error) {
      console.warn('Failed to create GPU context:', error);
      return null;
    }
  }

  /**
   * Create a texture from ImageData
   */
  createTexture(source: ImageData): GPUTexture {
    return this.texturePool.createFromImageData(source);
  }

  /**
   * Create an empty texture
   */
  createEmptyTexture(width: number, height: number): GPUTexture {
    return this.texturePool.createEmpty(width, height);
  }

  /**
   * Retain a texture (increment ref count)
   */
  retainTexture(id: string): void {
    this.texturePool.retain(id);
  }

  /**
   * Release a texture (decrement ref count)
   */
  releaseTexture(id: string): void {
    this.texturePool.release(id);
  }

  /**
   * Get a compiled shader program
   */
  getProgram(name: string): WebGLProgram | null {
    return this.shaderRegistry.getRawProgram(name);
  }

  /**
   * Render to a texture using a shader program
   */
  renderToTexture(
    programName: string,
    uniforms: Record<string, unknown>,
    output: GPUTexture
  ): void {
    const gl = this.gl;
    const programInfo = this.shaderRegistry.getProgram(programName);

    if (!programInfo) {
      throw new Error(`Shader program not found: ${programName}`);
    }

    // Resize canvas if needed
    if (this.canvas.width !== output.width || this.canvas.height !== output.height) {
      this.canvas.width = output.width;
      this.canvas.height = output.height;
    }

    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
    gl.viewport(0, 0, output.width, output.height);

    // Use program
    gl.useProgram(programInfo.program);

    // Set uniforms using twgl - create a ProgramInfo-like object
    const uniformSetters = twgl.createUniformSetters(gl, programInfo.program);
    const attribSetters = twgl.createAttributeSetters(gl, programInfo.program);

    twgl.setUniforms(uniformSetters, uniforms);

    // Draw quad using twgl
    twgl.setBuffersAndAttributes(gl, attribSetters, this.quadBufferInfo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Download texture from GPU to CPU
   */
  downloadTexture(texture: GPUTexture): ImageData {
    return this.texturePool.download(texture);
  }

  /**
   * Dispose all GPU resources
   */
  dispose(): void {
    this.texturePool.dispose();
    this.shaderRegistry.dispose();
    this.isAvailable = false;
  }
}

/**
 * Create a GPU context
 */
export function createGPUContext(config?: GPUContextConfig): GPUContext | null {
  return GPUContextImpl.create(config);
}
