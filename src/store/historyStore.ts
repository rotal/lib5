import { create } from 'zustand';
import { Graph, NodeInstance, Edge } from '../types';

interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  nodes: Record<string, NodeInstance>;
  edges: Record<string, Edge>;
}

interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  maxEntries: number;
  isSaving: boolean;
}

interface HistoryActions {
  saveState: (graph: Graph, description: string) => void;
  undo: () => { nodes: Record<string, NodeInstance>; edges: Record<string, Edge> } | null;
  redo: () => { nodes: Record<string, NodeInstance>; edges: Record<string, Edge> } | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  setMaxEntries: (max: number) => void;
  getHistory: () => HistoryEntry[];
  jumpToEntry: (index: number) => { nodes: Record<string, NodeInstance>; edges: Record<string, Edge> } | null;
}

function deepCloneNodes(nodes: Record<string, NodeInstance>): Record<string, NodeInstance> {
  const result: Record<string, NodeInstance> = {};
  for (const [id, node] of Object.entries(nodes)) {
    result[id] = {
      ...node,
      position: { ...node.position },
      parameters: { ...node.parameters },
    };
  }
  return result;
}

function deepCloneEdges(edges: Record<string, Edge>): Record<string, Edge> {
  const result: Record<string, Edge> = {};
  for (const [id, edge] of Object.entries(edges)) {
    result[id] = { ...edge };
  }
  return result;
}

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  entries: [],
  currentIndex: -1,
  maxEntries: 50,
  isSaving: false,

  saveState: (graph, description) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      description,
      nodes: deepCloneNodes(graph.nodes),
      edges: deepCloneEdges(graph.edges),
    };

    set((state) => {
      // Remove any entries after current index (branching)
      let newEntries = state.entries.slice(0, state.currentIndex + 1);
      newEntries.push(entry);

      // Trim to max entries
      if (newEntries.length > state.maxEntries) {
        newEntries = newEntries.slice(-state.maxEntries);
      }

      return {
        entries: newEntries,
        currentIndex: newEntries.length - 1
      };
    });
  },

  undo: () => {
    const { entries, currentIndex } = get();

    if (currentIndex <= 0) {
      return null;
    }

    const prevEntry = entries[currentIndex - 1];
    set({ currentIndex: currentIndex - 1 });

    return {
      nodes: deepCloneNodes(prevEntry.nodes),
      edges: deepCloneEdges(prevEntry.edges),
    };
  },

  redo: () => {
    const { entries, currentIndex } = get();

    if (currentIndex >= entries.length - 1) {
      return null;
    }

    const nextEntry = entries[currentIndex + 1];
    set({ currentIndex: currentIndex + 1 });

    return {
      nodes: deepCloneNodes(nextEntry.nodes),
      edges: deepCloneEdges(nextEntry.edges),
    };
  },

  canUndo: () => {
    return get().currentIndex > 0;
  },

  canRedo: () => {
    const { entries, currentIndex } = get();
    return currentIndex < entries.length - 1;
  },

  clear: () => {
    set({ entries: [], currentIndex: -1 });
  },

  setMaxEntries: (max) => {
    set((state) => {
      const newMax = Math.max(10, max);
      let newEntries = state.entries;
      let newIndex = state.currentIndex;

      if (newEntries.length > newMax) {
        const trimCount = newEntries.length - newMax;
        newEntries = newEntries.slice(trimCount);
        newIndex = Math.max(0, newIndex - trimCount);
      }

      return {
        maxEntries: newMax,
        entries: newEntries,
        currentIndex: newIndex
      };
    });
  },

  getHistory: () => {
    return get().entries;
  },

  jumpToEntry: (index) => {
    const { entries } = get();

    if (index < 0 || index >= entries.length) {
      return null;
    }

    const entry = entries[index];
    set({ currentIndex: index });

    return {
      nodes: deepCloneNodes(entry.nodes),
      edges: deepCloneEdges(entry.edges),
    };
  },
}));
