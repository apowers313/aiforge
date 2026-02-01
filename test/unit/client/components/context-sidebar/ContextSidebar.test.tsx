import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextSidebar } from '@client/components/context-sidebar/ContextSidebar';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

// Mock fetch globally
const mockFetch = vi.fn();

describe('ContextSidebar', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    useUIStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();
  });

  it('renders sidebar when open with project type', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByTestId('context-sidebar')).toBeInTheDocument();
  });

  it('renders sidebar when open with shell type', () => {
    useUIStore.getState().openContextSidebar('shell', 'shell-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByTestId('context-sidebar')).toBeInTheDocument();
  });

  it('shows pin button in unpinned state', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByTestId('pin-button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows pin button in pinned state', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    useUIStore.getState().toggleContextSidebarPin();
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByTestId('pin-button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes when close button clicked', async () => {
    const user = userEvent.setup();
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);

    await user.click(screen.getByTestId('close-button'));

    expect(useUIStore.getState().contextSidebarOpen).toBe(false);
  });

  it('toggles pin when pin button clicked', async () => {
    const user = userEvent.setup();
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);

    expect(useUIStore.getState().contextSidebarPinned).toBe(false);
    await user.click(screen.getByTestId('pin-button'));
    expect(useUIStore.getState().contextSidebarPinned).toBe(true);
  });

  it('shows project title for project type', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByText('Project Context')).toBeInTheDocument();
  });

  it('shows shell title for shell type', () => {
    useUIStore.getState().openContextSidebar('shell', 'shell-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByText('Shell Context')).toBeInTheDocument();
  });

  it('shows URLs/Files tabs for project type', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByText('URLs')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('shows no tabs for shell type (TODOs/Notes moved to project)', () => {
    useUIStore.getState().openContextSidebar('shell', 'shell-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    // Shells no longer have context tabs - TODOs and Notes are now at project level
    expect(screen.queryByText('TODOs')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('URLs')).not.toBeInTheDocument();
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
  });

  it('applies correct width style', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    useUIStore.getState().setContextSidebarWidth(400);
    renderWithProviders(<ContextSidebar />, queryClient);

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveStyle({ width: '400px' });
  });

  it('applies overlay positioning when unpinned', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    renderWithProviders(<ContextSidebar />, queryClient);

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveStyle({ position: 'fixed' });
  });

  it('applies flex positioning when pinned', () => {
    useUIStore.getState().openContextSidebar('project', 'proj-1');
    useUIStore.getState().toggleContextSidebarPin();
    renderWithProviders(<ContextSidebar />, queryClient);

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveStyle({ position: 'relative' });
  });

  describe('click-outside behavior with portaled elements', () => {
    beforeEach(() => {
      global.fetch = mockFetch;
      mockFetch.mockReset();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not close sidebar when clicking on a menu dropdown (regression test)', async () => {
      const user = userEvent.setup();

      // Mock the project context API to return a todo
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            todos: [
              {
                id: 'todo-1',
                text: 'Test task',
                completed: false,
                order: 0,
                createdAt: new Date().toISOString(),
                completedAt: null,
              },
            ],
            notes: '',
          }),
      });

      // Open sidebar in unpinned mode (overlay) with project type
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      // Switch to TODOs tab
      useUIStore.getState().setContextSidebarTab('todos');
      expect(useUIStore.getState().contextSidebarPinned).toBe(false);

      renderWithProviders(<ContextSidebar />, queryClient);

      // Wait for the todo to load
      await waitFor(() => {
        expect(screen.getByTestId('todo-item-todo-1')).toBeInTheDocument();
      });

      // Click on the menu button
      const todoItem = screen.getByTestId('todo-item-todo-1');
      const menuButton = within(todoItem).getByTestId('todo-menu-button');
      await user.click(menuButton);

      // Wait for menu to open
      await waitFor(() => {
        expect(screen.getByTestId('delete-todo-menu-item')).toBeInTheDocument();
      });

      // Sidebar should still be open
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(screen.getByTestId('context-sidebar')).toBeInTheDocument();

      // Mock delete response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      // Mock refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      // Click the delete menu item
      await user.click(screen.getByTestId('delete-todo-menu-item'));

      // Sidebar should still be open after clicking menu item
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);

      // Delete should have been called on project context endpoint
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/projects/proj-1/todos/todo-1',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('still closes sidebar when clicking truly outside', async () => {
      const user = userEvent.setup();

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ todos: [], notes: '' }),
      });

      useUIStore.getState().openContextSidebar('project', 'proj-1');
      renderWithProviders(
        <div>
          <div data-testid="outside-element">Outside</div>
          <ContextSidebar />
        </div>,
        queryClient,
      );

      await waitFor(() => {
        expect(screen.getByTestId('context-sidebar')).toBeInTheDocument();
      });

      // Click outside the sidebar
      await user.click(screen.getByTestId('outside-element'));

      // Sidebar should close
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });
  });
});
