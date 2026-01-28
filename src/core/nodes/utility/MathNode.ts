import { defineNode } from '../defineNode';

export const MathNode = defineNode({
  type: 'utility/math',
  category: 'Utility',
  name: 'Math',
  description: 'Perform mathematical operations on numbers',
  icon: 'calculate',

  inputs: [
    {
      id: 'a',
      name: 'A',
      dataType: 'number',
      required: false,
      defaultValue: 0,
    },
    {
      id: 'b',
      name: 'B',
      dataType: 'number',
      required: false,
      defaultValue: 0,
    },
  ],

  outputs: [
    {
      id: 'result',
      name: 'Result',
      dataType: 'number',
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

    const a = (inputs.a as number) ?? defaultA;
    const b = (inputs.b as number) ?? defaultB;

    let result: number;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        result = b !== 0 ? a / b : 0;
        break;
      case 'power':
        result = Math.pow(a, b);
        break;
      case 'modulo':
        result = b !== 0 ? a % b : 0;
        break;
      case 'min':
        result = Math.min(a, b);
        break;
      case 'max':
        result = Math.max(a, b);
        break;
      case 'abs':
        result = Math.abs(a);
        break;
      case 'negate':
        result = -a;
        break;
      case 'sqrt':
        result = Math.sqrt(Math.abs(a));
        break;
      case 'sin':
        result = Math.sin(a * Math.PI / 180);
        break;
      case 'cos':
        result = Math.cos(a * Math.PI / 180);
        break;
      case 'round':
        result = Math.round(a);
        break;
      case 'floor':
        result = Math.floor(a);
        break;
      case 'ceil':
        result = Math.ceil(a);
        break;
      default:
        result = a;
    }

    return { result };
  },
});
