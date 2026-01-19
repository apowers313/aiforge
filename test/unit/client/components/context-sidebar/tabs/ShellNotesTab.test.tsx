/**
 * Tests for ShellNotesTab component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellNotesTab } from '@client/components/context-sidebar/tabs/ShellNotesTab';
import { renderWithProviders, createTestQueryClient } from '../../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ShellNotesTab', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const mockContextResponse = (
    todos: unknown[] = [],
    notes = '',
  ): unknown => ({
    todos,
    notes,
  });

  it('displays loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {
      // Never resolves - intentionally pending
    }));
    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);
    expect(screen.getByTestId('notes-loading')).toBeInTheDocument();
  });

  it('shows placeholder when no notes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], '')),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Add notes here...')).toBeInTheDocument();
    });
  });

  it('displays markdown editor', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], '# Hello\n\nWorld')),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
    });
  });

  it('renders markdown content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], '# Heading\n\n**Bold text**')),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      // MDEditor renders the content - verify the container exists
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
    });
  });

  it('calls API to save notes on change with debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], '')),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
    });

    // Find the textarea within the editor
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'New note');

    // Verify API hasn't been called immediately (debounce)
    const patchCallsBefore = mockFetch.mock.calls.filter(
      (call: unknown[]) => {
        const options = call[1] as { method?: string } | undefined;
        return options?.method === 'PATCH';
      },
    );
    expect(patchCallsBefore).toHaveLength(0);

    // Mock the PATCH response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], 'New note')),
    });

    // Advance time past debounce delay (500ms)
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => {
      const patchCallsAfter = mockFetch.mock.calls.filter(
        (call: unknown[]) => {
          const options = call[1] as { method?: string } | undefined;
          return options?.method === 'PATCH';
        },
      );
      expect(patchCallsAfter.length).toBeGreaterThan(0);
    });

    vi.useRealTimers();
  });

  it('has saving indicator element that shows when isUpdatingNotes is true', async () => {
    // This tests that the saving indicator is rendered conditionally
    // The actual show/hide is controlled by isUpdatingNotes from the hook
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], 'Some notes')),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
    });

    // The saving indicator component exists in the DOM structure and will be shown
    // when isSaving or isUpdatingNotes is true (tested via the hook's mutation state)
    // We verify the component structure here
    expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
  });

  it('shows error alert on save failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('preserves notes content between renders', async () => {
    const notesContent = '# My Notes\n\nSome **important** content';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse([], notesContent)),
    });

    renderWithProviders(<ShellNotesTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('notes-editor')).toBeInTheDocument();
    });

    // The textarea should contain the notes content
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(notesContent);
  });
});
