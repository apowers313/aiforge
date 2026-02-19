/**
 * Tests for WorkspaceStateStore - workspace UI state storage
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStateStore } from '@server/storage/stores/WorkspaceStateStore.js';
import type { WorkspaceState } from '@shared/types/index.js';

describe('WorkspaceStateStore', () => {
  let store: WorkspaceStateStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workspace-store-test-'));
    store = new WorkspaceStateStore(join(tempDir, 'workspace-states.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const createState = (overrides?: Partial<WorkspaceState>): WorkspaceState => ({
    sidebarCollapsed: false,
    sidebarWidth: 280,
    expandedProjectIds: [],
    activeShellId: null,
    terminalFontSize: 14,
    terminalTheme: 'tokyo-night',
    contextSidebarPinned: false,
    contextSidebarWidth: 320,
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  describe('get', () => {
    it('returns null for non-existent session token', async () => {
      const result = await store.get('nonexistent-token');
      expect(result).toBeNull();
    });

    it('returns stored state for valid session token', async () => {
      const token = 'test-token';
      const state = createState({
        sidebarCollapsed: true,
        expandedProjectIds: ['project-1', 'project-2'],
        activeShellId: 'shell-1',
      });

      await store.set(token, state);
      const result = await store.get(token);

      expect(result).toEqual(state);
    });
  });

  describe('set', () => {
    it('stores new state', async () => {
      const token = 'new-token';
      const state = createState({ sidebarCollapsed: true });

      await store.set(token, state);
      const result = await store.get(token);

      expect(result).toEqual(state);
    });

    it('overwrites existing state', async () => {
      const token = 'overwrite-token';
      const initialState = createState({ sidebarCollapsed: false });
      const updatedState = createState({ sidebarCollapsed: true });

      await store.set(token, initialState);
      await store.set(token, updatedState);
      const result = await store.get(token);

      expect(result).toEqual(updatedState);
    });

    it('stores multiple sessions independently', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';
      const state1 = createState({ sidebarCollapsed: true });
      const state2 = createState({ sidebarCollapsed: false, activeShellId: 'shell-2' });

      await store.set(token1, state1);
      await store.set(token2, state2);

      const result1 = await store.get(token1);
      const result2 = await store.get(token2);

      expect(result1).toEqual(state1);
      expect(result2).toEqual(state2);
    });
  });

  describe('delete', () => {
    it('removes stored state', async () => {
      const token = 'delete-token';
      const state = createState();

      await store.set(token, state);
      await store.delete(token);
      const result = await store.get(token);

      expect(result).toBeNull();
    });

    it('does not throw when deleting non-existent token', async () => {
      await expect(store.delete('nonexistent')).resolves.toBeUndefined();
    });

    it('does not affect other sessions', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';
      const state1 = createState();
      const state2 = createState({ activeShellId: 'shell-2' });

      await store.set(token1, state1);
      await store.set(token2, state2);
      await store.delete(token1);

      expect(await store.get(token1)).toBeNull();
      expect(await store.get(token2)).toEqual(state2);
    });
  });

  describe('cleanupOrphanedStates', () => {
    it('removes states for invalid session tokens', async () => {
      const validToken = 'valid-token';
      const orphanToken = 'orphan-token';
      const state = createState();

      await store.set(validToken, state);
      await store.set(orphanToken, state);

      await store.cleanupOrphanedStates([validToken]);

      expect(await store.get(validToken)).toEqual(state);
      expect(await store.get(orphanToken)).toBeNull();
    });

    it('keeps all states when all tokens are valid', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';
      const state = createState();

      await store.set(token1, state);
      await store.set(token2, state);

      await store.cleanupOrphanedStates([token1, token2]);

      expect(await store.get(token1)).toEqual(state);
      expect(await store.get(token2)).toEqual(state);
    });

    it('removes all states when no tokens are valid', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';
      const state = createState();

      await store.set(token1, state);
      await store.set(token2, state);

      await store.cleanupOrphanedStates([]);

      expect(await store.get(token1)).toBeNull();
      expect(await store.get(token2)).toBeNull();
    });
  });
});
