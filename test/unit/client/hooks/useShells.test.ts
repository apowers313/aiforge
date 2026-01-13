import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useShells,
  useAllShells,
  useCreateShell,
  useDeleteShell,
  useUpdateShell,
  useRestartShell,
  useActiveShellId,
} from '@client/hooks/useShells';
import { useUIStore } from '@client/stores/uiStore';
import { createTestWrapper, createTestQueryClient } from '../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useShells', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    useUIStore.getState().reset();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  describe('useShells', () => {
    it('fetches shells for a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shells: [
              {
                id: 'shell-1',
                projectId: 'proj-1',
                name: 'bash-1',
                cwd: '/tmp',
                status: 'active',
                pid: 1234,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const { result } = renderHook(() => useShells('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(1);
      });
    });

    it('returns empty array when projectId is null', () => {
      const { result } = renderHook(() => useShells(null), {
        wrapper: createTestWrapper(queryClient),
      });

      // Should not be loading since query is disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('does not fetch when projectId is null', () => {
      renderHook(() => useShells(null), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useShells('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error');
    });
  });

  describe('useAllShells', () => {
    it('fetches shells for multiple projects', async () => {
      // Mock fetch for proj-1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shells: [
              {
                id: 'shell-1',
                projectId: 'proj-1',
                name: 'bash-1',
                cwd: '/tmp',
                status: 'active',
                pid: 1234,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      // Mock fetch for proj-2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shells: [
              {
                id: 'shell-2',
                projectId: 'proj-2',
                name: 'bash-1',
                cwd: '/home',
                status: 'active',
                pid: 1235,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const { result } = renderHook(() => useAllShells(['proj-1', 'proj-2']), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(2);
      });
    });

    it('does not fetch when projectIds is empty', async () => {
      const { result } = renderHook(() => useAllShells([]), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(false);

      // Wait a tick
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useCreateShell', () => {
    it('creates shell via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: 'proj-1',
              name: 'bash-1',
              cwd: '/tmp',
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shells: [
              {
                id: 'shell-1',
                projectId: 'proj-1',
                name: 'bash-1',
                cwd: '/tmp',
                status: 'active',
                pid: 1234,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const { result } = renderHook(() => useCreateShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ projectId: 'proj-1', name: 'bash-1' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/shells',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('creates shell with auto-generated name when name is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: 'proj-1',
              name: 'shell-1',
              cwd: '/tmp',
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useCreateShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ projectId: 'proj-1' });
      });

      const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
      const createCall = calls.find(
        (call) => call[0] === '/api/projects/proj-1/shells' && call[1]?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });

    it('invalidates shell cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: 'proj-1',
              name: 'bash-1',
              cwd: '/tmp',
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ projectId: 'proj-1', name: 'bash-1' });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  describe('useDeleteShell', () => {
    it('deletes shell via API', async () => {
      // Pre-populate cache
      queryClient.setQueryData(['shells', 'proj-1'], [
        {
          id: 'shell-1',
          projectId: 'proj-1',
          name: 'bash-1',
          cwd: '/tmp',
          status: 'active',
          pid: 1234,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useDeleteShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ shellId: 'shell-1', projectId: 'proj-1' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('calls API to delete shell', async () => {
      // Just verify that delete calls the API with correct params
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useDeleteShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ shellId: 'shell-1', projectId: 'proj-1' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('clears active shell if deleted shell was active', async () => {
      useUIStore.getState().setActiveShell('shell-1');

      queryClient.setQueryData(['shells', 'proj-1'], [
        {
          id: 'shell-1',
          projectId: 'proj-1',
          name: 'bash-1',
          cwd: '/tmp',
          status: 'active',
          pid: 1234,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useDeleteShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ shellId: 'shell-1', projectId: 'proj-1' });
      });

      expect(useUIStore.getState().activeShellId).toBeNull();
    });

    it('handles delete error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => useDeleteShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({ shellId: 'shell-1', projectId: 'proj-1' });
        } catch {
          // Expected to fail
        }
      });

      // Mutation should be in error state
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error?.message).toBe('Delete failed');
    });
  });

  describe('useUpdateShell', () => {
    it('updates shell via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: 'proj-1',
              name: 'renamed-shell',
              cwd: '/tmp',
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useUpdateShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ shellId: 'shell-1', updates: { name: 'renamed-shell' } });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'renamed-shell' }),
        }),
      );
    });
  });

  describe('useRestartShell', () => {
    it('restarts shell via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: 'proj-1',
              name: 'bash-1',
              cwd: '/tmp',
              status: 'active',
              pid: 5678,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useRestartShell(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync('shell-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1/restart',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('useActiveShellId', () => {
    it('returns active shell id from UI store', () => {
      useUIStore.getState().setActiveShell('shell-1');

      const { result } = renderHook(() => useActiveShellId(), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.activeShellId).toBe('shell-1');
    });

    it('can set active shell id', () => {
      const { result } = renderHook(() => useActiveShellId(), {
        wrapper: createTestWrapper(queryClient),
      });

      act(() => {
        result.current.setActiveShell('shell-2');
      });

      expect(useUIStore.getState().activeShellId).toBe('shell-2');
    });

    it('can clear active shell', () => {
      useUIStore.getState().setActiveShell('shell-1');

      const { result } = renderHook(() => useActiveShellId(), {
        wrapper: createTestWrapper(queryClient),
      });

      act(() => {
        result.current.setActiveShell(null);
      });

      expect(useUIStore.getState().activeShellId).toBeNull();
    });
  });
});
