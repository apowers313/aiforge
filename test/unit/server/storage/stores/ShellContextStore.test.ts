/**
 * Tests for ShellContextStore - shell context data (todos + notes) storage
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShellContextStore } from '@server/storage/stores/ShellContextStore.js';
import type { TodoItem } from '@shared/types/index.js';

describe('ShellContextStore', () => {
  let store: ShellContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'shell-context-test-'));
    store = new ShellContextStore(join(tempDir, 'shell-context.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getByShellId', () => {
    it('returns empty context for new shell', async () => {
      const context = await store.getByShellId('new-shell');

      expect(context).toEqual({ todos: [], notes: '' });
    });

    it('returns stored context for existing shell', async () => {
      const todo: TodoItem = {
        id: 'todo-1',
        text: 'Test task',
        completed: false,
        order: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };

      await store.updateTodos('shell-1', [todo]);
      const context = await store.getByShellId('shell-1');

      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('Test task');
    });
  });

  describe('updateTodos', () => {
    it('adds todos to a shell', async () => {
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

      await store.updateTodos('shell-1', todos);
      const context = await store.getByShellId('shell-1');

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

      await store.updateTodos('shell-1', initial);
      await store.updateTodos('shell-1', updated);

      const context = await store.getByShellId('shell-1');
      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('New task');
    });

    it('preserves notes when updating todos', async () => {
      await store.updateNotes('shell-1', 'Important notes');
      await store.updateTodos('shell-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      const context = await store.getByShellId('shell-1');
      expect(context.notes).toBe('Important notes');
      expect(context.todos).toHaveLength(1);
    });

    it('isolates todos between different shells', async () => {
      await store.updateTodos('shell-1', [
        {
          id: 'todo-1',
          text: 'Shell 1 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      await store.updateTodos('shell-2', [
        {
          id: 'todo-2',
          text: 'Shell 2 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      const context1 = await store.getByShellId('shell-1');
      const context2 = await store.getByShellId('shell-2');

      expect(context1.todos[0]?.text).toBe('Shell 1 task');
      expect(context2.todos[0]?.text).toBe('Shell 2 task');
    });
  });

  describe('updateNotes', () => {
    it('stores notes for a shell', async () => {
      await store.updateNotes('shell-1', '# My Notes\n\nSome content');

      const context = await store.getByShellId('shell-1');
      expect(context.notes).toBe('# My Notes\n\nSome content');
    });

    it('replaces existing notes', async () => {
      await store.updateNotes('shell-1', 'Old notes');
      await store.updateNotes('shell-1', 'New notes');

      const context = await store.getByShellId('shell-1');
      expect(context.notes).toBe('New notes');
    });

    it('preserves todos when updating notes', async () => {
      await store.updateTodos('shell-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateNotes('shell-1', 'Notes');

      const context = await store.getByShellId('shell-1');
      expect(context.todos).toHaveLength(1);
      expect(context.notes).toBe('Notes');
    });

    it('allows empty notes', async () => {
      await store.updateNotes('shell-1', 'Some notes');
      await store.updateNotes('shell-1', '');

      const context = await store.getByShellId('shell-1');
      expect(context.notes).toBe('');
    });
  });

  describe('deleteByShellId', () => {
    it('removes all context for a shell', async () => {
      await store.updateTodos('shell-1', [
        {
          id: 'todo-1',
          text: 'Task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateNotes('shell-1', 'Notes');

      await store.deleteByShellId('shell-1');

      const context = await store.getByShellId('shell-1');
      expect(context).toEqual({ todos: [], notes: '' });
    });

    it('does not affect other shells', async () => {
      await store.updateTodos('shell-1', [
        {
          id: 'todo-1',
          text: 'Shell 1 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);
      await store.updateTodos('shell-2', [
        {
          id: 'todo-2',
          text: 'Shell 2 task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]);

      await store.deleteByShellId('shell-1');

      const context1 = await store.getByShellId('shell-1');
      const context2 = await store.getByShellId('shell-2');

      expect(context1.todos).toHaveLength(0);
      expect(context2.todos).toHaveLength(1);
    });
  });
});
