/**
 * Tests for ProjectContextStore - project context data (todos + notes) storage
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectContextStore } from '@server/storage/stores/ProjectContextStore.js';
import type { TodoItem } from '@shared/types/index.js';

describe('ProjectContextStore', () => {
  let store: ProjectContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'project-context-test-'));
    store = new ProjectContextStore(join(tempDir, 'project-context.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getByProjectId', () => {
    it('returns empty context for new project', async () => {
      const context = await store.getByProjectId('new-project');

      expect(context).toEqual({ todos: [], notes: '' });
    });

    it('returns stored context for existing project', async () => {
      const todo: TodoItem = {
        id: 'todo-1',
        text: 'Test task',
        completed: false,
        order: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };

      await store.updateTodos('project-1', [todo]);
      const context = await store.getByProjectId('project-1');

      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('Test task');
    });
  });

  describe('updateTodos', () => {
    it('adds todos to a project', async () => {
      const todos: TodoItem[] = [
        {
          id: 'todo-1',
          text: 'Task 1',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
        {
          id: 'todo-2',
          text: 'Task 2',
          completed: true,
          order: 1,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ];

      await store.updateTodos('project-1', todos);
      const context = await store.getByProjectId('project-1');

      expect(context.todos).toHaveLength(2);
      expect(context.todos[0]?.text).toBe('Task 1');
      expect(context.todos[1]?.completed).toBe(true);
    });

    it('replaces existing todos', async () => {
      const initial: TodoItem[] = [
        {
          id: 'todo-1',
          text: 'Old task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];

      const updated: TodoItem[] = [
        {
          id: 'todo-2',
          text: 'New task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];

      await store.updateTodos('project-1', initial);
      await store.updateTodos('project-1', updated);

      const context = await store.getByProjectId('project-1');
      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('New task');
    });

    it('preserves notes when updating todos', async () => {
      await store.updateNotes('project-1', 'Important notes');
      await store.updateTodos('project-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      const context = await store.getByProjectId('project-1');
      expect(context.notes).toBe('Important notes');
      expect(context.todos).toHaveLength(1);
    });

    it('isolates todos between different projects', async () => {
      await store.updateTodos('project-1', [
        {
          id: 'todo-1',
          text: 'Project 1 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      await store.updateTodos('project-2', [
        {
          id: 'todo-2',
          text: 'Project 2 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      const context1 = await store.getByProjectId('project-1');
      const context2 = await store.getByProjectId('project-2');

      expect(context1.todos[0]?.text).toBe('Project 1 task');
      expect(context2.todos[0]?.text).toBe('Project 2 task');
    });
  });

  describe('updateNotes', () => {
    it('stores notes for a project', async () => {
      await store.updateNotes('project-1', '# My Notes\n\nSome content');

      const context = await store.getByProjectId('project-1');
      expect(context.notes).toBe('# My Notes\n\nSome content');
    });

    it('replaces existing notes', async () => {
      await store.updateNotes('project-1', 'Old notes');
      await store.updateNotes('project-1', 'New notes');

      const context = await store.getByProjectId('project-1');
      expect(context.notes).toBe('New notes');
    });

    it('preserves todos when updating notes', async () => {
      await store.updateTodos('project-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateNotes('project-1', 'Notes');

      const context = await store.getByProjectId('project-1');
      expect(context.todos).toHaveLength(1);
      expect(context.notes).toBe('Notes');
    });

    it('allows empty notes', async () => {
      await store.updateNotes('project-1', 'Some notes');
      await store.updateNotes('project-1', '');

      const context = await store.getByProjectId('project-1');
      expect(context.notes).toBe('');
    });
  });

  describe('deleteByProjectId', () => {
    it('removes all context for a project', async () => {
      await store.updateTodos('project-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateNotes('project-1', 'Notes');

      await store.deleteByProjectId('project-1');

      const context = await store.getByProjectId('project-1');
      expect(context).toEqual({ todos: [], notes: '' });
    });

    it('does not affect other projects', async () => {
      await store.updateTodos('project-1', [
        {
          id: 'todo-1',
          text: 'Project 1 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateTodos('project-2', [
        {
          id: 'todo-2',
          text: 'Project 2 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      await store.deleteByProjectId('project-1');

      const context1 = await store.getByProjectId('project-1');
      const context2 = await store.getByProjectId('project-2');

      expect(context1.todos).toHaveLength(0);
      expect(context2.todos).toHaveLength(1);
    });
  });
});
