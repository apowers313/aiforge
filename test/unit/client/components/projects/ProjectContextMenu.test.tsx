import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectContextMenu } from '@client/components/projects/ProjectContextMenu';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { Project } from '@shared/types';
import type { QueryClient } from '@tanstack/react-query';

const mockProject: Project = {
  id: 'proj-1',
  name: 'test-project',
  path: '/home/user/test-project',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ProjectContextMenu', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('should render all menu items', () => {
    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
    expect(screen.getByText('Add Bash Shell')).toBeInTheDocument();
    expect(screen.getByText('Add Worktree...')).toBeInTheDocument();
    expect(screen.getByText('Delete Project')).toBeInTheDocument();
  });

  it('should show "Add Worktree..." as disabled initially', () => {
    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    const worktreeItem = screen.getByText('Add Worktree...').closest('button');
    expect(worktreeItem).toHaveAttribute('data-disabled', 'true');
  });

  it('should call onAddAiShell when clicked', async () => {
    const user = userEvent.setup();
    const onAddAiShell = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={onAddAiShell}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Add AI Shell'));
    expect(onAddAiShell).toHaveBeenCalled();
  });

  it('should call onAddBashShell when clicked', async () => {
    const user = userEvent.setup();
    const onAddBashShell = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={onAddBashShell}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Add Bash Shell'));
    expect(onAddBashShell).toHaveBeenCalled();
  });

  it('should call onDelete when Delete Project is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={onDelete}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Delete Project'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('should not call onAddWorktree when disabled', async () => {
    const user = userEvent.setup();
    const onAddWorktree = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
        onAddWorktree={onAddWorktree}
        worktreeEnabled={false}
      />,
      queryClient,
    );

    const worktreeItem = screen.getByText('Add Worktree...').closest('button');
    if (worktreeItem) {
      await user.click(worktreeItem);
    }
    expect(onAddWorktree).not.toHaveBeenCalled();
  });

  it('should call onAddWorktree when enabled and clicked', async () => {
    const user = userEvent.setup();
    const onAddWorktree = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
        onAddWorktree={onAddWorktree}
        worktreeEnabled={true}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Add Worktree...'));
    expect(onAddWorktree).toHaveBeenCalled();
  });

  it('should call onClose after menu item click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={onClose}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Add AI Shell'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should not render when opened is false', () => {
    renderWithProviders(
      <ProjectContextMenu
        project={mockProject}
        opened={false}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onAddAiShell={vi.fn()}
        onAddBashShell={vi.fn()}
        onDelete={vi.fn()}
      />,
      queryClient,
    );

    expect(screen.queryByText('Add AI Shell')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Bash Shell')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
  });

  describe('worktree status toggle', () => {
    it('should show "Hide Worktree Status" when status is visible', () => {
      renderWithProviders(
        <ProjectContextMenu
          project={mockProject}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
          onDelete={vi.fn()}
          worktreeStatusHidden={false}
          onToggleWorktreeStatus={vi.fn()}
        />,
        queryClient,
      );

      expect(screen.getByText('Hide Worktree Status')).toBeInTheDocument();
    });

    it('should show "Show Worktree Status" when status is hidden', () => {
      renderWithProviders(
        <ProjectContextMenu
          project={mockProject}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
          onDelete={vi.fn()}
          worktreeStatusHidden={true}
          onToggleWorktreeStatus={vi.fn()}
        />,
        queryClient,
      );

      expect(screen.getByText('Show Worktree Status')).toBeInTheDocument();
    });

    it('should call onToggleWorktreeStatus when clicked', async () => {
      const user = userEvent.setup();
      const onToggleWorktreeStatus = vi.fn();

      renderWithProviders(
        <ProjectContextMenu
          project={mockProject}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
          onDelete={vi.fn()}
          worktreeStatusHidden={false}
          onToggleWorktreeStatus={onToggleWorktreeStatus}
        />,
        queryClient,
      );

      await user.click(screen.getByText('Hide Worktree Status'));
      expect(onToggleWorktreeStatus).toHaveBeenCalled();
    });
  });
});
