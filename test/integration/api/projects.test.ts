/**
 * Projects API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';

interface Project {
  id: string;
  name: string;
  path: string;
}

interface ProjectResponse {
  project: Project;
}

interface ProjectsResponse {
  projects: Project[];
}

describe('Projects API', () => {
  let server: TestServer;
  let projectDir: string;

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
  });

  describe('GET /api/projects', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get('/api/projects')
        .expect(401);
    });

    it('returns empty array initially', async () => {
      // Create a fresh server for this test
      const freshServer = await createTestServer();
      try {
        const response = await request(freshServer.app)
          .get('/api/projects')
          .set('Cookie', freshServer.authCookie)
          .expect(200);

        const body = response.body as ProjectsResponse;
        expect(body.projects).toEqual([]);
      } finally {
        await freshServer.close();
      }
    });
  });

  describe('POST /api/projects', () => {
    it('creates project with valid path', async () => {
      const response = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: projectDir })
        .expect(201);

      const body = response.body as ProjectResponse;
      expect(body.project.path).toBe(projectDir);
      expect(body.project.name).toBe(projectDir.split('/').pop());
      expect(body.project.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('returns 400 for non-existent path', async () => {
      await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: '/nonexistent/path/12345' })
        .expect(400);
    });

    it('returns 409 for duplicate path', async () => {
      // First create the project
      await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: projectDir });

      // Try to create again
      await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: projectDir })
        .expect(409);
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('updates project name', async () => {
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: projectDir });

      const createBody = createResponse.body as ProjectResponse;

      const response = await request(server.app)
        .patch(`/api/projects/${createBody.project.id}`)
        .set('Cookie', server.authCookie)
        .send({ name: 'new-name' })
        .expect(200);

      const body = response.body as ProjectResponse;
      expect(body.project.name).toBe('new-name');
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .patch('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Cookie', server.authCookie)
        .send({ name: 'new-name' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('removes project', async () => {
      const createResponse = await request(server.app)
        .post('/api/projects')
        .set('Cookie', server.authCookie)
        .send({ path: projectDir });

      const createBody = createResponse.body as ProjectResponse;

      await request(server.app)
        .delete(`/api/projects/${createBody.project.id}`)
        .set('Cookie', server.authCookie)
        .expect(204);

      // Verify it's gone
      const listResponse = await request(server.app)
        .get('/api/projects')
        .set('Cookie', server.authCookie);

      const listBody = listResponse.body as ProjectsResponse;
      const projectIds = listBody.projects.map((p) => p.id);
      expect(projectIds).not.toContain(createBody.project.id);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });
});
