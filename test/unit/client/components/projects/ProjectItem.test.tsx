import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectItem } from '@client/components/projects/ProjectItem.js';
import { useUIStore } from '@client/stores/uiStore.js';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient.js';
import type { Project } from '@shared/types/index.js';
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

/**
 * Setup mock fetch to handle all API calls for ProjectItem
 * This is needed because ProjectItem now calls multiple APIs:
 * - GET /api/projects/:id/shells
 * - GET /api/projects/:id/worktrees
 * - GET /api/projects/:id/worktrees/main (for AddWorktreeModal)
 */
function setupMockFetch(options: {
  shells?: unknown[];
  worktrees?: unknown[];
  mainBranch?: string;
} = {}): void {
  const { shells = [], worktrees = [], mainBranch = 'main' } = options;

  mockFetch.mockImplementation((url: string) => {
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
    setupMockFetch();

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);
    expect(screen.getByText('test-project')).toBeInTheDocument();
  });

  it('expands to show shells when chevron clicked', async () => {
    const user = userEvent.setup();
    setupMockFetch();

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Click chevron to expand
    const chevronButton = screen.getByTestId('project-chevron');
    await user.click(chevronButton);

    // Project should be expanded in UI store
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
  });

  it('opens context sidebar when project name clicked', async () => {
    const user = userEvent.setup();
    setupMockFetch();

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Click project name to open context sidebar
    const nameButton = screen.getByTestId('project-name');
    await user.click(nameButton);

    // Context sidebar should be open with project context
    expect(useUIStore.getState().contextSidebarOpen).toBe(true);
    expect(useUIStore.getState().selectedContextType).toBe('project');
    expect(useUIStore.getState().selectedContextId).toBe('proj-1');
  });

  describe('Context menu', () => {
    it('should not render "..." menu button', () => {
      setupMockFetch();

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      // The "..." menu button should not exist
      expect(screen.queryByTestId('project-menu')).not.toBeInTheDocument();
    });

    it('should open context menu on right-click', async () => {
      const user = userEvent.setup();
      setupMockFetch();

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      const projectItem = screen.getByTestId('project-item');
      await user.pointer({ keys: '[MouseRight]', target: projectItem });

      expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
      expect(screen.getByText('Add Bash Shell')).toBeInTheDocument();
      expect(screen.getByText('Add Worktree...')).toBeInTheDocument();
      expect(screen.getByText('Delete Project')).toBeInTheDocument();
    });

    it('should show "Add Worktree..." as disabled', async () => {
      const user = userEvent.setup();
      // Empty worktrees = not a git project, so Add Worktree should be disabled
      setupMockFetch({ worktrees: [] });

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      const projectItem = screen.getByTestId('project-item');
      await user.pointer({ keys: '[MouseRight]', target: projectItem });

      const worktreeItem = screen.getByText('Add Worktree...').closest('button');
      expect(worktreeItem).toHaveAttribute('data-disabled', 'true');
    });

    it('should create AI shell from context menu', async () => {
      const user = userEvent.setup();
      setupMockFetch();

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      const projectItem = screen.getByTestId('project-item');
      await user.pointer({ keys: '[MouseRight]', target: projectItem });

      // Mock the create shell API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            shell: {
              id: 'shell-1',
              projectId: mockProject.id,
              name: 'ai-1',
              type: 'ai',
              cwd: mockProject.path,
              status: 'active',
              pid: 1234,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
      });

      await user.click(screen.getByText('Add AI Shell'));

      // Verify API was called
      await waitFor(() => {
        const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
        const createCall = calls.find(
          (call) => call[0] === `/api/projects/${mockProject.id}/shells` && call[1]?.method === 'POST',
        );
        expect(createCall).toBeDefined();
        if (createCall?.[1]?.body) {
          const body = JSON.parse(createCall[1].body as string) as { type: string };
          expect(body.type).toBe('ai');
        }
      });
    });

    it('should create Bash shell from context menu', async () => {
      const user = userEvent.setup();
      setupMockFetch();

      renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

      const projectItem = screen.getByTestId('project-item');
      await user.pointer({ keys: '[MouseRight]', target: projectItem });

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
              type: 'bash',
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
        json: () => Promise.resolve({ shells: [] }),
      });

      await user.click(screen.getByText('Add Bash Shell'));

      // Verify API was called
      await waitFor(() => {
        const calls = mockFetch.mock.calls as [string, RequestInit | undefined][];
        const createCall = calls.find(
          (call) => call[0] === `/api/projects/${mockProject.id}/shells` && call[1]?.method === 'POST',
        );
        expect(createCall).toBeDefined();
        if (createCall?.[1]?.body) {
          const body = JSON.parse(createCall[1].body as string) as { type: string };
          expect(body.type).toBe('bash');
        }
      });
    });
  });

  describe('Click zone separation', () => {
    it('chevron click expands shells but does NOT open context sidebar', async () => {
      const user = userEvent.setup();
      setupMockFetch();

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
      setupMockFetch();

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
      setupMockFetch();

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
  it('deletes project via API when delete is clicked from context menu', async () => {
    const user = userEvent.setup();
    setupMockFetch();

    // Pre-populate projects cache
    queryClient.setQueryData(['projects'], [mockProject]);

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Right-click to open context menu
    const projectItem = screen.getByTestId('project-item');
    await user.pointer({ keys: '[MouseRight]', target: projectItem });

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

    // Click add shell button (always visible, no hover needed)
    const addShellButton = await screen.findByTestId('add-shell-button');
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
    setupMockFetch();

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

    // Click add shell button (always visible, no hover needed)
    const addShellButton = await screen.findByTestId('add-shell-button');
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

    // Setup mock with the shell data
    setupMockFetch({ shells: [mockShell] });

    // Pre-expand the project
    useUIStore.getState().toggleProjectExpanded(mockProject.id);

    renderWithProviders(<ProjectItem project={mockProject} />, queryClient);

    // Wait for shells to load and render
    await waitFor(() => {
      expect(screen.getByText('bash-1')).toBeInTheDocument();
    });
  });
});
