import { NodeDefinition, ExecutionContext } from '../../types/node';
import { isGPUTexture } from '../../types/data';

/**
 * Helper function to define a node with full type safety
 * This is a pass-through function that provides type checking
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  return definition;
}

/**
 * Ensure input is ImageData, downloading from GPU if necessary.
 * Use this in nodes that need to process pixel data on CPU.
 */
export function ensureImageData(
  input: unknown,
  context: ExecutionContext
): ImageData | null {
  if (!input) {
    return null;
  }

  if (isGPUTexture(input)) {
    if (!context.gpu) {
      throw new Error('GPU context required to download texture');
    }
    return context.gpu.downloadTexture(input);
  }

  // Check if it's an ImageData-like object
  if (
    typeof input === 'object' &&
    input !== null &&
    'data' in input &&
    'width' in input &&
    'height' in input
  ) {
    return input as ImageData;
  }

  return null;
}
