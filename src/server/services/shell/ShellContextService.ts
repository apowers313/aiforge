/**
 * ShellContextService - Manages shell context (todos + notes)
 */
import { randomUUID } from 'node:crypto';
import type { TodoItem, ShellContextData } from '@shared/types/index.js';
import type { ShellContextStore } from '../../storage/stores/ShellContextStore.js';

export interface ShellContextServiceOptions {
  shellContextStore: ShellContextStore;
}

export class ShellContextService {
  private readonly store: ShellContextStore;

  constructor(options: ShellContextServiceOptions) {
    this.store = options.shellContextStore;
  }

  /**
   * Get shell context (todos and notes)
   */
  async getContext(shellId: string): Promise<ShellContextData> {
    return this.store.getByShellId(shellId);
  }

  /**
   * Add a TODO to a shell
   */
  async addTodo(shellId: string, text: string): Promise<TodoItem> {
    const context = await this.store.getByShellId(shellId);
    const maxOrder = context.todos.reduce((max, t) => Math.max(max, t.order), -1);

    const todo: TodoItem = {
      id: randomUUID(),
      text,
      completed: false,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    await this.store.updateTodos(shellId, [...context.todos, todo]);
    return todo;
  }

  /**
   * Update a TODO
   * When completion status changes:
   * - Checking a todo moves it to the bottom of the list
   * - Unchecking a todo moves it back to the top section (before completed items)
   */
  async updateTodo(
    shellId: string,
    todoId: string,
    updates: Partial<Pick<TodoItem, 'text' | 'completed'>>,
  ): Promise<TodoItem | null> {
    const context = await this.store.getByShellId(shellId);
    const todoIndex = context.todos.findIndex((t) => t.id === todoId);
    if (todoIndex === -1) {
      return null;
    }

    const existingTodo = context.todos[todoIndex];
    if (!existingTodo) {
      return null;
    }

    // Determine completedAt based on completion status change
    let completedAt: string | null = existingTodo.completedAt;
    if (updates.completed !== undefined) {
      completedAt = updates.completed ? new Date().toISOString() : null;
    }

    const updatedTodo: TodoItem = {
      ...existingTodo,
      ...updates,
      completedAt,
    };

    // Check if completion status changed
    const completionStatusChanged =
      updates.completed !== undefined && updates.completed !== existingTodo.completed;

    let newTodos: TodoItem[];

    if (completionStatusChanged) {
      // Remove the todo from its current position
      const otherTodos = context.todos.filter((t) => t.id !== todoId);

      if (updates.completed) {
        // Checked: move to the bottom of the list
        newTodos = [...otherTodos, updatedTodo];
      } else {
        // Unchecked: move to the end of incomplete items (before completed items)
        const incompleteTodos = otherTodos.filter((t) => !t.completed);
        const completedTodos = otherTodos.filter((t) => t.completed);
        newTodos = [...incompleteTodos, updatedTodo, ...completedTodos];
      }

      // Update order field to match new array positions
      newTodos = newTodos.map((todo, index) => ({
        ...todo,
        order: index,
      }));
    } else {
      // No completion status change, just update in place
      newTodos = [...context.todos];
      newTodos[todoIndex] = updatedTodo;
    }

    await this.store.updateTodos(shellId, newTodos);
    return updatedTodo;
  }

  /**
   * Delete a TODO
   */
  async deleteTodo(shellId: string, todoId: string): Promise<boolean> {
    const context = await this.store.getByShellId(shellId);
    const todoIndex = context.todos.findIndex((t) => t.id === todoId);
    if (todoIndex === -1) {
      return false;
    }

    const newTodos = context.todos.filter((t) => t.id !== todoId);
    await this.store.updateTodos(shellId, newTodos);
    return true;
  }

  /**
   * Update shell notes
   */
  async updateNotes(shellId: string, notes: string): Promise<void> {
    await this.store.updateNotes(shellId, notes);
  }

  /**
   * Delete all context for a shell
   */
  async deleteAllContext(shellId: string): Promise<void> {
    await this.store.deleteByShellId(shellId);
  }

  /**
   * Clear all completed todos from a shell
   * @returns The number of todos that were cleared
   */
  async clearCompleted(shellId: string): Promise<number> {
    const context = await this.store.getByShellId(shellId);
    const completedCount = context.todos.filter((t) => t.completed).length;
    const remaining = context.todos.filter((t) => !t.completed);
    await this.store.updateTodos(shellId, remaining);
    return completedCount;
  }

  /**
   * Reorder todos by specifying the new order of ids
   * Todos not in the order array are appended at the end in their original order
   */
  async reorderTodos(shellId: string, todoIds: string[]): Promise<void> {
    const context = await this.store.getByShellId(shellId);
    const todoMap = new Map(context.todos.map((t) => [t.id, t]));

    // Build new order: first include todos in the specified order
    const orderedTodos: TodoItem[] = [];
    const includedIds = new Set<string>();

    for (const id of todoIds) {
      const todo = todoMap.get(id);
      if (todo) {
        orderedTodos.push(todo);
        includedIds.add(id);
      }
    }

    // Append todos not in the order array (preserve original order)
    for (const todo of context.todos) {
      if (!includedIds.has(todo.id)) {
        orderedTodos.push(todo);
      }
    }

    // Update order field to match array position
    const updatedTodos = orderedTodos.map((todo, index) => ({
      ...todo,
      order: index,
    }));

    await this.store.updateTodos(shellId, updatedTodos);
  }
}
