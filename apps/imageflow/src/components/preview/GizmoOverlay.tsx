import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGraph } from '../../hooks/useGraph';
import type { GizmoDefinition, GizmoHandle, NodeInstance } from '../../types/node';

interface GizmoOverlayProps {
  /** Node instance with gizmo */
  node: NodeInstance;
  /** Gizmo definition from node type */
  gizmo: GizmoDefinition;
  /** Image dimensions (input image, before transform) */
  imageWidth: number;
  imageHeight: number;
  /** Image offset in normalized 0-1 canvas coordinates (input image position) */
  imageOffset?: { x: number; y: number };
  /** Project canvas size (for centering in view) */
  canvasSize: { width: number; height: number };
  /** Current zoom level */
  zoom: number;
  /** Current pan offset */
  pan: { x: number; y: number };
  /** Container element for coordinate conversion */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Canvas element for coordinate conversion */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Gizmo mode: translate or pivot */
  gizmoMode: 'translate' | 'pivot';
  /** Gizmo visibility: which gizmos to show (Maya-style Q/W/E/R) */
  gizmoVisibility: 'all' | 'translate' | 'rotate' | 'scale';
  /** Callback when drag state changes (to lock view during drag and trigger execution on release) */
  onDragChange?: (isDragging: boolean) => void;
  /** Callback with live transform delta during drag (for visual feedback without param updates) */
  onTransformDrag?: (transform: { tx: number; ty: number; angle: number; scaleX: number; scaleY: number } | null) => void;
}

interface DragState {
  handleId: string;
  startMouseX: number;
  startMouseY: number;
  startParams: Record<string, number>;
  // Track current mouse screen position for immediate visual feedback
  currentMouseX?: number;
  currentMouseY?: number;
  // Initial gizmo screen position (for visual feedback that matches parameter-derived position)
  startGizmoX?: number;
  startGizmoY?: number;
}

const HANDLE_SIZE = 8;
const HANDLE_HIT_SIZE = 12;
const ROTATION_RADIUS = 80;
const EDGE_HIT_SIZE = 10;

