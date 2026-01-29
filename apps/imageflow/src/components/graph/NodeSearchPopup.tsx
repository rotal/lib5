import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { NodeDefinition } from '../../types/node';

interface NodeSearchPopupProps {
  x: number;
  y: number;
  onSelect: (nodeType: string) => void;
  onClose: () => void;
  filterDataType?: string; // Filter nodes by compatible input/output type
  filterDirection?: 'input' | 'output'; // Which direction to filter
}

export function NodeSearchPopup({
  x,
  y,
  onSelect,
  onClose,
  filterDataType,
  filterDirection,
}: NodeSearchPopupProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get all node definitions
  const allNodes = useMemo(() => {
    return NodeRegistry.getAll();
  }, []);

  // Filter nodes based on search and data type compatibility
  const filteredNodes = useMemo(() => {
    let nodes = allNodes;

    // Filter by compatible data type if specified
    if (filterDataType && filterDirection) {
      nodes = nodes.filter((node) => {
        if (filterDirection === 'output') {
          // We dragged from an output, so we need nodes with compatible inputs
          return node.inputs.some(
            (input) => input.dataType === filterDataType || input.dataType === 'any'
          );
        } else {
          // We dragged from an input, so we need nodes with compatible outputs
          return node.outputs.some(
            (output) => output.dataType === filterDataType || output.dataType === 'any'
          );
        }
      });
    }

    // Filter by search query
    if (search.trim()) {
      const query = search.toLowerCase();
      nodes = nodes.filter(
        (node) =>
          node.name.toLowerCase().includes(query) ||
          node.type.toLowerCase().includes(query) ||
          node.category.toLowerCase().includes(query)
      );
    }

    return nodes;
  }, [allNodes, search, filterDataType, filterDirection]);

  // Group by category
  const groupedNodes = useMemo(() => {
    const groups: Record<string, NodeDefinition[]> = {};
    for (const node of filteredNodes) {
      if (!groups[node.category]) {
        groups[node.category] = [];
      }
      groups[node.category].push(node);
    }
    return groups;
  }, [filteredNodes]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    return filteredNodes;
  }, [filteredNodes]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatList.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatList.length]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          onSelect(flatList[selectedIndex].type);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        onClose();
        break;
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.node-search-popup')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Position popup within viewport
  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 280),
    top: Math.min(y, window.innerHeight - 400),
    zIndex: 1000,
  };

  return (
    <div className="node-search-popup" style={popupStyle}>
      <div className="w-64 bg-editor-surface border border-editor-border rounded-lg shadow-xl overflow-hidden">
        {/* Search input */}
        <div className="p-2 border-b border-editor-border">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes..."
            className="w-full px-3 py-2 bg-editor-surface-light border border-editor-border rounded text-sm text-editor-text placeholder-editor-text-dim focus:outline-none focus:border-editor-accent"
          />
        </div>

        {/* Node list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="p-4 text-sm text-editor-text-dim text-center">
              No nodes found
            </div>
          ) : (
            Object.entries(groupedNodes).map(([category, nodes]) => (
              <div key={category}>
                {/* Category header */}
                <div className="px-3 py-1 text-xs font-medium text-editor-text-dim bg-editor-surface-light sticky top-0">
                  {category}
                </div>
                {/* Nodes in category */}
                {nodes.map((node) => {
                  const index = flatList.indexOf(node);
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={node.type}
                      data-index={index}
                      onClick={() => onSelect(node.type)}
                      className={`px-3 py-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-editor-accent text-white'
                          : 'text-editor-text hover:bg-editor-surface-light'
                      }`}
                    >
                      <div className="text-sm font-medium">{node.name}</div>
                      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-editor-text-dim'}`}>
                        {node.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Hint */}
        <div className="px-3 py-2 border-t border-editor-border text-xs text-editor-text-dim">
          ↑↓ Navigate • Enter Select • Esc Close
        </div>
      </div>
    </div>
  );
}
