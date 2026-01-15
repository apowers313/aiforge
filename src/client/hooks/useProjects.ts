import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@client/services/api';
import { useUIStore } from '@client/stores/uiStore';
import { queryKeys } from './queryKeys';
import type { Project } from '@shared/types';
import { log } from '@client/services/logger';

const projectLog = log.project;

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
    mutationFn: (path: string) => {
      projectLog.info({ path }, 'Creating project');
      return api.createProject(path);
    },
    onSuccess: (data) => {
      projectLog.info({ projectId: data.project.id, projectName: data.project.name }, 'Project created');
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error, path) => {
      projectLog.error({ path, error: error.message }, 'Project creation failed');
    },
  });
}

/**
 * Hook to delete a project
 */
export function useDeleteProject(): UseMutationResult<void, Error, string, { previousProjects: Project[] | undefined }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => {
      projectLog.info({ projectId: id }, 'Deleting project');
      return api.deleteProject(id);
    },
    // Optimistic update
    onMutate: async (id: string) => {
      projectLog.debug({ projectId: id }, 'Optimistically removing project from UI');
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });

      const previousProjects = queryClient.getQueryData<Project[]>(queryKeys.projects.all);

      queryClient.setQueryData<Project[]>(
        queryKeys.projects.all,
        (old) => old?.filter((p) => p.id !== id) ?? [],
      );

      return { previousProjects };
    },
    onError: (err, id, context) => {
      projectLog.error({ projectId: id, error: err.message }, 'Project deletion failed, rolling back');
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects.all, context.previousProjects);
      }
    },
    onSettled: (_data, _error, id) => {
      projectLog.debug({ projectId: id }, 'Project deletion settled, invalidating queries');
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
    mutationFn: ({ id, updates }: { id: string; updates: { name?: string } }) => {
      projectLog.info({ projectId: id, updates }, 'Updating project');
      return api.updateProject(id, updates);
    },
    onSuccess: (data) => {
      projectLog.info({ projectId: data.project.id, projectName: data.project.name }, 'Project updated');
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error, { id }) => {
      projectLog.error({ projectId: id, error: error.message }, 'Project update failed');
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
