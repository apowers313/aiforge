import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LoadingOverlay } from '@client/components/common/LoadingOverlay';

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

describe('LoadingOverlay', () => {
  it('renders nothing when not visible', () => {
    renderWithProviders(<LoadingOverlay visible={false} />);
    expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
  });

  it('renders overlay when visible', () => {
    renderWithProviders(<LoadingOverlay visible={true} />);
    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
  });

  it('renders spinner when visible', () => {
    renderWithProviders(<LoadingOverlay visible={true} />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders message when provided', () => {
    renderWithProviders(<LoadingOverlay visible={true} message="Loading data..." />);
    expect(screen.getByTestId('loading-message')).toHaveTextContent('Loading data...');
  });

  it('does not render message when not provided', () => {
    renderWithProviders(<LoadingOverlay visible={true} />);
    expect(screen.queryByTestId('loading-message')).not.toBeInTheDocument();
  });

  it('applies absolute positioning by default', () => {
    renderWithProviders(<LoadingOverlay visible={true} />);
    const overlay = screen.getByTestId('loading-overlay');
    expect(overlay).toHaveStyle({ position: 'absolute' });
  });

  it('applies fixed positioning when fullScreen is true', () => {
    renderWithProviders(<LoadingOverlay visible={true} fullScreen={true} />);
    const overlay = screen.getByTestId('loading-overlay');
    expect(overlay).toHaveStyle({ position: 'fixed' });
  });
});
