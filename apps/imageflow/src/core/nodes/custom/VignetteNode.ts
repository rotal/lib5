import { defineCustomGPUNode } from './defineCustomGPUNode';

export const VignetteNode = defineCustomGPUNode({
  type: 'custom/vignette',
  category: 'Custom',
  name: 'Vignette',
  description: 'Darken the edges of the image',
  icon: 'vignette',

  inputs: [
    { id: 'image', name: 'Image', dataType: 'image', required: true },
  ],

  outputs: [
    { id: 'image', name: 'Image', dataType: 'image' },
  ],

  parameters: [
    {
      id: 'radius',
      name: 'Radius',
      type: 'number',
      default: 50,
      constraints: { min: 0, max: 100, step: 1 },
      uniform: { normalize: { divide: 100 } },
    },
    {
      id: 'softness',
      name: 'Softness',
      type: 'number',
      default: 30,
      constraints: { min: 0, max: 100, step: 1 },
      uniform: { normalize: { divide: 100 } },
    },
  ],

  shaderBody: `
    vec4 color = texture(u_image, v_texCoord);
    vec2 center = vec2(0.5);
    float dist = distance(v_texCoord, center) * 1.414; // normalize to 0-1 for corners
    float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
    fragColor = vec4(color.rgb * vignette, color.a);
  `,
});
