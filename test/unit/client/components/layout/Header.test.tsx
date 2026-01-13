import { describe, it, expect, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@client/components/layout/Header';
import { useUIStore } from '@client/stores/uiStore';
import { renderWithProviders } from '@test/utils/testQueryClient';

describe('Header', () => {
  beforeEach(() => {
    act(() => {
      useUIStore.getState().reset();
    });
  });

  it('renders app title', () => {
    renderWithProviders(<Header />);
    expect(screen.getByText('AIForge')).toBeInTheDocument();
  });

  it('renders toggle sidebar button', () => {
    renderWithProviders(<Header />);
    expect(screen.getByTestId('toggle-sidebar-button')).toBeInTheDocument();
  });

  it('toggles sidebar on button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Header />);

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    await user.click(screen.getByTestId('toggle-sidebar-button'));

    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('has accessible aria-label', () => {
    renderWithProviders(<Header />);
    expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
  });
});
