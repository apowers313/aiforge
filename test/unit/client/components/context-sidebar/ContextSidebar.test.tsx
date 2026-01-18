import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextSidebar } from '@client/components/context-sidebar/ContextSidebar';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient';
import type { QueryClient } from '@tanstack/react-query';

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

  it('shows TODOs/Notes tabs for shell type', () => {
    useUIStore.getState().openContextSidebar('shell', 'shell-1');
    renderWithProviders(<ContextSidebar />, queryClient);
    expect(screen.getByText('TODOs')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
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
});
