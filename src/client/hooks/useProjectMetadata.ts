/**
 * React Query hook for fetching project metadata
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@client/services/api';
import type { ProjectMetadata } from '@shared/types';

async function fetchProjectMetadata(projectId: string): Promise<ProjectMetadata> {
  return apiClient.get<ProjectMetadata>(`/projects/${projectId}/metadata`);
}

export interface UseProjectMetadataResult {
  metadata: ProjectMetadata | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useProjectMetadata(projectId: string): UseProjectMetadataResult {
  const {
    data: metadata,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['projectMetadata', projectId],
    queryFn: () => fetchProjectMetadata(projectId),
    staleTime: 5 * 60 * 1000, // 5 minutes - metadata doesn't change often
    enabled: !!projectId,
  });

  return {
    metadata,
    isLoading,
    isError,
    error,
  };
}
