import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onReady?: (terminal: XTerm) => void;
}

export function Terminal({ onData, onResize, onReady }: TerminalProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const isInitializedRef = useRef(false);

  const fit = useCallback(() => {
    if (!isInitializedRef.current || !fitAddonRef.current || !terminalRef.current || !wrapperRef.current) {
      return;
    }

    const { offsetWidth, offsetHeight } = wrapperRef.current;

    // Skip if container has no size yet
    if (offsetWidth === 0 || offsetHeight === 0) {
      return;
    }

    // Only fit if size actually changed to prevent loops
    if (
      lastSizeRef.current &&
      lastSizeRef.current.width === offsetWidth &&
      lastSizeRef.current.height === offsetHeight
    ) {
      return;
    }
    lastSizeRef.current = { width: offsetWidth, height: offsetHeight };

    try {
      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;
      onResize?.(cols, rows);
    } catch {
      // Ignore fit errors
    }
  }, [onResize]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a1a',
        selectionBackground: 'rgba(255, 255, 255, 0.2)',
        black: '#1a1a1a',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#e0e0e0',
        brightBlack: '#555555',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      onData?.(data);
    });

    // Mark as initialized and do initial fit after a short delay
    setTimeout(() => {
      isInitializedRef.current = true;
      try {
        fitAddon.fit();
        const { cols, rows } = terminal;
        onResize?.(cols, rows);
      } catch {
        // Ignore
      }
      onReady?.(terminal);
    }, 50);

    return () => {
      isInitializedRef.current = false;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onResize, onReady]);

  // Handle resize - observe the wrapper, not the terminal container
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(fit);
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fit);
    });

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [fit]);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full overflow-hidden bg-[#1a1a1a]"
    >
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ padding: '8px' }}
      />
    </div>
  );
}
