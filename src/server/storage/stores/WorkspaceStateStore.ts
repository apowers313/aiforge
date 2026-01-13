/**
 * Workspace state storage - manages UI state that syncs across devices
 */
import { JsonStore } from '../JsonStore.js';
import type { WorkspaceState } from '@shared/types/index.js';

interface WorkspaceStateData {
  version: number;
  states: Record<string, WorkspaceState>; // keyed by session token
}

export class WorkspaceStateStore {
  private store: JsonStore<WorkspaceStateData>;

  constructor(filePath: string) {
    this.store = new JsonStore<WorkspaceStateData>({
      filePath,
      defaultValue: { version: 1, states: {} },
    });
  }

  async get(sessionToken: string): Promise<WorkspaceState | null> {
    const data = await this.store.read();
    return data.states[sessionToken] ?? null;
  }

  async set(sessionToken: string, state: WorkspaceState): Promise<void> {
    await this.store.update((data) => ({
      ...data,
      states: {
        ...data.states,
        [sessionToken]: state,
      },
    }));
  }

  async delete(sessionToken: string): Promise<void> {
    await this.store.update((data) => {
      const { [sessionToken]: _deleted, ...remainingStates } = data.states;
      void _deleted; // Intentionally unused
      return {
        ...data,
        states: remainingStates,
      };
    });
  }

  /**
   * Remove workspace states for sessions that no longer exist
   * @param validTokens - Array of currently valid session tokens
   */
  async cleanupOrphanedStates(validTokens: string[]): Promise<void> {
    const validSet = new Set(validTokens);
    await this.store.update((data) => {
      const cleanedStates: Record<string, WorkspaceState> = {};
      for (const [token, state] of Object.entries(data.states)) {
        if (validSet.has(token)) {
          cleanedStates[token] = state;
        }
      }
      return {
        ...data,
        states: cleanedStates,
      };
    });
  }
}
