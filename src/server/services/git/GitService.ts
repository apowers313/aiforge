/**
 * GitService - Centralized git operations for a repository
 *
 * This service provides git operations for a specific directory.
 * Phase 2 implements: isGitRepository, hasCommits, listWorktrees
 */
import { simpleGit, type SimpleGit, type StatusResult, type RemoteWithRefs } from 'simple-git';
import { stat } from 'node:fs/promises';
import type { Worktree } from '@shared/types/index.js';

/**
 * Parse git worktree list --porcelain output into Worktree objects
 */
function parseWorktreeListOutput(output: string, mainWorktreePath: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const lines = output.split('\n');

  let currentWorktree: Partial<Worktree> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      // Start of a new worktree entry
      if (currentWorktree.path) {
        // Save the previous worktree
        worktrees.push(currentWorktree as Worktree);
      }
      currentWorktree = {
        path: line.substring(9),
        branch: '',
        commit: '',
        isMain: false,
        isLocked: false,
      };
    } else if (line.startsWith('HEAD ')) {
      currentWorktree.commit = line.substring(5);
    } else if (line.startsWith('branch ')) {
      // Extract branch name from refs/heads/xxx format
      const fullRef = line.substring(7);
      currentWorktree.branch = fullRef.replace('refs/heads/', '');
    } else if (line === 'detached') {
      currentWorktree.branch = '(detached)';
    } else if (line === 'locked') {
      currentWorktree.isLocked = true;
    } else if (line === 'bare') {
      // Skip bare worktrees
      currentWorktree = {};
    }
  }

  // Don't forget the last worktree
  if (currentWorktree.path) {
    worktrees.push(currentWorktree as Worktree);
  }

  // Mark the main worktree
  for (const wt of worktrees) {
    if (wt.path === mainWorktreePath) {
      wt.isMain = true;
    }
  }

  return worktrees;
}

