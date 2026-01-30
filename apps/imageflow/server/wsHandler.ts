import { WebSocket } from 'ws';
import { sessionManager } from './sessionManager';
import { ClaudeSession } from './claudeSession';

interface Message {
  type: string;
  sessionId?: string;
  projectPath?: string;
  data?: string;
  cols?: number;
  rows?: number;
  bypassPermissions?: boolean;
}

export function handleWebSocket(ws: WebSocket): void {
  let currentSessionId: string | null = null;
  let currentSession: ClaudeSession | null = null;

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  };

  ws.on('message', (rawMessage) => {
    let message: Message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      send('error', { message: 'Invalid JSON' });
      return;
    }

    switch (message.type) {
      case 'create': {
        if (!message.projectPath) {
          send('error', { message: 'projectPath is required' });
          return;
        }

        // Clean up existing session if any
        if (currentSessionId && currentSession) {
          currentSession.removeAllListeners();
          sessionManager.destroySession(currentSessionId);
        }

        const sessionId = sessionManager.createSession({
          projectPath: message.projectPath,
          cols: message.cols,
          rows: message.rows,
          bypassPermissions: message.bypassPermissions,
        });

        currentSessionId = sessionId;
        currentSession = sessionManager.getSession(sessionId)!;

        currentSession.on('data', (data: string) => {
          send('output', { sessionId, data });
        });

        currentSession.on('exit', ({ exitCode, signal }) => {
          send('exit', { sessionId, exitCode, signal });
          currentSessionId = null;
          currentSession = null;
        });

        currentSession.start();
        send('created', { sessionId });
        break;
      }

      case 'input': {
        if (!message.sessionId || !message.data) {
          send('error', { message: 'sessionId and data are required' });
          return;
        }

        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          send('error', { message: 'Session not found' });
          return;
        }

        session.write(message.data);
        break;
      }

      case 'resize': {
        if (!message.sessionId || !message.cols || !message.rows) {
          send('error', { message: 'sessionId, cols, and rows are required' });
          return;
        }

        const session = sessionManager.getSession(message.sessionId);
        if (!session) {
          send('error', { message: 'Session not found' });
          return;
        }

        session.resize(message.cols, message.rows);
        break;
      }

      case 'destroy': {
        if (!message.sessionId) {
          send('error', { message: 'sessionId is required' });
          return;
        }

        const destroyed = sessionManager.destroySession(message.sessionId);
        if (destroyed) {
          send('destroyed', { sessionId: message.sessionId });
          if (message.sessionId === currentSessionId) {
            currentSessionId = null;
            currentSession = null;
          }
        } else {
          send('error', { message: 'Session not found' });
        }
        break;
      }

      case 'list': {
        const sessions = sessionManager.getAllSessions();
        send('sessions', { sessions });
        break;
      }

      default:
        send('error', { message: `Unknown message type: ${message.type}` });
    }
  });

  ws.on('close', () => {
    // Clean up session when connection closes
    if (currentSessionId) {
      sessionManager.destroySession(currentSessionId);
    }
  });

  ws.on('error', () => {
    if (currentSessionId) {
      sessionManager.destroySession(currentSessionId);
    }
  });
}
