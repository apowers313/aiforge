import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@client/components/layout/Sidebar';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [mockProject] }),
    });

    // Mock getShells for this project (called immediately when ProjectItem renders)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [mockShell] }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    // Wait for project to render
    await waitFor(() => {
      expect(screen.getByText('proj')).toBeInTheDocument();
    });

    // Click to expand
    await user.click(screen.getByText('proj'));

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

    // Mock getProjects
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [mockProject] }),
    });

    // Mock getShells (called immediately when ProjectItem renders)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<Sidebar />, queryClient);

    // Wait for project to render
    await waitFor(() => {
      expect(screen.getByText('proj')).toBeInTheDocument();
    });

    // Expand the project first
    await user.click(screen.getByText('proj'));

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
