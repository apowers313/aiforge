/**
 * Workspace API integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import type { WorkspaceState } from '@shared/types/index.js';

interface WorkspaceStateResponse {
  workspaceState: WorkspaceState;
}

describe('Workspace API', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/workspace', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get('/api/workspace')
        .expect(401);
    });

    it('returns default state for new session', async () => {
      // Create a fresh server for this test
      const freshServer = await createTestServer();
      try {
        const response = await request(freshServer.app)
          .get('/api/workspace')
          .set('Cookie', freshServer.authCookie)
          .expect(200);

        const body = response.body as WorkspaceStateResponse;
        expect(body.workspaceState).toBeDefined();
        expect(body.workspaceState.sidebarCollapsed).toBe(false);
        expect(body.workspaceState.expandedProjectIds).toEqual([]);
        expect(body.workspaceState.activeShellId).toBeNull();
        expect(body.workspaceState.updatedAt).toBeDefined();
      } finally {
        await freshServer.close();
      }
    });

    it('returns updated state after PATCH', async () => {
      // Create a real project so it passes validation
      const projectId = await server.createTestProject();

      // First, update the state
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({
          sidebarCollapsed: true,
          expandedProjectIds: [projectId],
        })
        .expect(200);

      // Then fetch it
      const response = await request(server.app)
        .get('/api/workspace')
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.sidebarCollapsed).toBe(true);
      expect(body.workspaceState.expandedProjectIds).toContain(projectId);
    });
  });

  describe('PATCH /api/workspace', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .patch('/api/workspace')
        .send({ sidebarCollapsed: true })
        .expect(401);
    });

    it('updates sidebarCollapsed', async () => {
      const response = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: true })
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.sidebarCollapsed).toBe(true);
    });

    it('updates expandedProjectIds', async () => {
      const response = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ expandedProjectIds: ['p1', 'p2', 'p3'] })
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.expandedProjectIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('updates activeShellId', async () => {
      const response = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ activeShellId: 'shell-123' })
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.activeShellId).toBe('shell-123');
    });

    it('sets activeShellId to null', async () => {
      // First set it to a value
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ activeShellId: 'shell-123' });

      // Then set it to null
      const response = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ activeShellId: null })
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.activeShellId).toBeNull();
    });

    it('preserves fields not in update', async () => {
      // Set initial state
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({
          sidebarCollapsed: true,
          expandedProjectIds: ['project-1'],
          activeShellId: 'shell-1',
        });

      // Update only one field
      const response = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: false })
        .expect(200);

      const body = response.body as WorkspaceStateResponse;
      expect(body.workspaceState.sidebarCollapsed).toBe(false);
      // These should be preserved
      expect(body.workspaceState.expandedProjectIds).toContain('project-1');
      expect(body.workspaceState.activeShellId).toBe('shell-1');
    });

    it('returns 400 for invalid sidebarCollapsed type', async () => {
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: 'not-a-boolean' })
        .expect(400);
    });

    it('returns 400 for invalid expandedProjectIds type', async () => {
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ expandedProjectIds: 'not-an-array' })
        .expect(400);
    });

    it('sets updatedAt on each update', async () => {
      const response1 = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: false })
        .expect(200);

      const body1 = response1.body as WorkspaceStateResponse;
      const time1 = body1.workspaceState.updatedAt;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response2 = await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: true })
        .expect(200);

      const body2 = response2.body as WorkspaceStateResponse;
      const time2 = body2.workspaceState.updatedAt;

      expect(time2 > time1).toBe(true);
    });
  });

  describe('Session isolation', () => {
    it('maintains separate state per session', async () => {
      // Login with a different session
      const session2Cookie = await server.login();

      // Set state on session 1
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', server.authCookie)
        .send({ sidebarCollapsed: true });

      // Set state on session 2
      await request(server.app)
        .patch('/api/workspace')
        .set('Cookie', session2Cookie)
        .send({ sidebarCollapsed: false });

      // Verify session 1 state
      const response1 = await request(server.app)
        .get('/api/workspace')
        .set('Cookie', server.authCookie)
        .expect(200);

      const body1 = response1.body as WorkspaceStateResponse;
      expect(body1.workspaceState.sidebarCollapsed).toBe(true);

      // Verify session 2 state
      const response2 = await request(server.app)
        .get('/api/workspace')
        .set('Cookie', session2Cookie)
        .expect(200);

      const body2 = response2.body as WorkspaceStateResponse;
      expect(body2.workspaceState.sidebarCollapsed).toBe(false);
    });
  });
});
