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
      // Trim to max entries
      if (entries.length > state.maxEntries) {
        entries.splice(0, entries.length - state.maxEntries);
      }
      return { entries };
    });
  },

  clear: () => set({ entries: [] }),

  setFilter: (filter) => set({ filter }),
}));

// Intercept console methods to capture logs
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function interceptConsole() {
  const logStore = useLogStore.getState();

  console.log = (...args) => {
    originalConsole.log(...args);
    logStore.log('info', args.map(formatArg).join(' '));
  };

  console.info = (...args) => {
    originalConsole.info(...args);
    logStore.log('info', args.map(formatArg).join(' '));
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    logStore.log('warn', args.map(formatArg).join(' '));
  };

  console.error = (...args) => {
    originalConsole.error(...args);
    logStore.log('error', args.map(formatArg).join(' '));
  };

  console.debug = (...args) => {
    originalConsole.debug(...args);
    logStore.log('debug', args.map(formatArg).join(' '));
  };
}

function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

// Initialize console interception
interceptConsole();
