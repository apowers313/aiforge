/**
 * Shells API integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, type TestServer } from '../../helpers/server.js';

interface Shell {
  id: string;
  projectId: string;
  name: string;
  status: string;
}

interface ShellResponse {
  shell: Shell;
}

interface ShellsResponse {
  shells: Shell[];
}

describe('Shells API', () => {
  let server: TestServer;
  let projectId: string;

  beforeAll(async () => {
    server = await createTestServer();
    projectId = await server.createTestProject();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/projects/:projectId/shells', () => {
    it('creates shell for project', async () => {
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'bash-1' })
        .expect(201);

      const body = response.body as ShellResponse;
      expect(body.shell.projectId).toBe(projectId);
      expect(body.shell.name).toBe('bash-1');
      expect(body.shell.status).toBe('inactive');
    });

    it('auto-generates shell name if not provided', async () => {
      const response = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({})
        .expect(201);

      const body = response.body as ShellResponse;
      expect(body.shell.name).toMatch(/^shell-\d+$/);
    });

    it('returns 404 for non-existent project', async () => {
      await request(server.app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/shells')
        .set('Cookie', server.authCookie)
        .send({ name: 'shell-1' })
        .expect(404);
    });
  });

  describe('GET /api/projects/:projectId/shells', () => {
    it('returns shells for project', async () => {
      // Create a shell first
      await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'list-test-shell' });

      const response = await request(server.app)
        .get(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as ShellsResponse;
      expect(body.shells).toBeInstanceOf(Array);
      expect(body.shells.length).toBeGreaterThan(0);
    });

    it('requires authentication', async () => {
      await request(server.app)
        .get(`/api/projects/${projectId}/shells`)
        .expect(401);
    });
  });

  describe('DELETE /api/shells/:id', () => {
    it('removes shell', async () => {
      const createResponse = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'delete-test' });

      const createBody = createResponse.body as ShellResponse;

      await request(server.app)
        .delete(`/api/shells/${createBody.shell.id}`)
        .set('Cookie', server.authCookie)
        .expect(204);
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .delete('/api/shells/00000000-0000-0000-0000-000000000000')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });

  describe('PATCH /api/shells/:id', () => {
    it('renames shell', async () => {
      const createResponse = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'rename-test-original' });

      const createBody = createResponse.body as ShellResponse;

      const response = await request(server.app)
        .patch(`/api/shells/${createBody.shell.id}`)
        .set('Cookie', server.authCookie)
        .send({ name: 'rename-test-updated' })
        .expect(200);

      const body = response.body as ShellResponse;
      expect(body.shell.name).toBe('rename-test-updated');
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .patch('/api/shells/00000000-0000-0000-0000-000000000000')
        .set('Cookie', server.authCookie)
        .send({ name: 'new-name' })
        .expect(404);
    });

    it('requires authentication', async () => {
      await request(server.app)
        .patch('/api/shells/00000000-0000-0000-0000-000000000000')
        .send({ name: 'new-name' })
        .expect(401);
    });
  });

  describe('POST /api/shells/:id/restart', () => {
    // Note: Full restart functionality requires a PtyPool which the test server doesn't have.
    // These tests verify the endpoint exists and handles auth correctly.
    // Full PTY restart testing is done in e2e tests with a real server.

    it('returns 500 when PTY pool not configured', async () => {
      const createResponse = await request(server.app)
        .post(`/api/projects/${projectId}/shells`)
        .set('Cookie', server.authCookie)
        .send({ name: 'restart-test' });

      const createBody = createResponse.body as ShellResponse;

      // Without PtyPool, restart returns 500 (PTY pool not configured)
      await request(server.app)
        .post(`/api/shells/${createBody.shell.id}/restart`)
        .set('Cookie', server.authCookie)
        .expect(500);
    });

    it('requires authentication', async () => {
      await request(server.app)
        .post('/api/shells/00000000-0000-0000-0000-000000000000/restart')
        .expect(401);
    });
  });
});
