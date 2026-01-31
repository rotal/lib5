import { defineNode } from '../defineNode';
import { Color } from '../../../types/data';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: Color, c2: Color, t: number): [number, number, number, number] {
  return [
    Math.round(lerp(c1.r, c2.r, t)),
    Math.round(lerp(c1.g, c2.g, t)),
    Math.round(lerp(c1.b, c2.b, t)),
    Math.round(lerp(c1.a, c2.a, t) * 255),
  ];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const RampNode = defineNode({
  type: 'input/ramp',
  category: 'Input',
  name: 'Ramp',
  description: 'Generate a gradient image',
  icon: 'gradient',

  inputs: [],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
  ],

  // Interactive gizmo for gradient endpoints
  gizmo: {
    handles: [
      {
        id: 'start',
        type: 'point',
        params: ['startX', 'startY'],
        coordSystem: 'normalized',
        label: 'Start',
        color: '#22c55e', // Green
      },
      {
        id: 'end',
        type: 'point',
        params: ['endX', 'endY'],
        coordSystem: 'normalized',
        label: 'End',
        color: '#ef4444', // Red
      },
      {
        id: 'gradient-line',
        type: 'line',
        params: ['startX', 'startY', 'endX', 'endY'],
        coordSystem: 'normalized',
        color: '#ffffff',
      },
    ],
  },

  parameters: [
    {
      id: 'mode',
      name: 'Mode',
      type: 'select',
      default: 'linear',
      options: [
        { label: 'Linear', value: 'linear' },
        { label: 'Radial', value: 'radial' },
        { label: 'Angular', value: 'angular' },
        { label: 'Diamond', value: 'diamond' },
      ],
    },
    {
      id: 'color1',
      name: 'Color 1',
      type: 'color',
      default: { r: 0, g: 0, b: 0, a: 1 },
    },
    {
      id: 'color2',
      name: 'Color 2',
      type: 'color',
      default: { r: 255, g: 255, b: 255, a: 1 },
    },
    {
      id: 'startX',
      name: 'Start X',
      type: 'number',
      default: 0.5,
      constraints: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'startY',
      name: 'Start Y',
      type: 'number',
      default: 0.0,
      constraints: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'endX',
      name: 'End X',
      type: 'number',
      default: 0.5,
      constraints: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'endY',
      name: 'End Y',
      type: 'number',
      default: 1.0,
      constraints: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'size',
      name: 'Size',
      type: 'size',
      default: { width: 512, height: 512, locked: false },
      sizeConstraints: { minWidth: 1, maxWidth: 4096, minHeight: 1, maxHeight: 4096, step: 1 },
    },
  ],

  async execute(inputs, params, context) {
    const mode = params.mode as string;
    const color1 = params.color1 as Color;
    const color2 = params.color2 as Color;
    const sx = params.startX as number;
    const sy = params.startY as number;
    const ex = params.endX as number;
    const ey = params.endY as number;
    const size = params.size as { width: number; height: number };
    const width = size.width;
    const height = size.height;

    const imageData = new ImageData(width, height);
    const data = imageData.data;

    // Convert normalized coords to pixel space
    const x0 = sx * width;
    const y0 = sy * height;
    const x1 = ex * width;
    const y1 = ey * height;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let t: number;

        switch (mode) {
          case 'linear': {
            if (dist < 0.0001) {
              t = 0;
            } else {
              // Project pixel onto start→end vector
              const vx = px - x0;
              const vy = py - y0;
              t = clamp01((vx * dx + vy * dy) / (dist * dist));
            }
            break;
          }
          case 'radial': {
            if (dist < 0.0001) {
              t = 0;
            } else {
              const vx = px - x0;
              const vy = py - y0;
              const d = Math.sqrt(vx * vx + vy * vy);
              t = clamp01(d / dist);
            }
            break;
          }
          case 'angular': {
            const vx = px - x0;
            const vy = py - y0;
            const refAngle = Math.atan2(dy, dx);
            const pixelAngle = Math.atan2(vy, vx);
            let angle = pixelAngle - refAngle;
            // Normalize to [0, 2π)
            angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            t = angle / (2 * Math.PI);
            break;
          }
          case 'diamond': {
            if (dist < 0.0001) {
              t = 0;
            } else {
              const vx = px - x0;
              const vy = py - y0;
              const d = Math.abs(vx) + Math.abs(vy);
              t = clamp01(d / dist);
            }
            break;
          }
          default:
            t = 0;
        }

        const [r, g, b, a] = lerpColor(color1, color2, t);
        const i = (py * width + px) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }

      if (py % 50 === 0) {
        context.reportProgress(py / height);
      }
    }

    context.reportProgress(1);
    return { image: imageData };
  },
});
