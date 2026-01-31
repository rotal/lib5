import { defineNode, ensureFloatImage } from '../defineNode';
import { FloatImage, createFloatImage, isFloatImage, isGPUTexture } from '../../../types/data';

/** Apply a scalar math operation */
function applyOp(op: string, a: number, b: number): number {
  switch (op) {
    case 'add': return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide': return b !== 0 ? a / b : 0;
    case 'power': return Math.pow(a, b);
    case 'modulo': return b !== 0 ? a % b : 0;
    case 'min': return Math.min(a, b);
    case 'max': return Math.max(a, b);
    case 'abs': return Math.abs(a);
    case 'negate': return -a;
    case 'sqrt': return Math.sqrt(Math.abs(a));
    case 'sin': return Math.sin(a * Math.PI / 180);
    case 'cos': return Math.cos(a * Math.PI / 180);
    case 'round': return Math.round(a);
    case 'floor': return Math.floor(a);
    case 'ceil': return Math.ceil(a);
    default: return a;
  }
}

function isImageLike(value: unknown): boolean {
  return value instanceof ImageData || isFloatImage(value) || isGPUTexture(value);
}

export const MathNode = defineNode({
  type: 'utility/math',
  category: 'Utility',
  name: 'Math',
  description: 'Perform mathematical operations on numbers, images, or masks',
  icon: 'calculate',
  hasLocalTransform: true,

  inputs: [
    {
      id: 'a',
      name: 'A',
      dataType: 'any',
      required: false,
    },
    {
      id: 'b',
      name: 'B',
      dataType: 'any',
      required: false,
    },
  ],

  outputs: [
    {
      id: 'result',
      name: 'Result',
      dataType: 'any',
    },
  ],

  parameters: [
    {
      id: 'operation',
      name: 'Operation',
      type: 'select',
      default: 'add',
      options: [
        { label: 'Add (A + B)', value: 'add' },
        { label: 'Subtract (A - B)', value: 'subtract' },
        { label: 'Multiply (A * B)', value: 'multiply' },
        { label: 'Divide (A / B)', value: 'divide' },
        { label: 'Power (A ^ B)', value: 'power' },
        { label: 'Modulo (A % B)', value: 'modulo' },
        { label: 'Min (A, B)', value: 'min' },
        { label: 'Max (A, B)', value: 'max' },
        { label: 'Absolute (|A|)', value: 'abs' },
        { label: 'Negate (-A)', value: 'negate' },
        { label: 'Square Root', value: 'sqrt' },
        { label: 'Sin (degrees)', value: 'sin' },
        { label: 'Cos (degrees)', value: 'cos' },
        { label: 'Round', value: 'round' },
        { label: 'Floor', value: 'floor' },
        { label: 'Ceil', value: 'ceil' },
      ],
    },
    {
      id: 'defaultA',
      name: 'Default A',
      type: 'number',
      default: 0,
      constraints: { min: -999999, max: 999999, step: 0.1 },
    },
    {
      id: 'defaultB',
      name: 'Default B',
      type: 'number',
      default: 1,
      constraints: { min: -999999, max: 999999, step: 0.1 },
    },
  ],

  async execute(inputs, params, context) {
    const operation = params.operation as string;
    const defaultA = params.defaultA as number;
    const defaultB = params.defaultB as number;

    const rawA = inputs.a;
    const rawB = inputs.b;

    const aIsImage = isImageLike(rawA);
    const bIsImage = isImageLike(rawB);

    // --- Image path: at least one input is an image/mask ---
    if (aIsImage || bIsImage) {
      let imgA: FloatImage | null = null;
      let imgB: FloatImage | null = null;
      let scalarA = defaultA;
      let scalarB = defaultB;

      if (aIsImage) {
        imgA = ensureFloatImage(rawA, context);
      } else {
        scalarA = (rawA as number) ?? defaultA;
      }

      if (bIsImage) {
        imgB = ensureFloatImage(rawB, context);
      } else {
        scalarB = (rawB as number) ?? defaultB;
      }

      // Determine output dimensions from whichever image is available
      const ref = imgA || imgB;
      if (!ref) return { result: null };
      const { width, height } = ref;
      const out = createFloatImage(width, height);

      const srcA = imgA?.data;
      const srcB = imgB?.data;
      const dst = out.data;
      const len = width * height * 4;

      for (let i = 0; i < len; i++) {
        const a = srcA ? srcA[i] : scalarA;
        const b = srcB ? srcB[i] : scalarB;
        dst[i] = applyOp(operation, a, b);
      }

      return { result: out };
    }

    // --- Scalar path: both inputs are numbers ---
    const a = (rawA as number) ?? defaultA;
    const b = (rawB as number) ?? defaultB;

    return { result: applyOp(operation, a, b) };
  },
});
