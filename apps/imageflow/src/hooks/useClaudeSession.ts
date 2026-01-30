import { useState, useEffect, useCallback, useRef } from 'react';
import { claudeSocket } from '../services/claudeSocket';

interface UseClaudeSessionOptions {
  onOutput?: (data: string) => void;
  onExit?: (exitCode: number, signal?: number) => void;
  onError?: (message: string) => void;
}

interface UseClaudeSessionResult {
  isConnected: boolean;
  sessionId: string | null;
  connect: (projectPath: string, cols?: number, rows?: number, bypassPermissions?: boolean) => void;
  disconnect: () => void;
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

export function useClaudeSession(options: UseClaudeSessionOptions = {}): UseClaudeSessionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unsubscribe = claudeSocket.onMessage((message) => {
      switch (message.type) {
        case 'created':
          setSessionId(message.sessionId as string);
          setIsConnected(true);
          break;

        case 'output':
          if (message.data) {
            optionsRef.current.onOutput?.(message.data as string);
          }
          break;

        case 'exit':
          optionsRef.current.onExit?.(
            message.exitCode as number,
            message.signal as number | undefined
          );
          setIsConnected(false);
          setSessionId(null);
          break;

        case 'destroyed':
          setIsConnected(false);
          setSessionId(null);
          break;

        case 'error':
          optionsRef.current.onError?.(message.message as string);
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const connect = useCallback(async (projectPath: string, cols = 80, rows = 24, bypassPermissions = false) => {
    try {
      await claudeSocket.connect();
      claudeSocket.send({
        type: 'create',
        projectPath,
        cols,
        rows,
        bypassPermissions,
      });
    } catch (error) {
      optionsRef.current.onError?.((error as Error).message);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sessionId) {
      claudeSocket.send({
        type: 'destroy',
        sessionId,
      });
    }
  }, [sessionId]);

  const sendInput = useCallback((data: string) => {
    if (sessionId) {
      claudeSocket.send({
        type: 'input',
        sessionId,
        data,
      });
    }
  }, [sessionId]);

  const resize = useCallback((cols: number, rows: number) => {
    if (sessionId) {
      claudeSocket.send({
        type: 'resize',
        sessionId,
        cols,
        rows,
      });
    }
  }, [sessionId]);

  return {
    isConnected,
    sessionId,
    connect,
    disconnect,
    sendInput,
    resize,
  };
}
