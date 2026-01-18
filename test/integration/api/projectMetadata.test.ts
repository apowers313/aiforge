/**
 * Project metadata API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';

interface MetadataResponse {
  gitRemoteUrl: string | null;
  gitRemoteType: 'github' | 'gitlab' | 'bitbucket' | 'other' | null;
  hasPackageJson: boolean;
  packageName: string | null;
  hasGithubWorkflows: boolean;
}

interface ProjectResponse {
  project: {
    id: string;
    name: string;
    path: string;
  };
}

describe('Project Metadata API', () => {
  let server: TestServer;
  let projectDir: string;
  let projectId: string;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Create a unique project directory for each test
    projectDir = join(server.tempDir, `project-${String(Date.now())}`);
    await mkdir(projectDir, { recursive: true });

    // Create the project
    const response = await request(server.app)
      .post('/api/projects')
      .set('Cookie', server.authCookie)
      .send({ path: projectDir });

    const body = response.body as ProjectResponse;
    projectId = body.project.id;
  });

  describe('GET /api/projects/:id/metadata', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get(`/api/projects/${projectId}/metadata`)
        .expect(401);
    });

    it('returns 200 with project metadata', async () => {
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/metadata`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as MetadataResponse;
      expect(body).toHaveProperty('gitRemoteUrl');
      expect(body).toHaveProperty('gitRemoteType');
      expect(body).toHaveProperty('hasPackageJson');
      expect(body).toHaveProperty('packageName');
      expect(body).toHaveProperty('hasGithubWorkflows');
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/metadata')
        .set('Cookie', server.authCookie)
        .expect(404);
    });

    it('detects package.json', async () => {
      await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test-package', version: '1.0.0' }),
      );

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/metadata`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as MetadataResponse;
      expect(body.hasPackageJson).toBe(true);
      expect(body.packageName).toBe('test-package');
    });

    it('detects GitHub workflows', async () => {
      await mkdir(join(projectDir, '.github', 'workflows'), { recursive: true });
      await writeFile(join(projectDir, '.github', 'workflows', 'ci.yml'), 'name: CI');

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/metadata`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as MetadataResponse;
      expect(body.hasGithubWorkflows).toBe(true);
    });
  });
});
