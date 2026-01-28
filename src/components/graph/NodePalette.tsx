import React, { useMemo, useCallback } from 'react';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { NodeCategory, NodeDefinition } from '../../types/node';
import { useUiStore } from '../../store';
import { useGraph } from '../../hooks/useGraph';
import { useViewport } from '../../hooks/useViewport';

const CATEGORY_ORDER: NodeCategory[] = [
  'Input',
  'Output',
  'Transform',
  'Adjust',
  'Filter',
  'Composite',
  'Mask',
  'AI',
  'Utility',
];

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  Input: 'bg-node-input',
  Output: 'bg-node-output',
  Transform: 'bg-node-transform',
  Adjust: 'bg-node-adjust',
  Filter: 'bg-node-filter',
  Composite: 'bg-node-composite',
  Mask: 'bg-node-mask',
  AI: 'bg-node-ai',
  Utility: 'bg-gray-500',
};

export function NodePalette() {
  const { paletteSearchQuery, setPaletteSearch, expandedCategories, toggleCategory } = useUiStore();
  const { addNode } = useGraph();
  const { screenToWorld, containerRef } = useViewport();

  // Get all nodes grouped by category
  const categories = useMemo(() => {
    const allCategories = NodeRegistry.getCategories();
    const result: { category: NodeCategory; nodes: NodeDefinition[] }[] = [];

    for (const category of CATEGORY_ORDER) {
      const nodes = allCategories.get(category) || [];

      // Filter by search query
      const filteredNodes = paletteSearchQuery
        ? nodes.filter(
            (node) =>
              node.name.toLowerCase().includes(paletteSearchQuery.toLowerCase()) ||
              node.description.toLowerCase().includes(paletteSearchQuery.toLowerCase())
          )
        : nodes;

      if (filteredNodes.length > 0) {
        result.push({ category, nodes: filteredNodes });
      }
    }

    return result;
  }, [paletteSearchQuery]);

  const handleAddNode = useCallback((type: string) => {
    // Add node near center of viewport
    let x = 100;
    let y = 100;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      x = center.x - 90; // Half of typical node width
      y = center.y - 50; // Half of typical node height
    }

    addNode(type, x, y);
  }, [addNode, screenToWorld, containerRef]);

  const handleDragStart = useCallback((e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('nodeType', type);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-editor-border">
        <input
          type="text"
          placeholder="Search nodes..."
          value={paletteSearchQuery}
          onChange={(e) => setPaletteSearch(e.target.value)}
          className="w-full px-3 py-2 bg-editor-surface-light border border-editor-border rounded-md text-sm text-editor-text placeholder-editor-text-dim focus:outline-none focus:border-editor-accent"
        />
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {categories.map(({ category, nodes }) => (
          <div key={category} className="border-b border-editor-border">
            {/* Category header */}
            <button
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-editor-surface-light transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[category]}`} />
                <span className="text-sm font-medium text-editor-text">{category}</span>
                <span className="text-xs text-editor-text-dim">({nodes.length})</span>
              </div>
              <svg
                className={`w-4 h-4 text-editor-text-dim transition-transform ${
                  expandedCategories.has(category) ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Node list */}
            {(expandedCategories.has(category) || paletteSearchQuery) && (
              <div className="pb-2">
                {nodes.map((node) => (
                  <div
                    key={node.type}
                    className="mx-2 my-1 px-3 py-2 bg-editor-surface-light rounded cursor-pointer hover:bg-editor-border transition-colors"
                    onClick={() => handleAddNode(node.type)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.type)}
                  >
                    <div className="text-sm text-editor-text">{node.name}</div>
                    <div className="text-xs text-editor-text-dim mt-0.5 line-clamp-2">
                      {node.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
