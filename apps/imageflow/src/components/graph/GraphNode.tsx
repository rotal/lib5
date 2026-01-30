import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { NodeInstance, NodeRuntimeState } from '../../types';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { GraphPort } from './GraphPort';
import { Edge } from '../../types/graph';
import { useUiStore, useExecutionStore, useGraphStore } from '../../store';
import { isFloatImage, floatToImageData, isGPUTexture } from '../../types/data';
import type { GPUTexture } from '../../types/gpu';

const PREVIEW_SLOT_COLORS = ['#ef4444', '#22c55e', '#3b82f6']; // Red, Green, Blue for slots 1, 2, 3

interface GraphNodeProps {
  node: NodeInstance;
  isSelected: boolean;
  runtimeState?: NodeRuntimeState;
  nodeOutputs?: Record<string, unknown>;
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
}: GraphNodeProps) {
  const definition = NodeRegistry.get(node.type);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Touch interaction state
  const touchState = useRef<'idle' | 'potential_tap' | 'dragging' | 'long_press'>('idle');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const { previewSlots, previewBackgroundActive, previewForegroundSlot, showContextMenu } = useUiStore();
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const graph = useGraphStore((s) => s.graph);
  const { downloadGPUTexture } = useExecutionStore();
  const setNodeLocalPreview = useGraphStore((s) => s.setNodeLocalPreview);
  const localPreview = !!node.localPreview;
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const categoryColor = CATEGORY_COLORS[definition?.category || 'Utility'];

  // Check if this node is assigned to a preview slot
  const previewSlotIndex = useMemo(() => {
    const index = previewSlots.indexOf(node.id);
    return index >= 0 ? index : null;
  }, [previewSlots, node.id]);

  // Check if the slot this node is in is currently active
  // Slot 2 (display "3") = background, Slots 0-1 (display "1"/"2") = foreground
  const isSlotActive = useMemo(() => {
    if (previewSlotIndex === null) return false;
    if (previewSlotIndex === 2) return previewBackgroundActive;
    return previewForegroundSlot === previewSlotIndex;
  }, [previewSlotIndex, previewBackgroundActive, previewForegroundSlot]);

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

  // Get preview image data from node outputs
  const previewImageData = useMemo((): ImageData | null => {
    if (!localPreview || !nodeOutputs) return null;

    for (const value of Object.values(nodeOutputs)) {
      if (value instanceof ImageData) {
        return value;
      }
      if (isFloatImage(value)) {
        return floatToImageData(value);
      }
      // Download GPU textures for preview
      if (isGPUTexture(value)) {
        const floatImage = downloadGPUTexture(value as GPUTexture);
        if (floatImage) {
          return floatToImageData(floatImage);
        }
      }
    }
    return null;
  }, [localPreview, nodeOutputs, downloadGPUTexture]);

  // Get preview scalar data for non-image outputs (e.g. Math node)
  const previewScalarData = useMemo((): { name: string; value: string }[] | null => {
    if (!localPreview || !nodeOutputs || previewImageData || !definition) return null;

    const entries: { name: string; value: string }[] = [];
    for (const output of definition.outputs) {
      const value = nodeOutputs[output.id];
      if (value === undefined || value === null) continue;
      if (value instanceof ImageData || isFloatImage(value) || isGPUTexture(value)) continue;

      if (typeof value === 'number') {
        entries.push({ name: output.name, value: Number.isInteger(value) ? String(value) : value.toFixed(4) });
      } else if (typeof value === 'boolean') {
        entries.push({ name: output.name, value: String(value) });
      } else if (typeof value === 'string') {
        entries.push({ name: output.name, value });
      } else if (typeof value === 'object') {
        entries.push({ name: output.name, value: JSON.stringify(value) });
      }
    }

    return entries.length > 0 ? entries : null;
  }, [localPreview, nodeOutputs, previewImageData, definition]);

  // Generate preview data URL
  useEffect(() => {
    if (!localPreview) {
      setPreviewDataUrl(null);
      return;
    }

    if (!previewImageData) {
      setPreviewDataUrl(null);
      return;
    }

    // Create off-screen canvas and generate data URL
    const canvas = document.createElement('canvas');
    canvas.width = previewImageData.width;
    canvas.height = previewImageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(previewImageData, 0, 0);
      setPreviewDataUrl(canvas.toDataURL('image/png'));
    }
  }, [localPreview, previewImageData]);

  const handleTogglePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const turning_on = !localPreview;
    setNodeLocalPreview(node.id, turning_on);
    // Trigger execution if turning on and no outputs exist
    if (turning_on && !nodeOutputs) {
      const executionStore = useExecutionStore.getState();
      if (!executionStore.isExecuting) {
        const freshGraph = useGraphStore.getState().graph;
        executionStore.updateEngineGraph(freshGraph);
        executionStore.execute();
      }
    }
  }, [node.id, localPreview, setNodeLocalPreview, nodeOutputs]);

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

    // If node is already selected, don't change selection (allows multi-drag)
    // Only change selection if node is not selected or using modifier keys
    if (!isSelected) {
      onSelect(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }

    // Capture initial positions of all selected nodes for multi-drag
    // Need to get fresh state after potential selection change
    const currentSelectedIds = useGraphStore.getState().selectedNodeIds;
    const currentGraph = useGraphStore.getState().graph;
    dragStartPositions.current.clear();
    const nodesToMove = currentSelectedIds.has(node.id) ? currentSelectedIds : new Set([node.id]);
    for (const id of nodesToMove) {
      const n = currentGraph.nodes[id];
      if (n) {
        dragStartPositions.current.set(id, { x: n.position.x, y: n.position.y });
      }
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;

      const dx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const dy = (moveEvent.clientY - dragStart.current.y) / zoom;

      // Move all selected nodes by the same delta
      for (const [id, startPos] of dragStartPositions.current) {
        onMove(id, startPos.x + dx, startPos.y + dy);
      }
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
  }, [node.id, node.position, zoom, onSelect, onMove, onMoveEnd, isSelected, selectedNodeIds, graph.nodes]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore if touching a port
    if ((e.target as HTMLElement).classList.contains('node-port')) {
      return;
    }

    e.stopPropagation();

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchState.current = 'potential_tap';

    // Store drag start info
    dragStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };

    // Capture initial positions for multi-drag
    const currentSelectedIds = useGraphStore.getState().selectedNodeIds;
    const currentGraph = useGraphStore.getState().graph;
    dragStartPositions.current.clear();
    const nodesToMove = currentSelectedIds.has(node.id) ? currentSelectedIds : new Set([node.id]);
    for (const id of nodesToMove) {
      const n = currentGraph.nodes[id];
      if (n) {
        dragStartPositions.current.set(id, { x: n.position.x, y: n.position.y });
      }
    }

    // Start long-press timer (500ms)
    longPressTimer.current = setTimeout(() => {
      if (touchState.current === 'potential_tap') {
        touchState.current = 'long_press';
        // Show context menu at touch position
        showContextMenu(touch.clientX, touch.clientY, 'node', node.id);
        // Select the node
        if (!isSelected) {
          onSelect(node.id, false);
        }
      }
    }, 500);
  }, [node.id, node.position, isSelected, onSelect, showContextMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If moved more than 10px, cancel long-press and start dragging
    if (distance > 10 && touchState.current === 'potential_tap') {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      touchState.current = 'dragging';
      isDragging.current = true;

      // Select node if not already selected
      if (!isSelected) {
        onSelect(node.id, false);
        // Update drag start positions after selection
        const currentSelectedIds = useGraphStore.getState().selectedNodeIds;
        const currentGraph = useGraphStore.getState().graph;
        dragStartPositions.current.clear();
        const nodesToMove = currentSelectedIds.has(node.id) ? currentSelectedIds : new Set([node.id]);
        for (const id of nodesToMove) {
          const n = currentGraph.nodes[id];
          if (n) {
            dragStartPositions.current.set(id, { x: n.position.x, y: n.position.y });
          }
        }
      }
    }

    // If dragging, move the node(s)
    if (touchState.current === 'dragging') {
      e.preventDefault();
      const moveDx = (touch.clientX - dragStart.current.x) / zoom;
      const moveDy = (touch.clientY - dragStart.current.y) / zoom;

      for (const [id, startPos] of dragStartPositions.current) {
        onMove(id, startPos.x + moveDx, startPos.y + moveDy);
      }
    }
  }, [zoom, onMove, onSelect, isSelected, node.id]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Clear long-press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Handle tap (select node)
    if (touchState.current === 'potential_tap') {
      onSelect(node.id, e.touches.length > 0); // Multi-touch = additive
    }

    // End dragging
    if (touchState.current === 'dragging') {
      isDragging.current = false;
      onMoveEnd();
    }

    touchState.current = 'idle';
  }, [node.id, onSelect, onMoveEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

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
        touchAction: 'none', // Prevent browser touch gestures
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Preview slot indicator - top left */}
      {previewSlotIndex !== null && (
        <div
          className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md z-10"
          style={{
            backgroundColor: PREVIEW_SLOT_COLORS[previewSlotIndex],
            border: isSlotActive ? '2px solid white' : 'none',
          }}
          title={`Preview slot ${previewSlotIndex + 1}${isSlotActive ? ' (active)' : ''}`}
        >
          {previewSlotIndex + 1}
        </div>
      )}

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
        {runtimeState?.executionState === 'running' && (
          <div className="w-3 h-3 border-2 border-editor-warning border-t-transparent rounded-full animate-spin" />
        )}
        {/* Eye toggle for local preview */}
        <button
          onClick={handleTogglePreview}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            localPreview
              ? 'text-editor-accent bg-editor-accent/20'
              : 'text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light'
          }`}
          title={localPreview ? 'Hide preview' : 'Show preview'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {localPreview ? (
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

      {/* Local preview thumbnail */}
      {localPreview && (
        <div className="px-2 pb-2 flex justify-center bg-editor-surface-light/30">
          {previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Preview"
              className="rounded border border-editor-border"
              style={{
                maxWidth: 180,
                maxHeight: 180,
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          ) : previewScalarData ? (
            <div
              className="rounded border border-editor-border p-3 flex flex-col items-center justify-center gap-1"
              style={{ minWidth: 120, backgroundColor: '#1a1a2e' }}
            >
              {previewScalarData.map((item, i) => (
                <div key={i} className="text-center">
                  <div className="text-editor-text-dim text-xs">{item.name}</div>
                  <div className="text-editor-text text-lg font-mono">{item.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="rounded border border-editor-border flex items-center justify-center text-editor-text-dim text-xs"
              style={{ width: 180, height: 120, backgroundColor: '#1a1a2e' }}
            >
              No preview
            </div>
          )}
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
