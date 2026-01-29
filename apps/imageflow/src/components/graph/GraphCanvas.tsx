import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useUiStore } from '../../store';
import { useViewport } from '../../hooks/useViewport';
import { useGraph } from '../../hooks/useGraph';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { areTypesCompatible } from '../../types/data';
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

  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; portId: string } | null>(null);
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

  // Calculate port positions directly from node positions (no DOM queries)
  // This ensures edges update instantly during dragging
  const portPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const NODE_WIDTH = 200; // Matches min-width in CSS
    const HEADER_HEIGHT = 40; // Header area
    const PORT_SIZE = 14; // Port diameter
    const PORT_GAP = 8; // gap-2 in tailwind

    for (const node of Object.values(graph.nodes)) {
      const definition = NodeRegistry.get(node.type);
      if (!definition) continue;

      const maxPorts = Math.max(definition.inputs.length, definition.outputs.length, 1);
      const portAreaHeight = maxPorts * 24 + 8;

      // Calculate input port positions (left side)
      const inputCount = definition.inputs.length;
      if (inputCount > 0) {
        const totalInputHeight = inputCount * PORT_SIZE + (inputCount - 1) * PORT_GAP;
        const inputStartY = HEADER_HEIGHT + (portAreaHeight - totalInputHeight) / 2;

        definition.inputs.forEach((port, index) => {
          const x = node.position.x - 1; // Port center is 1px left of node edge (port is at -8px, width 14px, center at -1px)
          const y = node.position.y + inputStartY + index * (PORT_SIZE + PORT_GAP) + PORT_SIZE / 2;
          positions.set(`${node.id}:${port.id}:input`, { x, y });
        });
      }

      // Calculate output port positions (right side)
      const outputCount = definition.outputs.length;
      if (outputCount > 0) {
        const totalOutputHeight = outputCount * PORT_SIZE + (outputCount - 1) * PORT_GAP;
        const outputStartY = HEADER_HEIGHT + (portAreaHeight - totalOutputHeight) / 2;

        definition.outputs.forEach((port, index) => {
          const x = node.position.x + NODE_WIDTH + 1; // Port center is 1px right of node edge
          const y = node.position.y + outputStartY + index * (PORT_SIZE + PORT_GAP) + PORT_SIZE / 2;
          positions.set(`${node.id}:${port.id}:output`, { x, y });
        });
      }
    }

    return positions;
  }, [graph.nodes]);

  // Find nearest compatible port for auto-snap (50px threshold)
  const findNearestCompatiblePort = useCallback((screenX: number, screenY: number): { nodeId: string; portId: string } | null => {
    if (!connectionDrag || !containerRef.current) return null;

    const SNAP_THRESHOLD = 50; // pixels in screen space
    let nearest: { nodeId: string; portId: string; distance: number } | null = null;

    // Get the source port's data type
    const sourceNode = graph.nodes[connectionDrag.sourceNodeId];
    if (!sourceNode) return null;
    const sourceDef = NodeRegistry.get(sourceNode.type);
    if (!sourceDef) return null;

    const sourcePort = connectionDrag.sourceDirection === 'output'
      ? sourceDef.outputs.find(p => p.id === connectionDrag.sourcePortId)
      : sourceDef.inputs.find(p => p.id === connectionDrag.sourcePortId);
    if (!sourcePort) return null;

    // Target direction is opposite of source
    const targetDirection = connectionDrag.sourceDirection === 'output' ? 'input' : 'output';

    // Search all port positions
    for (const [key, pos] of portPositions) {
      const [nodeId, portId, direction] = key.split(':');

      // Skip if same node or same direction
      if (nodeId === connectionDrag.sourceNodeId) continue;
      if (direction !== targetDirection) continue;

      // Get target node's port definition for type checking
      const targetNode = graph.nodes[nodeId];
      if (!targetNode) continue;
      const targetDef = NodeRegistry.get(targetNode.type);
      if (!targetDef) continue;

      const targetPort = targetDirection === 'input'
        ? targetDef.inputs.find(p => p.id === portId)
        : targetDef.outputs.find(p => p.id === portId);
      if (!targetPort) continue;

      // Check type compatibility
      const compatible = connectionDrag.sourceDirection === 'output'
        ? areTypesCompatible(sourcePort.dataType, targetPort.dataType)
        : areTypesCompatible(targetPort.dataType, sourcePort.dataType);
      if (!compatible) continue;

      // Convert world position to screen position
      const rect = containerRef.current.getBoundingClientRect();
      const portScreenX = (pos.x + viewport.x) * viewport.zoom + rect.width / 2 + rect.left;
      const portScreenY = (pos.y + viewport.y) * viewport.zoom + rect.height / 2 + rect.top;

      // Calculate distance
      const dx = screenX - portScreenX;
      const dy = screenY - portScreenY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < SNAP_THRESHOLD && (!nearest || distance < nearest.distance)) {
        nearest = { nodeId, portId, distance };
      }
    }

    return nearest ? { nodeId: nearest.nodeId, portId: nearest.portId } : null;
  }, [connectionDrag, graph.nodes, portPositions, viewport, containerRef]);

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

  // Track mouse/touch movement for connection drag
  useEffect(() => {
    if (!connectionDrag) {
      setSnapTarget(null);
      return;
    }

    const handleMove = (clientX: number, clientY: number) => {
      updateConnectionDrag(clientX, clientY);
      // Update snap target
      const nearest = findNearestCompatiblePort(clientX, clientY);
      setSnapTarget(nearest);
    };

    const handleEnd = (clientX: number, clientY: number, target: Element | null) => {
      // Check if we dropped on a port
      if (target instanceof HTMLElement && target.classList.contains('node-port')) {
        const targetNodeId = target.getAttribute('data-node-id');
        const targetPortId = target.getAttribute('data-port-id');
        const targetDirection = target.getAttribute('data-port-direction');

        if (targetNodeId && targetPortId && targetDirection !== connectionDrag.sourceDirection) {
          handleConnectionEnd(targetNodeId, targetPortId);
          setSnapTarget(null);
          return;
        }
      }

      // Check if we have a snap target
      if (snapTarget) {
        handleConnectionEnd(snapTarget.nodeId, snapTarget.portId);
        setSnapTarget(null);
        return;
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

      const worldPos = screenToWorld(clientX, clientY);

      setSearchPopup({
        visible: true,
        x: clientX,
        y: clientY,
        worldX: worldPos.x,
        worldY: worldPos.y,
        pendingConnection: {
          sourceNodeId: connectionDrag.sourceNodeId,
          sourcePortId: connectionDrag.sourcePortId,
          sourceDirection: connectionDrag.sourceDirection,
          dataType,
        },
      });

      setSnapTarget(null);
      cancelConnectionDrag();
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      handleEnd(e.clientX, e.clientY, e.target as Element);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      // For touch, get element under the touch point
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
      handleEnd(touch.clientX, touch.clientY, targetElement);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [connectionDrag, updateConnectionDrag, handleConnectionEnd, cancelConnectionDrag, graph.nodes, screenToWorld, findNearestCompatiblePort, snapTarget]);

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

  // Calculate drag edge position (with snap target support)
  const dragEdgeData = useMemo(() => {
    if (!connectionDrag || !containerRef.current) return null;

    const sourceKey = `${connectionDrag.sourceNodeId}:${connectionDrag.sourcePortId}:${connectionDrag.sourceDirection}`;
    const sourcePos = portPositions.get(sourceKey) || { x: 0, y: 0 };

    // Use snap target position if available
    let endPos: { x: number; y: number };
    if (snapTarget) {
      const targetDirection = connectionDrag.sourceDirection === 'output' ? 'input' : 'output';
      const snapKey = `${snapTarget.nodeId}:${snapTarget.portId}:${targetDirection}`;
      endPos = portPositions.get(snapKey) || screenToWorld(connectionDrag.mouseX, connectionDrag.mouseY);
    } else {
      endPos = screenToWorld(connectionDrag.mouseX, connectionDrag.mouseY);
    }

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
        targetX: endPos.x,
        targetY: endPos.y,
        dataType: dataType as any,
        isSnapped: !!snapTarget,
      };
    } else {
      return {
        sourceX: endPos.x,
        sourceY: endPos.y,
        targetX: sourcePos.x,
        targetY: sourcePos.y,
        dataType: dataType as any,
        isSnapped: !!snapTarget,
      };
    }
  }, [connectionDrag, portPositions, screenToWorld, graph.nodes, containerRef, snapTarget]);

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
