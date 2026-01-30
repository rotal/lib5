import React, { useCallback, useMemo, useRef } from 'react';
import { PortDefinition } from '../../types/node';
import { getDataTypeColor, areTypesCompatible } from '../../types/data';
import { useGraphStore, useUiStore } from '../../store';
import { NodeRegistry } from '../../core/graph/NodeRegistry';

interface GraphPortProps {
  port: PortDefinition;
  direction: 'input' | 'output';
  nodeId: string;
  isConnected: boolean;
  onConnectionStart: (
    nodeId: string,
    portId: string,
    direction: 'input' | 'output',
    x: number,
    y: number
  ) => void;
  onConnectionEnd: (nodeId: string, portId: string) => void;
}

export function GraphPort({
  port,
  direction,
  nodeId,
  isConnected,
  onConnectionStart,
  onConnectionEnd,
}: GraphPortProps) {
  const color = getDataTypeColor(port.dataType);
  const connectionDrag = useGraphStore((s) => s.connectionDrag);
  const graph = useGraphStore((s) => s.graph);
  const isMobile = useUiStore((s) => s.isMobile);

  // Touch state for connection dragging
  const portRef = useRef<HTMLDivElement>(null);

  // Check if this port is compatible with the current drag source
  const isCompatible = useMemo(() => {
    if (!connectionDrag) return true; // Not dragging, all ports normal

    // Can't connect to same node
    if (connectionDrag.sourceNodeId === nodeId) return false;

    // Can't connect same direction (output to output, input to input)
    if (connectionDrag.sourceDirection === direction) return false;

    // Get the source port's data type
    const sourceNode = graph.nodes[connectionDrag.sourceNodeId];
    if (!sourceNode) return false;
    const sourceDef = NodeRegistry.get(sourceNode.type);
    if (!sourceDef) return false;

    const sourcePort = connectionDrag.sourceDirection === 'output'
      ? sourceDef.outputs.find(p => p.id === connectionDrag.sourcePortId)
      : sourceDef.inputs.find(p => p.id === connectionDrag.sourcePortId);
    if (!sourcePort) return false;

    // Check type compatibility (direction matters)
    if (connectionDrag.sourceDirection === 'output') {
      // Dragging from output to this input
      return areTypesCompatible(sourcePort.dataType, port.dataType);
    } else {
      // Dragging from input to this output
      return areTypesCompatible(port.dataType, sourcePort.dataType);
    }
  }, [connectionDrag, nodeId, direction, port.dataType, graph.nodes]);

  const isDragging = connectionDrag !== null;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    onConnectionStart(nodeId, port.id, direction, x, y);
  }, [nodeId, port.id, direction, onConnectionStart]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onConnectionEnd(nodeId, port.id);
  }, [nodeId, port.id, onConnectionEnd]);

  // Touch handlers for mobile connection dragging
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    onConnectionStart(nodeId, port.id, direction, x, y);
  }, [nodeId, port.id, direction, onConnectionStart]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    // Touch end on a port means we want to complete the connection
    if (connectionDrag && isCompatible) {
      onConnectionEnd(nodeId, port.id);
    }
  }, [nodeId, port.id, onConnectionEnd, connectionDrag, isCompatible]);

  // Visual styling based on drag state
  const showIncompatible = isDragging && !isCompatible;
  const showCompatible = isDragging && isCompatible && connectionDrag?.sourceDirection !== direction;

  // On mobile, wrap with larger touch target (44px minimum for accessibility)
  const touchTargetSize = isMobile ? 44 : 0;

  return (
    <div
      className="relative"
      style={{
        // Expand hitbox on mobile without changing visual layout
        margin: isMobile ? -((touchTargetSize - 12) / 2) : 0,
        padding: isMobile ? ((touchTargetSize - 12) / 2) : 0,
      }}
    >
      {/* Invisible touch target for mobile */}
      {isMobile && (
        <div
          className="absolute inset-0"
          style={{
            touchAction: 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />
      )}
      <div
        ref={portRef}
        className={`node-port ${isConnected ? 'connected' : ''} ${showCompatible ? 'compatible-target' : ''}`}
        style={{
          borderColor: color,
          backgroundColor: isConnected ? color : undefined,
          opacity: showIncompatible ? 0.3 : 1,
          transform: showCompatible ? 'scale(1.3)' : undefined,
          transition: 'opacity 0.15s, transform 0.15s',
          pointerEvents: showIncompatible ? 'none' : undefined,
          touchAction: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-port-id={port.id}
        data-port-direction={direction}
        data-node-id={nodeId}
        title={`${port.name} (${port.dataType})${showIncompatible ? ' (incompatible)' : ''}`}
      />
    </div>
  );
}
