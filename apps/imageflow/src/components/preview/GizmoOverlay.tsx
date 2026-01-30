import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useGraphStore, useExecutionStore, useUiStore } from '../../store';
import { getDownstreamNodes } from '../../core/graph/TopologicalSort';
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

  // Ref for transient updates during drag (immediate visual feedback without re-render lag)
  const dragVisualRef = useRef<{ x: number; y: number } | null>(null);

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

        // Use gizmo param names to read scale/angle values
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

        // Store visual position using gizmo origin + constrained delta
        // so it matches the parameter-derived position on release
        let screenDeltaX = currentX - dragState.startMouseX;
        let screenDeltaY = currentY - dragState.startMouseY;
        if (axis === 'x') screenDeltaY = 0;
        if (axis === 'y') screenDeltaX = 0;
        dragVisualRef.current = {
          x: (dragState.startGizmoX ?? dragState.startMouseX) + screenDeltaX,
          y: (dragState.startGizmoY ?? dragState.startMouseY) + screenDeltaY,
        };

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

        // Constrain visual movement to axis in rotated screen space
        if (axis === 'x' || axis === 'y') {
          // Get the axis direction in screen space (forward rotation)
          const fcos = Math.cos(angleRad);
          const fsin = Math.sin(angleRad);
          // Local X axis in screen space: (cos, sin), Local Y axis: (-sin, cos)
          const axisDirX = axis === 'x' ? fcos : -fsin;
          const axisDirY = axis === 'x' ? fsin : fcos;
          // Project screen delta onto axis direction
          const proj = screenDeltaX * axisDirX + screenDeltaY * axisDirY;
          screenDeltaX = proj * axisDirX;
          screenDeltaY = proj * axisDirY;
        }

        // Store constrained visual position for zero-lag feedback
        // Use gizmo origin (not mouse origin) so position matches parameter-derived position on release
        dragVisualRef.current = {
          x: (dragState.startGizmoX ?? dragState.startMouseX) + screenDeltaX,
          y: (dragState.startGizmoY ?? dragState.startMouseY) + screenDeltaY,
        };

        // Convert screen delta to image space by inverse transform (unrotate, unscale)
        // First unrotate
        let unrotatedX = cos * screenDeltaX - sin * screenDeltaY;
        let unrotatedY = sin * screenDeltaX + cos * screenDeltaY;

        // Screen-space projection already constrains to the correct local axis
        // (projecting onto rotated axis + inverse rotation = single-axis in local space)

        // Then unscale and convert to normalized coordinates
        const deltaX = (unrotatedX / zoom) / (scaleX * imageWidth);
        const deltaY = (unrotatedY / zoom) / (scaleY * imageHeight);

        const newPivotX = startPivotX + deltaX;
        const newPivotY = startPivotY + deltaY;

        // Calculate offset compensation to keep image stationary
        // When pivot changes, the transform P' = R*S*(P - pivot) + pivot + offset
        // To keep image in same place: newOffset = oldOffset + d - R*S*d
        // where d = oldPivot - newPivot (in image-local pixel coordinates)
        if (gizmo.translateParams) {
          const [offsetXParam, offsetYParam] = gizmo.translateParams;

          const startOffsetX = dragState.startParams[offsetXParam] ?? 0;
          const startOffsetY = dragState.startParams[offsetYParam] ?? 0;

          // Use stored start values for consistency (scale/angle don't change during pivot drag)
          const sX = dragState.startParams['_scaleX'] ?? 1;
          const sY = dragState.startParams['_scaleY'] ?? 1;
          const aRad = ((dragState.startParams['_angle'] ?? 0) * Math.PI) / 180;

          // Pivot delta in pixels: d = oldPivot - newPivot
          const dpx = (startPivotX - newPivotX) * imageWidth;
          const dpy = (startPivotY - newPivotY) * imageHeight;

          // Apply R*S to the delta vector
          // For transform P' = R*S*(P - pivot) + pivot + offset:
          // R*S*d where R = [[cos, -sin], [sin, cos]] and S = [[sX, 0], [0, sY]]
          // R*S = [[cos*sX, -sin*sY], [sin*sX, cos*sY]]
          const c = Math.cos(aRad);
          const s = Math.sin(aRad);
          const rsDpx = c * sX * dpx - s * sY * dpy;
          const rsDpy = s * sX * dpx + c * sY * dpy;

          // Offset compensation: newOffset = oldOffset + d - R*S*d
          const newOffsetX = startOffsetX + dpx - rsDpx;
          const newOffsetY = startOffsetY + dpy - rsDpy;

          // BATCH UPDATE: Update all parameters in the store first, then trigger execution once.
          // Using updateNodeParameter for each would trigger execution on the first call,
          // before other parameters are updated, causing incorrect rendering.
          const graphStore = useGraphStore.getState();

          // Update all parameters directly in the store (no execution trigger)
          if (Number.isFinite(newPivotX) && Number.isFinite(newPivotY)) {
            if (axis !== 'y') graphStore.updateNodeParameter(node.id, pivotXParam, newPivotX);
            if (axis !== 'x') graphStore.updateNodeParameter(node.id, pivotYParam, newPivotY);
          }
          if (Number.isFinite(newOffsetX) && Number.isFinite(newOffsetY)) {
            graphStore.updateNodeParameter(node.id, offsetXParam, newOffsetX);
            graphStore.updateNodeParameter(node.id, offsetYParam, newOffsetY);
          }

          // Now trigger execution once with all updates applied
          const freshGraph = useGraphStore.getState().graph;
          const exec = useExecutionStore.getState();
          const uiStore = useUiStore.getState();
          const dirtyNodes = [node.id, ...getDownstreamNodes(freshGraph, node.id)];
          exec.markNodesDirty(dirtyNodes);

          if (uiStore.liveEdit && !exec.isExecuting) {
            exec.updateEngineGraph(freshGraph);
            exec.execute();
          }
        } else {
          // No translateParams - just update pivot using normal method
          if (Number.isFinite(newPivotX) && Number.isFinite(newPivotY)) {
            if (axis !== 'y') updateNodeParameter(node.id, pivotXParam, newPivotX);
            if (axis !== 'x') updateNodeParameter(node.id, pivotYParam, newPivotY);
          }
        }
      }
      // Scale drag (edges and corners)
      else if (dragState.handleId.startsWith('_scale_') && gizmo.scaleParams) {
        const [scaleXParam, scaleYParam] = gizmo.scaleParams;
        const scaleType = dragState.handleId.replace('_scale_', '');
        const startScaleX = dragState.startParams[scaleXParam];
        const startScaleY = dragState.startParams[scaleYParam];

        // Get rotation angle
        const angleDeg = gizmo.rotationParam ? ((node.parameters[gizmo.rotationParam] as number) ?? 0) : 0;
        const angleRad = angleDeg * Math.PI / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        // Pivot in pixels
        const px = (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[0]] ?? 0.5) : 0.5) * imageWidth;
        const py = (gizmo.pivotParams ? (dragState.startParams[gizmo.pivotParams[1]] ?? 0.5) : 0.5) * imageHeight;

        // Start offsets
        const startOx = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[0]] ?? 0) : 0;
        const startOy = gizmo.translateParams ? (dragState.startParams[gizmo.translateParams[1]] ?? 0) : 0;

        // Compute anchor screen position (the opposite edge, stays fixed without shift)
        // Using a point at (anchorImgX, py) for X edges or (px, anchorImgY) for Y edges
        // The Y/X component cancels out when projecting onto the relevant axis
        const computeAnchorScreen = (anchorImgX: number, anchorImgY: number) => {
          const worldX = cos * startScaleX * (anchorImgX - px) - sin * startScaleY * (anchorImgY - py) + px + startOx;
          const worldY = sin * startScaleX * (anchorImgX - px) + cos * startScaleY * (anchorImgY - py) + py + startOy;
          return imageToScreen(worldX, worldY);
        };

        // Offset compensation for single-edge mode
        const compensateOffset = (dsx: number, dsy: number) => {
          if (shiftHeld || !gizmo.translateParams || !gizmo.pivotParams) return;
          const [offsetXParam, offsetYParam] = gizmo.translateParams;
          let ax = 0, ay = 0;
          if (scaleType === 'right')  ax = 0;
          if (scaleType === 'left')   ax = imageWidth;
          if (scaleType === 'bottom') ay = 0;
          if (scaleType === 'top')    ay = imageHeight;
          const localX = dsx * (ax - px);
          const localY = dsy * (ay - py);
          const newOx = startOx - (cos * localX - sin * localY);
          const newOy = startOy - (sin * localX + cos * localY);
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
            const newSX = Math.max(0.01, startScaleX * factor);
            const newSY = Math.max(0.01, startScaleY * factor);
            if (Number.isFinite(newSX) && Number.isFinite(newSY)) {
              updateNodeParameter(node.id, scaleXParam, newSX);
              updateNodeParameter(node.id, scaleYParam, newSY);
            }
          }
        } else if (scaleType === 'left' || scaleType === 'right') {
          if (shiftHeld) {
            // Shift: scale around pivot - use ratio from pivot
            const xDir = { x: cos * zoom, y: sin * zoom };
            const startDistX = (dragState.startMouseX - pivotScreen.x) * xDir.x + (dragState.startMouseY - pivotScreen.y) * xDir.y;
            const currentDistX = (currentX - pivotScreen.x) * xDir.x + (currentY - pivotScreen.y) * xDir.y;
            if (Math.abs(startDistX) > 1) {
              const newSX = Math.max(0.01, startScaleX * (currentDistX / startDistX));
              if (Number.isFinite(newSX)) updateNodeParameter(node.id, scaleXParam, newSX);
            }
          } else {
            // No shift: compute exact scale so dragged edge follows mouse
            // Distance from anchor to mouse along rotated X axis = newScaleX * imageWidth * zoom
            const anchorImgX = scaleType === 'right' ? 0 : imageWidth;
            const anchorScr = computeAnchorScreen(anchorImgX, py);
            const mouseProj = currentX * cos + currentY * sin;
            const anchorProj = anchorScr.x * cos + anchorScr.y * sin;
            const sign = scaleType === 'right' ? 1 : -1;
            const newSX = Math.max(0.01, sign * (mouseProj - anchorProj) / (imageWidth * zoom));
            if (Number.isFinite(newSX)) {
              updateNodeParameter(node.id, scaleXParam, newSX);
              compensateOffset(newSX - startScaleX, 0);
            }
          }
        } else if (scaleType === 'top' || scaleType === 'bottom') {
          if (shiftHeld) {
            // Shift: scale around pivot - use ratio from pivot
            const yDir = { x: -sin * zoom, y: cos * zoom };
            const startDistY = (dragState.startMouseX - pivotScreen.x) * yDir.x + (dragState.startMouseY - pivotScreen.y) * yDir.y;
            const currentDistY = (currentX - pivotScreen.x) * yDir.x + (currentY - pivotScreen.y) * yDir.y;
            if (Math.abs(startDistY) > 1) {
              const newSY = Math.max(0.01, startScaleY * (currentDistY / startDistY));
              if (Number.isFinite(newSY)) updateNodeParameter(node.id, scaleYParam, newSY);
            }
          } else {
            // No shift: compute exact scale so dragged edge follows mouse
            const anchorImgY = scaleType === 'bottom' ? 0 : imageHeight;
            const anchorScr = computeAnchorScreen(px, anchorImgY);
            const mouseProj = currentX * (-sin) + currentY * cos;
            const anchorProj = anchorScr.x * (-sin) + anchorScr.y * cos;
            const sign = scaleType === 'bottom' ? 1 : -1;
            const newSY = Math.max(0.01, sign * (mouseProj - anchorProj) / (imageHeight * zoom));
            if (Number.isFinite(newSY)) {
              updateNodeParameter(node.id, scaleYParam, newSY);
              compensateOffset(0, newSY - startScaleY);
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
      dragVisualRef.current = null;
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

    // Get current rotation angle for local-space axes
    const angleDeg = (node.parameters.angle as number) ?? 0;

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
