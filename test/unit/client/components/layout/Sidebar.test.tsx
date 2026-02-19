import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Sidebar } from '@client/components/layout/Sidebar.js';
import { useUIStore } from '@client/stores/uiStore.js';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient.js';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Setup mock fetch to handle all API calls for Sidebar/ProjectItem
 * This is needed because ProjectItem now calls multiple APIs:
 * - GET /api/projects
 * - GET /api/projects/:id/shells
 * - GET /api/projects/:id/worktrees
 */
function setupMockFetch(options: {
  projects?: unknown[];
  shells?: unknown[];
  worktrees?: unknown[];
  mainBranch?: string;
} = {}): void {
  const { projects = [], shells = [], worktrees = [], mainBranch = 'main' } = options;

  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/projects') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ projects }),
      });
    }
    if (url.includes('/shells')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells }),
      });
    }
    if (url.includes('/worktrees/main')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ branch: mainBranch }),
      });
    }
    if (url.includes('/worktrees')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ worktrees }),
      });
    }
    // Default response for unknown URLs
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
}

describe('Sidebar', () => {
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

  it('renders add project button', async () => {
    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
    });
  });

  it('renders project list', async () => {
    // Mock getProjects with a project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          projects: [
            {
              id: '1',
              name: 'my-project',
              path: '/tmp',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });
  });

  it('expands project to show shells', async () => {
    const user = userEvent.setup();

    const mockProject = {
      id: '1',
      name: 'proj',
      path: '/tmp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockShell = {
      id: 's1',
      projectId: '1',
      name: 'bash-1',
      cwd: '/',
      status: 'inactive',
      pid: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Setup mocks to handle all API endpoints ProjectItem calls
    setupMockFetch({
      projects: [mockProject],
      shells: [mockShell],
      worktrees: [],
    });

    renderWithProviders(<Sidebar />, queryClient);

    // Wait for project to render
    await waitFor(() => {
      expect(screen.getByText('proj')).toBeInTheDocument();
    });

    // Click chevron to expand (clicking name opens context sidebar, not expand)
    await user.click(screen.getByTestId('project-chevron'));

    // Wait for shells to load and show (shells are fetched on render, shown on expand)
    await waitFor(() => {
      expect(screen.getByText('bash-1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no projects', async () => {
    // Mock getProjects returning empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching projects', () => {
    // Never resolve to keep in loading state
    mockFetch.mockReturnValueOnce(new Promise(() => { /* never resolves */ }));

    renderWithProviders(<Sidebar />, queryClient);

    // Look for loader - Mantine Loader creates a span with role="status"
    const loader = document.querySelector('.mantine-Loader-root');
    expect(loader).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    // Mock getProjects failure
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<Sidebar />, queryClient);

    await waitFor(() => {
      expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument();
    });
  });

  it('allows adding new shell to project', async () => {
    const user = userEvent.setup();

    const mockProject = {
      id: '1',
      name: 'proj',
      path: '/tmp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Setup mocks to handle all API endpoints ProjectItem calls
    setupMockFetch({
      projects: [mockProject],
      shells: [],
      worktrees: [],
    });

    renderWithProviders(<Sidebar />, queryClient);

    // Wait for project to render
    await waitFor(() => {
      expect(screen.getByText('proj')).toBeInTheDocument();
    });

    // Expand the project first (click chevron, not name)
    await user.click(screen.getByTestId('project-chevron'));

    // Add shell button should be visible
    const addShellButton = screen.getByTestId('add-shell-button');
    expect(addShellButton).toBeInTheDocument();
  });

  it('opens add project modal when clicking add button', async () => {
    const user = userEvent.setup();

    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('add-project-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-project-button'));

    expect(useUIStore.getState().addProjectModalOpen).toBe(true);
  });
});
