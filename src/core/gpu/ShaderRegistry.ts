import type { ShaderProgramInfo } from '../../types/gpu';

// Embedded shader sources

const PASSTHROUGH_VERT = `#version 300 es

// Fullscreen quad vertex shader for image processing
// Transforms a quad from [-1,1] to cover the viewport and generates texture coordinates

in vec2 position;
in vec2 texcoord;

out vec2 v_texCoord;

void main() {
  v_texCoord = texcoord;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const BLUR_FRAG = `#version 300 es
precision highp float;

// Separable Gaussian blur shader
// Performs a single-pass blur (horizontal or vertical based on u_direction)

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;      // 1.0 / texture dimensions
uniform vec2 u_direction;       // (1,0) for horizontal, (0,1) for vertical
uniform float u_kernel[101];    // Gaussian kernel weights (max radius 50)
uniform int u_kernelSize;       // Actual kernel size (radius * 2 + 1)
uniform int u_radius;           // Blur radius

void main() {
  vec4 sum = vec4(0.0);

  for (int i = 0; i < u_kernelSize; i++) {
    int offset = i - u_radius;
    vec2 sampleCoord = v_texCoord + u_direction * u_texelSize * float(offset);

    // Clamp to edge
    sampleCoord = clamp(sampleCoord, vec2(0.0), vec2(1.0));

    sum += texture(u_texture, sampleCoord) * u_kernel[i];
  }

  fragColor = sum;
}
`;

const CONVOLUTION_FRAG = `#version 300 es
precision highp float;

// Generic convolution kernel shader
// Supports arbitrary sized kernels up to 7x7

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_kernel[49];     // Max 7x7 kernel, flattened
uniform int u_kernelWidth;
uniform int u_kernelHeight;
uniform float u_strength;       // Blend with original (0-1)

void main() {
  int halfW = u_kernelWidth / 2;
  int halfH = u_kernelHeight / 2;

  vec4 sum = vec4(0.0);

  for (int ky = 0; ky < u_kernelHeight; ky++) {
    for (int kx = 0; kx < u_kernelWidth; kx++) {
      vec2 offset = vec2(float(kx - halfW), float(ky - halfH));
      vec2 sampleCoord = v_texCoord + offset * u_texelSize;

      // Clamp to edge
      sampleCoord = clamp(sampleCoord, vec2(0.0), vec2(1.0));

      float weight = u_kernel[ky * u_kernelWidth + kx];
      sum += texture(u_texture, sampleCoord) * weight;
    }
  }

  // Preserve alpha from original
  vec4 original = texture(u_texture, v_texCoord);

  // Blend convolved result with original based on strength
  vec3 blended = mix(original.rgb, sum.rgb, u_strength);

  fragColor = vec4(blended, original.a);
}
`;

const BLEND_FRAG = `#version 300 es
precision highp float;

// Blend mode shader supporting 12 Photoshop-style blend modes

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_base;
uniform sampler2D u_blend;
uniform sampler2D u_mask;
uniform int u_blendMode;        // 0-11 for different modes
uniform float u_opacity;        // 0-1
uniform bool u_hasMask;
uniform vec2 u_blendSize;       // Size of blend texture
uniform vec2 u_maskSize;        // Size of mask texture
uniform vec2 u_baseSize;        // Size of base texture

// Blend mode constants
const int MODE_NORMAL = 0;
const int MODE_MULTIPLY = 1;
const int MODE_SCREEN = 2;
const int MODE_OVERLAY = 3;
const int MODE_DARKEN = 4;
const int MODE_LIGHTEN = 5;
const int MODE_COLOR_DODGE = 6;
const int MODE_COLOR_BURN = 7;
const int MODE_HARD_LIGHT = 8;
const int MODE_SOFT_LIGHT = 9;
const int MODE_DIFFERENCE = 10;
const int MODE_EXCLUSION = 11;

