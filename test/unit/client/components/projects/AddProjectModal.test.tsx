import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { AddProjectModal } from '@client/components/projects/AddProjectModal.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

describe('AddProjectModal with API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches directory listing from API', async () => {
    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [{ name: 'projects', path: '/home/testuser/projects', isDirectory: true }],
      }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('projects')).toBeInTheDocument();
    });
  });

  it('navigates directories via API', async () => {
    const user = userEvent.setup();

    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory for /home/testuser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [{ name: 'Documents', path: '/home/testuser/Documents', isDirectory: true }],
      }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await waitFor(() => screen.getByText('Documents'));

    // Third call: browseDirectory for /home/testuser/Documents
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser/Documents',
        parent: '/home/testuser',
        entries: [{ name: 'projects', path: '/home/testuser/Documents/projects', isDirectory: true }],
      }),
    });

    await user.click(screen.getByText('Documents'));

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home/testuser/Documents');
    });
  });

  it('calls onSelect with path when directory is selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [],
      }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={onSelect} />,
    );

    await waitFor(() => screen.getByTestId('select-directory-button'));
    await user.click(screen.getByTestId('select-directory-button'));

    expect(onSelect).toHaveBeenCalledWith('/home/testuser');
  });

  it('shows loading state while fetching', async () => {
    let resolveHomePromise: (value: unknown) => void;
    const pendingHomePromise = new Promise((resolve) => {
      resolveHomePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(pendingHomePromise);

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    // Should show loading
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();

    // Resolve getHomeDirectory
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test needs to resolve promise
    resolveHomePromise!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });

    // Mock the browseDirectory call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser', parent: '/home', entries: [] }),
    });

    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    // Mock getHomeDirectory failing
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
  });

  it('navigates to parent directory using breadcrumb', async () => {
    const user = userEvent.setup();

    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory for /home/testuser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [{ name: 'Documents', path: '/home/testuser/Documents', isDirectory: true }],
      }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await waitFor(() => screen.getByText('Documents'));

    // Navigate into Documents
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser/Documents',
        parent: '/home/testuser',
        entries: [],
      }),
    });

    await user.click(screen.getByText('Documents'));

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home/testuser/Documents');
    });

    // Navigate back using breadcrumb (testuser is the home breadcrumb now)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [{ name: 'Documents', path: '/home/testuser/Documents', isDirectory: true }],
      }),
    });

    await user.click(screen.getByTestId('breadcrumb-home'));

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home/testuser');
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser', parent: '/home', entries: [] }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={onClose} onSelect={vi.fn()} />,
    );

    await waitFor(() => screen.getByTestId('cancel-button'));
    await user.click(screen.getByTestId('cancel-button'));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not reset path while modal is still open after selecting directory', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory for /home/testuser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser',
        parent: '/home',
        entries: [{ name: 'myproject', path: '/home/testuser/myproject', isDirectory: true }],
      }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={onSelect} />,
    );

    // Navigate into myproject
    await waitFor(() => screen.getByText('myproject'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        path: '/home/testuser/myproject',
        parent: '/home/testuser',
        entries: [],
      }),
    });
    await user.click(screen.getByText('myproject'));
    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/home/testuser/myproject');
    });

    // Click "Select This Directory" - the modal is still open (onSelect is async in real usage)
    await user.click(screen.getByTestId('select-directory-button'));
    expect(onSelect).toHaveBeenCalledWith('/home/testuser/myproject');

    // The path should NOT have been reset while the modal is still open
    // This is a regression test for the double-dialog bug where handleSelect()
    // would reset state before the modal closed, causing a flash of empty state
    expect(screen.getByTestId('current-path')).toHaveTextContent('/home/testuser/myproject');
  });

  it('does not render when closed', () => {
    renderWithProviders(
      <AddProjectModal opened={false} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.queryByTestId('directory-browser')).not.toBeInTheDocument();
  });

  it('shows empty state when no directories', async () => {
    // First call: getHomeDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser' }),
    });
    // Second call: browseDirectory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: '/home/testuser', parent: '/home', entries: [] }),
    });

    renderWithProviders(
      <AddProjectModal opened={true} onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No subdirectories')).toBeInTheDocument();
    });
  });
});
