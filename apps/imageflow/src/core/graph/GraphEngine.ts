import { Graph, GraphExecutionState } from '../../types/graph';
import { NodeRuntimeState, ExecutionContext } from '../../types/node';
import { PortValue, DataType, isGPUTexture, isFloatImage, coercePortValue, isIdentityLocalTransform, createPivotTransform, multiplyTransform, IDENTITY_TRANSFORM, FloatImage, imageDataToFloat, isIdentityTransform, applyTransformToImage } from '../../types/data';
import { GPUContext } from '../../types/gpu';
import { NodeRegistry } from './NodeRegistry';
import { topologicalSort, getPartialExecutionOrder } from './TopologicalSort';
import { validateGraph } from './GraphValidator';
import { createGPUContext } from '../gpu';

/**
 * Callback for execution events
 */
export interface ExecutionCallbacks {
  onNodeStart?: (nodeId: string) => void;
  onNodeProgress?: (nodeId: string, progress: number) => void;
  onNodeComplete?: (nodeId: string, outputs: Record<string, PortValue>) => void;
  onNodeError?: (nodeId: string, error: Error) => void;
  onExecutionStart?: () => void;
  onExecutionComplete?: (totalTime: number) => void;
  onExecutionError?: (error: Error) => void;
}

/**
 * Engine for executing node graphs
 */
export class GraphEngine {
  private graph: Graph;
  private state: GraphExecutionState;
  private outputCache: Map<string, Record<string, PortValue>> = new Map();
  private abortController: AbortController | null = null;
  private callbacks: ExecutionCallbacks = {};
  private gpuContext: GPUContext | null = null;

  constructor(graph: Graph) {
    this.graph = graph;
    this.state = this.createInitialState();
    this.initializeGPU();
  }

  /**
   * Initialize GPU context for accelerated processing
   */
  private initializeGPU(): void {
    try {
      this.gpuContext = createGPUContext({
        maxPoolSize: 10,
        preferHighPerformance: true,
      });
      if (this.gpuContext?.isAvailable) {
        console.log('GPU acceleration enabled (WebGL 2.0)');
      }
    } catch (error) {
      console.warn('GPU acceleration unavailable:', error);
      this.gpuContext = null;
    }
  }

  private createInitialState(): GraphExecutionState {
    const nodeStates: Record<string, NodeRuntimeState> = {};
    for (const nodeId of Object.keys(this.graph.nodes)) {
      nodeStates[nodeId] = {
        executionState: 'idle',
        progress: 0,
      };
    }

    return {
      isExecuting: false,
      executionOrder: [],
      nodeStates,
    };
  }

