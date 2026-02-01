import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@client/services/api';
import { useUIStore } from '@client/stores/uiStore';
import { queryKeys } from './queryKeys';
import type { Shell, ShellType } from '@shared/types';
import { log } from '@client/services/logger';

const shellLog = log.shell;

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
 * Phase 6: Now supports optional worktreePath for shell-worktree association
 */
export function useCreateShell(): UseMutationResult<{ shell: Shell }, Error, { projectId: string; name?: string; type?: ShellType; worktreePath?: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, name, type, worktreePath }: { projectId: string; name?: string; type?: ShellType; worktreePath?: string }) => {
      shellLog.info({ projectId, name, type, worktreePath }, 'Creating shell');
      return api.createShell(projectId, name, type, worktreePath);
    },
    onSuccess: (data) => {
      shellLog.info({ shellId: data.shell.id, shellName: data.shell.name, type: data.shell.type, worktreePath: data.shell.worktreePath }, 'Shell created');
      // Invalidate project shells
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
      // Phase 6: Also invalidate worktree shells if this shell is associated with a worktree
      if (data.shell.worktreePath) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.shells.byWorktree(data.shell.worktreePath),
        });
      }
    },
    onError: (error, { projectId, name, type, worktreePath }) => {
      shellLog.error({ projectId, name, type, worktreePath, error: error.message }, 'Shell creation failed');
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
    mutationFn: ({ shellId, projectId }: { shellId: string; projectId: string }) => {
      shellLog.info({ shellId, projectId }, 'Deleting shell');
      return api.deleteShell(shellId).then(() => ({ shellId, projectId }));
    },
    // Optimistic update
    onMutate: async ({ shellId, projectId }) => {
      shellLog.debug({ shellId, projectId }, 'Optimistically removing shell from UI');
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
        shellLog.debug({ shellId }, 'Clearing active shell (deleted)');
        setActiveShell(null);
      }

      return { previousShells, projectId };
    },
    onError: (err, { shellId }, context) => {
      shellLog.error({ shellId, error: err.message }, 'Shell deletion failed, rolling back');
      if (context?.previousShells) {
        queryClient.setQueryData(
          queryKeys.shells.byProject(context.projectId),
          context.previousShells,
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      shellLog.debug({ shellId: variables.shellId }, 'Shell deletion settled');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(variables.projectId),
      });
    },
  });
}

/**
 * Hook to update a shell (e.g., rename, mark as done)
 */
export function useUpdateShell(): UseMutationResult<{ shell: Shell }, Error, { shellId: string; updates: { name?: string; done?: boolean } }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shellId, updates }: { shellId: string; updates: { name?: string; done?: boolean } }) => {
      shellLog.info({ shellId, updates }, 'Updating shell');
      return api.updateShell(shellId, updates);
    },
    onSuccess: (data) => {
      shellLog.info({ shellId: data.shell.id, shellName: data.shell.name }, 'Shell updated');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
    },
    onError: (error, { shellId }) => {
      shellLog.error({ shellId, error: error.message }, 'Shell update failed');
    },
  });
}

/**
 * Hook to restart a shell
 */
export function useRestartShell(): UseMutationResult<{ shell: Shell }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shellId: string) => {
      shellLog.info({ shellId }, 'Restarting shell');
      return api.restartShell(shellId);
    },
    onSuccess: (data) => {
      shellLog.info({ shellId: data.shell.id, shellName: data.shell.name, newPid: data.shell.pid }, 'Shell restarted');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.shells.byProject(data.shell.projectId),
      });
    },
    onError: (error, shellId) => {
      shellLog.error({ shellId, error: error.message }, 'Shell restart failed');
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
    mutationFn: (shellId: string) => {
      shellLog.info({ shellId }, 'Starting shell PTY');
      return api.startShell(shellId);
    },
    onSuccess: (data) => {
      shellLog.info({ shellId: data.shell.id, shellName: data.shell.name, pid: data.shell.pid }, 'Shell PTY started');
      // Update the shell in the cache
      const projectId = data.shell.projectId;
      queryClient.setQueryData<Shell[]>(
        queryKeys.shells.byProject(projectId),
        (old) => old?.map((s) => (s.id === data.shell.id ? data.shell : s)) ?? [],
      );
    },
    onError: (error, shellId) => {
      shellLog.error({ shellId, error: error.message }, 'Shell start failed');
    },
  });
}
