/**
 * Tests for GitTestSandbox
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GitTestSandbox,
  withGitTestSandbox,
  createIsolatedTestRepo,
  createIsolatedTestRepoWithCommit,
  createIsolatedTestRepoWithBranches,
  listTestWorktrees,
} from './git-sandbox.js';

describe('GitTestSandbox', () => {
  let sandbox: GitTestSandbox | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.cleanup();
      sandbox = null;
    }
  });

  it('should create isolated temp directory', async () => {
    sandbox = new GitTestSandbox();
    await sandbox.setup();

    expect(sandbox.getWorkspacePath()).toMatch(/aiforge-test-/);
    const stats = await stat(sandbox.getWorkspacePath());
    expect(stats.isDirectory()).toBe(true);
  });

  it('should isolate git config', async () => {
    await withGitTestSandbox((sb) => {
      expect(process.env.GIT_CONFIG_GLOBAL).toBe(sb.getGitConfigPath());
      return Promise.resolve();
    });
  });

  it('should restore original git config after cleanup', async () => {
    const originalValue = process.env.GIT_CONFIG_GLOBAL;

    await withGitTestSandbox((_sb) => {
      // Inside sandbox, git config should be changed
      expect(process.env.GIT_CONFIG_GLOBAL).not.toBe(originalValue);
      return Promise.resolve();
    });

    // After cleanup, should be restored
    expect(process.env.GIT_CONFIG_GLOBAL).toBe(originalValue);
  });

  it('should clean up temp directory after cleanup', async () => {
    let workspacePath = '';

    await withGitTestSandbox((sb) => {
      workspacePath = sb.getWorkspacePath();
      expect(existsSync(workspacePath)).toBe(true);
      return Promise.resolve();
    });

    // After cleanup, directory should be gone
    expect(existsSync(workspacePath)).toBe(false);
  });

  it('should throw if getWorkspacePath called before setup', () => {
    const sb = new GitTestSandbox();
    expect(() => sb.getWorkspacePath()).toThrow('Sandbox not initialized');
  });

  it('should throw if getGitConfigPath called before setup', () => {
    const sb = new GitTestSandbox();
    expect(() => sb.getGitConfigPath()).toThrow('Sandbox not initialized');
  });
});

describe('createIsolatedTestRepo', () => {
  it('should create a git repository', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { path, git } = await createIsolatedTestRepo(sandbox);

      // Check it's a git repo
      const isRepo = await git
        .checkIsRepo()
        .catch(() => false);
      expect(isRepo).toBe(true);

      // Check path exists
      expect(existsSync(path)).toBe(true);
    });
  });

  it('should have no commits initially', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { git } = await createIsolatedTestRepo(sandbox);

      // Trying to get log should fail for empty repo
      const log = await git.log().catch(() => null);
      expect(log).toBeNull();
    });
  });
});

describe('createIsolatedTestRepoWithCommit', () => {
  it('should create a git repository with a commit', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);

      // Check it's a git repo
      const isRepo = await git.checkIsRepo();
      expect(isRepo).toBe(true);

      // Check there is at least one commit
      const log = await git.log();
      expect(log.total).toBeGreaterThan(0);
      expect(log.latest?.message).toBe('Initial commit');

      // Check README.md exists
      expect(existsSync(join(path, 'README.md'))).toBe(true);
    });
  });
});

describe('createIsolatedTestRepoWithBranches', () => {
  it('should create branches', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { git } = await createIsolatedTestRepoWithBranches(sandbox, ['feature-1', 'feature-2']);

      const branches = await git.branchLocal();
      expect(branches.all).toContain('main');
      expect(branches.all).toContain('feature-1');
      expect(branches.all).toContain('feature-2');
    });
  });
});

describe('listTestWorktrees', () => {
  it('should list main worktree', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);

      const worktrees = await listTestWorktrees(git);

      expect(worktrees).toHaveLength(1);
      expect(worktrees[0]).toBe(path);
    });
  });

  it('should list multiple worktrees', async () => {
    await withGitTestSandbox(async (sandbox) => {
      const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);
      const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
      await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

      const worktrees = await listTestWorktrees(git);

      expect(worktrees).toHaveLength(2);
      expect(worktrees).toContain(path);
      expect(worktrees).toContain(wtPath);
    });
  });
});
