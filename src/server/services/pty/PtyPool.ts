/**
 * PtyPool - Session pooling with orphan cleanup capabilities
 */
import { EventEmitter } from 'events';
import { PtyManager, type PtyManagerOptions, type SpawnOptions } from './PtyManager.js';
import type { PtySession } from './PtySession.js';
import type { Shell } from '@shared/types/index.js';

/**
 * ShellStore interface for orphan cleanup
 */
export interface ShellStoreInterface {
  getAll(): Promise<Shell[]>;
  update(id: string, updates: Partial<Pick<Shell, 'status' | 'pid'>>): Promise<Shell | null>;
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
 * PtyPool wraps PtyManager with additional capabilities:
 * - Orphan cleanup (kill PTYs in database but process dead)
 * - Periodic cleanup task
 * - Graceful shutdown
 */
export class PtyPool extends EventEmitter {
  private readonly _manager: PtyManager;
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: PtyManagerOptions = {}) {
    super();
    this._manager = new PtyManager(options);

    // Forward events from manager
    this._manager.on('session:spawned', (session: PtySession) => {
      this.emit('session:spawned', session);
    });

    this._manager.on('session:exited', (id: string, exitCode: number) => {
      this.emit('session:exited', id, exitCode);
    });
  }

  /**
   * Spawn a new PTY session
   */
  spawn(shellId: string, options: SpawnOptions): PtySession {
    return this._manager.spawn(shellId, options);
  }

  /**
   * Get a session by ID
   */
  get(shellId: string): PtySession | undefined {
    return this._manager.get(shellId);
  }

  /**
   * Kill a specific session
   */
  kill(shellId: string): void {
    this._manager.kill(shellId);
  }

  /**
   * Get count of active sessions
   */
  count(): number {
    return this._manager.count();
  }

  /**
   * List all sessions
   */
  list(): PtySession[] {
    return this._manager.list();
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
   * process (PID) no longer exists
   */
  async cleanupOrphans(shellStore: ShellStoreInterface): Promise<void> {
    const shells = await shellStore.getAll();

    for (const shell of shells) {
      if (shell.status !== 'active') {
        continue;
      }

      // If PID is null or process doesn't exist, mark as inactive
      if (shell.pid === null || !processExists(shell.pid)) {
        await shellStore.update(shell.id, {
          status: 'inactive',
          pid: null,
        });
      }
    }
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
   */
  shutdown(): void {
    this.stopCleanupInterval();
    this._manager.killAll();
  }

}