export function GizmoOverlay({
  node,
  gizmo,
  imageWidth,
  imageHeight,
  imageOffset = { x: 0, y: 0 },
  canvasSize,
  zoom,
  pan,
  containerRef,
  canvasRef,
  gizmoMode,
  gizmoVisibility,
  onDragChange,
  onTransformDrag,
}: GizmoOverlayProps) {
  // Image offset in pixels (top-left of input image in project space)
  const imageOffsetPx = {
    x: imageOffset.x * canvasSize.width,
    y: imageOffset.y * canvasSize.height,
  };
  const { updateNodeParameter, batchUpdateNodeParameters, commitParameterChange } = useGraph();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Ref for transient updates during drag (immediate visual feedback without re-render lag)
  const dragVisualRef = useRef<{ x: number; y: number } | null>(null);

  // Notify parent when drag state changes (to lock view during drag)
  const isDragging = dragState !== null;
  useEffect(() => {
    onDragChange?.(isDragging);
    // Clear transform drag when not dragging
    if (!isDragging) {
      onTransformDrag?.(null);
    }
  }, [isDragging, onDragChange, onTransformDrag]);

  // Handle Shift key for both-edge scaling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftHeld(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Convert image-local coordinates to screen coordinates
  // Image-local coords are relative to the image's top-left corner (0,0 = top-left)
  // Images are centered on canvas: image center is at view (0,0) when offset=(0,0)
  // So image top-left is at view (-imageWidth/2, -imageHeight/2)
  const imageToScreen = useCallback(
    (ix: number, iy: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      // Image is centered: image top-left at (-imageWidth/2, -imageHeight/2) in view coords
      // Image-local (ix, iy) → view (ix - imageWidth/2, iy - imageHeight/2) + offset
      const viewX = ix - imageWidth / 2 + imageOffsetPx.x;
      const viewY = iy - imageHeight / 2 + imageOffsetPx.y;

      // View coords -> screen coords
      const screenX = viewX * zoom + centerX + pan.x;
      const screenY = viewY * zoom + centerY + pan.y;

      return { x: screenX, y: screenY };
    },
    [containerRef, imageWidth, imageHeight, zoom, pan, imageOffsetPx]
  );

  // Convert screen coordinates to image-local coordinates
  // Inverse of imageToScreen
  const screenToImage = useCallback(
    (sx: number, sy: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      // Reverse: screen -> view -> image-local
      const viewX = (sx - centerX - pan.x) / zoom;
      const viewY = (sy - centerY - pan.y) / zoom;

      // View coords to image-local (inverse of centered positioning)
      // view = imageLocal - imageSize/2 + offset
      // imageLocal = view + imageSize/2 - offset
      const imageX = viewX + imageWidth / 2 - imageOffsetPx.x;
      const imageY = viewY + imageHeight / 2 - imageOffsetPx.y;

      return { x: imageX, y: imageY };
    },
    [containerRef, imageWidth, imageHeight, zoom, pan, imageOffsetPx]
  );

  // Get pivot position in image-local coordinates (for screen display)
  const getPivotPosition = useCallback(() => {
    const params = node.parameters;
    // Pivot is normalized -1 to 1 (0 = center, -1 = left/top, 1 = right/bottom)
    const pivotNormX = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[0]] as number) ?? 0)
      : 0;
    const pivotNormY = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[1]] as number) ?? 0)
      : 0;
    // Offset is in pixels
    const offsetX = gizmo.translateParams
      ? ((params[gizmo.translateParams[0]] as number) ?? 0)
      : 0;
    const offsetY = gizmo.translateParams
      ? ((params[gizmo.translateParams[1]] as number) ?? 0)
      : 0;

    // Pivot in image-local coords: pivot (0,0) = image center = (imageW/2, imageH/2)
    // Normalized -1 to 1 maps to 0 to imageWidth
    const pivotImageLocalX = imageWidth / 2 + pivotNormX * imageWidth / 2 + offsetX;
    const pivotImageLocalY = imageHeight / 2 + pivotNormY * imageHeight / 2 + offsetY;

    return { x: pivotImageLocalX, y: pivotImageLocalY };
  }, [node.parameters, gizmo.pivotParams, gizmo.translateParams, imageWidth, imageHeight]);

  // Get bounding box corners considering scale and rotation
  // Returns corners in image-local coordinates (for imageToScreen conversion)
  const getBoundingBox = useCallback(() => {
    const params = node.parameters;
    const scaleX = gizmo.scaleParams
      ? ((params[gizmo.scaleParams[0]] as number) ?? 1)
      : ((params.scaleX as number) ?? 1);
    const scaleY = gizmo.scaleParams
      ? ((params[gizmo.scaleParams[1]] as number) ?? 1)
      : ((params.scaleY as number) ?? 1);
    // Get rotation from gizmo's rotationParam or fallback
    const angleDeg = gizmo.rotationParam
      ? ((params[gizmo.rotationParam] as number) ?? 0)
      : ((params.angle as number) ?? 0);
    const angle = angleDeg * (Math.PI / 180);
    // Get offset from gizmo's translateParams or fallback (pixels)
    const offsetX = gizmo.translateParams
      ? ((params[gizmo.translateParams[0]] as number) ?? 0)
      : ((params.offsetX as number) ?? 0);
    const offsetY = gizmo.translateParams
      ? ((params[gizmo.translateParams[1]] as number) ?? 0)
      : ((params.offsetY as number) ?? 0);
    // Get pivot from gizmo's pivotParams - normalized -1 to 1
    const pivotNormX = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[0]] as number) ?? 0)
      : ((params.pivotX as number) ?? 0);
    const pivotNormY = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[1]] as number) ?? 0)
      : ((params.pivotY as number) ?? 0);

    // Pivot in image-local coords: pivot (0,0) = image center = (imageW/2, imageH/2)
    const px = imageWidth / 2 + pivotNormX * imageWidth / 2;
    const py = imageHeight / 2 + pivotNormY * imageHeight / 2;

    const corners = [
      { x: 0, y: 0 },           // top-left
      { x: imageWidth, y: 0 },   // top-right
      { x: imageWidth, y: imageHeight }, // bottom-right
      { x: 0, y: imageHeight },  // bottom-left
    ];

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return corners.map((c) => {
      let x = c.x - px;
      let y = c.y - py;
      x *= scaleX;
      y *= scaleY;
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      return {
        x: rx + px + offsetX,
        y: ry + py + offsetY,
      };
    });
  }, [node.parameters, gizmo, imageWidth, imageHeight]);

  // Handle mouse down on a gizmo handle
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, handle: GizmoHandle) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const startParams: Record<string, number> = {};
      for (const paramId of handle.params) {
        startParams[paramId] = (node.parameters[paramId] as number) ?? 0;
      }

      setDragState({
        handleId: handle.id,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, containerRef]
  );

  // Handle rotation drag start
  const handleRotationMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const startParams: Record<string, number> = {
        [gizmo.rotationParam!]: (node.parameters[gizmo.rotationParam!] as number) ?? 0,
      };

      setDragState({
        handleId: '_rotation',
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, gizmo.rotationParam, containerRef]
  );

  // Handle scale drag start (edge or corner)
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, handleId: string) => {
      e.stopPropagation();
      e.preventDefault();

      if (!gizmo.scaleParams) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const [scaleXParam, scaleYParam] = gizmo.scaleParams;
      const startParams: Record<string, number> = {
        [scaleXParam]: (node.parameters[scaleXParam] as number) ?? 1,
        [scaleYParam]: (node.parameters[scaleYParam] as number) ?? 1,
      };

      // Store initial offset for single-edge mode
      if (gizmo.translateParams) {
        const [offsetXParam, offsetYParam] = gizmo.translateParams;
        startParams[offsetXParam] = (node.parameters[offsetXParam] as number) ?? 0;
        startParams[offsetYParam] = (node.parameters[offsetYParam] as number) ?? 0;
      }

      // Store initial pivot for consistent calculations
      if (gizmo.pivotParams) {
        const [pivotXParam, pivotYParam] = gizmo.pivotParams;
        startParams[pivotXParam] = (node.parameters[pivotXParam] as number) ?? 0.5;
        startParams[pivotYParam] = (node.parameters[pivotYParam] as number) ?? 0.5;
      }

      // Store initial angle for scale calculations
      if (gizmo.rotationParam) {
        startParams['_angle'] = (node.parameters[gizmo.rotationParam] as number) ?? 0;
      }

      setDragState({
        handleId,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, gizmo.scaleParams, gizmo.translateParams, gizmo.pivotParams, gizmo.rotationParam, containerRef]
  );

  // Handle translate/pivot gizmo drag start
  const handleTranslatePivotMouseDown = useCallback(
    (e: React.MouseEvent, axis: 'x' | 'y' | 'xy') => {
      e.stopPropagation();
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      let params: [string, string];
      if (gizmoMode === 'translate' && gizmo.translateParams) {
        params = gizmo.translateParams;
      } else if (gizmoMode === 'pivot' && gizmo.pivotParams) {
        params = gizmo.pivotParams;
      } else {
        return;
      }

      const [paramX, paramY] = params;
      const startParams: Record<string, number> = {
        // Pivot is now in pixels, default 0 means "use image center"
        [paramX]: (node.parameters[paramX] as number) ?? 0,
        [paramY]: (node.parameters[paramY] as number) ?? 0,
      };

      // For pivot mode, also store the initial offset and transform values for compensation
      if (gizmoMode === 'pivot' && gizmo.translateParams) {
        const [offsetX, offsetY] = gizmo.translateParams;
        startParams[offsetX] = (node.parameters[offsetX] as number) ?? 0;
        startParams[offsetY] = (node.parameters[offsetY] as number) ?? 0;

        // Store scale/angle values (use raw values, no uniformScale logic)
        if (gizmo.scaleParams) {
          startParams['_scaleX'] = (node.parameters[gizmo.scaleParams[0]] as number) ?? 1;
          startParams['_scaleY'] = (node.parameters[gizmo.scaleParams[1]] as number) ?? 1;
        }
        if (gizmo.rotationParam) {
          startParams['_angle'] = (node.parameters[gizmo.rotationParam] as number) ?? 0;
        }
      }

      // Compute gizmo screen position so visual feedback matches parameter-derived position
      const pivotImg = getPivotPosition();
      const pivotScr = imageToScreen(pivotImg.x, pivotImg.y);

      setDragState({
        handleId: `_${gizmoMode}_${axis}`,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
        startGizmoX: pivotScr.x,
        startGizmoY: pivotScr.y,
      });
    },
    [node.parameters, gizmo.translateParams, gizmo.pivotParams, gizmoMode, containerRef, getPivotPosition, imageToScreen]
  );


  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const pivotImg = getPivotPosition();
      const pivotScreen = imageToScreen(pivotImg.x, pivotImg.y);

      // Rotation drag - update params directly for correct SRT order transform
      // (TRANSFORM_NODE_PARAMS skips execution, so this is fast)
      if (dragState.handleId === '_rotation' && gizmo.rotationParam) {
        const startAngle = Math.atan2(
          dragState.startMouseY - pivotScreen.y,
          dragState.startMouseX - pivotScreen.x
        );
        const currentAngle = Math.atan2(currentY - pivotScreen.y, currentX - pivotScreen.x);
        const deltaAngleDeg = ((currentAngle - startAngle) * 180) / Math.PI;
        const newAngle = dragState.startParams[gizmo.rotationParam] + deltaAngleDeg;

        if (Number.isFinite(newAngle)) {
          updateNodeParameter(node.id, gizmo.rotationParam, newAngle);
        }
      }
      // Translate drag - visual feedback only, params updated on release
      else if (dragState.handleId.startsWith('_translate_') && gizmo.translateParams) {
        const axis = dragState.handleId.split('_')[2];

        // Store visual position using gizmo origin + constrained delta
        let screenDeltaX = currentX - dragState.startMouseX;
        let screenDeltaY = currentY - dragState.startMouseY;
        if (axis === 'x') screenDeltaY = 0;
        if (axis === 'y') screenDeltaX = 0;
        dragVisualRef.current = {
          x: (dragState.startGizmoX ?? dragState.startMouseX) + screenDeltaX,
          y: (dragState.startGizmoY ?? dragState.startMouseY) + screenDeltaY,
        };

        // Calculate delta in image coordinates (pixels) for visual feedback
        const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
        const currentImg = screenToImage(currentX, currentY);
        let deltaX = currentImg.x - startImg.x;
        let deltaY = currentImg.y - startImg.y;
        if (axis === 'x') deltaY = 0;
        if (axis === 'y') deltaX = 0;

        // Send visual transform delta to preview (no param updates during drag)
        onTransformDrag?.({
          tx: deltaX,
          ty: deltaY,
          angle: 0,
          scaleX: 1,
          scaleY: 1,
        });
      }
      // Pivot drag - visual feedback only during drag, params updated on release
      // This avoids complex real-time compensation calculations
      else if (dragState.handleId.startsWith('_pivot_') && gizmo.pivotParams) {
        const axis = dragState.handleId.split('_')[2];

        // Calculate screen delta (world-space approach - no rotation constraint needed)
        let screenDeltaX = currentX - dragState.startMouseX;
        let screenDeltaY = currentY - dragState.startMouseY;

        // Constrain to axis in screen/world space
        if (axis === 'x') screenDeltaY = 0;
        if (axis === 'y') screenDeltaX = 0;

        // Store constrained visual position for zero-lag feedback (no param updates during drag)
        dragVisualRef.current = {
          x: (dragState.startGizmoX ?? dragState.startMouseX) + screenDeltaX,
          y: (dragState.startGizmoY ?? dragState.startMouseY) + screenDeltaY,
        };
      }
      // Scale drag - update params directly for correct SRT order transform
      // No shift: single edge mode (opposite edge fixed, requires offset compensation)
      // Shift: scale both edges symmetrically around pivot
      else if (dragState.handleId.startsWith('_scale_') && gizmo.scaleParams) {
        const [scaleXParam, scaleYParam] = gizmo.scaleParams;
        const scaleType = dragState.handleId.replace('_scale_', '');
        const startScaleX = dragState.startParams[scaleXParam];
        const startScaleY = dragState.startParams[scaleYParam];

        // Get rotation angle from start params
        const angleDeg = dragState.startParams['_angle'] ?? 0;
        const angleRad = angleDeg * Math.PI / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        // Pivot normalized -1 to 1, convert to image-local pixels for bounding box calc
        // Image center is at (w/2, h/2) in image-local
        const pivotNormX = gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0) : 0;
        const pivotNormY = gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0) : 0;
        const px = imageWidth / 2 + pivotNormX * imageWidth / 2;
        const py = imageHeight / 2 + pivotNormY * imageHeight / 2;

        // Start offsets in pixels
        const startOx = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[0]] ?? 0) : 0;
        const startOy = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[1]] ?? 0) : 0;

        let newScaleX = startScaleX;
        let newScaleY = startScaleY;

        // Compute anchor screen position for single-edge mode
        const computeAnchorScreen = (anchorImgX: number, anchorImgY: number) => {
          const worldX = cos * startScaleX * (anchorImgX - px) - sin * startScaleY * (anchorImgY - py) + px + startOx;
          const worldY = sin * startScaleX * (anchorImgX - px) + cos * startScaleY * (anchorImgY - py) + py + startOy;
          return imageToScreen(worldX, worldY);
        };

        // Offset compensation for single-edge mode (keeps opposite edge fixed)
        const compensateOffset = (newSX: number, newSY: number) => {
          if (shiftHeld || !gizmo.translateParams) return;
          const [offsetXParam, offsetYParam] = gizmo.translateParams;
          let ax = px, ay = py; // Anchor point in image space
          if (scaleType === 'right') ax = 0;
          if (scaleType === 'left') ax = imageWidth;
          if (scaleType === 'bottom') ay = 0;
          if (scaleType === 'top') ay = imageHeight;

          // Compute offset to keep anchor fixed
          // Delta scale
          const dsx = newSX - startScaleX;
          const dsy = newSY - startScaleY;
          const localX = dsx * (ax - px);
          const localY = dsy * (ay - py);
          // New offset in pixels (round to integer)
          const newOx = Math.round(startOx - (cos * localX - sin * localY));
          const newOy = Math.round(startOy - (sin * localX + cos * localY));

          if (Number.isFinite(newOx) && Number.isFinite(newOy)) {
            updateNodeParameter(node.id, offsetXParam, newOx);
            updateNodeParameter(node.id, offsetYParam, newOy);
          }
        };

        if (scaleType === 'corner') {
          // Uniform scale from corner - ratio of distance from pivot
          const startDelta = { x: dragState.startMouseX - pivotScreen.x, y: dragState.startMouseY - pivotScreen.y };
          const currentDelta = { x: currentX - pivotScreen.x, y: currentY - pivotScreen.y };
          const startD = Math.sqrt(startDelta.x * startDelta.x + startDelta.y * startDelta.y);
          const currentD = Math.sqrt(currentDelta.x * currentDelta.x + currentDelta.y * currentDelta.y);
          if (startD > 1) {
            const factor = currentD / startD;
            newScaleX = Math.max(0.01, startScaleX * factor);
            newScaleY = Math.max(0.01, startScaleY * factor);
          }
        } else if (scaleType === 'left' || scaleType === 'right') {
          if (shiftHeld) {
            // Shift: scale both edges around pivot
            const xDir = { x: cos * zoom, y: sin * zoom };
            const startDistX = (dragState.startMouseX - pivotScreen.x) * xDir.x + (dragState.startMouseY - pivotScreen.y) * xDir.y;
            const currentDistX = (currentX - pivotScreen.x) * xDir.x + (currentY - pivotScreen.y) * xDir.y;
            if (Math.abs(startDistX) > 1) {
              newScaleX = Math.max(0.01, startScaleX * (currentDistX / startDistX));
            }
          } else {
            // No shift: single edge mode - compute scale so edge follows mouse
            const anchorImgX = scaleType === 'right' ? 0 : imageWidth;
            const anchorScr = computeAnchorScreen(anchorImgX, py);
            const mouseProj = currentX * cos + currentY * sin;
            const anchorProj = anchorScr.x * cos + anchorScr.y * sin;
            const sign = scaleType === 'right' ? 1 : -1;
            newScaleX = Math.max(0.01, sign * (mouseProj - anchorProj) / (imageWidth * zoom));
          }
        } else if (scaleType === 'top' || scaleType === 'bottom') {
          if (shiftHeld) {
            // Shift: scale both edges around pivot
            const yDir = { x: -sin * zoom, y: cos * zoom };
            const startDistY = (dragState.startMouseX - pivotScreen.x) * yDir.x + (dragState.startMouseY - pivotScreen.y) * yDir.y;
            const currentDistY = (currentX - pivotScreen.x) * yDir.x + (currentY - pivotScreen.y) * yDir.y;
            if (Math.abs(startDistY) > 1) {
              newScaleY = Math.max(0.01, startScaleY * (currentDistY / startDistY));
            }
          } else {
            // No shift: single edge mode - compute scale so edge follows mouse
            const anchorImgY = scaleType === 'bottom' ? 0 : imageHeight;
            const anchorScr = computeAnchorScreen(px, anchorImgY);
            const mouseProj = currentX * (-sin) + currentY * cos;
            const anchorProj = anchorScr.x * (-sin) + anchorScr.y * cos;
            const sign = scaleType === 'bottom' ? 1 : -1;
            newScaleY = Math.max(0.01, sign * (mouseProj - anchorProj) / (imageHeight * zoom));
          }
        }

        // Update scale params
        if (Number.isFinite(newScaleX)) {
          updateNodeParameter(node.id, scaleXParam, newScaleX);
        }
        if (Number.isFinite(newScaleY)) {
          updateNodeParameter(node.id, scaleYParam, newScaleY);
        }

        // Apply offset compensation for single-edge mode
        if (!shiftHeld && scaleType !== 'corner') {
          compensateOffset(newScaleX, newScaleY);
        }
      }
      // Generic handle drag
      else {
        const handle = gizmo.handles.find((h) => h.id === dragState.handleId);
        if (handle) {
          const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
          const currentImg = screenToImage(currentX, currentY);
          const deltaX = currentImg.x - startImg.x;
          const deltaY = currentImg.y - startImg.y;

          const [paramX, paramY] = handle.params;
          let newX: number, newY: number;

          switch (handle.coordSystem) {
            case 'normalized':
              newX = dragState.startParams[paramX] + deltaX / imageWidth;
              newY = dragState.startParams[paramY] + deltaY / imageHeight;
              break;
            case 'percent':
              newX = dragState.startParams[paramX] + (deltaX / imageWidth) * 100;
              newY = dragState.startParams[paramY] + (deltaY / imageHeight) * 100;
              break;
            case 'pixels':
            default:
              newX = dragState.startParams[paramX] + deltaX;
              newY = dragState.startParams[paramY] + deltaY;
              break;
          }

          updateNodeParameter(node.id, paramX, newX);
          updateNodeParameter(node.id, paramY, newY);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragState) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const currentX = e.clientX - rect.left;
          const currentY = e.clientY - rect.top;

          // For translate drag: compute final params and update on release
          if (dragState.handleId.startsWith('_translate_') && gizmo.translateParams) {
            const [paramX, paramY] = gizmo.translateParams;
            const axis = dragState.handleId.split('_')[2];

            // Calculate delta in image coordinates (pixels)
            const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
            const currentImg = screenToImage(currentX, currentY);
            let deltaX = currentImg.x - startImg.x;
            let deltaY = currentImg.y - startImg.y;
            if (axis === 'x') deltaY = 0;
            if (axis === 'y') deltaX = 0;

            // Offset is in pixels, round to integer
            const newX = Math.round(dragState.startParams[paramX] + deltaX);
            const newY = Math.round(dragState.startParams[paramY] + deltaY);

            // Update params on release
            if (axis !== 'y' && Number.isFinite(newX)) updateNodeParameter(node.id, paramX, newX);
            if (axis !== 'x' && Number.isFinite(newY)) updateNodeParameter(node.id, paramY, newY);
          }
          // For pivot drag: compute pivot + offset compensation on release
          // Uses world-space approach: move pivot in world space, convert back to image coords
          // Key insight: to make pivot end up where dragged, we need to apply inv(R*S) to world delta
          else if (dragState.handleId.startsWith('_pivot_') && gizmo.pivotParams) {
            if (imageWidth > 0 && imageHeight > 0) {
              const [pivotXParam, pivotYParam] = gizmo.pivotParams;
              const axis = dragState.handleId.split('_')[2];

              // Get start values
              const startPivotNormX = dragState.startParams[pivotXParam] ?? 0;
              const startPivotNormY = dragState.startParams[pivotYParam] ?? 0;
              const startOffsetX = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[0]] ?? 0) : 0;
              const startOffsetY = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[1]] ?? 0) : 0;
              const scaleX = dragState.startParams['_scaleX'] ?? 1;
              const scaleY = dragState.startParams['_scaleY'] ?? 1;
              const angleDeg = dragState.startParams['_angle'] ?? 0;
              const angleRad = angleDeg * Math.PI / 180;
              const c = Math.cos(angleRad);
              const s = Math.sin(angleRad);

              // Step 1: World delta from screen delta
              let worldDeltaX = (currentX - dragState.startMouseX) / zoom;
              let worldDeltaY = (currentY - dragState.startMouseY) / zoom;

              // Constrain to axis (in world space)
              if (axis === 'x') worldDeltaY = 0;
              if (axis === 'y') worldDeltaX = 0;

              // Step 2: Apply inverse R*S to world delta to get pivot local delta
              // inv(R*S) * [wx, wy] = [(c*wx + s*wy)/sX, (-s*wx + c*wy)/sY]
              // This ensures the pivot ends up where we drag it in world space
              const localDeltaX = (c * worldDeltaX + s * worldDeltaY) / scaleX;
              const localDeltaY = (-s * worldDeltaX + c * worldDeltaY) / scaleY;

              // Step 3: Compute new pivot from center
              const startPivotFromCenterX = startPivotNormX * imageWidth / 2;
              const startPivotFromCenterY = startPivotNormY * imageHeight / 2;
              const newPivotFromCenterX = startPivotFromCenterX + localDeltaX;
              const newPivotFromCenterY = startPivotFromCenterY + localDeltaY;

              // Convert to normalized (-1 to 1)
              const newPivotNormX = newPivotFromCenterX / (imageWidth / 2);
              const newPivotNormY = newPivotFromCenterY / (imageHeight / 2);

              // Step 4: Offset compensation (keep image stationary)
              // d = oldPivotLocal - newPivotLocal = -localDelta
              // newOffset = oldOffset + d - R*S*d
              const updates: Record<string, number> = {};

              if (gizmo.translateParams) {
                const [offsetXParam, offsetYParam] = gizmo.translateParams;

                const dpx = -localDeltaX;
                const dpy = -localDeltaY;

                // R*S*d
                const rsDpx = c * scaleX * dpx - s * scaleY * dpy;
                const rsDpy = s * scaleX * dpx + c * scaleY * dpy;

                // newOffset = oldOffset + d - R*S*d
                const newOffsetX = Math.round(startOffsetX + dpx - rsDpx);
                const newOffsetY = Math.round(startOffsetY + dpy - rsDpy);

                if (Number.isFinite(newOffsetX)) updates[offsetXParam] = newOffsetX;
                if (Number.isFinite(newOffsetY)) updates[offsetYParam] = newOffsetY;
              }

              // Add pivot updates
              if (Number.isFinite(newPivotNormX) && axis !== 'y') updates[pivotXParam] = newPivotNormX;
              if (Number.isFinite(newPivotNormY) && axis !== 'x') updates[pivotYParam] = newPivotNormY;

              if (Object.keys(updates).length > 0) {
                batchUpdateNodeParameters(node.id, updates);
              }
            }
          }
          // Rotation and scale params are already updated during drag
          // (no additional work needed on release)
        }

        // Commit the changes (triggers history save and execution)
        const paramIds = Object.keys(dragState.startParams);
        if (paramIds.length > 0) {
          commitParameterChange(node.id, paramIds[0]);
        }
      }
      dragVisualRef.current = null;
      onTransformDrag?.(null);
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    gizmo,
    node,
    imageWidth,
    imageHeight,
    imageOffsetPx,
    canvasSize,
    screenToImage,
    imageToScreen,
    getPivotPosition,
    updateNodeParameter,
    batchUpdateNodeParameters,
    commitParameterChange,
    containerRef,
    shiftHeld,
    zoom,
  ]);

  // Render bounding box with interactive edges and corners for scaling

  const renderBoundingBox = () => {
    if (!gizmo.showBoundingBox) return null;

    const corners = getBoundingBox();
    const screenCorners = corners.map((c) => imageToScreen(c.x, c.y));

    const pathData = `M ${screenCorners[0].x} ${screenCorners[0].y}
                      L ${screenCorners[1].x} ${screenCorners[1].y}
                      L ${screenCorners[2].x} ${screenCorners[2].y}
                      L ${screenCorners[3].x} ${screenCorners[3].y} Z`;

    // Use simple grab cursor for edges - works at any angle without confusion
    const edges = [
      { id: 'top', p1: screenCorners[0], p2: screenCorners[1] },
      { id: 'right', p1: screenCorners[1], p2: screenCorners[2] },
      { id: 'bottom', p1: screenCorners[2], p2: screenCorners[3] },
      { id: 'left', p1: screenCorners[3], p2: screenCorners[0] },
    ];

    return (
      <>
        {/* Bounding box outline */}
        <path
          d={pathData}
          fill="none"
          stroke="white"
          strokeWidth="1"
          style={{ pointerEvents: 'none' }}
        />

        {/* Interactive edges for single-axis scaling */}
        {gizmo.scaleParams && edges.map((edge) => (
          <line
            key={edge.id}
            x1={edge.p1.x}
            y1={edge.p1.y}
            x2={edge.p2.x}
            y2={edge.p2.y}
            stroke="transparent"
            strokeWidth={EDGE_HIT_SIZE}
            style={{ cursor: 'move' }}
            onMouseDown={(e) => handleScaleMouseDown(e, `_scale_${edge.id}`)}
          />
        ))}

        {/* Interactive corners for uniform scaling */}
        {gizmo.scaleParams && screenCorners.map((corner, i) => {
          const isHovered = hoveredHandle === `_scale_corner_${i}`;
          const isDragging = dragState?.handleId === '_scale_corner';

          return (
            <g key={`corner-${i}`}>
              {/* Corner hit area */}
              <circle
                cx={corner.x}
                cy={corner.y}
                r={HANDLE_HIT_SIZE}
                fill="transparent"
                style={{ cursor: 'move' }}
                onMouseDown={(e) => handleScaleMouseDown(e, '_scale_corner')}
                onMouseEnter={() => setHoveredHandle(`_scale_corner_${i}`)}
                onMouseLeave={() => setHoveredHandle(null)}
              />
              {/* Corner handle */}
              <rect
                x={corner.x - HANDLE_SIZE / 2}
                y={corner.y - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                fill={isHovered || isDragging ? '#3b82f6' : 'white'}
                stroke={isHovered || isDragging ? 'white' : '#3b82f6'}
                strokeWidth="1.5"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}

      </>
    );
  };

  // Render rotation circle around pivot
  const renderRotationHandle = () => {
    if (!gizmo.showRotation || !gizmo.rotationParam) return null;

    // During translate/pivot drag, use ref for immediate visual feedback
    const isDraggingTranslateOrPivot = dragState &&
      (dragState.handleId.startsWith('_translate_') || dragState.handleId.startsWith('_pivot_'));
    const pivotScreen = isDraggingTranslateOrPivot && dragVisualRef.current
      ? dragVisualRef.current
      : imageToScreen(getPivotPosition().x, getPivotPosition().y);
    const isHovered = hoveredHandle === '_rotation';
    const isDragging = dragState?.handleId === '_rotation';
    const currentAngle = ((node.parameters[gizmo.rotationParam] as number) ?? 0) * (Math.PI / 180);

    // Use CSS transform for GPU-accelerated positioning
    return (
      <g style={{ transform: `translate(${pivotScreen.x}px, ${pivotScreen.y}px)` }}>
        {/* Visible rotation circle */}
        <circle
          cx={0}
          cy={0}
          r={ROTATION_RADIUS}
          fill="none"
          stroke={isHovered || isDragging ? '#66ff66' : '#22c55e'}
          strokeWidth="2"
          style={{ pointerEvents: 'none' }}
        />
        {/* Hit area for rotation (wider invisible stroke) */}
        <circle
          cx={0}
          cy={0}
          r={ROTATION_RADIUS}
          fill="none"
          stroke="transparent"
          strokeWidth="14"
          style={{ cursor: 'move' }}
          onMouseDown={handleRotationMouseDown}
          onMouseEnter={() => setHoveredHandle('_rotation')}
          onMouseLeave={() => setHoveredHandle(null)}
        />
        {/* Angle indicator line */}
        <line
          x1={0}
          y1={0}
          x2={Math.cos(currentAngle) * ROTATION_RADIUS}
          y2={Math.sin(currentAngle) * ROTATION_RADIUS}
          stroke={isHovered || isDragging ? '#66ff66' : '#22c55e'}
          strokeWidth="2"
          style={{ pointerEvents: 'none' }}
        />
      </g>
    );
  };

  // Render translate or pivot gizmo (at pivot location, toggled with Insert key)
  const renderTranslatePivotGizmo = () => {
    const hasTranslate = gizmo.translateParams;
    const hasPivot = gizmo.pivotParams;
    if (!hasTranslate && !hasPivot) return null;

    // During drag, use ref for immediate visual feedback; otherwise use calculated position
    const isDraggingTranslateOrPivot = dragState &&
      (dragState.handleId.startsWith('_translate_') || dragState.handleId.startsWith('_pivot_'));
    const pivotScreen = isDraggingTranslateOrPivot && dragVisualRef.current
      ? dragVisualRef.current
      : imageToScreen(getPivotPosition().x, getPivotPosition().y);
    const AXIS_LENGTH = 50;
    const ARROW_SIZE = 8;
    const CENTER_SIZE = 10;

    const prefix = gizmoMode === 'translate' ? '_translate' : '_pivot';
    const isTranslateMode = gizmoMode === 'translate';

    const isHoveredX = hoveredHandle === `${prefix}_x`;
    const isHoveredY = hoveredHandle === `${prefix}_y`;
    const isHoveredXY = hoveredHandle === `${prefix}_xy`;
    const isDraggingX = dragState?.handleId === `${prefix}_x`;
    const isDraggingY = dragState?.handleId === `${prefix}_y`;
    const isDraggingXY = dragState?.handleId === `${prefix}_xy`;

    // Colors: Translate = blue theme, Pivot = orange theme
    const colorX = isTranslateMode ? '#ef4444' : '#f97316';
    const colorY = isTranslateMode ? '#22c55e' : '#84cc16';
    const colorCenter = isTranslateMode ? '#3b82f6' : '#f59e0b';
    const colorXHover = isTranslateMode ? '#ff6666' : '#fb923c';
    const colorYHover = isTranslateMode ? '#66ff66' : '#a3e635';

    // Get current rotation angle for local-space axes (from gizmo's rotationParam or fallback)
    const angleDeg = gizmo.rotationParam
      ? ((node.parameters[gizmo.rotationParam] as number) ?? 0)
      : ((node.parameters.angle as number) ?? 0);

    // Use CSS transform for GPU-accelerated positioning
    // Pivot mode: rotate axes to match image rotation (local space)
    // Translate mode: keep axes in world space
    const rotation = isTranslateMode ? 0 : angleDeg;
    return (
      <g style={{ transform: `translate(${pivotScreen.x}px, ${pivotScreen.y}px) rotate(${rotation}deg)` }}>
        {/* Translate mode: X/Y axes with arrows */}
        {isTranslateMode && (
          <>
            {/* X Axis */}
            <line
              x1={0}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke={isHoveredX || isDraggingX ? colorXHover : colorX}
              strokeWidth={isHoveredX || isDraggingX ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            <polygon
              points={`${AXIS_LENGTH},0 ${AXIS_LENGTH - ARROW_SIZE},${-ARROW_SIZE / 2} ${AXIS_LENGTH - ARROW_SIZE},${ARROW_SIZE / 2}`}
              fill={isHoveredX || isDraggingX ? colorXHover : colorX}
              style={{ pointerEvents: 'none' }}
            />
            <line
              x1={8}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'x')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_x`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Y Axis */}
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-AXIS_LENGTH}
              stroke={isHoveredY || isDraggingY ? colorYHover : colorY}
              strokeWidth={isHoveredY || isDraggingY ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            <polygon
              points={`0,${-AXIS_LENGTH} ${-ARROW_SIZE / 2},${-AXIS_LENGTH + ARROW_SIZE} ${ARROW_SIZE / 2},${-AXIS_LENGTH + ARROW_SIZE}`}
              fill={isHoveredY || isDraggingY ? colorYHover : colorY}
              style={{ pointerEvents: 'none' }}
            />
            <line
              x1={0}
              y1={-8}
              x2={0}
              y2={-AXIS_LENGTH}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'y')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_y`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Center hit area for free move (invisible) */}
            <rect
              x={-8}
              y={-8}
              width={16}
              height={16}
              fill="transparent"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'xy')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_xy`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />
          </>
        )}

        {/* Pivot mode: square marker with X/Y axis lines */}
        {!isTranslateMode && (
          <>
            {/* Horizontal axis controls X */}
            <line
              x1={0}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke={isHoveredX || isDraggingX ? '#fb923c' : colorX}
              strokeWidth={isHoveredX || isDraggingX ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            {/* Horizontal axis hit area */}
            <line
              x1={8}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'x')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_x`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Vertical axis controls Y */}
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={AXIS_LENGTH}
              stroke={isHoveredY || isDraggingY ? '#a3e635' : colorY}
              strokeWidth={isHoveredY || isDraggingY ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            {/* Vertical axis hit area */}
            <line
              x1={0}
              y1={8}
              x2={0}
              y2={AXIS_LENGTH}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'y')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_y`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Center square marker (free move) */}
            <g
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'xy')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_xy`)}
              onMouseLeave={() => setHoveredHandle(null)}
            >
              {/* Hit area */}
              <circle
                cx={0}
                cy={0}
                r={CENTER_SIZE}
                fill="transparent"
              />
              {/* Square pivot marker */}
              <rect
                x={-6}
                y={-6}
                width={12}
                height={12}
                fill={isHoveredXY || isDraggingXY ? '#fbbf24' : colorCenter}
                stroke="white"
                strokeWidth="1"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          </>
        )}
      </g>
    );
  };

  // Render other handles (not translate/pivot/scale which are handled above)
  const renderHandles = () => {
    return gizmo.handles.map((handle) => {
      // Skip pivot handle - rendered in translate/pivot gizmo
      if (gizmo.pivotParams && handle.params.includes(gizmo.pivotParams[0])) {
        return null;
      }

      const params = node.parameters;
      const [paramX, paramY] = handle.params;
      const valX = (params[paramX] as number) ?? 0;
      const valY = (params[paramY] as number) ?? 0;

      let pos: { x: number; y: number };
      switch (handle.coordSystem) {
        case 'normalized':
          pos = { x: valX * imageWidth, y: valY * imageHeight };
          break;
        case 'percent':
          pos = { x: (valX / 100) * imageWidth, y: (valY / 100) * imageHeight };
          break;
        case 'pixels':
        default:
          pos = { x: imageWidth / 2 + valX, y: imageHeight / 2 + valY };
      }

      const screenPos = imageToScreen(pos.x, pos.y);
      const isHovered = hoveredHandle === handle.id;
      const isDragging = dragState?.handleId === handle.id;
      const color = handle.color || '#3b82f6';

      if (handle.type === 'point') {
        return (
          <g key={handle.id}>
            <circle
              cx={screenPos.x}
              cy={screenPos.y}
              r={HANDLE_HIT_SIZE}
              fill="transparent"
              style={{ cursor: 'move' }}
              onMouseDown={(e) => handleMouseDown(e, handle)}
              onMouseEnter={() => setHoveredHandle(handle.id)}
              onMouseLeave={() => setHoveredHandle(null)}
            />
            <circle
              cx={screenPos.x}
              cy={screenPos.y}
              r={isHovered || isDragging ? HANDLE_SIZE / 2 + 2 : HANDLE_SIZE / 2}
              fill="white"
              stroke={color}
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
            {handle.label && isHovered && (
              <text
                x={screenPos.x}
                y={screenPos.y - 15}
                textAnchor="middle"
                fill="white"
                fontSize="11"
                style={{ pointerEvents: 'none', textShadow: '0 0 3px black' }}
              >
                {handle.label}
              </text>
            )}
          </g>
        );
      }

      return null;
    });
  };
  const container = containerRef.current;
  const canvas = canvasRef.current;
  if (!container || !canvas) return null;

  const rect = container.getBoundingClientRect();

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g style={{ pointerEvents: 'auto' }}>
        {/* Scale gizmo (bounding box with handles) - show in 'all' or 'scale' mode */}
        {(gizmoVisibility === 'all' || gizmoVisibility === 'scale') && renderBoundingBox()}
        {/* Rotation gizmo - show in 'all' or 'rotate' mode */}
        {(gizmoVisibility === 'all' || gizmoVisibility === 'rotate') && renderRotationHandle()}
        {/* Translate/Pivot gizmo - show in 'all' or 'translate' mode */}
        {(gizmoVisibility === 'all' || gizmoVisibility === 'translate') && renderTranslatePivotGizmo()}
        {renderHandles()}
      </g>
    </svg>
  );
}
