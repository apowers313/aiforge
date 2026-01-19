/**
 * Shell Context API integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import type { TodoItem, ShellContextData, Shell } from '@shared/types/index.js';

interface ShellResponse {
  shell: Shell;
}

type ContextResponse = ShellContextData;

describe('Shell Context API', () => {
  let server: TestServer;
  let projectDir: string;
  let projectId: string;
  let shellId: string;

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
    const projectResponse = await request(server.app)
      .post('/api/projects')
      .set('Cookie', server.authCookie)
      .send({ path: projectDir });

    projectId = (projectResponse.body as { project: { id: string } }).project.id;

    // Create a shell
    const shellResponse = await request(server.app)
      .post(`/api/projects/${projectId}/shells`)
      .set('Cookie', server.authCookie)
      .send({ name: 'Test Shell' });

    shellId = (shellResponse.body as ShellResponse).shell.id;
  });

  describe('GET /api/shells/:id/context', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .get(`/api/shells/${shellId}/context`)
        .expect(401);
    });

    it('returns empty context for shell with no todos or notes', async () => {
      const response = await request(server.app)
        .get(`/api/shells/${shellId}/context`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as ContextResponse;
      expect(body.todos).toEqual([]);
      expect(body.notes).toBe('');
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .get('/api/shells/00000000-0000-0000-0000-000000000000/context')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });

  describe('POST /api/shells/:id/todos', () => {
    it('requires authentication', async () => {
      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .send({ text: 'New task' })
        .expect(401);
    });

    it('creates todo and returns it', async () => {
      const response = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'New task' })
        .expect(201);

      const body = response.body as TodoItem;
      expect(body.id).toBeDefined();
      expect(body.text).toBe('New task');
      expect(body.completed).toBe(false);
      expect(body.createdAt).toBeDefined();
      expect(body.completedAt).toBeNull();
    });

    it('validates text is required', async () => {
      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({})
        .expect(400);
    });

    it('validates text is not empty', async () => {
      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: '' })
        .expect(400);
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .post('/api/shells/00000000-0000-0000-0000-000000000000/todos')
        .set('Cookie', server.authCookie)
        .send({ text: 'New task' })
        .expect(404);
    });
  });

  describe('PUT /api/shells/:id/todos/:todoId', () => {
    it('updates todo text', async () => {
      const createResponse = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Original' });

      const created = createResponse.body as TodoItem;

      const response = await request(server.app)
        .put(`/api/shells/${shellId}/todos/${created.id}`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Updated' })
        .expect(200);

      const updated = response.body as TodoItem;
      expect(updated.text).toBe('Updated');
      expect(updated.completed).toBe(false);
    });

    it('updates todo completion', async () => {
      const createResponse = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task' });

      const created = createResponse.body as TodoItem;

      const response = await request(server.app)
        .put(`/api/shells/${shellId}/todos/${created.id}`)
        .set('Cookie', server.authCookie)
        .send({ completed: true })
        .expect(200);

      const updated = response.body as TodoItem;
      expect(updated.completed).toBe(true);
      expect(updated.completedAt).not.toBeNull();
    });

    it('returns 404 for non-existent todo', async () => {
      await request(server.app)
        .put(`/api/shells/${shellId}/todos/00000000-0000-0000-0000-000000000000`)
        .set('Cookie', server.authCookie)
        .send({ text: 'New text' })
        .expect(404);
    });
  });

  describe('DELETE /api/shells/:id/todos/:todoId', () => {
    it('removes todo', async () => {
      const createResponse = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task' });

      const created = createResponse.body as TodoItem;

      await request(server.app)
        .delete(`/api/shells/${shellId}/todos/${created.id}`)
        .set('Cookie', server.authCookie)
        .expect(204);

      // Verify todo is gone
      const listResponse = await request(server.app)
        .get(`/api/shells/${shellId}/context`)
        .set('Cookie', server.authCookie);

      const body = listResponse.body as ContextResponse;
      expect(body.todos).toHaveLength(0);
    });

    it('returns 404 for non-existent todo', async () => {
      await request(server.app)
        .delete(`/api/shells/${shellId}/todos/00000000-0000-0000-0000-000000000000`)
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });

  describe('PATCH /api/shells/:id/notes', () => {
    it('updates shell notes', async () => {
      const response = await request(server.app)
        .patch(`/api/shells/${shellId}/notes`)
        .set('Cookie', server.authCookie)
        .send({ notes: '# My Notes\n\nSome content' })
        .expect(200);

      const body = response.body as ContextResponse;
      expect(body.notes).toBe('# My Notes\n\nSome content');
    });

    it('preserves todos when updating notes', async () => {
      // First add a todo
      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task' });

      // Then update notes
      const response = await request(server.app)
        .patch(`/api/shells/${shellId}/notes`)
        .set('Cookie', server.authCookie)
        .send({ notes: 'Some notes' })
        .expect(200);

      const body = response.body as ContextResponse;
      expect(body.todos).toHaveLength(1);
      expect(body.notes).toBe('Some notes');
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .patch('/api/shells/00000000-0000-0000-0000-000000000000/notes')
        .set('Cookie', server.authCookie)
        .send({ notes: 'Notes' })
        .expect(404);
    });
  });

  describe('POST /api/shells/:id/todos/clear-completed', () => {
    it('removes all completed todos', async () => {
      // Add some todos
      const todo1Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 1' });
      const todo1 = todo1Res.body as TodoItem;

      const todo2Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 2' });
      const todo2 = todo2Res.body as TodoItem;

      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 3' });

      // Complete some todos
      await request(server.app)
        .put(`/api/shells/${shellId}/todos/${todo1.id}`)
        .set('Cookie', server.authCookie)
        .send({ completed: true });

      await request(server.app)
        .put(`/api/shells/${shellId}/todos/${todo2.id}`)
        .set('Cookie', server.authCookie)
        .send({ completed: true });

      // Clear completed
      const response = await request(server.app)
        .post(`/api/shells/${shellId}/todos/clear-completed`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as { cleared: number };
      expect(body.cleared).toBe(2);

      // Verify remaining todos
      const contextRes = await request(server.app)
        .get(`/api/shells/${shellId}/context`)
        .set('Cookie', server.authCookie);
      const context = contextRes.body as ContextResponse;
      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('Task 3');
    });

    it('returns 0 when no completed todos', async () => {
      await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 1' });

      const response = await request(server.app)
        .post(`/api/shells/${shellId}/todos/clear-completed`)
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as { cleared: number };
      expect(body.cleared).toBe(0);
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .post('/api/shells/00000000-0000-0000-0000-000000000000/todos/clear-completed')
        .set('Cookie', server.authCookie)
        .expect(404);
    });
  });

  describe('PUT /api/shells/:id/todos/reorder', () => {
    it('reorders todos by id array', async () => {
      const todo1Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 1' });
      const todo1 = todo1Res.body as TodoItem;

      const todo2Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 2' });
      const todo2 = todo2Res.body as TodoItem;

      const todo3Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 3' });
      const todo3 = todo3Res.body as TodoItem;

      // Reorder: 3, 1, 2
      await request(server.app)
        .put(`/api/shells/${shellId}/todos/reorder`)
        .set('Cookie', server.authCookie)
        .send({ todoIds: [todo3.id, todo1.id, todo2.id] })
        .expect(200);

      // Verify order
      const contextRes = await request(server.app)
        .get(`/api/shells/${shellId}/context`)
        .set('Cookie', server.authCookie);
      const context = contextRes.body as ContextResponse;

      expect(context.todos[0]?.text).toBe('Task 3');
      expect(context.todos[1]?.text).toBe('Task 1');
      expect(context.todos[2]?.text).toBe('Task 2');
      expect(context.todos[0]?.order).toBe(0);
      expect(context.todos[1]?.order).toBe(1);
      expect(context.todos[2]?.order).toBe(2);
    });

    it('returns 404 for non-existent shell', async () => {
      await request(server.app)
        .put('/api/shells/00000000-0000-0000-0000-000000000000/todos/reorder')
        .set('Cookie', server.authCookie)
        .send({ todoIds: [] })
        .expect(404);
    });

    it('validates todoIds is an array', async () => {
      await request(server.app)
        .put(`/api/shells/${shellId}/todos/reorder`)
        .set('Cookie', server.authCookie)
        .send({ todoIds: 'not-an-array' })
        .expect(400);
    });
  });

  describe('POST /api/shells/:id/todos order field', () => {
    it('assigns order field to new todos', async () => {
      const todo1Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 1' });
      const todo1 = todo1Res.body as TodoItem;

      const todo2Res = await request(server.app)
        .post(`/api/shells/${shellId}/todos`)
        .set('Cookie', server.authCookie)
        .send({ text: 'Task 2' });
      const todo2 = todo2Res.body as TodoItem;

      expect(todo1.order).toBe(0);
      expect(todo2.order).toBe(1);
    });
  });
});
