/**
 * ErrorBoundary - Graceful error handling for React components
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Alert, Button, Stack, Text, Box, Code } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { log } from '@client/services/logger';

const uiLog = log.ui;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    uiLog.error({ error: error.message, componentStack: errorInfo.componentStack }, 'ErrorBoundary caught error');
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    uiLog.info('ErrorBoundary reset requested');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    uiLog.info('Page reload requested from ErrorBoundary');
    window.location.reload();
  };

  override render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <Box
          data-testid="error-boundary"
          style={{
            padding: 'var(--mantine-spacing-xl)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
          }}
        >
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Something went wrong"
            color="red"
            variant="filled"
            style={{ maxWidth: 600 }}
          >
            <Stack gap="md">
              <Text size="sm">
                An unexpected error occurred. You can try refreshing the page or resetting this component.
              </Text>

              {error && (
                <Code block style={{ whiteSpace: 'pre-wrap' }}>
                  {error.message}
                </Code>
              )}

              {process.env.NODE_ENV === 'development' && errorInfo && (
                <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                  {errorInfo.componentStack}
                </Code>
              )}

              <Stack gap="xs">
                <Button
                  leftSection={<IconRefresh size={14} />}
                  variant="white"
                  color="red"
                  onClick={this.handleReset}
                  data-testid="error-reset-button"
                >
                  Try Again
                </Button>
                <Button
                  variant="subtle"
                  color="white"
                  onClick={this.handleReload}
                  data-testid="error-reload-button"
                >
                  Reload Page
                </Button>
              </Stack>
            </Stack>
          </Alert>
        </Box>
      );
    }

    return children;
  }
}
