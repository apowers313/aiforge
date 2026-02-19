import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';

/**
 * Creates a fresh QueryClient for testing with appropriate settings
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

/**
 * Creates a wrapper component with QueryClient and MantineProvider for testing
 */
export function createTestWrapper(queryClient?: QueryClient): React.FC<WrapperProps> {
  const client = queryClient ?? createTestQueryClient();

  return function TestWrapper({ children }: WrapperProps): React.ReactElement {
    return (
      <QueryClientProvider client={client}>
        <MantineProvider>{children}</MantineProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Renders a component with QueryClient and MantineProvider
 */
export function renderWithProviders(
  ui: React.ReactElement,
  queryClient?: QueryClient,
): RenderResult & { queryClient: QueryClient } {
  const client = queryClient ?? createTestQueryClient();
  const Wrapper = createTestWrapper(client);
  const result = render(ui, { wrapper: Wrapper });

  return Object.assign(result, { queryClient: client });
}
