import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@client/services/api';
import { useUIStore } from '@client/stores/uiStore';
import { queryKeys } from './queryKeys';
import type { Project } from '@shared/types';

/**
 * Hook to fetch all projects
 */
export function useProjects(): UseQueryResult<Project[]> {
  return useQuery({
    queryKey: queryKeys.projects.all,
    queryFn: async () => {
      const result = await api.getProjects();
      return result.projects;
    },
  });
}

/**
 * Hook to create a new project
 */
export function useCreateProject(): UseMutationResult<{ project: Project }, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => api.createProject(path),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

/**
 * Hook to delete a project
 */
export function useDeleteProject(): UseMutationResult<void, Error, string, { previousProjects: Project[] | undefined }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    // Optimistic update
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      const previousProjects = queryClient.getQueryData<Project[]>(queryKeys.projects.all);

      queryClient.setQueryData<Project[]>(
        queryKeys.projects.all,
        (old) => old?.filter((p) => p.id !== id) ?? [],
      );

      return { previousProjects };
    },
    onError: (_err, _id, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects.all, context.previousProjects);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

/**
 * Hook to update a project
 */
export function useUpdateProject(): UseMutationResult<{ project: Project }, Error, { id: string; updates: { name?: string } }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { name?: string } }) =>
      api.updateProject(id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

interface SelectedProjectId {
  selectedProjectId: string | null;
  setSelectedProject: (id: string | null) => void;
}

/**
 * Hook to get selected project ID from UI store
 */
export function useSelectedProjectId(): SelectedProjectId {
  const selectedProjectId = useUIStore((state) => state.selectedProjectId);
  const setSelectedProject = useUIStore((state) => state.setSelectedProject);
  return { selectedProjectId, setSelectedProject };
}
