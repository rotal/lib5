import { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../store';

interface UseViewportOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomSensitivity?: number;
}

export function useViewport(options: UseViewportOptions = {}) {
  const {
    minZoom = 0.1,
    maxZoom = 5,
    zoomSensitivity = 0.001,
  } = options;

  const { graph, setViewport } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPosition = useRef({ x: 0, y: 0 });
  const lastTouchDistance = useRef(0);

  // Pan handlers
  const startPan = useCallback((clientX: number, clientY: number) => {
    setIsPanning(true);
    lastPanPosition.current = { x: clientX, y: clientY };
  }, []);

  const updatePan = useCallback((clientX: number, clientY: number) => {
    if (!isPanning) return;

    const dx = clientX - lastPanPosition.current.x;
    const dy = clientY - lastPanPosition.current.y;
    lastPanPosition.current = { x: clientX, y: clientY };

    setViewport({
      x: graph.viewport.x + dx / graph.viewport.zoom,
      y: graph.viewport.y + dy / graph.viewport.zoom,
    });
  }, [isPanning, graph.viewport, setViewport]);

  const endPan = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handlers
  const zoomAt = useCallback((
    clientX: number,
    clientY: number,
    delta: number
  ) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Calculate the world position under the mouse before zoom
    const worldXBefore = (mouseX - rect.width / 2) / graph.viewport.zoom - graph.viewport.x;
    const worldYBefore = (mouseY - rect.height / 2) / graph.viewport.zoom - graph.viewport.y;

    // Calculate new zoom
    const zoomFactor = 1 - delta * zoomSensitivity;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, graph.viewport.zoom * zoomFactor));

    // Calculate the world position under the mouse after zoom
    const worldXAfter = (mouseX - rect.width / 2) / newZoom - graph.viewport.x;
    const worldYAfter = (mouseY - rect.height / 2) / newZoom - graph.viewport.y;

    // Adjust viewport to keep mouse position stable
    setViewport({
      x: graph.viewport.x + (worldXAfter - worldXBefore),
      y: graph.viewport.y + (worldYAfter - worldYBefore),
      zoom: newZoom,
    });
  }, [graph.viewport, setViewport, minZoom, maxZoom, zoomSensitivity]);

  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, -100);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 100);
  }, [zoomAt]);

  const resetZoom = useCallback(() => {
    setViewport({ zoom: 1 });
  }, [setViewport]);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - rect.width / 2) / graph.viewport.zoom - graph.viewport.x;
    const y = (screenY - rect.top - rect.height / 2) / graph.viewport.zoom - graph.viewport.y;

    return { x, y };
  }, [graph.viewport]);

  // Convert world coordinates to screen coordinates
  const worldToScreen = useCallback((worldX: number, worldY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const x = (worldX + graph.viewport.x) * graph.viewport.zoom + rect.width / 2;
    const y = (worldY + graph.viewport.y) * graph.viewport.zoom + rect.height / 2;

    return { x, y };
  }, [graph.viewport]);

  // Mouse event handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY);
  }, [zoomAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button or space+click for panning
    if (e.button === 1) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
    }
  }, [startPan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      updatePan(e.clientX, e.clientY);
    }
  }, [isPanning, updatePan]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      endPan();
    }
  }, [isPanning, endPan]);

  // Touch event handlers for pinch zoom and pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      lastPanPosition.current = { x: centerX, y: centerY };
      setIsPanning(true);
    } else if (e.touches.length === 1) {
      // Single finger - could be panning
      lastPanPosition.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();

      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (lastTouchDistance.current > 0) {
        const scale = distance / lastTouchDistance.current;
        const delta = (1 - scale) * 500;
        zoomAt(centerX, centerY, delta);
      }

      // Also pan
      const panDx = centerX - lastPanPosition.current.x;
      const panDy = centerY - lastPanPosition.current.y;
      setViewport({
        x: graph.viewport.x + panDx / graph.viewport.zoom,
        y: graph.viewport.y + panDy / graph.viewport.zoom,
      });

      lastTouchDistance.current = distance;
      lastPanPosition.current = { x: centerX, y: centerY };
    }
  }, [graph.viewport, setViewport, zoomAt]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = 0;
    setIsPanning(false);
  }, []);

  // Global mouse up listener for when mouse leaves the container while panning
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isPanning) {
        endPan();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning, endPan]);

  return {
    containerRef,
    viewport: graph.viewport,
    isPanning,
    startPan,
    updatePan,
    endPan,
    zoomAt,
    zoomIn,
    zoomOut,
    resetZoom,
    screenToWorld,
    worldToScreen,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
