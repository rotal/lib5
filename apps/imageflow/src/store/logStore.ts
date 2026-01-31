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

// Format argument for logging
function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// Intercept console methods to capture logs
console.log = (...args: unknown[]) => {
  originalConsole.log(...args);
  useLogStore.getState().info(args.map(formatArg).join(' '));
};

console.info = (...args: unknown[]) => {
  originalConsole.info(...args);
  useLogStore.getState().info(args.map(formatArg).join(' '));
};

console.warn = (...args: unknown[]) => {
  originalConsole.warn(...args);
  useLogStore.getState().warn(args.map(formatArg).join(' '));
};

console.error = (...args: unknown[]) => {
  originalConsole.error(...args);
  useLogStore.getState().error(args.map(formatArg).join(' '));
};

console.debug = (...args: unknown[]) => {
  originalConsole.debug(...args);
  useLogStore.getState().debug(args.map(formatArg).join(' '));
};
