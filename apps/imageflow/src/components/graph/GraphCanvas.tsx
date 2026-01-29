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

interface MarqueeState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
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
    selectNodes,
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

  const { showContextMenu, setPreviewSlot, clearPreviewSlot, previewSlots } = useUiStore();

  const [portPositions, setPortPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const edgesRef = useRef<SVGSVGElement>(null);
  const [searchPopup, setSearchPopup] = useState<SearchPopupState>({
    visible: false,
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
  });
  const [marquee, setMarquee] = useState<MarqueeState>({
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const justFinishedMarquee = useRef(false);
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

  // Handle canvas click (deselect) - only if not ending a marquee
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (marquee.active || justFinishedMarquee.current) {
      justFinishedMarquee.current = false;
      return; // Don't clear selection if we were doing marquee
    }
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('graph-background')) {
      clearSelection();
    }
  }, [clearSelection, marquee.active]);

  // Handle canvas mouse down for marquee selection
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start marquee on left click on empty canvas
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('graph-background')) return;

    e.preventDefault();
    setMarquee({
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
  }, []);

  // Marquee selection mouse tracking
  useEffect(() => {
    if (!marquee.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMarquee(prev => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
      }));
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Calculate selection rect in world coordinates
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setMarquee(prev => ({ ...prev, active: false }));
        return;
      }

      const minScreenX = Math.min(marquee.startX, e.clientX);
      const maxScreenX = Math.max(marquee.startX, e.clientX);
      const minScreenY = Math.min(marquee.startY, e.clientY);
      const maxScreenY = Math.max(marquee.startY, e.clientY);

      // Only select if dragged more than 5 pixels (to distinguish from click)
      if (maxScreenX - minScreenX > 5 || maxScreenY - minScreenY > 5) {
        // Convert screen rect to world coordinates
        const topLeft = screenToWorld(minScreenX, minScreenY);
        const bottomRight = screenToWorld(maxScreenX, maxScreenY);

        // Find nodes that intersect with the selection rect
        const selectedIds: string[] = [];
        const NODE_WIDTH = 180;
        const NODE_HEIGHT = 100;

        for (const node of Object.values(graph.nodes)) {
          const nodeLeft = node.position.x;
          const nodeTop = node.position.y;
          const nodeRight = nodeLeft + NODE_WIDTH;
          const nodeBottom = nodeTop + NODE_HEIGHT;

          // Check if node intersects with selection rect
          if (
            nodeRight >= topLeft.x &&
            nodeLeft <= bottomRight.x &&
            nodeBottom >= topLeft.y &&
            nodeTop <= bottomRight.y
          ) {
            selectedIds.push(node.id);
          }
        }

        if (selectedIds.length > 0) {
          selectNodes(selectedIds, e.shiftKey);
          justFinishedMarquee.current = true;
        }
      } else {
        // Small drag, treat as potential click - set flag to prevent immediate clear
        justFinishedMarquee.current = true;
      }

      setMarquee(prev => ({ ...prev, active: false }));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marquee.active, marquee.startX, marquee.startY, screenToWorld, graph.nodes, selectNodes, containerRef]);

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

      // 1/2/3 keys assign selected node to preview slot (toggle off if already assigned)
      if ((e.key === '1' || e.key === '2' || e.key === '3') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Only if a single node is selected
        if (selectedNodeIds.size === 1) {
          const nodeId = Array.from(selectedNodeIds)[0];
          const slotIndex = (parseInt(e.key) - 1) as 0 | 1 | 2;
          // Toggle off if node is already in this slot
          if (previewSlots[slotIndex] === nodeId) {
            clearPreviewSlot(slotIndex);
          } else {
            setPreviewSlot(slotIndex, nodeId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screenToWorld, selectedNodeIds, setPreviewSlot, clearPreviewSlot, previewSlots]);

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
      onMouseDown={(e) => {
        handlers.onMouseDown(e);
        handleCanvasMouseDown(e);
      }}
      style={{ cursor: isPanning ? 'grabbing' : marquee.active ? 'crosshair' : 'default' }}
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

      {/* Marquee selection rectangle */}
      {marquee.active && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
          style={{
            left: Math.min(marquee.startX, marquee.currentX) - (containerRef.current?.getBoundingClientRect().left || 0),
            top: Math.min(marquee.startY, marquee.currentY) - (containerRef.current?.getBoundingClientRect().top || 0),
            width: Math.abs(marquee.currentX - marquee.startX),
            height: Math.abs(marquee.currentY - marquee.startY),
          }}
        />
      )}

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
