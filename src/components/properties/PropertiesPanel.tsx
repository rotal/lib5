import { useMemo, useCallback } from 'react';
import { useGraphStore, useExecutionStore } from '../../store';
import { useGraph } from '../../hooks/useGraph';
import { NodeRegistry } from '../../core/graph/NodeRegistry';
import { ParameterInput } from './ParameterInput';

interface DownloadData {
  url: string;
  filename: string;
}

export function PropertiesPanel() {
  const { selectedNodeIds, graph } = useGraphStore();
  const { updateNodeParameter, commitParameterChange } = useGraph();
  const nodeOutputs = useExecutionStore((s) => s.nodeOutputs);

  // Get selected nodes
  const selectedNodes = useMemo(() => {
    return Array.from(selectedNodeIds).map((id) => graph.nodes[id]).filter(Boolean);
  }, [selectedNodeIds, graph.nodes]);

  // Get the first selected node for editing
  const node = selectedNodes[0];
  const definition = node ? NodeRegistry.get(node.type) : null;

  const handleParameterChange = useCallback(
    (paramId: string, value: unknown) => {
      if (node) {
        updateNodeParameter(node.id, paramId, value);
      }
    },
    [node, updateNodeParameter]
  );

  const handleParameterChangeEnd = useCallback(
    (paramId: string) => {
      if (node) {
        commitParameterChange(node.id, paramId);
      }
    },
    [node, commitParameterChange]
  );

  // Get download data for Export nodes
  const downloadData = useMemo((): DownloadData | null => {
    if (!node || node.type !== 'output/export') return null;
    const outputs = nodeOutputs[node.id];
    if (!outputs || !outputs._downloadData) return null;
    try {
      return JSON.parse(outputs._downloadData as string) as DownloadData;
    } catch {
      return null;
    }
  }, [node, nodeOutputs]);

  const handleDownload = useCallback(() => {
    if (!downloadData) return;
    const a = document.createElement('a');
    a.href = downloadData.url;
    a.download = downloadData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [downloadData]);

  if (!node || !definition) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-editor-border">
          <h2 className="text-sm font-medium text-editor-text">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-editor-text-dim text-center">
            Select a node to view its properties
          </p>
        </div>
      </div>
    );
  }

  if (selectedNodes.length > 1) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-editor-border">
          <h2 className="text-sm font-medium text-editor-text">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-editor-text-dim text-center">
            {selectedNodes.length} nodes selected
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-editor-border">
        <h2 className="text-sm font-medium text-editor-text">{definition.name}</h2>
        <p className="text-xs text-editor-text-dim mt-0.5">{definition.description}</p>
      </div>

      {/* Parameters */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {definition.parameters.filter(p => p.id !== 'preview').length === 0 ? (
          <p className="text-sm text-editor-text-dim">No parameters</p>
        ) : (
          definition.parameters
            .filter(p => p.id !== 'preview') // Preview is shown on node header
            .map((param) => (
              <ParameterInput
                key={param.id}
                definition={param}
                value={node.parameters[param.id]}
                onChange={(value) => handleParameterChange(param.id, value)}
                onChangeEnd={() => handleParameterChangeEnd(param.id)}
              />
            ))
        )}

        {/* Download button for Export node */}
        {node.type === 'output/export' && (
          <div className="pt-2 border-t border-editor-border">
            <button
              onClick={handleDownload}
              disabled={!downloadData}
              className={`w-full px-4 py-2 rounded font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                downloadData
                  ? 'bg-editor-accent text-white hover:bg-editor-accent/80'
                  : 'bg-editor-surface-light text-editor-text-dim cursor-not-allowed'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloadData ? `Download ${downloadData.filename}` : 'Execute to enable download'}
            </button>
          </div>
        )}
      </div>

      {/* Node info */}
      <div className="p-3 border-t border-editor-border text-xs text-editor-text-dim">
        <div>Type: {node.type}</div>
        <div>ID: {node.id.slice(0, 8)}...</div>
      </div>
    </div>
  );
}
