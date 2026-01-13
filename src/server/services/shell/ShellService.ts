/**
 * ShellService - Shell business logic
 */
import { randomUUID } from 'node:crypto';
import type { Shell } from '@shared/types/index.js';
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

  constructor(options: ShellServiceOptions) {
    this.shellStore = options.shellStore;
    this.projectStore = options.projectStore;
    this.ptyPool = options.ptyPool ?? null;

    // Set up event handlers if ptyPool is provided
    if (this.ptyPool) {
      this.ptyPool.on('session:exited', (shellId: string, exitCode: number) => {
        void this._handleSessionExit(shellId, exitCode);
      });
    }
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
  async create(projectId: string, name?: string): Promise<Shell> {
    // Verify project exists
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Auto-generate name if not provided
    let shellName = name;
    if (!shellName) {
      const shellNumber = await this.shellStore.getNextShellNumber();
      shellName = `shell-${String(shellNumber)}`;
    }

    const now = new Date().toISOString();
    const shell: Shell = {
      id: randomUUID(),
      projectId,
      name: shellName,
      cwd: project.path,
      status: 'inactive',
      pid: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.shellStore.create(shell);
    return shell;
  }

  /**
   * Update a shell's properties
   */
  async update(id: string, updates: Partial<Pick<Shell, 'name' | 'status' | 'pid' | 'cwd'>>): Promise<Shell | null> {
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

    // Check if already running
    if (this.ptyPool.get(shellId)) {
      return shell;
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

    // Spawn PTY session
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
   * Shutdown all PTY sessions
   */
  shutdown(): void {
    if (this.ptyPool) {
      this.ptyPool.shutdown();
    }
  }
}
