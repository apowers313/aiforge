/**
 * ProjectUrlsStore - JSON store for custom URLs per project
 */
import type { CustomUrl } from '@shared/types/index.js';
import { JsonStore } from '../JsonStore.js';

type ProjectUrlsData = Record<string, CustomUrl[]>;

export class ProjectUrlsStore {
  private readonly store: JsonStore<ProjectUrlsData>;

  constructor(filePath: string) {
    this.store = new JsonStore<ProjectUrlsData>({
      filePath,
      defaultValue: {},
    });
  }

  /**
   * Get all URLs for a project
   */
  async getByProjectId(projectId: string): Promise<CustomUrl[]> {
    const data = await this.store.read();
    return data[projectId] ?? [];
  }

  /**
   * Add a URL to a project
   */
  async add(projectId: string, url: CustomUrl): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [projectId]: [...(data[projectId] ?? []), url],
    }));
  }

  /**
   * Update a URL in a project
   */
  async update(
    projectId: string,
    urlId: string,
    updates: Partial<Pick<CustomUrl, 'name' | 'url'>>,
  ): Promise<CustomUrl | null> {
    let updatedUrl: CustomUrl | null = null;

    await this.store.update((data) => {
      const projectUrls = data[projectId];
      if (!projectUrls) {
        return data;
      }

      const urlIndex = projectUrls.findIndex((u) => u.id === urlId);
      if (urlIndex === -1) {
        return data;
      }

      const existingUrl = projectUrls[urlIndex];
      if (!existingUrl) {
        return data;
      }

      updatedUrl = {
        ...existingUrl,
        ...updates,
      };

      const newUrls = [...projectUrls];
      newUrls[urlIndex] = updatedUrl;

      return {
        ...data,
        [projectId]: newUrls,
      };
    });

    return updatedUrl;
  }

  /**
   * Delete a URL from a project
   */
  async delete(projectId: string, urlId: string): Promise<boolean> {
    let deleted = false;

    await this.store.update((data) => {
      const projectUrls = data[projectId];
      if (!projectUrls) {
        return data;
      }

      const urlIndex = projectUrls.findIndex((u) => u.id === urlId);
      if (urlIndex === -1) {
        return data;
      }

      deleted = true;
      const newUrls = projectUrls.filter((u) => u.id !== urlId);

      return {
        ...data,
        [projectId]: newUrls,
      };
    });

    return deleted;
  }

  /**
   * Delete all URLs for a project
   */
  async deleteAllByProjectId(projectId: string): Promise<void> {
    await this.store.update((data) => {
      const { [projectId]: _, ...rest } = data;
      void _; // Suppress unused variable warning
      return rest;
    });
  }
}
