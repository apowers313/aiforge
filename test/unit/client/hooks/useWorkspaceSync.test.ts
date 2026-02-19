import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWorkspaceSync } from '@client/hooks/useWorkspaceSync.js';
import { useUIStore } from '@client/stores/uiStore.js';
import { createTestWrapper, createTestQueryClient } from '../../../utils/testQueryClient.js';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useWorkspaceSync', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    useUIStore.getState().reset();
    mockFetch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    queryClient.clear();
  });

  const mockAuthStatus = (authenticated: boolean): void => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ authenticated }),
    });
  };

  const mockWorkspaceState = (state: Record<string, unknown>): void => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          workspaceState: {
            sidebarCollapsed: false,
            expandedProjectIds: [],
            activeShellId: null,
            updatedAt: new Date().toISOString(),
            ...state,
          },
        }),
    });
  };

  const mockUpdateWorkspace = (): void => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          workspaceState: {
            sidebarCollapsed: true,
            expandedProjectIds: [],
            activeShellId: null,
            updatedAt: new Date().toISOString(),
          },
        }),
    });
  };

  it('does not fetch workspace state when not authenticated', async () => {
    // Auth returns not authenticated
    mockAuthStatus(false);

    renderHook(() => useWorkspaceSync(), {
      wrapper: createTestWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/status'),
        expect.any(Object),
      );
    });

    // Should NOT have called workspace endpoint
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/workspace'),
      expect.any(Object),
    );
  });

  it('fetches and applies workspace state when authenticated', async () => {
    // First auth check
    mockAuthStatus(true);
    // Then workspace state fetch
    mockWorkspaceState({
      sidebarCollapsed: true,
      expandedProjectIds: ['project-1', 'project-2'],
      activeShellId: 'shell-1',
    });

    const { result } = renderHook(() => useWorkspaceSync(), {
      wrapper: createTestWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    // Verify state was applied to Zustand store
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(useUIStore.getState().expandedProjectIds).toEqual(['project-1', 'project-2']);
    expect(useUIStore.getState().activeShellId).toBe('shell-1');
  });

  it('debounces saves when state changes', async () => {
    // Auth check
    mockAuthStatus(true);
    // Initial workspace state
    mockWorkspaceState({});
    // Prepare update response
    mockUpdateWorkspace();

    renderHook(() => useWorkspaceSync(), {
      wrapper: createTestWrapper(queryClient),
    });

    // Wait for initial auth and workspace state to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const callsBeforeStateChange = mockFetch.mock.calls.length;

    // Change state in Zustand
    act(() => {
      useUIStore.getState().toggleSidebar();
    });

    // Should not immediately call update
    expect(mockFetch.mock.calls.length).toBe(callsBeforeStateChange);

    // Advance timer past debounce (500ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Now should have called update (one additional call)
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBeforeStateChange);
    });

    // Verify the last call was a PATCH
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall?.[0]).toContain('/api/workspace');
    expect(lastCall?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('does not save until initial load completes', async () => {
    // Auth check
    mockAuthStatus(true);
    // Initial workspace state - never resolves (pending)
    mockFetch.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

    renderHook(() => useWorkspaceSync(), {
      wrapper: createTestWrapper(queryClient),
    });

    // Wait for auth check to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/status'),
        expect.any(Object),
      );
    });

    // Record the call count after auth check and pending workspace request
    const callCountAfterInitialRequests = mockFetch.mock.calls.length;

    // Change state in Zustand while still loading
    act(() => {
      useUIStore.getState().toggleSidebar();
    });

    // Advance timer past debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Should NOT have made any additional calls (no PATCH) since load hasn't completed
    expect(mockFetch.mock.calls.length).toBe(callCountAfterInitialRequests);
  });

  it('returns isLoaded false initially', () => {
    mockAuthStatus(true);
    mockFetch.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

    const { result } = renderHook(() => useWorkspaceSync(), {
      wrapper: createTestWrapper(queryClient),
    });

    expect(result.current.isLoaded).toBe(false);
  });
});
