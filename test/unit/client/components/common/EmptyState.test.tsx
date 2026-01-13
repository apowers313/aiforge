import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { EmptyState } from '@client/components/common/EmptyState';

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

describe('EmptyState', () => {
  it('renders title', () => {
    renderWithProviders(<EmptyState title="No items" description="description" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders description', () => {
    renderWithProviders(
      <EmptyState title="No items" description="Add some items to get started" />,
    );
    expect(screen.getByText('Add some items to get started')).toBeInTheDocument();
  });

  it('renders default icon', () => {
    renderWithProviders(<EmptyState title="No items" description="description" />);
    // The default icon is IconTerminal2
    const svg = document.querySelector('.tabler-icon-terminal-2');
    expect(svg).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    const CustomIcon = (): React.ReactElement => <span data-testid="custom-icon">Icon</span>;
    renderWithProviders(<EmptyState title="No items" description="description" icon={<CustomIcon />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('hides default icon when custom icon provided', () => {
    const CustomIcon = (): React.ReactElement => <span data-testid="custom-icon">Icon</span>;
    renderWithProviders(<EmptyState title="No items" description="description" icon={<CustomIcon />} />);
    const defaultIcon = document.querySelector('.tabler-icon-terminal-2');
    expect(defaultIcon).not.toBeInTheDocument();
  });
});