/**
 * Check if a directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export class GitService {
  private git: SimpleGit | null = null;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Get or create the SimpleGit instance (lazy initialization)
   */
  private async getGit(): Promise<SimpleGit | null> {
    if (this.git) {
      return this.git;
    }

    // Check if directory exists before creating git instance
    if (!(await directoryExists(this.baseDir))) {
      return null;
    }

    this.git = simpleGit(this.baseDir);
    return this.git;
  }

  /**
   * Get the base directory this service operates on
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Check if the directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      const git = await this.getGit();
      if (!git) {
        return false;
      }
      return await git.checkIsRepo();
    } catch {
      return false;
    }
  }

  /**
   * Check if the repository has any commits
   */
  async hasCommits(): Promise<boolean> {
    try {
      const isRepo = await this.isGitRepository();
      if (!isRepo) {
        return false;
      }

      const git = await this.getGit();
      if (!git) {
        return false;
      }

      // Try to get log - will fail if no commits
      const log = await git.log({ maxCount: 1 });
      return log.total > 0;
    } catch {
      return false;
    }
  }

  /**
   * List all worktrees in the repository
   * Returns empty array if not a git repo or has no commits
   */
  async listWorktrees(): Promise<Worktree[]> {
    try {
      // Must be a git repo with commits
      if (!(await this.hasCommits())) {
        return [];
      }

      const git = await this.getGit();
      if (!git) {
        return [];
      }

      // Get worktree list in porcelain format
      const output = await git.raw(['worktree', 'list', '--porcelain']);

      // Parse the output
      return parseWorktreeListOutput(output, this.baseDir);
    } catch {
      return [];
    }
  }

  /**
   * Get the main branch name (main or master)
   * Returns 'main' by default if unable to determine
   */
  async getMainBranch(): Promise<string> {
    try {
      const git = await this.getGit();
      if (!git) {
        return 'main';
      }

      // Try to get the default branch from git config
      try {
        const defaultBranch = await git.raw(['config', '--get', 'init.defaultBranch']);
        if (defaultBranch.trim()) {
          return defaultBranch.trim();
        }
      } catch {
        // Config not set, fall through to branch check
      }

      // Check if common branch names exist
      const branches = await git.branchLocal();
      if (branches.all.includes('main')) {
        return 'main';
      }
      if (branches.all.includes('master')) {
        return 'master';
      }

      // Return the current branch if no main/master
      if (branches.current) {
        return branches.current;
      }

      return 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      const git = await this.getGit();
      if (!git) {
        return false;
      }

      const branches = await git.branchLocal();
      return branches.all.includes(branchName);
    } catch {
      return false;
    }
  }

  /**
   * Create a new worktree with a new branch
   * @param worktreePath - Path where the worktree will be created
   * @param branchName - Name of the new branch to create
   * @param baseBranch - Optional base branch to create from (defaults to detected main branch)
   */
  async createWorktree(worktreePath: string, branchName: string, baseBranch?: string): Promise<void> {
    const git = await this.getGit();
    if (!git) {
      throw new Error('Not a git repository');
    }

    // Verify the repository has commits
    if (!(await this.hasCommits())) {
      throw new Error('Repository has no commits');
    }

    // Check if branch already exists
    if (await this.branchExists(branchName)) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    // Use detected main branch if baseBranch not specified
    const effectiveBaseBranch = baseBranch ?? (await this.getMainBranch());

    // Verify the base branch exists
    if (!(await this.branchExists(effectiveBaseBranch))) {
      throw new Error(`Base branch '${effectiveBaseBranch}' does not exist`);
    }

    // Build the git worktree add command
    const args = ['worktree', 'add', '-b', branchName, worktreePath, effectiveBaseBranch];

    await git.raw(args);
  }

  /**
   * Get the count of modified, staged, and untracked files
   * Returns 0 if not a git repository
   */
  async getModifiedFileCount(): Promise<number> {
    try {
      const git = await this.getGit();
      if (!git) {
        return 0;
      }

      // Get status in porcelain format (machine-readable)
      const status = await git.status();

      // Count modified, staged, untracked, and deleted files
      const count =
        status.modified.length +
        status.staged.length +
        status.not_added.length +
        status.deleted.length +
        status.renamed.length;

      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Get the ahead/behind commit counts relative to a target branch
   * Returns { ahead: 0, behind: 0 } if not a git repo or target branch doesn't exist
   */
  async getAheadBehind(targetBranch: string): Promise<{ ahead: number; behind: number }> {
    try {
      const git = await this.getGit();
      if (!git) {
        return { ahead: 0, behind: 0 };
      }

      // Check if target branch exists
      if (!(await this.branchExists(targetBranch))) {
        return { ahead: 0, behind: 0 };
      }

      // Get the current branch
      const branches = await git.branchLocal();
      const currentBranch = branches.current;

      if (!currentBranch) {
        return { ahead: 0, behind: 0 };
      }

      // Use rev-list to count commits
      // --left-right gives us commits unique to each side
      // currentBranch...targetBranch shows symmetric difference
      const output = await git.raw([
        'rev-list',
        '--left-right',
        '--count',
        `${currentBranch}...${targetBranch}`,
      ]);

      // Output format: "ahead\tbehind"
      const parts = output.trim().split(/\s+/);
      const ahead = parseInt(parts[0] ?? '0', 10);
      const behind = parseInt(parts[1] ?? '0', 10);

      return {
        ahead: isNaN(ahead) ? 0 : ahead,
        behind: isNaN(behind) ? 0 : behind,
      };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * Remove a worktree
   * @param worktreePath - Path of the worktree to remove
   * @param force - Force removal even if worktree has uncommitted changes
   */
  async removeWorktree(worktreePath: string, force?: boolean): Promise<void> {
    // First check if this is a git repository
    if (!(await this.isGitRepository())) {
      throw new Error('Not a git repository');
    }

    const git = await this.getGit();
    if (!git) {
      throw new Error('Not a git repository');
    }

    // Check if this is the main worktree - cannot remove it
    const worktrees = await this.listWorktrees();
    const targetWorktree = worktrees.find((wt) => wt.path === worktreePath);

    if (targetWorktree?.isMain) {
      throw new Error('Cannot remove the main worktree');
    }

    // Build the git worktree remove command
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push(worktreePath);

    await git.raw(args);
  }

  /**
   * Get full git status for the repository
   * Phase 7: Used by FileTreeService for file status display
   * Returns null if not a git repository
   */
  async getStatus(): Promise<StatusResult | null> {
    try {
      const git = await this.getGit();
      if (!git) {
        return null;
      }

      return await git.status();
    } catch {
      return null;
    }
  }

  /**
   * Get all remotes with their refs
   * Phase 7: Used by ProjectMetadataService for remote URL detection
   * Returns empty array if not a git repository
   */
  async getRemotes(): Promise<RemoteWithRefs[]> {
    try {
      const git = await this.getGit();
      if (!git) {
        return [];
      }

      return await git.getRemotes(true);
    } catch {
      return [];
    }
  }
}
