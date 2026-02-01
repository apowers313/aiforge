/**
 * ShellSessionManager - Single source of truth for shell session state
 *
 * This manager orchestrates all shell session operations, including:
 * - Opening sessions (spawn/reconnect daemon, load scrollback)
 * - Closing sessions (kill daemon, update status)
 * - Querying session state
 * - Periodic reconciliation to fix state inconsistencies
 */
import { EventEmitter } from 'events';
import { access, constants } from 'node:fs/promises';
import type { Shell, SessionCloseReason } from '@shared/types/index.js';
import type { ShellStore } from '../../storage/stores/ShellStore.js';
import type { PtyPool, PtySessionLike } from '../pty/PtyPool.js';
import { SessionError } from './SessionError.js';
import { getSocketPath } from '../pty/daemon/protocol.js';
import { logger } from '../../utils/logger.js';

/**
 * Default terminal dimensions
 */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Session state as returned by getSessionState
 */
export interface SessionState {
  status: 'open' | 'closed';
  shell: Shell;
}

/**
 * Result of opening a session
 */
export interface OpenSessionResult {
  shell: Shell;
  scrollback: string;
  cols: number;
  rows: number;
}

/**
 * Session opened event data
 */
export interface SessionOpenedEvent {
  shellId: string;
  shell: Shell;
  scrollback: string;
  cols: number;
  rows: number;
}

/**
 * Session closed event data
 */
export interface SessionClosedEvent {
  shellId: string;
  reason: SessionCloseReason;
}

/**
 * Options for creating ShellSessionManager
 */
export interface ShellSessionManagerOptions {
  ptyPool: PtyPool;
  shellStore: ShellStore;
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
 * Check if a process with the given PID exists
 */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * ShellSessionManager is the single source of truth for shell session state
 */
export class ShellSessionManager extends EventEmitter {
  private readonly _ptyPool: PtyPool;
  private readonly _shellStore: ShellStore;
  private _reconciliationInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: ShellSessionManagerOptions) {
    super();
    this._ptyPool = options.ptyPool;
    this._shellStore = options.shellStore;

    // Listen for session exit events from ptyPool
    this._ptyPool.on('session:exited', (shellId: string, _exitCode: number) => {
      void this._handleSessionExited(shellId);
    });
  }

  /**
   * Handle session exit events from ptyPool
   */
  private async _handleSessionExited(shellId: string): Promise<void> {
    logger.debug({ shellId }, 'Session exited, updating status');

    await this._shellStore.update(shellId, {
      status: 'inactive',
      pid: null,
    });

    this.emit('session:closed', {
      shellId,
      reason: 'daemon_exited',
    } satisfies SessionClosedEvent);
  }

  /**
   * Open a session for a shell
   *
   * This is an atomic operation that:
   * 1. Verifies the shell exists
   * 2. Spawns/reconnects to daemon if needed
   * 3. Loads scrollback
   * 4. Updates shell status
   */
  async openSession(shellId: string): Promise<OpenSessionResult> {
    logger.debug({ shellId }, 'Opening session');

    // 1. Get the shell from store
    const shell = await this._shellStore.getById(shellId);
    if (!shell) {
      throw SessionError.shellNotFound(shellId);
    }

    // 2. Check if session is already open in the pool
    let session = this._ptyPool.get(shellId);

    if (!session) {
      // Try to spawn/reconnect
      try {
        session = await this._spawnOrReconnect(shell);
      } catch (err) {
        // Handle race condition: session may have been created by concurrent request
        session = this._ptyPool.get(shellId);
        if (!session) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          throw SessionError.daemonSpawnFailed(shellId, message);
        }
        // Session exists now (created by concurrent request), continue
      }
    }

    // 3. Load scrollback
    const scrollback = await this._loadScrollback(shellId);

    // 4. Update shell status to active
    const updatedShell = await this._shellStore.update(shellId, {
      status: 'active',
    });

    const result: OpenSessionResult = {
      shell: updatedShell ?? shell,
      scrollback,
      cols: this._getSessionCols(session),
      rows: this._getSessionRows(session),
    };

    // Emit event
    this.emit('session:opened', {
      shellId,
      shell: result.shell,
      scrollback: result.scrollback,
      cols: result.cols,
      rows: result.rows,
    } satisfies SessionOpenedEvent);

    logger.debug({ shellId }, 'Session opened successfully');

