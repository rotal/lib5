#version 300 es
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
