/**
 * ShellContextStore - JSON store for shell context data (todos + notes)
 */
import type { TodoItem, ShellContextData } from '@shared/types/index.js';
import { JsonStore } from '../JsonStore.js';

type ShellContextDataStore = Record<string, ShellContextData>;

export class ShellContextStore {
  private readonly store: JsonStore<ShellContextDataStore>;

  constructor(filePath: string) {
    this.store = new JsonStore<ShellContextDataStore>({
      filePath,
      defaultValue: {},
    });
  }

  /**
   * Get context for a shell (todos + notes)
   */
  async getByShellId(shellId: string): Promise<ShellContextData> {
    const data = await this.store.read();
    return data[shellId] ?? { todos: [], notes: '' };
  }

  /**
   * Update todos for a shell
   */
  async updateTodos(shellId: string, todos: TodoItem[]): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [shellId]: {
        todos,
        notes: data[shellId]?.notes ?? '',
      },
    }));
  }

  /**
   * Update notes for a shell
   */
  async updateNotes(shellId: string, notes: string): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      [shellId]: {
        todos: data[shellId]?.todos ?? [],
        notes,
      },
    }));
  }

  /**
   * Delete all context for a shell
   */
  async deleteByShellId(shellId: string): Promise<void> {
    await this.store.update((data) => {
      const { [shellId]: _, ...rest } = data;
      void _; // Suppress unused variable warning
      return rest;
    });
  }
}
