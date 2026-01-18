/**
 * Project Custom URLs API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import type { CustomUrl } from '@shared/types/index.js';

interface UrlsResponse {
  urls: CustomUrl[];
}

interface ProjectResponse {
  project: {
    id: string;
    name: string;
    path: string;
  };
}

describe('Project Custom URLs API', () => {
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

  describe('GET /api/projects/:id/urls', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get(`/api/projects/${projectId}/urls`)
        .expect(401);
    });

    it('returns empty array for project with no custom URLs', async () => {
      const response = await request(server.app)
        .get(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as UrlsResponse;
      expect(body.urls).toEqual([]);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/urls')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/urls', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .send({ name: 'Docs', url: 'https://docs.example.com' })
        .expect(401);
    });

    it('creates custom URL and returns it', async () => {
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs', url: 'https://docs.example.com' })
        .expect(201);

      const body = response.body as CustomUrl;
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Docs');
      expect(body.url).toBe('https://docs.example.com');
      expect(body.createdAt).toBeDefined();
    });

    it('validates URL format', async () => {
      await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Bad', url: 'not-a-url' })
        .expect(400);
    });

    it('validates name is required', async () => {
      await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ url: 'https://docs.example.com' })
        .expect(400);
    });

    it('validates url is required', async () => {
      await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs' })
        .expect(400);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/urls')
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs', url: 'https://docs.example.com' })
        .expect(404);
    });
  });

  describe('PUT /api/projects/:id/urls/:urlId', () => {
    it('updates custom URL', async () => {
      const createResponse = await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs', url: 'https://docs.example.com' });

      const created = createResponse.body as CustomUrl;

      const response = await request(server.app)
        .put(`/api/projects/${projectId}/urls/${created.id}`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Documentation', url: 'https://new-docs.example.com' })
        .expect(200);

      const updated = response.body as CustomUrl;
      expect(updated.name).toBe('Documentation');
      expect(updated.url).toBe('https://new-docs.example.com');
    });

    it('returns 404 for non-existent URL', async () => {
      await request(server.app)
        .put(`/api/projects/${projectId}/urls/00000000-0000-0000-0000-000000000000`)
        .set('Cookie', server.authCookie)
        .send({ name: 'New Name' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id/urls/:urlId', () => {
    it('removes custom URL', async () => {
      const createResponse = await request(server.app)
        .post(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie)
        .send({ name: 'Docs', url: 'https://docs.example.com' });

      const created = createResponse.body as CustomUrl;

      await request(server.app)
        .delete(`/api/projects/${projectId}/urls/${created.id}`)
        .set('Cookie', server.authCookie)
        .expect(204);

      // Verify URL is gone
      const listResponse = await request(server.app)
        .get(`/api/projects/${projectId}/urls`)
        .set('Cookie', server.authCookie);

      const body = listResponse.body as UrlsResponse;
      expect(body.urls).toHaveLength(0);
    });

    it('returns 404 for non-existent URL', async () => {
      await request(server.app)
        .delete(`/api/projects/${projectId}/urls/00000000-0000-0000-0000-000000000000`)
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });
});
