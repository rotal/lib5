import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useExecutionStore, useUiStore } from '../../store';
import { isFloatImage, floatToImageData, isGPUTexture } from '../../types/data';
import type { GPUTexture } from '../../types/gpu';

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

  // Refs to avoid stale closures during drag operations
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const splitVerticalRef = useRef(previewSplitVertical);
  panRef.current = pan;
  zoomRef.current = zoom;
  splitVerticalRef.current = previewSplitVertical;

  // Handle keyboard shortcuts
  // Slots 1 & 2 = foreground (mutually exclusive), Slot 3 = background
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '1') {
      setPreviewForeground(0);
    } else if (e.key === '2') {
      setPreviewForeground(1);
    } else if (e.key === '3') {
      togglePreviewBackground();
    }
  }, [togglePreviewBackground, setPreviewForeground]);

  // Get node IDs for active slots
  // Slot 2 (display "3") = background, Slots 0-1 (display "1"/"2") = foreground
  const backgroundNodeId = previewBackgroundActive ? previewSlots[2] : null;
  const foregroundNodeId = previewForegroundSlot !== null ? previewSlots[previewForegroundSlot] : null;

  // Helper to get image data from node outputs
  const getImageDataForNode = (nodeId: string | null): ImageData | null => {
    if (!nodeId) return null;

    const outputs = nodeOutputs[nodeId];
    if (!outputs) return null;

    for (const value of Object.values(outputs)) {
      if (value instanceof ImageData) {
        return value;
      }
      if (isFloatImage(value)) {
        return floatToImageData(value);
      }
      if (isGPUTexture(value)) {
        const floatImage = downloadGPUTexture(value as GPUTexture);
        if (floatImage) {
          return floatToImageData(floatImage);
        }
      }
    }
    return null;
  };

  // Compute image data directly (no memoization to avoid stale values)
  const backgroundImageData = getImageDataForNode(backgroundNodeId);
  const foregroundImageData = getImageDataForNode(foregroundNodeId);

  // Determine what to display
  const hasBackground = backgroundImageData !== null;
  const hasForeground = foregroundImageData !== null;
  const showComparison = hasBackground && hasForeground;

  // Get the primary image for sizing
  const primaryImageData = backgroundImageData || foregroundImageData;

  // Render to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!primaryImageData) {
      canvas.width = 100;
      canvas.height = 100;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#808090';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No preview', 50, 55);
      setImageInfo(null);
      return;
    }

    const width = primaryImageData.width;
    const height = primaryImageData.height;
    canvas.width = width;
    canvas.height = height;

    // Draw checkerboard pattern for transparency
    const tileSize = 8;
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        ctx.fillStyle = ((x + y) / tileSize) % 2 === 0 ? '#404040' : '#303030';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }

    if (showComparison) {
      // Draw background fully first
      ctx.putImageData(backgroundImageData!, 0, 0);

      // Create temp canvas for foreground (putImageData ignores clipping, so we use drawImage)
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.putImageData(foregroundImageData!, 0, 0);

        // Clip foreground based on split position
        // Normal: foreground on left/top of splitter
        // Reversed: foreground on right/bottom of splitter (inverted mask)
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
      ctx.putImageData(backgroundImageData!, 0, 0);
    } else if (hasForeground) {
      ctx.putImageData(foregroundImageData!, 0, 0);
    }

    setImageInfo({ width, height });
  }, [nodeOutputs, backgroundNodeId, foregroundNodeId, previewSplitPosition, previewSplitVertical, previewSplitReversed, downloadGPUTexture]);

  // Auto-fit on first load or when image changes
  useEffect(() => {
    if (!primaryImageData || !containerRef.current) return;

    const fitToContainer = () => {
      const container = containerRef.current!;
      const containerWidth = container.clientWidth - 32;
      const containerHeight = container.clientHeight - 32;

      const scaleX = containerWidth / primaryImageData.width;
      const scaleY = containerHeight / primaryImageData.height;
      const scale = Math.min(scaleX, scaleY, 1);

      setZoom(scale);
      setPan({ x: 0, y: 0 });
    };

    fitToContainer();
  }, [primaryImageData?.width, primaryImageData?.height]);

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
    if (!primaryImageData || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const scaleX = containerWidth / primaryImageData.width;
    const scaleY = containerHeight / primaryImageData.height;
    const scale = Math.min(scaleX, scaleY);

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  }, [primaryImageData]);

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
              onClick={() => setPreviewForeground(0)}
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
              onClick={() => setPreviewForeground(1)}
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
              onClick={togglePreviewBackground}
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFit}
            className="px-2 py-1 text-xs text-editor-text-dim hover:text-editor-text hover:bg-editor-surface-light rounded transition-colors"
          >
            Fit
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
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{
          cursor: isDraggingSplitter
            ? (previewSplitVertical ? 'col-resize' : 'row-resize')
            : isNearSplitter
              ? (previewSplitVertical ? 'col-resize' : 'row-resize')
              : 'grab',
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
        </span>
        <span>
          FG: {foregroundNodeId ? '✓' : '—'} | BG: {backgroundNodeId ? '✓' : '—'}
        </span>
      </div>
    </div>
  );
}
