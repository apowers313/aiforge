/**
 * React Query hook for fetching project file tree and file previews
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@client/services/api';
import type { FileTreeNode, FilePreview } from '@shared/types';

interface FilesResponse {
  files: FileTreeNode[];
  gitModifiedOnly: boolean;
}

async function fetchProjectFiles(projectId: string, gitModifiedOnly: boolean): Promise<FilesResponse> {
  const params = new URLSearchParams();
  if (!gitModifiedOnly) {
    params.set('gitModifiedOnly', 'false');
  }
  const query = params.toString();
  const url = `/projects/${projectId}/files${query ? `?${query}` : ''}`;
  return apiClient.get<FilesResponse>(url);
}

async function fetchFilePreview(projectId: string, filePath: string): Promise<FilePreview> {
  const encodedPath = encodeURIComponent(filePath);
  return apiClient.get<FilePreview>(`/projects/${projectId}/files/${encodedPath}/preview`);
}

export interface UseProjectFilesResult {
  files: FileTreeNode[];
  gitModifiedOnly: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useProjectFiles(projectId: string, gitModifiedOnly = true): UseProjectFilesResult {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projectFiles', projectId, gitModifiedOnly],
    queryFn: () => fetchProjectFiles(projectId, gitModifiedOnly),
    staleTime: 30 * 1000, // 30 seconds - git status can change frequently
    enabled: !!projectId,
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

export interface UseFilePreviewResult {
  preview: FilePreview | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useFilePreview(projectId: string, filePath: string | null): UseFilePreviewResult {
  const {
    data: preview,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['filePreview', projectId, filePath],
    queryFn: () => {
      // filePath is guaranteed to be non-null here because enabled: !!filePath
      if (!filePath) {
        throw new Error('File path is required');
      }
      return fetchFilePreview(projectId, filePath);
    },
    staleTime: 60 * 1000, // 1 minute - file content doesn't change that often
    enabled: !!projectId && !!filePath,
  });

  return {
    preview,
    isLoading,
    isError,
    error,
  };
}
