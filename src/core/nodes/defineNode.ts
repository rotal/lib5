import { NodeDefinition, ExecutionContext } from '../../types/node';
import { isGPUTexture, isFloatImage, imageDataToFloat, FloatImage } from '../../types/data';

/**
 * Helper function to define a node with full type safety
 * This is a pass-through function that provides type checking
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  return definition;
}

/**
 * Ensure input is FloatImage, converting from GPU texture or ImageData if necessary.
 * Use this in nodes that need to process pixel data on CPU.
 */
export function ensureFloatImage(
  input: unknown,
  context: ExecutionContext
): FloatImage | null {
  if (!input) {
    return null;
  }

  // Download from GPU if it's a texture
  if (isGPUTexture(input)) {
    if (!context.gpu) {
      throw new Error('GPU context required to download texture');
    }
    return context.gpu.downloadTexture(input);
  }

  // Already a FloatImage
  if (isFloatImage(input)) {
    return input;
  }

  // Convert ImageData to FloatImage
  if (input instanceof ImageData) {
    return imageDataToFloat(input);
  }

  return null;
}

/**
 * @deprecated Use ensureFloatImage instead
 */
export function ensureImageData(
  input: unknown,
  context: ExecutionContext
): FloatImage | null {
  return ensureFloatImage(input, context);
}
