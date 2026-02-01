/**
 * WorktreeMetadataStore - JSON store for worktree metadata
 * Phase 5: Stores done status and timestamps per worktree
 */
import type { WorktreeMetadata } from '@shared/types/index.js';
import { JsonStore } from '../JsonStore.js';

// Store data keyed by worktree path
type WorktreeMetadataData = Record<string, WorktreeMetadata>;

export class WorktreeMetadataStore {
  private readonly store: JsonStore<WorktreeMetadataData>;

  constructor(filePath: string) {
    this.store = new JsonStore<WorktreeMetadataData>({
      filePath,
      defaultValue: {},
    });
  }

  /**
   * Get metadata for a specific worktree path
   * @param worktreePath - Absolute path to the worktree
   * @returns Metadata or null if not found
   */
  async getByWorktreePath(worktreePath: string): Promise<WorktreeMetadata | null> {
    const data = await this.store.read();
    return data[worktreePath] ?? null;
  }

  /**
   * Get all metadata for a project
   * @param projectId - The project ID
   * @returns Array of metadata for all worktrees in the project
   */
  async getByProjectId(projectId: string): Promise<WorktreeMetadata[]> {
    const data = await this.store.read();
    return Object.values(data).filter((m) => m.projectId === projectId);
  }

  /**
   * Insert or update metadata
   * @param metadata - The worktree metadata to upsert
   */
  async upsert(metadata: WorktreeMetadata): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [metadata.worktreePath]: metadata,
    }));
  }

  /**
   * Update specific fields of existing metadata
   * @param worktreePath - Absolute path to the worktree
   * @param updates - Fields to update
   * @returns Updated metadata or null if not found
   */
  async update(
    worktreePath: string,
    updates: Partial<Pick<WorktreeMetadata, 'done' | 'updatedAt'>>,
  ): Promise<WorktreeMetadata | null> {
    let updatedMetadata: WorktreeMetadata | null = null;

    await this.store.update((data) => {
      const existing = data[worktreePath];
      if (!existing) {
        return data;
      }

      updatedMetadata = {
        ...existing,
        ...updates,
      };

      return {
        ...data,
        [worktreePath]: updatedMetadata,
      };
    });

    return updatedMetadata;
  }

  /**
   * Delete metadata for a worktree path
   * @param worktreePath - Absolute path to the worktree
   * @returns True if deleted, false if not found
   */
  async delete(worktreePath: string): Promise<boolean> {
    let deleted = false;

    await this.store.update((data) => {
      if (!(worktreePath in data)) {
        return data;
      }

      deleted = true;
      const { [worktreePath]: _, ...rest } = data;
      void _; // Suppress unused variable warning
      return rest;
    });

    return deleted;
  }

  /**
   * Delete all metadata for a project
   * @param projectId - The project ID
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.store.update((data) => {
      const filtered: WorktreeMetadataData = {};
      for (const [path, metadata] of Object.entries(data)) {
        if (metadata.projectId !== projectId) {
          filtered[path] = metadata;
        }
      }
      return filtered;
    });
  }
}
