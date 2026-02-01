/**
 * React Query hooks for git worktrees
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api, type DeleteWorktreeResponse, type UpdateWorktreeMetadataResponse } from '@client/services/api';
import { queryKeys } from './queryKeys';
import type { WorktreeWithStatus, CreateWorktreeRequest, WorktreeStatus, Shell, FileTreeNode, CustomUrl } from '@shared/types';

export interface DeleteWorktreeRequest {
  worktreePath: string;
  force?: boolean;
}

/**
 * Hook to fetch worktrees for a project
 * Returns empty array for non-git projects
 */
export function useWorktrees(projectId: string): UseQueryResult<WorktreeWithStatus[]> {
  return useQuery({
    queryKey: queryKeys.worktrees.byProject(projectId),
    queryFn: async () => {
      const result = await api.getWorktrees(projectId);
      return result.worktrees;
    },
    // Only fetch if we have a project ID
    enabled: !!projectId,
    // Worktrees don't change frequently, so cache for a bit longer
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to fetch the main branch name for a project
 */
export function useMainBranch(projectId: string): UseQueryResult<string> {
  return useQuery({
    queryKey: queryKeys.worktrees.mainBranch(projectId),
    queryFn: async () => {
      const result = await api.getMainBranch(projectId);
      return result.branch;
    },
    // Only fetch if we have a project ID
    enabled: !!projectId,
    // Main branch doesn't change, so cache for longer
    staleTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Hook to create a new worktree
 */
export function useCreateWorktree(projectId: string): UseMutationResult<
  WorktreeWithStatus,
  Error,
  CreateWorktreeRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateWorktreeRequest) => {
      const result = await api.createWorktree(projectId, request.name, request.baseBranch);
      return result.worktree;
    },
    onSuccess: () => {
      // Invalidate worktrees list to refresh
      void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.byProject(projectId) });
    },
  });
}

/**
 * Hook to delete a worktree
 */
export function useDeleteWorktree(projectId: string): UseMutationResult<
  DeleteWorktreeResponse,
  Error,
  DeleteWorktreeRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: DeleteWorktreeRequest) => {
      return await api.deleteWorktree(projectId, request.worktreePath, request.force);
    },
    onSuccess: () => {
      // Invalidate worktrees list to refresh
      void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.byProject(projectId) });
    },
  });
}

export interface UpdateWorktreeMetadataRequest {
  worktreePath: string;
  done: boolean;
  projectId?: string;
}

/**
 * Hook to update worktree metadata (done status)
 * Phase 5: For marking worktrees as done/not done
 */
export function useUpdateWorktreeMetadata(projectId: string): UseMutationResult<
  UpdateWorktreeMetadataResponse,
  Error,
  UpdateWorktreeMetadataRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: UpdateWorktreeMetadataRequest) => {
      return await api.updateWorktreeMetadata(request.worktreePath, {
        done: request.done,
        projectId: request.projectId ?? projectId,
      });
    },
    onSuccess: () => {
      // Invalidate worktrees list to refresh status
      void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.byProject(projectId) });
    },
  });
}

/**
 * Calculate worktree status based on done state and shell activity
 * Phase 5: Returns visual status indicator
 * - 'blue': Worktree is marked as done
 * - 'green': AI shell is active (processing) - future phase
 * - 'red': AI shell is idle (waiting for user) - future phase
 * - null: No status / not applicable
 *
 * @param done - Whether the worktree is marked as done
 * @param _hasActiveShell - Reserved for future shell activity integration
 * @param _shellIsIdle - Reserved for future shell activity integration
 */
export function useWorktreeStatus(
  done: boolean,
  _hasActiveShell = false,
  _shellIsIdle = false,
): WorktreeStatus {
  // Phase 5: Basic implementation based on done state
  // Future phases will add shell activity integration
  if (done) {
    return 'blue';
  }

  // Future: Check shell activity
  // if (hasActiveShell && !shellIsIdle) {
  //   return 'green';
  // }
  // if (hasActiveShell && shellIsIdle) {
  //   return 'red';
  // }

  return null;
}

/**
 * Hook to fetch shells for a specific worktree
 * Phase 6: Shell-worktree association
 */
export function useShellsByWorktree(worktreePath: string): UseQueryResult<Shell[]> {
  return useQuery({
    queryKey: queryKeys.shells.byWorktree(worktreePath),
    queryFn: async () => {
      const result = await api.getShellsByWorktree(worktreePath);
      return result.shells;
    },
    // Only fetch if we have a worktree path
    enabled: !!worktreePath,
    // Keep consistent with shells.byProject stale time
    staleTime: 5_000, // 5 seconds
  });
}

// ============================================================================
// Phase 7: Worktree Files and URLs hooks
// ============================================================================

export interface UseWorktreeFilesResult {
  files: FileTreeNode[];
  gitModifiedOnly: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch file tree for a worktree
 * Phase 7: Worktree context sidebar files tab
 */
export function useWorktreeFiles(worktreePath: string, gitModifiedOnly = true): UseWorktreeFilesResult {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.worktrees.files(worktreePath, gitModifiedOnly),
    queryFn: async () => {
      return await api.getWorktreeFiles(worktreePath, gitModifiedOnly);
    },
    enabled: !!worktreePath,
    staleTime: 30_000, // 30 seconds - git status can change frequently
  });

  const handleRefetch = (): void => {
    void refetch();
  };

  return {
    files: data?.files ?? [],
    gitModifiedOnly: data?.gitModifiedOnly ?? gitModifiedOnly,
    isLoading,
    isError,
    error,
    refetch: handleRefetch,
  };
}

export interface UseWorktreeUrlsResult {
  urls: CustomUrl[];
  isLoading: boolean;
  isError: boolean;
  addUrl: (name: string, url: string) => Promise<void>;
  deleteUrl: (urlId: string) => Promise<void>;
  isAdding: boolean;
  isDeleting: boolean;
}

/**
 * Hook to manage worktree URLs
 * Phase 7: Worktree context sidebar URLs tab
 */
export function useWorktreeUrls(worktreePath: string): UseWorktreeUrlsResult {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.worktrees.urls(worktreePath),
    queryFn: async () => {
      return await api.getWorktreeUrls(worktreePath);
    },
    enabled: !!worktreePath,
    staleTime: 30_000, // 30 seconds
  });

  const addMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      return await api.addWorktreeUrl(worktreePath, name, url);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.urls(worktreePath) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (urlId: string) => {
      return await api.deleteWorktreeUrl(worktreePath, urlId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees.urls(worktreePath) });
    },
  });

  const addUrl = async (name: string, url: string): Promise<void> => {
    await addMutation.mutateAsync({ name, url });
  };

  const deleteUrl = async (urlId: string): Promise<void> => {
    await deleteMutation.mutateAsync(urlId);
  };

  return {
    urls: data?.urls ?? [],
    isLoading,
    isError,
    addUrl,
    deleteUrl,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
