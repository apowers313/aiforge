/**
 * ShellService - Shell business logic
 */
import { randomUUID } from 'node:crypto';
import type { Shell, ShellType } from '@shared/types/index.js';
import type { ShellStore } from '../../storage/stores/ShellStore.js';
import type { ProjectStore } from '../../storage/stores/ProjectStore.js';
import { PtyPool, type ShellStoreInterface } from '../pty/index.js';
import { getSocketPath } from '../pty/daemon/protocol.js';

export interface ShellServiceOptions {
  shellStore: ShellStore;
  projectStore: ProjectStore;
  ptyPool?: PtyPool;
}

export class ShellService {
  private readonly shellStore: ShellStore;
  private readonly projectStore: ProjectStore;
  private readonly ptyPool: PtyPool | null;
  private readonly lastOutputTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastOutputDebounceMs = 1000; // Debounce lastOutputAt updates by 1 second

  constructor(options: ShellServiceOptions) {
    this.shellStore = options.shellStore;
    this.projectStore = options.projectStore;
    this.ptyPool = options.ptyPool ?? null;

    // Set up event handlers if ptyPool is provided
    if (this.ptyPool) {
      this.ptyPool.on('session:exited', (shellId: string, exitCode: number) => {
        void this._handleSessionExit(shellId, exitCode);
      });

      // Track lastActivityAt for AI shells (debounced to reduce disk writes)
      // Listen to both output and input activity
      this.ptyPool.on('session:activity', (shellId: string) => {
        void this._handleSessionActivity(shellId);
      });
    }
  }

  /**
   * Handle PTY session activity (update lastActivityAt for AI shells)
   */
  private async _handleSessionActivity(shellId: string): Promise<void> {
    // Check if shell is an AI shell (only track lastActivityAt for AI shells)
    const shell = await this.shellStore.getById(shellId);
    if (shell?.type !== 'ai') {
      return;
    }

    // Debounce the update to reduce disk writes
    const existingTimer = this.lastOutputTimers.get(shellId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.lastOutputTimers.delete(shellId);
      void this.shellStore.update(shellId, {
        lastActivityAt: new Date().toISOString(),
      });
    }, this.lastOutputDebounceMs);

    this.lastOutputTimers.set(shellId, timer);
  }

  /**
   * Handle PTY session exit
   */
  private async _handleSessionExit(shellId: string, _exitCode: number): Promise<void> {
    await this.shellStore.update(shellId, {
      status: 'inactive',
      pid: null,
    });
  }

  /**
   * Get all shells for a project
   */
  async getByProjectId(projectId: string): Promise<Shell[]> {
    return this.shellStore.getByProjectId(projectId);
  }

  /**
   * Get a shell by ID
   */
  async getById(id: string): Promise<Shell | null> {
    return this.shellStore.getById(id);
  }

  /**
   * Create a new shell for a project
   */
  async create(projectId: string, name?: string, type: ShellType = 'bash'): Promise<Shell> {
    // Verify project exists
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Auto-generate name if not provided
    let shellName = name;
    if (!shellName) {
      const shellNumber = await this.shellStore.getNextShellNumber();
      const prefix = type === 'ai' ? 'ai' : 'shell';
      shellName = `${prefix}-${String(shellNumber)}`;
    }

    const now = new Date().toISOString();
    const shell: Shell = {
      id: randomUUID(),
      projectId,
      name: shellName,
      cwd: project.path,
      status: 'inactive',
      type,
      pid: null,
      socketPath: null,
      lastActivityAt: null,
      done: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.shellStore.create(shell);
    return shell;
  }

  /**
   * Update a shell's properties
   */
  async update(id: string, updates: Partial<Pick<Shell, 'name' | 'status' | 'pid' | 'cwd' | 'lastActivityAt' | 'done' | 'socketPath'>>): Promise<Shell | null> {
    return this.shellStore.update(id, updates);
  }

  /**
   * Delete a shell
   */
  async delete(id: string): Promise<boolean> {
    // Kill the PTY session if running
    if (this.ptyPool) {
      this.ptyPool.kill(id);
    }
    return this.shellStore.delete(id);
  }

  /**
   * Start a shell (spawn PTY process)
   */
  async start(shellId: string): Promise<Shell> {
    if (!this.ptyPool) {
      throw new Error('PTY pool not configured');
    }

    const shell = await this.shellStore.getById(shellId);
    if (!shell) {
      throw new Error('Shell not found');
    }

    // Check if already running in memory
    if (this.ptyPool.get(shellId)) {
      return shell;
    }

    // In daemon mode, check if a daemon is already running we can reconnect to
    if (this.ptyPool.usePersistentDaemons && shell.socketPath) {
      const client = await this.ptyPool.attach(shellId, shell.cwd);
      if (client) {
        // Successfully reconnected to existing daemon
        return shell;
      }
      // Socket was stale, clear it and spawn new daemon
      await this.shellStore.update(shellId, { socketPath: null });
    }

    // Load scrollback from disk first (for replay on client attach)
    await this.ptyPool.loadScrollback(shellId);

    // Add restart separator to scrollback if there's existing content
    const scrollbackStore = this.ptyPool.manager.scrollbackStore;
    if (scrollbackStore) {
      const existingEntries = scrollbackStore.getFromMemory(shellId);
      if (existingEntries.length > 0) {
        scrollbackStore.append(shellId, 'output', '\r\n\r\n--- shell restarted ---\r\n\r\n');
      }
    }

    // Spawn PTY session (use async for daemon mode)
    if (this.ptyPool.usePersistentDaemons) {
      await this.ptyPool.spawnAsync(shellId, {
        cwd: shell.cwd,
      });

      // Update shell status with socket path
      const socketPath = getSocketPath(shellId);
      const updated = await this.shellStore.update(shellId, {
        status: 'active',
        pid: null, // Daemon mode doesn't track PID directly
        socketPath,
      });

      return updated ?? shell;
    }

    // Legacy mode: spawn directly
    const session = this.ptyPool.spawn(shellId, {
      cwd: shell.cwd,
    });

    // Update shell status
    const updated = await this.shellStore.update(shellId, {
      status: 'active',
      pid: session.pid,
    });

    return updated ?? shell;
  }

  /**
   * Stop a shell (kill PTY process)
   */
  async stop(shellId: string): Promise<Shell | null> {
    if (!this.ptyPool) {
      throw new Error('PTY pool not configured');
    }

    this.ptyPool.kill(shellId);

    return this.shellStore.update(shellId, {
      status: 'inactive',
      pid: null,
    });
  }

  /**
   * Get the PTY pool (for WebSocket handler access)
   */
  getPtyPool(): PtyPool | null {
    return this.ptyPool;
  }

  /**
   * Clean up orphaned sessions
   */
  async cleanupOrphans(): Promise<void> {
    if (this.ptyPool) {
      await this.ptyPool.cleanupOrphans(this.shellStore as unknown as ShellStoreInterface);
    }
  }

  /**
   * Reconnect to all persistent daemon sessions
   * Call this on server startup to restore sessions that survived restart
   */
  async reconnectDaemons(): Promise<number> {
    if (!this.ptyPool) {
      return 0;
    }
    return this.ptyPool.reconnectDaemons(this.shellStore as unknown as ShellStoreInterface);
  }

  /**
   * Check if persistent daemon mode is enabled
   */
  get usePersistentDaemons(): boolean {
    return this.ptyPool?.usePersistentDaemons ?? false;
  }

  /**
   * Shutdown all PTY sessions
   */
  shutdown(): void {
    if (this.ptyPool) {
      this.ptyPool.shutdown();
    }
  }
}
