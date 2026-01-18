/**
 * Tests for ProjectMetadataService - project metadata detection
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectMetadataService } from '@server/services/project/ProjectMetadataService.js';

// Mock simple-git module
vi.mock('simple-git', () => {
  const mockGit = {
    getRemotes: vi.fn(),
  };
  return {
    simpleGit: vi.fn(() => mockGit),
    default: vi.fn(() => mockGit),
  };
});

describe('ProjectMetadataService', () => {
  let service: ProjectMetadataService;
  let tempDir: string;
  let mockGit: { getRemotes: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'project-metadata-test-'));
    service = new ProjectMetadataService();

    // Get the mock
    const simpleGitModule = await import('simple-git');
    mockGit = (simpleGitModule.simpleGit as ReturnType<typeof vi.fn>)() as {
      getRemotes: ReturnType<typeof vi.fn>;
    };
    mockGit.getRemotes.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('getMetadata', () => {
    it('detects GitHub HTTPS remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } },
      ]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteUrl).toBe('https://github.com/user/repo.git');
      expect(metadata.gitRemoteType).toBe('github');
    });

    it('detects GitHub SSH remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'git@github.com:user/repo.git' } },
      ]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteUrl).toBe('git@github.com:user/repo.git');
      expect(metadata.gitRemoteType).toBe('github');
    });

    it('detects GitLab remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'git@gitlab.com:user/repo.git' } },
      ]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteType).toBe('gitlab');
    });

    it('detects Bitbucket remote URL', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'git@bitbucket.org:user/repo.git' } },
      ]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteType).toBe('bitbucket');
    });

    it('marks unknown remotes as other', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://custom-git.example.com/repo.git' } },
      ]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteType).toBe('other');
    });

    it('returns null for empty remotes', async () => {
      mockGit.getRemotes.mockResolvedValue([]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteUrl).toBeNull();
      expect(metadata.gitRemoteType).toBeNull();
    });

    it('reads package.json name', async () => {
      mockGit.getRemotes.mockResolvedValue([]);
      await writeFile(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: '@scope/pkg', version: '1.0.0' }),
      );

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.hasPackageJson).toBe(true);
      expect(metadata.packageName).toBe('@scope/pkg');
    });

    it('returns hasPackageJson false when no package.json', async () => {
      mockGit.getRemotes.mockResolvedValue([]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.hasPackageJson).toBe(false);
      expect(metadata.packageName).toBeNull();
    });

    it('detects GitHub workflows directory', async () => {
      mockGit.getRemotes.mockResolvedValue([]);
      await mkdir(join(tempDir, '.github', 'workflows'), { recursive: true });
      await writeFile(join(tempDir, '.github', 'workflows', 'ci.yml'), 'name: CI');

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.hasGithubWorkflows).toBe(true);
    });

    it('returns hasGithubWorkflows false when no workflows', async () => {
      mockGit.getRemotes.mockResolvedValue([]);

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.hasGithubWorkflows).toBe(false);
    });

    it('handles git errors gracefully', async () => {
      mockGit.getRemotes.mockRejectedValue(new Error('Not a git repository'));

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.gitRemoteUrl).toBeNull();
      expect(metadata.gitRemoteType).toBeNull();
    });

    it('handles invalid package.json gracefully', async () => {
      mockGit.getRemotes.mockResolvedValue([]);
      await writeFile(join(tempDir, 'package.json'), 'invalid json');

      const metadata = await service.getMetadata(tempDir);

      expect(metadata.hasPackageJson).toBe(false);
      expect(metadata.packageName).toBeNull();
    });
  });

  describe('parseGitHubUrl', () => {
    it('converts GitHub URL to web URL', () => {
      const url = service.parseGitHubUrl('https://github.com/user/repo.git');
      expect(url).toBe('https://github.com/user/repo');
    });

    it('converts GitHub SSH URL to web URL', () => {
      const url = service.parseGitHubUrl('git@github.com:user/repo.git');
      expect(url).toBe('https://github.com/user/repo');
    });

    it('returns null for non-GitHub URLs', () => {
      const url = service.parseGitHubUrl('https://gitlab.com/user/repo.git');
      expect(url).toBeNull();
    });

    it('handles URLs without .git suffix', () => {
      const url = service.parseGitHubUrl('https://github.com/user/repo');
      expect(url).toBe('https://github.com/user/repo');
    });
  });
});
