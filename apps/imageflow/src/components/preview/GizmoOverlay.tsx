import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGraphStore } from '../../store';
import type { GizmoDefinition, GizmoHandle, NodeInstance } from '../../types/node';

interface GizmoOverlayProps {
  /** Node instance with gizmo */
  node: NodeInstance;
  /** Gizmo definition from node type */
  gizmo: GizmoDefinition;
  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;
  /** Current zoom level */
  zoom: number;
  /** Current pan offset */
  pan: { x: number; y: number };
  /** Container element for coordinate conversion */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Canvas element for coordinate conversion */
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

interface DragState {
  handleId: string;
  startMouseX: number;
  startMouseY: number;
  startParams: Record<string, number>;
}

const HANDLE_SIZE = 8;
const HANDLE_HIT_SIZE = 12;

export function GizmoOverlay({
  node,
  gizmo,
  imageWidth,
  imageHeight,
  zoom,
  pan,
  containerRef,
  canvasRef,
}: GizmoOverlayProps) {
  const { updateNodeParameter } = useGraphStore();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert image coordinates to screen coordinates
  const imageToScreen = useCallback(
    (ix: number, iy: number): { x: number; y: number } => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const containerCenterX = containerRect.width / 2;
      const containerCenterY = containerRect.height / 2;

      // Image coordinates relative to image center
      const relX = ix - canvas.width / 2;
      const relY = iy - canvas.height / 2;

      // Apply zoom and pan
      const screenX = containerCenterX + pan.x + relX * zoom;
      const screenY = containerCenterY + pan.y + relY * zoom;

      return { x: screenX, y: screenY };
    },
    [zoom, pan, containerRef, canvasRef]
  );

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback(
    (sx: number, sy: number): { x: number; y: number } => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return { x: 0, y: 0 };

      const containerRect = container.getBoundingClientRect();
      const containerCenterX = containerRect.width / 2;
      const containerCenterY = containerRect.height / 2;

      // Reverse the transform
      const relX = (sx - containerCenterX - pan.x) / zoom;
      const relY = (sy - containerCenterY - pan.y) / zoom;

      const imageX = relX + canvas.width / 2;
      const imageY = relY + canvas.height / 2;

      return { x: imageX, y: imageY };
    },
    [zoom, pan, containerRef, canvasRef]
  );

  // Get handle position in image coordinates
  const getHandlePosition = useCallback(
    (handle: GizmoHandle): { x: number; y: number } => {
      const params = node.parameters;
      const [paramX, paramY] = handle.params;
      const valX = (params[paramX] as number) ?? 0;
      const valY = (params[paramY] as number) ?? 0;

      switch (handle.coordSystem) {
        case 'normalized':
          return { x: valX * imageWidth, y: valY * imageHeight };
        case 'percent':
          return { x: (valX / 100) * imageWidth, y: (valY / 100) * imageHeight };
        case 'pixels':
        default:
          // For pixel offsets, position is relative to image center
          return { x: imageWidth / 2 + valX, y: imageHeight / 2 + valY };
      }
    },
    [node.parameters, imageWidth, imageHeight]
  );

  // Get bounding box corners considering scale and rotation
  const getBoundingBox = useCallback(() => {
    const params = node.parameters;
    const scaleX = ((params.scaleX as number) ?? 100) / 100;
    const scaleY = ((params.scaleY as number) ?? 100) / 100;
    const angle = ((params.angle as number) ?? 0) * (Math.PI / 180);
    const offsetX = (params.offsetX as number) ?? 0;
    const offsetY = (params.offsetY as number) ?? 0;
    const pivotX = ((params.pivotX as number) ?? 50) / 100;
    const pivotY = ((params.pivotY as number) ?? 50) / 100;

    const px = imageWidth * pivotX;
    const py = imageHeight * pivotY;

    // Get corners relative to pivot
    const corners = [
      { x: 0, y: 0 },
      { x: imageWidth, y: 0 },
      { x: imageWidth, y: imageHeight },
      { x: 0, y: imageHeight },
    ];

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return corners.map((c) => {
      // Move to pivot-relative coords
      let x = c.x - px;
      let y = c.y - py;

      // Scale
      x *= scaleX;
      y *= scaleY;

      // Rotate
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;

      // Move back and add translation
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

  // Handle corner scale drag start
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, cornerId: string) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const [scaleXParam, scaleYParam] = gizmo.scaleParams!;
      const startParams: Record<string, number> = {
        [scaleXParam]: (node.parameters[scaleXParam] as number) ?? 100,
        [scaleYParam]: (node.parameters[scaleYParam] as number) ?? 100,
      };

      setDragState({
        handleId: cornerId,
        startMouseX: e.clientX - rect.left,
        startMouseY: e.clientY - rect.top,
        startParams,
      });
    },
    [node.parameters, gizmo.scaleParams, containerRef]
  );

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      // Find the handle being dragged
      const handle = gizmo.handles.find((h) => h.id === dragState.handleId);

      if (handle) {
        // Regular handle drag
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
      } else if (dragState.handleId === '_rotation' && gizmo.rotationParam && gizmo.pivotParams) {
        // Rotation drag
        const pivotX = ((node.parameters[gizmo.pivotParams[0]] as number) ?? 50) / 100;
        const pivotY = ((node.parameters[gizmo.pivotParams[1]] as number) ?? 50) / 100;
        const pivotScreen = imageToScreen(imageWidth * pivotX, imageHeight * pivotY);

        const startAngle = Math.atan2(
          dragState.startMouseY - pivotScreen.y,
          dragState.startMouseX - pivotScreen.x
        );
        const currentAngle = Math.atan2(currentY - pivotScreen.y, currentX - pivotScreen.x);
        const deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI;

        const newAngle = dragState.startParams[gizmo.rotationParam] + deltaAngle;
        updateNodeParameter(node.id, gizmo.rotationParam, newAngle);
      } else if (dragState.handleId.startsWith('_corner') && gizmo.scaleParams) {
        // Scale drag
        const [scaleXParam, scaleYParam] = gizmo.scaleParams;
        const pivotX = gizmo.pivotParams
          ? ((node.parameters[gizmo.pivotParams[0]] as number) ?? 50) / 100
          : 0.5;
        const pivotY = gizmo.pivotParams
          ? ((node.parameters[gizmo.pivotParams[1]] as number) ?? 50) / 100
          : 0.5;
        const pivotScreen = imageToScreen(imageWidth * pivotX, imageHeight * pivotY);

        const startDist = Math.sqrt(
          Math.pow(dragState.startMouseX - pivotScreen.x, 2) +
            Math.pow(dragState.startMouseY - pivotScreen.y, 2)
        );
        const currentDist = Math.sqrt(
          Math.pow(currentX - pivotScreen.x, 2) + Math.pow(currentY - pivotScreen.y, 2)
        );

        if (startDist > 0) {
          const scaleFactor = currentDist / startDist;
          const uniformScale = gizmo.uniformScaleParam
            ? (node.parameters[gizmo.uniformScaleParam] as boolean)
            : true;

          if (uniformScale) {
            const newScale = dragState.startParams[scaleXParam] * scaleFactor;
            updateNodeParameter(node.id, scaleXParam, Math.max(1, Math.min(500, newScale)));
            updateNodeParameter(node.id, scaleYParam, Math.max(1, Math.min(500, newScale)));
          } else {
            // Non-uniform scaling based on corner position
            const startImg = screenToImage(dragState.startMouseX, dragState.startMouseY);
            const currentImg = screenToImage(currentX, currentY);
            const pivotImg = { x: imageWidth * pivotX, y: imageHeight * pivotY };

            const startDistX = Math.abs(startImg.x - pivotImg.x);
            const startDistY = Math.abs(startImg.y - pivotImg.y);
            const currentDistX = Math.abs(currentImg.x - pivotImg.x);
            const currentDistY = Math.abs(currentImg.y - pivotImg.y);

            if (startDistX > 1) {
              const scaleX = dragState.startParams[scaleXParam] * (currentDistX / startDistX);
              updateNodeParameter(node.id, scaleXParam, Math.max(1, Math.min(500, scaleX)));
            }
            if (startDistY > 1) {
              const scaleY = dragState.startParams[scaleYParam] * (currentDistY / startDistY);
              updateNodeParameter(node.id, scaleYParam, Math.max(1, Math.min(500, scaleY)));
            }
          }
        }
      }
    };

    const handleMouseUp = () => {
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
    updateNodeParameter,
    containerRef,
  ]);

  // Render bounding box
  const renderBoundingBox = () => {
    if (!gizmo.showBoundingBox) return null;

    const corners = getBoundingBox();
    const screenCorners = corners.map((c) => imageToScreen(c.x, c.y));

    const pathData = `M ${screenCorners[0].x} ${screenCorners[0].y}
                      L ${screenCorners[1].x} ${screenCorners[1].y}
                      L ${screenCorners[2].x} ${screenCorners[2].y}
                      L ${screenCorners[3].x} ${screenCorners[3].y} Z`;

    return (
      <>
        <path
          d={pathData}
          fill="none"
          stroke="white"
          strokeWidth="1"
          strokeDasharray="4 4"
          style={{ pointerEvents: 'none' }}
        />
        <path
          d={pathData}
          fill="none"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1"
          strokeDasharray="4 4"
          strokeDashoffset="4"
          style={{ pointerEvents: 'none' }}
        />
        {/* Corner scale handles */}
        {gizmo.scaleParams &&
          screenCorners.map((corner, i) => (
            <rect
              key={`corner-${i}`}
              x={corner.x - HANDLE_SIZE / 2}
              y={corner.y - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              fill="white"
              stroke="#3b82f6"
              strokeWidth="1.5"
              style={{ cursor: 'nwse-resize' }}
              onMouseDown={(e) => handleScaleMouseDown(e, `_corner${i}`)}
              onMouseEnter={() => setHoveredHandle(`_corner${i}`)}
              onMouseLeave={() => setHoveredHandle(null)}
            />
          ))}
      </>
    );
  };

  // Render rotation handle
  const renderRotationHandle = () => {
    if (!gizmo.showRotation || !gizmo.rotationParam || !gizmo.pivotParams) return null;

    const corners = getBoundingBox();
    const screenCorners = corners.map((c) => imageToScreen(c.x, c.y));

    // Position rotation handle above the top edge center
    const topCenter = {
      x: (screenCorners[0].x + screenCorners[1].x) / 2,
      y: (screenCorners[0].y + screenCorners[1].y) / 2,
    };

    // Offset upward in the direction perpendicular to the top edge
    const edgeVec = {
      x: screenCorners[1].x - screenCorners[0].x,
      y: screenCorners[1].y - screenCorners[0].y,
    };
    const len = Math.sqrt(edgeVec.x * edgeVec.x + edgeVec.y * edgeVec.y);
    const perpX = -edgeVec.y / len;
    const perpY = edgeVec.x / len;
    const offset = 25;

    const handlePos = {
      x: topCenter.x + perpX * offset,
      y: topCenter.y + perpY * offset,
    };

    return (
      <>
        {/* Line from top center to rotation handle */}
        <line
          x1={topCenter.x}
          y1={topCenter.y}
          x2={handlePos.x}
          y2={handlePos.y}
          stroke="white"
          strokeWidth="1"
          style={{ pointerEvents: 'none' }}
        />
        {/* Rotation handle */}
        <circle
          cx={handlePos.x}
          cy={handlePos.y}
          r={HANDLE_SIZE / 2 + 2}
          fill="white"
          stroke="#22c55e"
          strokeWidth="2"
          style={{ cursor: 'grab' }}
          onMouseDown={handleRotationMouseDown}
          onMouseEnter={() => setHoveredHandle('_rotation')}
          onMouseLeave={() => setHoveredHandle(null)}
        />
      </>
    );
  };

  // Render individual handles
  const renderHandles = () => {
    return gizmo.handles.map((handle) => {
      const pos = getHandlePosition(handle);
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
                style={{
                  pointerEvents: 'none',
                  textShadow: '0 0 3px black, 0 0 3px black',
                }}
              >
                {handle.label}
              </text>
            )}
          </g>
        );
      }

      if (handle.type === 'line' && handle.params.length >= 4) {
        // Line defined by startX, startY, endX, endY
        const [startXParam, startYParam, endXParam, endYParam] = handle.params;
        const startX = (node.parameters[startXParam] as number) ?? 0;
        const startY = (node.parameters[startYParam] as number) ?? 0;
        const endX = (node.parameters[endXParam] as number) ?? 0;
        const endY = (node.parameters[endYParam] as number) ?? 0;

        let startImg, endImg;
        switch (handle.coordSystem) {
          case 'normalized':
            startImg = { x: startX * imageWidth, y: startY * imageHeight };
            endImg = { x: endX * imageWidth, y: endY * imageHeight };
            break;
          case 'percent':
            startImg = { x: (startX / 100) * imageWidth, y: (startY / 100) * imageHeight };
            endImg = { x: (endX / 100) * imageWidth, y: (endY / 100) * imageHeight };
            break;
          default:
            startImg = { x: startX, y: startY };
            endImg = { x: endX, y: endY };
        }

        const startScreen = imageToScreen(startImg.x, startImg.y);
        const endScreen = imageToScreen(endImg.x, endImg.y);

        return (
          <g key={handle.id}>
            <line
              x1={startScreen.x}
              y1={startScreen.y}
              x2={endScreen.x}
              y2={endScreen.y}
              stroke={color}
              strokeWidth="2"
              strokeDasharray="4 4"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      }

      return null;
    });
  };

  const container = containerRef.current;
  if (!container) {
    console.log('[GizmoOverlay] containerRef.current is null');
    return null;
  }

  const rect = container.getBoundingClientRect();
  console.log('[GizmoOverlay] Rendering SVG, rect:', rect.width, 'x', rect.height);

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
        {renderBoundingBox()}
        {renderRotationHandle()}
        {renderHandles()}
      </g>
    </svg>
  );
}