  /**
   * Set execution callbacks
   */
  setCallbacks(callbacks: ExecutionCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current execution state
   */
  getState(): GraphExecutionState {
    return this.state;
  }

  /**
   * Get cached output for a node
   */
  getNodeOutput(nodeId: string): Record<string, PortValue> | undefined {
    return this.outputCache.get(nodeId);
  }

  /**
   * Clear cached outputs
   */
  clearCache(): void {
    // Release GPU textures before clearing cache
    if (this.gpuContext) {
      for (const outputs of this.outputCache.values()) {
        for (const value of Object.values(outputs)) {
          if (isGPUTexture(value)) {
            this.gpuContext.releaseTexture(value.id);
          }
        }
      }
    }
    this.outputCache.clear();
  }

  /**
   * Mark nodes as dirty (needing re-execution)
   */
  markDirty(nodeIds: string[]): void {
    for (const nodeId of nodeIds) {
      this.outputCache.delete(nodeId);
      if (this.state.nodeStates[nodeId]) {
        this.state.nodeStates[nodeId].executionState = 'idle';
      }
    }
  }

  /**
   * Update the graph reference
   */
  updateGraph(graph: Graph): void {
    this.graph = graph;
    // Add state for any new nodes
    for (const nodeId of Object.keys(graph.nodes)) {
      if (!this.state.nodeStates[nodeId]) {
        this.state.nodeStates[nodeId] = {
          executionState: 'idle',
          progress: 0,
        };
      }
    }
    // Remove state for deleted nodes
    for (const nodeId of Object.keys(this.state.nodeStates)) {
      if (!graph.nodes[nodeId]) {
        delete this.state.nodeStates[nodeId];
        this.outputCache.delete(nodeId);
      }
    }
  }

  /**
   * Execute the entire graph
   */
  async execute(): Promise<void> {
    // Validate graph first
    const validation = validateGraph(this.graph);
    if (!validation.valid) {
      // Mark individual nodes with errors
      for (const error of validation.errors) {
        if (error.nodeId) {
          this.state.nodeStates[error.nodeId] = {
            executionState: 'error',
            progress: 0,
            error: error.message,
          };
          this.callbacks.onNodeError?.(error.nodeId, new Error(error.message));
        }
      }
      const errorMsg = validation.errors.map(e => e.message).join('; ');
      this.callbacks.onExecutionError?.(new Error(errorMsg));
      throw new Error(`Graph validation failed: ${errorMsg}`);
    }

    // Clear any previous validation errors from nodes that are now valid
    for (const nodeId of Object.keys(this.state.nodeStates)) {
      if (this.state.nodeStates[nodeId]?.executionState === 'error') {
        this.state.nodeStates[nodeId] = {
          executionState: 'idle',
          progress: 0,
        };
      }
    }

    // Get execution order
    const sortResult = topologicalSort(this.graph);
    if (sortResult.hasCycle) {
      throw new Error('Cannot execute graph with cycles');
    }

    await this.executeNodes(sortResult.order);
  }

  /**
   * Execute only dirty nodes and their dependents
   */
  async executePartial(dirtyNodeIds: string[]): Promise<void> {
    const order = getPartialExecutionOrder(this.graph, dirtyNodeIds);
    if (order.length === 0) return;

    // Clear cache for dirty nodes
    this.markDirty(dirtyNodeIds);

    await this.executeNodes(order);
  }

  /**
   * Execute a list of nodes in order
   */
  private async executeNodes(nodeIds: string[]): Promise<void> {
    const abortController = new AbortController();
    this.abortController = abortController;
    this.state.isExecuting = true;
    this.state.executionOrder = nodeIds;
    this.state.startTime = Date.now();

    this.callbacks.onExecutionStart?.();

    try {
      for (const nodeId of nodeIds) {
        if (abortController.signal.aborted) {
          throw new Error('Execution aborted');
        }

        // Skip if already cached
        if (this.outputCache.has(nodeId)) {
          continue;
        }

        await this.executeNode(nodeId, abortController.signal);
      }

      this.state.endTime = Date.now();
      const totalTime = this.state.endTime - this.state.startTime;
      this.callbacks.onExecutionComplete?.(totalTime);
    } catch (error) {
      this.state.error = (error as Error).message;
      this.callbacks.onExecutionError?.(error as Error);
      throw error;
    } finally {
      this.state.isExecuting = false;
      this.abortController = null;
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(nodeId: string, signal: AbortSignal): Promise<void> {
    const node = this.graph.nodes[nodeId];
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const definition = NodeRegistry.get(node.type);
    if (!definition) {
      throw new Error(`Unknown node type: ${node.type}`);
    }

    // Update state
    this.state.nodeStates[nodeId] = {
      executionState: 'running',
      progress: 0,
    };
    this.callbacks.onNodeStart?.(nodeId);

    try {
      // Gather inputs from connected nodes
      const inputs: Record<string, PortValue> = {};

      for (const inputDef of definition.inputs) {
        // Find edge connected to this input
        const edge = Object.values(this.graph.edges).find(
          e => e.targetNodeId === nodeId && e.targetPortId === inputDef.id
        );

        if (edge) {
          // Get output from source node's cache
          const sourceOutputs = this.outputCache.get(edge.sourceNodeId);
          if (sourceOutputs) {
            let value = sourceOutputs[edge.sourcePortId];

            // Auto-coerce between compatible but different port types
            const sourceNode = this.graph.nodes[edge.sourceNodeId];
            const sourceDef = sourceNode ? NodeRegistry.get(sourceNode.type) : undefined;
            const sourcePort = sourceDef?.outputs.find(o => o.id === edge.sourcePortId);
            const sourceType: DataType = sourcePort?.dataType ?? 'any';
            const targetType: DataType = inputDef.dataType;

            if (sourceType !== targetType && sourceType !== 'any' && targetType !== 'any') {
              // For number→image/mask, resolve dimensions from other image/mask inputs
              let coerceWidth = 512;
              let coerceHeight = 512;
              if (sourceType === 'number' && (targetType === 'image' || targetType === 'mask')) {
                // Scan already-resolved inputs for an image/mask to steal dimensions
                for (const resolved of Object.values(inputs)) {
                  if (resolved && isFloatImage(resolved)) {
                    coerceWidth = resolved.width;
                    coerceHeight = resolved.height;
                    break;
                  }
                }
              }
              value = coercePortValue(value, sourceType, targetType, coerceWidth, coerceHeight);
            }

            // Apply/bake transform if the input is a FloatImage with a non-identity transform
            // This ensures downstream nodes receive properly transformed pixel data
            if (isFloatImage(value) && value.transform && !isIdentityTransform(value.transform)) {
              value = applyTransformToImage(value);
            }

            inputs[inputDef.id] = value;
          }
        } else if (inputDef.defaultValue !== undefined) {
          inputs[inputDef.id] = inputDef.defaultValue;
        }
      }

      // Create execution context
      const context: ExecutionContext = {
        nodeId,
        graphId: this.graph.id,
        signal,
        reportProgress: (progress: number) => {
          this.state.nodeStates[nodeId].progress = progress;
          this.callbacks.onNodeProgress?.(nodeId, progress);
        },
        getCache: (key: string) => {
          const cached = this.outputCache.get(`${nodeId}:${key}`);
          return cached ? Object.values(cached)[0] : undefined;
        },
        setCache: (key: string, value: PortValue) => {
          this.outputCache.set(`${nodeId}:${key}`, { value });
        },
        gpu: this.gpuContext ?? undefined,
      };

      // Execute node
      const startTime = performance.now();
      let outputs = await definition.execute(inputs, node.parameters, context);
      const executionTime = performance.now() - startTime;

      // If preview is enabled, convert GPU textures to FloatImage for display
      // This must happen BEFORE applyLocalTransform so transform can be applied to FloatImage
      if (node.parameters.preview && this.gpuContext) {
        const previewOutputs: Record<string, PortValue> = {};
        for (const [key, value] of Object.entries(outputs)) {
          if (isGPUTexture(value)) {
            // Download texture to FloatImage for preview
            previewOutputs[key] = this.gpuContext.downloadTexture(value);
            // Release the GPU texture since we've downloaded it
            this.gpuContext.releaseTexture(value.id);
          } else {
            previewOutputs[key] = value;
          }
        }
        outputs = previewOutputs;
      }

      // Apply local transform if node has hasLocalTransform and transform is not identity
      // This applies transform to FloatImage/ImageData outputs (after GPU download if preview enabled)
      if (definition.hasLocalTransform && !isIdentityLocalTransform(node.parameters)) {
        outputs = this.applyLocalTransform(outputs, node.parameters, definition);
      }

      // Cache outputs
      this.outputCache.set(nodeId, outputs);

      // Update state
      this.state.nodeStates[nodeId] = {
        executionState: 'complete',
        progress: 1,
        lastExecutionTime: executionTime,
        outputs,
      };

      this.callbacks.onNodeComplete?.(nodeId, outputs);
    } catch (error) {
      this.state.nodeStates[nodeId] = {
        executionState: 'error',
        progress: 0,
        error: (error as Error).message,
      };
      this.callbacks.onNodeError?.(nodeId, error as Error);
      throw error;
    }
  }

  /**
   * Apply local transform parameters to node outputs.
   * Handles FloatImage, ImageData, and GPUTexture outputs.
   */
  private applyLocalTransform(
    outputs: Record<string, PortValue>,
    params: Record<string, unknown>,
    definition: { outputs: Array<{ id: string; dataType: string }> }
  ): Record<string, PortValue> {
    const tx = (params._tx as number) ?? 0;
    const ty = (params._ty as number) ?? 0;
    const sx = (params._sx as number) ?? 1;
    const sy = (params._sy as number) ?? 1;
    const angleDeg = (params._angle as number) ?? 0;
    const px = (params._px as number) ?? 0.5;
    const py = (params._py as number) ?? 0.5;

    const transformedOutputs: Record<string, PortValue> = {};

    for (const [key, value] of Object.entries(outputs)) {
      // Only transform image/mask outputs
      const outputDef = definition.outputs.find(o => o.id === key);
      const isImageOutput = outputDef && (outputDef.dataType === 'image' || outputDef.dataType === 'mask');

      if (isImageOutput && (isFloatImage(value) || value instanceof ImageData || isGPUTexture(value))) {
        // Convert to FloatImage if needed
        let img: FloatImage;
        if (value instanceof ImageData) {
          img = imageDataToFloat(value);
        } else if (isGPUTexture(value)) {
          // Download GPUTexture to FloatImage so we can attach transform
          if (this.gpuContext) {
            img = this.gpuContext.downloadTexture(value);
            this.gpuContext.releaseTexture(value.id);
          } else {
            // No GPU context, can't download - pass through unchanged
            transformedOutputs[key] = value;
            continue;
          }
        } else {
          img = value as FloatImage;
        }

        // Pivot point in pixel coordinates
        const pivotX = img.width * px;
        const pivotY = img.height * py;

        // Create transform matrix
        const angleRad = angleDeg * (Math.PI / 180);
        const nodeTransform = createPivotTransform(sx, sy, angleRad, pivotX, pivotY, tx, ty);

        // Compose with existing transform (if any)
        const existingTransform = img.transform ?? IDENTITY_TRANSFORM;
        const combinedTransform = multiplyTransform(nodeTransform, existingTransform);

        // Return image with updated transform - NO pixel resampling
        transformedOutputs[key] = {
          data: img.data,
          width: img.width,
          height: img.height,
          transform: combinedTransform,
          origin: img.origin,
        };
      } else {
        transformedOutputs[key] = value;
      }
    }

    return transformedOutputs;
  }

  /**
   * Abort current execution
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if execution is in progress
   */
  isExecuting(): boolean {
    return this.state.isExecuting;
  }

  /**
   * Get the GPU context (if available)
   */
  getGPUContext(): GPUContext | null {
    return this.gpuContext;
  }

  /**
   * Dispose the engine and release all resources
   */
  dispose(): void {
    this.abort();
    this.clearCache();
    if (this.gpuContext) {
      this.gpuContext.dispose();
      this.gpuContext = null;
    }
  }
}

/**
 * Create a new graph engine instance
 */
export function createGraphEngine(graph: Graph): GraphEngine {
  return new GraphEngine(graph);
}
