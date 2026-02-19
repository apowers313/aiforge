/**
 * PtyPool - Session pooling with orphan cleanup capabilities
 */
import { EventEmitter } from 'events';
import { access, constants } from 'node:fs/promises';
import { PtyManager, type PtyManagerOptions, type SpawnOptions } from './PtyManager.js';
import { PtyDaemonManager } from './PtyDaemonManager.js';
import type { PtySession } from './PtySession.js';
import type { PtyDaemonClient } from './PtyDaemonClient.js';
import type { Shell } from '@shared/types/index.js';
import type { ScrollbackStore } from '../../storage/stores/ScrollbackStore.js';

/**
 * Union type for PTY sessions (can be either direct PTY or daemon client)
 */
export type PtySessionLike = PtySession | PtyDaemonClient;

/**
 * ShellStore interface for orphan cleanup
 */
export interface ShellStoreInterface {
  getAll(): Promise<Shell[]>;
  update(id: string, updates: Partial<Pick<Shell, 'status' | 'pid' | 'socketPath'>>): Promise<Shell | null>;
}

/**
 * Check if a process with the given PID exists
 */
function processExists(pid: number): boolean {
  try {
    // Sending signal 0 doesn't actually send a signal,
    // but will throw if the process doesn't exist
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a socket file exists
 */
async function socketExists(socketPath: string): Promise<boolean> {
  try {
    await access(socketPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for PtyPool
 */
export interface PtyPoolOptions extends PtyManagerOptions {
  /** Use persistent daemon processes instead of direct PTY spawning */
  usePersistentDaemons?: boolean;
  /** Remote logger URL for daemon debugging */
  remoteLoggerUrl?: string;
}

/**
 * PtyPool wraps PtyManager with additional capabilities:
 * - Orphan cleanup (kill PTYs in database but process dead)
 * - Periodic cleanup task
 * - Graceful shutdown
 * - Optional persistent daemon mode
 */
export class PtyPool extends EventEmitter {
  private readonly _manager: PtyManager;
  private readonly _daemonManager: PtyDaemonManager | null;
  private readonly _usePersistentDaemons: boolean;
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: PtyPoolOptions = {}) {
    super();
    this._usePersistentDaemons = options.usePersistentDaemons ?? false;
    this._manager = new PtyManager(options);

    // Create daemon manager if persistent mode is enabled
    if (this._usePersistentDaemons) {
      const daemonOptions: { defaultShell?: string; scrollbackStore?: ScrollbackStore; remoteLoggerUrl?: string } = {};
      if (options.defaultShell) {
        daemonOptions.defaultShell = options.defaultShell;
      }
      if (options.scrollbackStore) {
        daemonOptions.scrollbackStore = options.scrollbackStore;
      }
      if (options.remoteLoggerUrl) {
        daemonOptions.remoteLoggerUrl = options.remoteLoggerUrl;
      }
      this._daemonManager = new PtyDaemonManager(daemonOptions);
    } else {
      this._daemonManager = null;
    }

    // Forward events from manager
    this._manager.on('session:spawned', (session: PtySession) => {
      this.emit('session:spawned', session);
    });

    this._manager.on('session:exited', (id: string, exitCode: number) => {
      this.emit('session:exited', id, exitCode);
    });

    this._manager.on('session:input', (id: string) => {
      this.emit('session:input', id);
    });

    this._manager.on('session:output', (id: string) => {
      this.emit('session:output', id);
    });

    // Forward events from daemon manager if enabled
    if (this._daemonManager) {
      this._daemonManager.on('session:spawned', (client: PtyDaemonClient) => {
        this.emit('session:spawned', client);
      });

      this._daemonManager.on('session:attached', (client: PtyDaemonClient) => {
        this.emit('session:attached', client);
      });

      this._daemonManager.on('session:exited', (id: string, exitCode: number) => {
        this.emit('session:exited', id, exitCode);
      });

      this._daemonManager.on('session:input', (id: string) => {
        this.emit('session:input', id);
      });

      this._daemonManager.on('session:output', (id: string) => {
        this.emit('session:output', id);
      });
    }
  }

  /**
   * Whether persistent daemon mode is enabled
   */
  get usePersistentDaemons(): boolean {
    return this._usePersistentDaemons;
  }

  /**
   * Get the scrollback store
   */
  get scrollbackStore(): ScrollbackStore | undefined {
    return this._manager.scrollbackStore;
  }

  /**
   * Spawn a new PTY session
   * In daemon mode, this spawns a persistent daemon process
   */
  spawn(shellId: string, options: SpawnOptions): PtySession {
    // Always use direct PTY for synchronous spawn
    // Daemon mode uses spawnAsync instead
    return this._manager.spawn(shellId, options);
  }

  /**
   * Spawn a new PTY session asynchronously (required for daemon mode)
   */
  async spawnAsync(shellId: string, options: SpawnOptions): Promise<PtySessionLike> {
    if (this._usePersistentDaemons && this._daemonManager) {
      return await this._daemonManager.spawn(shellId, options);
    }
    return this._manager.spawn(shellId, options);
  }

  /**
   * Attach to an existing daemon session (daemon mode only)
   * Returns the daemon client if the socket exists, null otherwise
   */
  async attach(shellId: string, cwd: string): Promise<PtyDaemonClient | null> {
    if (!this._usePersistentDaemons || !this._daemonManager) {
      return null;
    }

    try {
      return await this._daemonManager.attach(shellId, cwd);
    } catch {
      return null;
    }
  }

  /**
   * Check if a daemon socket exists for a shell (daemon mode only)
   */
  async hasDaemon(shellId: string): Promise<boolean> {
    if (!this._usePersistentDaemons || !this._daemonManager) {
      return false;
    }
    return this._daemonManager.has(shellId);
  }

  /**
   * Get a session by ID
   */
  get(shellId: string): PtySessionLike | undefined {
    // Check daemon manager first if in persistent mode
    if (this._usePersistentDaemons && this._daemonManager) {
      const daemonSession = this._daemonManager.get(shellId);
      if (daemonSession) return daemonSession;
    }
    return this._manager.get(shellId);
  }

  /**
   * Evict a session from the pool without killing the daemon.
   * The daemon process keeps running and can be re-attached later.
   * Use this when the pool entry is stale but the daemon may still be alive.
   */
  evict(shellId: string): void {
    if (this._usePersistentDaemons && this._daemonManager) {
      this._daemonManager.disconnect(shellId);
    }
    // Also check the direct manager (shouldn't be there in daemon mode, but be safe)
    this._manager.kill(shellId);
  }

  /**
   * Kill a specific session
   */
  kill(shellId: string): void {
    // Kill in both managers to ensure cleanup
    if (this._usePersistentDaemons && this._daemonManager) {
      void this._daemonManager.kill(shellId);
    }
    this._manager.kill(shellId);
  }

  /**
   * Get count of active sessions
   */
  count(): number {
    const managerCount = this._manager.count();
    const daemonCount = this._daemonManager?.count() ?? 0;
    return managerCount + daemonCount;
  }

  /**
   * List all sessions
   */
  list(): PtySessionLike[] {
    const managerSessions = this._manager.list();
    const daemonSessions = this._daemonManager?.list() ?? [];
    return [...managerSessions, ...daemonSessions];
  }

  /**
   * Get the underlying PtyManager (for accessing scrollback store)
   */
  get manager(): PtyManager {
    return this._manager;
  }

  /**
   * Load scrollback from disk for a shell (populates memory buffer for replay)
   */
  async loadScrollback(shellId: string): Promise<void> {
    const scrollbackStore = this._manager.scrollbackStore;
    if (scrollbackStore) {
      await scrollbackStore.load(shellId);
    }
  }

  /**
   * Clean up orphaned PTY sessions
   * Orphans are shells in the database with status 'active' but whose
   * process (PID) or daemon socket no longer exists
   */
  async cleanupOrphans(shellStore: ShellStoreInterface): Promise<void> {
    const shells = await shellStore.getAll();

    for (const shell of shells) {
      if (shell.status !== 'active') {
        continue;
      }

      // In daemon mode, check if socket exists
      if (shell.socketPath) {
        const exists = await socketExists(shell.socketPath);
        if (!exists) {
          await shellStore.update(shell.id, {
            status: 'inactive',
            pid: null,
            socketPath: null,
          });
        }
        continue;
      }

      // Legacy mode: If PID is null or process doesn't exist, mark as inactive
      if (shell.pid === null || !processExists(shell.pid)) {
        await shellStore.update(shell.id, {
          status: 'inactive',
          pid: null,
        });
      }
    }
  }

  /**
   * Reconnect to all daemon sessions that have socket paths
   * Call this on server startup to restore persistent sessions
   */
  async reconnectDaemons(shellStore: ShellStoreInterface): Promise<number> {
    if (!this._usePersistentDaemons || !this._daemonManager) {
      return 0;
    }

    const shells = await shellStore.getAll();
    let reconnectedCount = 0;

    for (const shell of shells) {
      if (shell.status !== 'active' || !shell.socketPath) {
        continue;
      }

      // Check if socket still exists
      const exists = await socketExists(shell.socketPath);
      if (!exists) {
        // Socket is gone, mark as inactive
        await shellStore.update(shell.id, {
          status: 'inactive',
          pid: null,
          socketPath: null,
        });
        continue;
      }

      // Try to reconnect
      try {
        await this._daemonManager.attach(shell.id, shell.cwd);
        reconnectedCount++;
      } catch (err) {
        console.error(`Failed to reconnect to daemon for shell ${shell.id}:`, err);
        // Mark as inactive since we can't reconnect
        await shellStore.update(shell.id, {
          status: 'inactive',
          pid: null,
          socketPath: null,
        });
      }
    }

    return reconnectedCount;
  }

  /**
   * Start periodic cleanup interval
   */
  startCleanupInterval(intervalMs: number, shellStore: ShellStoreInterface): void {
    this.stopCleanupInterval();

    this._cleanupInterval = setInterval(() => {
      void this.cleanupOrphans(shellStore);
    }, intervalMs);
  }

  /**
   * Stop periodic cleanup interval
   */
  stopCleanupInterval(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Gracefully shutdown all sessions
   * In daemon mode, disconnects without killing (daemons keep running)
   * In legacy mode, kills all sessions
   */
  shutdown(): void {
    this.stopCleanupInterval();

    // In daemon mode, just disconnect (don't kill - daemons survive)
    if (this._usePersistentDaemons && this._daemonManager) {
      this._daemonManager.disconnectAll();
    }

    // Always kill direct PTY sessions
    this._manager.killAll();
  }

  /**
   * Force shutdown - kills all sessions including daemons
   */
  async forceShutdown(): Promise<void> {
    this.stopCleanupInterval();

    if (this._daemonManager) {
      await this._daemonManager.killAll();
    }

    this._manager.killAll();
  }

  /**
   * Get the daemon manager (for advanced operations)
   */
  get daemonManager(): PtyDaemonManager | null {
    return this._daemonManager;
  }
}
