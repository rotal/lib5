import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useExecutionStore, useUiStore } from '../../store';
import { isFloatImage, floatToImageData } from '../../types/data';

export function PreviewViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodeOutputs, isExecuting } = useExecutionStore();
  const { previewNodeId } = useUiStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);

  // Find preview node (set by double-clicking on node preview)
  const previewNodes = React.useMemo(() => {
    if (previewNodeId && nodeOutputs[previewNodeId]) {
      return [previewNodeId];
    }
    return [];
  }, [previewNodeId, nodeOutputs]);

  // Get image to display - find first ImageData or FloatImage in any output
  const imageData = React.useMemo((): ImageData | null => {
    for (const nodeId of previewNodes) {
      const outputs = nodeOutputs[nodeId];
      if (!outputs) continue;

      // Check all outputs for ImageData or FloatImage
      for (const value of Object.values(outputs)) {
        if (value instanceof ImageData) {
          return value;
        }
        if (isFloatImage(value)) {
          // Convert FloatImage to ImageData for canvas display
          return floatToImageData(value);
        }
      }
    }
    return null;
  }, [previewNodes, nodeOutputs]);

  // Render image to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!imageData) {
      // Clear canvas
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

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    // Draw checkerboard pattern for transparency
    const tileSize = 8;
    for (let y = 0; y < canvas.height; y += tileSize) {
      for (let x = 0; x < canvas.width; x += tileSize) {
        ctx.fillStyle = ((x + y) / tileSize) % 2 === 0 ? '#404040' : '#303030';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }

    // Draw image
    ctx.putImageData(imageData, 0, 0);

    setImageInfo({ width: imageData.width, height: imageData.height });
  }, [imageData]);

  // Auto-fit on first load or when container resizes
  useEffect(() => {
    if (!imageData || !containerRef.current) return;

    const fitToContainer = () => {
      const container = containerRef.current!;
      const containerWidth = container.clientWidth - 32; // padding
      const containerHeight = container.clientHeight - 32;

      const scaleX = containerWidth / imageData.width;
      const scaleY = containerHeight / imageData.height;
      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale beyond 100%

      setZoom(scale);
      setPan({ x: 0, y: 0 });
    };

    fitToContainer();
  }, [imageData?.width, imageData?.height]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

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
  }, [pan]);

  const handleFit = useCallback(() => {
    if (!imageData || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const scaleX = containerWidth / imageData.width;
    const scaleY = containerHeight / imageData.height;
    const scale = Math.min(scaleX, scaleY);

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  }, [imageData]);

  const handleActualSize = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div className="flex flex-col h-full bg-editor-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border bg-editor-surface">
        <span className="text-sm font-medium text-editor-text">Preview</span>
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
        className="flex-1 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
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
      <div className="px-3 py-1 border-t border-editor-border bg-editor-surface text-xs text-editor-text-dim">
        <span>
          {imageInfo ? `${imageInfo.width} x ${imageInfo.height}` : 'No image'}
        </span>
      </div>
    </div>
  );
}
