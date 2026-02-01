import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useWorktrees,
  useMainBranch,
  useCreateWorktree,
  useDeleteWorktree,
  useUpdateWorktreeMetadata,
  useWorktreeStatus,
  useShellsByWorktree,
} from '@client/hooks/useWorktrees';
import { createTestWrapper, createTestQueryClient } from '../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useWorktrees', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  describe('useWorktrees', () => {
    it('fetches worktrees for a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            worktrees: [
              {
                path: '/project/path',
                branch: 'main',
                commit: 'abc123',
                isMain: true,
                isLocked: false,
                name: 'main',
                modifiedCount: 0,
                ahead: 0,
                behind: 0,
              },
            ],
          }),
      });

      const { result } = renderHook(() => useWorktrees('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(1);
      });

      expect(result.current.data?.[0].branch).toBe('main');
      expect(result.current.data?.[0].isMain).toBe(true);
    });

    it('does not fetch when projectId is empty', () => {
      const { result } = renderHook(() => useWorktrees(''), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useMainBranch', () => {
    it('fetches main branch for a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ branch: 'main' }),
      });

      const { result } = renderHook(() => useMainBranch('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toBe('main');
      });
    });

    it('does not fetch when projectId is empty', () => {
      const { result } = renderHook(() => useMainBranch(''), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useCreateWorktree', () => {
    it('creates worktree via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            worktree: {
              path: '/project/.worktrees/feature',
              branch: 'feature',
              commit: 'abc123',
              isMain: false,
              isLocked: false,
              name: 'feature',
              modifiedCount: 0,
              ahead: 0,
              behind: 0,
            },
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const { result } = renderHook(() => useCreateWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ name: 'feature' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/worktrees',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('invalidates worktrees cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            worktree: {
              path: '/project/.worktrees/feature',
              branch: 'feature',
              commit: 'abc123',
              isMain: false,
              isLocked: false,
              name: 'feature',
              modifiedCount: 0,
              ahead: 0,
              behind: 0,
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ name: 'feature' });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  describe('useDeleteWorktree', () => {
    it('deletes worktree via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const { result } = renderHook(() => useDeleteWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ worktreePath: '/project/.worktrees/feature' });
      });

      const encodedPath = encodeURIComponent('/project/.worktrees/feature');
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/projects/proj-1/worktrees/${encodedPath}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('supports force delete via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const { result } = renderHook(() => useDeleteWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ worktreePath: '/project/.worktrees/dirty', force: true });
      });

      const encodedPath = encodeURIComponent('/project/.worktrees/dirty');
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/projects/proj-1/worktrees/${encodedPath}?force=true`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('invalidates worktrees cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ worktreePath: '/project/.worktrees/feature' });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles delete error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => useDeleteWorktree('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({ worktreePath: '/project/.worktrees/feature' });
        } catch {
          // Expected to fail
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error?.message).toBe('Delete failed');
    });
  });

  describe('useUpdateWorktreeMetadata', () => {
    it('updates done status via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            metadata: {
              worktreePath: '/project/.worktrees/feature',
              projectId: 'proj-1',
              done: true,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-02T00:00:00.000Z',
            },
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const { result } = renderHook(() => useUpdateWorktreeMetadata('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          worktreePath: '/project/.worktrees/feature',
          done: true,
        });
      });

      const encodedPath = encodeURIComponent('/project/.worktrees/feature');
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/worktrees/${encodedPath}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('invalidates worktrees cache on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            metadata: {
              worktreePath: '/project/.worktrees/feature',
              projectId: 'proj-1',
              done: true,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-02T00:00:00.000Z',
            },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees: [] }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateWorktreeMetadata('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          worktreePath: '/project/.worktrees/feature',
          done: true,
        });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles update error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Update failed'));

      const { result } = renderHook(() => useUpdateWorktreeMetadata('proj-1'), {
        wrapper: createTestWrapper(queryClient),
      });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            worktreePath: '/project/.worktrees/feature',
            done: true,
          });
        } catch {
          // Expected to fail
        }
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error?.message).toBe('Update failed');
    });
  });

  describe('useWorktreeStatus', () => {
    it('returns blue when done is true', () => {
      const { result } = renderHook(() => useWorktreeStatus(true));
      expect(result.current).toBe('blue');
    });

    it('returns null when done is false and no shell activity', () => {
      const { result } = renderHook(() => useWorktreeStatus(false));
      expect(result.current).toBeNull();
    });

    it('returns null when done is false (reserved params have no effect yet)', () => {
      // Future shell activity parameters are ignored in Phase 5
      const { result } = renderHook(() => useWorktreeStatus(false, true, false));
      expect(result.current).toBeNull();
    });

    it('returns blue even with shell activity when done is true', () => {
      // Done status takes precedence
      const { result } = renderHook(() => useWorktreeStatus(true, true, true));
      expect(result.current).toBe('blue');
    });
  });

  // Phase 6: useShellsByWorktree hook tests
  describe('useShellsByWorktree', () => {
    it('fetches shells for a worktree', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shells: [
              {
                id: 'shell-1',
                projectId: 'proj-1',
                name: 'ai-1',
                type: 'ai',
                worktreePath: '/project/.worktrees/feature',
                cwd: '/project/.worktrees/feature',
                status: 'inactive',
                pid: null,
                socketPath: null,
                lastActivityAt: null,
                done: false,
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
              {
                id: 'shell-2',
                projectId: 'proj-1',
                name: 'shell-1',
                type: 'bash',
                worktreePath: '/project/.worktrees/feature',
                cwd: '/project/.worktrees/feature',
                status: 'inactive',
                pid: null,
                socketPath: null,
                lastActivityAt: null,
                done: false,
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
            ],
          }),
      });

      const { result } = renderHook(() => useShellsByWorktree('/project/.worktrees/feature'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toHaveLength(2);
      });

      expect(result.current.data?.[0].name).toBe('ai-1');
      expect(result.current.data?.[0].worktreePath).toBe('/project/.worktrees/feature');
      expect(result.current.data?.[1].name).toBe('shell-1');
    });

    it('does not fetch when worktreePath is empty', () => {
      const { result } = renderHook(() => useShellsByWorktree(''), {
        wrapper: createTestWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns empty array when no shells for worktree', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const { result } = renderHook(() => useShellsByWorktree('/project/.worktrees/empty'), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(0);
    });

    it('calls correct API endpoint with encoded path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      const worktreePath = '/project/.worktrees/feature-branch';

      renderHook(() => useShellsByWorktree(worktreePath), {
        wrapper: createTestWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const encodedPath = encodeURIComponent(worktreePath);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/worktrees/${encodedPath}/shells`,
        expect.any(Object),
      );
    });
  });
});
