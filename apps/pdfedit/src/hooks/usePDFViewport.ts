import { useCallback, useRef, useState } from 'react';
import { usePDFStore } from '../store';

interface UsePDFViewportOptions {
  minScale?: number;
  maxScale?: number;
}

export function usePDFViewport(options: UsePDFViewportOptions = {}) {
  const { minScale = 0.5, maxScale = 3 } = options;

  const { scale, setScale, nextPage, prevPage } = usePDFStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const lastPanPosition = useRef({ x: 0, y: 0 });
  const lastTouchDistance = useRef(0);
  const lastTapTime = useRef(0);
  const swipeStartX = useRef(0);

  // Zoom at a specific point
  const zoomAt = useCallback((clientX: number, clientY: number, delta: number) => {
    const zoomFactor = 1 - delta * 0.001;
    const newScale = Math.max(minScale, Math.min(maxScale, scale * zoomFactor));
    setScale(newScale);
  }, [scale, setScale, minScale, maxScale]);

  // Reset zoom to fit
  const resetZoom = useCallback(() => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, [setScale]);

  // Toggle between fit and 100%
  const toggleFit = useCallback(() => {
    if (Math.abs(scale - 1) < 0.1) {
      setScale(1.5);
    } else {
      setScale(1);
    }
    setPanOffset({ x: 0, y: 0 });
  }, [scale, setScale]);

  // Mouse wheel handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY);
  }, [zoomAt]);

  // Touch handlers for pinch zoom and pan
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
      // Single finger - track for swipe or double-tap
      swipeStartX.current = e.touches[0].clientX;
      lastPanPosition.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };

      // Check for double-tap
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        toggleFit();
      }
      lastTapTime.current = now;
    }
  }, [toggleFit]);

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
        const scaleFactor = distance / lastTouchDistance.current;
        const delta = (1 - scaleFactor) * 500;
        zoomAt(centerX, centerY, delta);
      }

      // Also pan
      const panDx = centerX - lastPanPosition.current.x;
      const panDy = centerY - lastPanPosition.current.y;
      setPanOffset((prev) => ({
        x: prev.x + panDx,
        y: prev.y + panDy,
      }));

      lastTouchDistance.current = distance;
      lastPanPosition.current = { x: centerX, y: centerY };
    } else if (e.touches.length === 1 && scale > 1) {
      // Single finger panning when zoomed in
      const touch = e.touches[0];
      const panDx = touch.clientX - lastPanPosition.current.x;
      const panDy = touch.clientY - lastPanPosition.current.y;
      setPanOffset((prev) => ({
        x: prev.x + panDx,
        y: prev.y + panDy,
      }));
      lastPanPosition.current = { x: touch.clientX, y: touch.clientY };
    }
  }, [scale, zoomAt]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Check for horizontal swipe to change pages
    if (e.changedTouches.length === 1 && !isPanning && scale <= 1) {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - swipeStartX.current;

      if (Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          prevPage();
        } else {
          nextPage();
        }
      }
    }

    lastTouchDistance.current = 0;
    setIsPanning(false);
  }, [isPanning, scale, nextPage, prevPage]);

  return {
    containerRef,
    scale,
    isPanning,
    panOffset,
    zoomAt,
    resetZoom,
    toggleFit,
    handlers: {
      onWheel: handleWheel,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
