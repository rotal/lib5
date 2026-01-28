import type { GPUTexture } from '../../types/gpu';
import type { FloatImage } from '../../types/data';

/**
 * Reference-counted texture pool for GPU memory management.
 * Recycles textures of matching dimensions to reduce allocation overhead.
 */
export class TexturePool {
  private textures: Map<string, GPUTexture> = new Map();
  private freePool: Map<string, GPUTexture[]> = new Map();
  private gl: WebGL2RenderingContext;
  private nextId = 0;
  private maxPoolSize: number;

  constructor(gl: WebGL2RenderingContext, maxPoolSize = 10) {
    this.gl = gl;
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get a dimension key for pooling textures of similar size
   */
  private getDimensionKey(width: number, height: number): string {
    return `${width}x${height}`;
  }

  /**
   * Create a new texture from ImageData
   */
  createFromImageData(source: ImageData): GPUTexture {
    const gl = this.gl;
    const { width, height } = source;

    // Try to reuse a pooled texture of the same size
    const dimKey = this.getDimensionKey(width, height);
    const pooled = this.freePool.get(dimKey);
    if (pooled && pooled.length > 0) {
      const reused = pooled.pop()!;
      reused.refCount = 1;

      // Upload new data to reused texture (with Y flip for standard OpenGL orientation)
      gl.bindTexture(gl.TEXTURE_2D, reused.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      this.textures.set(reused.id, reused);
      return reused;
    }

    // Create new texture
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Flip Y on upload so texture v=0 is bottom of image (standard OpenGL convention)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create framebuffer for rendering to this texture
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new Error('Failed to create WebGL framebuffer');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const id = `tex_${this.nextId++}`;
    const gpuTexture: GPUTexture = {
      id,
      texture,
      framebuffer,
      width,
      height,
      refCount: 1,
    };

    this.textures.set(id, gpuTexture);
    return gpuTexture;
  }

  /**
   * Create a new texture from FloatImage (0.0-1.0 range)
   */
  createFromFloatImage(source: FloatImage): GPUTexture {
    const { width, height, data } = source;

    // Convert FloatImage to ImageData for GPU upload
    const imageData = new ImageData(width, height);
    const outData = imageData.data;

    for (let i = 0; i < data.length; i++) {
      // Clamp to 0-1 and convert to 0-255
      outData[i] = Math.round(Math.max(0, Math.min(1, data[i])) * 255);
    }

    return this.createFromImageData(imageData);
  }

  /**
   * Create an empty texture with specified dimensions
   */
  createEmpty(width: number, height: number): GPUTexture {
    const gl = this.gl;

    // Try to reuse a pooled texture of the same size
    const dimKey = this.getDimensionKey(width, height);
    const pooled = this.freePool.get(dimKey);
    if (pooled && pooled.length > 0) {
      const reused = pooled.pop()!;
      reused.refCount = 1;
      this.textures.set(reused.id, reused);
      return reused;
    }

    // Create new texture
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Create framebuffer
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new Error('Failed to create WebGL framebuffer');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const id = `tex_${this.nextId++}`;
    const gpuTexture: GPUTexture = {
      id,
      texture,
      framebuffer,
      width,
      height,
      refCount: 1,
    };

    this.textures.set(id, gpuTexture);
    return gpuTexture;
  }

  /**
   * Increment reference count
   */
  retain(id: string): void {
    const tex = this.textures.get(id);
    if (tex) {
      tex.refCount++;
    }
  }

  /**
   * Decrement reference count and pool if zero
   */
  release(id: string): void {
    const tex = this.textures.get(id);
    if (!tex) return;

    tex.refCount--;
    if (tex.refCount <= 0) {
      this.textures.delete(id);

      // Add to free pool for reuse
      const dimKey = this.getDimensionKey(tex.width, tex.height);
      let pool = this.freePool.get(dimKey);
      if (!pool) {
        pool = [];
        this.freePool.set(dimKey, pool);
      }

      if (pool.length < this.maxPoolSize) {
        pool.push(tex);
      } else {
        // Pool full, destroy texture
        this.gl.deleteTexture(tex.texture);
        this.gl.deleteFramebuffer(tex.framebuffer);
      }
    }
  }

  /**
   * Get a texture by ID
   */
  get(id: string): GPUTexture | undefined {
    return this.textures.get(id);
  }

  /**
   * Download texture data to CPU as FloatImage (0.0-1.0 range)
   *
   * With UNPACK_FLIP_Y_WEBGL=true on upload:
   * - Texture v=0 = bottom of original, v=1 = top of original
   * - Framebuffer bottom samples v=0 = bottom of original
   * - Framebuffer top samples v=1 = top of original
   * - readPixels row 0 = framebuffer bottom = original bottom
   * - readPixels row N = framebuffer top = original top
   * - Output row 0 should be top, row N should be bottom
   * So we need to flip: output row 0 gets readPixels row N, etc.
   */
  download(texture: GPUTexture): FloatImage {
    const gl = this.gl;
    const { width, height, framebuffer } = texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Convert to FloatImage with vertical flip
    const floatData = new Float32Array(width * height * 4);
    const scale = 1 / 255;
    const rowSize = width * 4;

    for (let y = 0; y < height; y++) {
      const srcOffset = (height - 1 - y) * rowSize;
      const dstOffset = y * rowSize;
      for (let x = 0; x < rowSize; x++) {
        floatData[dstOffset + x] = pixels[srcOffset + x] * scale;
      }
    }

    return { data: floatData, width, height };
  }

  /**
   * Download texture data to CPU as ImageData (0-255 range)
   * Used for canvas display
   */
  downloadAsImageData(texture: GPUTexture): ImageData {
    const gl = this.gl;
    const { width, height, framebuffer } = texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Flip vertically
    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const srcOffset = (height - 1 - y) * rowSize;
      const dstOffset = y * rowSize;
      flipped.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
    }

    return new ImageData(flipped, width, height);
  }

  /**
   * Dispose all textures
   */
  dispose(): void {
    for (const tex of this.textures.values()) {
      this.gl.deleteTexture(tex.texture);
      this.gl.deleteFramebuffer(tex.framebuffer);
    }
    this.textures.clear();

    for (const pool of this.freePool.values()) {
      for (const tex of pool) {
        this.gl.deleteTexture(tex.texture);
        this.gl.deleteFramebuffer(tex.framebuffer);
      }
    }
    this.freePool.clear();
  }
}
