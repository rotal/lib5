import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useUiStore } from '../../store';
import { useViewport } from '../../hooks/useViewport';
import { useGraph } from '../../hooks/useGraph';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { GraphNode } from './GraphNode';
import { GraphEdge, DragEdge } from './GraphEdge';
import { NodeSearchPopup } from './NodeSearchPopup';

interface PendingConnection {
  sourceNodeId: string;
  sourcePortId: string;
  sourceDirection: 'input' | 'output';
  dataType: string;
}

interface SearchPopupState {
  visible: boolean;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  pendingConnection?: PendingConnection;
}

export function GraphCanvas() {
  const {
    containerRef,
    viewport,
    isPanning,
    screenToWorld,
    handlers,
  } = useViewport();

  const {
    graph,
    selectedNodeIds,
    selectedEdgeIds,
    connectionDrag,
    nodeStates,
    nodeOutputs,
    selectNode,
    selectEdge,
    clearSelection,
    moveNode,
    commitNodeMove,
    addNode,
    addEdge,
    startConnectionDrag,
    updateConnectionDrag,
    endConnectionDrag,
    cancelConnectionDrag,
  } = useGraph();

  const { showContextMenu, setPreviewSlot } = useUiStore();

  const [portPositions, setPortPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const edgesRef = useRef<SVGSVGElement>(null);
  const [searchPopup, setSearchPopup] = useState<SearchPopupState>({
    visible: false,
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
  });
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Update port positions when nodes change
  useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;

      const newPositions = new Map<string, { x: number; y: number }>();
      const ports = containerRef.current.querySelectorAll('[data-port-id]');

      ports.forEach((port) => {
        const portId = port.getAttribute('data-port-id');
        const nodeId = port.getAttribute('data-node-id');
        const direction = port.getAttribute('data-port-direction');

        if (portId && nodeId) {
          const rect = port.getBoundingClientRect();
          const containerRect = containerRef.current!.getBoundingClientRect();

          const x = (rect.left + rect.width / 2 - containerRect.left - containerRect.width / 2) / viewport.zoom - viewport.x;
          const y = (rect.top + rect.height / 2 - containerRect.top - containerRect.height / 2) / viewport.zoom - viewport.y;

          newPositions.set(`${nodeId}:${portId}:${direction}`, { x, y });
        }
      });

      setPortPositions(newPositions);
    };

    // Update positions after a short delay to ensure DOM is updated
    const timer = setTimeout(updatePositions, 10);
    return () => clearTimeout(timer);
  }, [graph.nodes, graph.edges, viewport, containerRef]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('graph-background')) {
      clearSelection();
    }
  }, [clearSelection]);

  // Handle canvas context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, 'canvas');
  }, [showContextMenu]);

  // Handle drag over (allow drop)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('nodetype')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  // Handle drop (create node at drop position)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);
    addNode(nodeType, worldPos.x - 90, worldPos.y - 50); // Center the node on drop point
  }, [screenToWorld, addNode]);

  // Handle connection start
  const handleConnectionStart = useCallback((
    nodeId: string,
    portId: string,
    direction: 'input' | 'output',
    x: number,
    y: number
  ) => {
    startConnectionDrag(nodeId, portId, direction, x, y);
  }, [startConnectionDrag]);

  // Handle connection end
  const handleConnectionEnd = useCallback((nodeId: string, portId: string) => {
    if (!connectionDrag) return;

    // Determine source and target based on direction
    if (connectionDrag.sourceDirection === 'output') {
      addEdge(connectionDrag.sourceNodeId, connectionDrag.sourcePortId, nodeId, portId);
    } else {
      addEdge(nodeId, portId, connectionDrag.sourceNodeId, connectionDrag.sourcePortId);
    }

    endConnectionDrag(nodeId, portId);
  }, [connectionDrag, addEdge, endConnectionDrag]);

  // Track mouse movement for connection drag
  useEffect(() => {
    if (!connectionDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateConnectionDrag(e.clientX, e.clientY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Check if we dropped on a port
      const target = e.target as HTMLElement;
      if (target.classList.contains('node-port')) {
        const targetNodeId = target.getAttribute('data-node-id');
        const targetPortId = target.getAttribute('data-port-id');
        const targetDirection = target.getAttribute('data-port-direction');

        if (targetNodeId && targetPortId && targetDirection !== connectionDrag.sourceDirection) {
          handleConnectionEnd(targetNodeId, targetPortId);
          return;
        }
      }

      // Dropped on empty space - show node search popup
      const sourceNode = graph.nodes[connectionDrag.sourceNodeId];
      const sourceNodeDef = sourceNode ? NodeRegistry.get(sourceNode.type) : null;

      let dataType = 'any';
      if (connectionDrag.sourceDirection === 'output') {
        const port = sourceNodeDef?.outputs.find((p) => p.id === connectionDrag.sourcePortId);
        dataType = port?.dataType || 'any';
      } else {
        const port = sourceNodeDef?.inputs.find((p) => p.id === connectionDrag.sourcePortId);
        dataType = port?.dataType || 'any';
      }

      const worldPos = screenToWorld(e.clientX, e.clientY);

      setSearchPopup({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        worldX: worldPos.x,
        worldY: worldPos.y,
        pendingConnection: {
          sourceNodeId: connectionDrag.sourceNodeId,
          sourcePortId: connectionDrag.sourcePortId,
          sourceDirection: connectionDrag.sourceDirection,
          dataType,
        },
      });

      cancelConnectionDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [connectionDrag, updateConnectionDrag, handleConnectionEnd, cancelConnectionDrag, graph.nodes, screenToWorld]);

  // Calculate edge positions
  const edgeData = useMemo(() => {
    return Object.values(graph.edges).map((edge) => {
      const sourceKey = `${edge.sourceNodeId}:${edge.sourcePortId}:output`;
      const targetKey = `${edge.targetNodeId}:${edge.targetPortId}:input`;

      const sourcePos = portPositions.get(sourceKey) || { x: 0, y: 0 };
      const targetPos = portPositions.get(targetKey) || { x: 0, y: 0 };

      const sourceNode = graph.nodes[edge.sourceNodeId];
      const sourceNodeDef = sourceNode ? NodeRegistry.get(sourceNode.type) : null;
      const sourcePort = sourceNodeDef?.outputs.find((p) => p.id === edge.sourcePortId);

      return {
        edge,
        sourceX: sourcePos.x,
        sourceY: sourcePos.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        dataType: sourcePort?.dataType || 'any',
      };
    });
  }, [graph.edges, graph.nodes, portPositions]);

  // Calculate drag edge position
  const dragEdgeData = useMemo(() => {
    if (!connectionDrag || !containerRef.current) return null;

    const sourceKey = `${connectionDrag.sourceNodeId}:${connectionDrag.sourcePortId}:${connectionDrag.sourceDirection}`;
    const sourcePos = portPositions.get(sourceKey) || { x: 0, y: 0 };

    const mouseWorld = screenToWorld(connectionDrag.mouseX, connectionDrag.mouseY);

    const sourceNode = graph.nodes[connectionDrag.sourceNodeId];
    const sourceNodeDef = sourceNode ? NodeRegistry.get(sourceNode.type) : null;

    let dataType: string = 'any';
    if (connectionDrag.sourceDirection === 'output') {
      const port = sourceNodeDef?.outputs.find((p) => p.id === connectionDrag.sourcePortId);
      dataType = port?.dataType || 'any';
    } else {
      const port = sourceNodeDef?.inputs.find((p) => p.id === connectionDrag.sourcePortId);
      dataType = port?.dataType || 'any';
    }

    if (connectionDrag.sourceDirection === 'output') {
      return {
        sourceX: sourcePos.x,
        sourceY: sourcePos.y,
        targetX: mouseWorld.x,
        targetY: mouseWorld.y,
        dataType: dataType as any,
      };
    } else {
      return {
        sourceX: mouseWorld.x,
        sourceY: mouseWorld.y,
        targetX: sourcePos.x,
        targetY: sourcePos.y,
        dataType: dataType as any,
      };
    }
  }, [connectionDrag, portPositions, screenToWorld, graph.nodes, containerRef]);

  // Track mouse position for Tab key
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Tab key handler to open search popup and 1/2/3 for preview slots
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if focus is in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Tab key opens node search popup
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const worldPos = screenToWorld(lastMousePos.current.x, lastMousePos.current.y);

        setSearchPopup({
          visible: true,
          x: lastMousePos.current.x,
          y: lastMousePos.current.y,
          worldX: worldPos.x,
          worldY: worldPos.y,
        });
      }

      // 1/2/3 keys assign selected node to preview slot
      if ((e.key === '1' || e.key === '2' || e.key === '3') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Only if a single node is selected
        if (selectedNodeIds.size === 1) {
          const nodeId = Array.from(selectedNodeIds)[0];
          const slotIndex = (parseInt(e.key) - 1) as 0 | 1 | 2;
          setPreviewSlot(slotIndex, nodeId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screenToWorld, selectedNodeIds, setPreviewSlot]);

  // Handle node selection from search popup
  const handleNodeSelect = useCallback((nodeType: string) => {
    const newNodeId = addNode(nodeType, searchPopup.worldX, searchPopup.worldY);

    if (newNodeId && searchPopup.pendingConnection) {
      const { sourceNodeId, sourcePortId, sourceDirection, dataType } = searchPopup.pendingConnection;
      const newNodeDef = NodeRegistry.get(nodeType);

      if (newNodeDef) {
        if (sourceDirection === 'output') {
          // We dragged from an output, connect to a compatible input on the new node
          const compatibleInput = newNodeDef.inputs.find(
            (input) => input.dataType === dataType || input.dataType === 'any' || dataType === 'any'
          );
          if (compatibleInput) {
            addEdge(sourceNodeId, sourcePortId, newNodeId, compatibleInput.id);
          }
        } else {
          // We dragged from an input, connect from a compatible output on the new node
          const compatibleOutput = newNodeDef.outputs.find(
            (output) => output.dataType === dataType || output.dataType === 'any' || dataType === 'any'
          );
          if (compatibleOutput) {
            addEdge(newNodeId, compatibleOutput.id, sourceNodeId, sourcePortId);
          }
        }
      }
    }

    setSearchPopup({ visible: false, x: 0, y: 0, worldX: 0, worldY: 0 });
  }, [addNode, addEdge, searchPopup]);

  // Handle search popup close
  const handleSearchPopupClose = useCallback(() => {
    setSearchPopup({ visible: false, x: 0, y: 0, worldX: 0, worldY: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden graph-background select-none"
      onClick={handleCanvasClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      {...handlers}
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      {/* Transform container */}
      <div
        className="absolute"
        style={{
          transform: `translate(${viewport.x * viewport.zoom + (containerRef.current?.clientWidth || 0) / 2}px, ${viewport.y * viewport.zoom + (containerRef.current?.clientHeight || 0) / 2}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Edges SVG layer */}
        <svg
          ref={edgesRef}
          className="absolute overflow-visible pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: 1,
            height: 1,
          }}
        >
          <g className="pointer-events-auto">
            {edgeData.map(({ edge, sourceX, sourceY, targetX, targetY, dataType }) => (
              <GraphEdge
                key={edge.id}
                edge={edge}
                sourceX={sourceX}
                sourceY={sourceY}
                targetX={targetX}
                targetY={targetY}
                dataType={dataType}
                isSelected={selectedEdgeIds.has(edge.id)}
                onSelect={selectEdge}
              />
            ))}
            {dragEdgeData && (
              <DragEdge
                sourceX={dragEdgeData.sourceX}
                sourceY={dragEdgeData.sourceY}
                targetX={dragEdgeData.targetX}
                targetY={dragEdgeData.targetY}
                dataType={dragEdgeData.dataType}
              />
            )}
          </g>
        </svg>

        {/* Nodes layer */}
        {Object.values(graph.nodes).map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            isSelected={selectedNodeIds.has(node.id)}
            runtimeState={nodeStates[node.id]}
            nodeOutputs={nodeOutputs[node.id]}
            edges={Object.values(graph.edges)}
            zoom={viewport.zoom}
            onSelect={selectNode}
            onMove={moveNode}
            onMoveEnd={commitNodeMove}
            onConnectionStart={handleConnectionStart}
            onConnectionEnd={handleConnectionEnd}
          />
        ))}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 px-2 py-1 bg-editor-surface/80 rounded text-xs text-editor-text-dim">
        {Math.round(viewport.zoom * 100)}%
      </div>

      {/* Node search popup */}
      {searchPopup.visible && (
        <NodeSearchPopup
          x={searchPopup.x}
          y={searchPopup.y}
          onSelect={handleNodeSelect}
          onClose={handleSearchPopupClose}
          filterDataType={searchPopup.pendingConnection?.dataType}
          filterDirection={searchPopup.pendingConnection?.sourceDirection}
        />
      )}
    </div>
  );
}
