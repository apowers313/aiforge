/**
 * ShellService - Shell business logic
 */
import { randomUUID } from 'node:crypto';
import type { Shell, ShellType } from '@shared/types/index.js';
import type { ShellStore } from '../../storage/stores/ShellStore.js';
import type { ProjectStore } from '../../storage/stores/ProjectStore.js';
import { PtyPool, type ShellStoreInterface } from '../pty/index.js';

export interface ShellServiceOptions {
  shellStore: ShellStore;
  projectStore: ProjectStore;
  ptyPool?: PtyPool;
}

export class ShellService {
  private readonly shellStore: ShellStore;
  private readonly projectStore: ProjectStore;
  private readonly ptyPool: PtyPool | null;
  private readonly lastActivityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastActivityDebounceMs = 1000; // Debounce lastActivityAt updates by 1 second

  // Track last input time per shell for input-aware activity tracking
  // Output only counts as activity if there was recent input (within this window)
  private readonly lastInputTimes = new Map<string, number>();
  private readonly inputActivityWindowMs = 30000; // 30 seconds - output after input counts as activity

  constructor(options: ShellServiceOptions) {
    this.shellStore = options.shellStore;
    this.projectStore = options.projectStore;
    this.ptyPool = options.ptyPool ?? null;

    // Set up event handlers if ptyPool is provided
    if (this.ptyPool) {
      this.ptyPool.on('session:exited', (shellId: string, exitCode: number) => {
        this._handleSessionExit(shellId, exitCode).catch((err: unknown) => {
          // Log but don't crash on lock contention or other storage errors
          // This can happen during shell deletion when concurrent updates race
          console.error(`[ShellService] Failed to handle session exit for ${shellId}:`, err);
        });
      });

      // Track lastActivityAt for AI shells with input-aware logic:
      // - Input always counts as activity
      // - Output only counts if there was recent input (within 30s)
      // This prevents prompt refresh after reconnection from counting as activity
      this.ptyPool.on('session:input', (shellId: string) => {
        this.lastInputTimes.set(shellId, Date.now());
        this._handleSessionActivity(shellId).catch((err: unknown) => {
          // Log but don't crash on storage errors
          console.error(`[ShellService] Failed to handle session activity for ${shellId}:`, err);
        });
      });

      this.ptyPool.on('session:output', (shellId: string) => {
        // Only count output as activity if there was recent input
        const lastInputTime = this.lastInputTimes.get(shellId);
        if (lastInputTime && Date.now() - lastInputTime < this.inputActivityWindowMs) {
          this._handleSessionActivity(shellId).catch((err: unknown) => {
            // Log but don't crash on storage errors
            console.error(`[ShellService] Failed to handle session activity for ${shellId}:`, err);
          });
        }
        // Otherwise, output is ignored (likely prompt refresh or other housekeeping)
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
    const existingTimer = this.lastActivityTimers.get(shellId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.lastActivityTimers.delete(shellId);
      void this.shellStore.update(shellId, {
        lastActivityAt: new Date().toISOString(),
      });
    }, this.lastActivityDebounceMs);

    this.lastActivityTimers.set(shellId, timer);
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
