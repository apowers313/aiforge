/**
 * Tests for useShellContext hook - shell context (todos + notes) management
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useShellContext } from '@client/hooks/useShellContext';
import { createTestWrapper, createTestQueryClient } from '../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useShellContext', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  describe('fetching context', () => {
    it('fetches shell context on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: '1',
                text: 'Test task',
                completed: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
              },
            ],
            notes: '# Notes',
          }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.todos).toHaveLength(1);
      });

      expect(result.current.todos[0]?.text).toBe('Test task');
      expect(result.current.notes).toBe('# Notes');
    });

    it('returns loading state initially', () => {
      mockFetch.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error');
    });

    it('returns empty context for shell with no data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.todos).toEqual([]);
      expect(result.current.notes).toBe('');
    });
  });

  describe('addTodo', () => {
    it('adds todo via API', async () => {
      // Mock initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock add todo response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: '1',
            text: 'New task',
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: '1',
                text: 'New task',
                completed: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
              },
            ],
            notes: '',
          }),
      });

      await act(async () => {
        await result.current.addTodo('New task');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'New task' }),
        }),
      );
    });

    it('invalidates cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: '1',
            text: 'New task',
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [{ id: '1', text: 'New task', completed: false, createdAt: '', completedAt: null }],
            notes: '',
          }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.addTodo('New task');
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  describe('toggleTodo', () => {
    it('toggles todo completion via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: '1',
                text: 'Task',
                completed: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
              },
            ],
            notes: '',
          }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.todos).toHaveLength(1);
      });

      // Mock toggle response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: '1',
            text: 'Task',
            completed: true,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          }),
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: '1',
                text: 'Task',
                completed: true,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
            notes: '',
          }),
      });

      await act(async () => {
        await result.current.toggleTodo('1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ completed: true }),
        }),
      );
    });
  });

  describe('deleteTodo', () => {
    it('deletes todo via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: '1',
                text: 'Task',
                completed: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
              },
            ],
            notes: '',
          }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.todos).toHaveLength(1);
      });

      // Mock delete response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      await act(async () => {
        await result.current.deleteTodo('1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1/todos/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('updateNotes', () => {
    it('updates notes via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Mock update notes response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '# New Notes' }),
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ todos: [], notes: '# New Notes' }),
      });

      await act(async () => {
        await result.current.updateNotes('# New Notes');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/notes'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ notes: '# New Notes' }),
        }),
      );
    });
  });

  describe('clearCompleted', () => {
    it('clears completed todos via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              { id: '1', text: 'Task 1', completed: true, order: 0, createdAt: '', completedAt: '' },
              { id: '2', text: 'Task 2', completed: false, order: 1, createdAt: '', completedAt: null },
            ],
            notes: '',
          }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.todos).toHaveLength(2);
      });

      // Mock clear completed response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ cleared: 1 }),
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [{ id: '2', text: 'Task 2', completed: false, order: 0, createdAt: '', completedAt: null }],
            notes: '',
          }),
      });

      let clearedCount = 0;
      await act(async () => {
        clearedCount = await result.current.clearCompleted();
      });

      expect(clearedCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos/clear-completed'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('reorderTodos', () => {
    it('reorders todos via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              { id: '1', text: 'Task 1', completed: false, order: 0, createdAt: '', completedAt: null },
              { id: '2', text: 'Task 2', completed: false, order: 1, createdAt: '', completedAt: null },
            ],
            notes: '',
          }),
      });

      const { result } = renderHook(() => useShellContext('shell-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.todos).toHaveLength(2);
      });

      // Mock reorder response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              { id: '2', text: 'Task 2', completed: false, order: 0, createdAt: '', completedAt: null },
              { id: '1', text: 'Task 1', completed: false, order: 1, createdAt: '', completedAt: null },
            ],
            notes: '',
          }),
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            todos: [
              { id: '2', text: 'Task 2', completed: false, order: 0, createdAt: '', completedAt: null },
              { id: '1', text: 'Task 1', completed: false, order: 1, createdAt: '', completedAt: null },
            ],
            notes: '',
          }),
      });

      await act(async () => {
        await result.current.reorderTodos(['2', '1']);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos/reorder'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ todoIds: ['2', '1'] }),
        }),
      );
    });
  });
});
