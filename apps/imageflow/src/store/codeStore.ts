import { create } from 'zustand';

const CODE_STORAGE_KEY = 'lib5-code';
const MAX_RECENT_PATHS = 10;

interface CodeState {
  projectPath: string | null;
  recentPaths: string[];
  bypassPermissions: boolean;
}

interface CodeActions {
  setProjectPath: (path: string | null) => void;
  addRecentPath: (path: string) => void;
  clearRecentPaths: () => void;
  setBypassPermissions: (bypass: boolean) => void;
}

function loadState(): Partial<CodeState> {
  try {
    const raw = localStorage.getItem(CODE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveState(state: CodeState) {
  localStorage.setItem(CODE_STORAGE_KEY, JSON.stringify(state));
}

const restored = loadState();

export const useCodeStore = create<CodeState & CodeActions>((set, get) => ({
  projectPath: restored.projectPath ?? null,
  recentPaths: restored.recentPaths ?? [],
  bypassPermissions: restored.bypassPermissions ?? false,

  setProjectPath: (path) => {
    set({ projectPath: path });
    const s = get();
    saveState({ projectPath: path, recentPaths: s.recentPaths, bypassPermissions: s.bypassPermissions });
  },

  addRecentPath: (path) => {
    const current = get().recentPaths;
    const filtered = current.filter((p) => p !== path);
    const updated = [path, ...filtered].slice(0, MAX_RECENT_PATHS);
    set({ recentPaths: updated });
    const s = get();
    saveState({ projectPath: s.projectPath, recentPaths: updated, bypassPermissions: s.bypassPermissions });
  },

  clearRecentPaths: () => {
    set({ recentPaths: [] });
    const s = get();
    saveState({ projectPath: s.projectPath, recentPaths: [], bypassPermissions: s.bypassPermissions });
  },

  setBypassPermissions: (bypass) => {
    set({ bypassPermissions: bypass });
    const s = get();
    saveState({ projectPath: s.projectPath, recentPaths: s.recentPaths, bypassPermissions: bypass });
  },
}));
