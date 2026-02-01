/**
 * ProjectMetadataService - Detects project metadata like git remotes, package.json, etc.
 * Phase 7: Refactored to use GitService for centralized git operations
 */
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectMetadata } from '@shared/types/index.js';
import { GitService } from '../git/GitService.js';

export class ProjectMetadataService {
  /**
   * Get metadata for a project directory
   */
  async getMetadata(projectPath: string): Promise<ProjectMetadata> {
    const [gitInfo, packageJson, hasWorkflows] = await Promise.all([
      this.getGitInfo(projectPath),
      this.readPackageJson(projectPath),
      this.hasGithubWorkflows(projectPath),
    ]);

    return {
      gitRemoteUrl: gitInfo.remoteUrl,
      gitRemoteType: gitInfo.remoteType,
      hasPackageJson: packageJson.exists,
      packageName: packageJson.name,
      hasGithubWorkflows: hasWorkflows,
    };
  }

  /**
   * Get git remote information
   * Phase 7: Refactored to use GitService for centralized git operations
   */
  private async getGitInfo(projectPath: string): Promise<{
    remoteUrl: string | null;
    remoteType: ProjectMetadata['gitRemoteType'];
  }> {
    try {
      const gitService = new GitService(projectPath);
      const remotes = await gitService.getRemotes();
      const origin = remotes.find((r) => r.name === 'origin');

      if (!origin?.refs.fetch) {
        return { remoteUrl: null, remoteType: null };
      }

      const remoteUrl = origin.refs.fetch;
      const remoteType = this.detectRemoteType(remoteUrl);

      return { remoteUrl, remoteType };
    } catch {
      return { remoteUrl: null, remoteType: null };
    }
  }

  /**
   * Detect the type of git remote from URL
   */
  private detectRemoteType(url: string): ProjectMetadata['gitRemoteType'] {
    if (url.includes('github.com')) {
      return 'github';
    }
    if (url.includes('gitlab.com') || url.includes('gitlab')) {
      return 'gitlab';
    }
    if (url.includes('bitbucket.org') || url.includes('bitbucket')) {
      return 'bitbucket';
    }
    return 'other';
  }

  /**
   * Read package.json if it exists
   */
  private async readPackageJson(projectPath: string): Promise<{
    exists: boolean;
    name: string | null;
  }> {
    try {
      const packageJsonPath = join(projectPath, 'package.json');
      const content = await readFile(packageJsonPath, 'utf-8');
      const parsed = JSON.parse(content) as { name?: string };
      return {
        exists: true,
        name: parsed.name ?? null,
      };
    } catch {
      return { exists: false, name: null };
    }
  }

  /**
   * Check if .github/workflows directory exists and has files
   */
  private async hasGithubWorkflows(projectPath: string): Promise<boolean> {
    try {
      const workflowsPath = join(projectPath, '.github', 'workflows');
      await access(workflowsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a GitHub URL to a web-accessible URL
   * Converts SSH and HTTPS git URLs to web URLs
   */
  parseGitHubUrl(url: string): string | null {
    if (!url.includes('github.com')) {
      return null;
    }

    // Handle SSH format: git@github.com:user/repo.git
    if (url.startsWith('git@github.com:')) {
      const path = url.replace('git@github.com:', '').replace(/\.git$/, '');
      return `https://github.com/${path}`;
    }

    // Handle HTTPS format: https://github.com/user/repo.git
    if (url.startsWith('https://github.com/')) {
      return url.replace(/\.git$/, '');
    }

    return null;
  }
}
