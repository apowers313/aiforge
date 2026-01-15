import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@client/services/api';
import { queryKeys } from './queryKeys';
import { log } from '@client/services/logger';

const authLog = log.auth;

interface AuthStatus {
  authenticated: boolean;
}

/**
 * Hook to check authentication status
 */
export function useAuthStatus(): UseQueryResult<AuthStatus> {
  return useQuery({
    queryKey: queryKeys.auth.status,
    queryFn: async () => {
      const result = await api.checkAuthStatus();
      return { authenticated: result.authenticated };
    },
    staleTime: 1000 * 60, // 1 minute
    retry: false,
  });
}

/**
 * Hook to login
 */
export function useLogin(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guid: string) => {
      authLog.info('Login attempt started');
      await api.login(guid);
    },
    onSuccess: () => {
      authLog.info('Login successful');
      // Update auth status in cache
      queryClient.setQueryData(queryKeys.auth.status, { authenticated: true });
    },
    onError: (error) => {
      authLog.error({ error: error.message }, 'Login failed');
    },
  });
}

/**
 * Hook to logout
 */
export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      authLog.info('Logout initiated');
      try {
        await api.logout();
      } catch {
        // Ignore errors on logout - still clear local state
      }
    },
    onSuccess: () => {
      authLog.info('Logout completed, clearing client state');
      // Update auth status in cache
      queryClient.setQueryData(queryKeys.auth.status, { authenticated: false });
      // Clear all queries on logout
      queryClient.clear();
    },
  });
}
