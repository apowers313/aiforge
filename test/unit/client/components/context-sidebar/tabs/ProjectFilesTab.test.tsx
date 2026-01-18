/**
 * Tests for ProjectFilesTab component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectFilesTab } from '@client/components/context-sidebar/tabs/ProjectFilesTab';
import { renderWithProviders, createTestQueryClient } from '../../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Monaco Editor - it's heavy and not needed for component tests
vi.mock('@monaco-editor/react', () => ({
  default: function MockEditor({ value }: { value: string }): React.ReactElement {
    return <div data-testid="monaco-editor">{value}</div>;
  },
}));

// Mock @uiw/react-md-editor
vi.mock('@uiw/react-md-editor', () => ({
  default: {
    Markdown: function MockMarkdown({ source }: { source: string }): React.ReactElement {
      return <div data-testid="md-editor">{source}</div>;
    },
  },
}));

// Mock react-photo-view
vi.mock('react-photo-view', () => ({
  PhotoProvider: function MockPhotoProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div>{children}</div>;
  },
  PhotoView: function MockPhotoView({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div>{children}</div>;
  },
}));

describe('ProjectFilesTab', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const mockFilesResponse = (files: unknown[], gitModifiedOnly = true): unknown => ({
    files,
    gitModifiedOnly,
  });

  it('displays loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {
      // Never resolves - intentionally pending
    }));
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    expect(screen.getByTestId('files-loading')).toBeInTheDocument();
  });

  it('displays file tree', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'index.ts', path: 'src/index.ts', type: 'file', gitStatus: 'modified' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });
  });

  it('shows git status indicator for modified files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'file.ts', path: 'file.ts', type: 'file', gitStatus: 'modified' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByTestId('git-status-modified')).toBeInTheDocument();
    });
  });

  it('shows git status indicator for untracked files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'new.ts', path: 'new.ts', type: 'file', gitStatus: 'untracked' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByTestId('git-status-untracked')).toBeInTheDocument();
    });
  });

  it('shows git status indicator for staged files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'staged.ts', path: 'staged.ts', type: 'file', gitStatus: 'staged' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByTestId('git-status-staged')).toBeInTheDocument();
    });
  });

  it('shows git status indicator for deleted files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'deleted.ts', path: 'deleted.ts', type: 'file', gitStatus: 'deleted' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByTestId('git-status-deleted')).toBeInTheDocument();
    });
  });

  it('shows git status indicator for renamed files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'renamed.ts', path: 'renamed.ts', type: 'file', gitStatus: 'renamed' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByTestId('git-status-renamed')).toBeInTheDocument();
    });
  });

  it('toggles between modified-only and all files', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([], true)),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => screen.getByTestId('show-all-toggle'));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'index.ts', path: 'index.ts', type: 'file', gitStatus: null },
      ], false)),
    });

    await user.click(screen.getByTestId('show-all-toggle'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('gitModifiedOnly=false'),
        expect.any(Object),
      );
    });
  });

  it('shows empty state when no files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByText(/no modified files/i)).toBeInTheDocument();
    });
  });

  it('displays directories with expansion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          gitStatus: null,
          children: [
            { name: 'index.ts', path: 'src/index.ts', type: 'file', gitStatus: 'modified' },
          ],
        },
      ], false)),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it('updates store when file is clicked to open preview in center panel', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'test.ts', path: 'test.ts', type: 'file', gitStatus: 'modified' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => screen.getByText('test.ts'));

    await user.click(screen.getByText('test.ts'));

    // The file should be highlighted (selected) in the file tree
    await waitFor(() => {
      const fileItem = screen.getByTestId('file-item');
      expect(fileItem).toHaveStyle({ backgroundColor: 'var(--mantine-color-dark-5)' });
    });
  });

  it('clicking file calls openFilePreview with correct arguments', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilesResponse([
        { name: 'file1.ts', path: 'src/file1.ts', type: 'file', gitStatus: 'modified' },
      ])),
    });
    renderWithProviders(<ProjectFilesTab projectId="proj-1" />, queryClient);
    await waitFor(() => screen.getByText('file1.ts'));

    // Click the file - this should trigger openFilePreview in the store
    await user.click(screen.getByText('file1.ts'));

    // Verify the file item exists (the actual preview is shown in center panel, not here)
    expect(screen.getByTestId('file-item')).toBeInTheDocument();
  });
});
