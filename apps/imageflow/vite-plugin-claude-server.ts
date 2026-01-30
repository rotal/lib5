import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface ClaudeSessionOptions {
  projectPath: string;
  cols?: number;
  rows?: number;
  bypassPermissions?: boolean;
}

class ClaudeSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private projectPath: string;
  private cols: number;
  private rows: number;
  private bypassPermissions: boolean;

  constructor(options: ClaudeSessionOptions) {
    super();
    this.projectPath = options.projectPath;
    this.cols = options.cols ?? 80;
    this.rows = options.rows ?? 24;
    this.bypassPermissions = options.bypassPermissions ?? false;
  }

  start(): void {
    if (this.ptyProcess) return;

    const claudeCmd = this.bypassPermissions
      ? 'claude --dangerously-skip-permissions'
      : 'claude';

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const args = process.platform === 'win32'
      ? ['/c', claudeCmd]
      : ['-c', claudeCmd];

    this.ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: this.projectPath,
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      this.emit('data', data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', { exitCode, signal });
      this.ptyProcess = null;
    });
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.ptyProcess?.resize(cols, rows);
  }

  kill(): void {
    this.ptyProcess?.kill();
    this.ptyProcess = null;
  }
}

class SessionManager {
  private sessions = new Map<string, ClaudeSession>();

  createSession(options: ClaudeSessionOptions): string {
    const id = uuidv4();
    const session = new ClaudeSession(options);
    this.sessions.set(id, session);
    session.on('exit', () => this.sessions.delete(id));
    return id;
  }

  getSession(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
  }
}

function handleWebSocket(ws: WebSocket, sessionManager: SessionManager): void {
  let currentSessionId: string | null = null;
  let currentSession: ClaudeSession | null = null;

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  };

  ws.on('message', (rawMessage) => {
    let message: any;
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
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          session.write(message.data);
        }
        break;
      }

      case 'resize': {
        const session = sessionManager.getSession(message.sessionId);
        if (session) {
          session.resize(message.cols, message.rows);
        }
        break;
      }

      case 'destroy': {
        if (message.sessionId) {
          sessionManager.destroySession(message.sessionId);
          send('destroyed', { sessionId: message.sessionId });
          if (message.sessionId === currentSessionId) {
            currentSessionId = null;
            currentSession = null;
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentSessionId) {
      sessionManager.destroySession(currentSessionId);
    }
  });
}

export function claudeServerPlugin(): Plugin {
  let wss: WebSocketServer | null = null;
  const sessionManager = new SessionManager();

  return {
    name: 'claude-server',
    configureServer(server: ViteDevServer) {
      // Create WebSocket server with noServer to avoid conflicting with Vite's HMR
      wss = new WebSocketServer({ noServer: true });

      wss.on('connection', (ws) => {
        console.log('[Claude Server] New WebSocket connection');
        handleWebSocket(ws, sessionManager);
      });

      // Handle upgrade requests only for /ws/claude path
      server.httpServer!.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;

        if (pathname === '/ws/claude') {
          wss!.handleUpgrade(request, socket, head, (ws) => {
            wss!.emit('connection', ws, request);
          });
        }
        // Let Vite handle other WebSocket connections (HMR)
      });

      console.log('[Claude Server] WebSocket server started on /ws/claude');
    },
    buildEnd() {
      sessionManager.destroyAll();
      wss?.close();
    },
  };
}
