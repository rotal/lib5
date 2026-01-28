#version 300 es
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