float blendChannel(float base, float blend, int mode) {
  if (mode == MODE_MULTIPLY) {
    return base * blend;
  } else if (mode == MODE_SCREEN) {
    return 1.0 - (1.0 - base) * (1.0 - blend);
  } else if (mode == MODE_OVERLAY) {
    return base < 0.5 ? 2.0 * base * blend : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  } else if (mode == MODE_DARKEN) {
    return min(base, blend);
  } else if (mode == MODE_LIGHTEN) {
    return max(base, blend);
  } else if (mode == MODE_COLOR_DODGE) {
    return blend >= 1.0 ? 1.0 : min(1.0, base / (1.0 - blend));
  } else if (mode == MODE_COLOR_BURN) {
    return blend <= 0.0 ? 0.0 : max(0.0, 1.0 - (1.0 - base) / blend);
  } else if (mode == MODE_HARD_LIGHT) {
    return blend < 0.5 ? 2.0 * base * blend : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  } else if (mode == MODE_SOFT_LIGHT) {
    if (blend < 0.5) {
      return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
    } else {
      float d = base <= 0.25 ? ((16.0 * base - 12.0) * base + 4.0) * base : sqrt(base);
      return base + (2.0 * blend - 1.0) * (d - base);
    }
  } else if (mode == MODE_DIFFERENCE) {
    return abs(base - blend);
  } else if (mode == MODE_EXCLUSION) {
    return base + blend - 2.0 * base * blend;
  }
  // Normal mode
  return blend;
}

vec3 blendColors(vec3 base, vec3 blend, int mode) {
  return vec3(
    blendChannel(base.r, blend.r, mode),
    blendChannel(base.g, blend.g, mode),
    blendChannel(base.b, blend.b, mode)
  );
}

void main() {
  // Sample base texture
  vec4 baseColor = texture(u_base, v_texCoord);

  // Calculate pixel position in base texture coordinates
  vec2 pixelPos = v_texCoord * u_baseSize;

  // Check if within blend texture bounds
  if (pixelPos.x >= u_blendSize.x || pixelPos.y >= u_blendSize.y) {
    fragColor = baseColor;
    return;
  }

  // Sample blend texture (using base texture coordinates mapped to blend size)
  vec2 blendCoord = pixelPos / u_blendSize;
  vec4 blendColor = texture(u_blend, blendCoord);

  // Calculate blend alpha
  float blendAlpha = blendColor.a * u_opacity;

  // Apply mask if present
  if (u_hasMask && pixelPos.x < u_maskSize.x && pixelPos.y < u_maskSize.y) {
    vec2 maskCoord = pixelPos / u_maskSize;
    float maskValue = texture(u_mask, maskCoord).r;
    blendAlpha *= maskValue;
  }

  // Perform blend
  vec3 blendedRgb = blendColors(baseColor.rgb, blendColor.rgb, u_blendMode);

  // Mix with base based on alpha
  vec3 finalRgb = mix(baseColor.rgb, blendedRgb, blendAlpha);

  // Calculate output alpha
  float finalAlpha = min(1.0, baseColor.a + blendAlpha * (1.0 - baseColor.a));

  fragColor = vec4(finalRgb, finalAlpha);
}
`;

// ============ ADJUST SHADERS ============

const BRIGHTNESS_CONTRAST_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_brightness;  // -1 to 1
uniform float u_contrast;    // -1 to 1

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // Calculate contrast factor
  float contrastFactor = u_contrast >= 0.0 ? 1.0 + u_contrast * 2.0 : 1.0 + u_contrast;

  // Apply brightness and contrast
  vec3 rgb = color.rgb;
  rgb += u_brightness;
  rgb = (rgb - 0.5) * contrastFactor + 0.5;
  rgb = clamp(rgb, 0.0, 1.0);

  fragColor = vec4(rgb, color.a);
}
`;

const HUE_SATURATION_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_hueShift;      // 0 to 1 (normalized from -180 to 180)
uniform float u_saturation;    // -1 to 1
uniform float u_lightness;     // -1 to 1

