import { ClaudeSession, ClaudeSessionOptions } from './claudeSession';
import { v4 as uuidv4 } from 'uuid';

export interface SessionInfo {
  id: string;
  projectPath: string;
  createdAt: Date;
}

export class SessionManager {
  private sessions: Map<string, ClaudeSession> = new Map();
  private sessionInfo: Map<string, SessionInfo> = new Map();

  createSession(options: ClaudeSessionOptions): string {
    const id = uuidv4();
    const session = new ClaudeSession(options);

    this.sessions.set(id, session);
    this.sessionInfo.set(id, {
      id,
      projectPath: options.projectPath,
      createdAt: new Date(),
    });

    session.on('exit', () => {
      this.sessions.delete(id);
      this.sessionInfo.delete(id);
    });

    return id;
  }

  getSession(id: string): ClaudeSession | undefined {
    return this.sessions.get(id);
  }

  getSessionInfo(id: string): SessionInfo | undefined {
    return this.sessionInfo.get(id);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessionInfo.values());
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
      this.sessionInfo.delete(id);
      return true;
    }
    return false;
  }

  destroyAllSessions(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
    this.sessionInfo.clear();
  }
}

export const sessionManager = new SessionManager();
