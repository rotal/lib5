import * as pty from 'node-pty';
import { EventEmitter } from 'events';

export interface ClaudeSessionOptions {
  projectPath: string;
  cols?: number;
  rows?: number;
  bypassPermissions?: boolean;
}

export class ClaudeSession extends EventEmitter {
  private pty: pty.IPty | null = null;
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
    if (this.pty) {
      return;
    }

    const claudeCmd = this.bypassPermissions
      ? 'claude --dangerously-skip-permissions'
      : 'claude';

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const args = process.platform === 'win32'
      ? ['/c', claudeCmd]
      : ['-c', claudeCmd];

    this.pty = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: this.projectPath,
      env: process.env as Record<string, string>,
    });

    this.pty.onData((data) => {
      this.emit('data', data);
    });

    this.pty.onExit(({ exitCode, signal }) => {
      this.emit('exit', { exitCode, signal });
      this.pty = null;
    });
  }

  write(data: string): void {
    if (this.pty) {
      this.pty.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.pty) {
      this.pty.resize(cols, rows);
    }
  }

  kill(): void {
    if (this.pty) {
      this.pty.kill();
      this.pty = null;
    }
  }

  isRunning(): boolean {
    return this.pty !== null;
  }

  getProjectPath(): string {
    return this.projectPath;
  }
}
