/**
 * Tests for ProjectUrlsTab component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectUrlsTab } from '@client/components/context-sidebar/tabs/ProjectUrlsTab.js';
import { renderWithProviders, createTestQueryClient } from '../../../../../utils/testQueryClient.js';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ProjectUrlsTab', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const mockMetadataResponse = (overrides = {}): unknown => ({
    gitRemoteUrl: null,
    gitRemoteType: null,
    hasPackageJson: false,
    packageName: null,
    hasGithubWorkflows: false,
    ...overrides,
  });

  const mockUrlsResponse = (urls: unknown[] = []): unknown => ({
    urls,
  });

  it('displays loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {
      // Never resolves - intentionally pending
    }));
    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);
    expect(screen.getByTestId('urls-loading')).toBeInTheDocument();
  });

  it('displays auto-detected GitHub URL', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse({
            gitRemoteUrl: 'https://github.com/user/repo',
            gitRemoteType: 'github',
          })),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
  });

  it('displays GitHub Actions link when workflows exist', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse({
            gitRemoteUrl: 'https://github.com/user/repo',
            gitRemoteType: 'github',
            hasGithubWorkflows: true,
          })),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('displays NPM link when package.json exists', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse({
            hasPackageJson: true,
            packageName: 'my-package',
          })),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('NPM')).toBeInTheDocument();
    });
  });

  it('shows add URL button', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse()),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('add-url-button')).toBeInTheDocument();
    });
  });

  it('displays custom URLs from server', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse()),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse([
          { id: '1', name: 'Docs', url: 'https://docs.example.com', createdAt: new Date().toISOString() },
          { id: '2', name: 'API', url: 'https://api.example.com', createdAt: new Date().toISOString() },
        ])),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('Docs')).toBeInTheDocument();
      expect(screen.getByText('API')).toBeInTheDocument();
    });
  });

  it('opens modal when add URL button clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse()),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => screen.getByTestId('add-url-button'));
    await user.click(screen.getByTestId('add-url-button'));

    expect(screen.getByTestId('add-url-modal')).toBeInTheDocument();
  });

  it('shows empty state when no URLs', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetadataResponse()),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUrlsResponse()),
      });
    });

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText(/no urls/i)).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ProjectUrlsTab projectId="proj-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
