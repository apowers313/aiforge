/**
 * ProjectContextStore - JSON store for project context data (todos + notes)
 */
import type { TodoItem, ProjectContextData } from '@shared/types/index.js';
import { JsonStore } from '../JsonStore.js';

type ProjectContextDataStore = Record<string, ProjectContextData>;

export class ProjectContextStore {
  private readonly store: JsonStore<ProjectContextDataStore>;

  constructor(filePath: string) {
    this.store = new JsonStore<ProjectContextDataStore>({
      filePath,
      defaultValue: {},
    });
  }

  /**
   * Get context for a project (todos + notes)
   */
  async getByProjectId(projectId: string): Promise<ProjectContextData> {
    const data = await this.store.read();
    return data[projectId] ?? { todos: [], notes: '' };
  }

  /**
   * Update todos for a project
   */
  async updateTodos(projectId: string, todos: TodoItem[]): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [projectId]: {
        todos,
        notes: data[projectId]?.notes ?? '',
      },
    }));
  }

  /**
   * Update notes for a project
   */
  async updateNotes(projectId: string, notes: string): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [projectId]: {
        todos: data[projectId]?.todos ?? [],
        notes,
      },
    }));
  }

  /**
   * Delete all context for a project
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.store.update((data) => {
      const { [projectId]: _, ...rest } = data;
      void _; // Suppress unused variable warning
      return rest;
    });
  }
}
