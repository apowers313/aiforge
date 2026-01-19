/**
 * Tests for ShellTodosTab component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellTodosTab } from '@client/components/context-sidebar/tabs/ShellTodosTab';
import { renderWithProviders, createTestQueryClient } from '../../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ShellTodosTab', () => {
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
    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);
    expect(screen.getByTestId('todos-loading')).toBeInTheDocument();
  });

  it('displays empty state with add button when no todos', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse()),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('add-todo-button')).toBeInTheDocument();
      expect(screen.getByText(/no todos/i)).toBeInTheDocument();
    });
  });

  it('displays todos from server', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
            {
              id: '2',
              text: 'Another task',
              completed: true,
              order: 1,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('Test task')).toBeInTheDocument();
      expect(screen.getByText('Another task')).toBeInTheDocument();
    });
  });

  it('shows completed todos with strikethrough', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Done task',
              completed: true,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      const todoItem = screen.getByTestId('todo-item-1');
      const label = within(todoItem).getByText('Done task');
      expect(label).toHaveStyle({ textDecoration: 'line-through' });
    });
  });

  it('calls API when checkbox clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => screen.getByRole('checkbox'));

    // Mock the toggle response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: '1',
          text: 'Test task',
          completed: true,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }),
    });

    // Mock refetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: true,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ]),
        ),
    });

    await user.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos/1'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  it('shows add todo input when add button clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse()),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => screen.getByTestId('add-todo-button'));
    await user.click(screen.getByTestId('add-todo-button'));

    expect(screen.getByTestId('todo-input')).toBeInTheDocument();
  });

  it('adds todo when form submitted', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockContextResponse()),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => screen.getByTestId('add-todo-button'));
    await user.click(screen.getByTestId('add-todo-button'));

    const input = screen.getByTestId('todo-input');
    await user.type(input, 'New task');

    // Mock add response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: '1',
          text: 'New task',
          completed: false,
          order: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
        }),
    });

    // Mock refetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'New task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    await user.click(screen.getByTestId('submit-todo'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'New task' }),
        }),
      );
    });
  });

  it('shows menu button on todo items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      const todoItem = screen.getByTestId('todo-item-1');
      expect(within(todoItem).getByTestId('todo-menu-button')).toBeInTheDocument();
    });
  });

  it('calls API when delete menu item clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => screen.getByTestId('todo-item-1'));

    const todoItem = screen.getByTestId('todo-item-1');
    const menuButton = within(todoItem).getByTestId('todo-menu-button');

    // Open the menu
    await user.click(menuButton);

    // Wait for menu to open
    await waitFor(() => {
      expect(screen.getByTestId('delete-todo-menu-item')).toBeInTheDocument();
    });

    // Mock delete response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    // Mock refetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockContextResponse()),
    });

    // Click the delete menu item
    await user.click(screen.getByTestId('delete-todo-menu-item'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1/todos/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('shows error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      // Look for the Alert component by role
      expect(screen.getByRole('alert')).toBeInTheDocument();
      // Verify the error message is shown
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('sorts todos by order field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'First task',
              completed: true,
              order: 0,
              createdAt: '2024-01-01T00:00:00Z',
              completedAt: '2024-01-01T01:00:00Z',
            },
            {
              id: '2',
              text: 'Second task',
              completed: false,
              order: 1,
              createdAt: '2024-01-02T00:00:00Z',
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      const todoItems = screen.getAllByTestId(/^todo-item-/);
      expect(todoItems).toHaveLength(2);
      // Items should be sorted by order field
      const firstItem = todoItems[0];
      const secondItem = todoItems[1];
      expect(firstItem).toBeDefined();
      expect(secondItem).toBeDefined();
      if (firstItem && secondItem) {
        expect(within(firstItem).getByText('First task')).toBeInTheDocument();
        expect(within(secondItem).getByText('Second task')).toBeInTheDocument();
      }
    });
  });

  it('shows clear finished button when there are completed todos', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Completed task',
              completed: true,
              order: 0,
              createdAt: '2024-01-01T00:00:00Z',
              completedAt: '2024-01-01T01:00:00Z',
            },
            {
              id: '2',
              text: 'Pending task',
              completed: false,
              order: 1,
              createdAt: '2024-01-02T00:00:00Z',
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('clear-finished-button')).toBeInTheDocument();
    });
  });

  it('hides clear finished button when no completed todos', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Pending task',
              completed: false,
              order: 0,
              createdAt: '2024-01-01T00:00:00Z',
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByText('Pending task')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('clear-finished-button')).not.toBeInTheDocument();
  });

  it('calls API when clear finished button clicked', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Completed task',
              completed: true,
              order: 0,
              createdAt: '2024-01-01T00:00:00Z',
              completedAt: '2024-01-01T01:00:00Z',
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('clear-finished-button')).toBeInTheDocument();
    });

    // Mock clear completed response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cleared: 1 }),
    });

    // Mock refetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockContextResponse()),
    });

    await user.click(screen.getByTestId('clear-finished-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/shells/shell-1/todos/clear-completed'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows drag handle on todo items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      const todoItem = screen.getByTestId('todo-item-1');
      expect(within(todoItem).getByTestId('drag-handle')).toBeInTheDocument();
    });
  });

  it('shows delete option in menu', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          mockContextResponse([
            {
              id: '1',
              text: 'Test task',
              completed: false,
              order: 0,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ]),
        ),
    });

    renderWithProviders(<ShellTodosTab shellId="shell-1" />, queryClient);

    await waitFor(() => {
      expect(screen.getByTestId('todo-item-1')).toBeInTheDocument();
    });

    const todoItem = screen.getByTestId('todo-item-1');
    const menuButton = within(todoItem).getByTestId('todo-menu-button');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByTestId('delete-todo-menu-item')).toBeInTheDocument();
    });
  });
});
