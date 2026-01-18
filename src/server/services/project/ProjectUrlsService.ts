/**
 * ProjectUrlsService - Manages custom URLs per project
 */
import { randomUUID } from 'node:crypto';
import type { CustomUrl } from '@shared/types/index.js';
import type { ProjectUrlsStore } from '../../storage/stores/ProjectUrlsStore.js';

export interface ProjectUrlsServiceOptions {
  projectUrlsStore: ProjectUrlsStore;
}

export class ProjectUrlsService {
  private readonly store: ProjectUrlsStore;

  constructor(options: ProjectUrlsServiceOptions) {
    this.store = options.projectUrlsStore;
  }

  /**
   * Get all custom URLs for a project
   */
  async getUrls(projectId: string): Promise<CustomUrl[]> {
    return this.store.getByProjectId(projectId);
  }

  /**
   * Add a custom URL to a project
   */
  async addUrl(projectId: string, name: string, url: string): Promise<CustomUrl> {
    const customUrl: CustomUrl = {
      id: randomUUID(),
      name,
      url,
      createdAt: new Date().toISOString(),
    };

    await this.store.add(projectId, customUrl);
    return customUrl;
  }

  /**
   * Update a custom URL
   */
  async updateUrl(
    projectId: string,
    urlId: string,
    updates: Partial<Pick<CustomUrl, 'name' | 'url'>>,
  ): Promise<CustomUrl | null> {
    return this.store.update(projectId, urlId, updates);
  }

  /**
   * Delete a custom URL
   */
  async deleteUrl(projectId: string, urlId: string): Promise<boolean> {
    return this.store.delete(projectId, urlId);
  }

  /**
   * Delete all custom URLs for a project
   */
  async deleteAllUrls(projectId: string): Promise<void> {
    await this.store.deleteAllByProjectId(projectId);
  }
}