vec3 rgbToHsl(vec3 rgb) {
  float maxC = max(max(rgb.r, rgb.g), rgb.b);
  float minC = min(min(rgb.r, rgb.g), rgb.b);
  float l = (maxC + minC) / 2.0;
  float h = 0.0, s = 0.0;

  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / d + (rgb.g < rgb.b ? 6.0 : 0.0);
    } else if (maxC == rgb.g) {
      h = (rgb.b - rgb.r) / d + 2.0;
    } else {
      h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;
  }

  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  float tt = t;
  if (tt < 0.0) tt += 1.0;
  if (tt > 1.0) tt -= 1.0;
  if (tt < 1.0/6.0) return p + (q - p) * 6.0 * tt;
  if (tt < 1.0/2.0) return q;
  if (tt < 2.0/3.0) return p + (q - p) * (2.0/3.0 - tt) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;

  if (s == 0.0) {
    return vec3(l);
  }

  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;

  return vec3(
    hue2rgb(p, q, h + 1.0/3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0/3.0)
  );
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 hsl = rgbToHsl(color.rgb);

  // Apply hue shift
  hsl.x = fract(hsl.x + u_hueShift);

  // Apply saturation
  if (u_saturation >= 0.0) {
    hsl.y = hsl.y + (1.0 - hsl.y) * u_saturation;
  } else {
    hsl.y = hsl.y + hsl.y * u_saturation;
  }
  hsl.y = clamp(hsl.y, 0.0, 1.0);

  // Apply lightness
  if (u_lightness >= 0.0) {
    hsl.z = hsl.z + (1.0 - hsl.z) * u_lightness;
  } else {
    hsl.z = hsl.z + hsl.z * u_lightness;
  }
  hsl.z = clamp(hsl.z, 0.0, 1.0);

  vec3 rgb = hslToRgb(hsl);
  fragColor = vec4(rgb, color.a);
}
`;

const LEVELS_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_inputBlack;   // 0-1
uniform float u_inputWhite;   // 0-1
uniform float u_gamma;        // 0.1-10
uniform float u_outputBlack;  // 0-1
uniform float u_outputWhite;  // 0-1

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  float inputRange = max(u_inputWhite - u_inputBlack, 0.001);
  float outputRange = u_outputWhite - u_outputBlack;

  vec3 rgb = color.rgb;

  // Apply input levels
  rgb = (rgb - u_inputBlack) / inputRange;
  rgb = clamp(rgb, 0.0, 1.0);

  // Apply gamma
  rgb = pow(rgb, vec3(1.0 / u_gamma));

  // Apply output levels
  rgb = rgb * outputRange + u_outputBlack;
  rgb = clamp(rgb, 0.0, 1.0);

  fragColor = vec4(rgb, color.a);
}
`;

const INVERT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform bool u_invertAlpha;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 rgb = 1.0 - color.rgb;
  float a = u_invertAlpha ? 1.0 - color.a : color.a;
  fragColor = vec4(rgb, a);
}
`;

// ============ TRANSFORM SHADERS ============

const FLIP_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform bool u_horizontal;
uniform bool u_vertical;

void main() {
  vec2 coord = v_texCoord;
  if (u_horizontal) coord.x = 1.0 - coord.x;
  if (u_vertical) coord.y = 1.0 - coord.y;
  fragColor = texture(u_texture, coord);
}
`;

const ROTATE_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_angle;        // radians
uniform vec2 u_srcSize;       // source dimensions
uniform vec2 u_dstSize;       // dest dimensions
uniform vec4 u_bgColor;       // background color

