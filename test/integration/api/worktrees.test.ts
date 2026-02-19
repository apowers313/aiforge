/**
 * Worktrees API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import { GitTestSandbox } from '../../helpers/git-sandbox.js';
import type { WorktreeWithStatus, WorktreeMetadata } from '@shared/types/index.js';

interface WorktreesResponse {
  worktrees: WorktreeWithStatus[];
}

interface WorktreeResponse {
  worktree: WorktreeWithStatus;
}

interface MainBranchResponse {
  branch: string;
}

interface ErrorResponse {
  message: string;
}

interface UpdateWorktreeMetadataResponse {
  success: boolean;
  metadata: WorktreeMetadata;
}

interface ProjectResponse {
  project: {
    id: string;
    name: string;
    path: string;
  };
}

describe('Worktrees API', () => {
  let server: TestServer;
  let sandbox: GitTestSandbox;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    sandbox = new GitTestSandbox();
    await sandbox.setup();
  });

  afterEach(async () => {
    await sandbox.cleanup();
  });

  describe('GET /api/projects/:id/worktrees', () => {
    it('requires authentication', async () => {
      const projectId = await server.createTestProject();

      await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .expect(401);
    });

    it('returns worktrees for git project', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get worktrees
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorktreesResponse;
      expect(body.worktrees).toBeInstanceOf(Array);
      expect(body.worktrees.length).toBeGreaterThanOrEqual(1);
      expect(body.worktrees[0]).toMatchObject({
        isMain: true,
        branch: 'main',
        name: 'main',
        modifiedCount: 0,
        ahead: 0,
        behind: 0,
      });
    });

    it('returns empty array for non-git project', async () => {
      // Create a non-git directory
      const nonGitPath = join(sandbox.getWorkspacePath(), 'non-git');
      await mkdir(nonGitPath, { recursive: true });

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: nonGitPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get worktrees
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorktreesResponse;
      expect(body.worktrees).toEqual([]);
    });

    it('returns empty array for git repo without commits', async () => {
      // Create an empty git repo (no commits)
      const repoPath = join(sandbox.getWorkspacePath(), 'empty-git-repo');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get worktrees
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorktreesResponse;
      expect(body.worktrees).toEqual([]);
    });

    it('returns multiple worktrees', async () => {
      // Create a git repo with multiple worktrees
      const repoPath = join(sandbox.getWorkspacePath(), 'multi-wt-repo');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Add a second worktree
      const wtPath = join(sandbox.getWorkspacePath(), '.worktrees', 'feature');
      await git.raw(['worktree', 'add', '-b', 'feature', wtPath]);

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get worktrees
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorktreesResponse;
      expect(body.worktrees).toHaveLength(2);

      const mainWorktree = body.worktrees.find((w) => w.isMain);
      expect(mainWorktree).toBeDefined();
      expect(mainWorktree?.branch).toBe('main');

      const featureWorktree = body.worktrees.find((w) => !w.isMain);
      expect(featureWorktree).toBeDefined();
      expect(featureWorktree?.branch).toBe('feature');
      expect(featureWorktree?.name).toBe('feature');
    });

    it('returns 400 for invalid project ID format', async () => {
      await request(server.app)
        .get('/api/projects/invalid-uuid/worktrees')
        .set('Cookie', server.authCookie)
        .expect(400);
    });

    it('returns empty array for non-existent project', async () => {
      // Non-existent project returns empty worktrees (not 404)
      // because the WorktreeService returns empty array when project not found
      const response = await request(server.app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/worktrees')
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorktreesResponse;
      expect(body.worktrees).toEqual([]);
    });
  });

  describe('GET /api/projects/:id/worktrees/main', () => {
    it('requires authentication', async () => {
      const projectId = await server.createTestProject();

      await request(server.app)
        .get(`/api/projects/${projectId}/worktrees/main`)
        .expect(401);
    });

    it('returns main branch for git project', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-main');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get main branch
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees/main`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as MainBranchResponse;
      expect(['main', 'master']).toContain(body.branch);
    });

    it('returns main for non-git project', async () => {
      // Create a non-git directory
      const nonGitPath = join(sandbox.getWorkspacePath(), 'non-git-main');
      await mkdir(nonGitPath, { recursive: true });

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: nonGitPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Get main branch
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees/main`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as MainBranchResponse;
      expect(body.branch).toBe('main');
    });
  });

  describe('POST /api/projects/:id/worktrees', () => {
    it('requires authentication', async () => {
      const projectId = await server.createTestProject();

      await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .send({ name: 'feature-1' })
        .expect(401);
    });

    it('creates worktree successfully', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-create');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create worktree
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature-new' })
        .expect(201);

      const body = response.body as WorktreeResponse;
      expect(body.worktree).toBeDefined();
      expect(body.worktree.name).toBe('feature-new');
      expect(body.worktree.branch).toBe('feature-new');
      expect(body.worktree.isMain).toBe(false);
      expect(body.worktree.path).toContain('.worktrees/feature-new');
    });

    it('creates worktree from specific base branch', async () => {
      // Create a git repo with a develop branch
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-base');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');
      await git.checkout(['-b', 'develop']);
      await writeFile(join(repoPath, 'develop.txt'), 'develop content');
      await git.add('develop.txt');
      await git.commit('Develop commit');
      await git.checkout('main');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create worktree from develop
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature-from-develop', baseBranch: 'develop' })
        .expect(201);

      const body = response.body as WorktreeResponse;
      expect(body.worktree.name).toBe('feature-from-develop');

      // Verify worktree directory exists and has develop.txt
      const { stat } = await import('node:fs/promises');
      const wtPath = body.worktree.path;
      const fileExists = await stat(join(wtPath, 'develop.txt'))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('returns 400 for empty name', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-empty');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Try to create worktree with empty name
      await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: '' })
        .expect(400);
    });

    it('returns 400 for invalid branch name', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-invalid');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Try to create worktree with invalid name (starts with -)
      await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: '-invalid-name' })
        .expect(400);
    });

    it('returns 400 for existing branch', async () => {
      // Create a git repo with an existing branch
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-existing');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');
      await git.branch(['existing-branch']);

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Try to create worktree with existing branch name
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'existing-branch' })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toMatch(/already exists/);
    });

    it('returns 400 for non-git project', async () => {
      // Create a non-git directory
      const nonGitPath = join(sandbox.getWorkspacePath(), 'non-git-create');
      await mkdir(nonGitPath, { recursive: true });

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: nonGitPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Try to create worktree
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature' })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toMatch(/not a git repository/);
    });

    it('returns 400 for non-existent base branch', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-no-base');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Try to create worktree with non-existent base branch
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature', baseBranch: 'non-existent' })
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toMatch(/does not exist/);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/worktrees')
        .set('Cookie', server.authCookie)
        .send({ name: 'feature' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id/worktrees/:path', () => {
    it('requires authentication', async () => {
      const projectId = await server.createTestProject();
      const encodedPath = encodeURIComponent('/some/path');

      await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .expect(401);
    });

    it('deletes worktree', async () => {
      // Create a git repo with a worktree
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-delete');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create a worktree
      const wtResponse = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'to-delete' })
        .expect(201);

      const wtBody = wtResponse.body as WorktreeResponse;
      const worktreePath = wtBody.worktree.path;
      const encodedPath = encodeURIComponent(worktreePath);

      // Delete the worktree
      await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .expect(200);

      // Verify it's gone
      const listResponse = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const listBody = listResponse.body as WorktreesResponse;
      expect(listBody.worktrees).toHaveLength(1);
      expect(listBody.worktrees[0]?.isMain).toBe(true);
    });

    it('force deletes dirty worktree with query param', async () => {
      // Create a git repo with a worktree
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-force-delete');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create a worktree
      const wtResponse = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'dirty-wt' })
        .expect(201);

      const wtBody = wtResponse.body as WorktreeResponse;
      const worktreePath = wtBody.worktree.path;

      // Make the worktree dirty
      await writeFile(join(worktreePath, 'uncommitted.txt'), 'dirty content');

      const encodedPath = encodeURIComponent(worktreePath);

      // Force delete the worktree
      await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .query({ force: 'true' })
        .set('Cookie', server.authCookie)
        .expect(200);

      // Verify it's gone
      const listResponse = await request(server.app)
        .get(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const listBody = listResponse.body as WorktreesResponse;
      expect(listBody.worktrees).toHaveLength(1);
    });

    it('returns 400 when trying to delete main worktree', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-main-delete');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;
      const encodedPath = encodeURIComponent(repoPath);

      // Try to delete the main worktree
      const response = await request(server.app)
        .delete(`/api/projects/${projectId}/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .expect(400);

      const body = response.body as ErrorResponse;
      expect(body.message).toMatch(/main worktree/);
    });

    it('returns 404 for non-existent project', async () => {
      const encodedPath = encodeURIComponent('/some/path');

      await request(server.app)
        .delete(`/api/projects/00000000-0000-0000-0000-000000000000/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .expect(404);
    });

    it('returns 400 for invalid project ID format', async () => {
      const encodedPath = encodeURIComponent('/some/path');

      await request(server.app)
        .delete(`/api/projects/invalid-uuid/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .expect(400);
    });
  });

  describe('PATCH /api/worktrees/:path', () => {
    it('requires authentication', async () => {
      const encodedPath = encodeURIComponent('/some/path');

      await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .send({ done: true })
        .expect(401);
    });

    it('updates done status to true', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-patch');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create a worktree
      const wtResponse = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature-patch' })
        .expect(201);

      const wtBody = wtResponse.body as WorktreeResponse;
      const worktreePath = wtBody.worktree.path;
      const encodedPath = encodeURIComponent(worktreePath);

      // Update done status
      const patchResponse = await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({ done: true })
        .expect(200);

      expect(patchResponse.body).toMatchObject({
        success: true,
        metadata: {
          worktreePath,
          done: true,
        },
      });
    });

    it('updates done status to false', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-patch-false');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create a worktree
      const wtResponse = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'feature-patch-false' })
        .expect(201);

      const wtBody = wtResponse.body as WorktreeResponse;
      const worktreePath = wtBody.worktree.path;
      const encodedPath = encodeURIComponent(worktreePath);

      // First set to true
      await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({ done: true })
        .expect(200);

      // Then set to false
      const patchResponse = await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({ done: false })
        .expect(200);

      expect(patchResponse.body).toMatchObject({
        success: true,
        metadata: {
          worktreePath,
          done: false,
        },
      });
    });

    it('returns 400 when done is not provided', async () => {
      const encodedPath = encodeURIComponent('/some/worktree/path');

      await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({})
        .expect(400);
    });

    it('returns 400 when done is not a boolean', async () => {
      const encodedPath = encodeURIComponent('/some/worktree/path');

      await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({ done: 'true' })
        .expect(400);
    });

    it('creates metadata for new worktree path', async () => {
      // Create a git repo
      const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-new-meta');
      await mkdir(repoPath, { recursive: true });
      const git = simpleGit(repoPath);
      await git.init();
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await git.add('README.md');
      await git.commit('Initial commit');

      // Create the project
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: repoPath });

      const projectBody = createResponse.body as ProjectResponse;
      const projectId = projectBody.project.id;

      // Create a worktree
      const wtResponse = await request(server.app)
        .post(`/api/projects/${projectId}/worktrees`)
        .set('Cookie', server.authCookie)
        .send({ name: 'new-meta-wt' })
        .expect(201);

      const wtBody = wtResponse.body as WorktreeResponse;
      const worktreePath = wtBody.worktree.path;
      const encodedPath = encodeURIComponent(worktreePath);

      // Patch creates metadata if it doesn't exist
      const patchResponse = await request(server.app)
        .patch(`/api/worktrees/${encodedPath}`)
        .set('Cookie', server.authCookie)
        .send({ done: true, projectId })
        .expect(200);

      const patchBody = patchResponse.body as UpdateWorktreeMetadataResponse;
      expect(patchBody.metadata).toBeDefined();
      expect(patchBody.metadata.done).toBe(true);
      expect(patchBody.metadata.projectId).toBe(projectId);
      expect(patchBody.metadata.createdAt).toBeDefined();
      expect(patchBody.metadata.updatedAt).toBeDefined();
    });
  });

  // =============================================================================
  // Phase 6: Shell-Worktree Association
  // =============================================================================
  describe('Shell-Worktree Association', () => {
    describe('POST /api/projects/:id/shells with worktreePath', () => {
      it('creates shell with worktreePath', async () => {
        // Create a git repo
        const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-shell-wt');
        await mkdir(repoPath, { recursive: true });
        const git = simpleGit(repoPath);
        await git.init();
        await writeFile(join(repoPath, 'README.md'), '# Test\n');
        await git.add('README.md');
        await git.commit('Initial commit');

        // Create the project
        const createResponse = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: repoPath });

        const projectBody = createResponse.body as ProjectResponse;
        const projectId = projectBody.project.id;

        // Create a worktree
        const wtResponse = await request(server.app)
          .post(`/api/projects/${projectId}/worktrees`)
          .set('Cookie', server.authCookie)
          .send({ name: 'shell-feature' })
          .expect(201);

        const wtBody = wtResponse.body as WorktreeResponse;
        const worktreePath = wtBody.worktree.path;

        // Create shell with worktreePath
        const shellResponse = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'ai-shell', type: 'ai', worktreePath })
          .expect(201);

        const shellBody = shellResponse.body as { shell: { id: string; name: string; worktreePath: string | null; cwd: string } };
        expect(shellBody.shell.worktreePath).toBe(worktreePath);
        expect(shellBody.shell.cwd).toBe(worktreePath);
      });

      it('creates shell without worktreePath (direct project shell)', async () => {
        // Create a git repo
        const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-shell-direct');
        await mkdir(repoPath, { recursive: true });
        const git = simpleGit(repoPath);
        await git.init();
        await writeFile(join(repoPath, 'README.md'), '# Test\n');
        await git.add('README.md');
        await git.commit('Initial commit');

        // Create the project
        const createResponse = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: repoPath });

        const projectBody = createResponse.body as ProjectResponse;
        const projectId = projectBody.project.id;

        // Create shell without worktreePath
        const shellResponse = await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'bash-shell', type: 'bash' })
          .expect(201);

        const shellBody = shellResponse.body as { shell: { id: string; name: string; worktreePath: string | null; cwd: string } };
        expect(shellBody.shell.worktreePath).toBeNull();
        expect(shellBody.shell.cwd).toBe(repoPath);
      });
    });

    describe('GET /api/worktrees/:worktreePath/shells', () => {
      it('requires authentication', async () => {
        const encodedPath = encodeURIComponent('/some/path');

        await request(server.app)
          .get(`/api/worktrees/${encodedPath}/shells`)
          .expect(401);
      });

      it('returns shells for worktree', async () => {
        // Create a git repo
        const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-wt-shells');
        await mkdir(repoPath, { recursive: true });
        const git = simpleGit(repoPath);
        await git.init();
        await writeFile(join(repoPath, 'README.md'), '# Test\n');
        await git.add('README.md');
        await git.commit('Initial commit');

        // Create the project
        const createResponse = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: repoPath });

        const projectBody = createResponse.body as ProjectResponse;
        const projectId = projectBody.project.id;

        // Create a worktree
        const wtResponse = await request(server.app)
          .post(`/api/projects/${projectId}/worktrees`)
          .set('Cookie', server.authCookie)
          .send({ name: 'wt-shells-feature' })
          .expect(201);

        const wtBody = wtResponse.body as WorktreeResponse;
        const worktreePath = wtBody.worktree.path;

        // Create a shell with worktreePath
        await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'wt-shell-1', type: 'ai', worktreePath })
          .expect(201);

        // Create another shell with same worktreePath
        await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'wt-shell-2', type: 'bash', worktreePath })
          .expect(201);

        // Create a direct project shell (no worktreePath)
        await request(server.app)
          .post(`/api/projects/${projectId}/shells`)
          .set('Cookie', server.authCookie)
          .send({ name: 'direct-shell', type: 'bash' })
          .expect(201);

        // Get shells for worktree
        const encodedPath = encodeURIComponent(worktreePath);
        const shellsResponse = await request(server.app)
          .get(`/api/worktrees/${encodedPath}/shells`)
          .set('Cookie', server.authCookie)
          .expect(200);

        const shellsBody = shellsResponse.body as { shells: { name: string; worktreePath: string | null }[] };
        expect(shellsBody.shells).toHaveLength(2);
        expect(shellsBody.shells.every((s) => s.worktreePath === worktreePath)).toBe(true);
        expect(shellsBody.shells.map((s) => s.name).sort()).toEqual(['wt-shell-1', 'wt-shell-2']);
      });

      it('returns empty array for worktree with no shells', async () => {
        // Create a git repo
        const repoPath = join(sandbox.getWorkspacePath(), 'git-repo-wt-no-shells');
        await mkdir(repoPath, { recursive: true });
        const git = simpleGit(repoPath);
        await git.init();
        await writeFile(join(repoPath, 'README.md'), '# Test\n');
        await git.add('README.md');
        await git.commit('Initial commit');

        // Create the project
        const createResponse = await request(server.app)
          .post('/api/projects')
          .set('Cookie', server.authCookie)
          .send({ path: repoPath });

        const projectBody = createResponse.body as ProjectResponse;
        const projectId = projectBody.project.id;

        // Create a worktree
        const wtResponse = await request(server.app)
          .post(`/api/projects/${projectId}/worktrees`)
          .set('Cookie', server.authCookie)
          .send({ name: 'empty-wt' })
          .expect(201);

        const wtBody = wtResponse.body as WorktreeResponse;
        const worktreePath = wtBody.worktree.path;
        const encodedPath = encodeURIComponent(worktreePath);

        // Get shells for empty worktree
        const shellsResponse = await request(server.app)
          .get(`/api/worktrees/${encodedPath}/shells`)
          .set('Cookie', server.authCookie)
          .expect(200);

        const shellsBody = shellsResponse.body as { shells: { name: string }[] };
        expect(shellsBody.shells).toHaveLength(0);
      });
    });
  });
});
