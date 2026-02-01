/**
 * Tests for WorktreeUrlsStore - worktree URL data persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorktreeUrlsStore } from '@server/storage/stores/WorktreeUrlsStore.js';
import type { CustomUrl } from '@shared/types/index.js';

function createUrl(overrides: Partial<CustomUrl> = {}): CustomUrl {
  const now = new Date().toISOString();
  return {
    id: 'url-1',
    name: 'Test URL',
    url: 'http://localhost:3000',
    createdAt: now,
    ...overrides,
  };
}

describe('WorktreeUrlsStore', () => {
  let store: WorktreeUrlsStore;
  let tempDir: string;
  const worktreePath = '/home/user/project/.worktrees/feature';
  const worktreePath2 = '/home/user/project/.worktrees/bugfix';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'worktree-urls-store-test-'));
    store = new WorktreeUrlsStore(join(tempDir, 'worktree-urls.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getByWorktreePath', () => {
    it('returns empty array when no URLs exist', async () => {
      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toEqual([]);
    });

    it('returns all URLs for a worktree', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', name: 'Dev Server' }));
      await store.add(worktreePath, createUrl({ id: 'url-2', name: 'API Server' }));

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(2);
      expect(urls.map((u) => u.name)).toContain('Dev Server');
      expect(urls.map((u) => u.name)).toContain('API Server');
    });

    it('returns URLs only for the specified worktree', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', name: 'Feature URL' }));
      await store.add(worktreePath2, createUrl({ id: 'url-2', name: 'Bugfix URL' }));

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(1);
      expect(urls[0]?.name).toBe('Feature URL');
    });
  });

  describe('add', () => {
    it('adds a URL to a worktree', async () => {
      const url = createUrl({ id: 'new-url', name: 'New URL' });
      await store.add(worktreePath, url);

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(1);
      expect(urls[0]?.name).toBe('New URL');
    });

    it('adds multiple URLs to the same worktree', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));
      await store.add(worktreePath, createUrl({ id: 'url-2' }));
      await store.add(worktreePath, createUrl({ id: 'url-3' }));

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(3);
    });
  });

  describe('update', () => {
    it('updates URL name', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', name: 'Old Name' }));

      const updated = await store.update(worktreePath, 'url-1', { name: 'New Name' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('New Name');
    });

    it('updates URL value', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', url: 'http://old.com' }));

      const updated = await store.update(worktreePath, 'url-1', { url: 'http://new.com' });

      expect(updated).not.toBeNull();
      expect(updated?.url).toBe('http://new.com');
    });

    it('updates both name and url', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', name: 'Old', url: 'http://old.com' }));

      const updated = await store.update(worktreePath, 'url-1', {
        name: 'New',
        url: 'http://new.com',
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('New');
      expect(updated?.url).toBe('http://new.com');
    });

    it('returns null when worktree does not exist', async () => {
      const updated = await store.update(worktreePath, 'url-1', { name: 'Test' });
      expect(updated).toBeNull();
    });

    it('returns null when URL does not exist', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));

      const updated = await store.update(worktreePath, 'non-existent', { name: 'Test' });
      expect(updated).toBeNull();
    });

    it('preserves other URL properties on update', async () => {
      const originalCreatedAt = '2024-01-01T00:00:00.000Z';
      await store.add(worktreePath, createUrl({ id: 'url-1', createdAt: originalCreatedAt }));

      const updated = await store.update(worktreePath, 'url-1', { name: 'Updated' });

      expect(updated?.createdAt).toBe(originalCreatedAt);
      expect(updated?.id).toBe('url-1');
    });
  });

  describe('delete', () => {
    it('deletes a URL', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));

      const deleted = await store.delete(worktreePath, 'url-1');

      expect(deleted).toBe(true);
      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(0);
    });

    it('returns false when worktree does not exist', async () => {
      const deleted = await store.delete(worktreePath, 'url-1');
      expect(deleted).toBe(false);
    });

    it('returns false when URL does not exist', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));

      const deleted = await store.delete(worktreePath, 'non-existent');
      expect(deleted).toBe(false);
    });

    it('does not affect other URLs when deleting', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1', name: 'First' }));
      await store.add(worktreePath, createUrl({ id: 'url-2', name: 'Second' }));

      await store.delete(worktreePath, 'url-1');

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(1);
      expect(urls[0]?.name).toBe('Second');
    });
  });

  describe('deleteAllByWorktreePath', () => {
    it('deletes all URLs for a worktree', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));
      await store.add(worktreePath, createUrl({ id: 'url-2' }));
      await store.add(worktreePath, createUrl({ id: 'url-3' }));

      await store.deleteAllByWorktreePath(worktreePath);

      const urls = await store.getByWorktreePath(worktreePath);
      expect(urls).toHaveLength(0);
    });

    it('does not affect other worktrees', async () => {
      await store.add(worktreePath, createUrl({ id: 'url-1' }));
      await store.add(worktreePath2, createUrl({ id: 'url-2' }));

      await store.deleteAllByWorktreePath(worktreePath);

      const urls1 = await store.getByWorktreePath(worktreePath);
      const urls2 = await store.getByWorktreePath(worktreePath2);

      expect(urls1).toHaveLength(0);
      expect(urls2).toHaveLength(1);
    });

    it('handles non-existent worktree gracefully', async () => {
      await store.deleteAllByWorktreePath('non-existent');
      // Should not throw
    });
  });
});
