/**
 * Tests for WorktreeService
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Project } from '@shared/types/index.js';
import {
  withGitTestSandbox,
  createIsolatedTestRepoWithCommit,
  type GitTestSandbox,
} from '@test/helpers/git-sandbox.js';
import { WorktreeService } from '@server/services/project/WorktreeService.js';

// Mock project store
function createMockProjectStore(projects: Project[]): { getById: (id: string) => Promise<Project | null> } {
  return {
    getById: vi.fn((id: string) => Promise.resolve(projects.find((p) => p.id === id) ?? null)),
  };
}

describe('WorktreeService', () => {
  let sandbox: GitTestSandbox;
  let gitRepoPath: string;
  let nonGitPath: string;
  let projectService: WorktreeService;
  let gitProjectId: string;
  let nonGitProjectId: string;
  let projects: Project[];

  beforeEach(async () => {
    // Create a fresh sandbox for each test
    sandbox = (await import('@test/helpers/git-sandbox.js')).default
      ? new (await import('@test/helpers/git-sandbox.js')).GitTestSandbox()
      : new (await import('@test/helpers/git-sandbox.js')).GitTestSandbox();

    await sandbox.setup();

    // Create a git repo
    const repo = await createIsolatedTestRepoWithCommit(sandbox);
    gitRepoPath = repo.path;
    gitProjectId = randomUUID();

    // Create a non-git directory
    nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
    await mkdir(nonGitPath, { recursive: true });
    nonGitProjectId = randomUUID();

    // Create projects array
    const now = new Date().toISOString();
    projects = [
      {
        id: gitProjectId,
        name: 'git-project',
        path: gitRepoPath,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: nonGitProjectId,
        name: 'non-git-project',
        path: nonGitPath,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Create service with mock project store
    const mockStore = createMockProjectStore(projects);
    projectService = new WorktreeService({
      projectStore: mockStore as unknown as Parameters<typeof WorktreeService.prototype.constructor>[0]['projectStore'],
    });
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  describe('isGitRepository', () => {
    it('should return true for git repository project', async () => {
      const isRepo = await projectService.isGitRepository(gitProjectId);
      expect(isRepo).toBe(true);
    });

    it('should return false for non-git project', async () => {
      const isRepo = await projectService.isGitRepository(nonGitProjectId);
      expect(isRepo).toBe(false);
    });

    it('should return false for non-existent project', async () => {
      const isRepo = await projectService.isGitRepository('non-existent-id');
      expect(isRepo).toBe(false);
    });
  });

  describe('getWorktrees', () => {
    it('should return worktrees for git project', async () => {
      const worktrees = await projectService.getWorktrees(gitProjectId);

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0]).toMatchObject({
        path: gitRepoPath,
        branch: 'main',
        isMain: true,
        name: 'main',
        modifiedCount: 0,
        ahead: 0,
        behind: 0,
      });
    });

    it('should return multiple worktrees when present', async () => {
      // This test is covered more comprehensively in 'WorktreeService with multiple worktrees'
      // Here we just verify that the main worktree is returned
      const worktrees = await projectService.getWorktrees(gitProjectId);
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
      expect(worktrees[0].isMain).toBe(true);
    });

    it('should return empty array for non-git project', async () => {
      const worktrees = await projectService.getWorktrees(nonGitProjectId);
      expect(worktrees).toEqual([]);
    });

    it('should return empty array for non-existent project', async () => {
      const worktrees = await projectService.getWorktrees('non-existent-id');
      expect(worktrees).toEqual([]);
    });

    it('should set name from branch for main worktree', async () => {
      const worktrees = await projectService.getWorktrees(gitProjectId);
      expect(worktrees[0].name).toBe('main');
    });
  });

  describe('getMainBranch', () => {
    it('should return main branch for git project', async () => {
      const mainBranch = await projectService.getMainBranch(gitProjectId);
      expect(['main', 'master']).toContain(mainBranch);
    });

    it('should return main for non-git project', async () => {
      const mainBranch = await projectService.getMainBranch(nonGitProjectId);
      expect(mainBranch).toBe('main');
    });

    it('should return main for non-existent project', async () => {
      const mainBranch = await projectService.getMainBranch('non-existent-id');
      expect(mainBranch).toBe('main');
    });
  });

  describe('createWorktree', () => {
    it('should create worktree with new branch', async () => {
      const worktree = await projectService.createWorktree(gitProjectId, 'new-feature');

      expect(worktree).toBeDefined();
      expect(worktree.branch).toBe('new-feature');
      expect(worktree.name).toBe('new-feature');
      expect(worktree.path).toContain('.worktrees/new-feature');
      expect(worktree.isMain).toBe(false);
    });

    it('should throw for non-existent project', async () => {
      await expect(projectService.createWorktree('non-existent-id', 'feature')).rejects.toThrow(
        /Project not found/,
      );
    });

    it('should throw for non-git project', async () => {
      await expect(projectService.createWorktree(nonGitProjectId, 'feature')).rejects.toThrow(
        /not a git repository/,
      );
    });

    it('should throw for existing branch', async () => {
      // First create a branch
      const { simpleGit } = await import('simple-git');
      const git = simpleGit(gitRepoPath);
      await git.branch(['existing-branch']);

      await expect(projectService.createWorktree(gitProjectId, 'existing-branch')).rejects.toThrow(
        /already exists/,
      );
    });

    it('should create worktree from specific base branch', async () => {
      // First create a develop branch
      const { simpleGit } = await import('simple-git');
      const { writeFile } = await import('node:fs/promises');
      const git = simpleGit(gitRepoPath);
      await git.checkout(['-b', 'develop']);
      await writeFile(join(gitRepoPath, 'develop.txt'), 'develop content');
      await git.add('develop.txt');
      await git.commit('Develop commit');
      await git.checkout('main');

      const worktree = await projectService.createWorktree(
        gitProjectId,
        'feature-from-develop',
        'develop',
      );

      expect(worktree).toBeDefined();
      expect(worktree.branch).toBe('feature-from-develop');

      // Verify the worktree has the develop.txt file
      const { stat } = await import('node:fs/promises');
      const fileExists = await stat(join(worktree.path, 'develop.txt'))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should throw for non-existent base branch', async () => {
      await expect(
        projectService.createWorktree(gitProjectId, 'feature', 'non-existent-base'),
      ).rejects.toThrow(/does not exist/);
    });
  });

  describe('deleteWorktree', () => {
    it('should delete worktree', async () => {
      // First create a worktree
      const worktree = await projectService.createWorktree(gitProjectId, 'to-delete');
      expect(worktree).toBeDefined();

      // Delete it
      const deleted = await projectService.deleteWorktree(gitProjectId, worktree.path);
      expect(deleted).toBe(true);

      // Verify it's gone
      const worktrees = await projectService.getWorktrees(gitProjectId);
      expect(worktrees).toHaveLength(1);
      expect(worktrees[0].isMain).toBe(true);
    });

    it('should force delete dirty worktree', async () => {
      // First create a worktree
      const worktree = await projectService.createWorktree(gitProjectId, 'dirty-wt');
      expect(worktree).toBeDefined();

      // Make it dirty
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(worktree.path, 'uncommitted.txt'), 'dirty content');

      // Delete it with force
      const deleted = await projectService.deleteWorktree(gitProjectId, worktree.path, true);
      expect(deleted).toBe(true);

      // Verify it's gone
      const worktrees = await projectService.getWorktrees(gitProjectId);
      expect(worktrees).toHaveLength(1);
    });

    it('should throw for non-existent project', async () => {
      await expect(
        projectService.deleteWorktree('non-existent-id', '/some/path'),
      ).rejects.toThrow(/Project not found/);
    });

    it('should throw for non-git project', async () => {
      await expect(
        projectService.deleteWorktree(nonGitProjectId, '/some/path'),
      ).rejects.toThrow(/Not a git repository/);
    });

    it('should throw when trying to delete main worktree', async () => {
      await expect(
        projectService.deleteWorktree(gitProjectId, gitRepoPath),
      ).rejects.toThrow(/main worktree/);
    });
  });
});

describe('WorktreeService with multiple worktrees', () => {
  it('should return worktrees with correct properties', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
      const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
      await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

      const projectId = randomUUID();
      const now = new Date().toISOString();
      const projects: Project[] = [
        {
          id: projectId,
          name: 'test-project',
          path: path,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const mockStore = createMockProjectStore(projects);
      const service = new WorktreeService({
        projectStore: mockStore as unknown as Parameters<typeof WorktreeService.prototype.constructor>[0]['projectStore'],
      });

      const worktrees = await service.getWorktrees(projectId);

      expect(worktrees).toHaveLength(2);

      const mainWorktree = worktrees.find((w) => w.isMain);
      expect(mainWorktree).toBeDefined();
      expect(mainWorktree?.name).toBe('main');
      expect(mainWorktree?.modifiedCount).toBe(0);

      const featureWorktree = worktrees.find((w) => !w.isMain);
      expect(featureWorktree).toBeDefined();
      expect(featureWorktree?.name).toBe('feature');
      expect(featureWorktree?.modifiedCount).toBe(0);
    });
  });
});
