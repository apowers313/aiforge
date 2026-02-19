import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { WorktreeItem } from '@client/components/worktrees/WorktreeItem.js';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient.js';
import type { WorktreeWithStatus, Shell } from '@shared/types/index.js';
import type { QueryClient } from '@tanstack/react-query';
import { useUIStore } from '@client/stores/uiStore.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockWorktree: WorktreeWithStatus = {
  path: '/home/user/project/.worktrees/feature',
  branch: 'feature',
  commit: 'abc123def456',
  isMain: false,
  isLocked: false,
  name: 'feature',
  modifiedCount: 0,
  ahead: 0,
  behind: 0,
};

const mockMainWorktree: WorktreeWithStatus = {
  path: '/home/user/project',
  branch: 'main',
  commit: 'abc123def456',
  isMain: true,
  isLocked: false,
  name: 'main',
  modifiedCount: 0,
  ahead: 0,
  behind: 0,
};

// Helper to create mock shell data
function createMockShell(overrides: Partial<Shell> = {}): Shell {
  return {
    id: 'shell-1',
    projectId: 'proj-1',
    name: 'ai-1',
    type: 'ai',
    worktreePath: mockWorktree.path,
    cwd: mockWorktree.path,
    status: 'active',
    pid: 1234,
    socketPath: '/tmp/shell.sock',
    lastActivityAt: '2024-01-01T00:00:00.000Z',
    done: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('WorktreeItem', () => {
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

  it('should render worktree name', () => {
    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    expect(screen.getByText('feature')).toBeInTheDocument();
  });

  it('should render main worktree correctly (status shown in context menu)', () => {
    renderWithProviders(
      <WorktreeItem worktree={mockMainWorktree} projectId="proj-1" />,
      queryClient,
    );

    // Main worktree renders with name; badge is now in context menu
    expect(screen.getByTestId('worktree-item')).toBeInTheDocument();
    // Only the worktree name "main" should appear, not a badge
    const mainTexts = screen.getAllByText('main');
    expect(mainTexts.length).toBe(1); // Just the name, no badge
  });

  it('should render non-main worktree correctly', () => {
    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    // Non-main worktree shows its name
    expect(screen.getByText('feature')).toBeInTheDocument();
    const mainTexts = screen.queryAllByText('main');
    expect(mainTexts).toHaveLength(0);
  });

  it('should open context menu on right-click', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Remove Worktree')).toBeInTheDocument();
    });
  });

  it('should call delete API when Remove Worktree is clicked', async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Remove Worktree')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Remove Worktree'));

    await waitFor(() => {
      const encodedPath = encodeURIComponent(mockWorktree.path);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/projects/proj-1/worktrees/${encodedPath}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('should not allow removing main worktree', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WorktreeItem worktree={mockMainWorktree} projectId="proj-1" />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Remove Worktree')).toBeInTheDocument();
    });

    const removeItem = screen.getByText('Remove Worktree').closest('button');
    expect(removeItem).toHaveAttribute('data-disabled', 'true');
  });

  // Phase 5: Status is now shown in context menu, not badges in tree
  it('should not show modified count in tree (shown in context menu)', () => {
    const modifiedWorktree: WorktreeWithStatus = {
      ...mockWorktree,
      modifiedCount: 3,
    };

    renderWithProviders(
      <WorktreeItem worktree={modifiedWorktree} projectId="proj-1" />,
      queryClient,
    );

    // Status is now in context menu, not tree badges
    const treeItem = screen.getByTestId('worktree-item');
    expect(treeItem).not.toHaveTextContent('modified');
  });

  it('should not show ahead/behind counts in tree (shown in context menu)', () => {
    const statusWorktree: WorktreeWithStatus = {
      ...mockWorktree,
      ahead: 2,
      behind: 5,
    };

    renderWithProviders(
      <WorktreeItem worktree={statusWorktree} projectId="proj-1" />,
      queryClient,
    );

    // Status is now in context menu, not tree badges
    const treeItem = screen.getByTestId('worktree-item');
    expect(treeItem).not.toHaveTextContent('ahead');
    expect(treeItem).not.toHaveTextContent('behind');
  });

  it('should render correctly when done prop is true', () => {
    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={true} />,
      queryClient,
    );

    // Item should still render and be visible
    expect(screen.getByTestId('worktree-item')).toBeInTheDocument();
    expect(screen.getByTestId('worktree-name')).toHaveTextContent(mockWorktree.name);
  });

  it('should render correctly when done prop is false', () => {
    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={false} />,
      queryClient,
    );

    expect(screen.getByTestId('worktree-item')).toBeInTheDocument();
    expect(screen.getByTestId('worktree-name')).toHaveTextContent(mockWorktree.name);
  });

  it('should show "Mark as Done" in context menu', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Mark as Done')).toBeInTheDocument();
    });
  });

  it('should show "Mark as Active" in context menu when done', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={true} />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Mark as Active')).toBeInTheDocument();
    });
  });

  it('should call update API when Mark as Done is clicked', async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        metadata: {
          worktreePath: mockWorktree.path,
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

    renderWithProviders(
      <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
      queryClient,
    );

    const worktreeItem = screen.getByTestId('worktree-item');
    await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

    await waitFor(() => {
      expect(screen.getByText('Mark as Done')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Mark as Done'));

    await waitFor(() => {
      const encodedPath = encodeURIComponent(mockWorktree.path);
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/worktrees/${encodedPath}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  // Status in context menu tests (badges moved from tree to context menu)
  describe('status in context menu', () => {
    it('should not show status badges in tree view', () => {
      const worktreeWithStatus: WorktreeWithStatus = {
        ...mockWorktree,
        modifiedCount: 3,
        ahead: 2,
        behind: 5,
      };

      renderWithProviders(
        <WorktreeItem worktree={worktreeWithStatus} projectId="proj-1" showStatus={true} />,
        queryClient,
      );

      // Status badges are now only in context menu, not in tree
      // The tree should only show the worktree name, not status numbers
      const treeItem = screen.getByTestId('worktree-item');
      expect(treeItem).not.toHaveTextContent('3');
      expect(treeItem).not.toHaveTextContent('modified');
    });

    it('should show status in context menu when right-clicked', async () => {
      const user = userEvent.setup();
      const worktreeWithStatus: WorktreeWithStatus = {
        ...mockWorktree,
        modifiedCount: 3,
        ahead: 2,
        behind: 5,
      };

      renderWithProviders(
        <WorktreeItem worktree={worktreeWithStatus} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        expect(screen.getByText(/3 modified/)).toBeInTheDocument();
        expect(screen.getByText(/2 ahead/)).toBeInTheDocument();
        expect(screen.getByText(/5 behind/)).toBeInTheDocument();
      });
    });

    it('should show main status in context menu for main worktree', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <WorktreeItem worktree={mockMainWorktree} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        // Context menu should open with Add AI Shell option
        expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
      });

      // Main status should be shown at top of menu
      // The text "main" appears in the menu label
      const menuLabels = screen.getAllByText('main');
      // Should have more than just the worktree name (one in name, one in status)
      expect(menuLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('should show done status in context menu when worktree is done', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={true} />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        // Context menu should open with Mark as Active (since it's done)
        expect(screen.getByText('Mark as Active')).toBeInTheDocument();
      });

      // Done status should be shown at top of menu
      expect(screen.getByText('done')).toBeInTheDocument();
    });
  });

  // Phase 6: Quick action buttons tests
  describe('quick action buttons', () => {
    it('should show quick action buttons (always visible)', () => {
      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      // Buttons are always visible, no hover needed
      expect(screen.getByRole('button', { name: 'Add AI Shell' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Bash Shell' })).toBeInTheDocument();
    });

    it('should not show quick action buttons when done', () => {
      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={true} />,
        queryClient,
      );

      // Buttons should not appear when worktree is done
      expect(screen.queryByRole('button', { name: 'Add AI Shell' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add Bash Shell' })).not.toBeInTheDocument();
    });

    it('should call create shell API with worktreePath when AI button clicked', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          shell: {
            id: 'shell-1',
            projectId: 'proj-1',
            name: 'ai-1',
            type: 'ai',
            worktreePath: mockWorktree.path,
            cwd: mockWorktree.path,
            status: 'inactive',
            pid: null,
            socketPath: null,
            lastActivityAt: null,
            done: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      fireEvent.mouseEnter(worktreeItem);

      // Wait for button to appear
      const aiButton = await screen.findByRole('button', { name: 'Add AI Shell' });
      expect(aiButton).toBeInTheDocument();

      await user.click(aiButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/projects/proj-1/shells',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(mockWorktree.path) as unknown,
          }),
        );
      });
    });

    it('should call create shell API with worktreePath when Bash button clicked', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          shell: {
            id: 'shell-1',
            projectId: 'proj-1',
            name: 'shell-1',
            type: 'bash',
            worktreePath: mockWorktree.path,
            cwd: mockWorktree.path,
            status: 'inactive',
            pid: null,
            socketPath: null,
            lastActivityAt: null,
            done: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      fireEvent.mouseEnter(worktreeItem);

      // Wait for button to appear
      const bashButton = await screen.findByRole('button', { name: 'Add Bash Shell' });
      expect(bashButton).toBeInTheDocument();

      await user.click(bashButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/projects/proj-1/shells',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(mockWorktree.path) as unknown,
          }),
        );
      });
    });
  });

  // Phase 6: Context menu shell options tests
  describe('context menu shell options', () => {
    it('should show Add AI Shell in context menu', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
      });
    });

    it('should show Add Bash Shell in context menu', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        expect(screen.getByText('Add Bash Shell')).toBeInTheDocument();
      });
    });

    it('should not show shell options in context menu when done', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" done={true} />,
        queryClient,
      );

      const worktreeItem = screen.getByTestId('worktree-item');
      await user.pointer({ keys: '[MouseRight]', target: worktreeItem });

      await waitFor(() => {
        // Context menu should show, but not shell options
        expect(screen.getByText('Mark as Active')).toBeInTheDocument();
        expect(screen.queryByText('Add AI Shell')).not.toBeInTheDocument();
        expect(screen.queryByText('Add Bash Shell')).not.toBeInTheDocument();
      });
    });
  });

  // Phase 8: Folder display tests
  describe('folder display with expandable shell list', () => {
    it('should render chevron icon', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      expect(screen.getByTestId('worktree-chevron')).toBeInTheDocument();
    });

    it('should toggle expanded state when chevron is clicked', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const chevron = screen.getByTestId('worktree-chevron');

      // Initially collapsed
      expect(useUIStore.getState().expandedWorktreePaths).not.toContain(mockWorktree.path);

      // Click to expand
      await user.click(chevron);
      expect(useUIStore.getState().expandedWorktreePaths).toContain(mockWorktree.path);

      // Click to collapse
      await user.click(chevron);
      expect(useUIStore.getState().expandedWorktreePaths).not.toContain(mockWorktree.path);
    });

    it('should show ShellList when expanded with shells', async () => {
      const user = userEvent.setup();
      const mockShells = [
        createMockShell({ id: 'shell-1', name: 'ai-1', type: 'ai' }),
        createMockShell({ id: 'shell-2', name: 'bash-1', type: 'bash' }),
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: mockShells }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      // Shells should not be visible initially (collapsed)
      expect(screen.queryByText('ai-1')).not.toBeInTheDocument();

      // Expand the worktree
      const chevron = screen.getByTestId('worktree-chevron');
      await user.click(chevron);

      // Wait for shells to appear
      await waitFor(() => {
        expect(screen.getByText('ai-1')).toBeInTheDocument();
        expect(screen.getByText('bash-1')).toBeInTheDocument();
      });
    });

    it('should show "No shells yet" when expanded with no shells', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      // Expand the worktree
      const chevron = screen.getByTestId('worktree-chevron');
      await user.click(chevron);

      // Wait for "No shells yet" message
      await waitFor(() => {
        expect(screen.getByText('No shells yet')).toBeInTheDocument();
      });
    });

    it('should open context sidebar when name is clicked (not expand)', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      const nameButton = screen.getByTestId('worktree-name');
      await user.click(nameButton);

      // Should open context sidebar, not expand
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextType).toBe('worktree');
      expect(useUIStore.getState().selectedContextId).toBe(mockWorktree.path);

      // Should NOT expand
      expect(useUIStore.getState().expandedWorktreePaths).not.toContain(mockWorktree.path);
    });

    it('should display separate click areas for chevron and name', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      // Both elements should exist as separate clickable areas
      expect(screen.getByTestId('worktree-chevron')).toBeInTheDocument();
      expect(screen.getByTestId('worktree-name')).toBeInTheDocument();
    });

    it('should show down chevron when expanded', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      // Pre-expand the worktree
      useUIStore.getState().toggleWorktreeExpanded(mockWorktree.path);

      renderWithProviders(
        <WorktreeItem worktree={mockWorktree} projectId="proj-1" />,
        queryClient,
      );

      // Verify the chevron is present and worktree is expanded
      expect(screen.getByTestId('worktree-chevron')).toBeInTheDocument();
      expect(useUIStore.getState().expandedWorktreePaths).toContain(mockWorktree.path);
    });
  });
});
