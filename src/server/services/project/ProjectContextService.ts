/**
 * ProjectContextService - Manages project context (todos + notes)
 */
import { randomUUID } from 'node:crypto';
import type { TodoItem, ProjectContextData } from '@shared/types/index.js';
import type { ProjectContextStore } from '../../storage/stores/ProjectContextStore.js';

export interface ProjectContextServiceOptions {
  projectContextStore: ProjectContextStore;
}

export class ProjectContextService {
  private readonly store: ProjectContextStore;

  constructor(options: ProjectContextServiceOptions) {
    this.store = options.projectContextStore;
  }

  /**
   * Get project context (todos and notes)
   */
  async getContext(projectId: string): Promise<ProjectContextData> {
    return this.store.getByProjectId(projectId);
  }

  /**
   * Add a TODO to a project
   */
  async addTodo(projectId: string, text: string): Promise<TodoItem> {
    const context = await this.store.getByProjectId(projectId);
    const maxOrder = context.todos.reduce((max, t) => Math.max(max, t.order), -1);

    const todo: TodoItem = {
      id: randomUUID(),
      text,
      completed: false,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    await this.store.updateTodos(projectId, [...context.todos, todo]);
    return todo;
  }

  /**
   * Update a TODO
   * When completion status changes:
   * - Checking a todo moves it to the bottom of the list
   * - Unchecking a todo moves it back to the top section (before completed items)
   */
  async updateTodo(
    projectId: string,
    todoId: string,
    updates: Partial<Pick<TodoItem, 'text' | 'completed'>>,
  ): Promise<TodoItem | null> {
    const context = await this.store.getByProjectId(projectId);
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

    await this.store.updateTodos(projectId, newTodos);
    return updatedTodo;
  }

  /**
   * Delete a TODO
   */
  async deleteTodo(projectId: string, todoId: string): Promise<boolean> {
    const context = await this.store.getByProjectId(projectId);
    const todoIndex = context.todos.findIndex((t) => t.id === todoId);
    if (todoIndex === -1) {
      return false;
    }

    const newTodos = context.todos.filter((t) => t.id !== todoId);
    await this.store.updateTodos(projectId, newTodos);
    return true;
  }

  /**
   * Update project notes
   */
  async updateNotes(projectId: string, notes: string): Promise<void> {
    await this.store.updateNotes(projectId, notes);
  }

  /**
   * Delete all context for a project
   */
  async deleteAllContext(projectId: string): Promise<void> {
    await this.store.deleteByProjectId(projectId);
  }

  /**
   * Clear all completed todos from a project
   * @returns The number of todos that were cleared
   */
  async clearCompleted(projectId: string): Promise<number> {
    const context = await this.store.getByProjectId(projectId);
    const completedCount = context.todos.filter((t) => t.completed).length;
    const remaining = context.todos.filter((t) => !t.completed);
    await this.store.updateTodos(projectId, remaining);
    return completedCount;
  }

  /**
   * Reorder todos by specifying the new order of ids
   * Todos not in the order array are appended at the end in their original order
   */
  async reorderTodos(projectId: string, todoIds: string[]): Promise<void> {
    const context = await this.store.getByProjectId(projectId);
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

    await this.store.updateTodos(projectId, updatedTodos);
  }
}
