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
  pid: 1234,
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
});
