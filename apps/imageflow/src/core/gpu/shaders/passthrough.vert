#version 300 es

// Fullscreen quad vertex shader for image processing
// Transforms a quad from [-1,1] to cover the viewport and generates texture coordinates

in vec2 position;
in vec2 texcoord;

out vec2 v_texCoord;

void main() {
  v_texCoord = texcoord;
  gl_Position = vec4(position, 0.0, 1.0);
}