    return result;
  }

  /**
   * Close a session for a shell
   */
  async closeSession(shellId: string, reason: SessionCloseReason = 'requested'): Promise<void> {
    logger.debug({ shellId, reason }, 'Closing session');

    // Kill the session if it exists
    this._ptyPool.kill(shellId);

    // Update shell status
    await this._shellStore.update(shellId, {
      status: 'inactive',
      pid: null,
    });

    // Emit event
    this.emit('session:closed', {
      shellId,
      reason,
    } satisfies SessionClosedEvent);

    logger.debug({ shellId }, 'Session closed');
  }

  /**
   * Get the current state of a session
   */
  async getSessionState(shellId: string): Promise<SessionState | null> {
    const shell = await this._shellStore.getById(shellId);
    if (!shell) {
      return null;
    }

    const session = this._ptyPool.get(shellId);
    const isOpen = session !== undefined && shell.status === 'active';

    return {
      status: isOpen ? 'open' : 'closed',
      shell,
    };
  }

  /**
   * Get a session from the pool
   */
  getSession(shellId: string): PtySessionLike | undefined {
    return this._ptyPool.get(shellId);
  }

  /**
   * Reconcile state between store, pool, and filesystem
   *
   * This fixes inconsistencies such as:
   * - Shell marked active but daemon is dead
   * - Orphaned daemon sockets with no corresponding shell
   * - Session in pool but not in store
   */
  async reconcile(): Promise<void> {
    logger.debug('Running reconciliation');

    const shells = await this._shellStore.getAll();

    for (const shell of shells) {
      if (shell.status !== 'active') {
        continue;
      }

      const session = this._ptyPool.get(shell.id);

      if (session) {
        // Session is in pool, all good
        continue;
      }

      // Shell is marked active but no session in pool
      // Check if we can reconnect to an existing daemon
      if (this._ptyPool.usePersistentDaemons && shell.socketPath) {
        const exists = await socketExists(shell.socketPath);
        if (exists) {
          // Try to reconnect
          try {
            await this._ptyPool.attach(shell.id, shell.cwd);
            logger.info({ shellId: shell.id }, 'Reconnected to daemon during reconciliation');
            continue;
          } catch (err) {
            logger.warn({ shellId: shell.id, err }, 'Failed to reconnect to daemon');
          }
        }
      }

      // Check legacy PID mode
      if (shell.pid !== null && processExists(shell.pid)) {
        // Process exists but not in pool - this shouldn't happen normally
        logger.warn({ shellId: shell.id, pid: shell.pid }, 'Shell has running process but not in pool');
        continue;
      }

      // Mark shell as inactive
      logger.info({ shellId: shell.id }, 'Marking orphaned shell as inactive');
      await this._shellStore.update(shell.id, {
        status: 'inactive',
        pid: null,
        socketPath: null,
      });
    }

    // Clean up orphaned sockets (sockets with no corresponding shell)
    if (this._ptyPool.daemonManager) {
      const validShellIds = shells.map((s) => s.id);
      await this._ptyPool.daemonManager.cleanupOrphanedSockets(validShellIds);
    }

    logger.debug('Reconciliation complete');
  }

  /**
   * Start the periodic reconciliation loop
   */
  startReconciliationLoop(intervalMs: number): void {
    this.stopReconciliationLoop();

    this._reconciliationInterval = setInterval(() => {
      void this.reconcile();
    }, intervalMs);

    logger.info({ intervalMs }, 'Started reconciliation loop');
  }

  /**
   * Stop the periodic reconciliation loop
   */
  stopReconciliationLoop(): void {
    if (this._reconciliationInterval) {
      clearInterval(this._reconciliationInterval);
      this._reconciliationInterval = null;
      logger.debug('Stopped reconciliation loop');
    }
  }

  /**
   * Shutdown the manager
   */
  shutdown(): void {
    this.stopReconciliationLoop();
    this.removeAllListeners();
  }

  /**
   * Spawn or reconnect to a daemon for a shell
   */
  private async _spawnOrReconnect(shell: Shell): Promise<PtySessionLike> {
    // In daemon mode, try to attach first if socket exists
    if (this._ptyPool.usePersistentDaemons && shell.socketPath) {
      const exists = await socketExists(shell.socketPath);
      if (exists) {
        try {
          const client = await this._ptyPool.attach(shell.id, shell.cwd);
          if (client) {
            return client;
          }
        } catch (attachErr) {
          // Check if this is a stale socket (ECONNREFUSED means no daemon listening)
          const isStaleSocket =
            attachErr instanceof Error &&
            'code' in attachErr &&
            (attachErr as NodeJS.ErrnoException).code === 'ECONNREFUSED';

          if (isStaleSocket) {
            logger.warn({ shellId: shell.id, socketPath: shell.socketPath },
              'Detected stale socket during attach, will spawn new daemon');
          } else {
            // Other error (timeout, permission, etc.) - propagate it
            throw attachErr;
          }
        }
      }
      // Socket was stale or didn't exist, clear it from shell record
      await this._shellStore.update(shell.id, { socketPath: null });
    }

    // Load scrollback before spawning (for replay on attach)
    await this._ptyPool.loadScrollback(shell.id);

    // Add separator to scrollback if shell has previous output
    const scrollbackStore = this._ptyPool.scrollbackStore;
    if (scrollbackStore) {
      const existingEntries = scrollbackStore.getFromMemory(shell.id);
      if (existingEntries.length > 0) {
        const timestamp = new Date().toLocaleString();
        scrollbackStore.append(shell.id, 'output', `\r\n\r\n--- shell restarted ${timestamp} ---\r\n\r\n`);
      }
    }

    // Spawn new session
    const session = await this._ptyPool.spawnAsync(shell.id, {
      cwd: shell.cwd,
    });

    // Update socket path if in daemon mode
    if (this._ptyPool.usePersistentDaemons) {
      const socketPath = getSocketPath(shell.id);
      await this._shellStore.update(shell.id, { socketPath });
    }

    return session;
  }

  /**
   * Load scrollback for a shell
   */
  private async _loadScrollback(shellId: string): Promise<string> {
    const scrollbackStore = this._ptyPool.scrollbackStore;
    if (!scrollbackStore) {
      return '';
    }

    // Try memory first
    let entries = scrollbackStore.getFromMemory(shellId);
    if (entries.length === 0) {
      // Load from disk
      entries = await scrollbackStore.load(shellId);
    }

    // Concatenate output entries
    return entries
      .filter((e) => e.type === 'output')
      .map((e) => e.data)
      .join('');
  }

  /**
   * Get columns from a session (with fallback)
   */
  private _getSessionCols(session: PtySessionLike): number {
    if ('cols' in session && typeof session.cols === 'number') {
      return session.cols;
    }
    return DEFAULT_COLS;
  }

  /**
   * Get rows from a session (with fallback)
   */
  private _getSessionRows(session: PtySessionLike): number {
    if ('rows' in session && typeof session.rows === 'number') {
      return session.rows;
    }
    return DEFAULT_ROWS;
  }
}