void main() {
  // Transform from dest to source coordinates
  vec2 dstCenter = u_dstSize / 2.0;
  vec2 srcCenter = u_srcSize / 2.0;

  // Get pixel position in dest
  vec2 dstPos = v_texCoord * u_dstSize;

  // Translate to center
  vec2 d = dstPos - dstCenter;

  // Rotate (inverse rotation to map dest -> src)
  float c = cos(-u_angle);
  float s = sin(-u_angle);
  vec2 srcPos = vec2(d.x * c - d.y * s, d.x * s + d.y * c);

  // Translate back
  srcPos += srcCenter;

  // Check bounds
  if (srcPos.x < 0.0 || srcPos.x >= u_srcSize.x || srcPos.y < 0.0 || srcPos.y >= u_srcSize.y) {
    fragColor = u_bgColor;
    return;
  }

  // Sample with bilinear interpolation
  vec2 texCoord = srcPos / u_srcSize;
  fragColor = texture(u_texture, texCoord);
}
`;

// ============ MASK SHADERS ============

const THRESHOLD_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_threshold;    // 0-1
uniform float u_softness;     // 0-0.5
uniform bool u_invert;
uniform int u_channel;        // 0=lum, 1=r, 2=g, 3=b, 4=a

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  float value;
  if (u_channel == 1) {
    value = color.r;
  } else if (u_channel == 2) {
    value = color.g;
  } else if (u_channel == 3) {
    value = color.b;
  } else if (u_channel == 4) {
    value = color.a;
  } else {
    // Luminance
    value = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }

  float maskValue;
  if (u_softness == 0.0) {
    maskValue = value >= u_threshold ? 1.0 : 0.0;
  } else {
    float low = max(0.0, u_threshold - u_softness);
    float high = min(1.0, u_threshold + u_softness);
    maskValue = smoothstep(low, high, value);
  }

  if (u_invert) {
    maskValue = 1.0 - maskValue;
  }

  fragColor = vec4(vec3(maskValue), 1.0);
}
`;

// ============ UTILITY SHADERS ============

const CHANNEL_EXTRACT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform int u_channel;  // 0=r, 1=g, 2=b, 3=a

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float value;
  if (u_channel == 0) value = color.r;
  else if (u_channel == 1) value = color.g;
  else if (u_channel == 2) value = color.b;
  else value = color.a;
  fragColor = vec4(vec3(value), 1.0);
}
`;

const CHANNEL_MERGE_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_redTex;
uniform sampler2D u_greenTex;
uniform sampler2D u_blueTex;
uniform sampler2D u_alphaTex;
uniform bool u_hasRed;
uniform bool u_hasGreen;
uniform bool u_hasBlue;
uniform bool u_hasAlpha;
uniform vec4 u_defaults;  // default values for missing channels

void main() {
  float r = u_hasRed ? texture(u_redTex, v_texCoord).r : u_defaults.r;
  float g = u_hasGreen ? texture(u_greenTex, v_texCoord).r : u_defaults.g;
  float b = u_hasBlue ? texture(u_blueTex, v_texCoord).r : u_defaults.b;
  float a = u_hasAlpha ? texture(u_alphaTex, v_texCoord).r : u_defaults.a;
  fragColor = vec4(r, g, b, a);
}
`;

const CHANNEL_REORDER_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform ivec4 u_channelMap;  // x=red src, y=green src, z=blue src, w=alpha src
                              // 0=r, 1=g, 2=b, 3=a, 4=zero, 5=one

float getChannel(vec4 color, int ch) {
  if (ch == 0) return color.r;
  if (ch == 1) return color.g;
  if (ch == 2) return color.b;
  if (ch == 3) return color.a;
  if (ch == 4) return 0.0;
  return 1.0;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(
    getChannel(color, u_channelMap.x),
    getChannel(color, u_channelMap.y),
    getChannel(color, u_channelMap.z),
    getChannel(color, u_channelMap.w)
  );
}
`;

const SHARPEN_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform sampler2D u_blurred;
uniform float u_amount;
uniform float u_threshold;  // 0-1
uniform vec2 u_texelSize;

void main() {
  vec4 original = texture(u_texture, v_texCoord);
  vec4 blurred = texture(u_blurred, v_texCoord);

  vec3 diff = original.rgb - blurred.rgb;

  // Apply threshold
  vec3 mask = step(vec3(u_threshold), abs(diff));
  diff *= mask;

  vec3 sharpened = original.rgb + diff * u_amount;
  sharpened = clamp(sharpened, 0.0, 1.0);

  fragColor = vec4(sharpened, original.a);
}
`;

