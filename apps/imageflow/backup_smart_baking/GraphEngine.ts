import { Graph, GraphExecutionState } from '../../types/graph';
import { NodeRuntimeState, ExecutionContext } from '../../types/node';
import { PortValue, DataType, isGPUTexture, isFloatImage, coercePortValue, createPivotTransform, multiplyTransform, IDENTITY_TRANSFORM, FloatImage, imageDataToFloat, isIdentityTransform, applyTransformToImage, Color, Transform2D } from '../../types/data';
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
   * Execute only a single node using cached inputs (for interactive editing).
   * Does NOT re-execute upstream nodes - uses whatever is in cache.
   * OPTIMIZATION: If only transform params changed and we have cached output,
   * just update the transform without re-executing (no memory allocation).
   */
  async executeSingleNode(nodeId: string): Promise<void> {
    const node = this.graph.nodes[nodeId];
    if (!node) return;

    const definition = NodeRegistry.get(node.type);
    if (!definition) return;

    // OPTIMIZATION: If node has local transform and we have cached output,
    // try to just update the transform instead of re-executing
    const cachedOutput = this.outputCache.get(nodeId);
    if (definition.hasLocalTransform && cachedOutput) {
      const updated = this.tryUpdateTransformOnly(nodeId, cachedOutput, node.parameters, definition);
      if (updated) {
        // Successfully updated transform without re-execution
        this.callbacks.onNodeComplete?.(nodeId, cachedOutput);
        return;
      }
    }

    // Abort any previous execution to prevent race conditions during rapid updates
    if (this.abortController) {
      this.abortController.abort();
    }

    // Clear cache for this node only (force re-execute)
    this.outputCache.delete(nodeId);

    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      await this.executeNode(nodeId, abortController.signal);
    } catch (error) {
      // Ignore abort errors - they're expected when a new execution supersedes this one
      if (error instanceof Error && error.message === 'Execution aborted') {
        return;
      }
      console.error('Single node execution failed:', error);
    } finally {
      // Only clear if this is still the active controller
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  /**
   * Try to update just the transform on cached outputs without re-executing.
   * Returns true if successful, false if full re-execution is needed.
   */
  private tryUpdateTransformOnly(
    nodeId: string,
    cachedOutput: Record<string, PortValue>,
    params: Record<string, unknown>,
    definition: { outputs: Array<{ id: string; dataType: string }> }
  ): boolean {
    const tx = (params._tx as number) ?? 0;
    const ty = (params._ty as number) ?? 0;
    const sx = (params._sx as number) ?? 1;
    const sy = (params._sy as number) ?? 1;
    const angleDeg = (params._angle as number) ?? 0;
    const px = (params._px as number) ?? 0.5;
    const py = (params._py as number) ?? 0.5;

    let anyUpdated = false;

    for (const [key, value] of Object.entries(cachedOutput)) {
      const outputDef = definition.outputs.find(o => o.id === key);
      const isImageOutput = outputDef && (outputDef.dataType === 'image' || outputDef.dataType === 'mask');

      if (isImageOutput && isFloatImage(value)) {
        const img = value as FloatImage;

        // Calculate pivot in pixel coordinates
        const pivotX = img.width * px;
        const pivotY = img.height * py;

        // Create new transform
        const angleRad = angleDeg * (Math.PI / 180);
        const nodeTransform = createPivotTransform(sx, sy, angleRad, pivotX, pivotY, tx, ty);

        // Get the base transform (original image transform before our local transform)
        const storedBaseTransform = img.baseTransform ?? IDENTITY_TRANSFORM;
        const combinedTransform = multiplyTransform(nodeTransform, storedBaseTransform);

        // Update transform in place (no new allocation!)
        img.transform = combinedTransform;
        anyUpdated = true;
      }
    }

    return anyUpdated;
  }

  /**
   * Propagate transform changes to downstream nodes without re-executing them.
   * This updates the cached outputs' transforms in-place for nodes that don't
   * require spatial coherence (they just pass transforms through).
   * Nodes that DO require spatial coherence need re-execution but we still
   * propagate through them so further downstream nodes can update.
   */
  propagateTransformToDownstream(startNodeId: string, downstreamNodeIds: string[]): void {
    // Track which nodes need re-execution (spatial coherence)
    const needsReexecution = new Set<string>();

    // Process nodes in order (should be topological from BFS)
    for (const nodeId of downstreamNodeIds) {
      const node = this.graph.nodes[nodeId];
      if (!node) continue;

      const definition = NodeRegistry.get(node.type);
      if (!definition) continue;

      const cachedOutput = this.outputCache.get(nodeId);
      if (!cachedOutput) continue;

      // Get the input transform from upstream
      let inputTransform = IDENTITY_TRANSFORM;
      const inputEdges = Object.values(this.graph.edges).filter(e => e.targetNodeId === nodeId);
      for (const edge of inputEdges) {
        const sourceOutput = this.outputCache.get(edge.sourceNodeId);
        if (sourceOutput) {
          const sourceValue = sourceOutput[edge.sourcePortId];
          if (isFloatImage(sourceValue) && sourceValue.transform) {
            inputTransform = sourceValue.transform;
            break; // Use first image input's transform
          }
        }
      }

      // Check if any upstream node needs re-execution (spatial coherence chain broken)
      let upstreamNeedsReexec = false;
      for (const edge of inputEdges) {
        if (needsReexecution.has(edge.sourceNodeId)) {
          upstreamNeedsReexec = true;
          break;
        }
      }

      // Nodes that require spatial coherence need to re-execute to bake the transform
      if (definition.requiresSpatialCoherence || upstreamNeedsReexec) {
        needsReexecution.add(nodeId);
        // Mark for re-execution but DON'T delete cache yet - downstream may still read transforms
        // The cache will be cleared on next execution
      }

      // Update this node's output transforms (even for spatial coherence - downstream needs it)
      for (const [key, value] of Object.entries(cachedOutput)) {
        const outputDef = definition.outputs.find(o => o.id === key);
        const isImageOutput = outputDef && (outputDef.dataType === 'image' || outputDef.dataType === 'mask');

        if (isImageOutput && isFloatImage(value)) {
          const img = value as FloatImage;
          // Compose input transform with node's local transform
          if (definition.hasLocalTransform) {
            const params = node.parameters;
            const tx = (params._tx as number) ?? 0;
            const ty = (params._ty as number) ?? 0;
            const sx = (params._sx as number) ?? 1;
            const sy = (params._sy as number) ?? 1;
            const angleDeg = (params._angle as number) ?? 0;
            const px = (params._px as number) ?? 0.5;
            const py = (params._py as number) ?? 0.5;

            const pivotX = img.width * px;
            const pivotY = img.height * py;
            const angleRad = angleDeg * (Math.PI / 180);
            const nodeTransform = createPivotTransform(sx, sy, angleRad, pivotX, pivotY, tx, ty);

            img.transform = multiplyTransform(nodeTransform, inputTransform);
          } else {
            // No local transform, just pass through input transform
            img.transform = inputTransform;
          }
        }
      }

      // Create a new object reference to trigger React re-render
      const updatedOutput = { ...cachedOutput };
      this.outputCache.set(nodeId, updatedOutput);

      // Notify that this node's output changed
      this.callbacks.onNodeComplete?.(nodeId, updatedOutput);
    }
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
   * Execute a single node (public for lazy evaluation)
   * Creates its own abort controller if no signal is provided
   */
  async executeNode(nodeId: string, signal?: AbortSignal): Promise<void> {
    // Create abort controller if not provided
    const useSignal = signal ?? new AbortController().signal;
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

            // Only bake transforms for nodes that need spatially coherent pixel data (blur, convolution, etc.)
            // These nodes MUST have pixels in correct world-space positions to work correctly
            if (definition.requiresSpatialCoherence && isFloatImage(value) && value.transform && !isIdentityTransform(value.transform)) {
              // Get default color: node override > canvas setting > transparent black
              const nodeDefaultColor = node.defaultColorOverride;
              const canvasDefaultColor = this.graph.canvas?.defaultColor;
              const defaultColor: Color = nodeDefaultColor ?? canvasDefaultColor ?? { r: 0, g: 0, b: 0, a: 0 };

              // Always bake for spatial coherence nodes - they need correct pixel positions
              // The defaultColor controls what fills the expanded areas
              value = applyTransformToImage(value, defaultColor);
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
        signal: useSignal,
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

      // Check if execution was aborted while we were running
      // If so, discard results to prevent stale data from being stored
      if (useSignal.aborted) {
        throw new Error('Execution aborted');
      }

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

      // Apply local transform if node has hasLocalTransform
      // ALWAYS call this to normalize ImageData → FloatImage, even if transform is identity
      // This is critical so tryUpdateTransformOnly can work on subsequent calls
      // IMPORTANT: Re-read parameters from current graph state to get latest values during rapid updates
      const currentParams = this.graph.nodes[nodeId]?.parameters ?? node.parameters;
      if (definition.hasLocalTransform) {
        // Find the input transform to inherit (from first image input)
        let inputTransform: Transform2D | undefined;
        for (const inputValue of Object.values(inputs)) {
          if (isFloatImage(inputValue) && inputValue.transform) {
            inputTransform = inputValue.transform;
            break;
          }
        }
        outputs = this.applyLocalTransform(outputs, currentParams, definition, inputTransform);
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
   * @param inputTransform Transform inherited from input image (used when output doesn't have its own transform)
   */
  private applyLocalTransform(
    outputs: Record<string, PortValue>,
    params: Record<string, unknown>,
    definition: { outputs: Array<{ id: string; dataType: string }> },
    inputTransform?: Transform2D
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

        // Use output's own transform, or inherit from input if output doesn't have one
        // This ensures transforms flow through nodes that create new output images
        const existingTransform = img.transform ?? inputTransform ?? IDENTITY_TRANSFORM;
        const combinedTransform = multiplyTransform(nodeTransform, existingTransform);

        // Return image with updated transform - NO pixel resampling
        // Store base transform for later incremental updates during gizmo drag
        transformedOutputs[key] = {
          data: img.data,
          width: img.width,
          height: img.height,
          transform: combinedTransform,
          baseTransform: img.baseTransform ?? existingTransform, // Preserve original for incremental updates
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
   * Get the current graph
   */
  getGraph(): Graph {
    return this.graph;
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
