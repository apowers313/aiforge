/**
 * Tests for GitService
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  withGitTestSandbox,
  createIsolatedTestRepo,
  createIsolatedTestRepoWithCommit,
} from '@test/helpers/git-sandbox.js';
import { GitService } from '@server/services/git/GitService.js';

describe('GitService', () => {
  describe('isGitRepository', () => {
    it('should return true for git repo', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        expect(await gitService.isGitRepository()).toBe(true);
      });
    });

    it('should return true for empty git repo (no commits)', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepo(sandbox);
        const gitService = new GitService(path);

        expect(await gitService.isGitRepository()).toBe(true);
      });
    });

    it('should return false for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        expect(await gitService.isGitRepository()).toBe(false);
      });
    });

    it('should return false for non-existent directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonExistentPath = join(sandbox.getWorkspacePath(), 'does-not-exist');
        const gitService = new GitService(nonExistentPath);

        expect(await gitService.isGitRepository()).toBe(false);
      });
    });
  });

  describe('hasCommits', () => {
    it('should return true for repo with commits', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        expect(await gitService.hasCommits()).toBe(true);
      });
    });

    it('should return false for empty repo (no commits)', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepo(sandbox);
        const gitService = new GitService(path);

        expect(await gitService.hasCommits()).toBe(false);
      });
    });

    it('should return false for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        expect(await gitService.hasCommits()).toBe(false);
      });
    });
  });

  describe('listWorktrees', () => {
    it('should list main worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        const worktrees = await gitService.listWorktrees();

        expect(worktrees).toHaveLength(1);
        expect(worktrees[0]).toMatchObject({
          path: path,
          branch: 'main',
          isMain: true,
          isLocked: false,
        });
        expect(worktrees[0].commit).toMatch(/^[0-9a-f]{40}$/);
      });
    });

    it('should list multiple worktrees', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
        await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

        const gitService = new GitService(path);
        const worktrees = await gitService.listWorktrees();

        expect(worktrees).toHaveLength(2);

        const mainWorktree = worktrees.find((w) => w.isMain);
        expect(mainWorktree).toBeDefined();
        expect(mainWorktree?.path).toBe(path);
        expect(mainWorktree?.branch).toBe('main');

        const featureWorktree = worktrees.find((w) => !w.isMain);
        expect(featureWorktree).toBeDefined();
        expect(featureWorktree?.path).toBe(wtPath);
        expect(featureWorktree?.branch).toBe('feature');
      });
    });

    it('should detect locked worktrees', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'locked');
        await git.raw(['worktree', 'add', '-b', 'locked', wtPath]);
        await git.raw(['worktree', 'lock', wtPath]);

        const gitService = new GitService(path);
        const worktrees = await gitService.listWorktrees();

        const lockedWorktree = worktrees.find((w) => w.path === wtPath);
        expect(lockedWorktree?.isLocked).toBe(true);
      });
    });

    it('should return empty array for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        const worktrees = await gitService.listWorktrees();

        expect(worktrees).toEqual([]);
      });
    });

    it('should return empty array for repo without commits', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepo(sandbox);
        const gitService = new GitService(path);

        const worktrees = await gitService.listWorktrees();

        expect(worktrees).toEqual([]);
      });
    });

    it('should handle detached HEAD worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);

        // Get the commit hash
        const log = await git.log();
        const commitHash = log.latest?.hash;
        if (!commitHash) {
          throw new Error('No commits found');
        }

        // Create a worktree in detached HEAD state
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'detached');
        await git.raw(['worktree', 'add', '--detach', wtPath, commitHash]);

        const gitService = new GitService(path);
        const worktrees = await gitService.listWorktrees();

        const detachedWorktree = worktrees.find((w) => w.path === wtPath);
        expect(detachedWorktree).toBeDefined();
        expect(detachedWorktree?.branch).toBe('(detached)');
      });
    });
  });

  describe('getBaseDir', () => {
    it('should return the base directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        expect(gitService.getBaseDir()).toBe(path);
      });
    });
  });

  describe('getMainBranch', () => {
    it('should detect main branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        const mainBranch = await gitService.getMainBranch();
        expect(['main', 'master']).toContain(mainBranch);
      });
    });

    it('should return main when no branches exist', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepo(sandbox);
        const gitService = new GitService(path);

        const mainBranch = await gitService.getMainBranch();
        expect(mainBranch).toBe('main');
      });
    });

    it('should return main for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        const mainBranch = await gitService.getMainBranch();
        expect(mainBranch).toBe('main');
      });
    });
  });

  describe('branchExists', () => {
    it('should return true for existing branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.branch(['feature-branch']);
        const gitService = new GitService(path);

        expect(await gitService.branchExists('feature-branch')).toBe(true);
        expect(await gitService.branchExists('main')).toBe(true);
      });
    });

    it('should return false for non-existing branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        expect(await gitService.branchExists('non-existent')).toBe(false);
      });
    });

    it('should return false for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        expect(await gitService.branchExists('main')).toBe(false);
      });
    });
  });

  describe('createWorktree', () => {
    it('should create worktree with new branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'new-feature');

        await gitService.createWorktree(wtPath, 'new-feature');

        // Verify worktree was created
        const stat = await import('node:fs/promises').then((m) => m.stat);
        const stats = await stat(wtPath);
        expect(stats.isDirectory()).toBe(true);

        // Verify it appears in worktree list
        const worktrees = await gitService.listWorktrees();
        expect(worktrees).toHaveLength(2);
        const newWorktree = worktrees.find((w) => w.path === wtPath);
        expect(newWorktree).toBeDefined();
        expect(newWorktree?.branch).toBe('new-feature');
      });
    });

    it('should create worktree from specific base branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);

        // Create a develop branch with an extra commit
        await git.checkout(['-b', 'develop']);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(path, 'develop.txt'), 'develop content');
        await git.add('develop.txt');
        await git.commit('Develop commit');
        await git.checkout('main');

        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature-from-develop');

        await gitService.createWorktree(wtPath, 'feature-from-develop', 'develop');

        // Verify worktree was created
        const worktrees = await gitService.listWorktrees();
        const newWorktree = worktrees.find((w) => w.path === wtPath);
        expect(newWorktree).toBeDefined();
        expect(newWorktree?.branch).toBe('feature-from-develop');

        // The worktree should have the develop.txt file since it's based on develop
        const stat = await import('node:fs/promises').then((m) => m.stat);
        const fileExists = await stat(join(wtPath, 'develop.txt'))
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      });
    });

    it('should throw for existing branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.branch(['existing-branch']);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'existing');

        await expect(gitService.createWorktree(wtPath, 'existing-branch')).rejects.toThrow(
          /already exists/,
        );
      });
    });

    it('should throw for non-existent base branch', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'new-feature');

        await expect(
          gitService.createWorktree(wtPath, 'new-feature', 'non-existent-base'),
        ).rejects.toThrow(/does not exist/);
      });
    });

    it('should throw for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'new-feature');

        // Non-git directory will fail either with "Not a git repository" or "has no commits"
        // depending on internal checks order
        await expect(gitService.createWorktree(wtPath, 'new-feature')).rejects.toThrow(
          /Not a git repository|has no commits/,
        );
      });
    });

    it('should throw for repo without commits', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepo(sandbox);
        const gitService = new GitService(path);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'new-feature');

        await expect(gitService.createWorktree(wtPath, 'new-feature')).rejects.toThrow(
          /has no commits/,
        );
      });
    });
  });

  describe('getModifiedFileCount', () => {
    it('should count modified files', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(path, 'modified.txt'), 'content');

        const gitService = new GitService(path);
        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(1);
      });
    });

    it('should count untracked files', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(path, 'new-file.txt'), 'content');

        const gitService = new GitService(path);
        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(1);
      });
    });

    it('should count modified and untracked files together', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const { writeFile } = await import('node:fs/promises');

        // Modify existing file
        await writeFile(join(path, 'README.md'), 'modified content');
        // Add new untracked file
        await writeFile(join(path, 'new-file.txt'), 'new content');

        // Create a tracked file then modify it (staged)
        await writeFile(join(path, 'staged.txt'), 'staged content');
        await git.add('staged.txt');

        const gitService = new GitService(path);
        const count = await gitService.getModifiedFileCount();

        // README.md (modified), new-file.txt (untracked), staged.txt (staged)
        expect(count).toBe(3);
      });
    });

    it('should return 0 for clean worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);

        const gitService = new GitService(path);
        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(0);
      });
    });

    it('should count files in specific worktree path', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
        await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

        // Add modified file only in the worktree
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(wtPath, 'worktree-file.txt'), 'content');

        // Create GitService for the worktree
        const gitService = new GitService(wtPath);
        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(1);
      });
    });

    it('should return 0 for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        const count = await gitService.getModifiedFileCount();

        expect(count).toBe(0);
      });
    });
  });

  describe('getAheadBehind', () => {
    it('should return ahead count when branch has commits', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.checkout(['-b', 'feature']);
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(path, 'new.txt'), 'content');
        await git.add('.');
        await git.commit('feature commit');

        const gitService = new GitService(path);
        const result = await gitService.getAheadBehind('main');

        expect(result.ahead).toBe(1);
        expect(result.behind).toBe(0);
      });
    });

    it('should return behind count when target branch has commits', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.checkout(['-b', 'feature']);
        await git.checkout('main');

        // Add commit to main
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(path, 'main-file.txt'), 'content');
        await git.add('.');
        await git.commit('main commit');

        // Switch back to feature
        await git.checkout('feature');

        const gitService = new GitService(path);
        const result = await gitService.getAheadBehind('main');

        expect(result.ahead).toBe(0);
        expect(result.behind).toBe(1);
      });
    });

    it('should return both ahead and behind counts', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.checkout(['-b', 'feature']);
        const { writeFile } = await import('node:fs/promises');

        // Add commit to feature
        await writeFile(join(path, 'feature.txt'), 'content');
        await git.add('.');
        await git.commit('feature commit');

        // Switch to main and add commit
        await git.checkout('main');
        await writeFile(join(path, 'main.txt'), 'content');
        await git.add('.');
        await git.commit('main commit');

        // Switch back to feature
        await git.checkout('feature');

        const gitService = new GitService(path);
        const result = await gitService.getAheadBehind('main');

        expect(result.ahead).toBe(1);
        expect(result.behind).toBe(1);
      });
    });

    it('should return zeros when branches are in sync', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        await git.checkout(['-b', 'feature']);

        const gitService = new GitService(path);
        const result = await gitService.getAheadBehind('main');

        expect(result.ahead).toBe(0);
        expect(result.behind).toBe(0);
      });
    });

    it('should return zeros for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);

        const result = await gitService.getAheadBehind('main');

        expect(result.ahead).toBe(0);
        expect(result.behind).toBe(0);
      });
    });

    it('should return zeros when target branch does not exist', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        const result = await gitService.getAheadBehind('non-existent-branch');

        expect(result.ahead).toBe(0);
        expect(result.behind).toBe(0);
      });
    });
  });

  describe('removeWorktree', () => {
    it('should remove worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'to-remove');
        await git.raw(['worktree', 'add', '-b', 'to-remove', wtPath]);

        const gitService = new GitService(path);
        await gitService.removeWorktree(wtPath);

        // Verify worktree was removed
        const worktrees = await gitService.listWorktrees();
        expect(worktrees).toHaveLength(1);
        expect(worktrees[0].isMain).toBe(true);

        // Verify the directory was removed
        const { stat } = await import('node:fs/promises');
        const exists = await stat(wtPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      });
    });

    it('should force remove dirty worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'dirty');
        await git.raw(['worktree', 'add', '-b', 'dirty', wtPath]);

        // Make worktree dirty by adding uncommitted changes
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(wtPath, 'uncommitted.txt'), 'dirty content');

        const gitService = new GitService(path);
        await gitService.removeWorktree(wtPath, true);

        // Verify worktree was removed
        const worktrees = await gitService.listWorktrees();
        expect(worktrees).toHaveLength(1);

        // Verify the directory was removed
        const { stat } = await import('node:fs/promises');
        const exists = await stat(wtPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(false);
      });
    });

    it('should throw when trying to remove main worktree', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);

        await expect(gitService.removeWorktree(path)).rejects.toThrow(/main worktree/);
      });
    });

    it('should throw for non-existent worktree path', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const { path } = await createIsolatedTestRepoWithCommit(sandbox);
        const gitService = new GitService(path);
        const nonExistentPath = join(sandbox.getWorkspacePath(), '.worktrees', 'non-existent');

        await expect(gitService.removeWorktree(nonExistentPath)).rejects.toThrow(/not a working tree/);
      });
    });

    it('should throw for non-git directory', async () => {
      await withGitTestSandbox(async (sandbox) => {
        const nonGitPath = join(sandbox.getWorkspacePath(), 'not-a-repo');
        await mkdir(nonGitPath, { recursive: true });
        const gitService = new GitService(nonGitPath);
        const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'some-worktree');

        await expect(gitService.removeWorktree(wtPath)).rejects.toThrow(/Not a git repository/);
      });
    });
  });
});
