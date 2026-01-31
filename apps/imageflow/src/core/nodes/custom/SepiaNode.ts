import { defineCustomGPUNode } from './defineCustomGPUNode';

export const SepiaNode = defineCustomGPUNode({
  type: 'custom/sepia',
  category: 'Custom',
  name: 'Sepia Tone',
  description: 'Apply a warm sepia tone effect',
  icon: 'photo_filter',

  inputs: [
    { id: 'image', name: 'Image', dataType: 'image', required: true },
  ],

  outputs: [
    { id: 'image', name: 'Image', dataType: 'image' },
  ],

  parameters: [
    {
      id: 'intensity',
      name: 'Intensity',
      type: 'number',
      default: 100,
      constraints: { min: 0, max: 100, step: 1 },
      uniform: { normalize: { divide: 100 } },
    },
  ],

  shaderBody: `
    vec4 color = texture(u_image, v_texCoord);
    vec3 sepia = vec3(
      dot(color.rgb, vec3(0.393, 0.769, 0.189)),
      dot(color.rgb, vec3(0.349, 0.686, 0.168)),
      dot(color.rgb, vec3(0.272, 0.534, 0.131))
    );
    fragColor = vec4(mix(color.rgb, sepia, u_intensity), color.a);
  `,
});
