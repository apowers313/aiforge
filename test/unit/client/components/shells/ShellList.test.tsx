import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellList } from '@client/components/shells/ShellList';
import { ShellItem } from '@client/components/shells/ShellItem';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { Shell } from '@shared/types';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockShell: Shell = {
  id: 'shell-1',
  projectId: 'proj-1',
  name: 'bash-1',
  cwd: '/home/user',
  status: 'active',
  type: 'bash',
  pid: 1234,
  lastActivityAt: null,
  done: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAiShell: Shell = {
  id: 'ai-shell-1',
  projectId: 'proj-1',
  name: 'ai-1',
  cwd: '/home/user',
  status: 'active',
  type: 'ai',
  pid: 5678,
  lastActivityAt: null,
  done: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ShellList', () => {
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

  it('renders empty message when no shells', () => {
    renderWithProviders(<ShellList shells={[]} projectId="proj-1" />, queryClient);
    expect(screen.getByText('No shells yet')).toBeInTheDocument();
  });

  it('renders shell items', () => {
    renderWithProviders(<ShellList shells={[mockShell]} projectId="proj-1" />, queryClient);
    expect(screen.getByText('bash-1')).toBeInTheDocument();
  });

  it('renders multiple shells', () => {
    const shells: Shell[] = [mockShell, { ...mockShell, id: 'shell-2', name: 'zsh-1' }];
    renderWithProviders(<ShellList shells={shells} projectId="proj-1" />, queryClient);
    expect(screen.getByText('bash-1')).toBeInTheDocument();
    expect(screen.getByText('zsh-1')).toBeInTheDocument();
  });

  it('sorts AI shells to the top of the list', () => {
    // Create shells with bash shell created first, AI shell created later
    const bashShell = { ...mockShell, createdAt: '2024-01-01T00:00:00Z' };
    const aiShell = { ...mockAiShell, createdAt: '2024-01-02T00:00:00Z' };
    const shells: Shell[] = [bashShell, aiShell];

    const { container } = renderWithProviders(
      <ShellList shells={shells} projectId="proj-1" />,
      queryClient,
    );

    // Get all shell items in order
    const shellItems = container.querySelectorAll('[data-testid="shell-item"]');
    expect(shellItems).toHaveLength(2);

    // AI shell should be first even though bash shell was created first
    expect(shellItems[0]?.textContent).toContain('ai-1');
    expect(shellItems[1]?.textContent).toContain('bash-1');
  });
});

