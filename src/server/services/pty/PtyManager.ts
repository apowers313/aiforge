/**
 * PtyManager - Manages PTY session lifecycle
 */
import { EventEmitter } from 'events';
import { spawn as nodePtySpawn } from '@homebridge/node-pty-prebuilt-multiarch';
import type { IPty, IPtyForkOptions } from '@homebridge/node-pty-prebuilt-multiarch';
import { PtySession } from './PtySession.js';
import type { ScrollbackStore } from '../../storage/stores/ScrollbackStore.js';

/**
 * Type for PTY factory function
 */
export type PtyFactory = (file: string, args: string[], options: IPtyForkOptions) => IPty;

/**
 * Options for spawning a PTY session
 */
export interface SpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  shell?: string;
}

/**
 * Options for creating a PtyManager
 */
export interface PtyManagerOptions {
  ptyFactory?: PtyFactory;
  defaultShell?: string;
  scrollbackStore?: ScrollbackStore;
}

/**
 * PtyManager manages the lifecycle of PTY sessions
 */
export class PtyManager extends EventEmitter {
  private readonly _sessions = new Map<string, PtySession>();
  private readonly _ptyFactory: PtyFactory;
  private readonly _defaultShell: string;
  private readonly _scrollbackStore: ScrollbackStore | undefined;

  constructor(options: PtyManagerOptions = {}) {
    super();
    this._ptyFactory = options.ptyFactory ?? nodePtySpawn;
    this._defaultShell = options.defaultShell ?? process.env.SHELL ?? '/bin/bash';
    this._scrollbackStore = options.scrollbackStore;
  }

  /**
   * Spawn a new PTY session
   */
  spawn(shellId: string, options: SpawnOptions): PtySession {
    if (this._sessions.has(shellId)) {
      throw new Error(`Session ${shellId} already exists`);
    }

    const shell = options.shell ?? this._defaultShell;
    const ptyOptions: IPtyForkOptions = {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      } as Record<string, string>,
    };

    const pty = this._ptyFactory(shell, [], ptyOptions);
    const session = new PtySession(shellId, pty, options.cwd, {
      scrollbackStore: this._scrollbackStore,
    });

    // Track the session
    this._sessions.set(shellId, session);

    // Handle session activity (for tracking lastActivityAt on AI shells)
    // Emit separate events for input and output so ShellService can distinguish them
    session.on('data', () => {
      this.emit('session:output', shellId);
    });
    session.on('input', () => {
      this.emit('session:input', shellId);
    });

    // Handle session exit
    session.on('exit', (event: { exitCode: number }) => {
      this._sessions.delete(shellId);
      session.dispose();
      this.emit('session:exited', shellId, event.exitCode);
    });

    this.emit('session:spawned', session);

    return session;
  }

  /**
   * Get a session by ID
   */
  get(shellId: string): PtySession | undefined {
    return this._sessions.get(shellId);
  }

  /**
   * Kill a session by ID
   */
  kill(shellId: string): void {
    const session = this._sessions.get(shellId);
    if (!session) {
      return;
    }

    session.kill();
    this._sessions.delete(shellId);
    session.dispose();
  }

  /**
   * Kill all sessions
   */
  killAll(): void {
    for (const id of Array.from(this._sessions.keys())) {
      this.kill(id);
    }
  }

  /**
   * Get the count of active sessions
   */
  count(): number {
    return this._sessions.size;
  }

  /**
   * List all active sessions
   */
  list(): PtySession[] {
    return Array.from(this._sessions.values());
  }

  /**
   * Get the scrollback store (for replay on attach)
   */
  get scrollbackStore(): ScrollbackStore | undefined {
    return this._scrollbackStore;
  }
}
