/**
 * Git test sandbox for isolated git testing
 * Provides temporary directories and git config isolation
 */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * GitTestSandbox provides isolated git testing environment
 */
export class GitTestSandbox {
  private workspacePath: string | null = null;
  private gitConfigPath: string | null = null;
  private originalGitConfigGlobal: string | undefined;

  /**
   * Set up the sandbox environment
   */
  async setup(): Promise<void> {
    // Create temp workspace
    this.workspacePath = await mkdtemp(join(tmpdir(), 'aiforge-test-'));

    // Create isolated git config
    this.gitConfigPath = join(this.workspacePath, '.gitconfig');
    await writeFile(
      this.gitConfigPath,
      `[user]
\tname = Test User
\temail = test@example.com
[init]
\tdefaultBranch = main
`,
    );

    // Store original and set isolated git config
    this.originalGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = this.gitConfigPath;
  }

  /**
   * Clean up the sandbox environment
   */
  async cleanup(): Promise<void> {
    // Restore original git config
    if (this.originalGitConfigGlobal !== undefined) {
      process.env.GIT_CONFIG_GLOBAL = this.originalGitConfigGlobal;
    } else {
      delete process.env.GIT_CONFIG_GLOBAL;
    }

    // Remove temp workspace
    if (this.workspacePath) {
      await rm(this.workspacePath, { recursive: true, force: true });
      this.workspacePath = null;
    }
  }

  /**
   * Get the workspace path
   */
  getWorkspacePath(): string {
    if (!this.workspacePath) {
      throw new Error('Sandbox not initialized. Call setup() first.');
    }
    return this.workspacePath;
  }

  /**
   * Get the git config path
   */
  getGitConfigPath(): string {
    if (!this.gitConfigPath) {
      throw new Error('Sandbox not initialized. Call setup() first.');
    }
    return this.gitConfigPath;
  }
}

/**
 * Helper to run tests within a git sandbox context
 */
export async function withGitTestSandbox<T>(
  fn: (sandbox: GitTestSandbox) => Promise<T>,
): Promise<T> {
  const sandbox = new GitTestSandbox();
  await sandbox.setup();
  try {
    return await fn(sandbox);
  } finally {
    await sandbox.cleanup();
  }
}

/**
 * Result of creating a test repo
 */
export interface TestRepo {
  path: string;
  git: SimpleGit;
}

/**
 * Create an isolated test git repository (no commits)
 */
export async function createIsolatedTestRepo(sandbox: GitTestSandbox): Promise<TestRepo> {
  const repoPath = join(sandbox.getWorkspacePath(), `repo-${String(Date.now())}`);
  await mkdir(repoPath, { recursive: true });

  const git = simpleGit(repoPath);
  await git.init();

  return { path: repoPath, git };
}

/**
 * Create an isolated test git repository with an initial commit
 */
export async function createIsolatedTestRepoWithCommit(sandbox: GitTestSandbox): Promise<TestRepo> {
  const { path, git } = await createIsolatedTestRepo(sandbox);

  // Create initial file and commit
  await writeFile(join(path, 'README.md'), '# Test Repo\n');
  await git.add('README.md');
  await git.commit('Initial commit');

  return { path, git };
}

/**
 * Create an isolated test git repository with branches
 */
export async function createIsolatedTestRepoWithBranches(
  sandbox: GitTestSandbox,
  branches: string[],
): Promise<TestRepo> {
  const { path, git } = await createIsolatedTestRepoWithCommit(sandbox);

  // Create each branch
  for (const branch of branches) {
    await git.branch([branch]);
  }

  return { path, git };
}

/**
 * List worktrees in a test repo using git CLI
 */
export async function listTestWorktrees(git: SimpleGit): Promise<string[]> {
  const result = await git.raw(['worktree', 'list', '--porcelain']);
  const worktrees: string[] = [];

  for (const line of result.split('\n')) {
    if (line.startsWith('worktree ')) {
      worktrees.push(line.substring(9));
    }
  }

  return worktrees;
}

/**
 * Result of creating a test worktree
 */
export interface TestWorktree {
  path: string;
  branch: string;
  mainRepoPath: string;
  git: SimpleGit;
}

/**
 * Create a test worktree in a git repository
 * @param sandbox - The git test sandbox
 * @param branchName - Optional branch name (defaults to 'test-worktree')
 * @param baseBranch - Optional base branch to create from
 */
export async function createTestWorktree(
  sandbox: GitTestSandbox,
  branchName = 'test-worktree',
  baseBranch?: string,
): Promise<TestWorktree> {
  // First create a repo if we don't have one
  const { path: mainRepoPath, git } = await createIsolatedTestRepoWithCommit(sandbox);

  // Create the worktree path
  const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', branchName);

  // Build the git worktree add command
  const args = ['worktree', 'add', '-b', branchName, wtPath];
  if (baseBranch) {
    args.push(baseBranch);
  }

  await git.raw(args);

  return {
    path: wtPath,
    branch: branchName,
    mainRepoPath,
    git,
  };
}
