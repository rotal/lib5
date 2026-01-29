import React, { useMemo } from 'react';
import { Edge } from '../../types/graph';
import { getDataTypeColor, DataType } from '../../types/data';

interface GraphEdgeProps {
  edge: Edge;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  dataType: DataType;
  isSelected: boolean;
  onSelect: (edgeId: string, additive: boolean) => void;
}

function generateBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.min(dx * 0.5, 150);

  const cx1 = x1 + controlOffset;
  const cy1 = y1;
  const cx2 = x2 - controlOffset;
  const cy2 = y2;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

export function GraphEdge({
  edge,
  sourceX,
  sourceY,
  targetX,
  targetY,
  dataType,
  isSelected,
  onSelect,
}: GraphEdgeProps) {
  const path = useMemo(
    () => generateBezierPath(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );

  const color = getDataTypeColor(dataType);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(edge.id, e.shiftKey || e.ctrlKey || e.metaKey);
  };

  return (
    <g onClick={handleClick}>
      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible path */}
      <path
        d={path}
        className={`graph-edge ${isSelected ? 'selected' : ''}`}
        stroke={isSelected ? '#6366f1' : color}
        strokeWidth={isSelected ? 3 : 2}
      />
    </g>
  );
}

interface DragEdgeProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  dataType: DataType;
}

export function DragEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  dataType,
}: DragEdgeProps) {
  const path = useMemo(
    () => generateBezierPath(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY]
  );

  const color = getDataTypeColor(dataType);

  return (
    <path
      d={path}
      className="graph-edge dragging"
      stroke={color}
      strokeWidth={2}
    />
  );
}
