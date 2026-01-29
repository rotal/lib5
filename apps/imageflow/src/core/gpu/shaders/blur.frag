#version 300 es
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
