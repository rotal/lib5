import React, { useCallback } from 'react';
import { PortDefinition } from '../../types/node';
import { getDataTypeColor } from '../../types/data';

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

  return (
    <div
      className={`node-port ${isConnected ? 'connected' : ''}`}
      style={{
        borderColor: color,
        backgroundColor: isConnected ? color : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      data-port-id={port.id}
      data-port-direction={direction}
      data-node-id={nodeId}
      title={`${port.name} (${port.dataType})`}
    />
  );
}
