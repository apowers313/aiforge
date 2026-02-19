import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AppShellLayout } from '@client/components/layout/AppShell.js';
import { useUIStore } from '@client/stores/uiStore.js';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient.js';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@client/hooks/queryKeys.js';

// Mock useTerminalSession to prevent WebSocket connection attempts in tests
// Use vi.hoisted to ensure state is available before vi.mock is hoisted
const { mockSessionState } = vi.hoisted(() => {
  return {
    mockSessionState: {
      current: {
        status: 'open' as const,
        shell: {
          id: 'shell-1',
          projectId: 'proj-1',
          name: 'bash-1',
          cwd: '/tmp',
          status: 'active' as const,
          type: 'bash' as const,
          pid: 1234,
          socketPath: null,
          lastActivityAt: null,
          done: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        scrollback: '',
      },
    },
  };
});

vi.mock('@client/hooks/useTerminalSession', () => ({
  useTerminalSession: vi.fn(() => ({
    state: mockSessionState.current,
    open: vi.fn(),
    close: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    retry: vi.fn(),
  })),
}));

// Mock useShellActivityTracker to prevent WebSocket health check fetches
// from consuming sequentially-mocked fetch responses in tests
vi.mock('@client/hooks/useShellActivityTracker', () => ({
  useShellActivityTracker: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AppShellLayout', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
    useUIStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('renders header', () => {
    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<AppShellLayout />, queryClient);
    expect(screen.getByText('AIForge')).toBeInTheDocument();
  });

  it('renders sidebar', () => {
    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<AppShellLayout />, queryClient);
    expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
  });

  it('shows empty state when no shell selected', () => {
    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<AppShellLayout />, queryClient);
    expect(screen.getByText('No shell selected')).toBeInTheDocument();
  });

  it('shows terminal when shell is selected', async () => {
    const mockProject = {
      id: 'proj-1',
      name: 'test-project',
      path: '/tmp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      name: 'bash-1',
      cwd: '/tmp',
      status: 'active' as const,
      type: 'bash' as const,
      pid: 1234,
      socketPath: null,
      lastActivityAt: null,
      done: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Use mockImplementation to handle all fetch calls dynamically
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/projects') && !url.includes('/shells')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ projects: [mockProject] }),
        });
      }
      if (url.includes('/shells') && url.includes('/start')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ shell: mockShell }),
        });
      }
      if (url.includes('/shells')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ shells: [mockShell] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    // Add shell to TanStack Query cache (Terminal component uses useShell which searches cache)
    queryClient.setQueryData(queryKeys.shells.byProject(mockShell.projectId), [mockShell]);

    // Set active shell in UI store
    useUIStore.getState().setActiveShell('shell-1');

    renderWithProviders(<AppShellLayout />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
    });
  });

  it('opens add project modal', async () => {
    const user = userEvent.setup();

    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<AppShellLayout />, queryClient);

    await user.click(screen.getByTestId('add-project-button'));
    expect(useUIStore.getState().addProjectModalOpen).toBe(true);
  });

  it('can add project via modal', async () => {
    const user = userEvent.setup();

    // Mock initial getProjects call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });
    // Mock getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Mock browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          path: '/home/testuser',
          parent: '/home',
          entries: [],
        }),
    });

    useUIStore.getState().openAddProjectModal();
    renderWithProviders(<AppShellLayout />, queryClient);

    // Wait for directory to load
    await waitFor(() => {
      expect(screen.getByTestId('select-directory-button')).toBeInTheDocument();
    });

    // Mock createProject API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          project: {
            id: 'proj-123',
            name: 'testuser',
            path: '/home/testuser',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
    });

    // Mock refetch after create
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          projects: [
            {
              id: 'proj-123',
              name: 'testuser',
              path: '/home/testuser',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    });

    // Click select button
    const selectButton = screen.getByTestId('select-directory-button');
    await user.click(selectButton);

    // Verify API was called
    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
      const createCall = calls.find(
        (call) => call[0] === '/api/projects' && call[1]?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });

    // Modal should close
    await waitFor(() => {
      expect(useUIStore.getState().addProjectModalOpen).toBe(false);
    });
  });

  // Regression test: Projects must be persisted via API, not just local state
  it('persists project via API when selecting directory', async () => {
    const user = userEvent.setup();

    // Mock initial getProjects call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });
    // Mock getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Mock browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          path: '/home/testuser',
          parent: '/home',
          entries: [],
        }),
    });

    useUIStore.getState().openAddProjectModal();
    renderWithProviders(<AppShellLayout />, queryClient);

    // Wait for directory to load
    await waitFor(() => {
      expect(screen.getByTestId('select-directory-button')).toBeInTheDocument();
    });

    // Mock createProject API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          project: {
            id: 'proj-123',
            name: 'testuser',
            path: '/home/testuser',
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
          projects: [
            {
              id: 'proj-123',
              name: 'testuser',
              path: '/home/testuser',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    });

    // Click select button
    await user.click(screen.getByTestId('select-directory-button'));

    // REGRESSION: Verify API was called to persist the project
    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
      const createCall = calls.find(
        (call) => call[0] === '/api/projects' && call[1]?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({ path: '/home/testuser' });
    });
  });
});
