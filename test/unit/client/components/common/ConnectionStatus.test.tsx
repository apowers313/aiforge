import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ConnectionStatus } from '@client/components/common/ConnectionStatus.js';

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

describe('ConnectionStatus', () => {
  it('renders connected state', () => {
    renderWithProviders(<ConnectionStatus isConnected={true} />);
    const badge = screen.getByTestId('connection-status');
    expect(badge).toHaveAttribute('data-status', 'connected');
    expect(badge).toHaveTextContent('Connected');
  });

  it('renders disconnected state', () => {
    renderWithProviders(<ConnectionStatus isConnected={false} />);
    const badge = screen.getByTestId('connection-status');
    expect(badge).toHaveAttribute('data-status', 'disconnected');
    expect(badge).toHaveTextContent('Disconnected');
  });

  it('hides label when showLabel is false', () => {
    renderWithProviders(<ConnectionStatus isConnected={true} showLabel={false} />);
    const badge = screen.getByTestId('connection-status');
    expect(badge).not.toHaveTextContent('Connected');
    expect(badge).not.toHaveTextContent('Disconnected');
  });

  it('shows label by default', () => {
    renderWithProviders(<ConnectionStatus isConnected={true} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});