// ============ SCALE SHADER ============

const TRANSLATE_FRAG = `#version 300 es
precision highp float;

// Image translation shader with edge handling modes

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_offset;          // Offset in pixels
uniform vec2 u_size;            // Image dimensions
uniform int u_edgeMode;         // 0=transparent, 1=wrap, 2=clamp
uniform vec4 u_bgColor;         // Background color (for transparent mode)

const int EDGE_TRANSPARENT = 0;
const int EDGE_WRAP = 1;
const int EDGE_CLAMP = 2;

void main() {
  // Calculate source coordinate
  vec2 srcCoord = v_texCoord - u_offset / u_size;

  if (u_edgeMode == EDGE_WRAP) {
    srcCoord = fract(srcCoord);
  } else if (u_edgeMode == EDGE_CLAMP) {
    srcCoord = clamp(srcCoord, vec2(0.0), vec2(1.0));
  } else {
    // Transparent - check bounds
    if (srcCoord.x < 0.0 || srcCoord.x > 1.0 || srcCoord.y < 0.0 || srcCoord.y > 1.0) {
      fragColor = u_bgColor;
      return;
    }
  }

  fragColor = texture(u_texture, srcCoord);
}
`;

const SCALE_FRAG = `#version 300 es
precision highp float;

// Image scaling shader with bilinear and bicubic interpolation

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_srcSize;         // Source texture dimensions
uniform vec2 u_dstSize;         // Destination texture dimensions
uniform int u_interpolation;    // 0=nearest, 1=bilinear, 2=bicubic

const int INTERP_NEAREST = 0;
const int INTERP_BILINEAR = 1;
const int INTERP_BICUBIC = 2;

// Bicubic interpolation weight function (Catmull-Rom)
float cubicWeight(float x) {
  const float a = -0.5;
  float absX = abs(x);

  if (absX <= 1.0) {
    return (a + 2.0) * absX * absX * absX - (a + 3.0) * absX * absX + 1.0;
  } else if (absX < 2.0) {
    return a * absX * absX * absX - 5.0 * a * absX * absX + 8.0 * a * absX - 4.0 * a;
  }
  return 0.0;
}

vec4 sampleNearest(vec2 coord) {
  return texture(u_texture, coord);
}

vec4 sampleBilinear(vec2 coord) {
  return texture(u_texture, coord);
}

vec4 sampleBicubic(vec2 coord) {
  vec2 texelSize = 1.0 / u_srcSize;
  vec2 texelCoord = coord * u_srcSize - 0.5;
  vec2 frac = fract(texelCoord);
  vec2 base = floor(texelCoord);

  vec4 sum = vec4(0.0);

  for (int j = -1; j <= 2; j++) {
    for (int i = -1; i <= 2; i++) {
      vec2 samplePos = (base + vec2(float(i), float(j)) + 0.5) * texelSize;
      samplePos = clamp(samplePos, vec2(0.0), vec2(1.0));

      float wx = cubicWeight(float(i) - frac.x);
      float wy = cubicWeight(float(j) - frac.y);

      sum += texture(u_texture, samplePos) * wx * wy;
    }
  }

  return clamp(sum, vec4(0.0), vec4(1.0));
}

void main() {
  vec4 color;

  if (u_interpolation == INTERP_NEAREST) {
    color = sampleNearest(v_texCoord);
  } else if (u_interpolation == INTERP_BILINEAR) {
    color = sampleBilinear(v_texCoord);
  } else {
    color = sampleBicubic(v_texCoord);
  }

  fragColor = color;
}
`;

/**
 * Registry for compiled shader programs.
 * Handles shader compilation, caching, and uniform management.
 */
export class ShaderRegistry {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, ShaderProgramInfo> = new Map();
  private vertexShader: WebGLShader | null = null;

