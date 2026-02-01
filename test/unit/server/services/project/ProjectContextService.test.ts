/**
 * Tests for ProjectContextService - project context (todos + notes) management
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectContextService } from '@server/services/project/ProjectContextService.js';
import { ProjectContextStore } from '@server/storage/stores/ProjectContextStore.js';

describe('ProjectContextService', () => {
  let service: ProjectContextService;
  let store: ProjectContextStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'project-context-service-test-'));
    store = new ProjectContextStore(join(tempDir, 'project-context.json'));
    service = new ProjectContextService({ projectContextStore: store });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getContext', () => {
    it('returns empty context for new project', async () => {
      const context = await service.getContext('new-project');

      expect(context.todos).toEqual([]);
      expect(context.notes).toBe('');
    });

    it('returns stored context for existing project', async () => {
      await service.addTodo('project-1', 'Test task');

      const context = await service.getContext('project-1');

      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('Test task');
    });
  });

  describe('addTodo', () => {
    it('creates todo with generated ID', async () => {
      const todo = await service.addTodo('project-1', 'Test task');

      expect(todo.id).toBeDefined();
      expect(todo.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(todo.text).toBe('Test task');
      expect(todo.completed).toBe(false);
      expect(todo.createdAt).toBeDefined();
      expect(todo.completedAt).toBeNull();
    });

    it('stores todo for the correct project', async () => {
      await service.addTodo('project-1', 'Task 1');
      await service.addTodo('project-2', 'Task 2');

      const context1 = await service.getContext('project-1');
      const context2 = await service.getContext('project-2');

      expect(context1.todos).toHaveLength(1);
      expect(context1.todos[0]?.text).toBe('Task 1');
      expect(context2.todos).toHaveLength(1);
      expect(context2.todos[0]?.text).toBe('Task 2');
    });

    it('allows multiple todos per project', async () => {
      await service.addTodo('project-1', 'Task 1');
      await service.addTodo('project-1', 'Task 2');
      await service.addTodo('project-1', 'Task 3');

      const context = await service.getContext('project-1');

      expect(context.todos).toHaveLength(3);
    });
  });

  describe('updateTodo', () => {
    it('updates todo text', async () => {
      const created = await service.addTodo('project-1', 'Original text');

      const updated = await service.updateTodo('project-1', created.id, {
        text: 'Updated text',
      });

      expect(updated?.text).toBe('Updated text');
      expect(updated?.completed).toBe(false);
    });

    it('updates todo completion to true', async () => {
      const created = await service.addTodo('project-1', 'Task');

      const updated = await service.updateTodo('project-1', created.id, {
        completed: true,
      });

      expect(updated?.completed).toBe(true);
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.completedAt).not.toBeNull();
    });

    it('updates todo completion to false and clears completedAt', async () => {
      const created = await service.addTodo('project-1', 'Task');
      await service.updateTodo('project-1', created.id, { completed: true });

      const updated = await service.updateTodo('project-1', created.id, {
        completed: false,
      });

      expect(updated?.completed).toBe(false);
      expect(updated?.completedAt).toBeNull();
    });

    it('updates both text and completion', async () => {
      const created = await service.addTodo('project-1', 'Task');

      const updated = await service.updateTodo('project-1', created.id, {
        text: 'New text',
        completed: true,
      });

      expect(updated?.text).toBe('New text');
      expect(updated?.completed).toBe(true);
    });

    it('returns null for non-existent todo', async () => {
      const updated = await service.updateTodo('project-1', 'nonexistent', {
        text: 'New text',
      });

      expect(updated).toBeNull();
    });

    it('returns null for todo in different project', async () => {
      const created = await service.addTodo('project-1', 'Task');

      const updated = await service.updateTodo('project-2', created.id, {
        text: 'New text',
      });

      expect(updated).toBeNull();
    });

    // Regression tests for auto-reorder on completion status change
    describe('auto-reorder on completion', () => {
      it('moves checked todo to the bottom of the list', async () => {
        const todo1 = await service.addTodo('project-1', 'Task 1');
        const todo2 = await service.addTodo('project-1', 'Task 2');
        const todo3 = await service.addTodo('project-1', 'Task 3');

        // Check the first todo
        await service.updateTodo('project-1', todo1.id, { completed: true });

        const context = await service.getContext('project-1');

        // Task 1 should now be at the bottom
        expect(context.todos[0]?.id).toBe(todo2.id);
        expect(context.todos[1]?.id).toBe(todo3.id);
        expect(context.todos[2]?.id).toBe(todo1.id);

        // Orders should be updated
        expect(context.todos[0]?.order).toBe(0);
        expect(context.todos[1]?.order).toBe(1);
        expect(context.todos[2]?.order).toBe(2);
      });

      it('moves checked todo to the bottom when there are already completed todos', async () => {
        const todo1 = await service.addTodo('project-1', 'Task 1');
        const todo2 = await service.addTodo('project-1', 'Task 2');
        const todo3 = await service.addTodo('project-1', 'Task 3');

        // Check the last todo first
        await service.updateTodo('project-1', todo3.id, { completed: true });
        // Now check the first todo
        await service.updateTodo('project-1', todo1.id, { completed: true });

        const context = await service.getContext('project-1');

        // Task 2 (incomplete) should be first, then the two completed in order
        expect(context.todos[0]?.id).toBe(todo2.id);
        expect(context.todos[0]?.completed).toBe(false);
        expect(context.todos[1]?.id).toBe(todo3.id);
        expect(context.todos[1]?.completed).toBe(true);
        expect(context.todos[2]?.id).toBe(todo1.id);
        expect(context.todos[2]?.completed).toBe(true);
      });

      it('moves unchecked todo back to the end of incomplete section', async () => {
        const todo1 = await service.addTodo('project-1', 'Task 1');
        const todo2 = await service.addTodo('project-1', 'Task 2');
        const todo3 = await service.addTodo('project-1', 'Task 3');

        // Check todo1 and todo2
        await service.updateTodo('project-1', todo1.id, { completed: true });
        await service.updateTodo('project-1', todo2.id, { completed: true });

        // Now uncheck todo1
        await service.updateTodo('project-1', todo1.id, { completed: false });

        const context = await service.getContext('project-1');

        // Order should be: Task 3 (incomplete), Task 1 (unchecked), Task 2 (completed)
        expect(context.todos[0]?.id).toBe(todo3.id);
        expect(context.todos[0]?.completed).toBe(false);
        expect(context.todos[1]?.id).toBe(todo1.id);
        expect(context.todos[1]?.completed).toBe(false);
        expect(context.todos[2]?.id).toBe(todo2.id);
        expect(context.todos[2]?.completed).toBe(true);
      });

      it('does not reorder when updating text only', async () => {
        const todo1 = await service.addTodo('project-1', 'Task 1');
        const todo2 = await service.addTodo('project-1', 'Task 2');
        const todo3 = await service.addTodo('project-1', 'Task 3');

        // Update text of first todo
        await service.updateTodo('project-1', todo1.id, { text: 'Updated Task 1' });

        const context = await service.getContext('project-1');

        // Order should remain unchanged
        expect(context.todos[0]?.id).toBe(todo1.id);
        expect(context.todos[0]?.text).toBe('Updated Task 1');
        expect(context.todos[1]?.id).toBe(todo2.id);
        expect(context.todos[2]?.id).toBe(todo3.id);
      });

      it('does not reorder when setting same completion status', async () => {
        const todo1 = await service.addTodo('project-1', 'Task 1');
        const todo2 = await service.addTodo('project-1', 'Task 2');

        // Check todo1
        await service.updateTodo('project-1', todo1.id, { completed: true });

        // Set completed: true again (no change)
        await service.updateTodo('project-1', todo1.id, { completed: true });

        const context = await service.getContext('project-1');

        // Order should remain as after first check
        expect(context.todos[0]?.id).toBe(todo2.id);
        expect(context.todos[1]?.id).toBe(todo1.id);
      });
    });
  });

  describe('deleteTodo', () => {
    it('removes todo from project', async () => {
      const created = await service.addTodo('project-1', 'Task');

      const result = await service.deleteTodo('project-1', created.id);

      expect(result).toBe(true);

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(0);
    });

    it('returns false for non-existent todo', async () => {
      const result = await service.deleteTodo('project-1', 'nonexistent');

      expect(result).toBe(false);
    });

    it('only deletes from correct project', async () => {
      const created = await service.addTodo('project-1', 'Task');

      const result = await service.deleteTodo('project-2', created.id);

      expect(result).toBe(false);

      // Todo should still exist in project-1
      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(1);
    });
  });

  describe('updateNotes', () => {
    it('stores notes for a project', async () => {
      await service.updateNotes('project-1', '# My Notes\n\nSome content');

      const context = await service.getContext('project-1');
      expect(context.notes).toBe('# My Notes\n\nSome content');
    });

    it('replaces existing notes', async () => {
      await service.updateNotes('project-1', 'Old notes');
      await service.updateNotes('project-1', 'New notes');

      const context = await service.getContext('project-1');
      expect(context.notes).toBe('New notes');
    });

    it('preserves todos when updating notes', async () => {
      await service.addTodo('project-1', 'Task');
      await service.updateNotes('project-1', 'Some notes');

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(1);
      expect(context.notes).toBe('Some notes');
    });
  });

  describe('deleteAllContext', () => {
    it('removes all context for a project', async () => {
      await service.addTodo('project-1', 'Task');
      await service.updateNotes('project-1', 'Notes');

      await service.deleteAllContext('project-1');

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(0);
      expect(context.notes).toBe('');
    });

    it('does not affect other projects', async () => {
      await service.addTodo('project-1', 'Task 1');
      await service.addTodo('project-2', 'Task 2');

      await service.deleteAllContext('project-1');

      const context1 = await service.getContext('project-1');
      const context2 = await service.getContext('project-2');

      expect(context1.todos).toHaveLength(0);
      expect(context2.todos).toHaveLength(1);
    });
  });

  describe('clearCompleted', () => {
    it('removes all completed todos', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');
      await service.addTodo('project-1', 'Task 3');

      await service.updateTodo('project-1', todo1.id, { completed: true });
      await service.updateTodo('project-1', todo2.id, { completed: true });

      const count = await service.clearCompleted('project-1');

      expect(count).toBe(2);

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(1);
      expect(context.todos[0]?.text).toBe('Task 3');
    });

    it('returns 0 when no completed todos', async () => {
      await service.addTodo('project-1', 'Task 1');
      await service.addTodo('project-1', 'Task 2');

      const count = await service.clearCompleted('project-1');

      expect(count).toBe(0);

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(2);
    });

    it('works with empty todo list', async () => {
      const count = await service.clearCompleted('project-1');

      expect(count).toBe(0);
    });

    it('preserves order of remaining todos', async () => {
      await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');
      await service.addTodo('project-1', 'Task 3');

      await service.updateTodo('project-1', todo2.id, { completed: true });

      await service.clearCompleted('project-1');

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(2);
      expect(context.todos[0]?.text).toBe('Task 1');
      expect(context.todos[1]?.text).toBe('Task 3');
    });
  });

  describe('reorderTodos', () => {
    it('reorders todos by id array', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');
      const todo3 = await service.addTodo('project-1', 'Task 3');

      await service.reorderTodos('project-1', [todo3.id, todo1.id, todo2.id]);

      const context = await service.getContext('project-1');
      expect(context.todos[0]?.text).toBe('Task 3');
      expect(context.todos[1]?.text).toBe('Task 1');
      expect(context.todos[2]?.text).toBe('Task 2');
      expect(context.todos[0]?.order).toBe(0);
      expect(context.todos[1]?.order).toBe(1);
      expect(context.todos[2]?.order).toBe(2);
    });

    it('ignores unknown ids in order array', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');

      await service.reorderTodos('project-1', [todo2.id, 'unknown-id', todo1.id]);

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(2);
      expect(context.todos[0]?.text).toBe('Task 2');
      expect(context.todos[1]?.text).toBe('Task 1');
    });

    it('appends missing todos at end', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');
      const todo3 = await service.addTodo('project-1', 'Task 3');

      // Only specify order for 2 of 3 todos
      await service.reorderTodos('project-1', [todo2.id]);

      const context = await service.getContext('project-1');
      expect(context.todos).toHaveLength(3);
      expect(context.todos[0]?.text).toBe('Task 2');
      // Other todos appended at end in original order
      expect(context.todos[1]?.id).toBe(todo1.id);
      expect(context.todos[2]?.id).toBe(todo3.id);
    });

    it('works with empty order array', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');

      await service.reorderTodos('project-1', []);

      const context = await service.getContext('project-1');
      // Todos remain in original order
      expect(context.todos).toHaveLength(2);
      expect(context.todos[0]?.id).toBe(todo1.id);
      expect(context.todos[1]?.id).toBe(todo2.id);
    });
  });

  describe('addTodo order', () => {
    it('assigns sequential order to new todos', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      const todo2 = await service.addTodo('project-1', 'Task 2');
      const todo3 = await service.addTodo('project-1', 'Task 3');

      expect(todo1.order).toBe(0);
      expect(todo2.order).toBe(1);
      expect(todo3.order).toBe(2);
    });

    it('continues order after deletion', async () => {
      const todo1 = await service.addTodo('project-1', 'Task 1');
      await service.addTodo('project-1', 'Task 2');
      await service.deleteTodo('project-1', todo1.id);

      const todo3 = await service.addTodo('project-1', 'Task 3');

      // Order should be 2 (max existing order + 1)
      expect(todo3.order).toBe(2);
    });
  });
});
