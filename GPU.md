# GPU Acceleration for Image Processing

## Overview
Add WebGL 2.0 GPU acceleration to the node-graph media editor for significant performance improvements on filter operations.

## Library Choice
**TWGL.js** (~12KB) - thin WebGL wrapper that handles boilerplate without hiding the API. Alternatives considered:
- gpu.js: Too abstracted for image pipelines
- regl: Larger, has state management conflicts
- Raw WebGL: Too verbose

## Implementation Plan

### Phase 1: GPU Infrastructure

**1.1 Create GPU types** (`src/types/gpu.ts`)
```typescript
interface GPUTexture {
  id: string;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface GPUContext {
  gl: WebGL2RenderingContext;
  isAvailable: boolean;
  createTexture(source: ImageData): GPUTexture;
  releaseTexture(id: string): void;
  getProgram(name: string): WebGLProgram;
  renderToTexture(program, inputs, output): void;
  downloadTexture(texture: GPUTexture): ImageData;
}
```

**1.2 Extend ExecutionContext** (`src/types/node.ts`)
- Add optional `gpu?: GPUContext` property

**1.3 Extend PortValue** (`src/types/data.ts`)
- Add `GPUTexture` to PortValue union
- Add `isGPUTexture()` type guard

**1.4 Create GPU core** (`src/core/gpu/`)
- `GPUContext.ts` - WebGL 2.0 initialization, OffscreenCanvas
- `TexturePool.ts` - Reference-counted texture management with recycling
- `ShaderRegistry.ts` - Shader compilation and caching

**1.5 Create shaders** (`src/core/gpu/shaders/`)
- `passthrough.vert` - Fullscreen quad vertex shader
- `blur.frag` - Separable Gaussian blur
- `convolution.frag` - Generic 3x3 kernel
- `blend.frag` - All 12 blend modes
- `scale.frag` - Bilinear/bicubic interpolation

### Phase 2: GraphEngine Integration

**Modify `src/core/graph/GraphEngine.ts`:**
- Initialize GPUContext in constructor
- Inject into ExecutionContext
- Release GPU textures on cache clear

### Phase 3: GPU-Enabled Nodes (Priority Order)

| Node | File | Expected Speedup |
|------|------|------------------|
| Blur | `src/core/nodes/filter/BlurNode.ts` | 50-100x |
| Convolution | `src/core/nodes/filter/ConvolutionNode.ts` | 20-60x |
| Blend | `src/core/nodes/composite/BlendNode.ts` | 30-50x |
| Scale | `src/core/nodes/transform/ScaleNode.ts` | 40-80x |

**Pattern for each node:**
```typescript
async execute(inputs, params, context) {
  if (context.gpu?.isAvailable) {
    return this.executeGPU(inputs, params, context.gpu);
  }
  return this.executeCPU(inputs, params, context); // existing code
}
```

### Phase 4: Output Nodes

**Modify Preview/Export nodes** to download GPU textures:
- Check if input is GPUTexture
- Call `gpu.downloadTexture()` before rendering/exporting

## File Structure
```
src/core/gpu/
  GPUContext.ts
  TexturePool.ts
  ShaderRegistry.ts
  shaders/
    passthrough.vert
    blur.frag
    convolution.frag
    blend.frag
    scale.frag
  index.ts
```

## Key Design Decisions

1. **Hybrid nodes** - GPU and CPU code in same file for maintainability
2. **Texture pooling** - Keep textures on GPU between nodes, only download at output
3. **Graceful fallback** - CPU path when WebGL 2.0 unavailable
4. **Reference counting** - Automatic texture cleanup

## Critical Files to Modify
- `src/types/node.ts` - Add GPUContext to ExecutionContext
- `src/types/data.ts` - Add GPUTexture to PortValue
- `src/core/graph/GraphEngine.ts` - Initialize and inject GPU context
- `src/core/nodes/filter/BlurNode.ts` - First GPU node implementation
- `src/core/nodes/filter/ConvolutionNode.ts`
- `src/core/nodes/composite/BlendNode.ts`
- `src/core/nodes/transform/ScaleNode.ts`

## Verification
1. Install TWGL: `npm install twgl.js`
2. Create a test graph with Blur node (radius 50) on a 1920x1080 image
3. Compare execution time before/after GPU implementation
4. Test in Chrome, Firefox, Edge
5. Test fallback by disabling WebGL in browser

## Performance Expectations

| Node | Image Size | CPU Time | GPU Time (Est.) | Speedup |
|------|------------|----------|-----------------|---------|
| Blur (r=50) | 1920x1080 | ~2000ms | ~20ms | 100x |
| Convolution | 1920x1080 | ~300ms | ~5ms | 60x |
| Blend | 1920x1080 | ~150ms | ~3ms | 50x |
| Scale (bicubic) | 1920->3840 | ~800ms | ~10ms | 80x |

## Shader Examples

### Gaussian Blur (blur.frag)
```glsl
#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_direction;  // (1/width, 0) or (0, 1/height)
uniform float u_radius;
uniform float u_sigma;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    vec4 sum = vec4(0.0);
    float weightSum = 0.0;
    float sigma2 = u_sigma * u_sigma * 2.0;

    for (float i = -u_radius; i <= u_radius; i += 1.0) {
        float weight = exp(-(i * i) / sigma2);
        vec2 offset = u_direction * i;
        sum += texture(u_texture, v_texCoord + offset) * weight;
        weightSum += weight;
    }

    fragColor = sum / weightSum;
}
```

### Blend Modes (blend.frag)
```glsl
#version 300 es
precision highp float;

uniform sampler2D u_base;
uniform sampler2D u_blend;
uniform int u_mode;
uniform float u_opacity;

in vec2 v_texCoord;
out vec4 fragColor;

vec3 blendMultiply(vec3 base, vec3 blend) { return base * blend; }
vec3 blendScreen(vec3 base, vec3 blend) { return 1.0 - (1.0 - base) * (1.0 - blend); }
vec3 blendOverlay(vec3 base, vec3 blend) {
    return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}

void main() {
    vec4 baseColor = texture(u_base, v_texCoord);
    vec4 blendColor = texture(u_blend, v_texCoord);

    vec3 result;
    if (u_mode == 1) result = blendMultiply(baseColor.rgb, blendColor.rgb);
    else if (u_mode == 2) result = blendScreen(baseColor.rgb, blendColor.rgb);
    else if (u_mode == 3) result = blendOverlay(baseColor.rgb, blendColor.rgb);
    else result = blendColor.rgb;

    float alpha = blendColor.a * u_opacity;
    fragColor = vec4(mix(baseColor.rgb, result, alpha), baseColor.a);
}
```
