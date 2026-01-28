import { NodeRegistry } from '../graph/NodeRegistry';

// Input nodes
import { ImageInputNode, ColorInputNode, NoiseNode } from './input';

// Output nodes
import { PreviewNode, ExportNode } from './output';

// Adjust nodes
import { BrightnessContrastNode, HueSaturationNode, LevelsNode, InvertNode } from './adjust';

// Transform nodes
import { RotateNode, FlipNode, ScaleNode, CropNode } from './transform';

// Filter nodes
import { BlurNode, SharpenNode, ConvolutionNode } from './filter';

// Composite nodes
import { BlendNode, MergeNode } from './composite';

// Mask nodes
import { ThresholdNode, MaskOperationsNode, ApplyMaskNode } from './mask';

// AI nodes
import { AIEnhanceNode, AIRemoveBackgroundNode, AICustomNode } from './ai';

// Utility nodes
import { SplitChannelsNode, MergeChannelsNode, MathNode, ReorderChannelsNode } from './utility';

/**
 * Register all built-in nodes with the registry
 */
export function registerAllNodes(): void {
  // Input
  NodeRegistry.register(ImageInputNode);
  NodeRegistry.register(ColorInputNode);
  NodeRegistry.register(NoiseNode);

  // Output
  NodeRegistry.register(PreviewNode);
  NodeRegistry.register(ExportNode);

  // Adjust
  NodeRegistry.register(BrightnessContrastNode);
  NodeRegistry.register(HueSaturationNode);
  NodeRegistry.register(LevelsNode);
  NodeRegistry.register(InvertNode);

  // Transform
  NodeRegistry.register(RotateNode);
  NodeRegistry.register(FlipNode);
  NodeRegistry.register(ScaleNode);
  NodeRegistry.register(CropNode);

  // Filter
  NodeRegistry.register(BlurNode);
  NodeRegistry.register(SharpenNode);
  NodeRegistry.register(ConvolutionNode);

  // Composite
  NodeRegistry.register(BlendNode);
  NodeRegistry.register(MergeNode);

  // Mask
  NodeRegistry.register(ThresholdNode);
  NodeRegistry.register(MaskOperationsNode);
  NodeRegistry.register(ApplyMaskNode);

  // AI
  NodeRegistry.register(AIEnhanceNode);
  NodeRegistry.register(AIRemoveBackgroundNode);
  NodeRegistry.register(AICustomNode);

  // Utility
  NodeRegistry.register(SplitChannelsNode);
  NodeRegistry.register(MergeChannelsNode);
  NodeRegistry.register(MathNode);
  NodeRegistry.register(ReorderChannelsNode);
}

// Re-export node definitions for direct access if needed
export {
  // Input
  ImageInputNode,
  ColorInputNode,
  NoiseNode,
  // Output
  PreviewNode,
  ExportNode,
  // Adjust
  BrightnessContrastNode,
  HueSaturationNode,
  LevelsNode,
  InvertNode,
  // Transform
  RotateNode,
  FlipNode,
  ScaleNode,
  CropNode,
  // Filter
  BlurNode,
  SharpenNode,
  ConvolutionNode,
  // Composite
  BlendNode,
  MergeNode,
  // Mask
  ThresholdNode,
  MaskOperationsNode,
  ApplyMaskNode,
  // AI
  AIEnhanceNode,
  AIRemoveBackgroundNode,
  AICustomNode,
  // Utility
  SplitChannelsNode,
  MergeChannelsNode,
  MathNode,
  ReorderChannelsNode,
};
