import { create } from 'zustand';
import { produce } from 'immer';

export type PanelId = 'palette' | 'properties' | 'layers' | 'preview';
export type ViewMode = 'graph' | 'preview' | 'split';
export type Theme = 'dark' | 'light';

interface UiState {
  isMobile: boolean;
  viewMode: ViewMode;
  theme: Theme;
  liveEdit: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  activeMobilePanel: PanelId | null;
  leftPanelWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  activeModal: string | null;
  modalData: unknown;
  paletteSearchQuery: string;
  expandedCategories: Set<string>;
  previewNodeId: string | null;
  contextMenu: {
    x: number;
    y: number;
    type: 'canvas' | 'node' | 'edge' | 'port';
    targetId?: string;
  } | null;
  toasts: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    duration?: number;
  }>;
}

interface UiActions {
  setMobile: (isMobile: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
  setLiveEdit: (enabled: boolean) => void;
  toggleLiveEdit: () => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setActiveMobilePanel: (panel: PanelId | null) => void;
  setPanelSize: (panel: 'left' | 'right' | 'bottom', size: number) => void;
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: () => void;
  setPaletteSearch: (query: string) => void;
  toggleCategory: (category: string) => void;
  expandAllCategories: () => void;
  collapseAllCategories: () => void;
  setPreviewNode: (nodeId: string | null) => void;
  showContextMenu: (x: number, y: number, type: 'canvas' | 'node' | 'edge' | 'port', targetId?: string) => void;
  hideContextMenu: () => void;
  showToast: (type: 'info' | 'success' | 'warning' | 'error', message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState & UiActions>((set, get) => ({
  isMobile: false,
  viewMode: 'split',
  theme: 'dark',
  liveEdit: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,
  activeMobilePanel: null,
  leftPanelWidth: 240,
  rightPanelWidth: 280,
  bottomPanelHeight: 300,
  activeModal: null,
  modalData: null,
  paletteSearchQuery: '',
  expandedCategories: new Set(['Input', 'Output', 'Adjust']),
  previewNodeId: null,
  contextMenu: null,
  toasts: [],

  setMobile: (isMobile) => {
    set(produce((state: UiState) => {
      state.isMobile = isMobile;
      if (isMobile) {
        state.leftPanelOpen = false;
        state.rightPanelOpen = false;
        state.viewMode = 'graph';
      }
    }));
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setTheme: (theme) => {
    set({ theme });
  },

  setLiveEdit: (enabled) => {
    set({ liveEdit: enabled });
  },

  toggleLiveEdit: () => {
    set((state) => ({ liveEdit: !state.liveEdit }));
  },

  toggleLeftPanel: () => {
    set((state) => ({ leftPanelOpen: !state.leftPanelOpen }));
  },

  toggleRightPanel: () => {
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen }));
  },

  toggleBottomPanel: () => {
    set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen }));
  },

  setActiveMobilePanel: (panel) => {
    set({ activeMobilePanel: panel });
  },

  setPanelSize: (panel, size) => {
    set((state) => {
      switch (panel) {
        case 'left':
          return { leftPanelWidth: Math.max(180, Math.min(400, size)) };
        case 'right':
          return { rightPanelWidth: Math.max(200, Math.min(500, size)) };
        case 'bottom':
          return { bottomPanelHeight: Math.max(150, Math.min(600, size)) };
        default:
          return state;
      }
    });
  },

  openModal: (modalId, data) => {
    set({ activeModal: modalId, modalData: data });
  },

  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },

  setPaletteSearch: (query) => {
    set({ paletteSearchQuery: query });
  },

  toggleCategory: (category) => {
    set((state) => {
      const newExpanded = new Set(state.expandedCategories);
      if (newExpanded.has(category)) {
        newExpanded.delete(category);
      } else {
        newExpanded.add(category);
      }
      return { expandedCategories: newExpanded };
    });
  },

  expandAllCategories: () => {
    set({
      expandedCategories: new Set([
        'Input', 'Output', 'Transform', 'Adjust',
        'Filter', 'Composite', 'Mask', 'AI', 'Utility'
      ])
    });
  },

  collapseAllCategories: () => {
    set({ expandedCategories: new Set() });
  },

  setPreviewNode: (nodeId) => {
    set({ previewNodeId: nodeId });
  },

  showContextMenu: (x, y, type, targetId) => {
    set({ contextMenu: { x, y, type, targetId } });
  },

  hideContextMenu: () => {
    set({ contextMenu: null });
  },

  showToast: (type, message, duration = 3000) => {
    const id = crypto.randomUUID();

    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }]
    }));

    if (duration > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, duration);
    }
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }));
  },
}));
