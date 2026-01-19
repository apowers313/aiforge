import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectItem } from '@client/components/projects/ProjectItem';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { Project } from '@shared/types';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockProject: Project = {
  id: 'proj-1',
  name: 'test-project',
  path: '/home/user/test-project',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ProjectItem', () => {
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

  it('renders project name', () => {
    // Mock getShells for this project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);
    expect(screen.getByText('test-project')).toBeInTheDocument();
  });

  it('expands to show shells when chevron clicked', async () => {
    const user = userEvent.setup();

    // Mock getShells for this project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Click chevron to expand
    const chevronButton = screen.getByTestId('project-chevron');
    await user.click(chevronButton);

    // Project should be expanded in UI store
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
  });

  it('opens context sidebar when project name clicked', async () => {
    const user = userEvent.setup();

    // Mock getShells for this project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Click project name to open context sidebar
    const nameButton = screen.getByTestId('project-name');
    await user.click(nameButton);

    // Context sidebar should be open with project context
    expect(useUIStore.getState().contextSidebarOpen).toBe(true);
    expect(useUIStore.getState().selectedContextType).toBe('project');
    expect(useUIStore.getState().selectedContextId).toBe('proj-1');
  });

  describe('Click zone separation', () => {
    it('chevron click expands shells but does NOT open context sidebar', async () => {
      const user = userEvent.setup();

      // Mock getShells for this project
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      // Click chevron to expand
      const chevronButton = screen.getByTestId('project-chevron');
      await user.click(chevronButton);

      // Project should be expanded
      expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
      // But context sidebar should NOT be open
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });

    it('name click opens context sidebar but does NOT expand project', async () => {
      const user = userEvent.setup();

      // Mock getShells for this project
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      // Ensure project is initially collapsed
      expect(useUIStore.getState().expandedProjectIds).not.toContain('proj-1');

      // Click project name
      const nameButton = screen.getByTestId('project-name');
      await user.click(nameButton);

      // Context sidebar should be open
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextType).toBe('project');
      // But project should NOT be expanded
      expect(useUIStore.getState().expandedProjectIds).not.toContain('proj-1');
    });

    it('closes context sidebar when same project name clicked while open (toggle)', async () => {
      const user = userEvent.setup();

      // Mock getShells for this project
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      // First, open the context sidebar for this project
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      // Click the same project name
      const nameButton = screen.getByTestId('project-name');
      await user.click(nameButton);

      // Context sidebar should be closed
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });
  });

  // Regression test: Project deletion must call the API
  it('deletes project via API when delete is clicked', async () => {
    const user = userEvent.setup();

    // Mock getShells
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    // Pre-populate projects cache
    queryClient.setQueryData(['projects'], [mockProject]);

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Open the menu
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
    if (menuButton) {
      await user.click(menuButton);
    }

    // Mock the delete API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    // Mock refetch after delete
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    // Click delete
    const deleteButton = await screen.findByText('Delete Project');
    await user.click(deleteButton);

    // REGRESSION: Verify API was called to delete the project
    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
      const deleteCall = calls.find(
        (call) => call[0] === `/api/projects/${mockProject.id}` && call[1]?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
    });
  });

  // Regression test: Shell creation must call the API
  it('creates shell via API when add shell is clicked', async () => {
    const user = userEvent.setup();

    // Mock getShells
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Mock the create shell API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          shell: {
            id: 'shell-1',
            projectId: mockProject.id,
            name: 'bash-1',
            cwd: mockProject.path,
            status: 'active',
            pid: 1234,
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
          shells: [
            {
              id: 'shell-1',
              projectId: mockProject.id,
              name: 'bash-1',
              cwd: mockProject.path,
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    });

    // Click add shell button
    const addShellButton = screen.getByTestId('add-shell-button');
    await user.click(addShellButton);

    // REGRESSION: Verify API was called to create the shell
    await waitFor(() => {
      const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
      const createCall = calls.find(
        (call) => call[0] === `/api/projects/${mockProject.id}/shells` && call[1]?.method === 'POST',
      );
      expect(createCall).toBeDefined();
    });
  });

  it('sets created shell as active', async () => {
    const user = userEvent.setup();

    // Mock getShells
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Mock the create shell API call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          shell: {
            id: 'shell-new',
            projectId: mockProject.id,
            name: 'bash-1',
            cwd: mockProject.path,
            status: 'active',
            pid: 1234,
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
          shells: [
            {
              id: 'shell-new',
              projectId: mockProject.id,
              name: 'bash-1',
              cwd: mockProject.path,
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
    });

    // Click add shell button
    const addShellButton = screen.getByTestId('add-shell-button');
    await user.click(addShellButton);

    // Verify the shell was set as active
    await waitFor(() => {
      expect(useUIStore.getState().activeShellId).toBe('shell-new');
    });
  });

  it('shows shells when expanded', async () => {
    const mockShell = {
      id: 'shell-1',
      projectId: mockProject.id,
      name: 'bash-1',
      cwd: mockProject.path,
      status: 'active',
      pid: 1234,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Mock getShells
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [mockShell] }),
    });

    // Pre-expand the project
    useUIStore.getState().toggleProjectExpanded(mockProject.id);

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Wait for shells to load and render
    await waitFor(() => {
      expect(screen.getByText('bash-1')).toBeInTheDocument();
    });
  });
});
