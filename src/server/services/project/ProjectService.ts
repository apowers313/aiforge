/**
 * ProjectService - Project business logic
 */
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import type { Project } from '@shared/types/index.js';
import type { ProjectStore } from '../../storage/stores/ProjectStore.js';
import type { ShellStore } from '../../storage/stores/ShellStore.js';

export interface ProjectServiceOptions {
  projectStore: ProjectStore;
  shellStore: ShellStore;
}

export class ProjectService {
  private readonly projectStore: ProjectStore;
  private readonly shellStore: ShellStore;

  constructor(options: ProjectServiceOptions) {
    this.projectStore = options.projectStore;
    this.shellStore = options.shellStore;
  }

  /**
   * Get all projects
   */
  async getAll(): Promise<Project[]> {
    return this.projectStore.getAll();
  }

  /**
   * Get a project by ID
   */
  async getById(id: string): Promise<Project | null> {
    return this.projectStore.getById(id);
  }

  /**
   * Create a new project from a directory path
   * Validates the path exists and is a directory
   */
  async create(path: string): Promise<Project> {
    // Check if path exists and is a directory
    try {
      const stats = await stat(path);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Path does not exist');
      }
      throw err;
    }

    // Check if project already exists for this path
    const existing = await this.projectStore.getByPath(path);
    if (existing) {
      throw new Error('Project already exists for this path');
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: basename(path),
      path,
      createdAt: now,
      updatedAt: now,
    };

    await this.projectStore.create(project);
    return project;
  }

  /**
   * Update a project's name
   */
  async update(id: string, updates: { name?: string }): Promise<Project | null> {
    return this.projectStore.update(id, updates);
  }

  /**
   * Delete a project and all its shells
   */
  async delete(id: string): Promise<boolean> {
    // Delete all shells for this project first
    await this.shellStore.deleteByProjectId(id);

    return this.projectStore.delete(id);
  }
}
