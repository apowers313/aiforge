import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorktreeContextMenu } from '@client/components/worktrees/WorktreeContextMenu';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { WorktreeWithStatus } from '@shared/types';
import type { QueryClient } from '@tanstack/react-query';

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

describe('WorktreeContextMenu', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('should show Remove Worktree option', () => {
    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockWorktree}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onRemove={vi.fn()}
      />,
      queryClient,
    );

    expect(screen.getByText('Remove Worktree')).toBeInTheDocument();
  });

  it('should call onRemove when Remove Worktree is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockWorktree}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onRemove={onRemove}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Remove Worktree'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('should disable Remove Worktree for main worktree', () => {
    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockMainWorktree}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onRemove={vi.fn()}
      />,
      queryClient,
    );

    const removeItem = screen.getByText('Remove Worktree').closest('button');
    expect(removeItem).toHaveAttribute('data-disabled', 'true');
  });

  it('should not call onRemove when main worktree remove is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockMainWorktree}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onRemove={onRemove}
      />,
      queryClient,
    );

    const removeItem = screen.getByText('Remove Worktree').closest('button');
    if (removeItem) {
      await user.click(removeItem);
    }
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('should call onClose after Remove Worktree click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockWorktree}
        opened={true}
        position={{ x: 100, y: 100 }}
        onClose={onClose}
        onRemove={vi.fn()}
      />,
      queryClient,
    );

    await user.click(screen.getByText('Remove Worktree'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should not render when opened is false', () => {
    renderWithProviders(
      <WorktreeContextMenu
        worktree={mockWorktree}
        opened={false}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
        onRemove={vi.fn()}
      />,
      queryClient,
    );

    expect(screen.queryByText('Remove Worktree')).not.toBeInTheDocument();
  });

  // Phase 6: Shell creation options tests
  describe('shell creation options', () => {
    it('should show Add AI Shell option', () => {
      renderWithProviders(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={vi.fn()}
          onRemove={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
        />,
        queryClient,
      );

      expect(screen.getByText('Add AI Shell')).toBeInTheDocument();
    });

    it('should show Add Bash Shell option', () => {
      renderWithProviders(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={vi.fn()}
          onRemove={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
        />,
        queryClient,
      );

      expect(screen.getByText('Add Bash Shell')).toBeInTheDocument();
    });

    it('should call onAddAiShell when Add AI Shell is clicked', async () => {
      const user = userEvent.setup();
      const onAddAiShell = vi.fn();
      const onClose = vi.fn();

      renderWithProviders(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={onClose}
          onRemove={vi.fn()}
          onAddAiShell={onAddAiShell}
          onAddBashShell={vi.fn()}
        />,
        queryClient,
      );

      await user.click(screen.getByText('Add AI Shell'));
      expect(onAddAiShell).toHaveBeenCalled();
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should call onAddBashShell when Add Bash Shell is clicked', async () => {
      const user = userEvent.setup();
      const onAddBashShell = vi.fn();
      const onClose = vi.fn();

      renderWithProviders(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          position={{ x: 100, y: 100 }}
          onClose={onClose}
          onRemove={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={onAddBashShell}
        />,
        queryClient,
      );

      await user.click(screen.getByText('Add Bash Shell'));
      expect(onAddBashShell).toHaveBeenCalled();
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should not show shell options when done', () => {
      renderWithProviders(
        <WorktreeContextMenu
          worktree={mockWorktree}
          opened={true}
          position={{ x: 100, y: 100 }}
          done={true}
          onClose={vi.fn()}
          onRemove={vi.fn()}
          onAddAiShell={vi.fn()}
          onAddBashShell={vi.fn()}
        />,
        queryClient,
      );

      expect(screen.queryByText('Add AI Shell')).not.toBeInTheDocument();
      expect(screen.queryByText('Add Bash Shell')).not.toBeInTheDocument();
      expect(screen.getByText('Mark as Active')).toBeInTheDocument();
    });
  });
});
