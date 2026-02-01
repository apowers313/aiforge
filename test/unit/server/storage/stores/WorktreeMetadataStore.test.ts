/**
 * Tests for WorktreeMetadataStore
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { WorktreeMetadataStore } from '@server/storage/stores/WorktreeMetadataStore.js';
import type { WorktreeMetadata } from '@shared/types/index.js';

describe('WorktreeMetadataStore', () => {
  let tempDir: string;
  let store: WorktreeMetadataStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'worktree-metadata-test-'));
    store = new WorktreeMetadataStore(join(tempDir, 'worktree-metadata.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('upsert', () => {
    it('should store and retrieve metadata', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata);
      const retrieved = await store.getByWorktreePath('/path/to/wt');

      expect(retrieved).toEqual(metadata);
    });

    it('should update existing metadata when upserting', async () => {
      const metadata1: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await store.upsert(metadata1);

      const metadata2: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      await store.upsert(metadata2);

      const retrieved = await store.getByWorktreePath('/path/to/wt');
      expect(retrieved?.done).toBe(true);
      expect(retrieved?.updatedAt).toBe('2024-01-02T00:00:00.000Z');
    });
  });

  describe('getByWorktreePath', () => {
    it('should return null for non-existent path', async () => {
      const retrieved = await store.getByWorktreePath('/non/existent/path');
      expect(retrieved).toBeNull();
    });

    it('should return correct metadata for existing path', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/specific/path',
        projectId: 'proj-2',
        done: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata);
      const retrieved = await store.getByWorktreePath('/specific/path');

      expect(retrieved).toEqual(metadata);
    });
  });

  describe('getByProjectId', () => {
    it('should return empty array for non-existent project', async () => {
      const results = await store.getByProjectId('non-existent-project');
      expect(results).toEqual([]);
    });

    it('should return all metadata for a project', async () => {
      const metadata1: WorktreeMetadata = {
        worktreePath: '/path/to/wt1',
        projectId: 'proj-1',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const metadata2: WorktreeMetadata = {
        worktreePath: '/path/to/wt2',
        projectId: 'proj-1',
        done: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const metadata3: WorktreeMetadata = {
        worktreePath: '/path/to/wt3',
        projectId: 'proj-2',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata1);
      await store.upsert(metadata2);
      await store.upsert(metadata3);

      const results = await store.getByProjectId('proj-1');
      expect(results).toHaveLength(2);
      expect(results.map((m) => m.worktreePath)).toContain('/path/to/wt1');
      expect(results.map((m) => m.worktreePath)).toContain('/path/to/wt2');
    });
  });

  describe('update', () => {
    it('should update done status', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await store.upsert(metadata);
      await store.update('/path/to/wt', { done: true });

      const retrieved = await store.getByWorktreePath('/path/to/wt');
      expect(retrieved?.done).toBe(true);
    });

    it('should update updatedAt timestamp', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await store.upsert(metadata);

      const newTimestamp = '2024-02-01T00:00:00.000Z';
      await store.update('/path/to/wt', { updatedAt: newTimestamp });

      const retrieved = await store.getByWorktreePath('/path/to/wt');
      expect(retrieved?.updatedAt).toBe(newTimestamp);
    });

    it('should return null when updating non-existent path', async () => {
      const result = await store.update('/non/existent/path', { done: true });
      expect(result).toBeNull();
    });

    it('should return updated metadata', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await store.upsert(metadata);
      const result = await store.update('/path/to/wt', { done: true });

      expect(result?.done).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete metadata for path', async () => {
      const metadata: WorktreeMetadata = {
        worktreePath: '/path/to/wt',
        projectId: 'proj-1',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata);
      const deleted = await store.delete('/path/to/wt');

      expect(deleted).toBe(true);

      const retrieved = await store.getByWorktreePath('/path/to/wt');
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent path', async () => {
      const deleted = await store.delete('/non/existent/path');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByProjectId', () => {
    it('should delete all metadata for a project', async () => {
      const metadata1: WorktreeMetadata = {
        worktreePath: '/path/to/wt1',
        projectId: 'proj-1',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const metadata2: WorktreeMetadata = {
        worktreePath: '/path/to/wt2',
        projectId: 'proj-1',
        done: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const metadata3: WorktreeMetadata = {
        worktreePath: '/path/to/wt3',
        projectId: 'proj-2',
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.upsert(metadata1);
      await store.upsert(metadata2);
      await store.upsert(metadata3);

      await store.deleteByProjectId('proj-1');

      const proj1Results = await store.getByProjectId('proj-1');
      expect(proj1Results).toHaveLength(0);

      const proj2Results = await store.getByProjectId('proj-2');
      expect(proj2Results).toHaveLength(1);
    });
  });
});
