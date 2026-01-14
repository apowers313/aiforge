/**
 * PtyDaemonManager - Manages PTY daemon processes for persistent sessions
 *
 * Unlike PtyManager which spawns PTYs directly, this manager spawns detached
 * daemon processes that survive server restarts.
 */
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PtyDaemonClient } from './PtyDaemonClient.js';
import { type DaemonConfig, getSocketPath } from './daemon/protocol.js';
import type { ScrollbackStore } from '../../storage/stores/ScrollbackStore.js';

/**
 * Options for spawning a PTY daemon
 */
export interface DaemonSpawnOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  shell?: string;
}

/**
 * Options for creating a PtyDaemonManager
 */
export interface PtyDaemonManagerOptions {
  defaultShell?: string;
  scrollbackStore?: ScrollbackStore;
}

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * PtyDaemonManager spawns persistent daemon processes for PTY sessions
 */
export class PtyDaemonManager extends EventEmitter {
  private readonly _sessions = new Map<string, PtyDaemonClient>();
  private readonly _defaultShell: string;
  private readonly _scrollbackStore: ScrollbackStore | undefined;

  constructor(options: PtyDaemonManagerOptions = {}) {
    super();
    this._defaultShell = options.defaultShell ?? process.env.SHELL ?? '/bin/bash';
    this._scrollbackStore = options.scrollbackStore;
  }

  /**
   * Get the path to the daemon script and the command to run it
   * Returns [executable, scriptPath] - in dev mode uses tsx, in prod uses node
   */
  private _getDaemonCommand(): [string, string] {
    // Check if we're in development mode (TypeScript source exists)
    const tsPath = join(__dirname, 'daemon', 'pty-daemon.ts');
    const jsPath = join(__dirname, 'daemon', 'pty-daemon.js');

    if (existsSync(tsPath)) {
      // Development mode - use tsx to run TypeScript
      return ['npx', tsPath];
    }

    // Production mode - use node to run compiled JavaScript
    return [process.execPath, jsPath];
  }

