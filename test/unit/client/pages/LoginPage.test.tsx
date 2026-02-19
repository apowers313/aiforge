import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '@client/pages/LoginPage.js';
import { queryKeys } from '@client/hooks/queryKeys.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: (): typeof mockNavigate => mockNavigate,
  };
});

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

let queryClient: QueryClient;

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MantineProvider>{ui}</MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    queryClient = createTestQueryClient();
    // Pre-populate auth status as unauthenticated to prevent fetch
    queryClient.setQueryData(queryKeys.auth.status, { authenticated: false });
    mockFetch.mockReset();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('renders login form', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByTestId('guid-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-button')).toBeInTheDocument();
  });

  it('submits GUID and redirects on success', async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('guid-input'), 'my-guid');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows error message on failed login', async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid GUID' } })),
    });

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('guid-input'), 'wrong');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeVisible();
    });
  });

  it('shows loading state while logging in', async () => {
    const user = userEvent.setup();

    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    mockFetch.mockReturnValueOnce(loginPromise);

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('guid-input'), 'guid');
    await user.click(screen.getByTestId('login-button'));

    expect(screen.getByTestId('login-button')).toBeDisabled();

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test needs to resolve promise
    resolveLogin!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-button')).not.toBeDisabled();
    });
  });

  it('disables login button when GUID is empty', () => {
    renderWithProviders(<LoginPage />);

    const button = screen.getByTestId('login-button');
    expect(button).toBeDisabled();
  });

  it('renders page title', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText('AIForge')).toBeInTheDocument();
    expect(screen.getByText(/Enter your access/i)).toBeInTheDocument();
  });
});
