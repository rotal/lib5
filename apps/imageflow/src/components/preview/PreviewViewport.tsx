import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useExecutionStore, useUiStore, useGraphStore } from '../../store';
import { isFloatImage, floatToImageData, isGPUTexture, type FloatImage, type Transform2D, IDENTITY_TRANSFORM, transformPoint } from '../../types/data';
import type { GPUTexture } from '../../types/gpu';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { GizmoOverlay } from './GizmoOverlay';

const PREVIEW_SLOT_COLORS = ['#ef4444', '#22c55e', '#3b82f6']; // Red, Green, Blue for slots 1, 2, 3

export function PreviewViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodeOutputs, isExecuting, downloadGPUTexture } = useExecutionStore();
  const {
    previewSlots,
    previewBackgroundActive,
    previewForegroundSlot,
    previewSplitPosition,
    previewSplitVertical,
    previewSplitReversed,
    togglePreviewBackground,
    setPreviewForeground,
    setPreviewSplitPosition,
    togglePreviewSplitDirection,
    togglePreviewSplitReverse,
  } = useUiStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
  const [isNearSplitter, setIsNearSplitter] = useState(false);
  const [channelMode, setChannelMode] = useState<'rgba' | 'r' | 'g' | 'b' | 'a'>('rgba');
  const [previewBgMode, setPreviewBgMode] = useState<'grid' | 'black'>('grid');
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'pivot'>('translate');
  const [gizmoVisibility, setGizmoVisibility] = useState<'all' | 'translate' | 'rotate' | 'scale'>('all');

  // Refs to avoid stale closures during drag operations
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const splitVerticalRef = useRef(previewSplitVertical);
  const handleFitContentRef = useRef<(() => void) | null>(null);
  panRef.current = pan;
  zoomRef.current = zoom;
  splitVerticalRef.current = previewSplitVertical;

  // Trigger execution if a preview node has no outputs yet
  const ensureOutputs = useCallback((...nodeIds: (string | null)[]) => {
    const store = useExecutionStore.getState();
    if (store.isExecuting) return;
    const missing = nodeIds.some(id => id && !store.nodeOutputs[id]);
    if (missing) {
      const freshGraph = useGraphStore.getState().graph;
      store.updateEngineGraph(freshGraph);
      store.execute();
    }
  }, []);

  // Handle keyboard shortcuts (only when preview is focused)
  // Slots 1 & 2 = foreground (mutually exclusive), Slot 3 = background
  // F = frame/fit content to viewport
  // Q/W/E/R = Maya-style gizmo tools (Q=pivot, W=move, E=rotate, R=scale)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '1') {
      setPreviewForeground(0);
      ensureOutputs(previewSlots[0]);
    } else if (e.key === '2') {
      setPreviewForeground(1);
      ensureOutputs(previewSlots[1]);
    } else if (e.key === '3') {
      togglePreviewBackground();
      ensureOutputs(previewSlots[2]);
    } else if (e.key === 'f' || e.key === 'F') {
      handleFitContentRef.current?.();
    } else if (e.key === 'q' || e.key === 'Q') {
      // Q = Pivot mode (shows pivot marker only)
      setGizmoMode('pivot');
      setGizmoVisibility('translate');
    } else if (e.key === 'w' || e.key === 'W') {
      // W = Move tool (translate gizmo)
      setGizmoMode('translate');
      setGizmoVisibility('translate');
    } else if (e.key === 'e' || e.key === 'E') {
      // E = Rotate tool
      setGizmoMode('translate');
      setGizmoVisibility('rotate');
    } else if (e.key === 'r' || e.key === 'R') {
      // R = Scale tool
      setGizmoMode('translate');
      setGizmoVisibility('scale');
    }
  }, [togglePreviewBackground, setPreviewForeground, ensureOutputs, previewSlots]);

  // Get node IDs for active slots
  // Slot 2 (display "3") = background, Slots 0-1 (display "1"/"2") = foreground
  const backgroundNodeId = previewBackgroundActive ? previewSlots[2] : null;
  const foregroundNodeId = previewForegroundSlot !== null ? previewSlots[previewForegroundSlot] : null;

  // Get selected nodes and graph for gizmo detection
  const { selectedNodeIds, graph } = useGraphStore();
  const canvasSettings = graph.canvas;

  // Determine which node should show a gizmo (if any)
  // Show gizmo for a selected node that is in a preview slot and has a gizmo definition
  const gizmoNode = useMemo(() => {
    // Check if any selected node is in a preview slot
    const selectedArray = Array.from(selectedNodeIds);
    for (const nodeId of selectedArray) {
      const isInSlot = previewSlots.includes(nodeId);
      if (isInSlot) {
        const node = graph.nodes[nodeId];
        if (node) {
          const def = NodeRegistry.get(node.type);
          if (def?.gizmo) {
            console.log('[Gizmo] Showing gizmo for node:', node.type, nodeId);
            return { node, gizmo: def.gizmo };
          } else {
            console.log('[Gizmo] Node has no gizmo definition:', node.type);
          }
        }
      }
    }
    if (selectedArray.length > 0) {
      console.log('[Gizmo] Selected nodes not in preview slots:', selectedArray, 'slots:', previewSlots);
    }
    return null;
  }, [selectedNodeIds, previewSlots, graph.nodes]);

  // After mount / refresh, ensure outputs exist for active preview slots
  const hasCheckedOutputs = useRef(false);
  useEffect(() => {
    if (hasCheckedOutputs.current) return;
    hasCheckedOutputs.current = true;
    // Small delay to let initial execution finish first
    const timer = setTimeout(() => {
      ensureOutputs(foregroundNodeId, backgroundNodeId);
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Result type for image with transform
  interface ImageWithTransform {
    imageData: ImageData;
    transform: Transform2D;
    originalWidth: number;
    originalHeight: number;
  }

  // Helper to get image data and transform from node outputs
  const getImageWithTransform = (nodeId: string | null): ImageWithTransform | null => {
    if (!nodeId) return null;

    const outputs = nodeOutputs[nodeId];
    if (!outputs) return null;

    for (const value of Object.values(outputs)) {
      if (value instanceof ImageData) {
        return {
          imageData: value,
          transform: IDENTITY_TRANSFORM,
          originalWidth: value.width,
          originalHeight: value.height,
        };
      }
      if (isFloatImage(value)) {
        const floatImg = value as FloatImage;
        return {
          imageData: floatToImageData(floatImg),
          transform: floatImg.transform ?? IDENTITY_TRANSFORM,
          originalWidth: floatImg.width,
          originalHeight: floatImg.height,
        };
      }
      if (isGPUTexture(value)) {
        const floatImage = downloadGPUTexture(value as GPUTexture);
        if (floatImage) {
          return {
            imageData: floatToImageData(floatImage),
            transform: floatImage.transform ?? IDENTITY_TRANSFORM,
            originalWidth: floatImage.width,
            originalHeight: floatImage.height,
          };
        }
      }
    }
    return null;
  };

  // Helper to get scalar (non-image) data from node outputs
  const getScalarDataForNode = (nodeId: string | null): { name: string; value: string }[] | null => {
    if (!nodeId) return null;
    const outputs = nodeOutputs[nodeId];
    if (!outputs) return null;

    const graph = useGraphStore.getState().graph;
    const nodeInstance = graph.nodes[nodeId];
    if (!nodeInstance) return null;
    const def = NodeRegistry.get(nodeInstance.type);
    if (!def) return null;

    const entries: { name: string; value: string }[] = [];
    for (const output of def.outputs) {
      const value = outputs[output.id];
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
  };

  // Isolate a single channel from ImageData, rendering as grayscale
  const isolateChannel = (src: ImageData | null, channel: 'r' | 'g' | 'b' | 'a'): ImageData | null => {
    if (!src) return null;
    const out = new ImageData(src.width, src.height);
    const s = src.data;
    const d = out.data;
    const idx = channel === 'r' ? 0 : channel === 'g' ? 1 : channel === 'b' ? 2 : 3;
    for (let i = 0; i < s.length; i += 4) {
      const v = s[i + idx];
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    return out;
  };

  // Compute image data with transforms directly (no memoization to avoid stale values)
  const rawBackgroundImage = getImageWithTransform(backgroundNodeId);
  const rawForegroundImage = getImageWithTransform(foregroundNodeId);

  // Apply channel isolation if needed
  const backgroundImageData = rawBackgroundImage
    ? (channelMode === 'rgba' ? rawBackgroundImage.imageData : isolateChannel(rawBackgroundImage.imageData, channelMode))
    : null;
  const foregroundImageData = rawForegroundImage
    ? (channelMode === 'rgba' ? rawForegroundImage.imageData : isolateChannel(rawForegroundImage.imageData, channelMode))
    : null;

  const backgroundTransform = rawBackgroundImage?.transform ?? IDENTITY_TRANSFORM;
  const foregroundTransform = rawForegroundImage?.transform ?? IDENTITY_TRANSFORM;

  // Determine what to display
  const hasBackground = backgroundImageData !== null;
  const hasForeground = foregroundImageData !== null;
  const showComparison = hasBackground && hasForeground;

  // Helper to calculate transformed bounding box of an image
  const getTransformedBBox = (width: number, height: number, transform: Transform2D) => {
    // Transform all 4 corners
    const corners = [
      transformPoint(transform, 0, 0),
      transformPoint(transform, width, 0),
      transformPoint(transform, width, height),
      transformPoint(transform, 0, height),
    ];
    // Find min/max
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  // Calculate combined bounding box of canvas and all transformed images
  const combinedBBox = useMemo(() => {
    // Start with canvas bounds
    let minX = 0, minY = 0;
    let maxX = canvasSettings.width, maxY = canvasSettings.height;

    // Expand to include background image bbox
    if (rawBackgroundImage) {
      const bbox = getTransformedBBox(
        rawBackgroundImage.originalWidth,
        rawBackgroundImage.originalHeight,
        backgroundTransform
      );
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }

    // Expand to include foreground image bbox
    if (rawForegroundImage) {
      const bbox = getTransformedBBox(
        rawForegroundImage.originalWidth,
        rawForegroundImage.originalHeight,
        foregroundTransform
      );
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, [canvasSettings, rawBackgroundImage, rawForegroundImage, backgroundTransform, foregroundTransform]);

  const primaryImageData = backgroundImageData || foregroundImageData;

  // Helper to draw an image with its transform applied (offset by bbox origin)
  const drawImageWithTransform = (
    ctx: CanvasRenderingContext2D,
    imageData: ImageData,
    transform: Transform2D,
    offsetX: number,
    offsetY: number,
  ) => {
    // Create temp canvas with raw image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    // Apply transform with offset and draw
    ctx.save();
    ctx.setTransform(
      transform.a, transform.c, transform.b, transform.d,
      transform.tx + offsetX, transform.ty + offsetY
    );
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  };

  // Render to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!primaryImageData) {
      // Check for scalar data from foreground or background node
      const scalarData = getScalarDataForNode(foregroundNodeId) || getScalarDataForNode(backgroundNodeId);
      if (scalarData) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        let yPos = canvas.height / 2 - (scalarData.length - 1) * 25;
        for (const item of scalarData) {
          ctx.fillStyle = '#808090';
          ctx.font = '12px sans-serif';
          ctx.fillText(item.name, 150, yPos);
          ctx.fillStyle = '#e0e0e8';
          ctx.font = '28px monospace';
          ctx.fillText(item.value, 150, yPos + 30);
          yPos += 60;
        }
      } else {
        canvas.width = 100;
        canvas.height = 100;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#808090';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No preview', 50, 55);
      }
      setImageInfo(null);
      return;
    }

    // Use combined bounding box for viewport size
    const width = Math.ceil(combinedBBox.width);
    const height = Math.ceil(combinedBBox.height);
    const offsetX = -combinedBBox.minX;
    const offsetY = -combinedBBox.minY;
    canvas.width = width;
    canvas.height = height;

    // Clear buffer - transparent so container background shows through
    ctx.clearRect(0, 0, width, height);

    if (showComparison) {
      // Draw background with transform
      drawImageWithTransform(ctx, backgroundImageData!, backgroundTransform, offsetX, offsetY);

      // Create temp canvas for foreground with transform
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        // Clear temp canvas - transparent so container background shows through
        tempCtx.clearRect(0, 0, width, height);
        drawImageWithTransform(tempCtx, foregroundImageData!, foregroundTransform, offsetX, offsetY);

        // Clip foreground based on split position
        ctx.save();
        ctx.beginPath();
        if (previewSplitVertical) {
          const splitX = width * previewSplitPosition;
          if (previewSplitReversed) {
            ctx.rect(splitX, 0, width - splitX, height);
          } else {
            ctx.rect(0, 0, splitX, height);
          }
        } else {
          const splitY = height * previewSplitPosition;
          if (previewSplitReversed) {
            ctx.rect(0, splitY, width, height - splitY);
          } else {
            ctx.rect(0, 0, width, splitY);
          }
        }
        ctx.clip();
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      }

      // Draw split line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (previewSplitVertical) {
        const splitX = width * previewSplitPosition;
        ctx.moveTo(splitX, 0);
        ctx.lineTo(splitX, height);
      } else {
        const splitY = height * previewSplitPosition;
        ctx.moveTo(0, splitY);
        ctx.lineTo(width, splitY);
      }
      ctx.stroke();
    } else if (hasBackground) {
      drawImageWithTransform(ctx, backgroundImageData!, backgroundTransform, offsetX, offsetY);
    } else if (hasForeground) {
      drawImageWithTransform(ctx, foregroundImageData!, foregroundTransform, offsetX, offsetY);
    }

    // Draw canvas border to indicate project resolution bounds
    // The canvas origin (0,0) is at offsetX, offsetY in the combined bbox coordinate system
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(offsetX, offsetY, canvasSettings.width, canvasSettings.height);
    ctx.setLineDash([]);

    setImageInfo({ width, height });
  }, [nodeOutputs, backgroundNodeId, foregroundNodeId, previewSplitPosition, previewSplitVertical, previewSplitReversed, downloadGPUTexture, channelMode, canvasSettings, combinedBBox]);

  // Auto-fit on first load or when canvas size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const fitToContainer = () => {
      const container = containerRef.current!;
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;

      const scaleX = containerWidth / canvasSettings.width;
      const scaleY = containerHeight / canvasSettings.height;
      const scale = Math.min(scaleX, scaleY, 1);

      setZoom(scale);
      setPan({ x: 0, y: 0 });
    };

    fitToContainer();
  }, [canvasSettings.width, canvasSettings.height]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)));
  }, []);

  // Helper to convert screen coordinates to image coordinates (uses refs for fresh values)
  const screenToImageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return null;

    const containerRect = container.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;

    // Calculate position relative to center, accounting for pan and zoom (use refs for fresh values)
    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;
    const imageX = (clientX - containerCenterX - currentPan.x) / currentZoom + canvas.width / 2;
    const imageY = (clientY - containerCenterY - currentPan.y) / currentZoom + canvas.height / 2;

    return { x: imageX, y: imageY };
  }, []);

  // Check if mouse is near the splitter line
  const checkNearSplitter = useCallback((clientX: number, clientY: number): boolean => {
    if (!showComparison || !primaryImageData) return false;

    const imageCoords = screenToImageCoords(clientX, clientY);
    if (!imageCoords) return false;

    const threshold = 8 / zoomRef.current; // 8 pixels in screen space

    if (splitVerticalRef.current) {
      const splitX = primaryImageData.width * previewSplitPosition;
      return Math.abs(imageCoords.x - splitX) < threshold;
    } else {
      const splitY = primaryImageData.height * previewSplitPosition;
      return Math.abs(imageCoords.y - splitY) < threshold;
    }
  }, [showComparison, primaryImageData, previewSplitPosition, screenToImageCoords]);

  // Handle mouse move for cursor changes
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingSplitter) {
      setIsNearSplitter(checkNearSplitter(e.clientX, e.clientY));
    }
  }, [checkNearSplitter, isDraggingSplitter]);

  // Pan handlers (or splitter drag)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    // Check if we should drag the splitter
    if (checkNearSplitter(e.clientX, e.clientY)) {
      e.preventDefault();
      setIsDraggingSplitter(true);

      const handleSplitterMove = (moveEvent: MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const imageCoords = screenToImageCoords(moveEvent.clientX, moveEvent.clientY);
        if (!imageCoords) return;

        // Use refs to get fresh values during drag
        let position: number;
        if (splitVerticalRef.current) {
          position = imageCoords.x / canvas.width;
        } else {
          position = imageCoords.y / canvas.height;
        }

        setPreviewSplitPosition(Math.max(0, Math.min(1, position)));
      };

      const handleSplitterUp = () => {
        setIsDraggingSplitter(false);
        window.removeEventListener('mousemove', handleSplitterMove);
        window.removeEventListener('mouseup', handleSplitterUp);
      };

      window.addEventListener('mousemove', handleSplitterMove);
      window.addEventListener('mouseup', handleSplitterUp);
      return;
    }

    // Otherwise pan the image
    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = { ...pan };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setPan({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [pan, checkNearSplitter, screenToImageCoords, setPreviewSplitPosition]);

  const handleFit = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const scaleX = containerWidth / canvasSettings.width;
    const scaleY = containerHeight / canvasSettings.height;
    const scale = Math.min(scaleX, scaleY);

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  }, [canvasSettings]);

  // Fit to the actual content (transformed image bounding box)
  const handleFitContent = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    // Use combinedBBox which includes the transformed image bounds
    const contentWidth = combinedBBox.width;
    const contentHeight = combinedBBox.height;

    if (contentWidth <= 0 || contentHeight <= 0) return;

    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY, 10); // Cap at 10x zoom

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  }, [combinedBBox]);

  // Update ref for keyboard handler
  handleFitContentRef.current = handleFitContent;

  const handleActualSize = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div
      className="flex flex-col h-full bg-editor-bg outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border bg-editor-surface">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-editor-text">Preview</span>
          {/* Preview slot buttons */}
          {/* Slots 1 & 2 = foreground (mutually exclusive), Slot 3 = background */}
          <div className="flex items-center gap-1 ml-2">
            {/* Slot 1 - Foreground A */}
            <button
              onClick={() => { setPreviewForeground(0); ensureOutputs(previewSlots[0]); }}
              className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                previewForegroundSlot === 0
                  ? 'text-white shadow-md'
                  : 'text-editor-text-dim hover:text-white opacity-50 hover:opacity-100'
              }`}
              style={{
                backgroundColor: previewForegroundSlot === 0
                  ? PREVIEW_SLOT_COLORS[0]
                  : PREVIEW_SLOT_COLORS[0] + '40',
              }}
              title="Foreground A (press 1)"
            >
              1
            </button>
            {/* Slot 2 - Foreground B */}
            <button
              onClick={() => { setPreviewForeground(1); ensureOutputs(previewSlots[1]); }}
              className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                previewForegroundSlot === 1
                  ? 'text-white shadow-md'
                  : 'text-editor-text-dim hover:text-white opacity-50 hover:opacity-100'
              }`}
              style={{
                backgroundColor: previewForegroundSlot === 1
                  ? PREVIEW_SLOT_COLORS[1]
                  : PREVIEW_SLOT_COLORS[1] + '40',
              }}
              title="Foreground B (press 2)"
            >
              2
            </button>
            <span className="text-editor-text-dim text-xs mx-1">|</span>
            {/* Slot 3 - Background */}
            <button
              onClick={() => { togglePreviewBackground(); ensureOutputs(previewSlots[2]); }}
              className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                previewBackgroundActive
                  ? 'text-white shadow-md'
                  : 'text-editor-text-dim hover:text-white opacity-50 hover:opacity-100'
              }`}
              style={{
                backgroundColor: previewBackgroundActive
                  ? PREVIEW_SLOT_COLORS[2]
                  : PREVIEW_SLOT_COLORS[2] + '40',
              }}
              title="Background (press 3)"
            >
              3
            </button>
          </div>
          {/* Split controls - only show when in comparison mode */}
          {showComparison && (
            <>
              <button
                onClick={togglePreviewSplitDirection}
                className="ml-2 px-2 py-1 text-xs text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
                title={previewSplitVertical ? 'Vertical split' : 'Horizontal split'}
              >
                {previewSplitVertical ? '⬌' : '⬍'}
              </button>
              <button
                onClick={togglePreviewSplitReverse}
                className={`px-2 py-1 text-xs transition-colors rounded ${
                  previewSplitReversed
                    ? 'text-editor-text bg-editor-surface-light'
                    : 'text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light'
                }`}
                title="Swap left/right (or top/bottom)"
              >
                ⇄
              </button>
            </>
          )}
          {/* Channel isolation */}
          <span className="text-editor-text-dim text-xs mx-1">|</span>
          <select
            value={channelMode}
            onChange={(e) => setChannelMode(e.target.value as typeof channelMode)}
            className="px-1.5 py-0.5 text-xs font-bold rounded bg-editor-surface-light border border-editor-border text-editor-text cursor-pointer focus:outline-none focus:border-editor-accent"
            title="Channel view"
          >
            <option value="rgba">RGBA</option>
            <option value="r">R</option>
            <option value="g">G</option>
            <option value="b">B</option>
            <option value="a">A</option>
          </select>
          {/* Background toggle */}
          <button
            onClick={() => setPreviewBgMode(previewBgMode === 'grid' ? 'black' : 'grid')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              previewBgMode === 'grid'
                ? 'bg-editor-surface-light text-editor-text'
                : 'text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light'
            }`}
            title={`Background: ${previewBgMode === 'grid' ? 'Grid' : 'Black'} (click to toggle)`}
          >
            {previewBgMode === 'grid' ? '▦' : '■'}
          </button>
          {/* Gizmo tool buttons (Maya-style Q/W/E/R) */}
          {gizmoNode && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => { setGizmoMode('pivot'); setGizmoVisibility('translate'); }}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  gizmoMode === 'pivot'
                    ? 'bg-orange-500/50 text-orange-200'
                    : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
                }`}
                title="Pivot tool (Q)"
              >
                Q
              </button>
              <button
                onClick={() => { setGizmoMode('translate'); setGizmoVisibility('translate'); }}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  gizmoMode === 'translate' && gizmoVisibility === 'translate'
                    ? 'bg-blue-500/50 text-blue-200'
                    : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
                }`}
                title="Move tool (W)"
              >
                W
              </button>
              <button
                onClick={() => { setGizmoMode('translate'); setGizmoVisibility('rotate'); }}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  gizmoVisibility === 'rotate'
                    ? 'bg-green-500/50 text-green-200'
                    : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
                }`}
                title="Rotate tool (E)"
              >
                E
              </button>
              <button
                onClick={() => { setGizmoMode('translate'); setGizmoVisibility('scale'); }}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  gizmoVisibility === 'scale'
                    ? 'bg-yellow-500/50 text-yellow-200'
                    : 'bg-editor-surface-light text-editor-text-dim hover:text-editor-text'
                }`}
                title="Scale tool (R)"
              >
                R
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFit}
            className="px-2 py-1 text-xs text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
            title="Fit to canvas bounds"
          >
            Fit
          </button>
          <button
            onClick={handleFitContent}
            className="px-2 py-1 text-xs text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
            title="Frame content (F)"
          >
            Frame
          </button>
          <button
            onClick={handleActualSize}
            className="px-2 py-1 text-xs text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
          >
            100%
          </button>
          <span className="text-xs text-editor-text-dim">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        style={{
          cursor: isDraggingSplitter
            ? (previewSplitVertical ? 'col-resize' : 'row-resize')
            : isNearSplitter
              ? (previewSplitVertical ? 'col-resize' : 'row-resize')
              : 'grab',
          backgroundColor: previewBgMode === 'grid' ? '#404040' : '#000000',
          backgroundImage: previewBgMode === 'grid'
            ? 'linear-gradient(45deg, #303030 25%, transparent 25%), linear-gradient(-45deg, #303030 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #303030 75%), linear-gradient(-45deg, transparent 75%, #303030 75%)'
            : undefined,
          backgroundSize: previewBgMode === 'grid' ? '16px 16px' : undefined,
          backgroundPosition: previewBgMode === 'grid' ? '0 0, 0 8px, 8px -8px, -8px 0px' : undefined,
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setIsNearSplitter(false)}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
          />
        </div>

        {/* Gizmo overlay for interactive node controls */}
        {gizmoNode && imageInfo && (
          <GizmoOverlay
            node={gizmoNode.node}
            gizmo={gizmoNode.gizmo}
            imageWidth={rawForegroundImage?.originalWidth ?? rawBackgroundImage?.originalWidth ?? canvasSettings.width}
            imageHeight={rawForegroundImage?.originalHeight ?? rawBackgroundImage?.originalHeight ?? canvasSettings.height}
            bboxOffset={{ x: -combinedBBox.minX, y: -combinedBBox.minY }}
            zoom={zoom}
            pan={pan}
            containerRef={containerRef}
            canvasRef={canvasRef}
            gizmoMode={gizmoMode}
            gizmoVisibility={gizmoVisibility}
          />
        )}

        {/* Keyboard shortcuts HUD */}
        {gizmoNode && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
              <div className="flex gap-4">
                <div className={`flex items-center gap-1.5 ${gizmoMode === 'pivot' ? 'text-orange-300' : 'text-white/50'}`}>
                  <span className={`w-5 h-5 flex items-center justify-center rounded ${gizmoMode === 'pivot' ? 'bg-orange-500/60' : 'bg-white/20'}`}>Q</span>
                  <span>Pivot</span>
                </div>
                <div className={`flex items-center gap-1.5 ${gizmoMode === 'translate' && gizmoVisibility === 'translate' ? 'text-blue-300' : 'text-white/50'}`}>
                  <span className={`w-5 h-5 flex items-center justify-center rounded ${gizmoMode === 'translate' && gizmoVisibility === 'translate' ? 'bg-blue-500/60' : 'bg-white/20'}`}>W</span>
                  <span>Move</span>
                </div>
                <div className={`flex items-center gap-1.5 ${gizmoVisibility === 'rotate' ? 'text-green-300' : 'text-white/50'}`}>
                  <span className={`w-5 h-5 flex items-center justify-center rounded ${gizmoVisibility === 'rotate' ? 'bg-green-500/60' : 'bg-white/20'}`}>E</span>
                  <span>Rotate</span>
                </div>
                <div className={`flex items-center gap-1.5 ${gizmoVisibility === 'scale' ? 'text-yellow-300' : 'text-white/50'}`}>
                  <span className={`w-5 h-5 flex items-center justify-center rounded ${gizmoVisibility === 'scale' ? 'bg-yellow-500/60' : 'bg-white/20'}`}>R</span>
                  <span>Scale</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {isExecuting && (
          <div className="absolute inset-0 flex items-center justify-center bg-editor-bg/50">
            <div className="flex items-center gap-2 text-editor-text">
              <div className="w-5 h-5 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1 border-t border-editor-border bg-editor-surface text-xs text-editor-text-dim flex justify-between">
        <span>
          {imageInfo ? `${imageInfo.width} × ${imageInfo.height}` : 'No image'}
          {' | '}
          <span className="text-yellow-500">Canvas: {canvasSettings.width} × {canvasSettings.height}</span>
        </span>
        <span>
          FG: {foregroundNodeId ? '✓' : '—'} | BG: {backgroundNodeId ? '✓' : '—'}
        </span>
      </div>
    </div>
  );
}
