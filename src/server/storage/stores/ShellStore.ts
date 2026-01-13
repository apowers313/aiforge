/**
 * Shell storage - manages shell data persistence
 */
import { JsonStore } from '../JsonStore.js';
import type { Shell } from '@shared/types/index.js';

interface ShellData {
  version: number;
  shells: Shell[];
  shellCounter: number;
}

export class ShellStore {
  private store: JsonStore<ShellData>;

  constructor(filePath: string) {
    this.store = new JsonStore<ShellData>({
      filePath,
      defaultValue: { version: 1, shells: [], shellCounter: 0 },
    });
  }

  async getAll(): Promise<Shell[]> {
    const data = await this.store.read();
    return data.shells;
  }

  async getById(id: string): Promise<Shell | null> {
    const data = await this.store.read();
    return data.shells.find((s) => s.id === id) ?? null;
  }

  async getByProjectId(projectId: string): Promise<Shell[]> {
    const data = await this.store.read();
    return data.shells.filter((s) => s.projectId === projectId);
  }

  async create(shell: Shell): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      shells: [...data.shells, shell],
    }));
  }

  async getNextShellNumber(): Promise<number> {
    let counter = 0;
    await this.store.update((data) => {
      counter = data.shellCounter + 1;
      return {
        ...data,
        shellCounter: counter,
      };
    });
    return counter;
  }

  async update(id: string, updates: Partial<Pick<Shell, 'name' | 'status' | 'pid' | 'cwd'>>): Promise<Shell | null> {
    let updatedShell: Shell | null = null;

    await this.store.update((data) => {
      const index = data.shells.findIndex((s) => s.id === id);
      if (index === -1) {
        return data;
      }

      const shell = data.shells[index];
      if (!shell) {
        return data;
      }

      updatedShell = {
        ...shell,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const newShells = [...data.shells];
      newShells[index] = updatedShell;

      return {
        ...data,
        shells: newShells,
      };
    });

    return updatedShell;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.store.update((data) => {
      const newShells = data.shells.filter((s) => s.id !== id);
      deleted = newShells.length < data.shells.length;
      return {
        ...data,
        shells: newShells,
      };
    });

    return deleted;
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    let deletedCount = 0;

    await this.store.update((data) => {
      const newShells = data.shells.filter((s) => s.projectId !== projectId);
      deletedCount = data.shells.length - newShells.length;
      return {
        ...data,
        shells: newShells,
      };
    });

    return deletedCount;
  }
}
