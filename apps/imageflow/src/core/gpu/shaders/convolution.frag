#version 300 es
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
