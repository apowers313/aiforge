import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';

// Type for HMR data storage
interface HmrData {
  queryClient?: QueryClient;
}

// Preserve QueryClient across HMR to prevent cache loss during development
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
      },
    },
  });
}

// Use Vite's HMR data storage to preserve the QueryClient across hot reloads
let queryClient: QueryClient;

if (import.meta.hot?.data) {
  // In development with HMR enabled
  const hmrData = import.meta.hot.data as HmrData;
  hmrData.queryClient ??= createQueryClient();
  queryClient = hmrData.queryClient;
  import.meta.hot.accept();
} else {
  // In production, tests, or without HMR
  queryClient = createQueryClient();
}

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

// Export for testing
export { queryClient };
