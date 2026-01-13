import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@client/services/api';
import { useUIStore } from '@client/stores/uiStore';
import { queryKeys } from './queryKeys';
import type { Shell } from '@shared/types';

/**
 * Hook to fetch shells for a specific project
 */
export function useShells(projectId: string | null): UseQueryResult<Shell[]> {
  return useQuery({
    queryKey: queryKeys.shells.byProject(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return [];
      const result = await api.getShells(projectId);
      return result.shells;
    },
    enabled: !!projectId,
    placeholderData: [],
  });
}

/**
 * Hook to fetch shells for all projects at once
 */
export function useAllShells(projectIds: string[]): UseQueryResult<Shell[]> {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['shells', 'all', projectIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        projectIds.map(async (projectId) => {
          const result = await api.getShells(projectId);
          // Also populate individual project shell caches
          queryClient.setQueryData(queryKeys.shells.byProject(projectId), result.shells);
          return result.shells;
        }),
      );
      return results.flat();
    },
    enabled: projectIds.length > 0,
  });
}

/**
 * Hook to create a new shell
 */
export function useCreateShell(): UseMutationResult<{ shell: Shell }, Error, { projectId: string; name?: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name?: string }) =>
      api.createShell(projectId, name),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
    },
  });
}

interface DeleteShellContext {
  previousShells: Shell[] | undefined;
  projectId: string;
}

/**
 * Hook to delete a shell
 */
export function useDeleteShell(): UseMutationResult<{ shellId: string; projectId: string }, Error, { shellId: string; projectId: string }, DeleteShellContext> {
  const queryClient = useQueryClient();
  const setActiveShell = useUIStore((state) => state.setActiveShell);
  const activeShellId = useUIStore((state) => state.activeShellId);

  return useMutation({
    mutationFn: ({ shellId, projectId }: { shellId: string; projectId: string }) =>
      api.deleteShell(shellId).then(() => ({ shellId, projectId })),
    // Optimistic update
    onMutate: async ({ shellId, projectId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.shells.byProject(projectId) });

      const previousShells = queryClient.getQueryData<Shell[]>(
        queryKeys.shells.byProject(projectId),
      );

      queryClient.setQueryData<Shell[]>(
        queryKeys.shells.byProject(projectId),
        (old) => old?.filter((s) => s.id !== shellId) ?? [],
      );

      // Clear active shell if it's the one being deleted
      if (activeShellId === shellId) {
        setActiveShell(null);
      }

      return { previousShells, projectId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousShells) {
        queryClient.setQueryData(
          queryKeys.shells.byProject(context.projectId),
          context.previousShells,
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(variables.projectId),
      });
    },
  });
}

/**
 * Hook to update a shell (e.g., rename)
 */
export function useUpdateShell(): UseMutationResult<{ shell: Shell }, Error, { shellId: string; updates: { name?: string } }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shellId, updates }: { shellId: string; updates: { name?: string } }) =>
      api.updateShell(shellId, updates),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
    },
  });
}

/**
 * Hook to restart a shell
 */
export function useRestartShell(): UseMutationResult<{ shell: Shell }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shellId: string) => api.restartShell(shellId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
    },
  });
}

interface ActiveShellId {
  activeShellId: string | null;
  setActiveShell: (id: string | null) => void;
}

/**
 * Hook to get active shell ID from UI store
 */
export function useActiveShellId(): ActiveShellId {
  const activeShellId = useUIStore((state) => state.activeShellId);
  const setActiveShell = useUIStore((state) => state.setActiveShell);
  return { activeShellId, setActiveShell };
}

/**
 * Hook to get a specific shell by ID from the cache
 * Searches all project shell caches for the shell
 */
export function useShell(shellId: string | null): Shell | undefined {
  const queryClient = useQueryClient();

  if (!shellId) return undefined;

  // Get all cached shell queries and search for the shell
  const cache = queryClient.getQueryCache();
  const shellQueries = cache.findAll({ queryKey: ['shells'] });

  for (const query of shellQueries) {
    const shells = query.state.data as Shell[] | undefined;
    if (shells) {
      const shell = shells.find((s) => s.id === shellId);
      if (shell) return shell;
    }
  }

  return undefined;
}

/**
 * Hook to start a shell (activate PTY)
 */
export function useStartShell(): UseMutationResult<{ shell: Shell }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shellId: string) => api.startShell(shellId),
    onSuccess: (data) => {
      // Update the shell in the cache
      const projectId = data.shell.projectId;
      queryClient.setQueryData<Shell[]>(
        queryKeys.shells.byProject(projectId),
        (old) => old?.map((s) => (s.id === data.shell.id ? data.shell : s)) ?? [],
      );
    },
  });
}