describe('ShellItem', () => {
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

  it('renders shell name', () => {
    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);
    expect(screen.getByText('bash-1')).toBeInTheDocument();
  });

  it('shows active status indicator', () => {
    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('shows inactive status for inactive shell', () => {
    const inactiveShell = { ...mockShell, status: 'inactive' as const };
    renderWithProviders(<ShellItem shell={inactiveShell} projectId="proj-1" />, queryClient);
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  it('can close shell via menu', async () => {
    const user = userEvent.setup();

    // Pre-populate cache with the shell
    queryClient.setQueryData(['shells', 'proj-1'], [mockShell]);

    // Mock delete response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    // Mock refetch after mutation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [] }),
    });

    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);

    // Find the menu button by its aria attributes
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
    expect(menuButton).toBeDefined();
    if (menuButton) {
      await user.click(menuButton);
    }

    // Click close - wait for menu to render in portal
    const closeButton = await screen.findByText('Close Shell');
    await user.click(closeButton);

    // Wait for API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('can rename shell via menu', async () => {
    const user = userEvent.setup();

    // Mock update response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          shell: { ...mockShell, name: 'new-name' },
        }),
    });

    // Mock refetch after mutation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [{ ...mockShell, name: 'new-name' }] }),
    });

    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);

    // Open menu
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
    if (menuButton) {
      await user.click(menuButton);
    }

    // Click rename
    const renameButton = await screen.findByText('Rename');
    await user.click(renameButton);

    // Modal should open - wait for it to appear
    await waitFor(() => {
      expect(screen.getByText('Rename Shell')).toBeInTheDocument();
    });

    // Clear and type new name
    const input = screen.getByPlaceholderText('Enter shell name');
    await user.clear(input);
    await user.type(input, 'new-name');

    // Submit
    const submitButton = screen.getByRole('button', { name: 'Rename' });
    await user.click(submitButton);

    // Verify API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'new-name' }),
        }),
      );
    });
  });

  it('can restart shell via menu', async () => {
    const user = userEvent.setup();

    // Mock restart response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          shell: { ...mockShell, pid: 9999 },
        }),
    });

    // Mock refetch after mutation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ shells: [mockShell] }),
    });

    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);

    // Open menu
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
    if (menuButton) {
      await user.click(menuButton);
    }

    // Click restart
    const restartButton = await screen.findByText('Restart');
    await user.click(restartButton);

    // Verify API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1/restart',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('sets shell as active when clicked', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);

    // Click the shell item (the button containing the shell name)
    const shellButton = screen.getByText('bash-1').closest('button');
    if (shellButton) {
      await user.click(shellButton);
    }

    expect(useUIStore.getState().activeShellId).toBe('shell-1');
  });

  it('shows active state when shell is selected', () => {
    useUIStore.getState().setActiveShell('shell-1');

    const { container } = renderWithProviders(
      <ShellItem shell={mockShell} projectId="proj-1" />,
      queryClient,
    );

    // Check the button has the active background color
    const button = container.querySelector('.shell-item');
    expect(button).toHaveStyle({ backgroundColor: 'var(--mantine-color-dark-5)' });
  });

  describe('AI Shell Activity Indicator', () => {
    it('shows activity indicator for AI shells', () => {
      const { container } = renderWithProviders(
        <ShellItem shell={mockAiShell} projectId="proj-1" />,
        queryClient,
      );

      const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
      expect(activityIndicator).toBeInTheDocument();
    });

    it('does not show activity indicator for bash shells', () => {
      const { container } = renderWithProviders(
        <ShellItem shell={mockShell} projectId="proj-1" />,
        queryClient,
      );

      const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
      expect(activityIndicator).not.toBeInTheDocument();
    });

    it('shows red indicator when AI shell has no recent activity', () => {
      const { container } = renderWithProviders(
        <ShellItem shell={mockAiShell} projectId="proj-1" />,
        queryClient,
      );

      const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
      expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-red-6)' });
    });

    it('shows green indicator when AI shell has recent activity via client-side tracking', async () => {
      // Record activity for the AI shell
      useUIStore.getState().recordShellActivity(mockAiShell.id);

      const { container } = renderWithProviders(
        <ShellItem shell={mockAiShell} projectId="proj-1" />,
        queryClient,
      );

      // Wait for the effect to update state
      await waitFor(() => {
        const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
        expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-green-6)' });
      });
    });

    it('shows green indicator when AI shell has recent server-side lastActivityAt', async () => {
      // Create AI shell with recent lastActivityAt from server
      const recentlyActiveAiShell: Shell = {
        ...mockAiShell,
        lastActivityAt: new Date().toISOString(), // Just now
      };

      const { container } = renderWithProviders(
        <ShellItem shell={recentlyActiveAiShell} projectId="proj-1" />,
        queryClient,
      );

      // Wait for the effect to update state
      await waitFor(() => {
        const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
        expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-green-6)' });
      });
    });

    it('indicator turns red after activity timeout', async () => {
      // Record activity for the AI shell
      useUIStore.getState().recordShellActivity(mockAiShell.id);

      const { container } = renderWithProviders(
        // Use a very short timeout for testing
        <ShellItem shell={mockAiShell} projectId="proj-1" aiIdleTimeoutMs={100} />,
        queryClient,
      );

      // Initially should be green
      await waitFor(() => {
        const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
        expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-green-6)' });
      });

      // Wait for timeout to expire (100ms + buffer for interval check)
      await new Promise((resolve) => { setTimeout(resolve, 200); });

      // Should now be red
      await waitFor(() => {
        const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
        expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-red-6)' });
      });
    });

    it('shows blue indicator when AI shell is marked as done', () => {
      const doneAiShell: Shell = {
        ...mockAiShell,
        done: true,
      };

      const { container } = renderWithProviders(
        <ShellItem shell={doneAiShell} projectId="proj-1" />,
        queryClient,
      );

      const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
      expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-blue-6)' });
    });

    it('shows blue indicator for done AI shell even when it has recent activity', async () => {
      const doneAiShell: Shell = {
        ...mockAiShell,
        done: true,
      };

      // Record activity for the AI shell
      useUIStore.getState().recordShellActivity(doneAiShell.id);

      const { container } = renderWithProviders(
        <ShellItem shell={doneAiShell} projectId="proj-1" />,
        queryClient,
      );

      // Should still be blue because shell is done
      await waitFor(() => {
        const activityIndicator = container.querySelector('[data-testid="ai-activity-indicator"]');
        expect(activityIndicator).toHaveStyle({ backgroundColor: 'var(--mantine-color-blue-6)' });
      });
    });
  });

  describe('Mark as Done', () => {
    it('shows "Mark as Done" menu item for AI shells', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ShellItem shell={mockAiShell} projectId="proj-1" />, queryClient);

      // Open menu
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
      if (menuButton) {
        await user.click(menuButton);
      }

      // Should show "Mark as Done" for undone AI shell
      const markAsDoneButton = await screen.findByText('Mark as Done');
      expect(markAsDoneButton).toBeInTheDocument();
    });

    it('shows "Mark as Active" menu item for done AI shells', async () => {
      const user = userEvent.setup();
      const doneAiShell: Shell = {
        ...mockAiShell,
        done: true,
      };

      renderWithProviders(<ShellItem shell={doneAiShell} projectId="proj-1" />, queryClient);

      // Open menu
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
      if (menuButton) {
        await user.click(menuButton);
      }

      // Should show "Mark as Active" for done AI shell
      const markAsActiveButton = await screen.findByText('Mark as Active');
      expect(markAsActiveButton).toBeInTheDocument();
    });

    it('does not show "Mark as Done" menu item for bash shells', async () => {
      const user = userEvent.setup();

      renderWithProviders(<ShellItem shell={mockShell} projectId="proj-1" />, queryClient);

      // Open menu
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
      if (menuButton) {
        await user.click(menuButton);
      }

      // Wait for menu to open
      await screen.findByText('Rename');

      // Should NOT have mark as done option
      expect(screen.queryByText('Mark as Done')).not.toBeInTheDocument();
      expect(screen.queryByText('Mark as Active')).not.toBeInTheDocument();
    });

    it('can mark AI shell as done via menu', async () => {
      const user = userEvent.setup();

      // Mock update response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shell: { ...mockAiShell, done: true },
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [{ ...mockAiShell, done: true }] }),
      });

      renderWithProviders(<ShellItem shell={mockAiShell} projectId="proj-1" />, queryClient);

      // Open menu
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
      if (menuButton) {
        await user.click(menuButton);
      }

      // Click "Mark as Done"
      const markAsDoneButton = await screen.findByText('Mark as Done');
      await user.click(markAsDoneButton);

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/shells/ai-shell-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ done: true }),
          }),
        );
      });
    });

    it('can mark done AI shell as active via menu', async () => {
      const user = userEvent.setup();
      const doneAiShell: Shell = {
        ...mockAiShell,
        done: true,
      };

      // Mock update response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            shell: { ...mockAiShell, done: false },
          }),
      });

      // Mock refetch after mutation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [{ ...mockAiShell, done: false }] }),
      });

      renderWithProviders(<ShellItem shell={doneAiShell} projectId="proj-1" />, queryClient);

      // Open menu
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons.find((btn) => btn.getAttribute('aria-haspopup') === 'menu');
      if (menuButton) {
        await user.click(menuButton);
      }

      // Click "Mark as Active"
      const markAsActiveButton = await screen.findByText('Mark as Active');
      await user.click(markAsActiveButton);

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/shells/ai-shell-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ done: false }),
          }),
        );
      });
    });
  });
});
