import { defineNode } from '../defineNode';

// Simple Perlin-like noise implementation
function noise2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise2D(x: number, y: number, seed: number): number {
  const corners =
    (noise2D(x - 1, y - 1, seed) +
      noise2D(x + 1, y - 1, seed) +
      noise2D(x - 1, y + 1, seed) +
      noise2D(x + 1, y + 1, seed)) /
    16;
  const sides =
    (noise2D(x - 1, y, seed) +
      noise2D(x + 1, y, seed) +
      noise2D(x, y - 1, seed) +
      noise2D(x, y + 1, seed)) /
    8;
  const center = noise2D(x, y, seed) / 4;
  return corners + sides + center;
}

function interpolatedNoise2D(x: number, y: number, seed: number): number {
  const intX = Math.floor(x);
  const fracX = x - intX;
  const intY = Math.floor(y);
  const fracY = y - intY;

  const v1 = smoothNoise2D(intX, intY, seed);
  const v2 = smoothNoise2D(intX + 1, intY, seed);
  const v3 = smoothNoise2D(intX, intY + 1, seed);
  const v4 = smoothNoise2D(intX + 1, intY + 1, seed);

  const i1 = v1 * (1 - fracX) + v2 * fracX;
  const i2 = v3 * (1 - fracX) + v4 * fracX;

  return i1 * (1 - fracY) + i2 * fracY;
}

function perlinNoise2D(
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  seed: number
): number {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += interpolatedNoise2D(x * frequency, y * frequency, seed + i) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

export const NoiseNode = defineNode({
  type: 'input/noise',
  category: 'Input',
  name: 'Noise',
  description: 'Generate procedural noise pattern',
  icon: 'grain',

  inputs: [],

  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'image',
    },
  ],

  parameters: [
    {
      id: 'noiseType',
      name: 'Type',
      type: 'select',
      default: 'perlin',
      options: [
        { label: 'Perlin', value: 'perlin' },
        { label: 'Simplex', value: 'simplex' },
        { label: 'White', value: 'white' },
        { label: 'Cellular', value: 'cellular' },
      ],
    },
    {
      id: 'width',
      name: 'Width',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 4096, step: 1 },
    },
    {
      id: 'height',
      name: 'Height',
      type: 'number',
      default: 512,
      constraints: { min: 1, max: 4096, step: 1 },
    },
    {
      id: 'scale',
      name: 'Scale',
      type: 'number',
      default: 50,
      constraints: { min: 1, max: 500, step: 1 },
    },
    {
      id: 'octaves',
      name: 'Octaves',
      type: 'number',
      default: 4,
      constraints: { min: 1, max: 8, step: 1 },
    },
    {
      id: 'persistence',
      name: 'Persistence',
      type: 'number',
      default: 0.5,
      constraints: { min: 0, max: 1, step: 0.05 },
    },
    {
      id: 'seed',
      name: 'Seed',
      type: 'number',
      default: 0,
      constraints: { min: 0, max: 99999, step: 1 },
    },
    {
      id: 'colored',
      name: 'Colored',
      type: 'boolean',
      default: false,
    },
  ],

  async execute(inputs, params, context) {
    const noiseType = params.noiseType as string;
    const width = params.width as number;
    const height = params.height as number;
    const scale = params.scale as number;
    const octaves = params.octaves as number;
    const persistence = params.persistence as number;
    const seed = params.seed as number;
    const colored = params.colored as boolean;

    const imageData = new ImageData(width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;

        let value: number;

        switch (noiseType) {
          case 'white':
            value = Math.random();
            break;
          case 'perlin':
          default:
            value = perlinNoise2D(x / scale, y / scale, octaves, persistence, seed);
            break;
        }

        const gray = Math.floor(value * 255);

        if (colored) {
          data[i] = Math.floor(perlinNoise2D(x / scale, y / scale, octaves, persistence, seed) * 255);
          data[i + 1] = Math.floor(perlinNoise2D(x / scale, y / scale, octaves, persistence, seed + 100) * 255);
          data[i + 2] = Math.floor(perlinNoise2D(x / scale, y / scale, octaves, persistence, seed + 200) * 255);
        } else {
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        data[i + 3] = 255;
      }

      // Report progress periodically
      if (y % 50 === 0) {
        context.reportProgress(y / height);
      }
    }

    context.reportProgress(1);
    return { image: imageData };
  },
});
