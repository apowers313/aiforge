/**
 * WorktreeUrlsStore - JSON store for custom URLs per worktree
 * Phase 7: Follows the same pattern as ProjectUrlsStore but keyed by worktreePath
 */
import type { CustomUrl } from '@shared/types/index.js';
import { JsonStore } from '../JsonStore.js';

type WorktreeUrlsData = Record<string, CustomUrl[]>;

export class WorktreeUrlsStore {
  private readonly store: JsonStore<WorktreeUrlsData>;

  constructor(filePath: string) {
    this.store = new JsonStore<WorktreeUrlsData>({
      filePath,
      defaultValue: {},
    });
  }

  /**
   * Get all URLs for a worktree
   * @param worktreePath - Absolute path to the worktree
   */
  async getByWorktreePath(worktreePath: string): Promise<CustomUrl[]> {
    const data = await this.store.read();
    return data[worktreePath] ?? [];
  }

  /**
   * Add a URL to a worktree
   * @param worktreePath - Absolute path to the worktree
   * @param url - CustomUrl to add
   */
  async add(worktreePath: string, url: CustomUrl): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [worktreePath]: [...(data[worktreePath] ?? []), url],
    }));
  }

  /**
   * Update a URL in a worktree
   * @param worktreePath - Absolute path to the worktree
   * @param urlId - ID of the URL to update
   * @param updates - Partial updates to apply
   */
  async update(
    worktreePath: string,
    urlId: string,
    updates: Partial<Pick<CustomUrl, 'name' | 'url'>>,
  ): Promise<CustomUrl | null> {
    let updatedUrl: CustomUrl | null = null;

    await this.store.update((data) => {
      const worktreeUrls = data[worktreePath];
      if (!worktreeUrls) {
        return data;
      }

      const urlIndex = worktreeUrls.findIndex((u) => u.id === urlId);
      if (urlIndex === -1) {
        return data;
      }

      const existingUrl = worktreeUrls[urlIndex];
      if (!existingUrl) {
        return data;
      }

      updatedUrl = {
        ...existingUrl,
        ...updates,
      };

      const newUrls = [...worktreeUrls];
      newUrls[urlIndex] = updatedUrl;

      return {
        ...data,
        [worktreePath]: newUrls,
      };
    });

    return updatedUrl;
  }

  /**
   * Delete a URL from a worktree
   * @param worktreePath - Absolute path to the worktree
   * @param urlId - ID of the URL to delete
   */
  async delete(worktreePath: string, urlId: string): Promise<boolean> {
    let deleted = false;

    await this.store.update((data) => {
      const worktreeUrls = data[worktreePath];
      if (!worktreeUrls) {
        return data;
      }

      const urlIndex = worktreeUrls.findIndex((u) => u.id === urlId);
      if (urlIndex === -1) {
        return data;
      }

      deleted = true;
      const newUrls = worktreeUrls.filter((u) => u.id !== urlId);

      return {
        ...data,
        [worktreePath]: newUrls,
      };
    });

    return deleted;
  }

  /**
   * Delete all URLs for a worktree
   * @param worktreePath - Absolute path to the worktree
   */
  async deleteAllByWorktreePath(worktreePath: string): Promise<void> {
    await this.store.update((data) => {
      const { [worktreePath]: _, ...rest } = data;
      void _; // Suppress unused variable warning
      return rest;
    });
  }
}
