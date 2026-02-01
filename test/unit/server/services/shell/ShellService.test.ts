/**
 * Tests for ShellService
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShellService } from '@server/services/shell/ShellService.js';
import { ShellStore } from '@server/storage/stores/ShellStore.js';
import { ProjectStore } from '@server/storage/stores/ProjectStore.js';
import type { Project } from '@shared/types/index.js';

describe('ShellService', () => {
  let shellService: ShellService;
  let shellStore: ShellStore;
  let projectStore: ProjectStore;
  let tempDir: string;
  let testProject: Project;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'shell-service-test-'));
    shellStore = new ShellStore(join(tempDir, 'shells.json'));
    projectStore = new ProjectStore(join(tempDir, 'projects.json'));

    // Create a test project
    const now = new Date().toISOString();
    testProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/test/project',
      createdAt: now,
      updatedAt: now,
    };
    await projectStore.create(testProject);

    shellService = new ShellService({
      shellStore,
      projectStore,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates a shell with provided name', async () => {
      const shell = await shellService.create(testProject.id, 'custom-name');
      expect(shell.name).toBe('custom-name');
    });

    /**
     * Regression test: Auto-generated bash shell names should use 'bash' prefix
     * Bug: Names were generated as 'shell-1' instead of 'bash-1'
     */
    it('auto-generates bash shell name with bash prefix (regression)', async () => {
      const shell = await shellService.create(testProject.id, undefined, 'bash');
      expect(shell.name).toBe('bash-1');
      expect(shell.type).toBe('bash');
    });

    it('auto-generates ai shell name with ai prefix', async () => {
      const shell = await shellService.create(testProject.id, undefined, 'ai');
      expect(shell.name).toBe('ai-1');
      expect(shell.type).toBe('ai');
    });

    /**
     * Regression test: Shell names must be unique and never collide with existing shells
     * Bug: Client-side naming counted existing shells, causing duplicates after deletion
     */
    it('generates unique names even after deletion (regression)', async () => {
      // Create two shells
      const shell1 = await shellService.create(testProject.id, undefined, 'bash');
      const shell2 = await shellService.create(testProject.id, undefined, 'bash');

      expect(shell1.name).toBe('bash-1');
      expect(shell2.name).toBe('bash-2');

      // Delete first shell
      await shellService.delete(shell1.id);

      // Create a new shell - should be bash-3 (max existing is 2)
      const shell3 = await shellService.create(testProject.id, undefined, 'bash');
      expect(shell3.name).toBe('bash-3');
    });

    /**
     * Regression test: bash and ai shells should have independent numbering
     * Bug: Global counter caused ai shells to skip numbers (e.g., ai-2 after bash-1)
     */
    it('keeps bash and ai numbering independent (regression)', async () => {
      // Create bash-1
      const bash1 = await shellService.create(testProject.id, undefined, 'bash');
      expect(bash1.name).toBe('bash-1');

      // Create ai-1 (should NOT be ai-2 just because bash-1 exists)
      const ai1 = await shellService.create(testProject.id, undefined, 'ai');
      expect(ai1.name).toBe('ai-1');

      // Create bash-2
      const bash2 = await shellService.create(testProject.id, undefined, 'bash');
      expect(bash2.name).toBe('bash-2');

      // Create ai-2
      const ai2 = await shellService.create(testProject.id, undefined, 'ai');
      expect(ai2.name).toBe('ai-2');
    });

    /**
     * Regression test: Duplicate shell names like "bash-2" appearing twice
     * Bug: New shells created with same number as existing shells due to
     * global counter not accounting for pre-existing shells from before counter existed
     */
    it('never creates duplicate names with existing shells (regression)', async () => {
      // Simulate pre-existing shells (created before counter existed)
      // by manually creating shells with specific names
      await shellService.create(testProject.id, 'bash-1', 'bash');
      await shellService.create(testProject.id, 'bash-2', 'bash');

      // Now create a new auto-named shell - should be bash-3, NOT bash-1 or bash-2
      const newShell = await shellService.create(testProject.id, undefined, 'bash');
      expect(newShell.name).toBe('bash-3');

      // Verify no duplicates exist
      const allShells = await shellService.getByProjectId(testProject.id);
      const bashNames = allShells.filter((s) => s.name.startsWith('bash-')).map((s) => s.name);
      const uniqueNames = new Set(bashNames);
      expect(bashNames.length).toBe(uniqueNames.size); // All names are unique
    });

    it('creates shell with worktree path', async () => {
      const worktreePath = '/test/project/.worktrees/feature';
      const shell = await shellService.create(testProject.id, undefined, 'bash', worktreePath);

      expect(shell.worktreePath).toBe(worktreePath);
      expect(shell.cwd).toBe(worktreePath);
    });

    it('throws error for non-existent project', async () => {
      await expect(shellService.create('non-existent-project')).rejects.toThrow('Project not found');
    });
  });

  describe('getByProjectId', () => {
    it('returns shells for a project', async () => {
      await shellService.create(testProject.id, 'shell-a');
      await shellService.create(testProject.id, 'shell-b');

      const shells = await shellService.getByProjectId(testProject.id);
      expect(shells).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('returns shell by id', async () => {
      const created = await shellService.create(testProject.id, 'test-shell');
      const retrieved = await shellService.getById(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('test-shell');
    });

    it('returns null for non-existent shell', async () => {
      const shell = await shellService.getById('non-existent');
      expect(shell).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a shell', async () => {
      const shell = await shellService.create(testProject.id, 'to-delete');
      const deleted = await shellService.delete(shell.id);

      expect(deleted).toBe(true);
      expect(await shellService.getById(shell.id)).toBeNull();
    });

    it('returns false for non-existent shell', async () => {
      const deleted = await shellService.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('update', () => {
    it('updates shell name', async () => {
      const shell = await shellService.create(testProject.id, 'old-name');
      const updated = await shellService.update(shell.id, { name: 'new-name' });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('new-name');
    });

    it('returns null for non-existent shell', async () => {
      const updated = await shellService.update('non-existent', { name: 'test' });
      expect(updated).toBeNull();
    });
  });

  describe('getByWorktreePath', () => {
    it('returns shells for a worktree', async () => {
      const worktreePath = '/test/worktree';
      await shellService.create(testProject.id, 'wt-shell-1', 'bash', worktreePath);
      await shellService.create(testProject.id, 'wt-shell-2', 'ai', worktreePath);

      const shells = await shellService.getByWorktreePath(worktreePath);
      expect(shells).toHaveLength(2);
    });

    it('does not return project shells (no worktreePath)', async () => {
      const worktreePath = '/test/worktree';
      await shellService.create(testProject.id, 'project-shell'); // No worktreePath
      await shellService.create(testProject.id, 'wt-shell', 'bash', worktreePath);

      const shells = await shellService.getByWorktreePath(worktreePath);
      expect(shells).toHaveLength(1);
      expect(shells[0]?.name).toBe('wt-shell');
    });
  });
});