  // Shader source registry
  private static readonly FRAGMENT_SHADERS: Record<string, string> = {
    blur: BLUR_FRAG,
    convolution: CONVOLUTION_FRAG,
    blend: BLEND_FRAG,
    scale: SCALE_FRAG,
    translate: TRANSLATE_FRAG,
    brightness_contrast: BRIGHTNESS_CONTRAST_FRAG,
    hue_saturation: HUE_SATURATION_FRAG,
    levels: LEVELS_FRAG,
    invert: INVERT_FRAG,
    flip: FLIP_FRAG,
    rotate: ROTATE_FRAG,
    threshold: THRESHOLD_FRAG,
    channel_extract: CHANNEL_EXTRACT_FRAG,
    channel_merge: CHANNEL_MERGE_FRAG,
    channel_reorder: CHANNEL_REORDER_FRAG,
    sharpen: SHARPEN_FRAG,
  };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.compileVertexShader();
  }

  /**
   * Compile the shared vertex shader
   */
  private compileVertexShader(): void {
    const gl = this.gl;
    const shader = gl.createShader(gl.VERTEX_SHADER);
    if (!shader) {
      throw new Error('Failed to create vertex shader');
    }

    gl.shaderSource(shader, PASSTHROUGH_VERT);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Vertex shader compilation failed: ${info}`);
    }

    this.vertexShader = shader;
  }

  /**
   * Compile a fragment shader
   */
  private compileFragmentShader(source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!shader) {
      throw new Error('Failed to create fragment shader');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Fragment shader compilation failed: ${info}`);
    }

    return shader;
  }

  /**
   * Link a shader program
   */
  private linkProgram(fragmentShader: WebGLShader): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program || !this.vertexShader) {
      throw new Error('Failed to create shader program');
    }

    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader program linking failed: ${info}`);
    }

    return program;
  }

  /**
   * Get or compile a shader program by name
   */
  getProgram(name: string): ShaderProgramInfo | null {
    // Check cache
    const cached = this.programs.get(name);
    if (cached) {
      return cached;
    }

    // Get shader source
    const fragmentSource = ShaderRegistry.FRAGMENT_SHADERS[name];
    if (!fragmentSource) {
      console.warn(`Unknown shader: ${name}`);
      return null;
    }

    try {
      // Compile and link
      const fragmentShader = this.compileFragmentShader(fragmentSource);
      const program = this.linkProgram(fragmentShader);

      // We can delete the fragment shader after linking
      this.gl.deleteShader(fragmentShader);

      // Extract uniform and attribute locations
      const uniformLocations = new Map<string, WebGLUniformLocation>();
      const attributeLocations = new Map<string, number>();

      const gl = this.gl;

      // Get all active uniforms
      const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uniformCount; i++) {
        const info = gl.getActiveUniform(program, i);
        if (info) {
          const location = gl.getUniformLocation(program, info.name);
          if (location) {
            uniformLocations.set(info.name, location);
          }
        }
      }

      // Get all active attributes
      const attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < attributeCount; i++) {
        const info = gl.getActiveAttrib(program, i);
        if (info) {
          const location = gl.getAttribLocation(program, info.name);
          if (location >= 0) {
            attributeLocations.set(info.name, location);
          }
        }
      }

      const programInfo: ShaderProgramInfo = {
        program,
        uniformLocations,
        attributeLocations,
      };

      this.programs.set(name, programInfo);
      return programInfo;
    } catch (error) {
      console.error(`Failed to compile shader ${name}:`, error);
      return null;
    }
  }

  /**
   * Get the raw WebGLProgram by name
   */
  getRawProgram(name: string): WebGLProgram | null {
    const info = this.getProgram(name);
    return info?.program ?? null;
  }

  /**
   * Dispose all shader programs
   */
  dispose(): void {
    const gl = this.gl;

    for (const info of this.programs.values()) {
      gl.deleteProgram(info.program);
    }
    this.programs.clear();

    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }
  }
}