  /**
   * Spawn a new PTY daemon and connect to it
   */
  async spawn(shellId: string, options: DaemonSpawnOptions): Promise<PtyDaemonClient> {
    if (this._sessions.has(shellId)) {
      throw new Error(`Session ${shellId} already exists`);
    }

    const socketPath = getSocketPath(shellId);

    // Check if daemon is already running (socket exists)
    try {
      await access(socketPath, constants.F_OK);
      // Socket exists, try to connect to existing daemon
      return await this.attach(shellId, options.cwd);
    } catch {
      // Socket doesn't exist, spawn new daemon
    }

    const shell = options.shell ?? this._defaultShell;
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;

    // Build daemon config
    const config: DaemonConfig = {
      shellId,
      cwd: options.cwd,
      shell,
      cols,
      rows,
      scrollbackDir: this._scrollbackStore?.directory ?? '/tmp/ai-ide-scrollback',
    };

    // Spawn daemon process
    const [executable, daemonScript] = this._getDaemonCommand();

    // Build command arguments based on executable type
    const args =
      executable === 'npx'
        ? ['tsx', daemonScript, JSON.stringify(config)]
        : [daemonScript, JSON.stringify(config)];

    // Use appropriate executable to run the daemon script
    const child: ChildProcess = spawn(executable, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...options.env,
      },
    });

    // Unref so parent can exit without waiting for daemon
    child.unref();

    // Wait for daemon to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Daemon startup timeout'));
      }, 10000);

      let output = '';

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        if (output.includes('PTY daemon ready:')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.error('Daemon stderr:', data.toString());
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== null && code !== 0) {
          reject(new Error(`Daemon exited with code ${String(code)}`));
        }
      });
    });

    // Connect to the daemon
    const client = new PtyDaemonClient(shellId, options.cwd, cols, rows);
    await client.connect();

    // Track the session
    this._sessions.set(shellId, client);
    this._setupClientEvents(client, shellId);

    this.emit('session:spawned', client);

    return client;
  }

  /**
   * Attach to an existing daemon
   */
  async attach(shellId: string, cwd: string): Promise<PtyDaemonClient> {
    const existingSession = this._sessions.get(shellId);
    if (existingSession) {
      return existingSession;
    }

    const socketPath = getSocketPath(shellId);

    // Verify socket exists
    await access(socketPath, constants.F_OK);

    // Create client and connect
    const client = new PtyDaemonClient(shellId, cwd);
    await client.connect();

    // Track the session
    this._sessions.set(shellId, client);
    this._setupClientEvents(client, shellId);

    this.emit('session:attached', client);

    return client;
  }

  /**
   * Set up event handlers for a client
   */
  private _setupClientEvents(client: PtyDaemonClient, shellId: string): void {
    // Handle data events - write to scrollback and emit activity
    client.on('data', (data: string) => {
      // Write to scrollback store for replay
      if (this._scrollbackStore) {
        this._scrollbackStore.append(shellId, 'output', data);
      }
      this.emit('session:activity', shellId);
    });
    client.on('input', (data: string) => {
      // Write input to scrollback store
      if (this._scrollbackStore) {
        this._scrollbackStore.append(shellId, 'input', data);
      }
      this.emit('session:activity', shellId);
    });

    // Handle exit
    client.on('exit', (event: { exitCode: number }) => {
      this._sessions.delete(shellId);
      client.dispose();
      this.emit('session:exited', shellId, event.exitCode);
    });
  }

  /**
   * Check if a daemon socket exists for a shell
   */
  async has(shellId: string): Promise<boolean> {
    // Check in-memory first
    if (this._sessions.has(shellId)) {
      return true;
    }

    // Check if socket file exists
    const socketPath = getSocketPath(shellId);
    try {
      await access(socketPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a session by ID (from memory only)
   */
  get(shellId: string): PtyDaemonClient | undefined {
    return this._sessions.get(shellId);
  }

  /**
   * Kill a session by ID
   */
  async kill(shellId: string): Promise<void> {
    const session = this._sessions.get(shellId);
    if (session) {
      session.kill();
      session.dispose();
      this._sessions.delete(shellId);
    }

    // Also remove the socket file if it exists
    const socketPath = getSocketPath(shellId);
    try {
      await unlink(socketPath);
    } catch {
      // Socket might not exist
    }
  }

  /**
   * Kill all sessions
   */
  async killAll(): Promise<void> {
    const ids = Array.from(this._sessions.keys());
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  /**
   * Disconnect from all sessions without killing daemons
   * Use this during server shutdown to keep daemons running
   */
  disconnectAll(): void {
    for (const session of this._sessions.values()) {
      session.dispose();
    }
    this._sessions.clear();
  }

  /**
   * Get the count of connected sessions
   */
  count(): number {
    return this._sessions.size;
  }

  /**
   * List all connected sessions
   */
  list(): PtyDaemonClient[] {
    return Array.from(this._sessions.values());
  }

  /**
   * Find orphaned daemon sockets (sockets without database records)
   * Returns socket paths that should be cleaned up
   */
  async findOrphanedSockets(validShellIds: string[]): Promise<string[]> {
    const orphans: string[] = [];
    const validSet = new Set(validShellIds);

    try {
      const tmpFiles = await readdir('/tmp');
      for (const file of tmpFiles) {
        if (file.startsWith('ai-ide-pty-') && file.endsWith('.sock')) {
          // Extract shellId from filename
          const shellId = file.replace('ai-ide-pty-', '').replace('.sock', '');
          if (!validSet.has(shellId)) {
            orphans.push(join('/tmp', file));
          }
        }
      }
    } catch {
      // Can't read /tmp, return empty list
    }

    return orphans;
  }

  /**
   * Clean up orphaned sockets
   */
  async cleanupOrphanedSockets(validShellIds: string[]): Promise<void> {
    const orphans = await this.findOrphanedSockets(validShellIds);
    await Promise.all(
      orphans.map(async (socketPath) => {
        try {
          await unlink(socketPath);
        } catch {
          // Ignore errors
        }
      }),
    );
  }

  /**
   * Get the scrollback store (for replay on attach)
   */
  get scrollbackStore(): ScrollbackStore | undefined {
    return this._scrollbackStore;
  }
}
