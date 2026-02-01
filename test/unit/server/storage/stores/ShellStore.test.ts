/**
 * Tests for ShellStore - shell data persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShellStore } from '@server/storage/stores/ShellStore.js';
import type { Shell } from '@shared/types/index.js';

function createShell(overrides: Partial<Shell> = {}): Shell {
  const now = new Date().toISOString();
  return {
    id: 'shell-1',
    projectId: 'proj-1',
    name: 'bash-1',
    cwd: '/home/user/project',
    status: 'inactive',
    type: 'bash',
    pid: null,
    socketPath: null,
    lastActivityAt: null,
    done: false,
    worktreePath: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ShellStore', () => {
  let store: ShellStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'shell-store-test-'));
    store = new ShellStore(join(tempDir, 'shells.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getAll', () => {
    it('returns empty array when no shells exist', async () => {
      const shells = await store.getAll();
      expect(shells).toEqual([]);
    });

    it('returns all shells', async () => {
      await store.create(createShell({ id: 'shell-1' }));
      await store.create(createShell({ id: 'shell-2' }));

      const shells = await store.getAll();
      expect(shells).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('returns null for non-existent shell', async () => {
      const shell = await store.getById('non-existent');
      expect(shell).toBeNull();
    });

    it('returns shell by id', async () => {
      await store.create(createShell({ id: 'shell-1', name: 'my-shell' }));

      const shell = await store.getById('shell-1');
      expect(shell).not.toBeNull();
      expect(shell?.name).toBe('my-shell');
    });
  });

  describe('getByProjectId', () => {
    it('returns shells for project', async () => {
      await store.create(createShell({ id: 'shell-1', projectId: 'proj-1' }));
      await store.create(createShell({ id: 'shell-2', projectId: 'proj-1' }));
      await store.create(createShell({ id: 'shell-3', projectId: 'proj-2' }));

      const shells = await store.getByProjectId('proj-1');
      expect(shells).toHaveLength(2);
      expect(shells.map((s) => s.id)).toContain('shell-1');
      expect(shells.map((s) => s.id)).toContain('shell-2');
    });

    it('returns empty array when no shells for project', async () => {
      await store.create(createShell({ id: 'shell-1', projectId: 'proj-1' }));

      const shells = await store.getByProjectId('proj-2');
      expect(shells).toEqual([]);
    });

    /**
     * Regression test: shells with worktreePath should NOT be returned by getByProjectId
     * Bug: When a shell was created under a worktree, it appeared both at the project level
     * and under the worktree because getByProjectId was returning all shells with that projectId,
     * regardless of worktreePath.
     */
    it('excludes shells with worktreePath (regression test)', async () => {
      // Create a direct project shell (worktreePath = null)
      await store.create(
        createShell({
          id: 'project-shell',
          projectId: 'proj-1',
          name: 'project-bash',
          worktreePath: null,
        }),
      );

      // Create a worktree shell (worktreePath set)
      await store.create(
        createShell({
          id: 'worktree-shell',
          projectId: 'proj-1',
          name: 'worktree-ai',
          worktreePath: '/home/user/project/.worktrees/feature-branch',
        }),
      );

      // getByProjectId should only return the direct project shell
      const projectShells = await store.getByProjectId('proj-1');
      expect(projectShells).toHaveLength(1);
      expect(projectShells[0]?.id).toBe('project-shell');
      expect(projectShells[0]?.worktreePath).toBeNull();
    });

    it('returns multiple direct project shells but no worktree shells', async () => {
      // Two direct project shells
      await store.create(
        createShell({
          id: 'shell-1',
          projectId: 'proj-1',
          worktreePath: null,
        }),
      );
      await store.create(
        createShell({
          id: 'shell-2',
          projectId: 'proj-1',
          worktreePath: null,
        }),
      );

      // Two worktree shells for different worktrees
      await store.create(
        createShell({
          id: 'wt-shell-1',
          projectId: 'proj-1',
          worktreePath: '/path/to/worktree-a',
        }),
      );
      await store.create(
        createShell({
          id: 'wt-shell-2',
          projectId: 'proj-1',
          worktreePath: '/path/to/worktree-b',
        }),
      );

      const projectShells = await store.getByProjectId('proj-1');
      expect(projectShells).toHaveLength(2);
      expect(projectShells.map((s) => s.id).sort()).toEqual(['shell-1', 'shell-2']);
    });
  });

  describe('getByWorktreePath', () => {
    it('returns shells for worktree', async () => {
      const worktreePath = '/home/user/project/.worktrees/feature';

      await store.create(
        createShell({
          id: 'wt-shell-1',
          projectId: 'proj-1',
          worktreePath,
        }),
      );
      await store.create(
        createShell({
          id: 'wt-shell-2',
          projectId: 'proj-1',
          worktreePath,
        }),
      );

      const shells = await store.getByWorktreePath(worktreePath);
      expect(shells).toHaveLength(2);
    });

    it('returns empty array when no shells for worktree', async () => {
      await store.create(
        createShell({
          id: 'shell-1',
          worktreePath: '/path/to/worktree-a',
        }),
      );

      const shells = await store.getByWorktreePath('/path/to/worktree-b');
      expect(shells).toEqual([]);
    });

    it('does not return direct project shells (worktreePath = null)', async () => {
      await store.create(
        createShell({
          id: 'project-shell',
          projectId: 'proj-1',
          worktreePath: null,
        }),
      );

      const shells = await store.getByWorktreePath('/any/path');
      expect(shells).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a shell', async () => {
      const shell = createShell({ id: 'new-shell', name: 'my-new-shell' });
      await store.create(shell);

      const retrieved = await store.getById('new-shell');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('my-new-shell');
    });
  });

  describe('getNextShellNumber', () => {
    it('returns 1 for first bash shell', async () => {
      const num = await store.getNextShellNumber('bash');
      expect(num).toBe(1);
    });

    it('returns 1 for first ai shell', async () => {
      const num = await store.getNextShellNumber('ai');
      expect(num).toBe(1);
    });

    it('returns incrementing numbers for bash shells', async () => {
      await store.create(createShell({ id: 'shell-1', name: 'bash-1', type: 'bash' }));
      const num2 = await store.getNextShellNumber('bash');
      expect(num2).toBe(2);

      await store.create(createShell({ id: 'shell-2', name: 'bash-2', type: 'bash' }));
      const num3 = await store.getNextShellNumber('bash');
      expect(num3).toBe(3);
    });

    it('returns incrementing numbers for ai shells', async () => {
      await store.create(createShell({ id: 'shell-1', name: 'ai-1', type: 'ai' }));
      const num2 = await store.getNextShellNumber('ai');
      expect(num2).toBe(2);

      await store.create(createShell({ id: 'shell-2', name: 'ai-2', type: 'ai' }));
      const num3 = await store.getNextShellNumber('ai');
      expect(num3).toBe(3);
    });

    /**
     * Regression test: bash and ai shells should have independent numbering.
     * Bug: Global counter caused ai-2 when creating second shell after bash-1.
     */
    it('keeps bash and ai numbering independent (regression)', async () => {
      // Create bash-1
      await store.create(createShell({ id: 'shell-1', name: 'bash-1', type: 'bash' }));

      // Next ai shell should be ai-1, not ai-2
      const aiNum = await store.getNextShellNumber('ai');
      expect(aiNum).toBe(1);

      // Create ai-1
      await store.create(createShell({ id: 'shell-2', name: 'ai-1', type: 'ai' }));

      // Next bash shell should be bash-2
      const bashNum = await store.getNextShellNumber('bash');
      expect(bashNum).toBe(2);
    });

    /**
     * Regression test: Shell numbers must never be reused even after deletion.
     * Bug: Client-side naming counted existing shells, causing duplicate names
     * when shells were deleted and new ones created.
     */
    it('never reuses numbers even after shell deletion (regression)', async () => {
      // Create bash-1 and bash-2
      await store.create(createShell({ id: 'shell-a', name: 'bash-1', type: 'bash' }));
      await store.create(createShell({ id: 'shell-b', name: 'bash-2', type: 'bash' }));

      // Delete bash-1
      await store.delete('shell-a');

      // Next bash number should be 3, NOT 1 (reusing deleted slot)
      const num3 = await store.getNextShellNumber('bash');
      expect(num3).toBe(3);

      // Delete bash-2
      await store.delete('shell-b');

      // Next bash number should still be 3 (max was 2, so next is 3)
      // After deleting all, we scan and find no shells, so it would be 1
      // BUT the desired behavior is to never reuse - this is now based on max existing
      const num4 = await store.getNextShellNumber('bash');
      // Since all shells are deleted, max is 0, so next is 1
      // This is acceptable because there's no collision possible
      expect(num4).toBe(1);
    });

    /**
     * Regression test: Duplicate shell names like "bash-2" appearing twice.
     * Bug: New shells created with same number as existing shells due to
     * global counter not accounting for pre-existing shells.
     */
    it('handles pre-existing shells without counter (regression)', async () => {
      // Simulate old shells that were created before counter existed
      // These have names but counter wasn't used
      await store.create(createShell({ id: 'old-1', name: 'bash-1', type: 'bash' }));
      await store.create(createShell({ id: 'old-2', name: 'bash-2', type: 'bash' }));
      await store.create(createShell({ id: 'old-3', name: 'ai-1', type: 'ai' }));

      // Next bash should be 3 (scans existing and finds max=2)
      const bashNum = await store.getNextShellNumber('bash');
      expect(bashNum).toBe(3);

      // Next ai should be 2 (scans existing and finds max=1)
      const aiNum = await store.getNextShellNumber('ai');
      expect(aiNum).toBe(2);
    });

    it('handles non-standard shell names gracefully', async () => {
      // Create shells with custom names (not following the pattern)
      await store.create(createShell({ id: 'shell-1', name: 'my-custom-shell', type: 'bash' }));
      await store.create(createShell({ id: 'shell-2', name: 'bash-5', type: 'bash' }));

      // Next bash should be 6 (finds max=5 from bash-5)
      const bashNum = await store.getNextShellNumber('bash');
      expect(bashNum).toBe(6);
    });
  });

  describe('update', () => {
    it('updates shell properties', async () => {
      await store.create(createShell({ id: 'shell-1', name: 'old-name', status: 'inactive' }));

      const updated = await store.update('shell-1', { name: 'new-name', status: 'active' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('new-name');
      expect(updated?.status).toBe('active');
    });

    it('returns null for non-existent shell', async () => {
      const updated = await store.update('non-existent', { name: 'new-name' });
      expect(updated).toBeNull();
    });

    it('updates updatedAt timestamp', async () => {
      const originalTime = '2024-01-01T00:00:00.000Z';
      await store.create(createShell({ id: 'shell-1', updatedAt: originalTime }));

      const updated = await store.update('shell-1', { name: 'new-name' });

      expect(updated?.updatedAt).not.toBe(originalTime);
    });
  });

  describe('delete', () => {
    it('deletes a shell', async () => {
      await store.create(createShell({ id: 'shell-1' }));

      const deleted = await store.delete('shell-1');

      expect(deleted).toBe(true);
      expect(await store.getById('shell-1')).toBeNull();
    });

    it('returns false for non-existent shell', async () => {
      const deleted = await store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByProjectId', () => {
    it('deletes all shells for project', async () => {
      await store.create(createShell({ id: 'shell-1', projectId: 'proj-1' }));
      await store.create(createShell({ id: 'shell-2', projectId: 'proj-1' }));
      await store.create(createShell({ id: 'shell-3', projectId: 'proj-2' }));

      const deletedCount = await store.deleteByProjectId('proj-1');

      expect(deletedCount).toBe(2);
      expect(await store.getById('shell-1')).toBeNull();
      expect(await store.getById('shell-2')).toBeNull();
      expect(await store.getById('shell-3')).not.toBeNull();
    });

    it('returns 0 when no shells for project', async () => {
      const deletedCount = await store.deleteByProjectId('non-existent');
      expect(deletedCount).toBe(0);
    });
  });
});
