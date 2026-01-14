import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ErrorBoundary } from '@client/components/common/ErrorBoundary';

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

// Component that throws an error for testing
function ThrowError({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div data-testid="child-component">Child Content</div>;
}

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error output during tests
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    renderWithProviders(
      <ErrorBoundary>
        <div data-testid="child">Child Content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-fallback">Custom Error UI</div>;
    renderWithProviders(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    renderWithProviders(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) as string }),
    );
  });

  it('resets error state when Try Again button is clicked', () => {
    // Use a component whose throw behavior can be controlled
    let shouldThrow = true;
    function ConditionalThrow(): React.ReactElement {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div data-testid="recovered">Recovered!</div>;
    }

    const { rerender } = renderWithProviders(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>,
    );

    // Error UI should be shown
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();

    // Stop throwing before clicking reset
    shouldThrow = false;

    // Click the Try Again button
    fireEvent.click(screen.getByTestId('error-reset-button'));

    // Need to rerender to see the result of state change
    rerender(
      <MantineProvider>
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      </MantineProvider>,
    );

    // Should show recovered content
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });

  it('renders Try Again button', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-reset-button')).toBeInTheDocument();
    expect(screen.getByTestId('error-reset-button')).toHaveTextContent('Try Again');
  });

  it('renders Reload Page button', () => {
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-reload-button')).toBeInTheDocument();
    expect(screen.getByTestId('error-reload-button')).toHaveTextContent('Reload Page');
  });

  it('reload button is clickable without throwing', () => {
    // Note: window.location.reload is not mockable in jsdom, so we just verify
    // the button can be clicked without errors (jsdom's reload is a no-op)
    renderWithProviders(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    const reloadButton = screen.getByTestId('error-reload-button');
    expect(reloadButton).toBeInTheDocument();

    // This should not throw - jsdom's reload is a no-op
    expect(() => fireEvent.click(reloadButton)).not.toThrow();
  });
});
