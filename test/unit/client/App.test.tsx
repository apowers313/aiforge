import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { App } from '@client/App.js';
import { useUIStore } from '@client/stores/uiStore.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useAuthStatus hook
let mockAuthData: { authenticated: boolean } | undefined;
let mockAuthIsLoading = false;

vi.mock('@client/hooks/useAuth', () => ({
  useAuthStatus: vi.fn(() => ({
    data: mockAuthData,
    isLoading: mockAuthIsLoading,
  })),
  useLogin: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
  useLogout: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

function renderApp(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
    mockFetch.mockReset();
    mockAuthData = undefined;
    mockAuthIsLoading = false;

    // Reset URL to root for each test
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state while checking auth', () => {
    mockAuthIsLoading = true;
    mockAuthData = undefined;

    renderApp();

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    mockAuthIsLoading = false;
    mockAuthData = { authenticated: false };

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('guid-input')).toBeInTheDocument();
    });
  });

  it('renders main app when authenticated', async () => {
    mockAuthIsLoading = false;
    mockAuthData = { authenticated: true };

    // Projects fetch from useProjects hook
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('AIForge')).toBeInTheDocument();
    });
  });

  it('renders login page at /login route', () => {
    window.history.pushState({}, '', '/login');

    renderApp();

    expect(screen.getByTestId('guid-input')).toBeInTheDocument();
  });
});
