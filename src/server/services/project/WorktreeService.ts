/**
 * WorktreeService - Business logic for git worktree operations
 *
 * This service provides worktree operations for projects.
 * Phase 2 implements: getWorktrees, isGitRepository
 * Phase 3 adds: createWorktree, getMainBranch
 */
import { join } from 'node:path';
import type { WorktreeWithStatus } from '@shared/types/index.js';
import type { ProjectStore } from '../../storage/stores/ProjectStore.js';
import { GitService } from '../git/GitService.js';

export interface WorktreeServiceOptions {
  projectStore: ProjectStore;
}

export class WorktreeService {
  private readonly projectStore: ProjectStore;

  constructor(options: WorktreeServiceOptions) {
    this.projectStore = options.projectStore;
  }

  /**
   * Check if a project is a git repository
   */
  async isGitRepository(projectId: string): Promise<boolean> {
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      return false;
    }

    const gitService = new GitService(project.path);
    return gitService.isGitRepository();
  }

  /**
   * Get all worktrees for a project with status information
   * Phase 5: Now calculates actual modifiedCount, ahead, behind values
   */
  async getWorktrees(projectId: string): Promise<WorktreeWithStatus[]> {
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      return [];
    }

    const gitService = new GitService(project.path);

    // Check if it's a git repo with commits
    if (!(await gitService.hasCommits())) {
      return [];
    }

    // Get raw worktrees and main branch
    const worktrees = await gitService.listWorktrees();
    const mainBranch = await gitService.getMainBranch();

    // Enrich with status information (Phase 5)
    const enrichedWorktrees = await Promise.all(
      worktrees.map(async (wt) => {
        // Create a GitService for each worktree to get its specific status
        const wtGitService = new GitService(wt.path);
        const modifiedCount = await wtGitService.getModifiedFileCount();
        const { ahead, behind } = await wtGitService.getAheadBehind(mainBranch);

        return {
          ...wt,
          name: this.getWorktreeName(wt.branch, wt.path),
          modifiedCount,
          ahead,
          behind,
        };
      }),
    );

    return enrichedWorktrees;
  }

  /**
   * Get display name for a worktree
   * Uses branch name, or directory name for detached HEAD
   */
  private getWorktreeName(branch: string, path: string): string {
    if (branch && branch !== '(detached)') {
      return branch;
    }

    // For detached HEAD, use the directory name
    const parts = path.split('/');
    return parts[parts.length - 1] ?? 'detached';
  }

  /**
   * Get the main branch name for a project
   * Returns 'main' by default if project not found or not a git repo
   */
  async getMainBranch(projectId: string): Promise<string> {
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      return 'main';
    }

    const gitService = new GitService(project.path);
    return gitService.getMainBranch();
  }

  /**
   * Create a new worktree for a project
   * @param projectId - The project ID
   * @param name - The branch name for the new worktree
   * @param baseBranch - Optional base branch to create from
   * @returns The created worktree with status information
   */
  async createWorktree(
    projectId: string,
    name: string,
    baseBranch?: string,
  ): Promise<WorktreeWithStatus> {
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const gitService = new GitService(project.path);

    // Verify it's a git repo with commits
    if (!(await gitService.hasCommits())) {
      throw new Error('Project is not a git repository with commits');
    }

    // Create the worktree path in .worktrees directory next to the project
    const worktreePath = join(project.path, '.worktrees', name);

    // Create the worktree
    await gitService.createWorktree(worktreePath, name, baseBranch);

    // Get the updated worktree list to return the new one with full info
    const worktrees = await this.getWorktrees(projectId);
    const newWorktree = worktrees.find((wt) => wt.path === worktreePath);

    if (!newWorktree) {
      throw new Error('Worktree was created but could not be found');
    }

    return newWorktree;
  }

  /**
   * Delete a worktree for a project
   * @param projectId - The project ID
   * @param worktreePath - The path of the worktree to delete
   * @param force - Force removal even if worktree has uncommitted changes
   * @returns true if worktree was deleted successfully
   */
  async deleteWorktree(projectId: string, worktreePath: string, force?: boolean): Promise<boolean> {
    const project = await this.projectStore.getById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const gitService = new GitService(project.path);
    await gitService.removeWorktree(worktreePath, force);

    return true;
  }
}
