import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGraph } from '../../hooks/useGraph';
import type { GizmoDefinition, GizmoHandle, NodeInstance } from '../../types/node';

interface GizmoOverlayProps {
  /** Node instance with gizmo */
  node: NodeInstance;
  /** Gizmo definition from node type */
  gizmo: GizmoDefinition;
  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;
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
  /** Callback when drag state changes (to lock view during drag) */
  onDragChange?: (isDragging: boolean) => void;
}

interface DragState {
  handleId: string;
  startMouseX: number;
  startMouseY: number;
  startParams: Record<string, number>;
  // Track current mouse screen position for immediate visual feedback
  currentMouseX?: number;
  currentMouseY?: number;
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
  canvasSize,
  zoom,
  pan,
  containerRef,
  canvasRef,
  gizmoMode,
  gizmoVisibility,
  onDragChange,
}: GizmoOverlayProps) {
  const { updateNodeParameter, commitParameterChange } = useGraph();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Notify parent when drag state changes (to lock view during drag)
  const isDragging = dragState !== null;
  useEffect(() => {
    onDragChange?.(isDragging);
  }, [isDragging, onDragChange]);

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

  // Convert image/project coordinates to screen coordinates
  // The rendering uses: translate(centerX + pan.x, centerY + pan.y) then scale(zoom)
  // Then project offset is (-canvasSize.width/2, -canvasSize.height/2)
  const imageToScreen = useCallback(
    (ix: number, iy: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      // Project coords (ix, iy) -> view coords (ix - canvasSize.width/2, iy - canvasSize.height/2)
      // View coords -> screen coords: (vx * zoom + centerX + pan.x, vy * zoom + centerY + pan.y)
      const viewX = ix - canvasSize.width / 2;
      const viewY = iy - canvasSize.height / 2;
      const screenX = viewX * zoom + centerX + pan.x;
      const screenY = viewY * zoom + centerY + pan.y;

      return { x: screenX, y: screenY };
    },
    [containerRef, canvasSize, zoom, pan]
  );

  // Convert screen coordinates to image/project coordinates
  // Inverse of imageToScreen
  const screenToImage = useCallback(
    (sx: number, sy: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      // Reverse: screen -> view -> project
      const viewX = (sx - centerX - pan.x) / zoom;
      const viewY = (sy - centerY - pan.y) / zoom;
      const imageX = viewX + canvasSize.width / 2;
      const imageY = viewY + canvasSize.height / 2;

      return { x: imageX, y: imageY };
    },
    [containerRef, canvasSize, zoom, pan]
  );

  // Get pivot position in world coordinates (after transform applied)
  const getPivotPosition = useCallback(() => {
    const params = node.parameters;
    const pivotX = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[0]] as number) ?? 0.5)
      : 0.5;
    const pivotY = gizmo.pivotParams
      ? ((params[gizmo.pivotParams[1]] as number) ?? 0.5)
      : 0.5;
    const offsetX = gizmo.translateParams
      ? ((params[gizmo.translateParams[0]] as number) ?? 0)
      : 0;
    const offsetY = gizmo.translateParams
      ? ((params[gizmo.translateParams[1]] as number) ?? 0)
      : 0;

    // Pivot position in image local coordinates
    const px = imageWidth * pivotX;
    const py = imageHeight * pivotY;

    // The pivot is the center of rotation/scale, so those transforms don't move it.
    // Only translation moves the pivot.
    return {
      x: px + offsetX,
      y: py + offsetY,
    };
  }, [node.parameters, gizmo.pivotParams, gizmo.translateParams, imageWidth, imageHeight]);

  // Get bounding box corners considering scale and rotation
  const getBoundingBox = useCallback(() => {
    const params = node.parameters;
    const scaleX = (params.scaleX as number) ?? 1;
    const scaleY = (params.scaleY as number) ?? 1;
    const angle = ((params.angle as number) ?? 0) * (Math.PI / 180);
    const offsetX = (params.offsetX as number) ?? 0;
    const offsetY = (params.offsetY as number) ?? 0;
    const pivotX = (params.pivotX as number) ?? 0.5;
    const pivotY = (params.pivotY as number) ?? 0.5;

    const px = imageWidth * pivotX;
    const py = imageHeight * pivotY;

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
  }, [node.parameters, imageWidth, imageHeight]);

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

      setDragState({
        handleId,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, gizmo.scaleParams, gizmo.translateParams, gizmo.pivotParams, containerRef]
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
        [paramX]: (node.parameters[paramX] as number) ?? (gizmoMode === 'pivot' ? 0.5 : 0),
        [paramY]: (node.parameters[paramY] as number) ?? (gizmoMode === 'pivot' ? 0.5 : 0),
      };

      // For pivot mode, also store the initial offset and transform values for compensation
      if (gizmoMode === 'pivot' && gizmo.translateParams) {
        const [offsetX, offsetY] = gizmo.translateParams;
        startParams[offsetX] = (node.parameters[offsetX] as number) ?? 0;
        startParams[offsetY] = (node.parameters[offsetY] as number) ?? 0;
        startParams['_scaleX'] = (node.parameters.scaleX as number) ?? 1;
        startParams['_scaleY'] = (node.parameters.scaleY as number) ?? 1;
        startParams['_angle'] = (node.parameters.angle as number) ?? 0;
      }

      setDragState({
        handleId: `_${gizmoMode}_${axis}`,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, gizmo.translateParams, gizmo.pivotParams, gizmoMode, containerRef]
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

      // Rotation drag
      if (dragState.handleId === '_rotation' && gizmo.rotationParam) {
        const startAngle = Math.atan2(
          dragState.startMouseY - pivotScreen.y,
          dragState.startMouseX - pivotScreen.x
        );
        const currentAngle = Math.atan2(currentY - pivotScreen.y, currentX - pivotScreen.x);
        const deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI;
        const newAngle = dragState.startParams[gizmo.rotationParam] + deltaAngle;
        // Guard against NaN
        if (Number.isFinite(newAngle)) {
          updateNodeParameter(node.id, gizmo.rotationParam, newAngle);
        }
      }
      // Translate drag
      else if (dragState.handleId.startsWith('_translate_') && gizmo.translateParams) {
        const [paramX, paramY] = gizmo.translateParams;
        const axis = dragState.handleId.split('_')[2];

        const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
        const currentImg = screenToImage(currentX, currentY);
        let deltaX = currentImg.x - startImg.x;
        let deltaY = currentImg.y - startImg.y;

        if (axis === 'x') deltaY = 0;
        if (axis === 'y') deltaX = 0;

        const newX = dragState.startParams[paramX] + deltaX;
        const newY = dragState.startParams[paramY] + deltaY;

        // Guard against NaN values
        if (axis !== 'y' && Number.isFinite(newX)) updateNodeParameter(node.id, paramX, newX);
        if (axis !== 'x' && Number.isFinite(newY)) updateNodeParameter(node.id, paramY, newY);

        // Store mouse screen position for immediate visual feedback (constrained to axis)
        let gizmoX = currentX;
        let gizmoY = currentY;
        if (axis === 'x') {
          // Keep Y at start position
          const startPivotPos = imageToScreen(
            imageWidth * (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0.5) : 0.5) + dragState.startParams[paramX],
            imageHeight * (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0.5) : 0.5) + dragState.startParams[paramY]
          );
          gizmoY = startPivotPos.y;
        } else if (axis === 'y') {
          // Keep X at start position
          const startPivotPos = imageToScreen(
            imageWidth * (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0.5) : 0.5) + dragState.startParams[paramX],
            imageHeight * (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0.5) : 0.5) + dragState.startParams[paramY]
          );
          gizmoX = startPivotPos.x;
        }
        // xy case: gizmoX/gizmoY already set to currentX/currentY
        setDragState(prev => prev ? { ...prev, currentMouseX: gizmoX, currentMouseY: gizmoY } : null);
      }
      // Pivot drag - move the pivot point while keeping image visually stationary
      // We need to compensate the offset to account for the pivot change
      else if (dragState.handleId.startsWith('_pivot_') && gizmo.pivotParams) {
        // Guard against zero dimensions
        if (imageWidth <= 0 || imageHeight <= 0) return;

        const [pivotXParam, pivotYParam] = gizmo.pivotParams;
        const axis = dragState.handleId.split('_')[2];

        // Get start pivot values (normalized, can be outside 0-1)
        const startPivotX = dragState.startParams[pivotXParam] ?? 0.5;
        const startPivotY = dragState.startParams[pivotYParam] ?? 0.5;

        // Get current transform parameters for inverse transform
        const scaleX = gizmo.scaleParams ? ((node.parameters[gizmo.scaleParams[0]] as number) ?? 1) : 1;
        const scaleY = gizmo.scaleParams ? ((node.parameters[gizmo.scaleParams[1]] as number) ?? 1) : 1;
        const angleDeg = gizmo.rotationParam ? ((node.parameters[gizmo.rotationParam] as number) ?? 0) : 0;
        const angleRad = angleDeg * Math.PI / 180;
        const cos = Math.cos(-angleRad); // Inverse rotation
        const sin = Math.sin(-angleRad);

        // Calculate screen delta
        let screenDeltaX = currentX - dragState.startMouseX;
        let screenDeltaY = currentY - dragState.startMouseY;

        // Constrain to axis in screen space
        if (axis === 'x') screenDeltaY = 0;
        if (axis === 'y') screenDeltaX = 0;

        // Convert screen delta to image space by inverse transform (unrotate, unscale)
        // First unrotate
        const unrotatedX = cos * screenDeltaX - sin * screenDeltaY;
        const unrotatedY = sin * screenDeltaX + cos * screenDeltaY;
        // Then unscale and convert to normalized coordinates
        const deltaX = (unrotatedX / zoom) / (scaleX * imageWidth);
        const deltaY = (unrotatedY / zoom) / (scaleY * imageHeight);

        const newPivotX = startPivotX + deltaX;
        const newPivotY = startPivotY + deltaY;

        // Calculate offset compensation to keep image stationary
        // When pivot changes, we need: newOffset = oldOffset + (oldPivot - newPivot) - RS*(oldPivot - newPivot)
        // Where RS is the combined rotation and scale transform
        if (gizmo.translateParams && gizmo.rotationParam && gizmo.scaleParams) {
          const [offsetXParam, offsetYParam] = gizmo.translateParams;
          const [scaleXParam, scaleYParam] = gizmo.scaleParams;

          const startOffsetX = dragState.startParams[offsetXParam] ?? 0;
          const startOffsetY = dragState.startParams[offsetYParam] ?? 0;
          const sX = (node.parameters[scaleXParam] as number) ?? 1;
          const sY = (node.parameters[scaleYParam] as number) ?? 1;
          const aRad = angleDeg * Math.PI / 180;

          // Pivot delta in pixels
          const dpx = (startPivotX - newPivotX) * imageWidth;
          const dpy = (startPivotY - newPivotY) * imageHeight;

          // Apply rotation and scale to the delta: RS * delta
          const c = Math.cos(aRad);
          const s = Math.sin(aRad);
          const rsDpx = (c * sX * dpx - s * sY * dpy);
          const rsDpy = (s * sX * dpx + c * sY * dpy);

          // Offset compensation: (oldPivot - newPivot) - RS*(oldPivot - newPivot)
          const compensationX = dpx - rsDpx;
          const compensationY = dpy - rsDpy;

          const newOffsetX = startOffsetX + compensationX;
          const newOffsetY = startOffsetY + compensationY;

          if (Number.isFinite(newOffsetX) && Number.isFinite(newOffsetY)) {
            updateNodeParameter(node.id, offsetXParam, newOffsetX);
            updateNodeParameter(node.id, offsetYParam, newOffsetY);
          }
        }

        // Update pivot values (no clamping - pivot can be outside image bounds)
        if (Number.isFinite(newPivotX) && Number.isFinite(newPivotY)) {
          if (axis !== 'y') updateNodeParameter(node.id, pivotXParam, newPivotX);
          if (axis !== 'x') updateNodeParameter(node.id, pivotYParam, newPivotY);
        }

        // Store screen position for visual feedback
        setDragState(prev => prev ? { ...prev, currentMouseX: currentX, currentMouseY: currentY } : null);
      }
      // Scale drag (edges and corners)
      else if (dragState.handleId.startsWith('_scale_') && gizmo.scaleParams) {
        const [scaleXParam, scaleYParam] = gizmo.scaleParams;
        const scaleType = dragState.handleId.replace('_scale_', '');

        const startDist = {
          x: Math.abs(dragState.startMouseX - pivotScreen.x),
          y: Math.abs(dragState.startMouseY - pivotScreen.y),
        };
        const currentDist = {
          x: Math.abs(currentX - pivotScreen.x),
          y: Math.abs(currentY - pivotScreen.y),
        };

        if (scaleType === 'corner') {
          // Uniform scale from corner
          const startD = Math.sqrt(startDist.x * startDist.x + startDist.y * startDist.y);
          const currentD = Math.sqrt(currentDist.x * currentDist.x + currentDist.y * currentDist.y);
          if (startD > 1) {
            const factor = currentD / startD;
            const newScale = dragState.startParams[scaleXParam] * factor;
            if (Number.isFinite(newScale)) {
              updateNodeParameter(node.id, scaleXParam, Math.max(0.01, newScale));
              updateNodeParameter(node.id, scaleYParam, Math.max(0.01, newScale));
            }
          }
        } else if (scaleType === 'left' || scaleType === 'right') {
          // X-axis scale from edge
          if (shiftHeld) {
            // Both edges mode: scale around pivot, edge follows mouse
            const [offsetXParam] = gizmo.translateParams || [];
            const startOffsetX = offsetXParam ? (dragState.startParams[offsetXParam] ?? 0) : 0;

            const pivotXPx = gizmo.pivotParams
              ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0.5) * imageWidth
              : imageWidth / 2;

            const currentImg = screenToImage(currentX, currentY);

            let newScaleX: number;
            if (scaleType === 'right') {
              // Right edge should be at mouse position
              // rightEdge = (imageWidth - pivotX) * scaleX + pivotX + offsetX = mouseX
              const edgeDist = imageWidth - pivotXPx;
              if (Math.abs(edgeDist) > 1) {
                newScaleX = (currentImg.x - pivotXPx - startOffsetX) / edgeDist;
              } else {
                newScaleX = dragState.startParams[scaleXParam];
              }
            } else {
              // Left edge should be at mouse position
              // leftEdge = -pivotX * scaleX + pivotX + offsetX = mouseX
              // -pivotX * scaleX = mouseX - pivotX - offsetX
              // scaleX = (pivotX + offsetX - mouseX) / pivotX
              if (Math.abs(pivotXPx) > 1) {
                newScaleX = (pivotXPx + startOffsetX - currentImg.x) / pivotXPx;
              } else {
                newScaleX = dragState.startParams[scaleXParam];
              }
            }

            if (newScaleX > 0.01 && Number.isFinite(newScaleX)) {
              updateNodeParameter(node.id, scaleXParam, Math.max(0.01, newScaleX));
            }
          } else {
            // Single edge mode: only dragged edge moves, opposite stays fixed
            if (!gizmo.translateParams) return;

            const [offsetXParam, offsetYParam] = gizmo.translateParams;
            const startOffsetX = dragState.startParams[offsetXParam] ?? 0;
            const startOffsetY = dragState.startParams[offsetYParam] ?? 0;
            const startScaleX = dragState.startParams[scaleXParam];

            // Guard against zero dimensions
            if (imageWidth <= 0) return;

            // Use stored pivot from drag start
            const pivotXPx = gizmo.pivotParams
              ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0.5) * imageWidth
              : imageWidth / 2;

            // Get rotation for proper offset compensation
            const angle = ((node.parameters.angle as number) ?? 0) * (Math.PI / 180);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
            const currentImg = screenToImage(currentX, currentY);
            const deltaX = currentImg.x - startImg.x;

            // Calculate new scale based on width change
            const startWidth = imageWidth * startScaleX;
            let newScaleX: number;
            let fixedEdgeX: number; // X position of fixed edge in image coords (0 or imageWidth)

            if (scaleType === 'right') {
              // Keep left edge (x=0) fixed, move right edge
              const newWidth = startWidth + deltaX;
              newScaleX = newWidth / imageWidth;
              fixedEdgeX = 0;
            } else {
              // Keep right edge (x=imageWidth) fixed, move left edge
              const newWidth = startWidth - deltaX;
              newScaleX = newWidth / imageWidth;
              fixedEdgeX = imageWidth;
            }

            if (newScaleX > 0.01 && Number.isFinite(newScaleX)) {
              // Calculate offset change needed to keep fixed edge corners in place
              // With rotation, changing scaleX affects both final X and Y positions
              // For a point at (fixedEdgeX, y), the transform gives:
              // finalX = (fixedEdgeX - px) * scaleX * cos - (y - py) * scaleY * sin + px + offsetX
              // finalY = (fixedEdgeX - px) * scaleX * sin + (y - py) * scaleY * cos + py + offsetY
              // To keep finalX and finalY constant when scaleX changes:
              const deltaScaleX = newScaleX - startScaleX;
              const fixedEdgeRelX = fixedEdgeX - pivotXPx;
              const deltaOffsetX = -fixedEdgeRelX * deltaScaleX * cos;
              const deltaOffsetY = -fixedEdgeRelX * deltaScaleX * sin;

              updateNodeParameter(node.id, scaleXParam, Math.max(0.01, newScaleX));
              if (Number.isFinite(deltaOffsetX) && Number.isFinite(deltaOffsetY)) {
                updateNodeParameter(node.id, offsetXParam, startOffsetX + deltaOffsetX);
                updateNodeParameter(node.id, offsetYParam, startOffsetY + deltaOffsetY);
              }
            }
          }
        } else if (scaleType === 'top' || scaleType === 'bottom') {
          // Y-axis scale from edge
          if (shiftHeld) {
            // Both edges mode: scale around pivot, edge follows mouse
            const [, offsetYParam] = gizmo.translateParams || [];
            const startOffsetY = offsetYParam ? (dragState.startParams[offsetYParam] ?? 0) : 0;

            const pivotYPx = gizmo.pivotParams
              ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0.5) * imageHeight
              : imageHeight / 2;

            const currentImg = screenToImage(currentX, currentY);

            let newScaleY: number;
            if (scaleType === 'bottom') {
              // Bottom edge should be at mouse position
              const edgeDist = imageHeight - pivotYPx;
              if (Math.abs(edgeDist) > 1) {
                newScaleY = (currentImg.y - pivotYPx - startOffsetY) / edgeDist;
              } else {
                newScaleY = dragState.startParams[scaleYParam];
              }
            } else {
              // Top edge should be at mouse position
              if (Math.abs(pivotYPx) > 1) {
                newScaleY = (pivotYPx + startOffsetY - currentImg.y) / pivotYPx;
              } else {
                newScaleY = dragState.startParams[scaleYParam];
              }
            }

            if (newScaleY > 0.01 && Number.isFinite(newScaleY)) {
              updateNodeParameter(node.id, scaleYParam, Math.max(0.01, newScaleY));
            }
          } else {
            // Single edge mode: only dragged edge moves, opposite stays fixed
            if (!gizmo.translateParams) return;

            // Guard against zero dimensions
            if (imageHeight <= 0) return;

            const [offsetXParam, offsetYParam] = gizmo.translateParams;
            const startOffsetX = dragState.startParams[offsetXParam] ?? 0;
            const startOffsetY = dragState.startParams[offsetYParam] ?? 0;
            const startScaleY = dragState.startParams[scaleYParam];

            // Use stored pivot from drag start
            const pivotYPx = gizmo.pivotParams
              ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0.5) * imageHeight
              : imageHeight / 2;

            // Get rotation for proper offset compensation
            const angle = ((node.parameters.angle as number) ?? 0) * (Math.PI / 180);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
            const currentImg = screenToImage(currentX, currentY);
            const deltaY = currentImg.y - startImg.y;

            // Calculate new scale based on height change
            const startHeight = imageHeight * startScaleY;
            let newScaleY: number;
            let fixedEdgeY: number; // Y position of fixed edge in image coords (0 or imageHeight)

            if (scaleType === 'bottom') {
              // Keep top edge (y=0) fixed, move bottom edge
              const newHeight = startHeight + deltaY;
              newScaleY = newHeight / imageHeight;
              fixedEdgeY = 0;
            } else {
              // Keep bottom edge (y=imageHeight) fixed, move top edge
              const newHeight = startHeight - deltaY;
              newScaleY = newHeight / imageHeight;
              fixedEdgeY = imageHeight;
            }

            if (newScaleY > 0.01 && Number.isFinite(newScaleY)) {
              // Calculate offset change needed to keep fixed edge corners in place
              // With rotation, changing scaleY affects both final X and Y positions
              const deltaScaleY = newScaleY - startScaleY;
              const fixedEdgeRelY = fixedEdgeY - pivotYPx;
              const deltaOffsetX = fixedEdgeRelY * deltaScaleY * sin;
              const deltaOffsetY = -fixedEdgeRelY * deltaScaleY * cos;

              updateNodeParameter(node.id, scaleYParam, Math.max(0.01, newScaleY));
              if (Number.isFinite(deltaOffsetX) && Number.isFinite(deltaOffsetY)) {
                updateNodeParameter(node.id, offsetXParam, startOffsetX + deltaOffsetX);
                updateNodeParameter(node.id, offsetYParam, startOffsetY + deltaOffsetY);
              }
            }
          }
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

    const handleMouseUp = () => {
      if (dragState) {
        const paramIds = Object.keys(dragState.startParams);
        if (paramIds.length > 0) {
          commitParameterChange(node.id, paramIds[0]);
        }
      }
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
    screenToImage,
    imageToScreen,
    getPivotPosition,
    updateNodeParameter,
    commitParameterChange,
    containerRef,
    shiftHeld,
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

    // Edge midpoints
    const edges = [
      { id: 'top', p1: screenCorners[0], p2: screenCorners[1], cursor: 'ns-resize' },
      { id: 'right', p1: screenCorners[1], p2: screenCorners[2], cursor: 'ew-resize' },
      { id: 'bottom', p1: screenCorners[2], p2: screenCorners[3], cursor: 'ns-resize' },
      { id: 'left', p1: screenCorners[3], p2: screenCorners[0], cursor: 'ew-resize' },
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
            style={{ cursor: edge.cursor }}
            onMouseDown={(e) => handleScaleMouseDown(e, `_scale_${edge.id}`)}
          />
        ))}

        {/* Interactive corners for uniform scaling */}
        {gizmo.scaleParams && screenCorners.map((corner, i) => {
          const isHovered = hoveredHandle === `_scale_corner_${i}`;
          const isDragging = dragState?.handleId === '_scale_corner';
          const cursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];

          return (
            <g key={`corner-${i}`}>
              {/* Corner hit area */}
              <circle
                cx={corner.x}
                cy={corner.y}
                r={HANDLE_HIT_SIZE}
                fill="transparent"
                style={{ cursor: cursors[i] }}
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

    // Always use calculated position from parameters to stay in sync with image preview
    const pivotScreen = imageToScreen(getPivotPosition().x, getPivotPosition().y);
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
          style={{ cursor: 'grab' }}
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

    // Always use calculated position from parameters to stay in sync with image preview
    const pivotScreen = imageToScreen(getPivotPosition().x, getPivotPosition().y);
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

    // Use CSS transform for GPU-accelerated positioning
    return (
      <g style={{ transform: `translate(${pivotScreen.x}px, ${pivotScreen.y}px)` }}>
        {/* Mode indicator */}
        <text
          x={isTranslateMode ? AXIS_LENGTH + 15 : 15}
          y={-5}
          fill="white"
          fontSize="10"
          style={{ pointerEvents: 'none', textShadow: '0 0 3px black' }}
        >
          {isTranslateMode ? 'Move (W)' : 'Pivot (Q)'}
        </text>

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
              style={{ cursor: 'ew-resize' }}
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
              style={{ cursor: 'ns-resize' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'y')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_y`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Center handle - circle */}
            <circle
              cx={0}
              cy={0}
              r={isHoveredXY || isDraggingXY ? CENTER_SIZE / 2 + 2 : CENTER_SIZE / 2}
              fill="white"
              stroke={colorCenter}
              strokeWidth="2"
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
            {/* X Axis line */}
            <line
              x1={0}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke={isHoveredX || isDraggingX ? '#fb923c' : colorX}
              strokeWidth={isHoveredX || isDraggingX ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            {/* X axis hit area */}
            <line
              x1={8}
              y1={0}
              x2={AXIS_LENGTH}
              y2={0}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'ew-resize' }}
              onMouseDown={(e) => handleTranslatePivotMouseDown(e, 'x')}
              onMouseEnter={() => setHoveredHandle(`${prefix}_x`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />

            {/* Y Axis line */}
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-AXIS_LENGTH}
              stroke={isHoveredY || isDraggingY ? '#a3e635' : colorY}
              strokeWidth={isHoveredY || isDraggingY ? 3 : 2}
              style={{ pointerEvents: 'none' }}
            />
            {/* Y axis hit area */}
            <line
              x1={0}
              y1={-8}
              x2={0}
              y2={-AXIS_LENGTH}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'ns-resize' }}
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
