import React, { useRef, useState, useCallback, useEffect } from 'react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// Snap points: collapsed (header only), half, full
const SNAP_POINTS = {
  collapsed: 64,
  half: 0.5,
  full: 0.85,
};

export function MobileBottomSheet({ isOpen, onClose, title, children }: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(SNAP_POINTS.collapsed);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Calculate viewport-relative heights
  const getViewportHeight = () => window.innerHeight;
  const getSnapHeight = (snap: number | keyof typeof SNAP_POINTS): number => {
    if (typeof snap === 'number' && snap < 1) {
      return getViewportHeight() * snap;
    }
    if (snap === 'collapsed') return SNAP_POINTS.collapsed;
    if (snap === 'half') return getViewportHeight() * SNAP_POINTS.half;
    if (snap === 'full') return getViewportHeight() * SNAP_POINTS.full;
    return typeof snap === 'number' ? snap : SNAP_POINTS.collapsed;
  };

  // Find nearest snap point
  const snapToNearest = useCallback((currentHeight: number) => {
    const vh = getViewportHeight();
    const snapHeights = [
      SNAP_POINTS.collapsed,
      vh * SNAP_POINTS.half,
      vh * SNAP_POINTS.full,
    ];

    let nearest = snapHeights[0];
    let minDist = Math.abs(currentHeight - nearest);

    for (const snap of snapHeights) {
      const dist = Math.abs(currentHeight - snap);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    }

    // If snapped to collapsed, close
    if (nearest === SNAP_POINTS.collapsed) {
      onClose();
      return;
    }

    setHeight(nearest);
  }, [onClose]);

  // Initialize to half when opened
  useEffect(() => {
    if (isOpen) {
      setHeight(getSnapHeight('half'));
    }
  }, [isOpen]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    dragStartHeight.current = height;
  }, [height]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const deltaY = dragStartY.current - e.touches[0].clientY;
    const newHeight = Math.max(
      SNAP_POINTS.collapsed,
      Math.min(getViewportHeight() * SNAP_POINTS.full, dragStartHeight.current + deltaY)
    );

    setHeight(newHeight);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    snapToNearest(height);
  }, [isDragging, height, snapToNearest]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          height,
          transition: isDragging ? 'none' : 'height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'none',
        }}
      >
        {/* Glassmorphism container */}
        <div className="h-full flex flex-col bg-editor-surface-solid/95 backdrop-blur-xl rounded-t-[20px] border-t border-x border-editor-border-light shadow-elevated-lg">
          {/* Handle bar */}
          <div
            className="flex-shrink-0 py-3 cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-9 h-1 bg-white/20 rounded-full mx-auto" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 px-5 pb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-editor-text">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-editor-surface-light hover:bg-editor-surface-hover text-editor-text-dim hover:text-editor-text transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-editor-border" />

          {/* Content */}
          <div className="flex-1 overflow-auto safe-area-pb">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
