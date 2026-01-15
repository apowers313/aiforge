import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  useSelectedProjectId,
} from '@client/hooks/useProjects';
import { useUIStore } from '@client/stores/uiStore';
import { createTestWrapper, createTestQueryClient } from '../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useProjects', () => {
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

  describe('useProjects', () => {
    it('fetches projects on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            projects: [
              {
                id: '1',
                name: 'test',
                path: '/tmp',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(1);
      });
    });

    it('returns loading state initially', () => {
      mockFetch.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

      const { result } = renderHook(() => useProjects(), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useProjects(), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error');
    });

    it('returns empty array when no projects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ projects: [] }),
      });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('useCreateProject', () => {
    it('creates project via API', async () => {
      // Mock create response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            project: {
              id: '1',
              name: 'new',
              path: '/new',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      // Mock refetch after mutation (invalidateQueries triggers refetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            projects: [
              {
                id: '1',
                name: 'new',
                path: '/new',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
      });

      const { result } = renderHook(() => useCreateProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync('/new');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('invalidates project cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            project: {
              id: '1',
              name: 'new',
              path: '/new',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            projects: [{ id: '1', name: 'new', path: '/new', createdAt: '', updatedAt: '' }],
          }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync('/new');
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  describe('useDeleteProject', () => {
    it('deletes project via API', async () => {
      // Pre-populate cache with a project
      queryClient.setQueryData(['projects'], [
        {
          id: '1',
          name: 'test',
          path: '/tmp',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      // Mock delete response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ projects: [] }),
      });

      const { result } = renderHook(() => useDeleteProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync('1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/projects/1', expect.objectContaining({ method: 'DELETE' }));
    });

    it('calls API to delete project', async () => {
      // Just verify that delete calls the API with correct params
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ projects: [] }),
      });

      const { result } = renderHook(() => useDeleteProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync('1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('handles delete error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => useDeleteProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync('1');
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

  describe('useUpdateProject', () => {
    it('updates project via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            project: {
              id: '1',
              name: 'updated',
              path: '/tmp',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            projects: [{ id: '1', name: 'updated', path: '/tmp', createdAt: '', updatedAt: '' }],
          }),
      });

      const { result } = renderHook(() => useUpdateProject(), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: '1', updates: { name: 'updated' } });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'updated' }),
        }),
      );
    });
  });

  describe('useSelectedProjectId', () => {
    it('returns selected project id from UI store', () => {
      useUIStore.getState().setSelectedProject('proj-1');

      const { result } = renderHook(() => useSelectedProjectId(), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.selectedProjectId).toBe('proj-1');
    });

    it('can set selected project id', () => {
      const { result } = renderHook(() => useSelectedProjectId(), {
        wrapper: createTestWrapper(queryClient),
      });

      act(() => {
        result.current.setSelectedProject('proj-2');
      });

      expect(useUIStore.getState().selectedProjectId).toBe('proj-2');
    });
  });
});
