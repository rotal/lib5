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
  // Preview slots (3 slots, index 0-2)
  // Slots 0-1 = foreground (mutually exclusive), Slot 2 = background
  previewSlots: [string | null, string | null, string | null];
  previewBackgroundActive: boolean;
  previewForegroundSlot: 0 | 1 | null;
  previewSplitPosition: number; // 0-1, how much foreground is shown
  previewSplitVertical: boolean; // true = vertical split, false = horizontal
  previewSplitReversed: boolean; // true = swap foreground/background sides
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
  // Preview slot actions
  setPreviewSlot: (slot: 0 | 1 | 2, nodeId: string | null) => void;
  togglePreviewBackground: () => void;
  setPreviewForeground: (slot: 0 | 1 | null) => void;
  clearPreviewSlot: (slot: 0 | 1 | 2) => void;
  clearAllPreviewSlots: () => void;
  restorePreviewSlots: (slots: [string | null, string | null, string | null], backgroundActive: boolean, foregroundSlot: 0 | 1 | null) => void;
  getPreviewSlotForNode: (nodeId: string) => number | null;
  setPreviewSplitPosition: (position: number) => void;
  togglePreviewSplitDirection: () => void;
  togglePreviewSplitReverse: () => void;
  showContextMenu: (x: number, y: number, type: 'canvas' | 'node' | 'edge' | 'port', targetId?: string) => void;
  hideContextMenu: () => void;
  showToast: (type: 'info' | 'success' | 'warning' | 'error', message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState & UiActions>((set, get) => ({
  isMobile: false,
  viewMode: 'split',
  theme: 'dark',
  liveEdit: true,
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
  previewSlots: [null, null, null],
  previewBackgroundActive: true,
  previewForegroundSlot: null,
  previewSplitPosition: 0.5,
  previewSplitVertical: true,
  previewSplitReversed: false,
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

  setPreviewSlot: (slot, nodeId) => {
    set(produce((state: UiState) => {
      state.previewSlots[slot] = nodeId;
      // Auto-activate the slot
      // Slot 2 (display "3") = background, Slots 0-1 (display "1"/"2") = foreground
      if (slot === 2) {
        state.previewBackgroundActive = true;
      } else {
        state.previewForegroundSlot = slot as 0 | 1;
      }
    }));
  },

  togglePreviewBackground: () => {
    set((state) => ({ previewBackgroundActive: !state.previewBackgroundActive }));
  },

  setPreviewForeground: (slot: 0 | 1 | null) => {
    set((state) => ({
      // Toggle off if clicking the same slot, otherwise switch to new slot
      previewForegroundSlot: state.previewForegroundSlot === slot ? null : slot
    }));
  },

  clearPreviewSlot: (slot) => {
    set(produce((state: UiState) => {
      state.previewSlots[slot] = null;
      // Slot 2 = background, Slots 0-1 = foreground
      if (slot === 2) {
        state.previewBackgroundActive = false;
      } else if (state.previewForegroundSlot === slot) {
        state.previewForegroundSlot = null;
      }
    }));
  },

  clearAllPreviewSlots: () => {
    set({
      previewSlots: [null, null, null],
      previewBackgroundActive: false,
      previewForegroundSlot: null,
    });
  },

  restorePreviewSlots: (slots, backgroundActive, foregroundSlot) => {
    set({
      previewSlots: slots,
      previewBackgroundActive: backgroundActive,
      previewForegroundSlot: foregroundSlot,
    });
  },

  getPreviewSlotForNode: (nodeId) => {
    const { previewSlots } = get();
    const index = previewSlots.indexOf(nodeId);
    return index >= 0 ? index : null;
  },

  setPreviewSplitPosition: (position) => {
    set({ previewSplitPosition: Math.max(0, Math.min(1, position)) });
  },

  togglePreviewSplitDirection: () => {
    set((state) => ({ previewSplitVertical: !state.previewSplitVertical }));
  },

  togglePreviewSplitReverse: () => {
    set((state) => ({ previewSplitReversed: !state.previewSplitReversed }));
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
