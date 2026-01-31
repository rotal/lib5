import { create } from 'zustand';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
}

interface LogState {
  entries: LogEntry[];
  maxEntries: number;
  filter: LogLevel | 'all';
}

interface LogActions {
  log: (level: LogLevel, message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  clear: () => void;
  setFilter: (filter: LogLevel | 'all') => void;
}

export const useLogStore = create<LogState & LogActions>((set, get) => ({
  entries: [],
  maxEntries: 500,
  filter: 'all',

  log: (level, message, data) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    set((state) => {
      const entries = [...state.entries, entry];
      if (entries.length > state.maxEntries) {
        entries.splice(0, entries.length - state.maxEntries);
      }
      return { entries };
    });
  },

  debug: (message, data) => get().log('debug', message, data),
  info: (message, data) => get().log('info', message, data),
  warn: (message, data) => get().log('warn', message, data),
  error: (message, data) => get().log('error', message, data),

  clear: () => set({ entries: [] }),

  setFilter: (filter) => set({ filter }),
}));

// Helper to get the log functions without subscribing to state
export const appLog = {
  debug: (message: string, data?: unknown) => useLogStore.getState().debug(message, data),
  info: (message: string, data?: unknown) => useLogStore.getState().info(message, data),
  warn: (message: string, data?: unknown) => useLogStore.getState().warn(message, data),
  error: (message: string, data?: unknown) => useLogStore.getState().error(message, data),
  clear: () => useLogStore.getState().clear(),
};

// Step 1: Just console.log, simple string only
const _origLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  _origLog(...args);
  // Only capture if first arg is string
  if (typeof args[0] === 'string') {
    useLogStore.getState().info(args[0]);
  }
};

