import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { NodeInstance, NodeRuntimeState } from '../../types';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { GraphPort } from './GraphPort';
import { Edge } from '../../types/graph';
import { PortValue, isImageData, isImageBitmap, isFloatImage, floatToImageData } from '../../types/data';
import { useUiStore } from '../../store';

interface GraphNodeProps {
  node: NodeInstance;
  isSelected: boolean;
  runtimeState?: NodeRuntimeState;
  nodeOutputs?: Record<string, PortValue>;
  edges: Edge[];
  zoom: number;
  onSelect: (nodeId: string, additive: boolean) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onMoveEnd: () => void;
  onConnectionStart: (
    nodeId: string,
    portId: string,
    direction: 'input' | 'output',
    x: number,
    y: number
  ) => void;
  onConnectionEnd: (nodeId: string, portId: string) => void;
  onParameterChange?: (nodeId: string, paramId: string, value: unknown) => void;
  onParameterCommit?: (nodeId: string, paramId: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Input: '#22c55e',
  Output: '#ef4444',
  Transform: '#3b82f6',
  Adjust: '#f59e0b',
  Filter: '#8b5cf6',
  Composite: '#ec4899',
  Mask: '#6366f1',
  AI: '#14b8a6',
  Utility: '#6b7280',
};

export function GraphNode({
  node,
  isSelected,
  runtimeState,
  nodeOutputs,
  edges,
  zoom,
  onSelect,
  onMove,
  onMoveEnd,
  onConnectionStart,
  onConnectionEnd,
  onParameterChange,
  onParameterCommit,
}: GraphNodeProps) {
  const definition = NodeRegistry.get(node.type);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const { setPreviewNode } = useUiStore();

  const categoryColor = CATEGORY_COLORS[definition?.category || 'Utility'];

  // Handle double-click to preview node output
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewNode(node.id);
  }, [node.id, setPreviewNode]);

  // Check if this node has image/mask outputs (can show preview)
  const hasImageOutput = useMemo(() => {
    return definition?.outputs?.some(o => o.dataType === 'image' || o.dataType === 'mask') ?? false;
  }, [definition]);

  const previewEnabled = (node.parameters.preview as boolean) ?? false;

  // Handle preview toggle click
  const handlePreviewToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onParameterChange && onParameterCommit) {
      onParameterChange(node.id, 'preview', !previewEnabled);
      onParameterCommit(node.id, 'preview');
    }
  }, [node.id, previewEnabled, onParameterChange, onParameterCommit]);

  // Find the first image output for preview (convert FloatImage to ImageData if needed)
  const previewImage = useMemo((): ImageData | ImageBitmap | null => {
    if (!nodeOutputs) return null;
    for (const value of Object.values(nodeOutputs)) {
      if (isImageData(value) || isImageBitmap(value)) {
        return value;
      }
      if (isFloatImage(value)) {
        // Convert FloatImage to ImageData for canvas display
        return floatToImageData(value);
      }
    }
    return null;
  }, [nodeOutputs]);

  // Render preview to canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewImage) {
      setHasPreview(false);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setHasPreview(false);
      return;
    }

    // Use higher resolution for better quality (2x for retina)
    const displaySize = 120;
    const dpr = window.devicePixelRatio || 1;
    const canvasSize = displaySize * dpr;

    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Get image dimensions
    let imgWidth: number;
    let imgHeight: number;
    if (isImageData(previewImage)) {
      imgWidth = previewImage.width;
      imgHeight = previewImage.height;
    } else {
      imgWidth = previewImage.width;
      imgHeight = previewImage.height;
    }

    // Calculate scaled dimensions to fit in thumbnail while preserving aspect ratio
    const scale = Math.min(canvasSize / imgWidth, canvasSize / imgHeight);
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    const offsetX = (canvasSize - scaledWidth) / 2;
    const offsetY = (canvasSize - scaledHeight) / 2;

    // Clear canvas with checkerboard pattern for transparency
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw checkerboard (scale check size for DPR)
    const checkSize = 8 * dpr;
    ctx.fillStyle = '#252542';
    for (let y = 0; y < canvasSize; y += checkSize * 2) {
      for (let x = 0; x < canvasSize; x += checkSize * 2) {
        ctx.fillRect(x, y, checkSize, checkSize);
        ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
      }
    }

    // Draw the image
    if (isImageData(previewImage)) {
      // Create a temporary canvas to draw ImageData, then scale
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imgWidth;
      tempCanvas.height = imgHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(previewImage, 0, 0);
        ctx.drawImage(tempCanvas, offsetX, offsetY, scaledWidth, scaledHeight);
      }
    } else if (isImageBitmap(previewImage)) {
      ctx.drawImage(previewImage, offsetX, offsetY, scaledWidth, scaledHeight);
    }

    setHasPreview(true);
  }, [previewImage]);

  // Check which ports are connected
  const connectedInputs = useMemo(() => {
    const connected = new Set<string>();
    for (const edge of edges) {
      if (edge.targetNodeId === node.id) {
        connected.add(edge.targetPortId);
      }
    }
    return connected;
  }, [edges, node.id]);

  const connectedOutputs = useMemo(() => {
    const connected = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceNodeId === node.id) {
        connected.add(edge.sourcePortId);
      }
    }
    return connected;
  }, [edges, node.id]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore if clicking on a port
    if ((e.target as HTMLElement).classList.contains('node-port')) {
      return;
    }

    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };

    onSelect(node.id, e.shiftKey || e.ctrlKey || e.metaKey);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;

      const dx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const dy = (moveEvent.clientY - dragStart.current.y) / zoom;

      onMove(
        node.id,
        dragStart.current.nodeX + dx,
        dragStart.current.nodeY + dy
      );
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        onMoveEnd();
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [node.id, node.position, zoom, onSelect, onMove, onMoveEnd]);

  if (!definition) {
    return (
      <div
        className={`graph-node error ${isSelected ? 'selected' : ''}`}
        style={{
          left: node.position.x,
          top: node.position.y,
          position: 'absolute',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className="px-3 py-2 rounded-t-lg border-b border-editor-border bg-editor-error/20">
          <span className="text-sm font-medium text-editor-error">Unknown Node</span>
        </div>
        <div className="p-2 text-editor-text-dim text-xs">
          Type: {node.type}
        </div>
      </div>
    );
  }

  const executionClass =
    runtimeState?.executionState === 'running' ? 'executing' :
    runtimeState?.executionState === 'error' ? 'error' : '';

  const hasInputs = definition.inputs.length > 0;
  const hasOutputs = definition.outputs.length > 0;
  const maxPorts = Math.max(definition.inputs.length, definition.outputs.length, 1);
  const portAreaHeight = maxPorts * 24 + 8; // 24px per port + padding

  return (
    <div
      className={`graph-node ${isSelected ? 'selected' : ''} ${executionClass}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        position: 'absolute',
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Input ports - LEFT side */}
      {hasInputs && (
        <div
          className="absolute flex flex-col justify-center gap-2"
          style={{
            left: -8,
            top: 40, // Below header
            height: portAreaHeight,
          }}
        >
          {definition.inputs.map((port) => (
            <GraphPort
              key={port.id}
              port={port}
              direction="input"
              nodeId={node.id}
              isConnected={connectedInputs.has(port.id)}
              onConnectionStart={onConnectionStart}
              onConnectionEnd={onConnectionEnd}
            />
          ))}
        </div>
      )}

      {/* Output ports - RIGHT side */}
      {hasOutputs && (
        <div
          className="absolute flex flex-col justify-center gap-2"
          style={{
            right: -8,
            top: 40, // Below header
            height: portAreaHeight,
          }}
        >
          {definition.outputs.map((port) => (
            <GraphPort
              key={port.id}
              port={port}
              direction="output"
              nodeId={node.id}
              isConnected={connectedOutputs.has(port.id)}
              onConnectionStart={onConnectionStart}
              onConnectionEnd={onConnectionEnd}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div
        className="px-3 py-2 rounded-t-lg border-b border-editor-border flex items-center gap-2"
        style={{ backgroundColor: categoryColor + '20' }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: categoryColor }}
        />
        <span className="text-sm font-medium text-editor-text truncate flex-1">
          {definition.name}
        </span>
        {/* Preview toggle - eye icon (for nodes with image/mask outputs) */}
        {hasImageOutput && (
          <button
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
              previewEnabled
                ? 'bg-editor-accent/30 text-editor-accent'
                : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
            }`}
            onClick={handlePreviewToggle}
            title={previewEnabled ? 'Hide preview (keep on GPU)' : 'Show preview (download from GPU)'}
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {previewEnabled ? (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}
        {runtimeState?.executionState === 'running' && (
          <div className="w-3 h-3 border-2 border-editor-warning border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Port labels */}
      <div className="flex px-3 py-2" style={{ minHeight: portAreaHeight }}>
        {/* Input labels */}
        <div className="flex flex-col justify-center gap-2 min-w-[60px]">
          {definition.inputs.map((port) => (
            <div key={port.id} className="text-xs text-editor-text-dim h-4 flex items-center">
              {port.name}
              {port.required && <span className="text-editor-error ml-0.5">*</span>}
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-w-[20px]" />

        {/* Output labels */}
        <div className="flex flex-col justify-center gap-2 min-w-[60px] text-right">
          {definition.outputs.map((port) => (
            <div key={port.id} className="text-xs text-editor-text-dim h-4 flex items-center justify-end">
              {port.name}
            </div>
          ))}
        </div>
      </div>

      {/* Preview thumbnail - only show when preview is enabled */}
      {previewEnabled && (previewImage || hasPreview) && (
        <div className="px-2 pb-2 flex justify-center">
          <canvas
            ref={previewCanvasRef}
            className="rounded border border-editor-border"
          />
        </div>
      )}

      {/* Progress bar */}
      {runtimeState?.executionState === 'running' && runtimeState.progress > 0 && (
        <div className="h-1 bg-editor-surface-light">
          <div
            className="h-full bg-editor-warning transition-all"
            style={{ width: `${runtimeState.progress * 100}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {runtimeState?.executionState === 'error' && runtimeState.error && (
        <div className="px-2 py-1 text-xs text-editor-error bg-editor-error/10 border-t border-editor-border truncate">
          {runtimeState.error}
        </div>
      )}
    </div>
  );
}
